# Pocket AI

**PC의 AI CLI를 어디서든 — 모바일, 태블릿, 다른 컴퓨터에서 이어서 사용하세요**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PWA](https://img.shields.io/badge/PWA-pocket--ai--pwa.vercel.app-blue)](https://pocket-ai-pwa.vercel.app)

---

## 무엇인가요?

로컬 PC에서 실행 중인 **Claude Code / Codex / Gemini CLI** 세션을 웹/모바일 PWA로 원격 제어하는 플랫폼입니다.

- 집에서 시작한 코딩 작업을 카페에서 폰으로 이어서
- 터미널을 닫아도 백그라운드에서 AI가 계속 작업
- 모든 대화는 E2E 암호화 — 서버는 내용을 볼 수 없음
- **완전 무료, 오픈소스**

---

## 빠른 시작

### 1. CLI 설치 및 로그인

```bash
npm install -g @pocket-ai/cli
pocket-ai login          # GitHub OAuth 로그인 (최초 1회)
```

### 2. PC에서 세션 시작

```bash
pocket-ai                # Claude Code 실행 + 원격 대기
pocket-ai start codex    # Codex 사용
pocket-ai start gemini   # Gemini 사용
pocket-ai start --cmd "aider"  # 커스텀 CLI
```

### 3. PWA에서 접속

1. [pocket-ai-pwa.vercel.app](https://pocket-ai-pwa.vercel.app) 접속
2. GitHub OAuth 로그인 (CLI와 같은 계정)
3. 사이드바에서 활성 세션 클릭 → 자동 E2E 키교환 후 연결

---

## 주요 기능

### 멀티모델 오케스트레이션

Claude가 **오케스트레이터**로서 Gemini, Codex, Aider를 워커로 활용합니다.

```
Claude (conductor)
  ├── ask_gemini  → 분석/리서치 작업
  ├── ask_codex   → 코드 생성
  └── ask_aider   → 파일 편집 (diff 자동 적용)
```

- PWA 설정 패널에서 빌트인 워커 On/Off 토글
- 커스텀 워커 등록 (어떤 CLI든 추가 가능)
- 워커 실행 중 실시간 진행 상태 + 경과 타이머 표시

### 로컬 이력 자동 복원

대화 이력은 **PC 로컬**에 저장됩니다 (`~/.config/pocket-ai/sessions/`).

PWA가 재연결되면 CLI가 이력을 자동 전송 — 서버에는 아무것도 남지 않습니다.

### 권한 프롬프트 원격 제어

Claude Code가 파일 수정/명령 실행 권한을 요청할 때 PWA에서 **승인/거부** 가능.

### 풍부한 도구 뷰

| 도구 | 렌더링 |
|------|--------|
| **Edit** | Diff 뷰 (인라인 삭제/추가 하이라이팅) |
| **Write** | 녹색 추가 라인 표시 |
| **Bash** | `$` 프롬프트 + stdout/stderr 분리 |
| **Read** | 파일 확장자 기반 구문 하이라이팅 |
| **Grep** | 검색 패턴 + 매칭 결과 |
| **ask_\*** | 워커 전용 카드 (경과시간, Aider diff) |

---

## 아키텍처

```
┌──────────┐    Socket.IO     ┌──────────────┐    Socket.IO    ┌──────────────┐
│  PWA     │  + AES-256-GCM  │  Relay Server│ + AES-256-GCM  │  PC CLI      │
│ (Vercel) │◀───────────────▶│  (Railway)   │◀──────────────▶│ @pocket-ai   │
└──────────┘                 └──────────────┘                 └──────┬───────┘
                                                                      │
                                                               ┌──────▼───────┐
                                                               │ Claude Code  │
                                                               │ Codex CLI    │
                                                               │ Gemini CLI   │
                                                               │ 커스텀 CLI   │
                                                               └──────────────┘
```

**Pure Relay 원칙**: 서버는 암호화된 메시지를 중계만 할 뿐, 내용을 저장하거나 복호화하지 않습니다. 메시지 이력은 로컬 PC에만 저장됩니다.

---

## 지원 AI CLI

| CLI | 실행 방법 | 설치 |
|-----|-----------|------|
| Claude Code | `pocket-ai` | `npm i -g @anthropic-ai/claude-code` |
| OpenAI Codex | `pocket-ai start codex` | `npm i -g @openai/codex` |
| Google Gemini | `pocket-ai start gemini` | `npm i -g @google/gemini-cli` |
| 기타 CLI | `pocket-ai start --cmd "<바이너리>"` | 직접 설치 |

---

## 패키지 구조

```
pocket-ai/
├── apps/
│   ├── server/    # Fastify + Socket.IO 릴레이 (Railway)
│   └── pwa/       # Next.js PWA (Vercel)
├── packages/
│   ├── cli/       # pocket-ai CLI 바이너리
│   └── wire/      # 공유 타입 + AES-256-GCM 암호화
└── docs/
```

---

## 셀프호스팅

직접 서버를 띄우고 싶다면:

```bash
# 환경변수 설정
DATABASE_URL=...      # PostgreSQL
SESSION_SECRET=...
ALLOWED_ORIGINS=...

# 서버 실행
cd apps/server
npm install && npm start

# CLI에서 서버 지정
POCKET_AI_SERVER=https://your-server.com pocket-ai
```

---

## 개발 로드맵

### ✅ 완료
- CLI 래퍼 (Claude / Codex / Gemini / 커스텀 엔진)
- Socket.IO 릴레이 서버 (Pure Relay)
- ECDH P-256 + AES-256-GCM E2E 암호화
- GitHub OAuth 로그인
- PWA 듀얼페인 레이아웃 (사이드바 + 채팅)
- 도구별 전용 뷰 (Edit Diff, Bash, Read, Grep)
- 마크다운 렌더링 + 코드 하이라이팅
- 권한 프롬프트 원격 제어
- 멀티모델 오케스트레이션 (ask_gemini / ask_codex / ask_aider)
- 빌트인/커스텀 워커 UI + 영속화
- 로컬 이력 저장 + PWA 재연결 자동 복원
- 다국어 지원 (한국어/영어)

### 🔜 예정
- 푸시 알림
- Gemini REST API 직접 호출 (CLI 없이)
- 워커 병렬 실행
- 네이티브 앱 (Expo)

---

## 라이선스

MIT License
