# Pocket AI Documentation

상업용 비용 최적화 원격 AI CLI 제어 플랫폼

## 문서 목록

### [ARCHITECTURE.md](./ARCHITECTURE.md)
시스템 아키텍처 문서
- 설계 원칙 (비용 최적화, 단순함)
- 시스템 개요
- 컴포넌트 구조 (server, pwa, agent, cli, wire)
- 통신 흐름 (OAuth 로그인, QR 디바이스 페어링, 암호화 메시지, 로컬/원격 모드)
- 데몬(daemon) 아키텍처
- 암호화 설계 (AES-256-GCM)
- 배포 아키텍처 (Railway + Vercel)
- 확장 전략

### [BUSINESS.md](./BUSINESS.md)
비즈니스 모델 문서
- 비즈니스 개요 및 타겟 고객
- 가격 정책 (FREE / PRO / TEAM / Enterprise)
- 인프라 비용 분석 (단계별)
- 수익 모델 및 예측
- 성장 단계별 전략
- 경쟁 분석
- 마케팅 전략

### [SECURITY.md](./SECURITY.md)
보안 설계 문서
- 보안 원칙 (단순함, 서버 Blind)
- 암호화 설계 (AES-256-GCM)
- 키 관리 (QR 디바이스 페어링 시 전달, 수명 주기)
- 서버 Blind Relay 원칙
- 위협 모델 및 대응
- 인증 (OAuth 로그인 + JWT + QR 디바이스 페어링)
- 보안 체크리스트

### [API.md](./API.md)
API 레퍼런스
- REST API (세션 관리)
- Socket.IO 이벤트 프로토콜
- Wire 프로토콜 메시지 타입 (command, response, error)
- 로컬/원격 모드 전환
- 에러 처리
- 예제 코드

---

## 빠른 시작

### 개발자

1. [ARCHITECTURE.md](./ARCHITECTURE.md) - 시스템 이해
2. [API.md](./API.md) - API 통합
3. [SECURITY.md](./SECURITY.md) - 보안 요구사항

### 비즈니스

1. [BUSINESS.md](./BUSINESS.md) - 비즈니스 모델
2. [ARCHITECTURE.md](./ARCHITECTURE.md) - 비용 구조

### 보안 감사

1. [SECURITY.md](./SECURITY.md) - 위협 모델
2. [ARCHITECTURE.md](./ARCHITECTURE.md) - 암호화 설계

---

## 핵심 컨셉

### 인증 구조
- **사용자 인증**: GitHub OAuth + JWT (QR은 인증 수단이 아님)
- **디바이스 페어링**: QR 코드로 PC↔폰 연결 + E2E 암호화 키 교환
- JWT는 모든 API 및 Socket.IO 연결에 필수

### E2E 암호화
- AES-256-GCM 사용
- 암호화 키는 QR 코드로 디바이스 페어링 시 전달
- 서버는 복호화 불가

### 서버 Pure Relay (완전 Blind)
- 서버는 암호화된 메시지를 **저장하지 않고** 즉시 중계
- 암호화 키는 서버에 없음 (QR로 클라이언트간 직접 교환)
- DB에는 users/sessions/devices 메타데이터만 저장
- 서버가 해킹당해도 메시지 내용/키 모두 없음

### 데몬(Daemon) 아키텍처
- agent가 백그라운드 데몬으로 상시 실행
- CLI는 데몬에 명령을 위임하는 클라이언트
- 로컬 모드: CLI → 데몬 직접 통신 (서버 불필요)
- 원격 모드: PWA → 서버(Socket.IO) → 데몬 중계

### 로컬/원격 모드
- 로컬 모드: 같은 기기에서 CLI로 직접 제어 (오프라인 가능)
- 원격 모드: 스마트폰 PWA에서 원격으로 PC 제어

### Wire 프로토콜
- `wire` 패키지: 공통 타입, 암호화, 메시지 스키마 정의
- CLI, agent, server, pwa가 공유하는 단일 통신 규약
- Socket.IO 이벤트 기반 실시간 양방향 통신

### 비용 최적화
- 초기: Railway + Supabase PostgreSQL ($0-3/월)
- 성장: 스케일업 PostgreSQL ($50-100/월)
- 대규모: 멀티리전 ($300+/월)

---

## 패키지 구조

```
pocket-ai/
├── apps/
│   ├── server/      # Fastify + Socket.IO 릴레이 서버 (순수 릴레이, 메시지 저장 없음)
│   └── pwa/         # Next.js PWA 클라이언트
├── packages/
│   ├── cli/         # 사용자 CLI (데몬 클라이언트)
│   ├── agent/       # 백그라운드 데몬 (PC 명령 실행)
│   └── wire/        # 공통 타입, 암호화, Wire 프로토콜 스키마
└── docs/            # 이 문서들
```

---

## 기술 스택

| 컴포넌트 | 기술 | 배포 |
|---------|------|------|
| PWA | Next.js 14+ | Vercel (무료) |
| Server | Fastify + Socket.IO | Railway (free tier) |
| Database | PostgreSQL (users/sessions/devices만) | Supabase |
| Agent (데몬) | Node.js + node-pty | 로컬 백그라운드 |
| CLI | Node.js (데몬 클라이언트) | 로컬 |
| Wire 프로토콜 | 공통 타입/스키마 패키지 | - |
| 암호화 | AES-256-GCM | Web Crypto / Node crypto |

---

## 연락처

- 일반: hello@pocket-ai.app
- 보안: security@pocket-ai.app
- 지원: support@pocket-ai.app
