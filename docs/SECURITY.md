# Pocket AI Security Design

ECDH P-256 키교환 + AES-256-GCM E2E 암호화 + OAuth 로그인 + 계정 기반 자동 연결

## 목차

- [보안 원칙](#보안-원칙)
- [암호화 설계](#암호화-설계)
- [키 관리](#키-관리)
- [서버 역할과 한계](#서버-역할과-한계)
- [와이어 프로토콜 보안](#와이어-프로토콜-보안)
- [데몬 보안](#데몬-보안)
- [위협 모델](#위협-모델)
- [인증](#인증)
  - [JWT 보안 정책](#jwt-보안-정책)
  - [OAuth 보안 정책](#oauth-보안-정책)
  - [CORS 정책](#cors-정책)
- [보안 체크리스트](#보안-체크리스트)

---

## 보안 원칙

### 1. 단순함이 보안

복잡한 시스템은 취약점을 만듭니다. Pocket AI는 검증된 단순한 방식을 사용합니다.

| 기존 (복잡) | 개선 (단순) |
|------------|-----------|
| 복잡한 HMAC-SHA512 키 트리 | ECDH P-256 + AES-256-GCM |
| HKDF 키 유도 | 직접 공유 비밀 사용 |
| XChaCha20-Poly1305 | AES-256-GCM |
| 복잡한 키 교환 프로토콜 | ECDH P-256 자동 키교환 |

### 2. 서버 완전 Blind (Pure Relay)

서버는 암호화된 메시지를 단순 중계만 합니다. 세션 키, 암호화 키 일절 미보관. ECDH 키교환은 클라이언트 간 직접 수행되며, 서버는 공개키 전달 채널만 제공합니다.

- **서버는 메시지 내용을 읽을 수 없음** - ECDH 비밀키는 각 클라이언트에만 존재
- **서버는 어떠한 키도 저장하지 않음** - 세션 정보는 인메모리(activeSessions Map)에만 유지
- **서버 침해 시 메시지 내용 완전 보호** - 서버에 복호화에 필요한 정보가 없음

### 3. 최소 권한

| 컴포넌트 | 권한 범위 |
|---------|---------|
| Agent/Daemon | 로컬 CLI 접근만 |
| Server | 메시지 라우팅만 (키/메시지 미보관) |
| Client (PWA) | 표시만 |

---

## 암호화 설계

### ECDH P-256 키교환 흐름

```
┌─────────────────────────────────────────────────────────────────┐
│                   ECDH 키교환 및 암호화 흐름                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. CLI → ECDH 키쌍 생성 (generateECDHKeyPair)                  │
│     └── P-256 타원곡선 키쌍 (publicKey, privateKey)              │
│                                                                 │
│  2. CLI → 서버에 공개키 등록 (POST /api/sessions)                │
│     └── { publicKey: base64 } 포함하여 세션 생성                 │
│                                                                 │
│  3. PWA → 세션 목록 조회 (GET /api/sessions)                     │
│     └── CLI의 publicKey 수신                                     │
│                                                                 │
│  4. PWA → 자체 ECDH 키쌍 생성                                    │
│     └── deriveSharedSecret(pwaPrivateKey, cliPublicKey)         │
│     └── AES-256-GCM 대칭키 도출                                  │
│                                                                 │
│  5. PWA → CLI에 자신의 공개키 전달 ('update' Socket.IO 이벤트)   │
│                                                                 │
│  6. CLI → 동일한 공유 비밀 도출                                   │
│     └── deriveSharedSecret(cliPrivateKey, pwaPublicKey)         │
│     └── 양측 동일한 AES-256-GCM 키 보유                          │
│                                                                 │
│  7. 이후 모든 메시지: AES-256-GCM 암호화                         │
│     └── encrypt() / decrypt() (Web Crypto API)                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### AES-256-GCM 선택 이유

| 속성 | 설명 |
|-----|------|
| **표준** | NIST 승인, TLS 1.3 기본 |
| **성능** | 하드웨어 가속 (AES-NI) |
| **브라우저** | Web Crypto API 기본 지원 |
| **Node.js** | crypto 모듈 기본 지원 |
| **인증** | GCM 모드로 무결성 보장 |

### 키 보안 플래그

- `generateECDHKeyPair()`: `extractable: true` — 공개키 export를 위해 불가피
- `deriveSharedSecret()`: **`extractable: false`로 설정 필수** — AES 대칭키를 export할 필요 없음. extractable을 true로 두면 JavaScript에서 키 데이터에 접근 가능하여 위험 증가.

### Wire 패키지 암호화 구현 (packages/wire/src/encryption.ts)

```typescript
// ECDH P-256 키쌍 생성
async function generateECDHKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey']
  )
}

// 공유 비밀(AES-256-GCM 키) 도출
async function deriveSharedSecret(
  privateKey: CryptoKey,
  publicKey: CryptoKey
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: publicKey },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

// AES-256-GCM 암호화
async function encrypt(plaintext: string, key: CryptoKey): Promise<EncryptedData> {
  const nonce = crypto.getRandomValues(new Uint8Array(12))  // 96-bit nonce
  const encoded = new TextEncoder().encode(plaintext)

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, tagLength: 128 },
    key,
    encoded
  )

  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    nonce: btoa(String.fromCharCode(...nonce)),
  }
}

// AES-256-GCM 복호화
async function decrypt(data: EncryptedData, key: CryptoKey): Promise<string> {
  const ciphertext = Uint8Array.from(atob(data.ciphertext), c => c.charCodeAt(0))
  const nonce = Uint8Array.from(atob(data.nonce), c => c.charCodeAt(0))

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce, tagLength: 128 },
    key,
    ciphertext
  )

  return new TextDecoder().decode(plaintext)
}
```

### 메시지 포맷

```typescript
// 와이어 레벨: 모든 메시지는 암호화 컨테이너로 래핑
interface WireMessage {
  t: 'encrypted'        // 메시지 타입 (항상 'encrypted')
  c: string              // Base64 인코딩된 암호화 페이로드
}

// 암호화 페이로드 내부 구조
interface EncryptedPayload {
  sessionId: string      // 세션 식별자
  messageId: string      // 메시지 고유 ID (중복 방지)
  ciphertext: string     // Base64(암호화된 데이터 + 인증태그)
  nonce: string          // Base64(12바이트 nonce)
  timestamp: number      // Unix 타임스탬프 (밀리초)
}

// 복호화 후 평문 구조
interface PlaintextPayload {
  type: 'command' | 'response' | 'error' | 'ping' | 'session-event'
  content?: string
  commandId?: string
  metadata?: Record<string, unknown>
}
```

---

## 키 관리

### ECDH 키쌍 생성 및 공유 비밀 도출

```typescript
// CLI Agent 시작 시 ECDH 키쌍 생성
const keyPair = await generateECDHKeyPair()
// publicKey → 서버에 등록 (POST /api/sessions에 포함)
// privateKey → 메모리에만 보관, 절대 외부 전송 금지

// PWA가 CLI의 publicKey를 받은 후 공유 비밀 도출
const sharedKey = await deriveSharedSecret(pwaPrivateKey, cliPublicKey)
// sharedKey → AES-256-GCM 암호화에 직접 사용

// CLI도 PWA의 publicKey를 받은 후 동일한 공유 비밀 도출
const sharedKey = await deriveSharedSecret(cliPrivateKey, pwaPublicKey)
// 수학적으로 동일한 키 → 서버 개입 없이 E2E 암호화 성립
```

### 키 저장 방식

| 위치 | 저장 방식 | 비고 |
|-----|---------|------|
| CLI (Agent) | 메모리만 (volatile) | 프로세스 종료 시 자동 폐기 |
| PWA | 메모리 (세션 스코프) | 세션 종료 시 삭제 |
| Daemon | 메모리 (volatile) | 재시작 시 새 ECDH 키교환으로 즉시 복구 |
| Server | 미보관 | 공개키 전달 채널만 제공 |

### 키 수명 주기

```
┌──────────────────────────────────────────────────────────────┐
│                        키 수명 주기                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. 생성 (CLI Agent 시작 시)                                  │
│     └── generateECDHKeyPair() → P-256 키쌍                   │
│                                                              │
│  2. 공개키 등록 (서버 경유 전달)                               │
│     └── POST /api/sessions → publicKey 포함                  │
│     └── 서버는 공개키를 세션 정보와 함께 인메모리에 임시 보관  │
│                                                              │
│  3. 키교환 (클라이언트 간 직접)                                │
│     └── PWA가 CLI publicKey로 sharedSecret 도출              │
│     └── CLI가 PWA publicKey로 동일한 sharedSecret 도출       │
│                                                              │
│  4. 사용 (세션 동안)                                          │
│     └── AES-256-GCM 암호화/복호화                            │
│                                                              │
│  5. 폐기                                                      │
│     └── 데몬 종료 시 키 자동 소멸 (메모리 기반)               │
│     └── 재연결 시 새 ECDH 키교환으로 즉시 복구                │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 재연결 시 복구

서버에 키를 저장하지 않으므로 전통적인 키 복구 절차가 없습니다. 데몬이 재시작되거나 연결이 끊기면 새 ECDH 키쌍을 생성하여 즉시 키교환을 재수행합니다. 서버는 새 세션 등록만 처리하며, 이전 세션의 키는 영구적으로 폐기됩니다.

---

## 서버 역할과 한계

### 원칙

서버는 Pure Relay입니다. 암호화된 메시지를 상대방에게 전달하는 역할만 하며, 세션 키나 메시지 내용에 일절 접근하지 않습니다. 세션 정보는 DB가 아닌 인메모리 `activeSessions` Map에만 유지됩니다.

```
┌─────────────────────────────────────────────────────────────┐
│                    서버가 아는 것                            │
├─────────────────────────────────────────────────────────────┤
│  ✓ sessionId (세션 식별자)                                   │
│  ✓ agentId, clientId (연결 식별자)                          │
│  ✓ 타임스탬프                                                │
│  ✓ 메시지 크기                                               │
│  ✓ 연결 상태                                                 │
│  ✓ ECDH 공개키 (키교환용, 비밀 아님)                         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   서버가 모르는 것                            │
├─────────────────────────────────────────────────────────────┤
│  ✗ 명령어 내용                                               │
│  ✗ 응답 내용                                                 │
│  ✗ ECDH 비밀키 (클라이언트에만 존재)                         │
│  ✗ 공유 비밀 / AES-256-GCM 세션 키                          │
│  ✗ 어떤 AI CLI를 사용하는지                                   │
│  ✗ 어떤 프로젝트에서 작업 중인지                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│             DB 스키마 (키/메시지 관련 테이블 없음)            │
├─────────────────────────────────────────────────────────────┤
│  users          - 사용자 계정                                │
│  oauth_accounts - OAuth 연동 정보                            │
│  subscriptions  - 구독 정보                                  │
│  (messages 없음, session_keys 없음)                         │
└─────────────────────────────────────────────────────────────┘
```

### 서버 코드 예시

```typescript
// 서버 Socket.IO 이벤트 처리
io.on('connection', (socket) => {
  // client-auth: JWT 검증 후 세션에 연결
  socket.on('client-auth', async ({ token, sessionId }) => {
    const user = await verifyJWT(token)
    activeSessions.set(sessionId, { ...session, clientSocket: socket })
  })

  // session-join: CLI가 세션에 참여, 공개키 교환 시작
  socket.on('session-join', async ({ sessionId, publicKey }) => {
    // publicKey는 ECDH 공개키 (비밀 아님) → 상대방에게 전달
    const session = activeSessions.get(sessionId)
    if (session?.clientSocket) {
      session.clientSocket.emit('peer-public-key', { publicKey })
    }
  })

  // update: 암호화된 메시지 단순 중계
  socket.on('update', async (wireMessage: WireMessage) => {
    // wireMessage = { t: 'encrypted', c: 'BASE64...' }
    // 복호화 시도 없음 - 서버에 키가 없음
    const peerSocket = getPeerSocket(sessionId, socket.id)
    if (peerSocket) {
      peerSocket.emit('update', wireMessage)
    }
  })
})
```

---

## 와이어 프로토콜 보안

### Socket.IO 보안

1. **`update` 이벤트 Room 멤버십 검증**: 메시지 중계 전 `socket.rooms.has(`session_${sessionId}`)` 확인 필수. Room에 참여하지 않은 소켓의 메시지는 드롭.
2. **키교환 이벤트 분리**: `key-exchange` 이벤트를 `update`와 별도로 분리하여 관심사 명확화.
3. **소켓 인증 미들웨어**: 소켓 연결 시 JWT를 검증하고 `socket.data.userId`에 저장. 이후 모든 이벤트에서 소유권 검증에 활용.

### 입력 검증 (Zod)

- 모든 REST API 요청 body와 Socket.IO 이벤트 페이로드를 Zod 스키마로 검증
- `request.body as any` 패턴 절대 금지
- `@pocket-ai/wire` 패키지에 공유 Zod 스키마 정의:
  - `ClientAuthPayloadSchema`
  - `SessionJoinPayloadSchema`
  - `UpdatePayloadSchema`
  - `KeyExchangePayloadSchema`
  - `CreateSessionBodySchema`

### 세션 ID 생성

- `Math.random()` 사용 금지 (암호학적 불안전)
- `crypto.randomUUID()` 사용 필수 (UUID v4, 암호학적 안전 난수)

### Socket.IO 전송 계층

Pocket AI는 WebSocket 대신 Socket.IO를 전송 계층으로 사용합니다. Socket.IO는 자체 인증 메커니즘을 제공합니다.

```typescript
// Socket.IO 연결 시 인증
const socket = io('wss://api.pocket-ai.app', {
  auth: {
    sessionId: sessionId,
    role: 'agent' | 'client',
    token: jwtToken  // MVP부터 필수 (OAuth 로그인 후 발급)
  },
  transports: ['websocket'],  // polling 비활성화, WebSocket만 사용
  secure: true
})

// 서버 측 미들웨어 인증
io.use(async (socket, next) => {
  const { sessionId, role, token } = socket.handshake.auth

  // JWT 토큰 검증 (MVP부터 필수)
  if (!token) return next(new Error('AUTH_REQUIRED'))
  const user = await verifyJWT(token)
  if (!user) return next(new Error('INVALID_TOKEN'))
  socket.data.user = user

  // 세션 유효성 검증 (인메모리 activeSessions)
  const session = activeSessions.get(sessionId)
  if (!session || session.expiresAt < Date.now()) {
    return next(new Error('INVALID_SESSION'))
  }

  // 세션 소유자 확인
  if (session.userId !== user.sub) {
    return next(new Error('FORBIDDEN'))
  }

  socket.data.sessionId = sessionId
  socket.data.role = role
  next()
})
```

### 암호화 컨테이너 래핑

모든 애플리케이션 메시지는 암호화 컨테이너로 래핑됩니다.

```typescript
// 전송 시: 평문 → 암호화 → 컨테이너 래핑
async function wrapMessage(
  payload: PlaintextPayload,
  key: CryptoKey
): Promise<WireMessage> {
  const json = JSON.stringify(payload)
  const encrypted = await encrypt(json, key)

  return {
    t: 'encrypted',
    c: btoa(JSON.stringify(encrypted))
  }
}

// 수신 시: 컨테이너 언래핑 → 복호화 → 평문
async function unwrapMessage(
  wire: WireMessage,
  key: CryptoKey
): Promise<PlaintextPayload> {
  if (wire.t !== 'encrypted') throw new Error('INVALID_MESSAGE_TYPE')

  const encrypted = JSON.parse(atob(wire.c))
  const json = await decrypt(encrypted, key)

  return JSON.parse(json)
}
```

### 세션 이벤트도 암호화

세션 관련 이벤트 (typing, presence 등)도 동일한 암호화 파이프라인을 통과합니다.

```typescript
// 세션 이벤트 예시
const sessionEvent: PlaintextPayload = {
  type: 'session-event',
  content: JSON.stringify({
    event: 'typing',
    state: true
  }),
  metadata: { source: 'pwa' }
}

// 동일한 암호화 경로로 전송
socket.emit('update', await wrapMessage(sessionEvent, sharedKey))
```

---

## 데몬 보안

### 개요

데몬(Daemon)은 사용자 PC에서 백그라운드로 실행되는 프로세스로, CLI Agent의 지속적 연결을 관리합니다.

### 데몬 보안 모델

```
┌─────────────────────────────────────────────────────────────┐
│                      데몬 보안 계층                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 머신 바인딩                                              │
│     └── 데몬은 사용자의 특정 머신에 바인딩                    │
│     └── 머신 식별자: OS 사용자 + 하드웨어 ID 조합             │
│                                                             │
│  2. 키 보관                                                  │
│     └── ECDH 비밀키 및 공유 비밀을 메모리에만 보관 (volatile) │
│     └── 디스크에 저장하지 않음                                │
│                                                             │
│  3. 프로세스 격리                                             │
│     └── 현재 사용자 권한으로만 실행                           │
│     └── 루트 권한 불필요                                     │
│                                                             │
│  4. 재시작 처리                                               │
│     └── 키가 메모리에만 있으므로 재시작 시 자동 소멸           │
│     └── 새 ECDH 키쌍 생성 → 서버에 공개키 재등록             │
│     └── 상대방과 자동으로 새 키교환 수행                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 데몬 인증

```typescript
// 데몬 → 서버 인증
interface DaemonAuth {
  machineId: string       // 머신 고유 식별자
  daemonToken: string     // 설치 시 발급된 토큰
  sessionId: string       // 세션 ID
}

// 머신 식별자 생성 (예시)
function getMachineId(): string {
  const username = os.userInfo().username
  const hostname = os.hostname()
  const platform = os.platform()
  return crypto.createHash('sha256')
    .update(`${username}:${hostname}:${platform}`)
    .digest('hex')
    .substring(0, 16)
}
```

### 데몬 재시작 시 자동 복구 흐름

```
데몬 재시작                   서버                   PWA
    │                          │                      │
    ├── 1. 새 ECDH 키쌍 생성    │                      │
    │                          │                      │
    ├── 2. POST /api/sessions ─>│ (publicKey 포함)     │
    │                          │                      │
    │                          ├── 3. 세션 업데이트     │
    │                          │                      │
    │                          ├── 4. PWA에 알림 ─────>│
    │                          │                      │
    │                          │        5. PWA, 새 ───>│
    │                          │        publicKey로    │
    │<── 6. 'update' 이벤트 ────┤        키교환 수행    │
    │   (PWA publicKey 포함)    │                      │
    │                          │                      │
    ├── 7. 공유 비밀 도출        │                      │
    │   (새 AES-256-GCM 키)     │                      │
    │                          │                      │
    ├── 8. 암호화 통신 재개 ────>│──────────────────────>
```

---

## 위협 모델

### 위협 1: 네트워크 도청

| 항목 | 내용 |
|-----|------|
| **위협** | 중간자가 네트워크 트래픽 가로챔 |
| **영향** | 높음 (메시지 노출) |
| **방어** | AES-256-GCM E2E 암호화 + TLS 1.3 (이중 암호화) |
| **잔여 위험** | 매우 낮음 |

### 위협 2: MITM (중간자) 공격

| 항목 | 내용 |
|-----|------|
| **위협** | 공격자가 ECDH 공개키 교환 과정에 개입 |
| **영향** | 높음 (키교환 가로채기 시 세션 탈취) |
| **방어** | JWT로 세션 소유자 인증, 서버 TLS로 전송 보호 |
| **잔여 위험** | 낮음 (TLS + JWT 인증 동시 우회 필요) |

### ECDH MITM 잔여 위험 (서버 침해 시)

**인정하는 한계**: 서버가 침해된 경우, 공격자는:
1. CLI에게 가짜 PWA 공개키를 전달
2. PWA에게 가짜 CLI 공개키를 전달
3. 양쪽과 별도의 ECDH 키교환을 수행하여 중간자 공격 가능

**현재 방어**: JWT 인증으로 세션 소유자를 검증하고, TLS로 전송을 보호한다. 서버가 정상이면 MITM은 불가능하다.

**MVP 수용**: 서버 침해 시 MITM 가능성은 QR 방식 이외의 모든 온라인 키교환에 존재하는 근본적 한계이다. MVP에서는 이 위험을 수용한다.

**향후 개선**: SAS(Short Authentication String) 또는 안전 번호 비교 메커니즘 도입으로 상대방 검증 가능.

### 위협 3: 서버 침해

| 항목 | 내용 |
|-----|------|
| **위협** | 공격자가 서버 접근 권한 획득 |
| **영향** | 낮음 (서버에 키/메시지 미보관) |
| **방어** | ECDH 비밀키는 클라이언트에만 존재. 서버는 공개키만 일시 보관 |
| **잔여 위험** | 매우 낮음 (서버에 복호화 가능한 정보 없음) |

### 위협 4: Agent 침해

| 항목 | 내용 |
|-----|------|
| **위협** | 공격자가 Agent 프로세스 접근 |
| **영향** | 치명적 (CLI 완전 접근) |
| **방어** | 로컬 보안 (OS 레벨), 권한 최소화 |
| **잔여 위험** | 중간 (로컬 보안 의존) |

### 위협 5: Client 디바이스 분실

| 항목 | 내용 |
|-----|------|
| **위협** | 휴대폰 분실/도난 |
| **영향** | 높음 (세션 접근 가능) |
| **방어** | 세션 종료 시 키 삭제, 디바이스 잠금, Phase 2+에서 원격 세션 해제 |
| **잔여 위험** | 낮음 (적극적 공격 필요) |

### 위협 6: 데몬 프로세스 침해

| 항목 | 내용 |
|-----|------|
| **위협** | 공격자가 데몬 프로세스의 메모리 접근 |
| **영향** | 치명적 (ECDH 비밀키 탈취 → 메시지 복호화 가능) |
| **방어** | OS 프로세스 격리, 사용자 권한으로만 실행, 키는 메모리에만 보관 |
| **완화** | 데몬 프로세스 무결성 검증, 비정상 접근 탐지 |
| **잔여 위험** | 중간 (로컬 권한 상승 공격 시 노출) |

### 위협 매트릭스

| 위협 | 가능성 | 영향 | 방어 | 잔여 위험 |
|-----|-------|-----|-----|---------|
| 네트워크 도청 | 중간 | 높음 | AES + TLS | 매우 낮음 |
| MITM 공격 | 낮음 | 높음 | JWT 인증 + TLS | 낮음 |
| 서버 침해 | 낮음 | 낮음 | 키 미보관 (Pure Relay) | 매우 낮음 |
| Agent 침해 | 낮음 | 치명적 | 로컬 보안 | 중간 |
| 디바이스 분실 | 중간 | 높음 | 키 삭제 + 원격 해제 | 낮음 |
| 데몬 침해 | 낮음 | 치명적 | OS 격리 + 메모리 키 | 중간 |

---

## 인증

### JWT 보안 정책

**필수 요구사항**:
1. **JWT 시크릿 하드코딩 금지**: `JWT_SECRET` 환경변수가 없으면 서버 시작을 거부해야 한다. 기본값(fallback) 사용 절대 금지.
2. **URL 쿼리파라미터에 토큰 노출 금지**: OAuth 콜백에서 JWT를 URL에 직접 포함하지 않는다.
   - **권장 방식**: 일회성 authorization code를 URL에 전달 → 프론트엔드에서 POST 요청으로 JWT 교환
   - **대안**: `httpOnly`, `secure`, `sameSite=strict` 쿠키로 JWT 설정
3. **localStorage 토큰 저장 시 XSS 주의**: httpOnly 쿠키가 우선이며, localStorage 사용 시 CSP 헤더로 서드파티 스크립트를 제한해야 한다.
4. **토큰 만료**: 현재 7일. 향후 access token(1시간) + refresh token 패턴으로 전환 권장.
5. **로그아웃**: 클라이언트 측 토큰 삭제 필수 (`localStorage.removeItem`).

### OAuth 보안 정책

1. **OAuth 자격증명 기본값 금지**: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` 환경변수가 없으면 서버 시작을 거부.
2. **콜백 URL 화이트리스트**: `GITHUB_CALLBACK_URL` 환경변수로 명시적 지정. 프로덕션/개발 환경별 분리.
3. **state 파라미터**: CSRF 방어를 위해 OAuth 요청 시 `state` 파라미터를 사용 (@fastify/oauth2가 자동 처리).

### CORS 정책

- **`origin: '*'` 절대 금지** (프로덕션)
- 환경변수 `ALLOWED_ORIGINS`에서 허용 origin 목록을 읽어 설정
- 개발 환경: `http://localhost:3002` (PWA), `http://localhost:3001` (서버)
- Socket.IO와 HTTP 모두 동일한 CORS 정책 적용

### 인증 구조

Pocket AI의 인증은 **OAuth + JWT** (사용자 인증)와 **ECDH 자동 키교환** (E2E 암호화)을 명확하게 분리합니다. QR 코드 스캔은 사용하지 않으며, 동일한 GitHub 계정으로 로그인하면 세션 목록이 자동으로 표시되고 ECDH 키교환이 자동으로 수행됩니다.

```
┌─────────────────────────────────────────────────────────────┐
│                      인증 구조                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Phase 1 (MVP): OAuth 로그인 + ECDH 계정 기반 자동 연결      │
│  ├── GitHub OAuth로 계정 생성/로그인                         │
│  ├── JWT 토큰 기반 API 인증 (모든 요청에 필수)                │
│  ├── 동일 계정 → 세션 목록 자동 표시 (GET /api/sessions)     │
│  └── ECDH P-256 자동 키교환으로 E2E 암호화 즉시 성립         │
│                                                             │
│  Phase 2: 팀/엔터프라이즈 SSO                               │
│  ├── SAML 2.0 / OIDC 연동                                  │
│  ├── 조직 기반 접근 제어                                     │
│  ├── 감사 로그                                               │
│  └── IP 허용 목록                                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Phase 1: OAuth + JWT + ECDH 자동 연결 (MVP)

```typescript
// OAuth 로그인 흐름
GET /auth/github   → GitHub OAuth → callback → JWT 발급

// JWT 구조
interface JWTPayload {
  sub: string           // 사용자 ID
  email: string
  provider: 'github'
  iat: number
  exp: number           // 7일 만료
  deviceId: string      // 디바이스 식별자
}

// CLI: ECDH 공개키 포함하여 세션 생성
POST /api/sessions
Authorization: Bearer <jwt>
{
  "agentId": "uuid",
  "publicKey": "base64(ECDH P-256 publicKey)"  // 키교환용
}

// PWA: 동일 계정 세션 목록 조회 → CLI publicKey 수신
GET /api/sessions
Authorization: Bearer <jwt>
Response: [
  {
    "sessionId": "uuid",
    "agentId": "uuid",
    "publicKey": "base64"  // CLI의 ECDH 공개키
  }
]

// PWA: 자신의 publicKey를 CLI에 전달 (Socket.IO 'update' 이벤트)
// → 양측 ECDH 키교환 완료 → AES-256-GCM 암호화 통신 시작
```

### Phase 2: 팀/엔터프라이즈 SSO

```typescript
// SSO 설정
interface SSOConfig {
  provider: 'saml' | 'oidc'
  issuer: string
  clientId: string
  clientSecret: string   // 서버 환경변수로 관리
  allowedDomains: string[]
}

// 조직 기반 접근 제어
interface OrgPolicy {
  orgId: string
  allowedIPs: string[]
  requireMFA: boolean
  sessionMaxAge: number   // 최대 세션 시간
  auditLog: boolean
}
```

### Socket.IO 인증

```typescript
// Socket.IO 연결 시 인증 (JWT 필수)
const socket = io('wss://api.pocket-ai.app', {
  auth: {
    sessionId: sessionId,
    role: 'agent' | 'client',
    token: jwtToken,      // JWT 필수 (MVP부터)
    // Phase 2+: 팀 SSO
    orgId: orgId
  }
})

// 서버 미들웨어 검증
io.use(async (socket, next) => {
  const { sessionId, role, token } = socket.handshake.auth

  // JWT 검증 (MVP부터 필수)
  if (!token) return next(new Error('AUTH_REQUIRED'))
  let user: JWTPayload
  try {
    user = await verifyJWT(token)
  } catch {
    return next(new Error('INVALID_TOKEN'))
  }
  socket.data.user = user

  // 세션 유효성 + 소유자 확인 (인메모리 activeSessions)
  const session = activeSessions.get(sessionId)
  if (!session || session.expiresAt < Date.now()) {
    return next(new Error('INVALID_SESSION'))
  }
  if (session.userId !== user.sub) {
    return next(new Error('FORBIDDEN'))
  }

  socket.data.sessionId = sessionId
  socket.data.role = role
  next()
})
```

---

## 보안 체크리스트

### 개발 시

- [ ] 모든 메시지는 AES-256-GCM으로 암호화
- [ ] 모든 메시지는 `{ t: 'encrypted', c: 'BASE64' }` 컨테이너로 래핑
- [ ] Nonce는 매 메시지마다 새로 생성 (96-bit)
- [ ] ECDH 비밀키는 메모리에만 보관 (디스크 저장 금지)
- [ ] 서버에 비밀키 또는 공유 비밀 절대 전송 금지
- [ ] 로그에 민감 정보 기록 금지 (키, 평문 메시지, 토큰)
- [ ] 데몬 프로세스는 사용자 권한으로만 실행
- [ ] 데몬 재시작 시 새 ECDH 키교환 자동 수행 확인
- [ ] JWT_SECRET 환경변수 필수 (기본값 금지)
- [ ] GITHUB_CLIENT_ID/SECRET 환경변수 필수
- [ ] CORS origin 화이트리스트 설정
- [ ] OAuth 콜백에서 URL 토큰 노출 제거
- [ ] Socket.IO update 이벤트 Room 멤버십 검증
- [ ] 세션 ID는 crypto.randomUUID() 사용
- [ ] deriveSharedSecret extractable: false
- [ ] Zod 입력 검증 적용
- [ ] 오프라인 세션 TTL cleanup (30분)
- [ ] 로그아웃 시 토큰 삭제

### 배포 시

- [ ] TLS 1.3 필수
- [ ] Socket.IO transports를 `['websocket']`으로 제한 (polling 비활성화)
- [ ] HTTPS 리다이렉트 설정
- [ ] CORS 제한적 설정
- [ ] Rate limiting 적용
- [ ] 보안 헤더 설정 (CSP, X-Frame-Options 등)

### 운영 시

- [ ] 정기 보안 업데이트
- [ ] 의존성 취약점 스캔
- [ ] 접근 로그 모니터링
- [ ] 이상 징후 알림 설정
- [ ] 활성 세션 목록 주기적 감사

### Phase별 추가 체크리스트

**Phase 1 MVP (OAuth/JWT + ECDH 자동 연결):**
- [ ] OAuth redirect URI 화이트리스트 설정
- [ ] JWT 서명 키 안전한 보관
- [ ] Refresh token rotation 구현
- [ ] 디바이스별 세션 관리 UI 제공
- [ ] 세션 강제 종료 기능 제공

**Phase 2 (팀/엔터프라이즈 SSO):**
- [ ] SSO 설정 검증 (SAML assertion, OIDC token)
- [ ] 감사 로그 저장 및 보존 정책
- [ ] IP 허용 목록 적용
- [ ] MFA 강제 설정 지원

---

## 보안 연락처

보안 취약점 발견 시:
- Email: security@pocket-ai.app
- 48시간 내 응답
- 90일 책임 있는 공개 정책

---

## 결론

Pocket AI 보안의 핵심:

1. **ECDH P-256 키교환**: 서버 개입 없이 클라이언트 간 직접 키교환, 수학적으로 안전한 공유 비밀 도출
2. **AES-256-GCM E2E 암호화**: ECDH로 도출한 공유 비밀로 모든 메시지 암호화
3. **OAuth from Day 1**: GitHub OAuth + JWT로 사용자 인증 (계정 기반 자동 연결)
4. **서버 완전 Blind (Pure Relay)**: 메시지 내용, 세션 키, ECDH 비밀키 일절 미보관
5. **데몬 보안**: 메모리 기반 키 보관 + 재시작 시 새 ECDH 키교환으로 즉시 복구
6. **단계별 확장**: OAuth/JWT (MVP) → 팀 SSO로 점진적 보안 강화
7. **와이어 보안**: Socket.IO + 암호화 컨테이너 래핑으로 이중 보호

복잡성을 줄여 공격 표면을 최소화하면서, ECDH P-256 기반의 견고한 E2E 암호화를 제공합니다.
