/**
 * 텔레그램 Bot API 모듈
 */

import { ChangeInfo, DailyMarketSummary, MarketSummaryItem } from './scraper';

const TELEGRAM_API_BASE = 'https://api.telegram.org';
const TELEGRAM_MAX_RETRIES = 3;
const TELEGRAM_MAX_ATTEMPTS = TELEGRAM_MAX_RETRIES + 1;
const TELEGRAM_RETRY_BASE_DELAY_MS = 500;

export interface TelegramEnv {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
}

export interface SendMessageOptions {
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disableWebPagePreview?: boolean;
  disableNotification?: boolean;
}

export interface SendRichMessageOptions {
  disableNotification?: boolean;
  isRtl?: boolean;
  skipEntityDetection?: boolean;
}

export interface TelegramMessage {
  message_id: number;
  from: {
    id: number;
    is_bot: boolean;
    first_name: string;
    username?: string;
  };
  chat: {
    id: number;
    type: string;
    title?: string;
    username?: string;
    first_name?: string;
    last_name?: string;
  };
  date: number;
  text?: string;
  rich_message?: unknown;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function shouldRetryTelegramResponse(response: TelegramResponse<unknown>): boolean {
  const description = response.description || '';

  return (
    description.includes('HTTP 5') ||
    description.includes('non-JSON response (5') ||
    description.includes('error code: 520') ||
    description.includes('fetch failed')
  );
}

/**
 * 변동 정보를 이모지와 텍스트로 포맷팅
 */
function formatChange(change?: ChangeInfo): string {
  if (!change || !change.value) return '';

  // 🔺 상승(빨간), 🔽 하락(파란), ➖ 보합
  const emoji = change.direction === 'up' ? '↗️' : change.direction === 'down' ? '↘️' : '➖';
  
  // 값에서 기존 부호 제거 후 방향에 맞게 부호 추가
  const cleanValue = change.value.replace(/^[+-]/, '');
  const signedValue =
    change.direction === 'down'
      ? `-${cleanValue}`
      : change.direction === 'up'
        ? `+${cleanValue}`
        : cleanValue;
  
  const percentText = change.percent ? ` (${change.percent})` : '';

  return ` ${emoji}${signedValue}${percentText}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMarketTableRow(label: string, item: MarketSummaryItem): string {
  const value = item.value ?? 'N/A';
  const changeText = formatChange(item.change) || '➖';

  return [
    '<tr>',
    `<th align="left">${escapeHtml(label)}</th>`,
    `<td align="right"><b>${escapeHtml(value)}</b></td>`,
    `<td align="right">${escapeHtml(changeText.trim())}</td>`,
    '</tr>',
  ].join('');
}

/**
 * 텔레그램 Bot API 클래스
 */
export class TelegramBot {
  private readonly token: string;
  private readonly defaultChatId: string;

  constructor(token: string, chatId: string) {
    this.token = token;
    this.defaultChatId = chatId;
  }

  /**
   * 텔레그램 API 호출
   */
  private async callApi<T>(
    method: string,
    params: Record<string, unknown>
  ): Promise<TelegramResponse<T>> {
    const url = `${TELEGRAM_API_BASE}/bot${this.token}/${method}`;

    for (let attempt = 1; attempt <= TELEGRAM_MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(params),
        });

        const rawBody = await response.text();
        let parsed: TelegramResponse<T>;

        try {
          parsed = JSON.parse(rawBody) as TelegramResponse<T>;
        } catch {
          const bodyPreview = rawBody.slice(0, 200) || '<empty body>';
          console.error(`Telegram API returned non-JSON response for ${method}:`, {
            attempt,
            status: response.status,
            statusText: response.statusText,
            body: bodyPreview,
          });

          parsed = {
            ok: false,
            description: `Telegram API ${method} returned non-JSON response (${response.status}): ${bodyPreview}`,
          };
        }

        if (parsed.ok || attempt === TELEGRAM_MAX_ATTEMPTS || !shouldRetryTelegramResponse(parsed)) {
          return parsed;
        }

        console.warn(`Retrying Telegram API ${method} after failed response:`, {
          attempt,
          description: parsed.description,
        });
      } catch (error) {
        const description = `Telegram API ${method} fetch failed: ${String(error)}`;

        if (attempt === TELEGRAM_MAX_ATTEMPTS) {
          return {
            ok: false,
            description,
          };
        }

        console.warn(`Retrying Telegram API ${method} after fetch error:`, {
          attempt,
          error: String(error),
        });
      }

      await delay(TELEGRAM_RETRY_BASE_DELAY_MS * attempt);
    }

    return {
      ok: false,
      description: `Telegram API ${method} failed after ${TELEGRAM_MAX_ATTEMPTS} attempts`,
    };
  }

  /**
   * 메시지 전송
   */
  async sendMessage(
    text: string,
    options: SendMessageOptions = {},
    chatId?: string
  ): Promise<TelegramResponse<TelegramMessage>> {
    const params: Record<string, unknown> = {
      chat_id: chatId || this.defaultChatId,
      text,
      parse_mode: options.parseMode || 'HTML',
      disable_web_page_preview: options.disableWebPagePreview ?? true,
      disable_notification: options.disableNotification ?? true,
    };

    return this.callApi<TelegramMessage>('sendMessage', params);
  }

  /**
   * 리치 메시지 전송
   */
  async sendRichMessage(
    html: string,
    options: SendRichMessageOptions = {},
    chatId?: string
  ): Promise<TelegramResponse<TelegramMessage>> {
    const richMessage: Record<string, unknown> = {
      html,
    };

    if (options.isRtl !== undefined) {
      richMessage.is_rtl = options.isRtl;
    }

    if (options.skipEntityDetection !== undefined) {
      richMessage.skip_entity_detection = options.skipEntityDetection;
    }

    const params: Record<string, unknown> = {
      chat_id: chatId || this.defaultChatId,
      rich_message: richMessage,
      disable_notification: options.disableNotification ?? true,
    };

    return this.callApi<TelegramMessage>('sendRichMessage', params);
  }

  /**
   * 일일 시장 정보 메시지 전송
   */
  async sendDailyMarketMessage(data: DailyMarketSummary, chatId?: string): Promise<TelegramResponse<TelegramMessage>> {
    const message = this.formatDailyMarketRichMessage(data);
    return this.sendRichMessage(message, {}, chatId);
  }

  /**
   * 일일 시장 정보 리치 메시지 포맷팅
   */
  private formatDailyMarketRichMessage(data: DailyMarketSummary): string {
    const indexRows = [
      formatMarketTableRow('🇰🇷 코스피', data.kospi),
      formatMarketTableRow('🇰🇷 코스닥', data.kosdaq),
    ].join('');

    const exchangeRows = [
      formatMarketTableRow('💵 USD/KRW', data.usd),
      formatMarketTableRow('💶 EUR/KRW', data.eur),
      formatMarketTableRow('💴 JPY/KRW', data.jpy),
      formatMarketTableRow('🇬🇧 GBP/KRW', data.gbp),
      formatMarketTableRow('🇨🇭 CHF/KRW', data.chf),
      formatMarketTableRow('🇨🇳 CNY/KRW', data.cny),
    ].join('');

    return [
      '<h2>📊 일일 시장 상황</h2>',
      '<table bordered striped>',
      '<caption>국내 지수</caption>',
      '<tr><th align="left">시장</th><th align="right">현재가</th><th align="right">변동</th></tr>',
      indexRows,
      '</table>',
      '<hr/>',
      '<table bordered striped>',
      '<caption>주요 환율</caption>',
      '<tr><th align="left">통화</th><th align="right">현재가</th><th align="right">변동</th></tr>',
      exchangeRows,
      '</table>',
    ].join('');
  }

  /**
   * 개별 시세 정보 메시지 전송
   */
  async sendMarketDataMessage(
    username: string,
    marketName: string,
    value: string,
    change?: ChangeInfo,
    chatId?: string,
    sourceUrl?: string
  ): Promise<TelegramResponse<TelegramMessage>> {
    const changeText = formatChange(change);
    const safeUsername = escapeHtml(username);
    const safeMarketName = escapeHtml(marketName);
    const safeValue = escapeHtml(value);
    const messageLines = [
      `<h3>${safeMarketName}</h3>`,
      `<p>@${safeUsername} 현재 시세는 <b>${safeValue}</b>${escapeHtml(changeText)} 입니다.</p>`,
    ];

    if (sourceUrl) {
      const safeSourceUrl = escapeHtml(sourceUrl);
      messageLines.push(`<p><a href="${safeSourceUrl}"><i>자세히 보기</i></a></p>`);
    }

    const message = messageLines.join('');

    return this.sendRichMessage(message, {}, chatId);
  }

  /**
   * 이미지(URL) 전송
   */
  async sendPhoto(
    photoUrl: string,
    caption?: string,
    chatId?: string
  ): Promise<TelegramResponse<TelegramMessage>> {
    const params: Record<string, unknown> = {
      chat_id: chatId || this.defaultChatId,
      photo: photoUrl,
      disable_notification: true,
    };

    if (caption) {
      params.caption = caption;
      params.parse_mode = 'HTML';
    }

    return this.callApi<TelegramMessage>('sendPhoto', params);
  }

  /**
   * 차트 이미지들 전송
   */
  async sendChartImages(charts: {
    kospi: string | null;
    usd: string | null;
  }, chatId?: string): Promise<void> {
    if (charts.kospi) {
      try {
        const res = await this.sendPhoto(charts.kospi, '<b>📈 코스피 7일 추이</b>', chatId);
        if (!res.ok) {
          console.error('Failed to send KOSPI chart image:', res.description);
        }
      } catch (error) {
        console.error('Failed to send KOSPI chart image:', error);
      }
    }

    if (charts.usd) {
      try {
        const res = await this.sendPhoto(charts.usd, '<b>💵 USD/KRW 환율 7일 추이</b>', chatId);
        if (!res.ok) {
          console.error('Failed to send USD chart image:', res.description);
        }
      } catch (error) {
        console.error('Failed to send USD chart image:', error);
      }
    }
  }
}

/**
 * 환경변수에서 TelegramBot 인스턴스 생성
 */
export function createTelegramBot(env: TelegramEnv): TelegramBot {
  return new TelegramBot(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID);
}
