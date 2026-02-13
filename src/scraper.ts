/**
 * 네이버 금융 API에서 시세 정보를 가져오는 모듈
 */

import { parse as parseHtml } from 'node-html-parser';

// API URL 상수
const API_URLS = {
  KOSPI: 'https://polling.finance.naver.com/api/realtime/domestic/index/KOSPI',
  KOSDAQ: 'https://polling.finance.naver.com/api/realtime/domestic/index/KOSDAQ',
  NASDAQ: 'https://polling.finance.naver.com/api/realtime/worldstock/index/.IXIC',
  EXCHANGE: 'https://m.stock.naver.com/front-api/marketIndex/exchange/new',
} as const;

const DEFAULT_JSON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
} as const;

const YAHOO_QUOTE_BASE_URL = 'https://finance.yahoo.com/quote';
const YAHOO_PAGE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://finance.yahoo.com/',
} as const;

const YAHOO_ASSET_TYPE_MAP: Record<string, YahooMarketData['assetType']> = {
  EQUITY: 'stock',
  INDEX: 'index',
  CRYPTOCURRENCY: 'crypto',
};

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

function formatYahooPrice(value: number): string {
  const abs = Math.abs(value);
  const maxFractionDigits = abs >= 1000 ? 2 : abs >= 1 ? 4 : 8;
  return value.toLocaleString('en-US', { maximumFractionDigits: maxFractionDigits });
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

function toYahooAssetType(quoteType?: string): YahooMarketData['assetType'] {
  if (!quoteType) return 'other';
  return YAHOO_ASSET_TYPE_MAP[quoteType] || 'other';
}

interface YahooEmbeddedQuoteItem {
  symbol?: string;
  quoteType?: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: { raw?: number } | number;
  regularMarketChange?: { raw?: number } | number;
  regularMarketChangePercent?: { raw?: number } | number;
}

interface ParsedYahooQuotePayload {
  symbol: string;
  name?: string;
  quoteType?: string;
  price: number;
  change: number | null;
  changePercent: number | null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseSignedNumber(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const normalized = raw.replace(/[,%()]/g, '').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'object' && value !== null && 'raw' in value) {
    const raw = (value as { raw?: unknown }).raw;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return raw;
    }
  }
  return null;
}

function toParsedYahooQuote(item: YahooEmbeddedQuoteItem): ParsedYahooQuotePayload | null {
  if (!item.symbol) return null;

  const price = toFiniteNumber(item.regularMarketPrice);
  if (price === null) return null;

  return {
    symbol: item.symbol.toUpperCase(),
    name: item.longName || item.shortName || item.symbol,
    quoteType: item.quoteType,
    price,
    change: toFiniteNumber(item.regularMarketChange),
    changePercent: toFiniteNumber(item.regularMarketChangePercent),
  };
}

function extractFromSveltekitFetchedScripts(
  root: ReturnType<typeof parseHtml>,
  symbolCandidates: string[]
): ParsedYahooQuotePayload | null {
  const targetSet = new Set(symbolCandidates.map(s => s.toUpperCase()));
  const scripts = root.querySelectorAll('script[type="application/json"][data-sveltekit-fetched]');

  for (const script of scripts) {
    const rawScript = script.text?.trim();
    if (!rawScript) continue;

    try {
      const envelope = JSON.parse(rawScript) as { body?: unknown };
      if (typeof envelope.body !== 'string') continue;

      const payload = JSON.parse(envelope.body) as {
        quoteResponse?: { result?: YahooEmbeddedQuoteItem[] };
      };
      const results = payload.quoteResponse?.result;
      if (!Array.isArray(results)) continue;

      for (const item of results) {
        const parsed = toParsedYahooQuote(item);
        if (!parsed) continue;
        if (targetSet.has(parsed.symbol)) {
          return parsed;
        }
      }
    } catch {
      // ignore malformed script entries
    }
  }

  return null;
}

function extractFromTrendingScript(
  root: ReturnType<typeof parseHtml>,
  symbolCandidates: string[]
): ParsedYahooQuotePayload | null {
  const targetSet = new Set(symbolCandidates.map(s => s.toUpperCase()));
  const script = root.querySelector('script#fin-trending-tickers');
  const raw = script?.text?.trim();
  if (!raw) return null;

  try {
    const payload = JSON.parse(raw) as YahooEmbeddedQuoteItem[];
    if (!Array.isArray(payload)) return null;

    for (const item of payload) {
      const parsed = toParsedYahooQuote(item);
      if (!parsed) continue;
      if (targetSet.has(parsed.symbol)) {
        return parsed;
      }
    }
  } catch {
    // ignore malformed script content
  }

  return null;
}

function extractFinStreamerNumber(
  root: ReturnType<typeof parseHtml>,
  symbol: string,
  field: string
): number | null {
  const target = symbol.toUpperCase();
  const nodes = root.querySelectorAll(`fin-streamer[data-field="${field}"]`);

  for (const node of nodes) {
    const nodeSymbol = (node.getAttribute('data-symbol') || '').toUpperCase();
    if (nodeSymbol !== target) continue;

    const raw = node.getAttribute('data-value') || node.text;
    const parsed = parseSignedNumber(raw);
    if (parsed !== null) return parsed;
  }

  return null;
}

function extractCanonicalSymbol(root: ReturnType<typeof parseHtml>, fallback: string): string {
  const canonical = root.querySelector('link[rel="canonical"]')?.getAttribute('href');
  if (!canonical) return fallback;

  const match = canonical.match(/\/quote\/([^/]+)\//i);
  if (!match?.[1]) return fallback;

  try {
    return decodeURIComponent(match[1]).toUpperCase();
  } catch {
    return match[1].toUpperCase();
  }
}

function extractYahooName(root: ReturnType<typeof parseHtml>, fallbackSymbol: string): string {
  const target = fallbackSymbol.toUpperCase();
  const headings = root.querySelectorAll('h1');
  for (const headingEl of headings) {
    const heading = headingEl.text.replace(/\s+/g, ' ').trim();
    if (!heading) continue;
    if (heading.toUpperCase().includes(target)) {
      return heading;
    }
  }

  const title = root.querySelector('title')?.text.replace(/\s+/g, ' ').trim();
  if (title) {
    const withoutSite = title.replace(/\s*-\s*Yahoo Finance\s*$/i, '');
    const withoutSuffix = withoutSite.replace(/\s+Stock Price.*$/i, '').trim();
    if (withoutSuffix) return withoutSuffix;
  }

  return fallbackSymbol;
}

function extractQuoteTypeFromHtml(html: string, symbol: string): string | undefined {
  const escapedSymbol = escapeRegExp(symbol);

  const symbolFirst = new RegExp(
    `"symbol":"${escapedSymbol}"[\\s\\S]{0,320}?"quoteType":"([A-Z_]+)"`
  );
  const symbolFirstMatch = html.match(symbolFirst);
  if (symbolFirstMatch?.[1]) return symbolFirstMatch[1];

  const typeFirst = new RegExp(
    `"quoteType":"([A-Z_]+)"[\\s\\S]{0,320}?"symbol":"${escapedSymbol}"`
  );
  const typeFirstMatch = html.match(typeFirst);
  return typeFirstMatch?.[1];
}

function looksLikeYahooNotFoundPage(html: string): boolean {
  const lower = html.toLowerCase();
  return (
    lower.includes('symbol lookup from yahoo finance') ||
    lower.includes('requested symbol wasn') ||
    lower.includes('requested symbol was not found') ||
    lower.includes('lookup from yahoo finance')
  );
}

async function fetchYahooQuotePage(symbol: string): Promise<YahooLookupResult> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (!normalizedSymbol) {
    return { status: 'not_found', query: symbol };
  }

  const url = `${YAHOO_QUOTE_BASE_URL}/${encodeURIComponent(normalizedSymbol)}/`;

  try {
    const response = await fetch(url, {
      headers: YAHOO_PAGE_HEADERS,
    });

    if (response.status === 404) {
      return { status: 'not_found', query: normalizedSymbol };
    }

    if (!response.ok) {
      return {
        status: 'error',
        query: normalizedSymbol,
        reason: `Yahoo quote page failed: ${response.status}`,
      };
    }

    const html = await response.text();
    if (html.toLowerCase().includes('too many requests')) {
      return {
        status: 'error',
        query: normalizedSymbol,
        reason: 'Yahoo quote page rate-limited (429)',
      };
    }

    const root = parseHtml(html);
    let resolvedSymbol = extractCanonicalSymbol(root, normalizedSymbol);

    let price =
      extractFinStreamerNumber(root, resolvedSymbol, 'regularMarketPrice') ??
      extractFinStreamerNumber(root, normalizedSymbol, 'regularMarketPrice');

    let change =
      extractFinStreamerNumber(root, resolvedSymbol, 'regularMarketChange') ??
      extractFinStreamerNumber(root, normalizedSymbol, 'regularMarketChange');

    let changePercent =
      extractFinStreamerNumber(root, resolvedSymbol, 'regularMarketChangePercent') ??
      extractFinStreamerNumber(root, normalizedSymbol, 'regularMarketChangePercent');

    let quoteType: string | undefined;
    let embeddedName: string | undefined;

    const symbolCandidates = [resolvedSymbol, normalizedSymbol];
    const embeddedQuote =
      extractFromSveltekitFetchedScripts(root, symbolCandidates) ||
      extractFromTrendingScript(root, symbolCandidates);

    if (embeddedQuote) {
      resolvedSymbol = embeddedQuote.symbol || resolvedSymbol;
      if (price === null) price = embeddedQuote.price;
      if (change === null) change = embeddedQuote.change;
      if (changePercent === null) changePercent = embeddedQuote.changePercent;
      quoteType = embeddedQuote.quoteType;
      embeddedName = embeddedQuote.name;
    }

    if (price === null) {
      if (looksLikeYahooNotFoundPage(html)) {
        return { status: 'not_found', query: normalizedSymbol };
      }

      return {
        status: 'error',
        query: normalizedSymbol,
        reason: 'Unable to parse Yahoo quote page (missing market price)',
      };
    }

    const name = embeddedName || extractYahooName(root, resolvedSymbol);
    const inferredQuoteType =
      quoteType ||
      extractQuoteTypeFromHtml(html, resolvedSymbol) ||
      extractQuoteTypeFromHtml(html, normalizedSymbol);

    return {
      status: 'ok',
      data: {
        symbol: resolvedSymbol,
        name,
        value: formatYahooPrice(price),
        change: toYahooChangeInfo(change ?? undefined, changePercent ?? undefined),
        sourceUrl: `${YAHOO_QUOTE_BASE_URL}/${encodeURIComponent(resolvedSymbol)}/`,
        assetType: toYahooAssetType(inferredQuoteType),
      },
    };
  } catch (error) {
    return {
      status: 'error',
      query: normalizedSymbol,
      reason: `Yahoo quote page error: ${String(error)}`,
    };
  }
}

export async function getYahooMarketData(query: string): Promise<YahooLookupResult> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return { status: 'not_found', query };
  }

  return fetchYahooQuotePage(trimmedQuery);
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
