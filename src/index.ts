/**
 * Cloudflare Workers - 일일 금융 시장 정보 텔레그램 봇
 *
 * 기능:
 * 1. Cron 트리거: 매일 특정 시간에 일일 시장 상황 자동 전송
 * 2. HTTP 트리거: 텔레그램 웹훅으로 사용자 명령어 처리
 */

import { createTelegramBot, TelegramEnv, TelegramUpdate } from './telegram';
import { getDailyMarketSummary, getMarketData, parseCommand } from './scraper';
import { getAllChartUrls } from './chart';

// 환경변수 타입 확장
interface Env extends TelegramEnv {
  // 추가 환경변수가 필요하면 여기에 정의
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
        const bot = createTelegramBot(env);

        // 1. 차트 이미지 전송
        const charts = await getAllChartUrls();
        await bot.sendChartImages(charts);

        // 2. 일일 시장 정보 전송
        const marketSummary = await getDailyMarketSummary();
        const result = await bot.sendDailyMarketMessage(marketSummary);

        return new Response(JSON.stringify({ message: result, charts }, null, 2), {
          status: result.ok ? 200 : 500,
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

    try {
      const update: TelegramUpdate = await request.json();
      const message = update.message;
      
      // 메시지가 없으면 무시
      if (!message?.text) {
        return new Response('OK', { status: 200 });
      }

      const command = message.text.trim().toLowerCase();
      const username = message.from.username || message.from.first_name;
      const chatId = message.chat.id.toString();
      const bot = createTelegramBot(env);

      // "now" 명령어: 일일 브리핑 즉시 발송
      if (command === 'now') {
        // 1. 차트 이미지 전송
        const charts = await getAllChartUrls();
        await bot.sendChartImages(charts, chatId);

        // 2. 일일 시장 정보 전송
        const marketSummary = await getDailyMarketSummary();
        await bot.sendDailyMarketMessage(marketSummary, chatId);

        return new Response('OK', { status: 200 });
      }

      // 명령어 파싱
      const marketType = parseCommand(message.text.trim());

      if (!marketType) {
        // 알 수 없는 명령어는 무시
        return new Response('OK', { status: 200 });
      }

      // 시세 정보 가져오기
      const marketData = await getMarketData(marketType);

      if (!marketData) {
        return new Response('Failed to fetch market data', { status: 500 });
      }

      // 텔레그램으로 응답 (메시지를 보낸 채팅방으로 답변)
      await bot.sendMarketDataMessage(username, marketData.name, marketData.value, marketData.change, chatId);

      return new Response('OK', { status: 200 });
    } catch (error) {
      console.error('Webhook error:', error);
      return new Response('Internal server error', { status: 500 });
    }
  },

  /**
   * 스케줄 트리거 핸들러 (Cron)
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('Scheduled event triggered:', event.scheduledTime);

    try {
      const bot = createTelegramBot(env);

      // 1. 차트 이미지 전송
      const charts = await getAllChartUrls();
      await bot.sendChartImages(charts);
      console.log('Chart images sent');

      // 2. 일일 시장 정보 전송
      const marketSummary = await getDailyMarketSummary();
      const result = await bot.sendDailyMarketMessage(marketSummary);

      if (result.ok) {
        console.log('Daily market message sent successfully');
      } else {
        console.error('Failed to send message:', result.description);
      }

    } catch (error) {
      console.error('Scheduled task error:', error);
    }
  },
};
