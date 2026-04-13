# Pocket AI

**PC의 AI CLI를 어디서든 원격 제어하세요 — 폰, 태블릿, 다른 PC에서**

모든 통신은 AES-256-GCM E2E 암호화. 서버는 내용을 볼 수 없습니다.

[English](../README.md)

---

## 셋업

Claude Code 사용자라면 아래 프롬프트를 복사해서 Claude Code에 붙여넣으세요.

### 로컬 셋업 (같은 WiFi에서 사용)

> 아래 프롬프트를 Claude Code에 붙여넣기:

```
이 프로젝트(Pocket AI)를 로컬에 셋업해줘.

1. `npm install` 실행
2. `npm run dev` 실행
3. 콘솔에 출력되는 Setup Token을 알려줘
4. 서버: localhost:9741, PWA: localhost:9742 로 접속 가능

완료되면 Setup Token과 접속 URL을 정리해서 알려줘.
```

끝입니다. `localhost:9742`에 접속해서 토큰을 입력하면 바로 사용할 수 있습니다.

### 외부 접속 셋업 (어디서든 폰으로 접속)

같은 WiFi가 아닌 곳에서도 사용하려면 릴레이 서버를 클라우드에 배포해야 합니다.

> 아래 프롬프트를 Claude Code에 붙여넣기:

```
Pocket AI 릴레이 서버를 Railway에 배포해줘.

1. railway CLI가 없으면 `npm install -g @railway/cli` 로 설치
2. `railway login` 으로 로그인 (브라우저가 열림)
3. `railway new` 로 프로젝트 생성
4. apps/server 디렉토리를 배포
5. 환경변수 설정:
   - JWT_SECRET: 랜덤 생성 (openssl rand -base64 32)
   - AUTH_MODE: single
   - AUTH_TOKEN: 내가 기억할 수 있는 토큰 하나 만들어줘
   - PORT: 9741
6. 배포 완료되면 Railway URL을 알려줘
7. 로컬 apps/pwa/.env 에 NEXT_PUBLIC_API_URL을 배포된 URL로 설정
8. `npm run dev` 로 PWA만 로컬 실행하거나 Vercel에 배포

최종적으로 접속 URL과 Setup Token을 정리해줘.
```

> Railway 대신 Fly.io를 쓰고 싶다면 프롬프트에서 "Railway" 를 "Fly.io" 로 바꾸면 됩니다.

---

## 사용법

### CLI 실행

```bash
npm install -g @pocket-ai/cli

pocket-ai login --token <Setup Token>   # 로그인
pocket-ai                                # Claude Code 실행 + 원격 대기
pocket-ai start codex                    # Codex 사용
pocket-ai start gemini                   # Gemini 사용
pocket-ai start --cmd "aider"            # 커스텀 CLI
```

### PWA 접속

`localhost:9742` (로컬) 또는 배포된 URL에 접속 → Setup Token 입력 → 활성 세션 선택 → 사용

---

## 주요 기능

- **멀티모델 오케스트레이션**: Claude가 Gemini, Codex, Aider를 워커로 활용
- **E2E 암호화**: AES-256-GCM, 서버는 평문을 절대 볼 수 없음
- **로컬 이력 복원**: 대화 이력은 PC에만 저장, 재연결 시 자동 전송
- **권한 프롬프트 제어**: 파일 수정/명령 실행 권한을 폰에서 승인/거부
- **도구 뷰**: Edit Diff, Bash 출력, 코드 하이라이팅, 워커 진행 상태

---

## 아키텍처

```
PWA (브라우저/폰) ←→ Relay Server (Socket.IO) ←→ CLI (내 PC)
                     E2E 암호화 중계만               │
                     메시지 저장 안 함          ┌─────▼──────┐
                                               │ Claude Code│
                                               │ Codex CLI  │
                                               │ Gemini CLI │
                                               │ 커스텀 CLI  │
                                               └────────────┘
```

**Pure Relay**: 서버는 암호화된 메시지를 중계만 합니다. 메시지 내용, 암호화 키 모두 서버에 저장되지 않습니다.

---

## 수동 셋업 (Claude Code 없이)

```bash
git clone https://github.com/iops-leo/pocket-ai
cd pocket-ai
npm install        # 의존성 + wire 패키지 자동 빌드
npm run dev        # .env 자동 생성 → 마이그레이션 → 서버 + PWA 시작
```

서버 콘솔에 Setup Token이 출력됩니다. `localhost:9742`에서 토큰을 입력하세요.

### 환경변수 (선택)

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `AUTH_MODE` | `single` | `single`: 토큰 인증, `github`: GitHub OAuth |
| `AUTH_TOKEN` | 자동 생성 | 고정 토큰 (미설정 시 매 실행마다 새로 생성) |
| `JWT_SECRET` | 자동 생성 | JWT 서명 키 |
| `DATABASE_PATH` | `./data/pocket-ai.db` | SQLite DB 파일 경로 |
| `PORT` | `9741` | 서버 포트 |

---

## 패키지 구조

```
pocket-ai/
├── apps/
│   ├── server/    # Fastify + Socket.IO 릴레이
│   └── pwa/       # Next.js PWA
├── packages/
│   ├── cli/       # pocket-ai CLI
│   └── wire/      # 공유 타입 + 암호화 유틸
└── docs/
```

---

## 라이선스

MIT License
