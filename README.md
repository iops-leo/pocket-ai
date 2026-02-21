# Pocket AI

**어디서든 PC의 AI CLI 세션을 이어서 사용하세요**

모바일/웹 PWA에서 로컬 AI CLI 세션을 원격 제어하는 플랫폼입니다.

## 핵심 가치

- **세션 연속성**: 출퇴근길, 회의 중에도 PC 작업 이어서 진행
- **데몬 방식**: 터미널을 닫아도 백그라운드에서 세션 유지
- **비용 최적화**: 초기 무료~$8/월, 성장 후 사용량 기반 과금
- **간편한 설정**: GitHub OAuth 로그인 후 QR 코드 스캔으로 디바이스 페어링
- **E2E 암호화**: 서버는 암호화된 메시지만 중계 (복호화 불가)

## 아키텍처

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   PWA Client    │     │  Relay Server   │     │  PC CLI (daemon)│
│   (Vercel)      │────▶│  Fastify +      │◀────│  @pocket-ai/cli │
└─────────────────┘     │  Socket.IO      │     └─────────────────┘
        │               │  (Fly.io)       │             │
        │  Socket.IO    │                 │             ▼
        │  + E2E 암호화 │  PostgreSQL     │     ┌─────────────────┐
        │  (AES-256-GCM)│  (Prisma ORM)   │     │  Claude Code    │
        │               └─────────────────┘     │  Codex CLI      │
        │                                        │  Gemini CLI     │
        └────────────────────────────────────────┘ (확장 예정)
                                                └─────────────────┘

        ┌─────────────────┐
        │  Remote Agent   │
        │  @pocket-ai/    │
        │  agent          │  ← 다른 머신에서 세션 원격 제어
        └─────────────────┘
```

## 패키지 구조

```
pocket-ai/
├── apps/
│   ├── server/      # Fastify + Socket.IO 릴레이 (Fly.io 배포)
│   └── pwa/         # Next.js PWA 클라이언트 (Vercel 배포, Phase 2: 네이티브)
├── packages/
│   ├── cli/         # CLI 래퍼 - `claude` 대신 `pocket-ai` 실행, 데몬 관리
│   ├── agent/       # 원격 세션 제어 CLI - 다른 머신에서 세션 제어
│   └── wire/        # Wire 프로토콜, 타입 정의, 암호화
└── docs/            # 문서
```

### 패키지별 역할

| 패키지 | 설명 | 설치 |
|--------|------|------|
| `@pocket-ai/cli` | `claude`/`codex` 드롭인 대체. AI CLI 래핑, 데몬 관리, 로컬/원격 모드 전환 | `npm install -g @pocket-ai/cli` |
| `@pocket-ai/agent` | 다른 머신에서 세션 원격 제어. 인증, 세션 목록 조회, 메시지 전송 | `npm install -g @pocket-ai/agent` |
| `@pocket-ai/wire` | Wire 프로토콜, 공통 타입, AES-256-GCM 암호화 유틸 | 내부 의존성 |

## 기술 스택

| 컴포넌트 | 기술 | 배포 |
|---------|------|------|
| PWA | Next.js 14+ (App Router) | Vercel (무료) |
| Server | Fastify + Socket.IO + Prisma | Fly.io |
| Database | PostgreSQL | Fly.io PostgreSQL |
| CLI | Node.js + node-pty | 로컬 (npm -g) |
| Agent | Node.js CLI | 로컬 (npm -g) |
| 암호화 | AES-256-GCM | Web Crypto / Node crypto |

## 빠른 시작

### PC CLI 설치

```bash
# PC CLI 설치
npm install -g @pocket-ai/cli
pocket-ai start          # `claude` 대신 실행
pocket-ai codex          # `codex` 대신 실행
```

### Remote Agent (다른 머신에서)

```bash
# Remote Agent 설치
npm install -g @pocket-ai/agent
pocket-ai-agent auth     # GitHub OAuth 로그인
pocket-ai-agent list     # 세션 목록
pocket-ai-agent send <session-id> "message"
```

### PWA 접속 및 디바이스 페어링

1. 브라우저에서 https://pocket-ai.app 접속
2. GitHub OAuth로 계정 생성/로그인
3. PC에서 `pocket-ai start` 실행 → QR 코드 표시
4. PWA에서 QR 코드 스캔 → PC 디바이스 페어링 완료
5. E2E 암호화 키가 자동으로 교환되어 연결!

## 로컬/원격 모드

- **로컬 모드**: PC 키보드에서 직접 명령어 입력 → 일반 CLI처럼 동작
- **원격 모드**: 폰/다른 머신에서 PWA 또는 Agent CLI로 세션 제어
- **데몬**: 백그라운드 프로세스가 터미널을 닫아도 세션 유지

## 비용 예상

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          월간 비용 예상                                   │
├─────────────────────────────────────────────────────────────────────────┤
│  사용자 수  │  인프라                       │  월 비용                   │
├─────────────────────────────────────────────────────────────────────────┤
│  1-100      │  Fly.io + PG free tier       │  $0-8                      │
│  100-1K     │  Fly.io + PG                 │  $15-30                    │
│  1K-10K     │  Fly.io x2 + PG + Redis      │  $80-200                   │
│  10K+       │  Multi-region                │  $300+                     │
└─────────────────────────────────────────────────────────────────────────┘
```

## 상업용 비전

### Phase 1: MVP (무료~$8/월)
- 개인 사용자 타겟
- CLI + Server + PWA + GitHub OAuth 로그인 + QR 디바이스 페어링 + E2E 암호화 + 데몬

### Phase 2: Pro ($10-20/월)
- 푸시 알림
- 네이티브 앱 (Expo)
- 팀 SSO 준비

### Phase 3: Team ($50+/월/팀)
- 팀 공유 세션
- 권한 관리
- 음성 입력
- API 액세스

### Phase 4: Enterprise (견적)
- SLA 보장
- 온프레미스 옵션
- 전용 지원

## 지원 AI CLI

- [x] Claude Code (`claude`)
- [ ] OpenAI Codex CLI (`codex`)
- [ ] Google Gemini CLI (`gemini`)

## 개발 로드맵

### Phase 1: MVP
- [x] 프로젝트 구조 설계
- [ ] `@pocket-ai/cli` 구현 (Claude Code 래핑 + 데몬)
- [ ] Socket.IO 릴레이 서버 (Fastify + Prisma + PostgreSQL)
- [ ] PWA 클라이언트 (채팅 UI)
- [ ] GitHub OAuth 로그인 + JWT 인증
- [ ] QR 코드 디바이스 페어링 + E2E 암호화 키 교환
- [ ] AES-256-GCM E2E 암호화
- [ ] 로컬/원격 모드 전환

### Phase 2: 안정화 + 네이티브
- [ ] 푸시 알림
- [ ] 네이티브 앱 (Expo)
- [ ] 팀 SSO (SAML/OIDC)
- [ ] 오프라인 메시지 큐잉
- [ ] 재연결 로직 강화

### Phase 3: 수익화
- [ ] 결제 연동 (Stripe)
- [ ] Pro 플랜 기능
- [ ] 팀 기능
- [ ] 음성 입력

### Phase 4: 확장
- [ ] API 액세스
- [ ] 추가 CLI 지원 (Codex, Gemini)
- [ ] 엔터프라이즈 기능

## 문서

- [ARCHITECTURE.md](./docs/ARCHITECTURE.md) - 시스템 아키텍처
- [BUSINESS.md](./docs/BUSINESS.md) - 비즈니스 모델 및 가격
- [SECURITY.md](./docs/SECURITY.md) - 보안 설계
- [API.md](./docs/API.md) - API 레퍼런스

## 라이선스

MIT License
