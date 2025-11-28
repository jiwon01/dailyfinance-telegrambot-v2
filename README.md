# Daily Finance Telegram Bot

Cloudflare Workers를 이용한 일일 금융 시장 정보 텔레그램 봇입니다.

## 기능

- **자동 알림**: 매일 평일 오전 9시(KST)에 일일 시장 상황 자동 전송
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
| 금 | `금`, `gold`, `GOLD` |

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

## 프로젝트 구조

```
├── src/
│   ├── index.ts      # 메인 워커 (HTTP/Cron 핸들러)
│   ├── scraper.ts    # 네이버 금융 스크래핑 모듈
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

## 스케줄 설정

`wrangler.toml`의 `[triggers]` 섹션에서 Cron 표현식을 수정할 수 있습니다:

```toml
[triggers]
crons = ["0 0 * * 1-5"]  # 평일 UTC 00:00 (KST 09:00)
```

## 라이센스

MIT

