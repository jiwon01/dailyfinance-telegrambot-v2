/**
 * 네이버 금융 API에서 시세 정보를 가져오는 모듈
 */

// API URL 상수
const API_URLS = {
  KOSPI: 'https://polling.finance.naver.com/api/realtime/domestic/index/KOSPI',
  KOSDAQ: 'https://polling.finance.naver.com/api/realtime/domestic/index/KOSDAQ',
  NASDAQ: 'https://polling.finance.naver.com/api/realtime/worldstock/index/.IXIC',
  EXCHANGE: 'https://m.stock.naver.com/front-api/marketIndex/exchange/new',
} as const;

const YAHOO_API_URLS = {
  QUOTE: 'https://query1.finance.yahoo.com/v7/finance/quote',
  SEARCH: 'https://query2.finance.yahoo.com/v1/finance/search',
} as const;

const YAHOO_SUPPORTED_TYPES = new Set(['EQUITY', 'INDEX', 'CRYPTOCURRENCY']);

// 시세 타입 정의
export type MarketType =
  | 'kospi'
  | 'kosdaq'
  | 'nasdaq'
  | 'usd'
  | 'jpy'
  | 'eur'
  | 'gbp'
  | 'chf'
  | 'cny';

// 변동 방향
export type ChangeDirection = 'up' | 'down' | 'unchanged';

// 변동 정보
export interface ChangeInfo {
  direction: ChangeDirection;
  value: string;      // 변동폭 (예: "12.34")
  percent: string;    // 변동률 (예: "0.52%")
}

export interface MarketData {
  type: MarketType;
  name: string;
  value: string;
  change?: ChangeInfo;
}

// 일일 시장 요약 데이터
export interface MarketSummaryItem {
  value: string | null;
  change?: ChangeInfo;
}

export interface DailyMarketSummary {
  kospi: MarketSummaryItem;
  kosdaq: MarketSummaryItem;
  usd: MarketSummaryItem;
  eur: MarketSummaryItem;
  jpy: MarketSummaryItem;
  gbp: MarketSummaryItem;
  chf: MarketSummaryItem;
  cny: MarketSummaryItem;
}

export interface YahooMarketData {
  symbol: string;
  name: string;
  value: string;
  change?: ChangeInfo;
  sourceUrl: string;
  assetType: 'stock' | 'index' | 'crypto' | 'other';
}

export type YahooLookupResult =
  | { status: 'ok'; data: YahooMarketData }
  | { status: 'not_found'; query: string }
  | { status: 'error'; query: string; reason: string };

// API 응답 타입 정의
interface DomesticIndexResponse {
  datas: Array<{
    closePrice: string;
    compareToPreviousClosePrice: string;
    compareToPreviousPrice: {
      code: string;  // "2" = 상승, "5" = 하락, "3" = 보합
      text: string;
      name: string;
    };
    fluctuationsRatio: string;
  }>;
}

// 환율 데이터
interface ExchangeItem {
  exchangeCode: string;
  closePrice: string;
  fluctuations: string;
  fluctuationsType: {
    code: string;  // "2" = 상승, "5" = 하락, "3" = 보합
    text: string;
    name: string;
  };
  fluctuationsRatio: string;
}

interface ExchangeResponse {
  isSuccess: boolean;
  result: ExchangeItem[];
}

interface YahooQuoteItem {
  symbol: string;
  quoteType?: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
}

interface YahooQuoteResponse {
  quoteResponse?: {
    result?: YahooQuoteItem[];
  };
}

interface YahooSearchItem {
  symbol: string;
  quoteType?: string;
}

interface YahooSearchResponse {
  quotes?: YahooSearchItem[];
}

/**
 * API 호출 유틸리티
 */
async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function formatYahooPrice(value: number): string {
  const abs = Math.abs(value);
  const maxFractionDigits = abs >= 1000 ? 2 : abs >= 1 ? 4 : 8;
  return value.toLocaleString('en-US', { maximumFractionDigits: maxFractionDigits });
}

function toYahooAssetType(quoteType?: string): YahooMarketData['assetType'] {
  if (quoteType === 'EQUITY') return 'stock';
  if (quoteType === 'INDEX') return 'index';
  if (quoteType === 'CRYPTOCURRENCY') return 'crypto';
  return 'other';
}

function toYahooChangeInfo(change?: number, changePercent?: number): ChangeInfo | undefined {
  if (!Number.isFinite(change) || !Number.isFinite(changePercent)) {
    return undefined;
  }

  const direction: ChangeDirection = change! > 0 ? 'up' : change! < 0 ? 'down' : 'unchanged';

  return {
    direction,
    value: formatYahooPrice(Math.abs(change!)),
    percent: `${Math.abs(changePercent!).toFixed(2)}%`,
  };
}

function toYahooMarketData(item: YahooQuoteItem): YahooMarketData | null {
  if (!YAHOO_SUPPORTED_TYPES.has(item.quoteType || '')) {
    return null;
  }

  if (!Number.isFinite(item.regularMarketPrice)) {
    return null;
  }

  const symbol = item.symbol;
  const baseName = item.longName || item.shortName || symbol;
  const name = baseName === symbol ? symbol : `${baseName} (${symbol})`;

  return {
    symbol,
    name,
    value: formatYahooPrice(item.regularMarketPrice!),
    change: toYahooChangeInfo(item.regularMarketChange, item.regularMarketChangePercent),
    sourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`,
    assetType: toYahooAssetType(item.quoteType),
  };
}

async function fetchYahooQuoteBySymbol(symbol: string): Promise<YahooLookupResult> {
  const normalizedSymbol = symbol.trim();

  if (!normalizedSymbol) {
    return { status: 'not_found', query: symbol };
  }

  const url = `${YAHOO_API_URLS.QUOTE}?symbols=${encodeURIComponent(normalizedSymbol)}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });

    if (response.status === 404) {
      return { status: 'not_found', query: normalizedSymbol };
    }

    if (!response.ok) {
      return {
        status: 'error',
        query: normalizedSymbol,
        reason: `Yahoo quote API failed: ${response.status}`,
      };
    }

    const payload = await response.json() as YahooQuoteResponse;
    const results = payload.quoteResponse?.result || [];
    const exactMatch = results.find(item => item.symbol?.toUpperCase() === normalizedSymbol.toUpperCase());
    const candidate = exactMatch || results[0];

    if (!candidate) {
      return { status: 'not_found', query: normalizedSymbol };
    }

    const parsed = toYahooMarketData(candidate);

    if (!parsed) {
      return { status: 'not_found', query: normalizedSymbol };
    }

    return { status: 'ok', data: parsed };
  } catch (error) {
    return {
      status: 'error',
      query: normalizedSymbol,
      reason: `Yahoo quote API error: ${String(error)}`,
    };
  }
}

async function searchYahooSymbol(query: string): Promise<string | null> {
  const url =
    `${YAHOO_API_URLS.SEARCH}?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0&enableFuzzyQuery=true`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Yahoo search API failed: ${response.status}`);
  }

  const payload = await response.json() as YahooSearchResponse;
  const quotes = payload.quotes || [];
  const supported = quotes.filter(item => YAHOO_SUPPORTED_TYPES.has(item.quoteType || ''));

  if (supported.length === 0) {
    return null;
  }

  const exactMatch = supported.find(item => item.symbol.toUpperCase() === query.toUpperCase());
  return (exactMatch || supported[0]).symbol;
}

export async function getYahooMarketData(query: string): Promise<YahooLookupResult> {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return { status: 'not_found', query };
  }

  const directLookup = await fetchYahooQuoteBySymbol(trimmedQuery.toUpperCase());
  if (directLookup.status === 'ok') {
    return directLookup;
  }

  if (directLookup.status === 'error') {
    return directLookup;
  }

  try {
    const symbol = await searchYahooSymbol(trimmedQuery);
    if (!symbol) {
      return { status: 'not_found', query: trimmedQuery };
    }

    return fetchYahooQuoteBySymbol(symbol);
  } catch (error) {
    return {
      status: 'error',
      query: trimmedQuery,
      reason: `Yahoo search API error: ${String(error)}`,
    };
  }
}

/**
 * 변동 코드를 방향으로 변환
 */
function codeToDirection(code: string): ChangeDirection {
  switch (code) {
    case '2': return 'up';      // 상승
    case '5': return 'down';    // 하락
    case '3': return 'unchanged'; // 보합
    default: return 'unchanged';
  }
}

/**
 * 코스피 지수 가져오기
 */
export async function getKospi(): Promise<MarketSummaryItem> {
  try {
    const data = await fetchJson<DomesticIndexResponse>(API_URLS.KOSPI);
    const item = data.datas?.[0];

    if (!item) {
      return { value: null };
    }

    return {
      value: item.closePrice,
      change: {
        direction: codeToDirection(item.compareToPreviousPrice?.code),
        value: item.compareToPreviousClosePrice || '',
        percent: item.fluctuationsRatio ? `${item.fluctuationsRatio}%` : '',
      },
    };
  } catch (error) {
    console.error('Error fetching KOSPI:', error);
    return { value: null };
  }
}

/**
 * 코스닥 지수 가져오기
 */
export async function getKosdaq(): Promise<MarketSummaryItem> {
  try {
    const data = await fetchJson<DomesticIndexResponse>(API_URLS.KOSDAQ);
    const item = data.datas?.[0];

    if (!item) {
      return { value: null };
    }

    return {
      value: item.closePrice,
      change: {
        direction: codeToDirection(item.compareToPreviousPrice?.code),
        value: item.compareToPreviousClosePrice || '',
        percent: item.fluctuationsRatio ? `${item.fluctuationsRatio}%` : '',
      },
    };
  } catch (error) {
    console.error('Error fetching KOSDAQ:', error);
    return { value: null };
  }
}

/**
 * 나스닥 지수 가져오기
 */
export async function getNasdaq(): Promise<MarketSummaryItem> {
  try {
    // 나스닥 API도 코스피/코스닥과 동일한 응답 구조 사용 (datas 배열)
    const data = await fetchJson<DomesticIndexResponse>(API_URLS.NASDAQ);
    const item = data.datas?.[0];

    if (!item) {
      return { value: null };
    }

    return {
      value: item.closePrice,
      change: {
        direction: codeToDirection(item.compareToPreviousPrice?.code),
        value: item.compareToPreviousClosePrice || '',
        percent: item.fluctuationsRatio ? `${item.fluctuationsRatio}%` : '',
      },
    };
  } catch (error) {
    console.error('Error fetching NASDAQ:', error);
    return { value: null };
  }
}

/**
 * 환율 정보 가져오기 (캐싱)
 */
let exchangeCache: {
  data: ExchangeResponse | null;
  timestamp: number;
} = { data: null, timestamp: 0 };

async function getExchangeData(): Promise<ExchangeResponse | null> {
  const now = Date.now();
  // 1분간 캐싱
  if (exchangeCache.data && now - exchangeCache.timestamp < 60000) {
    return exchangeCache.data;
  }

  try {
    const data = await fetchJson<ExchangeResponse>(API_URLS.EXCHANGE);
    exchangeCache = { data, timestamp: now };
    return data;
  } catch (error) {
    console.error('Error fetching exchange data:', error);
    return null;
  }
}

/**
 * 환율 정보 추출
 */
async function getExchange(code: 'USD' | 'EUR' | 'JPY' | 'GBP' | 'CHF' | 'CNY'): Promise<MarketSummaryItem> {
  const data = await getExchangeData();

  if (!data || !data.isSuccess || !data.result) {
    return { value: null };
  }

  const item = data.result.find(e => e.exchangeCode === code);

  if (!item) {
    return { value: null };
  }

  return {
    value: item.closePrice,
    change: {
      direction: codeToDirection(item.fluctuationsType?.code),
      value: item.fluctuations || '',
      percent: item.fluctuationsRatio ? `${item.fluctuationsRatio}%` : '',
    },
  };
}

export const getUsd = () => getExchange('USD');
export const getEur = () => getExchange('EUR');
export const getJpy = () => getExchange('JPY');
export const getGbp = () => getExchange('GBP');
export const getChf = () => getExchange('CHF');
export const getCny = () => getExchange('CNY');

/**
 * 특정 시세 정보 가져오기
 */
export async function getMarketData(type: MarketType): Promise<MarketData | null> {
  const marketNames: Record<MarketType, string> = {
    kospi: '코스피',
    kosdaq: '코스닥',
    nasdaq: '나스닥',
    usd: '달러',
    jpy: '엔화',
    eur: '유로',
    gbp: '파운드',
    chf: '스위스프랑',
    cny: '위안',
  };

  const fetchers: Record<MarketType, () => Promise<MarketSummaryItem>> = {
    kospi: getKospi,
    kosdaq: getKosdaq,
    nasdaq: getNasdaq,
    usd: getUsd,
    jpy: getJpy,
    eur: getEur,
    gbp: getGbp,
    chf: getChf,
    cny: getCny,
  };

  const result = await fetchers[type]();

  if (!result.value) {
    return null;
  }

  return {
    type,
    name: marketNames[type],
    value: result.value,
    change: result.change,
  };
}

/**
 * 일일 시장 종합 정보 가져오기
 */
export async function getDailyMarketSummary(): Promise<DailyMarketSummary> {
  // 병렬로 데이터 가져오기
  const [kospi, kosdaq, usd, eur, jpy, gbp, chf, cny] = await Promise.all([
    getKospi(),
    getKosdaq(),
    getUsd(),
    getEur(),
    getJpy(),
    getGbp(),
    getChf(),
    getCny(),
  ]);

  return { kospi, kosdaq, usd, eur, jpy, gbp, chf, cny };
}

/**
 * 명령어를 MarketType으로 변환
 */
export function parseCommand(command: string): MarketType | null {
  const commandMap: Record<string, MarketType> = {
    // 코스피
    '코스피': 'kospi',
    'kospi': 'kospi',
    'KOSPI': 'kospi',
    // 코스닥
    '코스닥': 'kosdaq',
    'kosdaq': 'kosdaq',
    'KOSDAQ': 'kosdaq',
    // 나스닥
    '나스닥': 'nasdaq',
    'nasdaq': 'nasdaq',
    'NASDAQ': 'nasdaq',
    // 달러
    '달러': 'usd',
    'usd': 'usd',
    'USD': 'usd',
    // 엔화
    '엔화': 'jpy',
    '엔': 'jpy',
    'jpy': 'jpy',
    'JPY': 'jpy',
    // 유로
    '유로': 'eur',
    'eur': 'eur',
    'EUR': 'eur',
    // 파운드
    '파운드': 'gbp',
    'gbp': 'gbp',
    'GBP': 'gbp',
    // 스위스 프랑
    '스위스프랑': 'chf',
    '프랑': 'chf',
    'chf': 'chf',
    'CHF': 'chf',
    // 위안
    '위안': 'cny',
    '중국': 'cny',
    'cny': 'cny',
    'CNY': 'cny',
  };

  return commandMap[command] || null;
}

export function parseSearchCommand(command: string): string | null {
  const trimmed = command.trim();

  if (!trimmed.startsWith('?')) {
    return null;
  }

  const query = trimmed.slice(1).trim();
  return query.length > 0 ? query : null;
}
