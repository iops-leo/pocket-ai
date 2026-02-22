# Pocket AI API Reference

OAuth 로그인 + JWT 인증 + Socket.IO 기반 실시간 통신 + REST API - 세션 수명주기 전체를 커버하는 API 문서

## 목차

- [개요](#개요)
- [REST API](#rest-api)
  - [인증 (OAuth)](#인증-oauth)
  - [세션 관리](#세션-관리)
  - [헬스체크](#헬스체크)
- [Socket.IO Protocol](#socketio-protocol)
- [Wire Protocol (메시지 타입)](#wire-protocol-메시지-타입)
- [에러 처리](#에러-처리)
- [예제](#예제)

---

## 개요

### 아키텍처

```
REST API:   인증(OAuth) 및 세션 관리
Socket.IO:  실시간 암호화 메시지 중계 (이벤트 기반)
```

### 주요 변경사항 (기존 대비)

| 항목 | 기존 | 변경 |
|------|------|------|
| 실시간 통신 | Raw WebSocket | **Socket.IO** |
| 메시지 타입 | 4종 (command/response/error/ping) | **세션 메시지 타입** (text/tool-call/tool-result/session-event) |
| REST 엔드포인트 | 5개 | **5개** (OAuth 2개 + 세션 2개 + 헬스체크 1개) |
| 공유 패키지 | `shared` | **`wire`** |
| 세션 저장소 | DB | **인메모리 Map** |
| 패키지 구조 | 통합 | **CLI와 Agent 분리** |

### Base URL

```
Production:  https://pocket-ai-production.up.railway.app
Socket.IO:   https://pocket-ai-production.up.railway.app (path: /v1/updates)
```

### 패키지 구조

```
pocket-ai/
├── packages/
│   ├── cli/        # CLI 인터페이스 (터미널, 세션 시작)
│   ├── agent/      # Agent 코어 (CLI 래핑, 메시지 처리)
│   └── wire/       # 공유 타입, 프로토콜, 암호화 유틸리티
├── apps/
│   ├── server/     # 릴레이 서버 (REST + Socket.IO)
│   └── pwa/        # PWA 클라이언트
└── docs/
```

---

## REST API

### 인증 헤더

세션 관련 API는 JWT 인증이 필요합니다.

```http
Authorization: Bearer <jwt_token>
```

JWT 없이 호출 시 `401 Unauthorized` 반환.

---

### 인증 (OAuth)

#### GitHub OAuth 로그인 시작

```http
GET /auth/github
```

사용자를 GitHub OAuth 인증 페이지로 리다이렉트합니다. `@fastify/oauth2` 플러그인으로 처리됩니다.

---

#### GitHub OAuth 콜백

```http
GET /auth/github/callback?code=xxx&state=yyy
```

GitHub 인증 완료 후 서버로 돌아오는 콜백입니다. 서버는 Kysely를 통해 DB에서 사용자를 생성하거나 업데이트하고, JWT를 발급한 뒤 토큰을 쿼리 파라미터로 포함하여 PWA로 리다이렉트합니다.

**동작 순서**:
1. GitHub에서 발급한 `code`로 액세스 토큰 교환
2. GitHub 사용자 정보 조회 (email, name)
3. DB에 사용자 upsert (`users` + `oauth_accounts` 테이블)
4. JWT 발급
5. PWA로 리다이렉트: `https://<pwa-url>?token=<jwt>`

### OAuth 콜백 보안 개선 (구현 예정)

현재: JWT를 URL 쿼리파라미터로 전달 (`/login?token=xxx`)
개선: 일회성 authorization code 패턴

1. 서버가 일회성 code 생성 → URL에 전달 (`/login?code=xxx`)
2. PWA가 code를 POST 요청으로 서버에 전송
3. 서버가 code 검증 후 JWT 반환 (응답 body)
4. code는 1회 사용 후 즉시 폐기 (5분 TTL)

---

### 세션 관리

세션은 인메모리 Map에 저장됩니다 (데이터베이스 저장 없음).

#### 세션 생성

CLI가 새 세션을 등록할 때 호출합니다. **JWT 인증 필수**.

```http
POST /api/sessions
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "publicKey": "BASE64_PUBLIC_KEY...",
  "metadata": {
    "hostname": "dev-macbook",
    "os": "darwin",
    "arch": "arm64",
    "workingDir": "/home/user/project"
  }
}
```

**Body 필드**:

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `publicKey` | string | 필수 | E2E 암호화용 공개키 |
| `metadata` | object | 선택 | 호스트 정보 등 임의 메타데이터 |

**Response (200)**:
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**세션 ID**: UUID v4 (`crypto.randomUUID()`)
예시: `550e8400-e29b-41d4-a716-446655440000`

---

#### 세션 목록 조회

PWA가 현재 인증된 사용자의 온라인 세션 목록을 가져옵니다. **JWT 인증 필수**.

```http
GET /api/sessions
Authorization: Bearer <jwt>
```

**Response (200)**:
```json
[
  {
    "sessionId": "a1b2c3d4-e5f6-...",
    "publicKey": "BASE64_PUBLIC_KEY...",
    "metadata": {
      "hostname": "dev-macbook",
      "os": "darwin",
      "arch": "arm64",
      "workingDir": "/home/user/project"
    },
    "status": "online"
  }
]
```

**응답 필드**:

| 필드 | 타입 | 설명 |
|------|------|------|
| `sessionId` | string | 세션 고유 ID (UUID) |
| `publicKey` | string | CLI가 등록한 공개키 |
| `metadata` | object | CLI가 등록한 메타데이터 |
| `status` | string | `"online"` 또는 `"offline"` |

**참고**: `status: "online"` 세션만 반환됩니다 (Socket.IO로 연결된 세션).

---

### 헬스체크

```http
GET /ping
```

**Response (200)**:
```json
{
  "pong": "it worked!"
}
```

---

## Socket.IO Protocol

Raw WebSocket 대신 Socket.IO를 사용합니다. 자동 재연결, 룸 기반 라우팅, 이벤트 기반 통신을 기본 제공합니다.

### 연결

```typescript
import { io } from 'socket.io-client'

const socket = io('https://pocket-ai-production.up.railway.app', {
  path: '/v1/updates',
  // Socket.IO 내장 재연결 (reconnection: true가 기본값)
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 30000
})
```

---

### CLI → Server 이벤트

#### `client-auth` - CLI 인증 및 세션 활성화

CLI가 Socket.IO에 연결한 뒤 세션을 활성화하기 위해 전송합니다.

```typescript
socket.emit('client-auth', {
  sessionId: 'a1b2c3d4-e5f6-...',
  token: jwtToken
})
```

**서버 동작**:
1. JWT 검증
2. 세션을 `online` 상태로 마킹
3. `session_<sessionId>` 룸에 참여

**성공 응답** (`auth-success`):
```typescript
socket.on('auth-success', (data) => {
  // data: { sessionId: string }
  console.log('인증 성공:', data.sessionId)
})
```

**실패 응답** (`auth-error`):
```typescript
socket.on('auth-error', (data) => {
  // data: { error: string }
  console.error('인증 실패:', data.error)
})
```

---

### PWA → Server 이벤트

#### `session-join` - PWA 세션 참여

PWA가 특정 세션에 참여할 때 전송합니다.

```typescript
socket.emit('session-join', {
  sessionId: 'a1b2c3d4-e5f6-...',
  token: jwtToken
})
```

**서버 동작**:
1. JWT 검증
2. 세션 소유자 확인 (토큰의 userId와 세션 userId 일치 여부)
3. `session_<sessionId>` 룸에 참여

**성공 응답** (`join-success`):
```typescript
socket.on('join-success', (data) => {
  // data: { sessionId: string, publicKey: string }
  // publicKey: E2E 암호화에 사용할 CLI 공개키
  console.log('참여 성공:', data.sessionId)
  console.log('공개키:', data.publicKey)
})
```

**실패 응답** (`join-error`):
```typescript
socket.on('join-error', (data) => {
  // data: { error: string }
  console.error('참여 실패:', data.error)
})
```

---

### 양방향 이벤트

#### `key-exchange` - ECDH 공개키 교환

**방향**: PWA → Server → CLI (또는 반대)
**인증**: Room 멤버십 검증 (`socket.rooms.has`)

키교환 메시지를 `update`와 분리하여 관심사를 명확히 한다.

**Payload**:
```typescript
interface KeyExchangePayload {
  sessionId: string;
  publicKey: string;  // Base64 인코딩된 ECDH 공개키 (SPKI)
  sender: 'cli' | 'pwa';
}
```

**서버 처리**:
```typescript
socket.on('key-exchange', (payload) => {
  const { sessionId } = payload;
  if (!socket.rooms.has(`session_${sessionId}`)) return;
  socket.to(`session_${sessionId}`).emit('key-exchange', payload);
});
```

---

#### `update` - 암호화 메시지 중계

CLI와 PWA 양쪽에서 상대방에게 메시지를 보낼 때 사용합니다. **서버는 `body`를 복호화하지 않고 룸에 그대로 중계합니다.**

**보안**: Room에 참여하지 않은 소켓의 메시지는 무조건 드롭한다.

```typescript
// 전송
socket.emit('update', {
  sessionId: 'a1b2c3d4-e5f6-...',
  sender: 'cli',           // 'cli' | 'pwa'
  body: {
    cipher: '...Base64 암호화된 데이터...',
    iv: '...Base64 초기화 벡터...'
  }
})
```

**필드**:

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `sessionId` | string | 필수 | 대상 세션 ID |
| `sender` | string | 필수 | 발신자 식별자 |
| `body` | object | 필수 | 암호화된 메시지 본문 (서버가 내용을 보지 않음) |
| `body.cipher` | string | 필수 | Base64 인코딩된 암호화 데이터 |
| `body.iv` | string | 필수 | Base64 인코딩된 초기화 벡터 |

**서버 처리**:
```typescript
socket.on('update', (payload) => {
  const { sessionId, body } = payload;
  if (!sessionId || !body) return;
  // Room 멤버십 검증 (필수)
  if (!socket.rooms.has(`session_${sessionId}`)) return;
  socket.to(`session_${sessionId}`).emit('update', payload);
});
```

**수신**:
```typescript
socket.on('update', (data) => {
  // data: { sessionId, sender, body: { cipher, iv } }
  // 서버가 같은 룸(session_<sessionId>)의 다른 소켓에 중계한 메시지
  const decryptedBody = decrypt(data.body)
  handleMessage(decryptedBody)
})
```

---

### Server → Client 이벤트

#### `session-offline` - 세션 오프라인 알림

CLI Socket이 연결 해제되면 같은 룸의 PWA에 전달됩니다.

```typescript
socket.on('session-offline', (data) => {
  // data: { sessionId: string }
  console.log('세션 오프라인:', data.sessionId)
})
```

---

### disconnect - 연결 해제

Socket 연결이 끊어지면 서버가 자동으로 처리합니다.

**서버 동작**:
1. 세션을 `offline` 상태로 마킹
2. 같은 룸에 `session-offline` 이벤트 전송

---

### 전체 이벤트 요약

| 이벤트 | 방향 | 용도 | 인증 |
|--------|------|------|------|
| `client-auth` | CLI → Server | CLI 인증 + Room 참가 | JWT 검증 |
| `session-join` | PWA → Server | PWA 인증 + Room 참가 | JWT + 소유권 |
| `key-exchange` | 양방향 (Server 중계) | ECDH 공개키 교환 | Room 멤버십 |
| `update` | 양방향 (Server 중계) | 암호화 메시지 중계 | Room 멤버십 |
| `auth-success` | Server → CLI | 인증 성공 응답 | - |
| `auth-error` | Server → CLI | 인증 실패 응답 | - |
| `join-success` | Server → PWA | 참여 성공 응답 (publicKey 포함) | - |
| `join-error` | Server → PWA | 참여 실패 응답 | - |
| `session-offline` | Server → PWA | CLI 연결 해제 알림 | - |

---

### Ping/Heartbeat

Socket.IO는 내장 heartbeat 메커니즘을 제공합니다. 별도의 ping/pong 구현이 불필요합니다.

```typescript
// Socket.IO 기본 설정 (서버측)
const io = new Server(httpServer, {
  pingInterval: 25000,   // 25초마다 ping
  pingTimeout: 20000     // 20초 무응답 시 연결 종료
})
```

---

## Wire Protocol (메시지 타입)

`wire` 패키지에서 정의하는 프로토콜입니다. `update` 이벤트의 `body`에 담겨 전송됩니다. 서버는 내용을 복호화하지 않습니다.

### 세션 메시지 타입

#### `SessionMessageText` - 텍스트 메시지

사용자 입력 또는 Agent의 텍스트 응답입니다.

```typescript
interface SessionMessageText {
  t: 'text'
  text: string    // 메시지 본문
}
```

**예시**:
```json
{
  "t": "text",
  "text": "src/index.ts 파일의 에러를 수정해줘"
}
```

---

#### `SessionMessageToolCall` - 도구 호출

Agent가 도구(파일 읽기, 코드 실행 등)를 호출할 때 사용합니다.

```typescript
interface SessionMessageToolCall {
  t: 'tool-call'
  id: string      // 도구 호출 고유 ID
  name: string    // 도구 이름 (예: "Read", "Edit", "Bash")
  arguments: any  // 도구에 전달된 인자
}
```

**예시**:
```json
{
  "t": "tool-call",
  "id": "call_001",
  "name": "Read",
  "arguments": {
    "file_path": "/home/user/project/src/index.ts"
  }
}
```

---

#### `SessionMessageToolResult` - 도구 결과

도구 실행 결과를 전달합니다.

```typescript
interface SessionMessageToolResult {
  t: 'tool-result'
  id: string      // 대응하는 tool-call의 ID
  result: any     // 도구 실행 결과
  error?: string  // 에러 발생 시 에러 메시지
}
```

**예시 (성공)**:
```json
{
  "t": "tool-result",
  "id": "call_001",
  "result": {
    "content": "import express from 'express';\n..."
  }
}
```

**예시 (실패)**:
```json
{
  "t": "tool-result",
  "id": "call_001",
  "result": null,
  "error": "파일을 찾을 수 없습니다"
}
```

---

#### `SessionEventMessage` - 세션 이벤트

타이핑 상태, 처리 중 등 세션 상태 이벤트를 전달합니다.

```typescript
interface SessionEventMessage {
  t: 'session-event'
  event: 'typing' | 'stopped-typing' | 'processing'
}
```

**이벤트 값**:

| event | 설명 |
|-------|------|
| `typing` | 사용자 또는 Agent가 입력 중 |
| `stopped-typing` | 입력 중단 |
| `processing` | Agent가 처리 중 |

**예시**:
```json
{
  "t": "session-event",
  "event": "processing"
}
```

---

### 전체 타입 정의 (wire 패키지)

```typescript
// wire/src/types.ts

export interface SessionMessageText {
  t: 'text'
  text: string
}

export interface SessionMessageToolCall {
  t: 'tool-call'
  id: string
  name: string
  arguments: any
}

export interface SessionMessageToolResult {
  t: 'tool-result'
  id: string
  result: any
  error?: string
}

export interface SessionEventMessage {
  t: 'session-event'
  event: 'typing' | 'stopped-typing' | 'processing'
}

export type SessionMessage =
  | SessionMessageText
  | SessionMessageToolCall
  | SessionMessageToolResult
  | SessionEventMessage
```

---

## 입력 검증 (Zod)

모든 REST API 요청과 Socket.IO 페이로드는 Zod 스키마로 검증한다.
스키마는 `@pocket-ai/wire` 패키지에 정의되어 서버와 클라이언트에서 공유한다.

### REST API 스키마

```typescript
import { z } from 'zod';

// POST /api/sessions
export const CreateSessionSchema = z.object({
  publicKey: z.string().min(1),
  metadata: z.object({
    hostname: z.string().optional(),
    engine: z.string().optional(),
  }).optional(),
});
```

### Socket.IO 페이로드 스키마

```typescript
export const ClientAuthSchema = z.object({
  sessionId: z.string().uuid(),
  token: z.string().min(1),
});

export const SessionJoinSchema = z.object({
  sessionId: z.string().uuid(),
  token: z.string().min(1),
});

export const KeyExchangeSchema = z.object({
  sessionId: z.string().uuid(),
  publicKey: z.string().min(1),
  sender: z.enum(['cli', 'pwa']),
});

export const UpdateSchema = z.object({
  sessionId: z.string().uuid(),
  sender: z.enum(['cli', 'pwa']),
  body: z.object({
    cipher: z.string().min(1),
    iv: z.string().min(1),
  }),
});
```

---

## DB 스키마

Kysely ORM으로 관리합니다 (Prisma 미사용).

### `users` 테이블

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | uuid (PK) | 사용자 고유 ID |
| `email` | string | 이메일 |
| `name` | string | 표시 이름 |
| `created_at` | timestamp | 생성 시각 |
| `last_login_at` | timestamp | 마지막 로그인 시각 |

### `oauth_accounts` 테이블

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | uuid (PK) | 계정 고유 ID |
| `user_id` | uuid (FK → users) | 연결된 사용자 |
| `provider` | string | OAuth 제공자 (예: `"github"`) |
| `provider_account_id` | string | 제공자 측 계정 ID |
| `created_at` | timestamp | 연결 시각 |

### `subscriptions` 테이블

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | uuid (PK) | 구독 고유 ID |
| `user_id` | uuid (FK → users) | 구독 사용자 |
| `status` | string | 구독 상태 |
| `plan` | string | 플랜 이름 |
| `current_period_end` | timestamp | 현재 구독 기간 만료 시각 |
| `created_at` | timestamp | 생성 시각 |
| `updated_at` | timestamp | 마지막 갱신 시각 |

**참고**: 세션은 인메모리 Map에 저장됩니다. 서버 재시작 시 세션 데이터가 초기화됩니다.

---

## 에러 처리

### 응답 포맷 통일

모든 REST API는 `ApiResponse<T>` 형식을 사용한다:

```typescript
// 성공
{ success: true, data: T }

// 실패
{ success: false, error: string, code?: string }
```

Socket.IO 에러 이벤트도 동일한 `{ error: string }` 형식을 사용한다.

### HTTP 에러

| 상태 코드 | 설명 |
|----------|------|
| 400 | 잘못된 요청 (필수 필드 누락 등) |
| 401 | JWT 인증 필요 또는 토큰 만료 |
| 403 | 권한 없음 (세션 소유자 아님) |
| 404 | 세션 없음 |
| 500 | 서버 내부 에러 |

### Socket.IO 에러

| 에러 이벤트 | 에러 값 | 설명 |
|------------|---------|------|
| `auth-error` | `{ error: string }` | `client-auth` 실패 (JWT 무효, 세션 없음 등) |
| `join-error` | `{ error: string }` | `session-join` 실패 (JWT 무효, 소유자 불일치 등) |

---

## 예제

### 전체 플로우

사용자가 OAuth로 로그인하고, CLI가 세션을 생성하고, PWA가 목록을 조회한 뒤 실시간 메시지를 주고받는 전체 흐름입니다.

#### 0. 사용자: GitHub OAuth 로그인

```typescript
// PWA에서 GitHub OAuth 로그인 시작
window.location.href = 'https://pocket-ai-production.up.railway.app/auth/github'

// 콜백 후 PWA로 리다이렉트됨: https://<pwa-url>?token=<jwt>
// URL에서 토큰 추출
const params = new URLSearchParams(window.location.search)
const jwtToken = params.get('token')
// 이후 모든 API 요청에 Authorization: Bearer <token> 포함
```

---

#### 1. CLI: 세션 등록

```typescript
import { io } from 'socket.io-client'

// 1. 세션 등록 (JWT 필수)
const sessionRes = await fetch('https://pocket-ai-production.up.railway.app/api/sessions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${jwtToken}`
  },
  body: JSON.stringify({
    publicKey: myPublicKeyBase64,  // E2E 암호화용 공개키
    metadata: {
      hostname: os.hostname(),
      os: process.platform,
      arch: process.arch,
      workingDir: process.cwd()
    }
  })
})
const { sessionId } = await sessionRes.json()
// sessionId = "a1b2c3d4-e5f6-..."

// 2. Socket.IO 연결
const socket = io('https://pocket-ai-production.up.railway.app', {
  path: '/v1/updates'
})

socket.on('connect', () => {
  // 3. 인증 이벤트 전송
  socket.emit('client-auth', { sessionId, token: jwtToken })
})

socket.on('auth-success', (data) => {
  console.log('세션 활성화됨:', data.sessionId)
})

socket.on('auth-error', (data) => {
  console.error('인증 실패:', data.error)
})
```

---

#### 2. PWA: 온라인 세션 목록 조회 + 참여

```typescript
import { io } from 'socket.io-client'

// 1. 온라인 세션 목록 조회 (JWT 필수)
const sessionsRes = await fetch('https://pocket-ai-production.up.railway.app/api/sessions', {
  headers: { 'Authorization': `Bearer ${jwtToken}` }
})
const sessions = await sessionsRes.json()
// [{ sessionId, publicKey, metadata, status: 'online' }, ...]

const targetSession = sessions[0]

// 2. Socket.IO 연결
const socket = io('https://pocket-ai-production.up.railway.app', {
  path: '/v1/updates'
})

socket.on('connect', () => {
  // 3. 세션 참여
  socket.emit('session-join', {
    sessionId: targetSession.sessionId,
    token: jwtToken
  })
})

socket.on('join-success', (data) => {
  // data.publicKey: CLI의 공개키 (E2E 암호화 키 교환에 사용)
  console.log('세션 참여 성공:', data.sessionId)
  console.log('CLI 공개키:', data.publicKey)
})

socket.on('join-error', (data) => {
  console.error('세션 참여 실패:', data.error)
})

// 4. 세션 오프라인 알림
socket.on('session-offline', (data) => {
  console.log('CLI 연결 끊김:', data.sessionId)
})
```

---

#### 3. 암호화 메시지 송수신

```typescript
// ============================================
// PWA: 사용자 메시지 암호화 및 전송
// ============================================

async function sendUserMessage(text: string) {
  const message: SessionMessageText = {
    t: 'text',
    text
  }

  // 암호화 (CLI publicKey로 암호화하거나 대칭키 사용)
  const encryptedBody = encrypt(JSON.stringify(message))

  socket.emit('update', {
    sessionId,
    sender: 'pwa',
    body: encryptedBody
  })
}

sendUserMessage('src/index.ts 파일의 에러를 수정해줘')


// ============================================
// PWA: CLI에서 보낸 메시지 수신
// ============================================

socket.on('update', (data) => {
  if (data.sender !== 'cli') return

  const message = JSON.parse(decrypt(data.body))

  switch (message.t) {
    case 'text':
      displayText(message.text)
      break

    case 'tool-call':
      showToolCall(message.name, message.arguments)
      break

    case 'tool-result':
      showToolResult(message.id, message.result, message.error)
      break

    case 'session-event':
      handleSessionEvent(message.event)
      break
  }
})


// ============================================
// CLI (Agent): 메시지 수신 + 응답 전송
// ============================================

socket.on('update', (data) => {
  if (data.sender !== 'pwa') return

  const message = JSON.parse(decrypt(data.body))

  if (message.t === 'text') {
    handleUserCommand(message.text)
  }
})

// Agent가 도구 호출 시퀀스 전송
async function sendToolCallSequence() {
  // 도구 호출 알림
  const toolCall: SessionMessageToolCall = {
    t: 'tool-call',
    id: 'call_001',
    name: 'Read',
    arguments: { file_path: '/home/user/project/src/index.ts' }
  }
  socket.emit('update', {
    sessionId,
    sender: 'cli',
    body: encrypt(JSON.stringify(toolCall))
  })

  // 도구 실행 후 결과 전송
  const toolResult: SessionMessageToolResult = {
    t: 'tool-result',
    id: 'call_001',
    result: { content: 'import express...' }
  }
  socket.emit('update', {
    sessionId,
    sender: 'cli',
    body: encrypt(JSON.stringify(toolResult))
  })

  // 텍스트 응답
  const response: SessionMessageText = {
    t: 'text',
    text: '에러를 수정했습니다. 타입 불일치 문제가 있었습니다.'
  }
  socket.emit('update', {
    sessionId,
    sender: 'cli',
    body: encrypt(JSON.stringify(response))
  })
}
```

---

### 간단한 테스트

```bash
# 헬스체크
curl https://pocket-ai-production.up.railway.app/ping

# 세션 생성 (JWT 필요)
curl -X POST https://pocket-ai-production.up.railway.app/api/sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt>" \
  -d '{"publicKey":"BASE64_KEY...","metadata":{"hostname":"test","os":"darwin","arch":"arm64"}}'

# 세션 목록 조회 (JWT 필요)
curl https://pocket-ai-production.up.railway.app/api/sessions \
  -H "Authorization: Bearer <jwt>"
```

---

## 결론

Pocket AI API는 REST + Socket.IO 하이브리드 구조로, OAuth 인증부터 실시간 메시지 중계까지 커버합니다:

| 구분 | 엔드포인트 | 용도 |
|------|-----------|------|
| **인증** | `GET /auth/github` | GitHub OAuth 로그인 시작 |
| | `GET /auth/github/callback` | OAuth 콜백, 사용자 생성/업데이트, JWT 발급 |
| **세션** | `POST /api/sessions` | CLI 세션 등록 (JWT 필요) |
| | `GET /api/sessions` | PWA 온라인 세션 목록 조회 (JWT 필요) |
| **헬스** | `GET /ping` | 헬스체크 |
| **실시간** | Socket.IO `/v1/updates` | 암호화 메시지 실시간 중계 |

**Socket.IO 이벤트 요약**:

| 이벤트 | 방향 | 용도 | 인증 |
|--------|------|------|------|
| `client-auth` | CLI → Server | CLI 인증 + Room 참가 | JWT 검증 |
| `session-join` | PWA → Server | PWA 인증 + Room 참가 | JWT + 소유권 |
| `key-exchange` | 양방향 (Server 중계) | ECDH 공개키 교환 | Room 멤버십 |
| `update` | 양방향 (Server 중계) | 암호화 메시지 중계 | Room 멤버십 |
| `auth-success` / `auth-error` | Server → CLI | 인증 결과 | - |
| `join-success` / `join-error` | Server → PWA | 참여 결과 | - |
| `session-offline` | Server → PWA | CLI 연결 해제 알림 | - |

서버는 `update` 이벤트의 `body`를 복호화하지 않고 룸 내 다른 소켓으로 순수 중계합니다. 암호화는 CLI와 PWA 클라이언트 측에서 처리합니다.
