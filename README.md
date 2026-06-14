# Daily Finance Telegram Bot

Cloudflare Workers를 이용한 일일 금융 시장 정보 텔레그램 봇입니다.

## 기능

- **자동 알림**: 매일 평일 오후 5시(KST)에 일일 시장 상황 자동 전송
- **나스닥 장마감 알림**: 나스닥 정규장 종료 10분 후 현황과 최근 30거래일 차트 자동 전송
- **수동 조회**: 텔레그램 명령어로 개별 시세 조회

### 지원 시세 정보

| 시세 | 명령어 |
|------|--------|
| 코스피 | `코스피`, `kospi`, `KOSPI` |
| 코스닥 | `코스닥`, `kosdaq`, `KOSDAQ` |
| 나스닥 | `나스닥`, `nasdaq`, `NASDAQ` |
| 달러 | `달러`, `usd`, `USD` |
| 엔화 | `엔화`, `엔`, `jpy`, `JPY` |
| 유로 | `유로`, `eur`, `EUR` |
| 파운드 | `파운드`, `gbp`, `GBP` |
| 스위스프랑 | `스위스프랑`, `프랑`, `chf`, `CHF` |
| 위안 | `위안`, `중국`, `cny`, `CNY` |

### 특수 명령어

| 명령어 | 설명 |
|--------|------|
| `now` | 차트 이미지와 함께 일일 브리핑 즉시 발송 |
| `?검색어` | Finnhub 기반 전세계 주식/지수/가상화폐 조회 (예: `?AAPL`, `?^GSPC`, `?BTC-USD`) |

## 설치 및 배포

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경변수 설정

민감한 정보는 Wrangler Secret으로 관리합니다:

```bash
# 텔레그램 봇 토큰 설정
npx wrangler secret put TELEGRAM_BOT_TOKEN

# 텔레그램 채팅 ID 설정 (그룹 채팅 ID는 -로 시작)
npx wrangler secret put TELEGRAM_CHAT_ID

# Finnhub API 키 설정
npx wrangler secret put FINNHUB_API_KEY
```

### 3. 배포

```bash
npm run deploy
```

### 4. 텔레그램 웹훅 설정

배포 후 웹훅을 설정합니다:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://dailyfinance-telegrambot.<YOUR_SUBDOMAIN>.workers.dev"}'
```

## 개발

### 로컬 개발 서버 실행

```bash
npm run dev
```

### 로그 확인

```bash
npm run tail
```

### 테스트 엔드포인트

배포된 Worker에 `GET /test` 요청을 보내면 일일 브리핑을 즉시 발송합니다:

```bash
curl https://dailyfinance-telegrambot.<YOUR_SUBDOMAIN>.workers.dev/test
```

나스닥 장마감 현황 알림은 `GET /test-nasdaq-close` 요청으로 즉시 발송 테스트할 수 있습니다:

```bash
curl https://dailyfinance-telegrambot.<YOUR_SUBDOMAIN>.workers.dev/test-nasdaq-close
```

## 프로젝트 구조

```
├── src/
│   ├── index.ts      # 메인 워커 (HTTP/Cron 핸들러)
│   ├── scraper.ts    # 네이버 금융 API 스크래핑 모듈
│   ├── chart.ts      # 차트 이미지 생성 모듈 (QuickChart.io)
│   └── telegram.ts   # 텔레그램 API 모듈
├── wrangler.toml     # Cloudflare Workers 설정
├── tsconfig.json     # TypeScript 설정
└── package.json
```

## 환경변수

| 변수명 | 설명 | 필수 |
|--------|------|------|
| `TELEGRAM_BOT_TOKEN` | 텔레그램 봇 토큰 (@BotFather에서 발급) | ✅ |
| `TELEGRAM_CHAT_ID` | 메시지를 받을 채팅 ID | ✅ |
| `FINNHUB_API_KEY` | Finnhub API 키 | ✅ (`?검색어` 기능 사용 시) |

## 스케줄 설정

`wrangler.toml`의 `[triggers]` 섹션에서 Cron 표현식을 수정할 수 있습니다:

```toml
[triggers]
crons = [
  "0 8 * * mon-fri",       # 평일 UTC 08:00 (KST 17:00)
  "10 20 * * mon-fri",    # 나스닥 장마감 10분 후 후보 시간 (미국 DST)
  "10 21 * * mon-fri"     # 나스닥 장마감 10분 후 후보 시간 (미국 표준시)
]
```

나스닥 장마감 알림은 Cloudflare Cron의 UTC 기준 한계를 고려해 UTC 20:10/21:10 후보를 모두 등록하고, 코드에서 `America/New_York` 기준 16:10일 때만 발송합니다.

## 데이터 소스

- **주가 지수**: 네이버 금융 API
- **환율**: 네이버 금융 API  
- **나스닥 장마감 현황/30거래일 차트**: 네이버 증권 API (`stock.naver.com/api/polling/worldstock/index`, `stock.naver.com/api/securityService/index/.IXIC/price`)
- **전세계 주식/지수/가상화폐 검색**: Finnhub API (`/search`, `/quote`, `/stock/profile2`)
- **차트**: QuickChart.io

## 라이센스

MIT
