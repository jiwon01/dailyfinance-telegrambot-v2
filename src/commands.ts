import type { MarketType } from './scraper';

export type BotCommandGroup = 'briefing' | 'market' | 'exchange' | 'search' | 'help';

export interface BotCommandSpec {
  command: string;
  description: string;
  group: BotCommandGroup;
}

export const BOT_COMMANDS: readonly BotCommandSpec[] = [
  { command: 'now', description: '일일 시장 브리핑을 지금 받기', group: 'briefing' },
  { command: 'nasdaq_close', description: '나스닥 장마감 현황과 30거래일 차트', group: 'briefing' },
  { command: 'kospi', description: '코스피 지수', group: 'market' },
  { command: 'kosdaq', description: '코스닥 지수', group: 'market' },
  { command: 'nasdaq', description: '나스닥 지수', group: 'market' },
  { command: 'usd', description: '원/달러 환율', group: 'exchange' },
  { command: 'jpy', description: '원/엔 환율', group: 'exchange' },
  { command: 'eur', description: '원/유로 환율', group: 'exchange' },
  { command: 'gbp', description: '원/파운드 환율', group: 'exchange' },
  { command: 'chf', description: '원/스위스프랑 환율', group: 'exchange' },
  { command: 'cny', description: '원/위안 환율', group: 'exchange' },
  { command: 'search', description: '종목·지수·가상화폐 검색', group: 'search' },
  { command: 'help', description: '사용 가능한 명령어 목록 보기', group: 'help' },
];

export const MARKET_COMMANDS: Readonly<Partial<Record<string, MarketType>>> = {
  kospi: 'kospi',
  kosdaq: 'kosdaq',
  nasdaq: 'nasdaq',
  usd: 'usd',
  jpy: 'jpy',
  eur: 'eur',
  gbp: 'gbp',
  chf: 'chf',
  cny: 'cny',
};

export interface ParsedSlashCommand {
  name: string;
  args: string;
}

export function parseSlashCommand(text: string): ParsedSlashCommand | null {
  const match = text.trim().match(/^\/([a-z0-9_]+)(?:@[a-z0-9_]+)?(?:\s+([\s\S]*))?$/i);

  if (!match) {
    return null;
  }

  return {
    name: match[1].toLowerCase(),
    args: (match[2] || '').trim(),
  };
}
