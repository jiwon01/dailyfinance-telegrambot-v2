/**
 * 네이버 금융 + Finnhub API에서 시세 정보를 가져오는 모듈
 */

// API URL 상수
const API_URLS = {
  KOSPI: 'https://polling.finance.naver.com/api/realtime/domestic/index/KOSPI',
  KOSDAQ: 'https://polling.finance.naver.com/api/realtime/domestic/index/KOSDAQ',
  NASDAQ: 'https://polling.finance.naver.com/api/realtime/worldstock/index/.IXIC',
  EXCHANGE: 'https://m.stock.naver.com/front-api/marketIndex/exchange/new',
} as const;

const FINNHUB_API_BASE = 'https://finnhub.io/api/v1';

const DEFAULT_JSON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
} as const;

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

export interface GlobalMarketData {
  symbol: string;
  name: string;
  value: string;
  change?: ChangeInfo;
  sourceUrl: string;
  assetType: 'stock' | 'index' | 'crypto' | 'other';
}

export type GlobalLookupResult =
  | { status: 'ok'; data: GlobalMarketData }
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

interface FinnhubQuoteResponse {
  c?: number;   // current
  d?: number;   // change
  dp?: number;  // percent change
  pc?: number;  // previous close
}

interface FinnhubSearchItem {
  description?: string;
  displaySymbol?: string;
  symbol?: string;
  type?: string;
}

interface FinnhubSearchResponse {
  count?: number;
  result?: FinnhubSearchItem[];
}

interface FinnhubProfileResponse {
  name?: string;
  ticker?: string;
}

interface FinnhubQuoteResolved {
  currentPrice: number;
  change: number | null;
  changePercent: number | null;
}

interface FinnhubCandidate {
  symbol: string;
  type?: string;
  description?: string;
}

/**
 * API 호출 유틸리티
 */
async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: DEFAULT_JSON_HEADERS,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function formatNumericValue(value: number): string {
  const abs = Math.abs(value);
  const maxFractionDigits = abs >= 1000 ? 2 : abs >= 1 ? 4 : 8;
  return value.toLocaleString('en-US', { maximumFractionDigits: maxFractionDigits });
}

function toChangeInfo(change?: number | null, changePercent?: number | null): ChangeInfo | undefined {
  if (!Number.isFinite(change) || !Number.isFinite(changePercent)) {
    return undefined;
  }

  const normalizedChange = change as number;
  const normalizedPercent = changePercent as number;

  const direction: ChangeDirection =
    normalizedChange > 0 ? 'up' : normalizedChange < 0 ? 'down' : 'unchanged';

  return {
    direction,
    value: formatNumericValue(Math.abs(normalizedChange)),
    percent: `${Math.abs(normalizedPercent).toFixed(2)}%`,
  };
}

function toAssetType(type?: string, symbol?: string): GlobalMarketData['assetType'] {
  const lowerType = (type || '').toLowerCase();

  if (lowerType.includes('crypto')) {
    return 'crypto';
  }

  if (lowerType.includes('index')) {
    return 'index';
  }

  const upperSymbol = (symbol || '').toUpperCase();
  if (upperSymbol.includes(':')) {
    const exchange = upperSymbol.split(':')[0];
    if (['BINANCE', 'COINBASE', 'BITFINEX', 'KRAKEN', 'BYBIT', 'HUOBI'].includes(exchange)) {
      return 'crypto';
    }
  }

  if (
    lowerType.includes('stock') ||
    lowerType.includes('equity') ||
    lowerType.includes('etf') ||
    lowerType.includes('fund') ||
    lowerType.includes('adr')
  ) {
    return 'stock';
  }

  return 'other';
}

function dedupeSymbols(symbols: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const symbol of symbols) {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function buildDirectSymbolCandidates(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const upper = trimmed.toUpperCase();
  const symbols = [upper];

  if (upper.startsWith('$') && upper.length > 1) {
    symbols.push(upper.slice(1));
  }

  // ex) BTC-USD -> BINANCE:BTCUSDT 후보도 같이 시도
  const usdCryptoMatch = upper.match(/^([A-Z0-9]{2,12})-USD$/);
  if (usdCryptoMatch) {
    const base = usdCryptoMatch[1];
    symbols.push(`BINANCE:${base}USDT`);
    symbols.push(`COINBASE:${base}-USD`);
  }

  // ex) BTCUSDT -> BINANCE:BTCUSDT
  if (/^[A-Z0-9]{4,20}USDT$/.test(upper) && !upper.includes(':')) {
    symbols.push(`BINANCE:${upper}`);
  }

  // 지수 별칭 일부
  const indexAlias: Record<string, string[]> = {
    '^GSPC': ['SPY'],
    '^IXIC': ['QQQ'],
    '^DJI': ['DIA'],
    '^RUT': ['IWM'],
  };
  for (const alias of indexAlias[upper] || []) {
    symbols.push(alias);
  }

  return dedupeSymbols(symbols);
}

function makeFinnhubUrl(path: string, params: Record<string, string>): string {
  const url = new URL(`${FINNHUB_API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function callFinnhub<T>(path: string, params: Record<string, string>): Promise<T> {
  const response = await fetch(makeFinnhubUrl(path, params), {
    headers: DEFAULT_JSON_HEADERS,
  });

  if (response.status === 404) {
    throw new Error('FINNHUB_NOT_FOUND');
  }

  if (!response.ok) {
    throw new Error(`FINNHUB_HTTP_${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function fetchFinnhubQuote(symbol: string, apiKey: string): Promise<FinnhubQuoteResolved | null> {
  let quote: FinnhubQuoteResponse;

  try {
    quote = await callFinnhub<FinnhubQuoteResponse>('/quote', {
      symbol,
      token: apiKey,
    });
  } catch (error) {
    if (String(error).includes('FINNHUB_NOT_FOUND')) {
      return null;
    }
    throw error;
  }

  const current = quote.c;
  if (!Number.isFinite(current)) {
    return null;
  }

  const previousClose = quote.pc;
  let change = Number.isFinite(quote.d) ? (quote.d as number) : null;
  if (change === null && Number.isFinite(previousClose)) {
    change = (current as number) - (previousClose as number);
  }

  let changePercent = Number.isFinite(quote.dp) ? (quote.dp as number) : null;
  if (
    changePercent === null &&
    change !== null &&
    Number.isFinite(previousClose) &&
    (previousClose as number) !== 0
  ) {
    changePercent = (change / (previousClose as number)) * 100;
  }

  // Finnhub에서 존재하지 않는 심볼은 모든 값이 0인 형태가 자주 반환됨
  if ((current as number) === 0 && (!Number.isFinite(previousClose) || (previousClose as number) === 0)) {
    return null;
  }

  return {
    currentPrice: current as number,
    change,
    changePercent,
  };
}

async function fetchFinnhubProfileName(symbol: string, apiKey: string): Promise<string | undefined> {
  try {
    const profile = await callFinnhub<FinnhubProfileResponse>('/stock/profile2', {
      symbol,
      token: apiKey,
    });

    const name = profile.name?.trim();
    if (name) return name;
  } catch {
    // 프로필 실패는 quote 조회 실패로 보지 않음
  }

  return undefined;
}

async function searchFinnhub(query: string, apiKey: string): Promise<FinnhubCandidate[]> {
  const payload = await callFinnhub<FinnhubSearchResponse>('/search', {
    q: query,
    token: apiKey,
  });

  const results = payload.result || [];
  const normalizedQuery = query.trim().toUpperCase();

  const scored = results
    .map((item): FinnhubCandidate | null => {
      const symbol = item.symbol?.trim().toUpperCase();
      if (!symbol) return null;

      return {
        symbol,
        type: item.type,
        description: item.description,
      };
    })
    .filter((item): item is FinnhubCandidate => item !== null)
    .map(item => {
      const display = item.symbol;
      let score = 0;

      if (display === normalizedQuery) score += 120;
      if (display.replace(/^\^/, '') === normalizedQuery.replace(/^\^/, '')) score += 90;
      if (display.startsWith(normalizedQuery)) score += 45;
      if ((item.description || '').toUpperCase().includes(normalizedQuery)) score += 15;

      const lowerType = (item.type || '').toLowerCase();
      if (lowerType.includes('stock') || lowerType.includes('equity')) score += 10;
      if (lowerType.includes('index')) score += 10;
      if (lowerType.includes('crypto')) score += 10;

      return { item, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(entry => entry.item);

  const deduped: FinnhubCandidate[] = [];
  const seen = new Set<string>();
  for (const item of scored) {
    if (seen.has(item.symbol)) continue;
    seen.add(item.symbol);
    deduped.push(item);
    if (deduped.length >= 12) break;
  }

  return deduped;
}

function buildDisplayName(symbol: string, name?: string): string {
  const trimmedName = name?.trim();
  if (!trimmedName) return symbol;

  if (trimmedName.toUpperCase() === symbol.toUpperCase()) {
    return symbol;
  }

  return `${trimmedName} (${symbol})`;
}

async function resolveFinnhubCandidate(
  candidate: FinnhubCandidate,
  apiKey: string
): Promise<GlobalMarketData | null> {
  const quote = await fetchFinnhubQuote(candidate.symbol, apiKey);
  if (!quote) return null;

  const profileName = await fetchFinnhubProfileName(candidate.symbol, apiKey);
  const finalName = buildDisplayName(candidate.symbol, profileName || candidate.description);

  return {
    symbol: candidate.symbol,
    name: finalName,
    value: formatNumericValue(quote.currentPrice),
    change: toChangeInfo(quote.change, quote.changePercent),
    sourceUrl: `https://finnhub.io`,
    assetType: toAssetType(candidate.type, candidate.symbol),
  };
}

export async function getFinnhubMarketData(query: string, apiKey: string): Promise<GlobalLookupResult> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return { status: 'not_found', query };
  }

  const key = apiKey.trim();
  if (!key) {
    return {
      status: 'error',
      query: trimmedQuery,
      reason: 'Missing FINNHUB_API_KEY',
    };
  }

  const directSymbols = buildDirectSymbolCandidates(trimmedQuery);
  let firstError: string | null = null;

  for (const symbol of directSymbols) {
    try {
      const resolved = await resolveFinnhubCandidate({ symbol }, key);
      if (resolved) {
        return { status: 'ok', data: resolved };
      }
    } catch (error) {
      if (!firstError) {
        firstError = String(error);
      }
    }
  }

  try {
    const searchCandidates = await searchFinnhub(trimmedQuery, key);

    for (const candidate of searchCandidates) {
      try {
        const resolved = await resolveFinnhubCandidate(candidate, key);
        if (resolved) {
          return { status: 'ok', data: resolved };
        }
      } catch (error) {
        if (!firstError) {
          firstError = String(error);
        }
      }
    }
  } catch (error) {
    return {
      status: 'error',
      query: trimmedQuery,
      reason: `Finnhub search failed: ${String(error)}`,
    };
  }

  if (firstError) {
    return {
      status: 'error',
      query: trimmedQuery,
      reason: `Finnhub lookup failed: ${firstError}`,
    };
  }

  return { status: 'not_found', query: trimmedQuery };
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
