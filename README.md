# Pocket AI

**어디서든 PC의 AI CLI 세션을 이어서 사용하세요**

모바일/웹 PWA에서 로컬 AI CLI 세션을 원격 제어하는 플랫폼입니다.

## 빠른 시작 (Happy 스타일 심플 사용법)

```bash
# 1. 설치 및 로그인 (최초 1회)
npm install -g @pocket-ai/cli
pocket-ai login

# 2. 사용 (이게 전부!)
pocket-ai
# → claude 자동 실행
# → PWA에서 즉시 접속 가능
# → 어디서든 이어서 작업

# 3. Happy 스타일 세션 관리
cd /project/A          # 폴더별 자동 세션 분리
/switch gemini         # 세션 내에서 AI 엔진 전환
cd /project/B          # 자동으로 새 세션 시작

# 4. 선택적 고급 사용
pocket-ai start codex       # Codex 사용
pocket-ai --no-remote       # 로컬 전용 모드
```

## 핵심 가치

- **세션 연속성**: 출퇴근길, 회의 중에도 PC 작업 이어서 진행
- **데몬 방식**: 터미널을 닫아도 백그라운드에서 세션 유지
- **비용 최적화**: MVP 완전 무료, 성장 후 사용량 기반 과금 (5천 명까지 $20/월)
- **간편한 설정**: GitHub OAuth 로그인만으로 디바이스 자동 연결
- **E2E 암호화**: 서버는 암호화된 메시지만 중계 (복호화 불가)

## 아키텍처

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   PWA Client    │     │  Relay Server   │     │  PC CLI (daemon)│
│   (Vercel)      │────▶│  Fastify +      │◀────│  @pocket-ai/cli │
└─────────────────┘     │  Socket.IO      │     └─────────────────┘
        │               │  (Railway)       │             │
        │  Socket.IO    │                 │             ▼
        │  + E2E 암호화 │  PostgreSQL     │     ┌─────────────────┐
        │  (AES-256-GCM)│  (Kysely)       │     │  Claude Code    │
        │               └─────────────────┘     │  Codex CLI      │
        │                                        │  Gemini CLI     │
        └────────────────────────────────────────┘ (확장 예정)
                                                └─────────────────┘

        ┌─────────────────┐
        │  Remote Mode    │
        │  @pocket-ai/cli │
        │  (pocket-ai     │
        │   remote)       │  ← 다른 머신에서 세션 원격 제어
        └─────────────────┘
```

## 패키지 구조

```
pocket-ai/
├── apps/
│   ├── server/      # Fastify + Socket.IO 릴레이 (Railway 배포)
│   └── pwa/         # Next.js PWA 클라이언트 (Vercel 배포, Phase 2: 네이티브)
├── packages/
│   ├── cli/         # CLI 래퍼 + 원격 제어 통합 - `claude` 대신 `pocket-ai` 실행, 데몬 관리
│   └── wire/        # Wire 프로토콜, 타입 정의, 암호화
└── docs/            # 문서
```

### 패키지별 역할

| 패키지 | 설명 | 설치 |
|--------|------|------|
| `@pocket-ai/cli` | AI CLI 래핑 + 원격 세션 제어 통합. start/remote/status/stop 서브커맨드 | `npm install -g @pocket-ai/cli` |
| `@pocket-ai/wire` | Wire 프로토콜, 공통 타입, AES-256-GCM 암호화 유틸 | 내부 의존성 |

## 기술 스택

| 컴포넌트 | 기술 | 배포 |
|---------|------|------|
| PWA | Next.js 14+ (App Router) | Vercel (무료) |
| Server | Fastify + Socket.IO (pure relay) | Railway |
| Database | PostgreSQL | Supabase |
| CLI | Node.js + node-pty (래퍼 + 원격 제어 통합) | 로컬 (npm -g) |
| 암호화 | ECDH P-256 + AES-256-GCM | Web Crypto / Node crypto |

## 빠른 시작

### PC CLI 설치

```bash
# PC CLI 설치
npm install -g @pocket-ai/cli
pocket-ai start          # `claude` 대신 실행
pocket-ai codex          # `codex` 대신 실행
```

### 원격 접속 (다른 머신에서)

```bash
npm install -g @pocket-ai/cli
pocket-ai login            # GitHub OAuth 로그인
pocket-ai remote list      # 활성 세션 목록
pocket-ai remote <session-id>  # 세션 원격 접속
```

### PWA 접속 및 디바이스 페어링

1. 브라우저에서 https://pocket-ai-pwa.vercel.app 접속
2. GitHub OAuth로 계정 생성/로그인
3. PC에서 `pocket-ai start` 실행 (같은 계정으로 로그인)
4. PWA 대시보드에 활성 PC 세션 자동 표시
5. 세션 클릭 → ECDH 키교환으로 E2E 암호화 자동 체결!

## 로컬/원격 모드

- **로컬 모드**: PC 키보드에서 직접 명령어 입력 → 일반 CLI처럼 동작
- **원격 모드**: 폰/다른 머신에서 PWA 또는 Agent CLI로 세션 제어
- **데몬**: 백그라운드 프로세스가 터미널을 닫아도 세션 유지

## 비용 예상

```
┌──────────────────────────────────────────────────────────────────────────┐
│              월간 인프라 비용 (Railway + Supabase + Vercel 기준)           │
│                     순수 릴레이 + 메시지 무저장 구조                        │
├─────────────┬──────────────────────────────┬──────────────────────────────┤
│  사용자 수   │  인프라                       │  월 비용                     │
├─────────────┼──────────────────────────────┼──────────────────────────────┤
│  1-100      │  Railway 무료 + Supabase 무료 │  $0                          │
│  100-1K     │  Railway Hobby               │  $5                          │
│  1K-5K      │  Railway Pro                 │  $20                         │
│  5K-10K     │  Railway Pro + 리소스 증설    │  $30-50                      │
│  10K+       │  Railway Team + Supabase Pro  │  $75-150                     │
└─────────────┴──────────────────────────────┴──────────────────────────────┘
```

> **비용이 낮은 이유**: 메시지를 저장하지 않아 DB는 Supabase 무료 티어로 수만 명 버팀. WebSocket 릴레이는 CPU 부담이 거의 없어 소형 서버로도 충분.

## 상업용 비전

### Phase 1: MVP (완전 무료)
- 개인 사용자 타겟
- CLI + Server + PWA + GitHub OAuth 로그인 + 계정 기반 자동 연결 + E2E 암호화 + 데몬

### Phase 2: Pro ($8.99/월)
- 멀티 디바이스 페어링 (3대)
- 푸시 알림
- 네이티브 앱 (Expo)

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

| CLI | 커맨드 | 설치 | 상태 |
|-----|--------|------|------|
| Claude Code | `pocket-ai` | `npm i -g @anthropic-ai/claude-code` | ✅ 기본값 |
| OpenAI Codex | `pocket-ai start codex` | `npm i -g @openai/codex` | ✅ 지원 (바이너리 설치 필요) |
| Google Gemini | `pocket-ai start gemini` | `npm i -g @google/gemini-cli` | ✅ 지원 (바이너리 설치 필요) |

> **새 AI CLI 추가 공수**: 표준 인터랙티브 터미널 CLI라면 코드 변경 없이 바로 됨. `pocket-ai start <바이너리이름>` 형태로 모든 CLI 래핑 가능.

## 개발 로드맵

### Phase 1: MVP ✅ 완료
- [x] 프로젝트 구조 설계
- [x] `@pocket-ai/cli` 구현 (Claude Code 래핑 + 데몬)
- [x] Socket.IO 릴레이 서버 (Fastify + Kysely + PostgreSQL)
- [x] PWA 클라이언트 (채팅 UI)
- [x] GitHub OAuth 로그인 + JWT 인증
- [x] ECDH P-256 기반 E2E 암호화 키 교환
- [x] AES-256-GCM E2E 암호화
- [x] 로컬/원격 모드 전환
- [x] Railway + Supabase + Vercel 배포 완료

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
