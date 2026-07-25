# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 작업 규칙 (AGENTS.md 우선)

이 저장소에는 [AGENTS.md](AGENTS.md)에 에이전트 작업 규칙이 정의되어 있다. **작업 전에 반드시 읽고 따른다.** 핵심만 옮기면:

- **승인 우선**: 지시를 받으면 먼저 작업 계획(목표/변경 범위/예상 수정 파일/검증 방법)을 작성하고, 사용자 승인 후에 파일을 수정한다. 조회·질문 답변은 승인 없이 가능하다.
- **커밋/푸시/PR은 명시적 지시가 있을 때만** 진행한다. 승인된 작업 범위 ≠ 커밋 승인.
- **`merge`, `rebase`, `git pull` 금지.** 병합은 GitHub Pull Request skill로만. `git pull --ff-only`만 허용.
- `git reset --hard`, `git checkout -- <file>`, force push 같은 파괴적 명령 금지.
- 브랜치는 `codex/` 접두사 (예: `codex/fix-telegram-webhook`).
- 커밋 메시지는 Conventional Commits, **PR 제목·본문은 한국어**이며 `변경 요약` / `검증` / `참고 사항` 3개 섹션을 포함한다.
- `git add .` 대신 필요한 파일만 명시적으로 스테이징한다.
- **새 패키지는 명시적 승인 없이 추가하지 않는다.**

## 명령어

```bash
npm install            # 의존성 설치
npm run dev            # wrangler dev (로컬 개발 서버)
npm run deploy         # wrangler deploy (프로덕션 배포)
npm run tail           # wrangler tail (실시간 로그)
npx tsc --noEmit       # 타입 체크 — 이 저장소의 유일한 자동 검증 수단
```

테스트 프레임워크와 린터는 없다. 코드 변경 후 검증은 `npx tsc --noEmit` + 수동 엔드포인트 호출이다.

### 수동 검증 엔드포인트

배포된 Worker(또는 `npm run dev` 로컬 서버)에 GET 요청을 보내면 실제 텔레그램 발송이 일어난다:

- `GET /test` — 일일 브리핑 즉시 발송
- `GET /test-scheduled` — Cron과 동일한 발송 로직을 수동 실행

텔레그램 명령어 `now`도 같은 브리핑을 호출한다.

### 시크릿

`.env`는 gitignore 대상이고, 실제 런타임 값은 Wrangler Secret으로 관리한다:

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN   # 필수
npx wrangler secret put TELEGRAM_CHAT_ID     # 필수 (그룹은 - 로 시작)
npx wrangler secret put FINNHUB_API_KEY      # ?검색어 기능용
```

## 아키텍처

Cloudflare Workers 단일 워커. 빌드 스텝 없이 `src/index.ts`를 wrangler가 직접 번들한다. 외부 런타임 의존성이 0개이며(devDependencies만 존재), 모든 데이터는 `fetch`로 가져온다.

**진입점은 두 개**이고 둘 다 [src/index.ts](src/index.ts)에 있다:

1. `fetch` — 텔레그램 웹훅(POST) + 테스트 엔드포인트(GET)
2. `scheduled` — Cron 트리거. 실제 작업은 `ctx.waitUntil()`로 감싼다.

두 진입점 모두 `sendDailyBriefing()`이라는 하나의 오케스트레이션 함수를 공유한다. 브리핑 로직을 바꾸면 Cron·`/test`·`/test-scheduled`·`now` 네 경로에 동시에 반영된다.

### 모듈 경계

| 파일 | 책임 |
|------|------|
| [src/index.ts](src/index.ts) | 라우팅, 명령어 분기, 오케스트레이션, 에러 처리 |
| [src/scraper.ts](src/scraper.ts) | 네이버 금융 / Finnhub 데이터 조회 및 정규화 |
| [src/chart.ts](src/chart.ts) | 네이버 시계열 조회 → QuickChart.io URL 생성 |
| [src/telegram.ts](src/telegram.ts) | Telegram Bot API 호출, 재시도, HTML 메시지 포맷팅 |

데이터는 항상 `scraper.ts`의 정규화 타입(`MarketSummaryItem`, `ChangeInfo`, `GlobalMarketData`)을 통해 `telegram.ts`로 넘어간다. 새 시세를 추가할 때는 raw API 응답을 `telegram.ts`까지 들고 가지 말고 `scraper.ts`에서 이 타입으로 변환한다.

### 명령어 분기 순서 (src/index.ts `fetch`)

`now` → `?`로 시작하는 Finnhub 검색 → `parseCommand()`의 정적 매핑. **매칭되지 않는 메시지는 조용히 무시**하고 200을 반환한다(그룹 채팅에서 잡담에 반응하지 않기 위함). 웹훅 에러도 항상 200을 반환한다 — 텔레그램 재시도를 막기 위한 의도된 동작이다.

새 시세 명령어를 추가하려면 `scraper.ts`의 `MarketType`, `commandMap`, `marketNames`, `fetchers` 네 곳을 함께 갱신해야 한다.

### 응답 채팅방 규칙

웹훅 처리 시 응답은 **메시지가 온 채팅방**(`message.chat.id`)으로 보낸다. `TELEGRAM_CHAT_ID`는 Cron 브리핑의 기본 대상일 뿐이다. `TelegramBot`의 메서드들은 모두 마지막에 optional `chatId`를 받아 기본값을 덮어쓴다.

## 도메인 지식 / 함정

**네이버 API는 비공개 엔드포인트다.** 언제든 스키마가 바뀔 수 있으므로 모든 fetcher는 실패 시 예외를 던지지 않고 `{ value: null }` 또는 `[]`을 반환하고 `console.error`만 남긴다. 이 방어적 패턴을 유지한다 — 시세 하나가 실패해도 나머지 브리핑은 발송된다.

**변동 방향 코드**: 네이버는 `compareToPreviousPrice.code` / `fluctuationsType.code`에 `"2"`=상승, `"5"`=하락, `"3"`=보합을 쓴다. `codeToDirection()`이 이 변환을 담당한다.

**환율은 단일 엔드포인트에서 전량 조회**된다. `getExchangeData()`가 모듈 전역 변수로 60초 캐싱하며, `getUsd()` 등은 그 결과에서 통화 코드를 골라내는 얇은 래퍼다. 캐시는 Worker isolate 단위이므로 인스턴스 간 공유되지 않는다.

**Cron은 UTC로 평가된다.** 현재 `crons = ["0 8 * * mon-fri"]`는 KST 17:00이다. 미국 시장 시각 기준 작업을 추가할 때는 DST 때문에 UTC 후보 시각을 두 개 등록하고, `event.scheduledTime`을 `America/New_York`으로 변환해 코드에서 가드해야 중복 발송을 막을 수 있다.

**Finnhub는 지수에 취약하다.** `^IXIC`는 CFD 구독이 필요하고 `.IXIC`/`IXIC`는 0값을 반환하며 candle API는 403이다. 나스닥 지수는 Finnhub 대신 네이버 엔드포인트를 쓴다. `?검색어` 조회는 직접 심볼 후보(`buildDirectSymbolCandidates`) → `/search` 스코어링 → `/quote` + `/stock/profile2` 순으로 폴백한다.

**메시지는 `sendRichMessage`로 보낸다.** 표준 `sendMessage`(HTML parse_mode)와 별개로, `rich_message.html`에 `<table bordered striped>`, `<h2>`, `<caption>`, `<hr/>` 같은 태그를 담는 방식이다. 사용자 입력이나 API 값은 반드시 `escapeHtml()`을 통과시킨다.

**Telegram API 호출은 자동 재시도된다.** `callApi()`가 5xx / 비-JSON 응답 / fetch 실패에 대해 최대 4회 시도(선형 백오프 500ms×attempt)한다. 개별 메서드에서 재시도를 다시 구현하지 않는다.

## 데이터 소스

- 국내 지수: `polling.finance.naver.com/api/realtime/domestic/index/{KOSPI,KOSDAQ}`
- 나스닥: `polling.finance.naver.com/api/realtime/worldstock/index/.IXIC`
- 환율: `m.stock.naver.com/front-api/marketIndex/exchange/new`
- 차트 시계열: `api.stock.naver.com/chart/domestic/index/KOSPI`, `m.stock.naver.com/front-api/marketIndex/prices`
- 전세계 종목/지수/가상화폐: Finnhub `/search`, `/quote`, `/stock/profile2`
- 차트 이미지 렌더링: QuickChart.io (URL 파라미터에 Chart.js config를 인코딩)

## tasks/

`tasks/<YYMMDD-slug>/task.md`에 구현 전 작업 계획 문서를 둔다. API 검증 결과·거절된 대안·리스크가 기록되어 있어, 관련 기능을 건드릴 때 먼저 확인하면 이미 검증된 내용을 재조사하지 않을 수 있다.
