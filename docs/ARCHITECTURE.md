# Pocket AI Architecture

상업용 비용 최적화 아키텍처 - Happy 참조, 단순화 적용

## 목차

- [설계 원칙](#설계-원칙)
- [시스템 개요](#시스템-개요)
- [패키지 구조](#패키지-구조)
- [컴포넌트 아키텍처](#컴포넌트-아키텍처)
- [통신 흐름](#통신-흐름)
- [암호화 설계](#암호화-설계)
- [배포 아키텍처](#배포-아키텍처)
- [확장 전략](#확장-전략)

---

## 설계 원칙

### 1. 비용 최적화 우선
- 초기: 완전 무료 또는 최소 비용 ($5 이하)
- 성장: 사용량 기반 점진적 확장
- 불필요한 인프라 제거

### 2. 단순함 우선 (Happy에서 단순화)
- 복잡한 HMAC-SHA512 키 트리 → 간단한 AES-256-GCM
- Prisma → 직접 SQL 또는 간단한 ORM (초기 단순화)
- GitHub OAuth + JWT (Happy 방식 채택) + QR 코드는 디바이스 페어링 전용
- Expo 네이티브 앱 → PWA (Phase 2에서 네이티브 고려)
- 소셜/아티팩트/음성 기능 → 초기 제외

### 3. Happy에서 가져온 핵심 개념
- **CLI와 Agent 분리**: `cli`(AI CLI 래퍼)와 `agent`(원격 제어 CLI)를 별도 패키지로
- **데몬 프로세스**: 터미널 독립적으로 세션을 유지하는 백그라운드 프로세스
- **로컬/리모트 모드 전환**: 같은 세션을 키보드(로컬)와 폰(리모트)에서 끊김 없이 전환
- **Socket.IO**: raw WebSocket 대신 Socket.IO (rooms, 자동 재연결, 멀티플렉싱)
- **확장된 세션 프로토콜**: 4개 이벤트에서 8개로 확장

### 4. 점진적 확장
- MVP는 최소로 시작
- 수요에 따라 기능 추가
- 인프라는 필요할 때 업그레이드

---

## 시스템 개요

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              인터넷                                      │
│                                                                         │
│  ┌─────────────────┐                            ┌─────────────────────┐ │
│  │   PWA Client    │                            │   PC (로컬 머신)     │ │
│  │   (브라우저)     │                            │                     │ │
│  │                 │                            │  ┌───────────────┐  │ │
│  │  - Next.js     │                            │  │  CLI Package  │  │ │
│  │  - Vercel 무료  │                            │  │  (AI CLI 래퍼) │  │ │
│  │  - Web Crypto  │                            │  │  + Daemon     │  │ │
│  └────────┬────────┘                            │  └───────┬───────┘  │ │
│           │                                     │          │          │ │
│           │                                     │  ┌───────▼───────┐  │ │
│           │                                     │  │ Claude Code   │  │ │
│           │                                     │  │ Codex / Gemini│  │ │
│           │                                     │  └───────────────┘  │ │
│           │                                     └──────────┬──────────┘ │
│           │  Socket.IO (wss://)                            │            │
│           │  + AES-256-GCM E2E                             │            │
│           │                                                │            │
│           └─────────────┐        ┌─────────────────────────┘            │
│                         │        │                                      │
│                         ▼        ▼                                      │
│                  ┌─────────────────────┐                                │
│                  │   Relay Server      │                                │
│                  │   (Fly.io)          │                                │
│                  │                     │                                │
│                  │  - Fastify          │                                │
│                  │  - Socket.IO Server │                                │
│                  │  - PostgreSQL       │                                │
│                  │  - 암호화된         │                                │
│                  │    메시지만 중계    │                                │
│                  └─────────────────────┘                                │
│                                                                         │
│  ┌─────────────────────┐                                                │
│  │  Agent CLI (별도)    │  ← 다른 머신에서 원격 세션 관리                │
│  │  auth / list / send │                                                │
│  └─────────────────────┘                                                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**핵심 차이점 (기존 대비)**:
- PC에서 `CLI`와 `Agent`가 분리됨 (CLI = AI 래퍼, Agent = 원격 제어 도구)
- CLI에 Daemon 프로세스 포함 (세션 유지)
- 모든 실시간 통신이 Socket.IO 기반
- Agent CLI는 별도 머신에서도 세션 관리 가능

---

## 패키지 구조

```
pocket-ai/
├── apps/
│   ├── server/          # Fastify + Socket.IO 릴레이 서버
│   └── pwa/             # Next.js PWA 클라이언트 (Phase 2: Expo 네이티브)
├── packages/
│   ├── cli/             # NEW: 메인 CLI 래퍼 (claude/codex 대체)
│   ├── agent/           # CHANGED: 원격 세션 제어 CLI
│   └── wire/            # RENAMED (shared→wire): 와이어 프로토콜, 타입, 암호화
└── docs/
```

### 패키지 역할 분리 (Happy 방식)

| 패키지 | 역할 | 설치 위치 | 사용자 |
|--------|------|----------|--------|
| `cli` | AI CLI 래핑, 로컬/리모트 모드, 데몬 프로세스 | PC (글로벌 설치) | 개발자 본인 |
| `agent` | 원격 세션 관리 (인증, 목록, 메시지 전송) | 어디서든 | 원격 사용자 |
| `wire` | 프로토콜 타입, 암호화, 검증 유틸리티 | 내부 의존성 | 모든 패키지 |

**왜 분리하는가?**
- `cli`는 PC에 설치되어 AI CLI 프로세스를 직접 관리 (node-pty, 데몬)
- `agent`는 어떤 머신에서든 세션에 접근하는 가벼운 도구 (인증, 명령 전송)
- 관심사 분리로 각 패키지를 독립적으로 개발/배포 가능

---

## 컴포넌트 아키텍처

### apps/server/ (릴레이 서버)

**역할**: 암호화된 메시지 중계 + 세션 관리 + 메시지 히스토리 저장

```
apps/server/
├── src/
│   ├── index.ts              # 서버 진입점
│   ├── routes/
│   │   ├── health.ts         # 헬스체크
│   │   ├── auth.ts           # OAuth (GitHub/Google) + JWT 인증
│   │   └── pairing.ts        # QR 코드 디바이스 페어링 + 암호화 키 교환
│   ├── socket/
│   │   ├── handler.ts        # Socket.IO 이벤트 핸들러
│   │   ├── rooms.ts          # 세션별 Room 관리
│   │   └── relay.ts          # 메시지 중계 로직
│   ├── db/
│   │   ├── schema.sql        # PostgreSQL 스키마
│   │   ├── client.ts         # PostgreSQL 클라이언트 (pg)
│   │   └── messages.ts       # 암호화된 메시지 히스토리 저장
│   └── services/
│       ├── session.ts        # 세션 라이프사이클 관리
│       └── queue.ts          # 오프라인 메시지 큐
├── fly.toml                  # Fly.io 배포 설정
├── Dockerfile
└── package.json
```

**핵심 기능**:
- Socket.IO 서버 + Room 기반 세션 라우팅
- Client/CLI/Agent 연결 매핑
- 암호화된 메시지 중계 (서버 복호화 불가)
- 암호화된 메시지 히스토리 저장 (세션 재접속 시 동기화)
- 오프라인 메시지 버퍼링
- PostgreSQL로 세션/메시지 상태 저장

**기술 스택**:
- Runtime: Node.js 20+
- Framework: Fastify 4.x
- 실시간: Socket.IO 4.x (rooms, 자동 재연결, 멀티플렉싱)
- Database: PostgreSQL (pg 드라이버)
- Validation: Zod

**Socket.IO 서버 초기화 예시**:
```typescript
import Fastify from 'fastify'
import { Server } from 'socket.io'

const fastify = Fastify()
const io = new Server(fastify.server, {
  cors: { origin: process.env.ALLOWED_ORIGINS?.split(',') },
  pingTimeout: 30000,
  pingInterval: 10000,
})

// 세션별 Room 관리
io.on('connection', (socket) => {
  const { sessionId, role } = socket.handshake.auth

  // 세션 Room에 참가
  socket.join(`session:${sessionId}`)

  // 역할별 Room (cli, client, agent)
  socket.join(`session:${sessionId}:${role}`)

  // 메시지 중계 - 같은 세션의 다른 참가자에게 전달
  socket.on('message', (data) => {
    socket.to(`session:${sessionId}`).emit('message', data)
    // 암호화된 상태로 히스토리 저장
    saveEncryptedMessage(sessionId, data)
  })

  // 세션 프로토콜 이벤트
  socket.on('tool-call-start', (data) => {
    socket.to(`session:${sessionId}`).emit('tool-call-start', data)
  })

  socket.on('turn-start', (data) => {
    socket.to(`session:${sessionId}`).emit('turn-start', data)
  })
})
```

---

### apps/pwa/ (PWA 클라이언트)

**역할**: 모바일/데스크톱 브라우저에서 원격 제어

```
apps/pwa/
├── src/
│   ├── app/
│   │   ├── layout.tsx        # 루트 레이아웃
│   │   ├── page.tsx          # 홈/대시보드
│   │   ├── connect/
│   │   │   └── page.tsx      # QR 스캔 페이지
│   │   └── session/
│   │       └── [id]/page.tsx # 활성 세션
│   ├── components/
│   │   ├── ChatArea.tsx      # 메시지 표시
│   │   ├── InputBar.tsx      # 명령어 입력
│   │   ├── ToolStatus.tsx    # 도구 실행 상태 표시
│   │   └── QRScanner.tsx     # QR 코드 스캐너
│   ├── lib/
│   │   ├── crypto.ts         # AES-256-GCM (Web Crypto)
│   │   ├── socket.ts         # Socket.IO 클라이언트
│   │   └── storage.ts        # IndexedDB 래퍼
│   └── hooks/
│       ├── useSession.ts     # 세션 관리
│       ├── useSocket.ts      # Socket.IO 연결 관리
│       └── useEncryption.ts  # 암호화/복호화
├── public/
│   └── manifest.json         # PWA 매니페스트
├── next.config.js
└── package.json
```

**핵심 기능**:
- QR 코드 스캔으로 CLI 세션 연결
- E2E 암호화 메시지 송수신
- 도구 실행 상태 실시간 표시 (tool-call-start/end)
- 오프라인 지원 (Service Worker)
- 설치 가능 (PWA)
- Socket.IO 자동 재연결

**기술 스택**:
- Framework: Next.js 14+ (App Router)
- Styling: Tailwind CSS
- PWA: next-pwa
- 실시간: socket.io-client
- Crypto: Web Crypto API
- QR Scanner: html5-qrcode

**Socket.IO 클라이언트 예시**:
```typescript
import { io, Socket } from 'socket.io-client'

function createSessionSocket(
  serverUrl: string,
  sessionId: string,
  encryptionKey: CryptoKey
): Socket {
  const socket = io(serverUrl, {
    auth: { sessionId, role: 'client' },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  })

  socket.on('connect', () => {
    console.log('세션 연결됨:', sessionId)
  })

  // 암호화된 메시지 수신 → 복호화 → UI 표시
  socket.on('message', async (data) => {
    const plaintext = await decrypt(data.ciphertext, data.nonce, encryptionKey)
    displayMessage(JSON.parse(plaintext))
  })

  // 도구 실행 상태 수신
  socket.on('tool-call-start', (data) => {
    showToolProgress(data.toolName)
  })

  socket.on('tool-call-end', (data) => {
    hideToolProgress(data.toolName)
  })

  return socket
}
```

---

### packages/cli/ (메인 CLI 래퍼) - NEW

**역할**: AI CLI(claude, codex 등) 래핑 + 로컬/리모트 모드 전환 + 데몬 프로세스

```
packages/cli/
├── src/
│   ├── index.ts              # CLI 진입점
│   ├── cli.ts                # 메인 CLI 클래스
│   ├── daemon/
│   │   ├── process.ts        # 데몬 프로세스 관리
│   │   ├── ipc.ts            # 데몬-포그라운드 IPC 통신
│   │   └── lifecycle.ts      # 데몬 시작/중지/상태
│   ├── mode/
│   │   ├── local.ts          # 로컬 모드 (키보드 직접 입력)
│   │   ├── remote.ts         # 리모트 모드 (폰/웹에서 입력)
│   │   └── switch.ts         # 모드 전환 로직
│   ├── wrapper/
│   │   ├── base.ts           # CLI 래퍼 베이스
│   │   └── claude.ts         # Claude Code 래퍼
│   ├── server/
│   │   ├── connection.ts     # Socket.IO 서버 연결
│   │   └── heartbeat.ts      # 연결 유지
│   ├── crypto.ts             # AES-256-GCM
│   └── qr.ts                 # QR 코드 생성
├── bin/
│   └── pocket-ai.js          # CLI 진입점 (pocket-ai start, pocket-ai daemon)
└── package.json
```

**핵심 기능**:
- AI CLI 프로세스 관리 (node-pty)
- **데몬 프로세스**: 터미널을 닫아도 세션 유지
- **로컬/리모트 모드 전환**: 키보드 입력 → 로컬, 폰 입력 → 리모트
- QR 코드로 암호화 키 공유
- Socket.IO로 서버 연결 및 자동 재연결
- 세션 프로토콜 이벤트 발행

**기술 스택**:
- Runtime: Node.js 20+
- Process: node-pty
- Crypto: Node.js crypto (AES-256-GCM)
- 실시간: socket.io-client
- QR: qrcode-terminal
- Daemon: Node.js child_process (detached)

**데몬 프로세스 구조**:
```
사용자 터미널 (포그라운드)
    │
    ├── pocket-ai start
    │   → AI CLI 시작 + 데몬 스폰
    │
    ▼
데몬 프로세스 (백그라운드, detached)
    │
    ├── AI CLI 프로세스 관리 (node-pty)
    ├── Socket.IO 서버 연결 유지
    ├── 리모트 명령 수신 → AI CLI 전달
    ├── AI CLI 출력 → 서버 중계
    │
    └── 모드 전환
        ├── 로컬: 터미널 활성 → 키보드 입력 직접 전달
        └── 리모트: 터미널 비활성 → 데몬이 세션 유지
```

**모드 전환 동작**:
```typescript
// 로컬/리모트 모드 전환
class ModeSwitch {
  private mode: 'local' | 'remote' = 'local'

  // 키보드 입력 감지 → 로컬 모드 전환
  onLocalInput() {
    if (this.mode === 'remote') {
      this.mode = 'local'
      this.notifyServer('mode-change', { mode: 'local' })
      // 데몬의 리모트 입력 일시 정지
    }
  }

  // 서버에서 리모트 메시지 수신 → 리모트 모드 전환
  onRemoteInput() {
    if (this.mode === 'local') {
      this.mode = 'remote'
      this.notifyServer('mode-change', { mode: 'remote' })
      // 로컬 터미널 출력을 서버로 중계 시작
    }
  }
}
```

---

### packages/agent/ (원격 세션 제어 CLI) - CHANGED

**역할**: 다른 머신에서 PC 세션을 원격으로 관리하는 경량 CLI 도구

```
packages/agent/
├── src/
│   ├── index.ts              # CLI 진입점
│   ├── commands/
│   │   ├── auth.ts           # 인증 (QR 스캔, 토큰 관리)
│   │   ├── list.ts           # 활성 세션 목록
│   │   ├── send.ts           # 세션에 메시지 전송
│   │   ├── attach.ts         # 세션 실시간 연결
│   │   └── status.ts         # 세션 상태 확인
│   ├── server/
│   │   └── connection.ts     # Socket.IO 서버 연결
│   └── crypto.ts             # AES-256-GCM 복호화/암호화
├── bin/
│   └── pocket-ai-agent.js    # CLI 진입점
└── package.json
```

**핵심 기능**:
- `pocket-ai-agent auth` - OAuth 로그인 (GitHub/Google) + JWT 토큰 저장
- `pocket-ai-agent list` - 활성 세션 목록 조회
- `pocket-ai-agent send <session-id> <message>` - 메시지 전송
- `pocket-ai-agent attach <session-id>` - 세션에 실시간 연결
- `pocket-ai-agent status <session-id>` - 세션 상태 확인

**기술 스택**:
- Runtime: Node.js 20+
- 실시간: socket.io-client
- Crypto: Node.js crypto (AES-256-GCM)
- CLI: commander.js

**사용 예시**:
```bash
# 인증
pocket-ai-agent auth              # OAuth 로그인 (브라우저 열림) → JWT 저장

# 세션 관리
pocket-ai-agent list              # 내 활성 세션 목록
pocket-ai-agent status abc123     # 세션 상태 확인
pocket-ai-agent send abc123 "파일 구조 보여줘"  # 메시지 전송
pocket-ai-agent attach abc123     # 실시간 연결 (대화형)
```

---

### packages/wire/ (와이어 프로토콜) - RENAMED (shared → wire)

**역할**: 프로토콜 정의, 타입, 암호화 유틸리티 공유

```
packages/wire/
├── src/
│   ├── types/
│   │   ├── messages.ts       # 메시지 타입
│   │   ├── session.ts        # 세션 타입
│   │   ├── events.ts         # 세션 프로토콜 이벤트 타입
│   │   └── api.ts            # API 타입
│   ├── protocol/
│   │   ├── constants.ts      # 프로토콜 상수
│   │   ├── events.ts         # 이벤트 정의 (8종)
│   │   └── validation.ts     # 메시지 검증 (Zod)
│   ├── crypto/
│   │   ├── aes.ts            # AES-256-GCM 구현
│   │   └── key.ts            # 키 생성/관리
│   └── utils/
│       ├── encoding.ts       # Base64 인코딩
│       └── logger.ts         # 로깅
└── package.json
```

**세션 프로토콜 이벤트 (8종)**:

| 이벤트 | 방향 | 설명 |
|--------|------|------|
| `text` | 양방향 | 사용자/에이전트 텍스트 메시지 |
| `tool-call-start` | CLI → Client | 도구 호출 시작 (도구명, 파라미터) |
| `tool-call-end` | CLI → Client | 도구 호출 완료 (결과) |
| `turn-start` | CLI → Client | 대화 턴 시작 |
| `turn-end` | CLI → Client | 대화 턴 종료 |
| `start` | CLI → Server | 세션 시작 |
| `stop` | 양방향 | 세션 종료 |
| `error` | 양방향 | 에러 메시지 |

```typescript
// 세션 프로토콜 이벤트 타입 정의
type SessionEvent =
  | { type: 'text'; content: string; role: 'user' | 'assistant' }
  | { type: 'tool-call-start'; toolName: string; params?: Record<string, any> }
  | { type: 'tool-call-end'; toolName: string; result?: string; error?: string }
  | { type: 'turn-start'; turnId: string }
  | { type: 'turn-end'; turnId: string }
  | { type: 'start'; sessionId: string; cliType: string }
  | { type: 'stop'; reason?: string }
  | { type: 'error'; code: string; message: string }
```

---

## 통신 흐름

### 1. 초기 연결 (OAuth 로그인 + QR 디바이스 페어링)

```
PWA (사용자 폰)                  Server                  PC (CLI Package)
    │                               │                          │
    ├── 1. OAuth 로그인 ────────────>│                          │
    │   (GitHub/Google)              │                          │
    │                               ├── JWT 발급                │
    │<──────── JWT 반환 ─────────────┤                          │
    │                               │                          │
    │                               │   2. pocket-ai start      │
    │                               │<───────────────────────── ┤
    │                               │   세션 생성 (JWT 필요)     │
    │                               │                          │
    │                               ├── 3. QR 데이터 반환       │
    │                               │   { sessionId, server }  │
    │                               │─────────────────────────>│
    │                               │                          │
    │                               │   4. QR 코드 표시 (터미널) │
    │                               │   QR = { sessionId,       │
    │                               │          key: base64(key),│
    │                               │          server }         │
    │                               │                          │
    ├── 5. QR 스캔 (디바이스 페어링) │                          │
    │   JWT + QR 데이터 전송 ───────>│                          │
    │                               ├── 6. JWT 검증 + 세션 연결 │
    │                               │   PC를 사용자 계정에 페어링│
    │                               │                          │
    ├── 7. Socket.IO 연결 ──────────>│<──────── Socket.IO ───── ┤
    │   auth: { sessionId, token }  │   auth: { sessionId,     │
    │                               │           token, role }   │
    │                               │                          │
    │         8. 서버가 Socket.IO Room 생성                      │
    │            room: session:{sessionId}                      │
    │                                                          │
    │                  세션 활성화                               │
    │                                                          │
```

**핵심**:
- 사용자 인증은 OAuth (GitHub/Google) + JWT (QR이 아님)
- QR 코드는 디바이스 페어링 + E2E 암호화 키 교환에만 사용
- 대칭키는 QR 코드로만 전달 (서버 모름)
- 서버는 JWT로 사용자 신원을 확인하고 PC를 계정에 연결
- Socket.IO Room으로 세션 참가자를 그룹핑
- 데몬 프로세스가 세션을 터미널 독립적으로 유지

---

### 2. 암호화 메시지 흐름 (Socket.IO)

```
PWA Client                 Server (Socket.IO)         PC (CLI + Daemon)
    │                        │                           │
    │ 1. 명령어 암호화         │                           │
    │ ciphertext = AES(cmd, key, nonce)                  │
    │                        │                           │
    ├── 2. socket.emit ──────>│                           │
    │ event: 'message'       │                           │
    │ data: { sessionId,     │                           │
    │   ciphertext,          │                           │
    │   nonce, messageId }   │                           │
    │                        │                           │
    │                        ├── 3. Room 브로드캐스트 ───>│
    │                        │ socket.to(room).emit()    │
    │                        │ (복호화 없이 전달)          │
    │                        │                           │
    │                        │ 3a. 메시지 히스토리 저장    │
    │                        │ (암호화 상태 그대로)        │
    │                        │                           │
    │                        │               4. 복호화    │
    │                        │               cmd = AES.decrypt()
    │                        │                           │
    │                        │               5. AI CLI 실행
    │                        │               claude(cmd)  │
    │                        │                           │
    │                        │               6. turn-start 이벤트
    │                        │<──────────── emit ────────┤
    │<──── Room relay ───────┤                           │
    │                        │                           │
    │                        │               7. tool-call-start
    │                        │<──────────── emit ────────┤
    │<──── Room relay ───────┤                           │
    │ (도구 진행 상태 표시)    │                           │
    │                        │                           │
    │                        │               8. tool-call-end
    │                        │<──────────── emit ────────┤
    │<──── Room relay ───────┤                           │
    │                        │                           │
    │                        │               9. 응답 암호화
    │                        │<──── 'message' emit ──────┤
    │<──── Room relay ───────┤                           │
    │                        │                           │
    │                        │               10. turn-end 이벤트
    │                        │<──────────── emit ────────┤
    │<──── Room relay ───────┤                           │
    │                        │                           │
    │ 11. 복호화 및 표시       │                           │
    │                        │                           │
```

---

### 3. 로컬/리모트 모드 전환

```
PC (CLI + Daemon)          Server                    PWA Client
    │                        │                           │
    │  [로컬 모드]             │                           │
    │  키보드 입력 → AI CLI    │                           │
    │  출력 → 터미널           │                           │
    │                        │                           │
    │  ---- 사용자가 자리를 비움 ----                      │
    │                        │                           │
    │  [리모트 모드 전환]       │                           │
    │                        │<──── 메시지 수신 ───────────┤
    │                        │                           │
    │<── Room relay ─────────┤                           │
    │                        │                           │
    │  데몬이 수신             │                           │
    │  → mode: 'remote'      │                           │
    │  → 메시지를 AI CLI에 전달│                           │
    │  → 출력을 서버로 중계     │                           │
    │                        │                           │
    │── emit('message') ────>│────── Room relay ────────>│
    │                        │                           │
    │  ---- 사용자가 돌아옴 ----                           │
    │                        │                           │
    │  [로컬 모드 복귀]        │                           │
    │  키보드 입력 감지         │                           │
    │  → mode: 'local'       │                           │
    │  → 터미널로 직접 출력     │                           │
    │  → 서버에도 동시 중계     │                           │
    │     (PWA에서 모니터링 가능)│                          │
    │                        │                           │
```

**모드 전환 규칙**:
- **로컬 → 리모트**: 데몬이 로컬 입력 없이 서버에서 메시지를 수신하면 자동 전환
- **리모트 → 로컬**: 키보드 입력이 감지되면 자동 전환
- **양방향 동시**: 로컬 모드에서도 서버로 출력을 중계하여 PWA에서 모니터링 가능

---

### 4. 데몬 세션 유지 흐름

```
사용자 터미널                Daemon (백그라운드)          Server
    │                        │                           │
    │── pocket-ai start ────>│                           │
    │                        ├── AI CLI 시작              │
    │                        ├── Socket.IO 연결 ─────────>│
    │                        │                           │
    │  [정상 사용 - 로컬 모드]  │                           │
    │  키보드 ──> AI CLI      │                           │
    │  AI CLI ──> 터미널      │                           │
    │                        │                           │
    │  ---- 터미널 닫힘 ----   │                           │
    │  X                     │                           │
    │                        │  [데몬이 세션 계속 유지]     │
    │                        │  AI CLI 프로세스 살아있음    │
    │                        │  Socket.IO 연결 유지        │
    │                        │                           │
    │                        │<── ping ──────────────────│
    │                        │── pong ─────────────────>│
    │                        │                           │
    │                        │<── 리모트 메시지 수신 ──────│
    │                        │── AI CLI에 전달             │
    │                        │── 응답 중계 ─────────────>│
    │                        │                           │
    │  ---- 터미널 다시 열림 ── │                           │
    │                        │                           │
    │── pocket-ai attach ───>│                           │
    │                        ├── IPC로 터미널 연결         │
    │  [로컬 모드 복귀]        │                           │
    │  키보드 ──> AI CLI      │                           │
    │  AI CLI ──> 터미널      │                           │
    │                        │                           │
```

---

### 5. 재연결 흐름 (Socket.IO 자동 재연결)

```
CLI/Daemon Offline         Server                    PWA Client
      │                      │                           │
      X (연결 끊김)            │                           │
      │                      │                           │
      │                      │<───── 메시지 전송 ──────────┤
      │                      │                           │
      │                      ├── 메시지 큐에 저장          │
      │                      │   (만료시간: 24시간)        │
      │                      │                           │
      │                      │<───── 메시지 전송 ──────────┤
      │                      │                           │
      │                      ├── 큐에 추가                 │
      │                      │                           │
   CLI/Daemon Online         │                           │
      │                      │                           │
      ├── Socket.IO 자동 재연결>│                           │
      │   (exponential backoff)│                          │
      │                      │                           │
      ├── Room 재참가 ─────────>│                           │
      │   session:{sessionId} │                           │
      │                      │                           │
      │<── 큐에 있던 메시지들 ──┤                           │
      │                      │                           │
      ├── 처리 후 응답 ────────>│──────────────────────────>│
      │                      │                           │
```

**Socket.IO 자동 재연결 장점**:
- Exponential backoff 내장 (수동 구현 불필요)
- 연결 복구 시 Room 자동 재참가
- 전송 중 끊어진 메시지 버퍼링 및 재전송

---

## 암호화 설계

### 단순화된 접근 (Happy 대비)

**Happy (복잡)**:
```
HMAC-SHA512 키 트리 → 채널별 파생 키 → XChaCha20-Poly1305
```

**Pocket AI (단순)**:
```
랜덤 대칭키 → QR 코드 전달 → AES-256-GCM
```

---

### AES-256-GCM 구현

**키 생성 (CLI)**:
```typescript
// Node.js
import crypto from 'crypto'

const key = crypto.randomBytes(32)  // 256-bit key
const keyBase64 = key.toString('base64')
```

**암호화**:
```typescript
function encrypt(plaintext: string, key: Buffer): EncryptedMessage {
  const nonce = crypto.randomBytes(12)  // 96-bit nonce
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ])
  const tag = cipher.getAuthTag()

  return {
    ciphertext: Buffer.concat([encrypted, tag]).toString('base64'),
    nonce: nonce.toString('base64')
  }
}
```

**복호화**:
```typescript
function decrypt(message: EncryptedMessage, key: Buffer): string {
  const nonce = Buffer.from(message.nonce, 'base64')
  const ciphertext = Buffer.from(message.ciphertext, 'base64')

  const tag = ciphertext.slice(-16)
  const encrypted = ciphertext.slice(0, -16)

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce)
  decipher.setAuthTag(tag)

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]).toString('utf8')
}
```

**PWA (Web Crypto API)**:
```typescript
async function encrypt(plaintext: string, key: CryptoKey): Promise<EncryptedMessage> {
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    key,
    encoded
  )

  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    nonce: btoa(String.fromCharCode(...nonce))
  }
}
```

---

### 왜 이 방식이 안전한가?

| 위협 | 방어 |
|-----|------|
| 서버 침해 | 대칭키 없음 (QR로만 전달) |
| 네트워크 도청 | AES-256-GCM 암호화 |
| 메시지 변조 | GCM 인증 태그 |
| 재전송 공격 | 매 메시지 고유 nonce |
| QR 노출 (디바이스 페어링) | 짧은 유효시간 + 1회용 |
| 저장된 히스토리 유출 | 서버에 저장된 메시지도 암호화 상태 |

---

### 메시지 포맷

```typescript
// 와이어 포맷 (서버를 통과하는 암호화된 메시지)
interface EncryptedMessage {
  sessionId: string       // 세션 식별자
  nonce: string           // Base64 인코딩된 12바이트 nonce
  ciphertext: string      // Base64 인코딩된 암호문 + 태그
  timestamp: number       // Unix 타임스탬프
  messageId: string       // 메시지 고유 ID
}

// 복호화 후 평문 메시지 (세션 프로토콜 이벤트)
type PlaintextMessage =
  | { type: 'text'; content: string; role: 'user' | 'assistant' }
  | { type: 'tool-call-start'; toolName: string; params?: Record<string, any> }
  | { type: 'tool-call-end'; toolName: string; result?: string; error?: string }
  | { type: 'turn-start'; turnId: string }
  | { type: 'turn-end'; turnId: string }
  | { type: 'start'; sessionId: string; cliType: string }
  | { type: 'stop'; reason?: string }
  | { type: 'error'; code: string; message: string }
```

---

## 배포 아키텍처

### 초기 (0-1000 사용자)

```
┌─────────────────────────────────────────────────────────────┐
│                        Fly.io (무료~$8)                      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              fly-server (단일 인스턴스)               │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │  Fastify    │  │  Socket.IO  │  │  PostgreSQL │  │   │
│  │  │  (HTTP)     │  │  (실시간)    │  │  (Fly PG)   │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                       Vercel (무료)                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    PWA Client                        │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │  Next.js    │  │  Static     │  │  Edge CDN   │  │   │
│  │  │  (SSR)      │  │  Assets     │  │  (글로벌)    │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**비용: $0-8/월**

---

### 성장 (1000-10000 사용자)

```
┌─────────────────────────────────────────────────────────────┐
│                     Fly.io ($50-150/월)                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              fly-server (2-3 인스턴스)               │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │  Instance 1 │  │  Instance 2 │  │  Instance 3 │  │   │
│  │  │  (sjc)      │  │  (nrt)      │  │  (ams)      │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│            ┌──────────────┼──────────────┐                  │
│            ▼              ▼              ▼                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ PostgreSQL  │  │   Redis     │  │ Socket.IO   │        │
│  │ (Fly.io)   │  │ (Pub/Sub)   │  │  Adapter    │        │
│  │ + Pooling   │  │ (인스턴스간) │  │ (Redis)     │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

**비용: $50-150/월**

**Socket.IO 다중 인스턴스 처리**:
- `@socket.io/redis-adapter` 사용
- Redis Pub/Sub로 인스턴스 간 이벤트 브로드캐스트
- Sticky Session 불필요 (Socket.IO Adapter가 처리)

---

### 대규모 (10000+ 사용자)

```
┌─────────────────────────────────────────────────────────────┐
│                    멀티 리전 배포                            │
│                                                             │
│   US-West          Asia-Pacific         Europe              │
│   ┌───────┐        ┌───────┐            ┌───────┐          │
│   │ Server│        │ Server│            │ Server│          │
│   │ (sjc) │        │ (nrt) │            │ (ams) │          │
│   └───┬───┘        └───┬───┘            └───┬───┘          │
│       │                │                    │               │
│       └────────────────┼────────────────────┘               │
│                        │                                    │
│              ┌─────────────────┐                            │
│              │ PostgreSQL      │                            │
│              │ + Read Replicas │                            │
│              └─────────────────┘                            │
│                                                             │
│   + Redis Cluster (Socket.IO Adapter + 세션 캐시)           │
│   + CDN (정적 자산)                                         │
│   + 모니터링 (Grafana/Prometheus)                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**비용: $300+/월**

---

## 확장 전략

### PostgreSQL 확장 전략

| 단계 | 구성 | 사용자 규모 |
|-----|------|-----------|
| 초기 | Fly.io PostgreSQL 단일 인스턴스 | ~1000 |
| 성장 | Connection Pooling (PgBouncer) | 1000-5000 |
| 확장 | Read Replicas + Connection Pooling | 5000-10000 |
| 대규모 | 멀티리전 PostgreSQL + Read Replicas | 10000+ |

### Socket.IO 확장

**단일 인스턴스 (초기)**:
- 기본 Socket.IO 서버로 충분
- Room 기반 세션 라우팅
- 메모리 내 세션 관리

**다중 인스턴스 (성장)**:
```typescript
// Redis Adapter로 인스턴스 간 Socket.IO 이벤트 동기화
import { createAdapter } from '@socket.io/redis-adapter'
import { createClient } from 'redis'

const pubClient = createClient({ url: process.env.REDIS_URL })
const subClient = pubClient.duplicate()

await Promise.all([pubClient.connect(), subClient.connect()])

io.adapter(createAdapter(pubClient, subClient))

// 이제 어떤 인스턴스에서든 Room 이벤트가 전파됨
// socket.to('session:abc').emit('message', data)
// → 모든 인스턴스의 session:abc Room 참가자에게 전달
```

**장점 (raw WebSocket 대비)**:
- Sticky Session 불필요 (Adapter가 처리)
- 자동 재연결/하트비트 내장
- Room/Namespace로 세션 격리
- 바이너리 전송 지원

---

## 환경 변수

### Server

```env
# 필수
NODE_ENV=production
PORT=8080

# 데이터베이스
DATABASE_URL=postgres://user:pass@localhost:5432/pocket_ai

# 보안
SESSION_SECRET=random-secret-for-session
MAX_CONNECTIONS_PER_SESSION=5

# Socket.IO
ALLOWED_ORIGINS=https://pocket-ai.app,https://www.pocket-ai.app

# 확장 시
REDIS_URL=redis://...
```

### PWA

```env
NEXT_PUBLIC_API_URL=https://api.pocket-ai.app
NEXT_PUBLIC_WS_URL=wss://api.pocket-ai.app
```

### CLI

```env
POCKET_AI_SERVER=https://api.pocket-ai.app
POCKET_AI_LOG_LEVEL=info
```

### Agent

```env
POCKET_AI_SERVER=https://api.pocket-ai.app
POCKET_AI_TOKEN=<인증 토큰>
```

---

## 성능 특성

| 작업 | 예상 지연시간 |
|-----|--------------|
| QR 스캔 → 디바이스 페어링 | < 1초 |
| 메시지 암호화 | < 5ms |
| Socket.IO 중계 | 10-50ms |
| 모드 전환 (로컬↔리모트) | < 100ms |
| 데몬 세션 복구 | < 500ms |
| CLI 응답 | 100ms - 수초 (명령어 따라) |
| **총 왕복** | **200ms - 수초** |

---

## 결론

Pocket AI는 Happy 프로젝트의 검증된 아키텍처를 참조하되, 핵심만 단순화하여 적용합니다:

1. **CLI/Agent 분리**: AI CLI 래퍼와 원격 제어 도구를 분리하여 관심사 명확화
2. **데몬 프로세스**: 터미널 독립적 세션 유지로 진정한 원격 제어 실현
3. **로컬/리모트 모드**: 같은 세션을 키보드와 폰에서 끊김 없이 전환
4. **Socket.IO**: raw WebSocket 대비 자동 재연결, Room, 멀티플렉싱 내장
5. **비용 최적화**: 초기 무료~$8, PostgreSQL free tier 시작, 점진적 확장
6. **OAuth + QR 역할 분리**: OAuth/JWT로 사용자 인증, QR로 디바이스 페어링 + 암호화 키 교환
7. **단순한 암호화**: AES-256-GCM (서버 복호화 불가)

복잡성을 줄이고 핵심 가치에 집중합니다.
