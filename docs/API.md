# Pocket AI API Reference

OAuth 로그인 + JWT 인증 + Socket.IO 기반 실시간 통신 + REST API - 세션 수명주기 전체를 커버하는 API 문서

## 목차

- [개요](#개요)
- [REST API](#rest-api)
  - [인증 (OAuth)](#인증-oauth)
  - [세션 관리](#세션-관리)
  - [머신/데몬](#머신데몬)
  - [헬스체크](#헬스체크)
- [Socket.IO Protocol](#socketio-protocol)
- [Wire Protocol (메시지 타입)](#wire-protocol-메시지-타입)
- [에러 처리](#에러-처리)
- [예제](#예제)

---

## 개요

### 아키텍처

```
REST API:   세션/머신 생성 및 관리, 메시지 히스토리
Socket.IO:  실시간 암호화 메시지 중계 (이벤트 기반)
```

### 주요 변경사항 (기존 대비)

| 항목 | 기존 | 변경 |
|------|------|------|
| 실시간 통신 | Raw WebSocket | **Socket.IO** |
| 메시지 타입 | 4종 (command/response/error/ping) | **확장된 세션 이벤트** (8종) |
| REST 엔드포인트 | 5개 | **11개** (세션 + 머신/데몬) |
| 공유 패키지 | `shared` | **`wire`** |
| 신규 개념 | - | **데몬, 로컬/리모트 모드, 세션 수명주기** |
| 패키지 구조 | 통합 | **CLI와 Agent 분리** |

### Base URL

```
Production:  https://api.pocket-ai.app
Socket.IO:   https://api.pocket-ai.app (path: /v1/updates)
```

### 공통 응답 포맷

```typescript
// 성공
{
  "success": true,
  "data": { ... }
}

// 에러
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "설명"
  }
}
```

### 패키지 구조

```
pocket-ai/
├── packages/
│   ├── cli/        # CLI 인터페이스 (터미널 QR, 세션 시작)
│   ├── agent/      # Agent 코어 (CLI 래핑, 메시지 처리)
│   └── wire/       # 공유 타입, 프로토콜, 암호화 유틸리티
├── apps/
│   ├── server/     # 릴레이 서버 (REST + Socket.IO)
│   └── pwa/        # PWA 클라이언트
└── docs/
```

---

## REST API

### 인증 (OAuth)

#### GitHub OAuth 로그인

```http
GET /auth/github
```

사용자를 GitHub OAuth 인증 페이지로 리다이렉트합니다. 인증 완료 후 JWT를 쿠키 또는 응답으로 반환합니다.

**콜백 (GitHub → 서버)**:
```http
GET /auth/github/callback?code=xxx&state=yyy
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresAt": 1705926000000,
    "user": {
      "id": "user_abc123",
      "email": "user@example.com",
      "provider": "github"
    }
  }
}
```

---

#### 토큰 갱신

```http
POST /auth/refresh
Authorization: Bearer <refresh_token>
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresAt": 1705926000000
  }
}
```

---

#### 로그아웃

```http
POST /auth/logout
Authorization: Bearer <jwt>
```

**Response (200)**:
```json
{
  "success": true
}
```

---

### 인증 헤더

세션/머신 관련 모든 API는 JWT 인증이 필요합니다.

```http
Authorization: Bearer <jwt_token>
```

JWT 없이 호출 시 `401 Unauthorized` 반환.

---

### 세션 관리

#### 세션 생성

CLI가 세션을 시작할 때 호출합니다. QR 코드 표시 전 세션을 먼저 생성합니다. **JWT 인증 필수**.

```http
POST /api/sessions
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "machineId": "mach_xyz789",
  "workingDir": "/home/user/project",
  "hostInfo": {
    "hostname": "dev-macbook",
    "os": "darwin",
    "arch": "arm64"
  }
}
```

**Response (201)**:
```json
{
  "success": true,
  "data": {
    "sessionId": "sess_abc123",
    "state": "waiting",
    "expiresAt": 1705323000000,
    "createdAt": 1705319400000
  }
}
```

**세션 상태 흐름**:
```
waiting → active → closed
            ↓
          expired
```

---

#### 세션 상태 조회

```http
GET /api/sessions/:sessionId
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "sessionId": "sess_abc123",
    "machineId": "mach_xyz789",
    "state": "active",
    "agentState": {
      "status": "idle",
      "pendingRequests": 0
    },
    "metadata": {
      "workingDir": "/home/user/project",
      "hostInfo": {
        "hostname": "dev-macbook",
        "os": "darwin",
        "arch": "arm64"
      }
    },
    "createdAt": 1705319400000,
    "expiresAt": 1705323000000,
    "lastActivityAt": 1705320000000
  }
}
```

---

#### 세션 참여 (Client)

QR 코드 스캔 후 Client(PWA)가 세션에 참여합니다. **JWT 인증 필수** (QR은 디바이스 페어링용, 인증은 JWT로).

```http
POST /api/sessions/:sessionId/join
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "clientId": "client_def456",
  "deviceInfo": {
    "type": "mobile",
    "browser": "Safari",
    "os": "iOS 17"
  }
}
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "sessionId": "sess_abc123",
    "state": "active",
    "agentState": {
      "status": "idle",
      "pendingRequests": 0
    },
    "metadata": {
      "workingDir": "/home/user/project",
      "hostInfo": {
        "hostname": "dev-macbook",
        "os": "darwin",
        "arch": "arm64"
      }
    }
  }
}
```

---

#### Agent 상태 업데이트

Agent가 자신의 상태를 서버에 알립니다. Agent에 의해서만 호출됩니다.

```http
PUT /api/sessions/:sessionId/state
Content-Type: application/json

{
  "status": "busy",
  "pendingRequests": 2,
  "currentTool": "file_edit"
}
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "sessionId": "sess_abc123",
    "agentState": {
      "status": "busy",
      "pendingRequests": 2,
      "currentTool": "file_edit"
    }
  }
}
```

**Agent 상태 값**:

| status | 설명 |
|--------|------|
| `idle` | 대기 중 (명령 수신 가능) |
| `busy` | 작업 중 |
| `error` | 에러 발생 |

---

#### 세션 메타데이터 업데이트

작업 디렉토리 변경 등 세션 메타데이터를 업데이트합니다.

```http
PUT /api/sessions/:sessionId/metadata
Content-Type: application/json

{
  "workingDir": "/home/user/another-project",
  "hostInfo": {
    "hostname": "dev-macbook",
    "os": "darwin",
    "arch": "arm64"
  }
}
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "sessionId": "sess_abc123",
    "metadata": {
      "workingDir": "/home/user/another-project",
      "hostInfo": {
        "hostname": "dev-macbook",
        "os": "darwin",
        "arch": "arm64"
      }
    }
  }
}
```

---

#### 세션 종료

```http
DELETE /api/sessions/:sessionId
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "sessionId": "sess_abc123",
    "state": "closed",
    "closedAt": 1705323000000
  }
}
```

---

#### 메시지 히스토리 조회

세션의 암호화된 메시지 히스토리를 가져옵니다. 서버는 암호문만 저장하므로 Client에서 복호화해야 합니다.

```http
GET /api/sessions/:sessionId/messages?limit=50&after=msg_xxx
```

**Query Parameters**:

| 파라미터 | 타입 | 기본값 | 설명 |
|---------|------|-------|------|
| `limit` | number | 50 | 가져올 메시지 수 (최대 100) |
| `after` | string | - | 이 메시지 ID 이후부터 |
| `before` | string | - | 이 메시지 ID 이전까지 |

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "messages": [
      {
        "id": "msg_001",
        "sessionId": "sess_abc123",
        "role": "user",
        "encrypted": {
          "t": "encrypted",
          "c": "BASE64_CIPHERTEXT..."
        },
        "createdAt": 1705319500000
      },
      {
        "id": "msg_002",
        "sessionId": "sess_abc123",
        "role": "agent",
        "encrypted": {
          "t": "encrypted",
          "c": "BASE64_CIPHERTEXT..."
        },
        "createdAt": 1705319600000
      }
    ],
    "hasMore": true,
    "cursor": "msg_002"
  }
}
```

---

#### 메시지 전송

REST를 통한 메시지 전송입니다. Socket.IO 연결이 불안정할 때 폴백으로 사용합니다.

```http
POST /api/sessions/:sessionId/messages
Content-Type: application/json

{
  "role": "user",
  "encrypted": {
    "t": "encrypted",
    "c": "BASE64_CIPHERTEXT..."
  }
}
```

**Response (201)**:
```json
{
  "success": true,
  "data": {
    "id": "msg_003",
    "sessionId": "sess_abc123",
    "role": "user",
    "createdAt": 1705319700000
  }
}
```

---

### 머신/데몬

데몬(daemon)은 사용자의 PC에서 상시 실행되는 백그라운드 프로세스입니다. 여러 세션을 동시에 관리할 수 있습니다.

#### 데몬 등록

```http
POST /api/machines
Content-Type: application/json

{
  "hostname": "dev-macbook",
  "os": "darwin",
  "arch": "arm64",
  "version": "1.0.0"
}
```

**Response (201)**:
```json
{
  "success": true,
  "data": {
    "machineId": "mach_xyz789",
    "state": "online",
    "registeredAt": 1705319400000
  }
}
```

---

#### 데몬 상태 업데이트

```http
PUT /api/machines/:machineId/state
Content-Type: application/json

{
  "state": "online",
  "activeSessions": ["sess_abc123", "sess_def456"],
  "resources": {
    "cpuUsage": 25.5,
    "memoryUsage": 60.2
  }
}
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "machineId": "mach_xyz789",
    "state": "online",
    "activeSessions": ["sess_abc123", "sess_def456"],
    "updatedAt": 1705320000000
  }
}
```

**데몬 상태 값**:

| state | 설명 |
|-------|------|
| `online` | 연결됨, 세션 수용 가능 |
| `busy` | 연결됨, 최대 세션 도달 |
| `offline` | 연결 끊김 |

---

#### 데몬 정보 조회

```http
GET /api/machines/:machineId
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "machineId": "mach_xyz789",
    "hostname": "dev-macbook",
    "os": "darwin",
    "arch": "arm64",
    "version": "1.0.0",
    "state": "online",
    "activeSessions": ["sess_abc123"],
    "registeredAt": 1705319400000,
    "lastSeenAt": 1705320000000
  }
}
```

---

### 헬스체크

```http
GET /api/health
```

**Response (200)**:
```json
{
  "status": "ok",
  "timestamp": 1705319400000,
  "version": "1.0.0",
  "socketio": {
    "connections": 42,
    "rooms": 15
  }
}
```

---

## Socket.IO Protocol

Raw WebSocket 대신 Socket.IO를 사용합니다. 자동 재연결, 룸 기반 라우팅, 이벤트 기반 통신을 기본 제공합니다.

### 연결

```typescript
import { io } from 'socket.io-client'

const socket = io('https://api.pocket-ai.app', {
  path: '/v1/updates',
  auth: {
    sessionId: 'sess_abc123',
    role: 'agent',   // 'agent' | 'client'
    token: jwtToken  // JWT 필수 (OAuth 로그인 후 발급)
  },
  // Socket.IO 내장 재연결 (reconnection: true가 기본값)
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 30000
})
```

### 클라이언트 타입

| 타입 | 용도 | auth 파라미터 |
|------|------|--------------|
| `session-scoped` | 특정 세션에 연결 (PWA Client) | `{ sessionId, role: 'client' }` |
| `machine-scoped` | 데몬이 여러 세션 관리 | `{ machineId, role: 'agent' }` |

**session-scoped 연결 (PWA Client)**:
```typescript
const socket = io('https://api.pocket-ai.app', {
  path: '/v1/updates',
  auth: {
    sessionId: 'sess_abc123',
    role: 'client',
    token: jwtToken  // JWT 필수
  }
})
```

**machine-scoped 연결 (데몬)**:
```typescript
const socket = io('https://api.pocket-ai.app', {
  path: '/v1/updates',
  auth: {
    machineId: 'mach_xyz789',
    role: 'agent',
    token: jwtToken  // JWT 필수
  }
})
```

### 연결 이벤트

```typescript
// 연결 성공
socket.on('connect', () => {
  console.log('연결됨:', socket.id)
})

// 연결 에러
socket.on('connect_error', (err) => {
  console.error('연결 에러:', err.message)
  // err.message 예시:
  // "INVALID_SESSION" - 잘못된 세션 ID
  // "SESSION_EXPIRED" - 세션 만료
  // "ALREADY_CONNECTED" - 이미 연결된 role
  // "AUTH_FAILED" - 인증 실패
})

// 연결 끊김
socket.on('disconnect', (reason) => {
  console.log('연결 끊김:', reason)
})
```

### Server → Client 이벤트

서버가 클라이언트에게 보내는 이벤트는 `update` 하나로 통합됩니다.

```typescript
socket.on('update', (data) => {
  // data 구조
  // {
  //   body: {
  //     t: 'new-message' | 'update-session' | 'update-machine',
  //     ...payload
  //   }
  // }

  switch (data.body.t) {
    case 'new-message':
      // 새 암호화 메시지 수신
      // data.body.message: { id, sessionId, role, encrypted, createdAt }
      handleNewMessage(data.body.message)
      break

    case 'update-session':
      // 세션 상태 변경 알림
      // data.body.session: { sessionId, state, agentState, metadata }
      handleSessionUpdate(data.body.session)
      break

    case 'update-machine':
      // 데몬 상태 변경 알림 (machine-scoped 전용)
      // data.body.machine: { machineId, state, activeSessions }
      handleMachineUpdate(data.body.machine)
      break
  }
})
```

#### `new-message` 상세

```typescript
interface NewMessageUpdate {
  body: {
    t: 'new-message'
    message: {
      id: string                // 메시지 고유 ID
      sessionId: string         // 세션 ID
      role: 'user' | 'agent'    // 발신자
      encrypted: {
        t: 'encrypted'
        c: string               // Base64 암호문
      }
      createdAt: number         // 타임스탬프
    }
  }
}
```

#### `update-session` 상세

```typescript
interface SessionUpdate {
  body: {
    t: 'update-session'
    session: {
      sessionId: string
      state: 'waiting' | 'active' | 'closed'
      agentState?: {
        status: 'idle' | 'busy' | 'error'
        pendingRequests: number
        currentTool?: string
      }
      metadata?: {
        workingDir: string
        hostInfo: { hostname: string; os: string; arch: string }
      }
    }
  }
}
```

#### `update-machine` 상세

```typescript
interface MachineUpdate {
  body: {
    t: 'update-machine'
    machine: {
      machineId: string
      state: 'online' | 'busy' | 'offline'
      activeSessions: string[]
    }
  }
}
```

### Client → Server 이벤트

클라이언트가 서버로 메시지를 보낼 때 사용합니다.

```typescript
// 암호화 메시지 전송
socket.emit('message', {
  sessionId: 'sess_abc123',
  encrypted: {
    t: 'encrypted',
    c: 'BASE64_CIPHERTEXT...'
  }
})
```

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

`wire` 패키지에서 정의하는 프로토콜입니다. 모든 메시지는 암호화 컨테이너로 감싸서 전송됩니다.

### 암호화 컨테이너

서버를 통과하는 모든 메시지는 이 형태입니다. 서버는 내용을 복호화할 수 없습니다.

```typescript
// wire/src/types/encrypted.ts
interface EncryptedContainer {
  t: 'encrypted'
  c: string           // Base64 인코딩된 암호문 (nonce + ciphertext + auth tag)
}
```

### 복호화된 세션 메시지

암호문을 복호화하면 아래 구조의 `SessionMessage`가 나옵니다.

```typescript
// wire/src/types/session.ts
interface SessionMessage {
  id: string           // 고유 메시지 ID (예: "msg_a1b2c3")
  time: number         // Unix 타임스탬프 (밀리초)
  role: 'user' | 'agent'
  ev: SessionEvent     // 아래 이벤트 타입 중 하나
}
```

### 세션 이벤트 타입 (SessionEvent)

`SessionMessage.ev`에 들어가는 이벤트 타입들입니다.

#### `text` - 텍스트 메시지

사용자의 입력 또는 Agent의 텍스트 응답입니다.

```typescript
interface TextEvent {
  type: 'text'
  text: string           // 메시지 본문
  thinking?: boolean     // Agent 사고 과정 여부 (thinking block)
}
```

**예시 (사용자 입력)**:
```json
{
  "id": "msg_001",
  "time": 1705319500000,
  "role": "user",
  "ev": {
    "type": "text",
    "text": "src/index.ts 파일의 에러를 수정해줘"
  }
}
```

**예시 (Agent 응답)**:
```json
{
  "id": "msg_002",
  "time": 1705319600000,
  "role": "agent",
  "ev": {
    "type": "text",
    "text": "파일을 분석해보겠습니다. 타입 에러가 3개 발견되었습니다.",
    "thinking": false
  }
}
```

---

#### `tool-call-start` - 도구 호출 시작

Agent가 도구(파일 읽기, 코드 실행 등)를 호출할 때 발생합니다.

```typescript
interface ToolCallStartEvent {
  type: 'tool-call-start'
  toolName: string       // 도구 이름 (예: "Read", "Edit", "Bash")
  args: any              // 도구에 전달된 인자
}
```

**예시**:
```json
{
  "id": "msg_003",
  "time": 1705319610000,
  "role": "agent",
  "ev": {
    "type": "tool-call-start",
    "toolName": "Read",
    "args": {
      "file_path": "/home/user/project/src/index.ts"
    }
  }
}
```

---

#### `tool-call-end` - 도구 호출 완료

도구 실행이 완료되었을 때 발생합니다.

```typescript
interface ToolCallEndEvent {
  type: 'tool-call-end'
  toolName: string       // 도구 이름
  result: any            // 도구 실행 결과
}
```

**예시**:
```json
{
  "id": "msg_004",
  "time": 1705319620000,
  "role": "agent",
  "ev": {
    "type": "tool-call-end",
    "toolName": "Read",
    "result": {
      "content": "import express from 'express';\n..."
    }
  }
}
```

---

#### `turn-start` - 턴 시작

Agent가 사용자의 메시지를 받고 처리를 시작할 때 발생합니다.

```typescript
interface TurnStartEvent {
  type: 'turn-start'
}
```

---

#### `turn-end` - 턴 종료

Agent가 현재 턴의 처리를 완료했을 때 발생합니다.

```typescript
interface TurnEndEvent {
  type: 'turn-end'
  exitCode?: number      // CLI 종료 코드 (0: 정상)
}
```

---

#### `start` - 세션 시작

CLI가 세션을 시작했을 때 발생합니다.

```typescript
interface StartEvent {
  type: 'start'
  cli: string            // CLI 이름 (예: "claude")
  version: string        // CLI 버전 (예: "1.0.25")
}
```

**예시**:
```json
{
  "id": "msg_000",
  "time": 1705319400000,
  "role": "agent",
  "ev": {
    "type": "start",
    "cli": "claude",
    "version": "1.0.25"
  }
}
```

---

#### `stop` - 세션 중단

세션이 종료되었을 때 발생합니다.

```typescript
interface StopEvent {
  type: 'stop'
  reason: string         // 종료 이유 (예: "user_disconnect", "timeout", "cli_exit")
}
```

---

#### `error` - 에러

세션 수준의 에러가 발생했을 때 사용합니다.

```typescript
interface ErrorEvent {
  type: 'error'
  code: string           // 에러 코드
  message: string        // 에러 설명
}
```

**에러 코드**:

| code | 설명 |
|------|------|
| `CLI_NOT_FOUND` | CLI 실행 파일을 찾을 수 없음 |
| `CLI_TIMEOUT` | CLI 실행 시간 초과 |
| `CLI_ERROR` | CLI 실행 중 에러 |
| `CLI_CRASH` | CLI 프로세스 비정상 종료 |
| `DECRYPT_FAILED` | 메시지 복호화 실패 |
| `SESSION_EXPIRED` | 세션 만료 |
| `PERMISSION_DENIED` | 권한 없음 |

---

### 전체 타입 정의 (wire 패키지)

```typescript
// wire/src/types/index.ts

// --- 암호화 컨테이너 ---
export interface EncryptedContainer {
  t: 'encrypted'
  c: string
}

// --- 세션 이벤트 유니온 ---
export type SessionEvent =
  | { type: 'text'; text: string; thinking?: boolean }
  | { type: 'tool-call-start'; toolName: string; args: any }
  | { type: 'tool-call-end'; toolName: string; result: any }
  | { type: 'turn-start' }
  | { type: 'turn-end'; exitCode?: number }
  | { type: 'start'; cli: string; version: string }
  | { type: 'stop'; reason: string }
  | { type: 'error'; code: string; message: string }

// --- 세션 메시지 ---
export interface SessionMessage {
  id: string
  time: number
  role: 'user' | 'agent'
  ev: SessionEvent
}

// --- Socket.IO 이벤트 ---
export interface ServerToClientEvents {
  update: (data: {
    body:
      | { t: 'new-message'; message: { id: string; sessionId: string; role: string; encrypted: EncryptedContainer; createdAt: number } }
      | { t: 'update-session'; session: { sessionId: string; state: string; agentState?: AgentState; metadata?: SessionMetadata } }
      | { t: 'update-machine'; machine: { machineId: string; state: string; activeSessions: string[] } }
  }) => void
}

export interface ClientToServerEvents {
  message: (data: {
    sessionId: string
    encrypted: EncryptedContainer
  }) => void
}

// --- 보조 타입 ---
export interface AgentState {
  status: 'idle' | 'busy' | 'error'
  pendingRequests: number
  currentTool?: string
}

export interface SessionMetadata {
  workingDir: string
  hostInfo: {
    hostname: string
    os: string
    arch: string
  }
}
```

---

## 에러 처리

### HTTP 에러

| 상태 코드 | 설명 |
|----------|------|
| 400 | 잘못된 요청 (필수 필드 누락 등) |
| 401 | JWT 인증 필요 또는 토큰 만료 |
| 403 | 권한 없음 (세션/리소스 소유자 아님) |
| 404 | 세션 또는 머신 없음 |
| 409 | 이미 참여 중 (세션에 Client 이미 존재) |
| 422 | 유효하지 않은 상태 전이 (예: closed → active) |
| 429 | 요청 제한 초과 |
| 500 | 서버 내부 에러 |

### Socket.IO 에러

| 에러 | 설명 |
|------|------|
| `AUTH_REQUIRED` | JWT 토큰 누락 |
| `INVALID_TOKEN` | 유효하지 않거나 만료된 JWT |
| `FORBIDDEN` | 세션이 해당 사용자 소유가 아님 |
| `INVALID_SESSION` | 존재하지 않는 세션 ID |
| `SESSION_EXPIRED` | 만료된 세션 |
| `ALREADY_CONNECTED` | 같은 role로 이미 연결됨 |
| `INVALID_PAYLOAD` | 잘못된 메시지 형식 |

### Rate Limiting

| 엔드포인트 | 제한 |
|-----------|------|
| POST /api/sessions | 10/분 |
| POST /api/machines | 5/분 |
| POST /api/sessions/:id/messages | 60/분 |
| Socket.IO 메시지 | 100/초 |

**제한 초과 응답**:
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests",
    "retryAfter": 60
  }
}
```

---

## 예제

### 전체 플로우

사용자가 OAuth로 로그인하고, CLI가 세션을 생성하고, QR 코드로 디바이스를 페어링하고, 암호화 메시지를 주고받는 전체 흐름입니다.

#### 0. 사용자: OAuth 로그인 (최초 1회)

```typescript
// PWA에서 GitHub OAuth 로그인
window.location.href = 'https://api.pocket-ai.app/auth/github'

// 콜백 후 JWT 획득 → localStorage 또는 httpOnly 쿠키에 저장
const { token } = await response.json()
// 이후 모든 API 요청에 Authorization: Bearer <token> 포함
```

---

#### 1. 데몬: 머신 등록

```typescript
// 데몬이 시작되면 서버에 머신 등록 (JWT 필수)
const machineRes = await fetch('https://api.pocket-ai.app/api/machines', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${jwtToken}`
  },
  body: JSON.stringify({
    hostname: 'dev-macbook',
    os: 'darwin',
    arch: 'arm64',
    version: '1.0.0'
  })
})
const { data: machine } = await machineRes.json()
const { machineId } = machine
// machineId = "mach_xyz789"
```

#### 2. CLI: 세션 생성 + QR 표시

```typescript
import { io } from 'socket.io-client'
import crypto from 'crypto'
import qrcode from 'qrcode-terminal'

// 1. 세션 생성 (JWT 필수)
const sessionRes = await fetch('https://api.pocket-ai.app/api/sessions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${jwtToken}`
  },
  body: JSON.stringify({
    machineId: 'mach_xyz789',
    workingDir: process.cwd(),
    hostInfo: {
      hostname: os.hostname(),
      os: process.platform,
      arch: process.arch
    }
  })
})
const { data: session } = await sessionRes.json()
const { sessionId } = session
// sessionId = "sess_abc123"

// 2. 대칭키 생성 (E2E 암호화용)
const key = crypto.randomBytes(32)

// 3. QR 코드 데이터 생성
const qrData = JSON.stringify({
  s: sessionId,
  k: key.toString('base64'),
  u: 'https://api.pocket-ai.app'
})

// 4. 터미널에 QR 코드 표시 (디바이스 페어링용, 인증 아님)
// PWA에서 이 QR을 스캔하면 암호화 키 + sessionId 획득
// 단, 세션 join 시 PWA도 JWT가 있어야 함
qrcode.generate(qrData, { small: true })

// 5. Socket.IO 연결 (machine-scoped)
const socket = io('https://api.pocket-ai.app', {
  path: '/v1/updates',
  auth: {
    machineId: 'mach_xyz789',
    role: 'agent'
  }
})

socket.on('connect', () => {
  console.log('서버 연결됨')
})
```

#### 3. Client(PWA): QR 스캔 + 세션 참여

```typescript
import { io } from 'socket.io-client'

// 1. QR 코드 스캔
const qrData = await scanQRCode()
const { s: sessionId, k: keyBase64, u: serverUrl } = JSON.parse(qrData)

// 2. 대칭키 복원 (Web Crypto API)
const keyBytes = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0))
const cryptoKey = await crypto.subtle.importKey(
  'raw',
  keyBytes,
  'AES-GCM',
  false,
  ['encrypt', 'decrypt']
)

// 3. REST로 세션 참여 (JWT 필수)
await fetch(`${serverUrl}/api/sessions/${sessionId}/join`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${jwtToken}`
  },
  body: JSON.stringify({
    clientId: crypto.randomUUID(),
    deviceInfo: {
      type: 'mobile',
      browser: navigator.userAgent,
      os: navigator.platform
    }
  })
})

// 4. Socket.IO 연결 (session-scoped, JWT 필수)
const socket = io(serverUrl, {
  path: '/v1/updates',
  auth: {
    sessionId,
    role: 'client',
    token: jwtToken
  }
})

socket.on('connect', () => {
  console.log('세션 연결됨')
})
```

#### 4. 암호화 메시지 송수신

```typescript
// ============================================
// Client(PWA): 사용자 메시지 암호화 및 전송
// ============================================

async function sendUserMessage(text: string) {
  // 1. SessionMessage 생성 (wire 프로토콜)
  const message: SessionMessage = {
    id: `msg_${crypto.randomUUID().slice(0, 8)}`,
    time: Date.now(),
    role: 'user',
    ev: {
      type: 'text',
      text
    }
  }

  // 2. AES-256-GCM 암호화
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(JSON.stringify(message))

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    cryptoKey,
    encoded
  )

  // nonce(12) + ciphertext + authTag 를 하나로 합침
  const combined = new Uint8Array(nonce.length + new Uint8Array(ciphertext).length)
  combined.set(nonce)
  combined.set(new Uint8Array(ciphertext), nonce.length)

  // 3. Socket.IO로 전송
  socket.emit('message', {
    sessionId,
    encrypted: {
      t: 'encrypted',
      c: btoa(String.fromCharCode(...combined))
    }
  })
}

// 사용 예시
sendUserMessage('src/index.ts 파일의 에러를 수정해줘')


// ============================================
// Client(PWA): 서버에서 메시지 수신 및 복호화
// ============================================

socket.on('update', async (data) => {
  if (data.body.t !== 'new-message') return

  const { message } = data.body
  const { encrypted } = message

  // 1. Base64 디코딩
  const combined = Uint8Array.from(atob(encrypted.c), c => c.charCodeAt(0))

  // 2. nonce와 ciphertext 분리
  const nonce = combined.slice(0, 12)
  const ciphertext = combined.slice(12)

  // 3. AES-256-GCM 복호화
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce },
    cryptoKey,
    ciphertext
  )

  // 4. SessionMessage로 파싱
  const sessionMsg: SessionMessage = JSON.parse(
    new TextDecoder().decode(decrypted)
  )

  // 5. 이벤트 타입별 처리
  switch (sessionMsg.ev.type) {
    case 'text':
      displayText(sessionMsg.ev.text, sessionMsg.ev.thinking)
      break
    case 'tool-call-start':
      showToolSpinner(sessionMsg.ev.toolName, sessionMsg.ev.args)
      break
    case 'tool-call-end':
      hideToolSpinner(sessionMsg.ev.toolName, sessionMsg.ev.result)
      break
    case 'turn-start':
      showTypingIndicator()
      break
    case 'turn-end':
      hideTypingIndicator()
      break
    case 'error':
      showError(sessionMsg.ev.code, sessionMsg.ev.message)
      break
  }
})


// ============================================
// Agent: 메시지 수신 + 복호화 + 응답 전송
// ============================================

import crypto from 'crypto'

socket.on('update', (data) => {
  if (data.body.t !== 'new-message') return

  const { message } = data.body
  const { encrypted } = message

  // 1. Base64 디코딩
  const combined = Buffer.from(encrypted.c, 'base64')

  // 2. nonce와 ciphertext 분리
  const nonce = combined.subarray(0, 12)
  const ciphertext = combined.subarray(12)

  // 3. AES-256-GCM 복호화 (Node.js crypto)
  const authTag = ciphertext.subarray(ciphertext.length - 16)
  const encryptedData = ciphertext.subarray(0, ciphertext.length - 16)

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce)
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([
    decipher.update(encryptedData),
    decipher.final()
  ]).toString('utf8')

  const sessionMsg: SessionMessage = JSON.parse(decrypted)

  if (sessionMsg.ev.type === 'text') {
    // CLI 실행 및 응답...
    handleUserCommand(sessionMsg)
  }
})

// Agent가 응답 전송
async function sendAgentResponse(ev: SessionEvent) {
  const message: SessionMessage = {
    id: `msg_${crypto.randomUUID().slice(0, 8)}`,
    time: Date.now(),
    role: 'agent',
    ev
  }

  // 암호화
  const nonce = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce)

  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(message), 'utf8'),
    cipher.final()
  ])
  const authTag = cipher.getAuthTag()

  // nonce + ciphertext + authTag 합침
  const combined = Buffer.concat([nonce, encrypted, authTag])

  // Socket.IO로 전송
  socket.emit('message', {
    sessionId,
    encrypted: {
      t: 'encrypted',
      c: combined.toString('base64')
    }
  })
}

// 사용 예시: 도구 호출 시퀀스
await sendAgentResponse({ type: 'turn-start' })
await sendAgentResponse({
  type: 'tool-call-start',
  toolName: 'Read',
  args: { file_path: '/home/user/project/src/index.ts' }
})
await sendAgentResponse({
  type: 'tool-call-end',
  toolName: 'Read',
  result: { content: '...' }
})
await sendAgentResponse({
  type: 'text',
  text: '에러를 수정했습니다. 타입 불일치 문제가 있었습니다.'
})
await sendAgentResponse({ type: 'turn-end', exitCode: 0 })
```

### Agent 턴의 전형적인 이벤트 시퀀스

하나의 Agent 턴에서 발생하는 이벤트 순서입니다.

```
Client                      Server                      Agent
  │                            │                           │
  ├── text("에러 수정해줘") ───>│───────────────────────────>│
  │                            │                           │
  │                            │              turn-start  ──┤
  │                            │<──────────────────────────┤
  │<───────────────────────────│                           │
  │                            │                           │
  │                            │       tool-call-start    ──┤
  │                            │       (Read, index.ts)     │
  │                            │<──────────────────────────┤
  │<───────────────────────────│                           │
  │                            │                           │
  │                            │       tool-call-end      ──┤
  │                            │       (Read, result)       │
  │                            │<──────────────────────────┤
  │<───────────────────────────│                           │
  │                            │                           │
  │                            │       tool-call-start    ──┤
  │                            │       (Edit, fix)          │
  │                            │<──────────────────────────┤
  │<───────────────────────────│                           │
  │                            │                           │
  │                            │       tool-call-end      ──┤
  │                            │<──────────────────────────┤
  │<───────────────────────────│                           │
  │                            │                           │
  │                            │       text("수정 완료")  ──┤
  │                            │<──────────────────────────┤
  │<───────────────────────────│                           │
  │                            │                           │
  │                            │       turn-end           ──┤
  │                            │       (exitCode: 0)        │
  │                            │<──────────────────────────┤
  │<───────────────────────────│                           │
  │                            │                           │
```

---

### 간단한 테스트

```bash
# 헬스체크
curl https://api.pocket-ai.app/api/health

# 머신 등록
curl -X POST https://api.pocket-ai.app/api/machines \
  -H "Content-Type: application/json" \
  -d '{"hostname":"test-machine","os":"darwin","arch":"arm64","version":"1.0.0"}'

# 세션 생성
curl -X POST https://api.pocket-ai.app/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"machineId":"mach_xyz789","workingDir":"/tmp","hostInfo":{"hostname":"test","os":"darwin","arch":"arm64"}}'

# 세션 상태 조회
curl https://api.pocket-ai.app/api/sessions/sess_abc123

# 세션 참여
curl -X POST https://api.pocket-ai.app/api/sessions/sess_abc123/join \
  -H "Content-Type: application/json" \
  -d '{"clientId":"client_test","deviceInfo":{"type":"mobile","browser":"Safari","os":"iOS"}}'

# 메시지 히스토리 조회
curl 'https://api.pocket-ai.app/api/sessions/sess_abc123/messages?limit=20'

# 세션 종료
curl -X DELETE https://api.pocket-ai.app/api/sessions/sess_abc123
```

---

## 결론

Pocket AI API는 REST + Socket.IO 하이브리드 구조로, 세션 수명주기 전체를 커버합니다:

| 구분 | 엔드포인트 | 용도 |
|------|-----------|------|
| **인증** | `GET /auth/github` | GitHub OAuth 로그인 |
| | `POST /auth/refresh` | JWT 갱신 |
| | `POST /auth/logout` | 로그아웃 |
| **세션** | `POST /api/sessions` | 세션 생성 (CLI, JWT 필요) |
| | `GET /api/sessions/:id` | 세션 상태 조회 |
| | `POST /api/sessions/:id/join` | 세션 참여 (QR 디바이스 페어링 후, JWT 필요) |
| | `PUT /api/sessions/:id/state` | Agent 상태 업데이트 |
| | `PUT /api/sessions/:id/metadata` | 메타데이터 업데이트 |
| | `DELETE /api/sessions/:id` | 세션 종료 |
| | `GET /api/sessions/:id/messages` | 메시지 히스토리 |
| | `POST /api/sessions/:id/messages` | 메시지 전송 (REST 폴백) |
| **머신** | `POST /api/machines` | 데몬 등록 (JWT 필요) |
| | `PUT /api/machines/:id/state` | 데몬 상태 업데이트 |
| | `GET /api/machines/:id` | 데몬 정보 조회 |
| **헬스** | `GET /api/health` | 헬스체크 |
| **실시간** | Socket.IO `/v1/updates` | 암호화 메시지 실시간 중계 (JWT 필요) |

암호화는 클라이언트에서 처리하고, 서버는 `wire` 프로토콜의 암호화 컨테이너(`{ t: 'encrypted', c: '...' }`)만 중계합니다.
