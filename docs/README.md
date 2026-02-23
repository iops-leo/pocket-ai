# Pocket AI Documentation

모바일/웹에서 PC의 AI CLI(Claude Code, Codex, Gemini CLI)를 원격 제어하는 플랫폼

## 문서 목록

### [ARCHITECTURE.md](./ARCHITECTURE.md)
시스템 아키텍처 문서
- 설계 원칙 (비용 최적화, 단순함)
- 시스템 개요 (4 패키지: server, pwa, cli, wire)
- 통신 흐름 (OAuth 로그인, ECDH 키교환, E2E 암호화)
- 데몬(daemon) 아키텍처
- 암호화 설계 (ECDH P-256 + AES-256-GCM)
- 배포 아키텍처 (Railway + Vercel)

### [BUSINESS.md](./BUSINESS.md)
비즈니스 모델 문서
- 가격 정책 (FREE / PRO)
- 인프라 비용 분석
- 경쟁 분석

### [SECURITY.md](./SECURITY.md)
보안 설계 문서
- E2E 암호화 (ECDH P-256 → AES-256-GCM)
- 서버 Blind Relay 원칙
- 위협 모델 및 대응

### [API.md](./API.md)
API 레퍼런스
- REST API (세션 관리)
- Socket.IO 이벤트 프로토콜
- Wire 프로토콜 메시지 타입

---

## 핵심 컨셉

### E2E 암호화
- ECDH P-256 키교환 → AES-256-GCM 대칭키 파생
- 서버는 복호화 불가 (Pure Relay)
- GitHub OAuth 로그인으로 세션 자동 발견 (QR 불필요)

### 서버 Pure Relay
- 서버는 암호화된 메시지를 **즉시 중계만** (저장 없음)
- DB에는 users/sessions 메타데이터만 저장
- 서버 침해 시에도 메시지 내용 보호

### CLI 통합 패키지
- `@pocket-ai/cli` 하나로 AI CLI 래핑 + 원격 제어 통합
- `pocket-ai` 명령으로 claude 자동 실행 + 원격 활성화
- JSONL 세션 감시로 구조화 이벤트 추출

### Wire 프로토콜
- `@pocket-ai/wire` 패키지: 공통 타입, 암호화, Zod 스키마
- 4가지 이벤트: `text`, `tool-call`, `tool-result`, `session-event`

---

## 패키지 구조

```
pocket-ai/
├── apps/
│   ├── server/      # Fastify + Socket.IO 릴레이 (Railway)
│   └── pwa/         # Next.js PWA 클라이언트 (Vercel)
├── packages/
│   ├── cli/         # AI CLI 래퍼 + 원격 제어 (@pocket-ai/cli)
│   └── wire/        # 프로토콜, 암호화, 타입 (@pocket-ai/wire)
└── docs/            # 이 문서들
```

---

## PWA 주요 기능

### 사이드바 + 듀얼페인 레이아웃
- 왼쪽 사이드바: 세션 목록, 검색, 엔진 필터
- 오른쪽: 채팅 영역
- 모바일: 슬라이드인 사이드바

### 채팅 UI
- 마크다운 렌더링 + 코드 구문 하이라이팅 (Prism.js)
- `<options>` 태그로 AI 선택지 버튼 렌더링
- 도구별 전용 뷰:
  - **Edit**: Diff 뷰 (인라인 하이라이팅)
  - **Write**: 녹색 추가 라인
  - **Bash**: `$` 프롬프트 + stdout/stderr 분리
  - **Read**: 파일 확장자 기반 구문 하이라이팅
  - **Grep**: 검색 패턴 + 결과

### 연결 상태
- 실시간 연결 상태 표시 (녹색/노란색/빨간색)
- 자동 재연결 + 암호화 세션 복원
- 대화 이력 복원 (암호화된 메시지 복호화)

---

## 기술 스택

| 컴포넌트 | 기술 | 배포 |
|---------|------|------|
| PWA | Next.js 14+, Tailwind CSS, Socket.IO | Vercel |
| Server | Fastify, Socket.IO, Kysely | Railway |
| Database | PostgreSQL | Supabase |
| CLI | Node.js, node-pty | 로컬 (npm -g) |
| 암호화 | ECDH P-256 + AES-256-GCM | Web Crypto API |

---

## 배포 URL

- **서버**: `https://pocket-ai-production.up.railway.app`
- **PWA**: `https://pocket-ai-pwa.vercel.app`
- **GitHub**: `https://github.com/iops-leo/pocket-ai`
