# Pocket AI Documentation Summary

**업데이트**: 상업용 비용 최적화 버전
**상태**: 완료

---

## 변경 사항 요약

### 아키텍처 단순화

| 기존 | 변경 |
|-----|------|
| apps/mobile (Expo) | 제거 → PWA로 대체 |
| apps/web (Next.js) | pwa로 통합 |
| packages/crypto | shared에 통합 |
| packages/protocol | shared에 통합 |
| packages/session | server에 통합 |
| packages/cli | agent에 통합 |

**최종 구조**:
```
pocket-ai/
├── apps/
│   ├── server/      # Fastify + Socket.IO 릴레이 (순수 중계, 저장 없음)
│   └── pwa/         # Next.js PWA 클라이언트
├── packages/
│   ├── cli/         # AI CLI 래퍼 + 데몬 (PC 글로벌 설치)
│   ├── agent/       # 원격 세션 제어 CLI
│   └── wire/        # 공유 프로토콜, 타입, 암호화
└── docs/            # 문서
```

### 암호화 단순화

| 기존 | 변경 |
|-----|------|
| X25519 ECDH | 제거 |
| HKDF-SHA256 | 제거 |
| XChaCha20-Poly1305 | AES-256-GCM |
| 복잡한 키 교환 | QR 코드 직접 전달 |

### 비용 최적화

| 단계 | 기존 예상 | 변경 |
|-----|---------|------|
| 초기 | $20-50/월 | $0-3/월 (메시지 저장 없음) |
| 성장 | $100-200/월 | $20-100/월 |
| 대규모 | $500+/월 | $300+/월 |

---

## 문서 구성

### 1. README.md (루트)
- 프로젝트 소개
- 상업용 비전 (Phase 1-4)
- 비용 최적화 전략
- 아키텍처 다이어그램
- 단순화된 패키지 구조
- 기술 스택
- 빠른 시작 가이드
- 로드맵

### 2. docs/ARCHITECTURE.md
- 설계 원칙 (비용 최적화, 단순함)
- 시스템 개요 다이어그램
- 컴포넌트 상세 (server, pwa, agent, shared)
- 통신 흐름 (QR 연결, 암호화 메시지, 재연결)
- AES-256-GCM 암호화 구현 코드
- 배포 아키텍처 (초기/성장/대규모)
- 확장 전략 (PostgreSQL 스케일링)

### 3. docs/BUSINESS.md (신규)
- 비즈니스 개요 및 타겟 고객
- 가격 정책 (FREE/PRO/TEAM/Enterprise)
- 인프라 비용 상세 분석
- 수익 모델 및 예측
- 유닛 이코노믹스
- 손익분기점 분석
- 성장 단계별 전략
- 경쟁 분석
- 마케팅 전략

### 4. docs/SECURITY.md
- 보안 원칙 (단순함, 서버 Blind)
- AES-256-GCM 암호화 설계
- 키 관리 (생성, QR 전달, 폐기)
- 서버 Blind Relay 원칙
- 위협 모델 (5가지 시나리오)
- OAuth 로그인 (GitHub) + JWT + QR 디바이스 페어링
- 보안 체크리스트

### 5. docs/API.md
- REST API (세션 CRUD)
- WebSocket Protocol
- 메시지 타입 (command, response, error, ping)
- 에러 처리 및 Rate Limiting
- 전체 플로우 예제 코드

### 6. docs/README.md
- 문서 인덱스
- 빠른 시작 가이드 (역할별)
- 핵심 컨셉 요약

---

## 핵심 변경 포인트

### 1. PWA 단일화
네이티브 앱 없이 PWA로 모든 플랫폼 지원
- iOS Safari
- Android Chrome
- Desktop 브라우저
- 설치 가능 (Add to Home Screen)

### 2. OAuth 로그인 + QR 디바이스 페어링
인증과 페어링이 명확하게 분리:
1. 사용자가 GitHub OAuth로 계정 생성/로그인 → JWT 발급
2. CLI가 256-bit 랜덤 암호화 키 생성 + QR 코드 표시
3. PWA(JWT 보유)가 QR 스캔 → 암호화 키 + sessionId 획득 + 디바이스 페어링
4. 동일한 키로 AES-256-GCM E2E 암호화
- QR은 인증 수단이 아닌 디바이스 페어링 + 키 교환 수단

### 3. Fly.io + PostgreSQL (순수 릴레이)
검증된 Happy 스타일 아키텍처:
- Fly.io 무료 티어로 시작
- PostgreSQL free tier로 처음부터 안정적인 DB
- 메시지 저장 없음: DB는 users/sessions/devices만 (수백만 명도 무료 티어로 충분)
- 필요시 Connection Pooling + Read Replicas로 확장

### 4. Freemium 비즈니스 모델
```
FREE ($0)     → 개인 사용자 확보
PRO ($8.99)   → 멀티 디바이스(3대) + 무제한 세션
TEAM ($39)    → 팀 공유 세션 + 권한 관리
Enterprise    → 고가치 계약
```

---

## 파일 위치

```
/Users/leo/project/pocket-ai/
├── README.md                    # 메인 README (재작성)
├── DOCUMENTATION_SUMMARY.md     # 이 파일 (업데이트)
└── docs/
    ├── README.md                # 문서 인덱스 (재작성)
    ├── ARCHITECTURE.md          # 아키텍처 (재작성)
    ├── BUSINESS.md              # 비즈니스 (신규)
    ├── SECURITY.md              # 보안 (재작성)
    └── API.md                   # API (재작성)
```

---

## 다음 단계

1. **MVP 구현**
   - [ ] PoC: node-pty + Claude Code + Socket.IO 스트리밍 (최우선)
   - [ ] apps/server 스캐폴딩 (Fastify + Socket.IO)
   - [ ] apps/pwa 스캐폴딩 (Next.js + QR 스캐너)
   - [ ] packages/cli 구현 (AI CLI 래퍼 + 데몬)
   - [ ] packages/wire 구현 (프로토콜 + AES-256-GCM)

2. **테스트**
   - [ ] E2E 암호화 테스트
   - [ ] WebSocket 연결 테스트
   - [ ] QR 코드 플로우 테스트

3. **배포**
   - [ ] Fly.io 서버 배포
   - [ ] Vercel PWA 배포
   - [ ] npm agent 패키지 퍼블리시

---

**최종 업데이트**: 2026-02-21 (순수 릴레이 아키텍처 반영)
