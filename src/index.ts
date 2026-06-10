/**
 * Cloudflare Workers - 일일 금융 시장 정보 텔레그램 봇
 *
 * 기능:
 * 1. Cron 트리거: 매일 특정 시간에 일일 시장 상황 자동 전송
 * 2. HTTP 트리거: 텔레그램 웹훅으로 사용자 명령어 처리
 */

import { createTelegramBot, TelegramEnv, TelegramUpdate } from './telegram';
import {
  getDailyMarketSummary,
  getFinnhubMarketData,
  getMarketData,
  parseCommand,
  parseSearchCommand,
} from './scraper';
import { getAllChartUrls } from './chart';

// 환경변수 타입 확장
interface Env extends TelegramEnv {
  FINNHUB_API_KEY?: string;
}

interface DailyBriefingOptions {
  chatId?: string;
  logPrefix?: string;
}

function assertTelegramToken(env: TelegramEnv): void {
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error('Missing TELEGRAM_BOT_TOKEN');
  }
}

function assertTelegramDefaultChatId(env: TelegramEnv): void {
  if (!env.TELEGRAM_CHAT_ID) {
    throw new Error('Missing TELEGRAM_CHAT_ID');
  }
}

async function sendDailyBriefing(env: Env, options: DailyBriefingOptions = {}) {
  assertTelegramToken(env);

  if (!options.chatId) {
    assertTelegramDefaultChatId(env);
  }

  const bot = createTelegramBot({
    TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID: env.TELEGRAM_CHAT_ID || options.chatId || '',
  });

  const [charts, marketSummary] = await Promise.all([
    getAllChartUrls(),
    getDailyMarketSummary(),
  ]);

  await bot.sendChartImages(charts, options.chatId);
  console.log(`${options.logPrefix || 'Daily briefing'} chart images send attempted:`, {
    kospi: !!charts.kospi,
    usd: !!charts.usd,
  });

  const message = await bot.sendDailyMarketMessage(marketSummary, options.chatId);

  if (message.ok) {
    console.log(`${options.logPrefix || 'Daily briefing'} market message sent successfully`);
  } else {
    console.error(`${options.logPrefix || 'Daily briefing'} market message failed:`, message.description);
  }

  return { charts, message };
}

export default {
  /**
   * HTTP 요청 핸들러 (텔레그램 웹훅 + 테스트 엔드포인트)
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 테스트용 엔드포인트: GET /test
    if (request.method === 'GET' && url.pathname === '/test') {
      try {
        const result = await sendDailyBriefing(env, { logPrefix: 'HTTP /test' });

        return new Response(JSON.stringify({
          message: result.message,
          charts: result.charts,
        }, null, 2), {
          status: result.message.ok ? 200 : 500,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        return new Response(`Error: ${error}`, { status: 500 });
      }
    }

    // Cron과 동일한 발송 로직을 수동 실행하는 테스트 엔드포인트
    if (request.method === 'GET' && url.pathname === '/test-scheduled') {
      try {
        const result = await sendDailyBriefing(env, { logPrefix: 'HTTP /test-scheduled' });

        return new Response(JSON.stringify({
          trigger: 'manual-scheduled-test',
          message: result.message,
          charts: result.charts,
        }, null, 2), {
          status: result.message.ok ? 200 : 500,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        return new Response(`Error: ${error}`, { status: 500 });
      }
    }

    // 텔레그램 웹훅: POST 요청만 처리
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    let update: TelegramUpdate | null = null;

    try {
      assertTelegramToken(env);
      const parsedUpdate = await request.json() as TelegramUpdate;
      update = parsedUpdate;
      const message = parsedUpdate.message;
      
      // 메시지가 없으면 무시
      if (!message?.text) {
        return new Response('OK', { status: 200 });
      }

      console.log('Telegram webhook chat:', {
        updateId: parsedUpdate.update_id,
        messageId: message.message_id,
        chatId: message.chat.id,
        chatType: message.chat.type,
        chatTitle: message.chat.title,
        chatUsername: message.chat.username,
        fromId: message.from?.id,
        fromUsername: message.from?.username,
      });

      const rawCommand = message.text.trim();
      const command = rawCommand.toLowerCase();
      const chatId = message.chat.id.toString();
      
      // from이 없는 경우 (채널 메시지, 익명 관리자 등)
      if (!message.from) {
        return new Response('OK', { status: 200 });
      }
      
      const username = message.from.username || message.from.first_name;
      const bot = createTelegramBot({
        TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN,
        TELEGRAM_CHAT_ID: env.TELEGRAM_CHAT_ID || chatId,
      });

      // "now" 명령어: 일일 브리핑 즉시 발송
      if (command === 'now') {
        await sendDailyBriefing(env, {
          chatId,
          logPrefix: 'Telegram now',
        });

        return new Response('OK', { status: 200 });
      }

      // Finnhub 검색 명령어: ?AAPL, ?^GSPC, ?BTC-USD, ?tesla
      if (rawCommand.startsWith('?')) {
        const query = parseSearchCommand(rawCommand);

        if (!query) {
          await bot.sendMessage(
            '⚠️ 검색어가 비어 있습니다. 예: ?AAPL, ?^GSPC, ?BTC-USD',
            {},
            chatId,
          );
          return new Response('OK', { status: 200 });
        }

        if (!env.FINNHUB_API_KEY) {
          await bot.sendMessage(
            '⚠️ FINNHUB_API_KEY가 설정되지 않았습니다. 관리자에게 문의해주세요.',
            {},
            chatId,
          );
          return new Response('OK', { status: 200 });
        }

        const finnhubResult = await getFinnhubMarketData(query, env.FINNHUB_API_KEY);

        if (finnhubResult.status === 'not_found') {
          await bot.sendMessage(
            `⚠️ "${query}" 검색 결과가 없습니다.\n예: ?AAPL, ?^GSPC, ?BTC-USD`,
            {},
            chatId,
          );
          return new Response('OK', { status: 200 });
        }

        if (finnhubResult.status === 'error') {
          console.error('Finnhub lookup error:', finnhubResult.reason);
          await bot.sendMessage(
            '⚠️ Finnhub 조회 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
            {},
            chatId,
          );
          return new Response('OK', { status: 200 });
        }

        await bot.sendMarketDataMessage(
          username,
          finnhubResult.data.name,
          finnhubResult.data.value,
          finnhubResult.data.change,
          chatId,
        );

        return new Response('OK', { status: 200 });
      }

      // 명령어 파싱
      const marketType = parseCommand(rawCommand);

      if (!marketType) {
        // 알 수 없는 명령어는 무시
        return new Response('OK', { status: 200 });
      }

      // 시세 정보 가져오기
      const marketData = await getMarketData(marketType);

      if (!marketData) {
        await bot.sendMessage(`⚠️ 시세 정보를 가져오는데 실패했습니다. 잠시 후 다시 시도해주세요.`, {}, chatId);
        return new Response('OK', { status: 200 });
      }

      // 텔레그램으로 응답 (메시지를 보낸 채팅방으로 답변)
      await bot.sendMarketDataMessage(
        username,
        marketData.name,
        marketData.value,
        marketData.change,
        chatId,
        'https://finance.naver.com',
      );

      return new Response('OK', { status: 200 });
    } catch (error) {
      console.error('Webhook error:', error);
      // 오류 발생 시에도 200 반환 (텔레그램 웹훅이 재시도하지 않도록)
      try {
        if (update?.message?.chat?.id && env.TELEGRAM_BOT_TOKEN) {
          const bot = createTelegramBot({
            TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN,
            TELEGRAM_CHAT_ID: env.TELEGRAM_CHAT_ID || update.message.chat.id.toString(),
          });
          await bot.sendMessage(
            `⚠️ 요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.`,
            {},
            update.message.chat.id.toString(),
          );
        }
      } catch {
        // 오류 메시지 전송 실패 시 무시
      }
      return new Response('OK', { status: 200 });
    }
  },

  /**
   * 스케줄 트리거 핸들러 (Cron)
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('Scheduled event triggered:', new Date(event.scheduledTime).toISOString());

    ctx.waitUntil((async () => {
      try {
        await sendDailyBriefing(env, { logPrefix: 'Scheduled task' });
      } catch (error) {
        console.error('Scheduled task error:', error);
      }
    })());
  },
};
