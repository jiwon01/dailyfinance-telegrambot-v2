# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

이 파일은 이 저장소의 **작업 규칙과 프로젝트 가이드의 단일 출처**다. [AGENTS.md](AGENTS.md)는 이 파일을 가리키는 포인터일 뿐이며 별도 규칙을 두지 않는다.

## 작업 규칙

### 작업 진행 원칙

- 사용자가 작업을 지시하면 먼저 작업 계획을 작성한다.
- 작업 계획에는 목표, 변경 범위, 예상 수정 파일, 검증 방법을 포함한다.
- 사용자의 승인 사인을 받은 뒤 실제 파일 수정과 필요한 명령 실행을 진행한다.
- 승인된 작업 범위를 벗어나는 추가 작업이나 수정이 필요하면, 새 작업 계획을 작성하고 다시 승인을 받는다.
- 작업 완료 후 후속 작업을 진행하거나 추가 수정을 하려면, 반드시 별도 승인을 받는다.
- 커밋과 푸시는 작업 승인과 별개이며, 사용자가 명시적으로 지시한 경우에만 진행한다.
- 승인 전에는 코드나 문서를 변경하지 않는다.
- 단순 질문 답변, 현재 상태 확인, 파일 내용 조회처럼 변경이 없는 작업은 계획 승인 없이 수행할 수 있다.

### 작업 계획 문서

- 계획 문서는 `tasks/<YYMMDD-slug>/task.md`에 둔다. 필요하면 열람용 `task.html`을 함께 만든다.
- `tasks/`는 `.gitignore` 대상인 **로컬 전용 문서**다. 커밋하지 않는다.
- 구현이 끝난 뒤에도 삭제하지 않는다. 검증한 API 응답, 거절한 대안과 그 이유가 남아 재조사를 막아준다.
- 관련 기능을 수정할 때는 해당 `task.md`가 로컬에 있는지 먼저 확인한다.

### Git 작업 원칙

- 작업을 시작하기 전에 `git status --short --branch`로 현재 브랜치와 변경사항을 확인한다.
- 작업을 시작하기 전에 `git fetch`로 origin에 새 작업 내용이 있는지 확인한다.
- 사용자가 만든 변경사항을 임의로 되돌리거나 덮어쓰지 않는다.
- 작업 범위와 무관한 변경사항은 그대로 둔다.
- 이미 수정된 파일을 함께 건드려야 한다면, 먼저 기존 변경 의도를 파악한 뒤 그 위에 최소한으로 수정한다.
- `git reset --hard`, `git checkout -- <file>`, 강제 push 같은 파괴적 명령은 사용하지 않는다.

### 브랜치

- 새 작업을 시작할 때는 가능하면 전용 브랜치를 만든다.
- 브랜치 접두사는 Commit Convention의 타입을 그대로 쓴다: `feat/`, `fix/`, `refactor/`, `perf/`, `docs/`, `test/`, `chore/`.
- 접두사 뒤에는 작업 내용을 짧고 구체적으로 쓴다.
- 예: `feat/nasdaq-close-status`, `fix/telegram-webhook`, `docs/update-claude-md`, `chore/gitignore-tasks`

### 커밋

- 커밋과 푸시는 작업 승인 여부와 별개로 사용자가 명시적으로 지시한 경우에만 진행한다.
- 사용자가 커밋 메시지를 요청하면 Conventional Commits 형식으로 제안한다.
- 커밋 전에는 `git diff` 또는 `git diff --stat`으로 변경 범위를 확인한다.
- 커밋에는 현재 작업과 직접 관련된 파일만 포함한다.
- 사용자 변경사항과 에이전트 변경사항이 섞여 있으면, 스테이징 전에 반드시 구분한다.
- 제목은 변경 의도를 짧고 명확하게 쓰고, 자세한 내용은 본문에 쓴다.

### Commit Convention

Conventional Commits 형식을 사용한다.

- `feat`: 새로운 기능 추가
- `fix`: 버그 수정
- `refactor`: 기능 변경 없는 코드 개선
- `perf`: 성능 개선
- `docs`: 문서 수정
- `test`: 테스트 추가/수정
- `chore`: 기타 작업(설정, 의존성 업데이트 등)

규칙:

- **커밋 메시지는 제목과 본문 모두 한국어로 작성한다.**
- **scope는 사용하지 않는다.** `feat(scraper):`가 아니라 `feat:` 형태를 유지한다.
- **본문에는 어떤 내용이 변경되었는지 자세히 작성한다.** 제목은 의도를, 본문은 실제 변경 내용을 담는다. 파일이나 함수 단위로 무엇을 어떻게 바꿨는지 알 수 있게 쓴다.
- **`Co-Authored-By` 같은 트레일러는 남기지 않는다.** 에이전트가 만든 커밋에도 붙이지 않는다.

예시:

```
feat: 나스닥 장마감 현황 알림 추가

- scraper.ts에 getNasdaqCloseStatus, getNasdaqRecentPrices 추가
- chart.ts에 30거래일 차트 URL 생성 함수 추가, generateChartUrl에 기간 라벨 인자 추가
- telegram.ts에 장마감 현황 리치 메시지 포맷터 추가
- index.ts에 America/New_York 16:10 가드와 /test-nasdaq-close 엔드포인트 추가
- wrangler.toml에 DST 대응 cron 후보 2개 등록
```

제목만으로 충분한 사소한 변경(오타 수정 등)은 본문을 생략할 수 있다.

### 스테이징

- `git add .`는 피하고, 필요한 파일을 명시적으로 스테이징한다.
- 문서만 바꾼 작업은 코드 파일을 함께 스테이징하지 않는다.
- 코드 변경과 문서 변경이 서로 독립적이면 별도 커밋으로 나눌 수 있는지 검토한다.

### Pull Request

- PR 생성은 사용자가 명시적으로 요청한 경우에만 진행한다.
- PR 제목과 본문은 반드시 한국어로 작성한다.
- PR 제목은 변경 의도를 한 문장으로 짧고 명확하게 표현한다.
- PR 제목에는 가능하면 Conventional Commits 타입을 포함한다.
- PR 제목은 구현 세부사항보다 사용자 관점의 변경 의도를 우선한다.
- `수정`, `업데이트`, `버그 수정`, `코드 정리`처럼 범위가 모호한 제목은 피한다.
- Draft PR과 Ready PR 여부는 사용자의 지시에 따른다. 명시하지 않은 경우 Draft로 생성할지 먼저 확인한다.

PR 본문에는 최소한 다음 항목을 포함한다.

```md
## 변경 요약

-

## 검증

-

## 참고 사항

-
```

- `변경 요약`에는 실제 변경한 내용을 2~5개 bullet로 작성한다.
- `검증`에는 실행한 검증 명령과 결과를 적는다. 실행하지 않았다면 `미실행`이라고 쓰고 이유를 함께 적는다.
- `참고 사항`에는 리뷰어가 알아야 할 제약, 남은 이슈, 후속 작업, 의도적으로 제외한 작업을 적는다. 없으면 `없음`이라고 쓴다.
- PR 본문에 변경하지 않은 내용을 포함하지 않는다.
- 실패한 검증이 있으면 실패 내용을 숨기지 않고 적는다.

### 의존성

- 새 패키지는 사용자의 명시적 승인 없이 추가하지 않는다.
- 기존 표준 라이브러리나 이미 설치된 패키지를 우선 사용한다.
- 의존성 추가가 필요하면 이유, 대안, 영향 범위를 작업 계획에 포함한다.

### 검증 원칙

- 이 저장소의 자동 검증 수단은 `npx tsc --noEmit` 하나뿐이다. 테스트 프레임워크와 린터는 없다.
- 코드 변경 후에는 타입 체크를 실행하고 결과를 보고한다.
- 검증을 실행하지 못하면 그 이유를 보고한다.
- 검증이 실패하면 실패 결과를 숨기지 않고 그대로 공유한다.
- 테스트 엔드포인트 호출은 **실제 텔레그램 발송을 일으킨다.** 사용자 승인 없이 호출하지 않는다.

### 동기화

- `merge`는 수행하지 않는다. 병합이 필요한 경우 반드시 GitHub Pull Request skill을 이용한다.
- `rebase`는 수행하지 않는다.
- `git pull`은 merge 또는 rebase를 유발할 수 있으므로 사용하지 않는다.
- 단, fast-forward만 허용하는 `git pull --ff-only`는 사용할 수 있다.
- 원격 확인은 `git fetch`를 사용하고, 로컬 브랜치 변경은 사용자의 명시적 요청 없이는 통합하지 않는다.
- 충돌이 예상되거나 원격 변경사항과 작업 범위가 겹치면 사용자에게 상황과 선택지를 명확히 알린다.

### 완료 보고

- 작업을 마칠 때 현재 브랜치, 변경 파일, 변경 요약, 검증 여부, 남은 이슈를 포함한다.
- 하지 않은 작업도 명확히 말한다. 예: 커밋 안 함, 푸시 안 함, 테스트 미실행.

## 명령어

```bash
npm install            # 의존성 설치
npm run dev            # wrangler dev (로컬 개발 서버)
npm run deploy         # wrangler deploy (프로덕션 배포)
npm run tail           # wrangler tail (실시간 로그)
npx tsc --noEmit       # 타입 체크 — 이 저장소의 유일한 자동 검증 수단
```

### 수동 검증 엔드포인트

배포된 Worker(또는 `npm run dev` 로컬 서버)에 GET 요청을 보내면 **실제 텔레그램 발송이 일어난다**:

- `GET /test` — 일일 브리핑 즉시 발송
- `GET /test-scheduled` — `/test`와 동일한 로직. Cron 경로 수동 실행용 별칭
- `GET /test-nasdaq-close` — 나스닥 장마감 현황 + 30거래일 차트 발송

텔레그램 명령어 `now`도 일일 브리핑을 호출한다. 나스닥 장마감 현황에는 대응하는 채팅 명령어가 없다.

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

**오케스트레이션 함수는 두 개**이고, 모든 진입점이 이 둘 중 하나로 수렴한다:

| 함수 | 호출 경로 |
|------|-----------|
| `sendDailyBriefing()` | 일일 Cron, `/test`, `/test-scheduled`, 채팅 명령어 `now` |
| `sendNasdaqCloseStatus()` | 나스닥 Cron, `/test-nasdaq-close` |

발송 로직을 바꾸면 해당 함수를 공유하는 모든 경로에 동시에 반영된다.

### 모듈 경계

| 파일 | 책임 |
|------|------|
| [src/index.ts](src/index.ts) | 라우팅, 명령어 분기, Cron 디스패치, 오케스트레이션, 에러 처리 |
| [src/scraper.ts](src/scraper.ts) | 네이버 금융 / Finnhub 데이터 조회 및 정규화 |
| [src/chart.ts](src/chart.ts) | 시계열 데이터 → QuickChart.io URL 생성 |
| [src/telegram.ts](src/telegram.ts) | Telegram Bot API 호출, 재시도, HTML 메시지 포맷팅 |

데이터는 항상 `scraper.ts`의 정규화 타입(`MarketSummaryItem`, `ChangeInfo`, `NasdaqCloseStatus`, `GlobalMarketData`)을 통해 `telegram.ts`로 넘어간다. 새 시세를 추가할 때는 raw API 응답을 `telegram.ts`까지 들고 가지 말고 `scraper.ts`에서 이 타입으로 변환한다.

`chart.ts`의 데이터 조회 위치는 일관되지 않다. 코스피·USD는 `chart.ts`가 직접 fetch하지만, 나스닥 30거래일 데이터는 `scraper.ts`의 `getNasdaqRecentPrices()`를 import해서 쓴다(`chart.ts` → `scraper.ts` 단방향 의존). 새 차트를 추가할 때는 조회를 `scraper.ts`에 두는 후자 방식을 따른다.

### Cron 디스패치 — 상수 동기화 주의

`scheduled` 핸들러는 `event.cron` **문자열을 그대로 비교**해서 어떤 작업인지 판별한다:

```ts
const DAILY_BRIEFING_CRON = '0 8 * * mon-fri';
const NASDAQ_CLOSE_STATUS_CRONS = new Set(['10 20 * * mon-fri', '10 21 * * mon-fri']);
```

**[wrangler.toml](wrangler.toml)의 `crons` 배열과 이 상수가 문자열 단위로 일치해야 한다.** 한쪽만 바꾸면 `getScheduledJobType()`이 `'unknown'`을 반환하고 해당 Cron은 경고 로그만 남기고 조용히 스킵된다. Cron을 추가·수정할 때 두 파일을 반드시 함께 갱신한다.

### DST 가드

Cloudflare Cron은 UTC로만 평가된다. 나스닥 정규장 마감 10분 후(America/New_York 16:10)는 미국 DST에 따라 UTC 20:10 또는 21:10이므로, **후보 두 개를 모두 등록하고 코드에서 하나를 버린다**:

- `isNasdaqCloseReportTime(event.scheduledTime)`가 `Intl.DateTimeFormat`으로 `America/New_York` 기준 요일·시·분을 구해 16:10이 아니면 스킵한다.
- 주말(`Sat`/`Sun`)도 여기서 걸러낸다.

미국 시장 기준 작업을 추가할 때는 이 패턴을 따른다. Cron 표현식만 늘리면 DST 기간에 중복 발송된다.

### 명령어 분기 순서 (src/index.ts `fetch`)

`now` → `?`로 시작하는 Finnhub 검색 → `parseCommand()`의 정적 매핑. **매칭되지 않는 메시지는 조용히 무시**하고 200을 반환한다(그룹 채팅에서 잡담에 반응하지 않기 위함). 웹훅 에러도 항상 200을 반환한다 — 텔레그램 재시도를 막기 위한 의도된 동작이다.

새 시세 명령어를 추가하려면 `scraper.ts`의 `MarketType`, `commandMap`, `marketNames`, `fetchers` 네 곳을 함께 갱신해야 한다.

### 응답 채팅방 규칙

웹훅 처리 시 응답은 **메시지가 온 채팅방**(`message.chat.id`)으로 보낸다. `TELEGRAM_CHAT_ID`는 Cron 발송의 기본 대상일 뿐이다. `TelegramBot`의 메서드들은 모두 마지막에 optional `chatId`를 받아 기본값을 덮어쓴다.

## 도메인 지식 / 함정

**네이버 API는 비공개 엔드포인트다.** 언제든 스키마가 바뀔 수 있으므로 모든 fetcher는 실패 시 예외를 던지지 않고 `{ value: null }` / `null` / `[]`을 반환하고 `console.error`만 남긴다. 이 방어적 패턴을 유지한다 — 시세 하나가 실패해도 나머지 브리핑은 발송된다.

**단, `sendNasdaqCloseStatus()`는 의도적으로 비대칭이다.** 차트 생성 실패는 경고만 남기고 넘어가지만, 현황 조회가 실패하면 `throw`한다. 잘못된 시세를 발송하는 것보다 발송하지 않는 편이 낫다는 판단이다. 차트는 이미 발송된 뒤에 throw될 수 있다.

**나스닥은 엔드포인트가 세 갈래다.** 목적에 따라 다른 API를 쓰므로 혼동하지 않도록 주의한다:

- 채팅 명령어 `나스닥` → `getNasdaq()` → `polling.finance.naver.com/api/realtime/worldstock/index/.IXIC`
- 장마감 현황 → `getNasdaqCloseStatus()` → `stock.naver.com/api/polling/worldstock/index?reutersCodes=.IXIC`
- 30거래일 차트 → `getNasdaqRecentPrices()` → `stock.naver.com/api/securityService/index/.IXIC/price?page=1&pageSize=30` (최신순 반환이므로 `reverse()` 필요, `closePrice`는 쉼표 포함 문자열)

**변동 방향 코드**: 네이버는 `compareToPreviousPrice.code` / `fluctuationsType.code`에 `"2"`=상승, `"5"`=하락, `"3"`=보합을 쓴다. `codeToDirection()`이 이 변환을 담당한다.

**`marketStatus` 코드**: `OPEN`/`PREOPEN`/`CLOSE` → `장중`/`개장전`/`장마감`. `formatMarketStatus()`가 변환하며 알 수 없는 값은 원문 또는 `확인 불가`로 표시한다.

**`localTradedAt`을 메시지에 노출한다.** 미국 휴장일에는 API가 당일이 아닌 직전 거래일 데이터를 반환하므로, 사용자가 데이터 시점을 직접 확인할 수 있어야 한다.

**환율은 단일 엔드포인트에서 전량 조회**된다. `getExchangeData()`가 모듈 전역 변수로 60초 캐싱하며, `getUsd()` 등은 그 결과에서 통화 코드를 골라내는 얇은 래퍼다. 캐시는 Worker isolate 단위이므로 인스턴스 간 공유되지 않는다.

**Finnhub는 지수에 취약하다.** `^IXIC`는 CFD 구독이 필요하고 `.IXIC`/`IXIC`는 0값을 반환하며 candle API는 403이다. 그래서 나스닥 지수는 Finnhub 대신 네이버를 쓴다. `?검색어` 조회는 직접 심볼 후보(`buildDirectSymbolCandidates`) → `/search` 스코어링 → `/quote` + `/stock/profile2` 순으로 폴백한다.

**메시지는 `sendRichMessage`로 보낸다.** 표준 `sendMessage`(HTML parse_mode)와 별개로, `rich_message.html`에 `<table bordered striped>`, `<h2>`, `<caption>`, `<hr/>` 같은 태그를 담는 방식이다. 사용자 입력이나 API 값은 반드시 `escapeHtml()`을 통과시킨다. 에러 안내 같은 평문 메시지만 `sendMessage`를 쓴다.

**Telegram API 호출은 자동 재시도된다.** `callApi()`가 5xx / 비-JSON 응답 / fetch 실패에 대해 최대 4회 시도(선형 백오프 500ms×attempt)한다. 개별 메서드에서 재시도를 다시 구현하지 않는다.

**`generateChartUrl()`은 기간 라벨을 인자로 받는다.** 기본값이 `'최근 7일'`이므로 다른 기간의 차트를 추가할 때 네 번째 인자를 넘기지 않으면 제목이 틀린다. y축 패딩은 `Math.max(범위*0.15, 최대값*0.01, 1)`로, 변동이 거의 없는 시계열에서도 선이 납작해지지 않게 하한을 둔다.

## 데이터 소스

- 국내 지수: `polling.finance.naver.com/api/realtime/domestic/index/{KOSPI,KOSDAQ}`
- 환율: `m.stock.naver.com/front-api/marketIndex/exchange/new`
- 나스닥: 위 "나스닥은 엔드포인트가 세 갈래다" 참고
- 차트 시계열(코스피/USD): `api.stock.naver.com/chart/domestic/index/KOSPI`, `m.stock.naver.com/front-api/marketIndex/prices`
- 전세계 종목/지수/가상화폐: Finnhub `/search`, `/quote`, `/stock/profile2`
- 차트 이미지 렌더링: QuickChart.io (URL 파라미터에 Chart.js config를 인코딩)
