/**
 * 텔레그램 Bot API 모듈
 */

import { ChangeInfo, DailyMarketSummary, MarketSummaryItem } from './scraper';

const TELEGRAM_API_BASE = 'https://api.telegram.org';

export interface TelegramEnv {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
}

export interface SendMessageOptions {
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disableWebPagePreview?: boolean;
  disableNotification?: boolean;
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
  };
  date: number;
  text?: string;
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

/**
 * 변동 정보를 이모지와 텍스트로 포맷팅
 */
function formatChange(change?: ChangeInfo): string {
  if (!change || !change.value) return '';

  // 🔺 상승(빨간), 🔽 하락(파란), ➖ 보합
  const emoji = change.direction === 'up' ? '↗️' : change.direction === 'down' ? '↘️' : '➖';
  
  // 값에서 기존 부호 제거 후 방향에 맞게 부호 추가
  const cleanValue = change.value.replace(/^[+-]/, '');
  const signedValue = change.direction === 'down' ? `-${cleanValue}` : `+${cleanValue}`;
  
  const percentText = change.percent ? ` (${change.percent})` : '';

  return ` ${emoji}${signedValue}${percentText}`;
}

/**
 * 시장 항목을 포맷팅
 */
function formatMarketItem(emoji: string, label: string, item: MarketSummaryItem): string {
  const value = item.value ?? 'N/A';
  const changeText = formatChange(item.change);
  return `${emoji} ${label}: ${value}${changeText}`;
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

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    return response.json() as Promise<TelegramResponse<T>>;
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
   * 일일 시장 정보 메시지 전송
   */
  async sendDailyMarketMessage(data: DailyMarketSummary, chatId?: string): Promise<TelegramResponse<TelegramMessage>> {
    const message = this.formatDailyMarketMessage(data);
    return this.sendMessage(message, {}, chatId);
  }

  /**
   * 일일 시장 정보 메시지 포맷팅
   */
  private formatDailyMarketMessage(data: DailyMarketSummary): string {
    const lines = [
      '<b>📊 일일 시장 상황</b>',
      '',
      formatMarketItem('🇰🇷', '코스피', data.kospi),
      formatMarketItem('🇰🇷', '코스닥', data.kosdaq),
      '',
      formatMarketItem('💵', 'USD', data.usd),
      formatMarketItem('💶', 'EUR', data.eur),
      formatMarketItem('💴', 'JPY', data.jpy),
      formatMarketItem('🇬🇧', 'GBP', data.gbp),
      formatMarketItem('🇨🇭', 'CHF', data.chf),
      formatMarketItem('🇨🇳', 'CNY', data.cny),
    ];

    return lines.join('\n');
  }

  /**
   * 개별 시세 정보 메시지 전송
   */
  async sendMarketDataMessage(
    username: string,
    marketName: string,
    value: string,
    change?: ChangeInfo,
    chatId?: string
  ): Promise<TelegramResponse<TelegramMessage>> {
    const changeText = formatChange(change);
    const message = [
      `@${username}`,
      `${marketName}의 현재 시세는 <b>${value}</b>${changeText} 입니다.`,
      `<a href="https://finance.naver.com"><i>자세히 보기</i></a>`,
    ].join('\n');

    return this.sendMessage(message, {}, chatId);
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
      const res = await this.sendPhoto(charts.kospi, '<b>📈 코스피 7일 추이</b>', chatId);
      if (!res.ok) {
        console.error('Failed to send KOSPI chart image:', res.description);
      }
    }

    if (charts.usd) {
      const res = await this.sendPhoto(charts.usd, '<b>💵 USD/KRW 환율 7일 추이</b>', chatId);
      if (!res.ok) {
        console.error('Failed to send USD chart image:', res.description);
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
