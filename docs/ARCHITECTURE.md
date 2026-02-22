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
- 복잡한 HMAC-SHA512 키 트리 → ECDH P-256 키교환 → AES-256-GCM 대칭키 파생
- Kysely (경량 타입세이프 Query Builder) 사용
- GitHub OAuth + JWT + ECDH P-256 키교환으로 E2E 자동 체결 (QR 불필요)
- Expo 네이티브 앱 → PWA (Phase 2에서 네이티브 고려)
- 소셜/아티팩트/음성 기능 → 초기 제외

### 3. Happy에서 가져온 핵심 개념
- **CLI 단일 패키지**: `cli` 하나에서 `start`/`remote`/`status`/`stop` 서브커맨드로 AI 래핑 + 원격 제어 통합
- **데몬 프로세스**: 터미널 독립적으로 세션을 유지하는 백그라운드 프로세스
- **로컬/리모트 모드 전환**: 같은 세션을 키보드(로컬)와 폰(리모트)에서 끊김 없이 전환
- **Socket.IO**: raw WebSocket 대신 Socket.IO (rooms, 자동 재연결, 멀티플렉싱)

### 4. 점진적 확장
- MVP는 최소로 시작
- 수요에 따라 기능 추가
- 인프라는 필요할 때 업그레이드

### 5. 입력 검증 필수 (Zod)
- 모든 REST API 요청과 Socket.IO 이벤트 페이로드를 Zod 스키마로 검증
- `@pocket-ai/wire` 패키지에 공유 스키마 정의 → 서버와 클라이언트 모두 재사용
- `request.body as any` 패턴 금지 → 반드시 Zod parse 후 사용

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
│                  │   (Railway)         │                                │
│                  │                     │                                │
│                  │  - Fastify          │                                │
│                  │  - Socket.IO Server │                                │
│                  │  - PostgreSQL       │                                │
│                  │  - 암호화된         │                                │
│                  │    메시지만 중계    │                                │
│                  └─────────────────────┘                                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**핵심 차이점 (기존 대비)**:
- PC에서 `CLI` 단일 패키지가 AI 래핑 + 원격 제어 모두 담당 (서브커맨드로 전환)
- CLI에 Daemon 프로세스 포함 (세션 유지)
- 모든 실시간 통신이 Socket.IO 기반
- `pocket-ai remote` 서브커맨드로 다른 환경에서도 세션 접속 가능

---

## 패키지 구조

```
pocket-ai/
├── apps/
│   ├── server/          # Fastify + Socket.IO 릴레이 서버
│   └── pwa/             # Next.js PWA 클라이언트 (Phase 2: Expo 네이티브)
├── packages/
│   ├── cli/             # CLI 래퍼 + 원격 제어 통합 (start/remote/status/stop)
│   └── wire/            # 와이어 프로토콜, 타입, 암호화, Zod 스키마
└── docs/
```

### 패키지 역할 분리

| 패키지 | 역할 | 설치 위치 | 사용자 |
|--------|------|----------|--------|
| `cli` | AI CLI 래핑 + 원격 세션 제어 통합. pocket-ai start/remote/status/stop | PC (글로벌 설치) | 개발자 |
| `wire` | 프로토콜 타입, 암호화, Zod 스키마, 검증 유틸리티 | 내부 의존성 | 모든 패키지 |

**왜 통합하는가?**
- 사용자가 하나의 패키지(`@pocket-ai/cli`)만 알면 됨
- `pocket-ai start` (호스트 모드), `pocket-ai remote` (원격 접속) 서브커맨드로 직관적 전환
- 관심사는 내부 모듈로 분리하되, 외부 인터페이스는 단일 진입점

---

## 컴포넌트 아키텍처

### apps/server/ (릴레이 서버)

**역할**: 암호화된 메시지 순수 중계 (Pure Relay) + 세션 관리

```
apps/server/
├── src/
│   ├── index.ts              # 서버 진입점 (Fastify + Socket.IO + JWT + OAuth2)
│   ├── routes/
│   │   ├── auth.ts           # GitHub OAuth 콜백 → DB 사용자 생성/갱신 → JWT → PWA 리다이렉트
│   │   └── sessions.ts       # 인메모리 activeSessions Map (POST: 세션 등록, GET: 온라인 세션 목록)
│   ├── socket.ts             # Socket.IO 이벤트 핸들러 (client-auth, session-join, update, disconnect)
│   └── db/
│       ├── db.ts             # Kysely + PostgreSQL (pg Pool). 3 테이블: users, oauth_accounts, subscriptions
│       └── migrations/
│           └── 001_initial.ts  # users, oauth_accounts, subscriptions 테이블 생성
├── railway.toml               # Railway 배포 설정
├── Dockerfile
└── package.json
```

**핵심 기능**:
- Socket.IO 서버 + Room 기반 세션 라우팅 (`session_${sessionId}`)
- 암호화된 메시지 중계 (서버 복호화 불가 — Pure Relay)
- 인메모리 세션 상태 관리 (activeSessions Map)
- GitHub OAuth → DB 사용자 관리 → JWT 발급
- 세션 TTL 관리: 오프라인 세션 30분 후 자동 cleanup (메모리 누수 방지)
- 세션 ID: `crypto.randomUUID()` 사용 (암호학적 안전)

**기술 스택**:
- Runtime: Node.js 20+
- Framework: Fastify 4.x
- 실시간: Socket.IO 4.x (rooms, 자동 재연결, 멀티플렉싱)
- Auth: @fastify/jwt, @fastify/oauth2 (GitHub)
- Database: PostgreSQL + Kysely (Query Builder) + pg Pool
- Validation: Zod (입력 검증)

**Socket.IO 이벤트 구조**:
```typescript
import Fastify from 'fastify'
import { Server } from 'socket.io'
import { activeSessions } from './routes/sessions.js'

const fastify = Fastify({ logger: true })
const io = new Server(fastify.server, {
  cors: { origin: '*' }
})

io.on('connection', (socket) => {
  // 1. CLI가 세션 인증
  socket.on('client-auth', ({ sessionId, token }) => {
    const decoded = fastify.jwt.verify(token)
    const session = activeSessions.get(sessionId)
    if (session && session.userId === decoded.sub) {
      session.status = 'online'
      session.socketId = socket.id
      socket.join(`session_${sessionId}`)
      socket.emit('auth-success', { sessionId })
    }
  })

  // 2. PWA가 세션에 참가 (온라인 상태 확인 후)
  socket.on('session-join', ({ sessionId, token }) => {
    const decoded = fastify.jwt.verify(token)
    const session = activeSessions.get(sessionId)
    if (session && session.userId === decoded.sub && session.status === 'online') {
      socket.join(`session_${sessionId}`)
      // CLI의 ECDH 공개키를 PWA에 전달
      socket.emit('join-success', { sessionId, publicKey: session.publicKey })
    }
  })

  // 3. 키교환 이벤트 (별도 분리)
  socket.on('key-exchange', (payload) => {
    const { sessionId, publicKey } = payload
    if (!socket.rooms.has(`session_${sessionId}`)) return
    socket.to(`session_${sessionId}`).emit('key-exchange', payload)
  })

  // 4. 암호화된 메시지 순수 중계 (복호화 없음, Room 멤버십 검증)
  socket.on('update', (payload) => {
    const { sessionId, body } = payload
    if (!sessionId || !body) return
    if (!socket.rooms.has(`session_${sessionId}`)) return
    socket.to(`session_${sessionId}`).emit('update', payload)
  })

  socket.on('disconnect', () => {
    // 해당 소켓의 세션을 offline 으로 표시
  })
})
```

**키교환과 메시지 중계 분리**:

| 이벤트 | 용도 | 검증 |
|--------|------|------|
| `client-auth` | CLI 인증 + Room 참가 | JWT 검증 |
| `session-join` | PWA 인증 + Room 참가 | JWT 검증 + 소유권 확인 |
| `key-exchange` | ECDH 공개키 교환 | Room 멤버십 검증 |
| `update` | 암호화된 메시지 중계 | Room 멤버십 검증 |

**중요**: `update` 이벤트에서 반드시 `socket.rooms.has(`session_${sessionId}`)`로 Room 멤버십을 검증해야 한다.
Room에 참여하지 않은 소켓의 메시지는 드롭한다.

---

### apps/pwa/ (PWA 클라이언트)

**역할**: 모바일/데스크톱 브라우저에서 원격 제어

```
apps/pwa/
├── src/
│   ├── app/
│   │   ├── layout.tsx        # 루트 레이아웃
│   │   ├── page.tsx          # 홈 (→ /login 리다이렉트)
│   │   ├── login/
│   │   │   └── page.tsx      # GitHub OAuth 로그인
│   │   └── dashboard/
│   │       └── page.tsx      # 세션 목록 → TerminalChat 진입
│   └── components/
│       ├── TerminalChat.tsx  # 구조화 채팅 UI + Socket.IO + ECDH 키교환 + E2E 암호화
│       ├── MessageList.tsx   # text/tool 메시지 리스트 렌더러, 자동 스크롤
│       └── ToolCard.tsx      # 툴 카드 (아이콘, 상태, 접힘/펼침 출력)
├── public/
│   └── manifest.json         # PWA 매니페스트
├── next.config.js
└── package.json
```

**핵심 기능**:
- 계정 로그인으로 자동 세션 발견 + ECDH 키교환
- E2E 암호화 메시지 송수신 (구조화 채팅 UI: 텍스트 블록 + 툴 카드)
- CLI로부터 `text` / `tool-call` / `tool-result` 구조화 이벤트 수신 → 각 이벤트는 항상 새 버블로 렌더링
- Socket.IO 자동 재연결
- PWA 설치 가능

**기술 스택**:
- Framework: Next.js 14+ (App Router)
- Styling: Tailwind CSS
- 실시간: socket.io-client
- 메시지 렌더러: 구조화 채팅 UI (xterm.js 제거, 커스텀 MessageList/ToolCard 컴포넌트)
- Crypto: @pocket-ai/wire (Web Crypto API 기반 ECDH + AES-256-GCM)

**Socket.IO 클라이언트 예시 (TerminalChat.tsx)**:
```typescript
import { io } from 'socket.io-client'
import { generateECDHKeyPair, deriveSharedSecret, importPublicKey,
         exportPublicKey, encrypt, decrypt } from '@pocket-ai/wire'

// 1. PWA ECDH 키쌍 생성
const keyPair = await generateECDHKeyPair()
const pubBase64 = await exportPublicKey(keyPair.publicKey)

const socket = io(SERVER_URL)

socket.on('connect', () => {
  socket.emit('session-join', { sessionId, token })
})

// 2. CLI 공개키 수신 → 공유 비밀키 파생
socket.on('join-success', async (data) => {
  const cliPubKey = await importPublicKey(data.publicKey)
  sharedSecret = await deriveSharedSecret(keyPair.privateKey, cliPubKey)

  // 3. PWA 공개키를 CLI에 전달
  socket.emit('key-exchange', { sessionId, publicKey: pubBase64, sender: 'pwa' })
})

// 4. CLI로부터 암호화된 구조화 메시지 수신 → 복호화 → 메시지 상태 업데이트
socket.on('update', async (payload) => {
  if (payload.sender === 'cli' && payload.body) {
    const decrypted = await decrypt(payload.body, sharedSecret)
    const msg = JSON.parse(decrypted)

    if (msg.t === 'text') {
      // AI 응답 텍스트 — 항상 새 버블 생성 (JSONL 한 턴 = 완전한 응답 하나)
      setMessages(prev => [...prev, { kind: 'text', id: crypto.randomUUID(), content: msg.text }])
    }
    if (msg.t === 'tool-call') {
      // 툴 카드 추가 (running 상태)
      setMessages(prev => [...prev, { kind: 'tool', id: msg.id, name: msg.name, args: msg.arguments, status: 'running' }])
    }
    if (msg.t === 'tool-result') {
      // 툴 카드 업데이트 (done/error 상태)
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, output: msg.result, status: 'done' } : m))
    }
  }
})

// 5. 사용자 타이핑 → 암호화 → CLI로 전송
const encryptedBody = await encrypt(JSON.stringify({ t: 'text', text: input }), sharedSecret)
socket.emit('update', { t: 'encrypted', sessionId, sender: 'pwa', body: encryptedBody })
```

---

### packages/cli/ (CLI 래퍼 + 원격 제어 통합)

**역할**: AI CLI(claude, codex 등) 래핑 + JSONL 세션 감시 + E2E 암호화 릴레이

```
packages/cli/
├── src/
│   ├── index.ts              # CLI 진입점 (commander)
│   ├── commands/
│   │   ├── start.ts          # AI CLI 시작 (메인 커맨드)
│   │   ├── remote.ts         # 원격 세션 접속
│   │   ├── status.ts         # 데몬 상태
│   │   ├── stop.ts           # 데몬 종료
│   │   └── login.ts          # GitHub OAuth 로그인
│   ├── server/
│   │   └── connection.ts     # Socket.IO 서버 연결 + 키교환 처리
│   ├── utils/
│   │   ├── session-watcher.ts # JSONL 세션 파일 폴링 → 구조화 이벤트 추출
│   │   └── output-parser.ts  # (레거시: ANSI 파서, 현재 미사용)
│   ├── session-manager.ts    # CWD 변경 감지, 세션 키 관리
│   └── config.ts             # 서버 URL, 토큰 저장
├── bin/
│   └── pocket-ai.js          # CLI 진입점
└── package.json
```

**핵심 기능**:
- AI CLI 프로세스 스폰 (node-pty) + 로컬 터미널에 raw ANSI 출력 그대로 전달
- **JSONL 세션 감시** (`ClaudeSessionWatcher`): Claude Code가 기록하는 `~/.claude/projects/{escaped-cwd}/{session}.jsonl` 파일을 500ms 폴링으로 읽어 완전한 응답 추출
  - PTY ANSI 파싱 방식의 문제: 전체화면 TUI가 스트리밍 토큰마다 전체 재렌더링 → 동일 행 반복 출력 → 구조화 이벤트 추출 불가
  - JSONL 방식: 턴 완료 후 하나의 완전한 `assistant` 엔트리 기록 → 정확한 텍스트/툴 이벤트 추출
- ECDH P-256 키쌍 생성 후 공개키를 서버에 등록 → PWA와 공유 비밀키 파생
- Socket.IO로 서버 연결 및 자동 재연결
- PWA 메시지 수신 → `shell.write()` → AI CLI에 전달
- `pocket-ai login` — GitHub OAuth 로그인

**기술 스택**:
- Runtime: Node.js 20+
- Process: node-pty
- Crypto: @pocket-ai/wire (ECDH + AES-256-GCM)
- 실시간: socket.io-client
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

### packages/wire/ (와이어 프로토콜)

**역할**: 프로토콜 정의, 타입, 암호화 유틸리티 공유

```
packages/wire/
├── src/
│   ├── encryption.ts         # ECDH P-256 키생성, deriveSharedSecret (→ AES-256-GCM),
│   │                         # exportPublicKey, importPublicKey, encrypt, decrypt
│   ├── types.ts              # SessionPayload 타입 (text, tool-call, tool-result, session-event), ApiResponse
│   ├── schemas.ts            # Zod 스키마 정의 (REST 요청 + Socket.IO 이벤트 페이로드)
│   ├── socket.ts             # Socket 이벤트 타입 정의
│   └── index.ts              # 모든 export 재내보내기
└── package.json
```

**세션 프로토콜 이벤트**:

| 이벤트 | 방향 | 설명 |
|--------|------|------|
| `text` | 양방향 | 사용자/에이전트 텍스트 메시지 |
| `tool-call` | CLI → Client | 도구 호출 (도구명, 파라미터, 결과) |
| `tool-result` | CLI → Client | 도구 호출 결과 |
| `session-event` | 양방향 | 세션 상태 이벤트 |

```typescript
// wire/src/types.ts 에 정의된 SessionPayload 타입
type SessionPayload =
  | { t: 'text'; text: string }
  | { t: 'tool-call'; id: string; name: string; arguments: string }
  | { t: 'tool-result'; id: string; result: string; error?: string }
  | { t: 'session-event'; event: string; data?: unknown }
```

**JSONL → SessionPayload 변환 (ClaudeSessionWatcher)**:

| JSONL 엔트리 | SessionPayload |
|--------------|---------------|
| `assistant.content[].type === 'text'` | `{ t: 'text', text }` |
| `assistant.content[].type === 'tool_use'` | `{ t: 'tool-call', id, name, arguments: JSON.stringify(input) }` |
| `user.content[].type === 'tool_result'` | `{ t: 'tool-result', id: tool_use_id, result }` |

---

## 통신 흐름

### 1. 초기 연결 (OAuth 로그인 + 계정 기반 세션 발견)

```
PWA (사용자 폰)                  Server                  PC (CLI Package)
    │                               │                          │
    ├── 1. GitHub OAuth 로그인 ─────>│                          │
    │<──────── JWT 반환 ─────────────┤                          │
    │   (redirect: /login?token=...) │                          │
    │                               │   2. pocket-ai start      │
    │                               │<───────────────────────── ┤
    │                               │   POST /api/sessions      │
    │                               │   { publicKey: ECDH공개키 }│
    │                               │                          │
    │                               ├── 3. sessionId 반환       │
    │                               │─────────────────────────>│
    │                               │                          │
    │                               │   4. client-auth 이벤트   │
    │                               │<── socket.emit ──────────┤
    │                               │   { sessionId, token }   │
    │                               │   → activeSessions 온라인 │
    │                               │   → session_${id} Room 참가│
    │                               │                          │
    ├── 5. GET /api/sessions ───────>│                          │
    │   (온라인 세션 목록 조회)       │                          │
    │<── 세션 목록 반환 ─────────────┤                          │
    │   [{ sessionId, publicKey }]  │                          │
    │                               │                          │
    ├── 6. session-join 이벤트 ─────>│                          │
    │   { sessionId, token }        │                          │
    │<── join-success ──────────────┤                          │
    │   { publicKey: CLI ECDH 공개키 }│                         │
    │                               │                          │
    │   7. ECDH 키교환 (자동)        │                          │
    │   PWA 공개키 → update 이벤트 ─>│──── relay ──────────────>│
    │                               │                          │
    │         8. 양측 공유 비밀키 파생 (ECDH → AES-256-GCM 키)  │
    │                  E2E 암호화 세션 활성화                    │
    │                                                          │
```

**핵심**:
- 사용자 인증: GitHub OAuth + JWT (QR 코드 불필요)
- 세션 발견: 같은 계정 로그인 → 온라인 세션 목록 자동 조회
- 암호화 키교환: ECDH P-256 공개키 교환 → AES-256-GCM 공유 비밀키 파생
- 서버는 ECDH 개인키를 알 수 없으므로 복호화 불가
- Socket.IO Room (`session_${sessionId}`)으로 세션 참가자 그룹핑

---

### 2. 암호화 메시지 흐름 (Socket.IO)

```
PWA Client                 Server (Socket.IO)         PC (CLI + Daemon)
    │                        │                           │
    │ 1. 명령어 암호화         │                           │
    │ encryptedBody = encrypt(cmd, sharedSecret)         │
    │                        │                           │
    ├── 2. socket.emit ──────>│                           │
    │ event: 'update'        │                           │
    │ data: { sessionId,     │                           │
    │   sender: 'pwa',       │                           │
    │   body: encryptedBody }│                           │
    │                        │                           │
    │                        ├── 3. Room 브로드캐스트 ───>│
    │                        │ socket.to(room).emit('update', payload)
    │                        │ (복호화 없이 그대로 전달)   │
    │                        │                           │
    │                        │               4. 복호화    │
    │                        │               cmd = decrypt(body, sharedSecret)
    │                        │                           │
    │                        │               5. AI CLI 실행
    │                        │               claude(cmd)  │
    │                        │                           │
    │                        │               6. 응답 암호화
    │                        │<── socket.emit('update') ─┤
    │                        │   { sender: 'cli',        │
    │                        │     body: encryptedReply } │
    │<──── Room relay ───────┤                           │
    │                        │                           │
    │ 7. 복호화 및 터미널 출력  │                           │
    │ term.write(decrypted)  │                           │
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
    │                        │<──── update 이벤트 ─────────┤
    │                        │                           │
    │<── Room relay ─────────┤                           │
    │                        │                           │
    │  데몬이 수신             │                           │
    │  → mode: 'remote'      │                           │
    │  → 메시지를 AI CLI에 전달│                           │
    │  → 출력을 서버로 중계     │                           │
    │                        │                           │
    │── emit('update') ─────>│────── Room relay ────────>│
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
      │                      │<── update 이벤트 전송 ──────┤
      │                      │   (Room에 CLI 없으면 유실)  │
      │                      │                           │
   CLI/Daemon Online         │                           │
      │                      │                           │
      ├── Socket.IO 자동 재연결>│                           │
      │   (exponential backoff)│                          │
      │                      │                           │
      ├── client-auth 이벤트 ─>│                           │
      │   Room 재참가          │                           │
      │   session_${sessionId}│                           │
      │                      │                           │
      │<── PWA가 재연결 감지 ───┤──── session-offline ─────>│
      │   PWA가 session-join  │                           │
      │   재시도              │                           │
      │                      │                           │
```

**Socket.IO 자동 재연결 장점**:
- Exponential backoff 내장 (수동 구현 불필요)
- 연결 복구 시 Room 재참가
- 오프라인 구간 메시지는 유실 (서버에 히스토리 저장하지 않음 — Pure Relay 원칙)

---

## 암호화 설계

### 단순화된 접근 (Happy 대비)

**Happy (복잡)**:
```
HMAC-SHA512 키 트리 → 채널별 파생 키 → XChaCha20-Poly1305
```

**Pocket AI (구현됨)**:
```
ECDH P-256 키교환 → AES-256-GCM 대칭키 파생
```

---

### ECDH P-256 + AES-256-GCM 구현 (Web Crypto API)

**키 생성 (CLI 및 PWA 모두 동일 — `@pocket-ai/wire` 사용)**:
```typescript
import { generateECDHKeyPair } from '@pocket-ai/wire'

// ECDH P-256 키쌍 생성
const keyPair = await generateECDHKeyPair()
// keyPair.publicKey  → 서버를 통해 상대방에게 전달
// keyPair.privateKey → 로컬에 보관, 절대 전송하지 않음
```

**공유 비밀키 파생**:
```typescript
import { deriveSharedSecret, importPublicKey } from '@pocket-ai/wire'

// 상대방 공개키를 base64에서 CryptoKey로 변환
const peerPublicKey = await importPublicKey(peerPublicKeyBase64)

// ECDH → AES-256-GCM 키 파생
const sharedSecret = await deriveSharedSecret(myPrivateKey, peerPublicKey)
```

**암호화 / 복호화 (Web Crypto API, `@pocket-ai/wire`)**:
```typescript
import { encrypt, decrypt, EncryptedData } from '@pocket-ai/wire'

// 암호화
const encrypted: EncryptedData = await encrypt(plaintext, sharedSecret)
// encrypted = { cipher: string, iv: string }  (Base64 인코딩)

// 복호화
const plaintext: string = await decrypt(encrypted, sharedSecret)
```

---

### 왜 이 방식이 안전한가?

| 위협 | 방어 |
|-----|------|
| 서버 침해 | ECDH 비밀키 미보유, 대칭키 파생 불가 |
| 네트워크 도청 | AES-256-GCM 암호화 |
| 메시지 변조 | GCM 인증 태그 |
| 재전송 공격 | 매 메시지 고유 IV (nonce) |
| ECDH MITM | JWT 인증으로 세션 소유자 검증 |

---

### 메시지 포맷

```typescript
// wire/src/encryption.ts 에 정의된 암호화 컨테이너
interface EncryptedData {
  cipher: string  // Base64 인코딩된 암호문 (AES-256-GCM 출력)
  iv: string      // Base64 인코딩된 12바이트 IV (nonce)
}

// Socket.IO 'update' 이벤트 페이로드 (서버를 통과하는 실제 형식)
interface UpdatePayload {
  sessionId: string       // 세션 식별자
  sender: 'pwa' | 'cli'  // 발신자 구분
  body?: EncryptedData    // 암호화된 본문 (ECDH 키교환 완료 후)
  k?: string              // ECDH 공개키 교환 시 사용 (Base64)
  t?: string              // 메시지 타입 힌트 (예: 'encrypted')
}

// 복호화 후 평문 메시지 (SessionPayload — wire/src/types.ts)
type SessionPayload =
  | { t: 'text'; text: string }
  | { t: 'tool-call'; id: string; name: string; arguments: string }
  | { t: 'tool-result'; id: string; result: string; error?: string }
  | { t: 'session-event'; event: 'typing' | 'stopped-typing' | 'processing' }
```

---

## 배포 아키텍처

### 초기 (0-1000 사용자)

```
┌─────────────────────────────────────────────────────────────┐
│                        Railway (무료~$8)                      │
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
│                     Railway ($50-150/월)                     │
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
│  │ (Railway)  │  │ (Pub/Sub)   │  │  Adapter    │        │
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
| 초기 | Railway + Supabase PostgreSQL | ~1000 |
| 성장 | Connection Pooling (PgBouncer) | 1000-5000 |
| 확장 | Read Replicas + Connection Pooling | 5000-10000 |
| 대규모 | 멀티리전 PostgreSQL + Read Replicas | 10000+ |

### Socket.IO 확장

**단일 인스턴스 (초기)**:
- 기본 Socket.IO 서버로 충분
- Room 기반 세션 라우팅 (`session_${sessionId}`)
- 인메모리 activeSessions Map으로 세션 관리

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
// socket.to('session_abc').emit('update', data)
// → 모든 인스턴스의 session_abc Room 참가자에게 전달
```

**장점 (raw WebSocket 대비)**:
- Sticky Session 불필요 (Adapter가 처리)
- 자동 재연결/하트비트 내장
- Room/Namespace로 세션 격리
- 바이너리 전송 지원

---

## 환경 변수

**주의**: 필수 환경변수가 설정되지 않으면 서버 시작을 거부합니다 (기본값 사용 금지).

### Server

```env
# 필수
NODE_ENV=production
PORT=8080

# 데이터베이스 (필수)
DATABASE_URL=postgres://user:pass@localhost:5432/pocket_ai

# JWT (필수)
JWT_SECRET=random-secret-for-jwt

# GitHub OAuth (필수)
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_CALLBACK_URL=https://pocket-ai-production.up.railway.app/auth/github/callback

# PWA URL (OAuth 콜백 리다이렉트 대상)
PWA_URL=https://pocket-ai-pwa.vercel.app

# Socket.IO
ALLOWED_ORIGINS=https://pocket-ai-pwa.vercel.app

# 확장 시
REDIS_URL=redis://...
```

### PWA

```env
NEXT_PUBLIC_API_URL=https://pocket-ai-production.up.railway.app
NEXT_PUBLIC_WS_URL=wss://pocket-ai-production.up.railway.app
```

### CLI

```env
POCKET_AI_SERVER=https://pocket-ai-production.up.railway.app
POCKET_AI_LOG_LEVEL=info
```

---

## 성능 특성

| 작업 | 예상 지연시간 |
|-----|--------------|
| OAuth 로그인 → JWT 발급 | < 2초 |
| 세션 목록 조회 | < 100ms |
| ECDH 키교환 (자동) | < 200ms |
| 메시지 암호화 (Web Crypto) | < 5ms |
| Socket.IO 중계 | 10-50ms |
| 모드 전환 (로컬↔리모트) | < 100ms |
| 데몬 세션 복구 | < 500ms |
| CLI 응답 | 100ms - 수초 (명령어 따라) |
| JSONL 폴링 지연 | < 500ms (응답 완료 후 ~ 500ms 이내 감지) |
| **총 왕복** | **200ms - 수초** |

---

## 결론

Pocket AI는 Happy 프로젝트의 검증된 아키텍처를 참조하되, 핵심만 단순화하여 적용합니다:

1. **CLI 단일 패키지 통합**: AI CLI 래퍼와 원격 제어를 `@pocket-ai/cli` 하나로 통합. `start`/`remote`/`status`/`stop` 서브커맨드로 직관적 전환 (설계 완료, 구현 예정)
2. **데몬 프로세스**: 터미널 독립적 세션 유지로 진정한 원격 제어 실현 (설계 완료, 구현 예정)
3. **로컬/리모트 모드**: 같은 세션을 키보드와 폰에서 끊김 없이 전환 (설계 완료, 구현 예정)
4. **Socket.IO**: raw WebSocket 대비 자동 재연결, Room, 멀티플렉싱 내장. 키교환(`key-exchange`)과 메시지 중계(`update`) 이벤트 분리, Room 멤버십 검증 필수 (구현 완료)
5. **비용 최적화**: 초기 무료~$8, PostgreSQL free tier 시작, 점진적 확장
6. **OAuth + 계정 기반 세션 발견**: GitHub OAuth/JWT로 사용자 인증, 같은 계정으로 세션 자동 발견 (QR 불필요)
7. **ECDH P-256 + AES-256-GCM**: 키교환 자동화, 서버 복호화 불가 (Pure Relay)
8. **Kysely**: 타입세이프 Query Builder로 PostgreSQL 접근 (users, oauth_accounts, subscriptions 3 테이블)
9. **Zod 입력 검증**: 모든 REST API 요청과 Socket.IO 이벤트 페이로드를 `@pocket-ai/wire`의 공유 스키마로 검증. `request.body as any` 패턴 금지

복잡성을 줄이고 핵심 가치에 집중합니다.
