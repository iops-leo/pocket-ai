# Pocket AI Security Design

AES-256-GCM 기반 E2E 암호화 + OAuth 로그인 + QR 디바이스 페어링 + 멀티 디바이스 지원

## 목차

- [보안 원칙](#보안-원칙)
- [암호화 설계](#암호화-설계)
- [키 관리](#키-관리)
- [서버 역할과 한계](#서버-역할과-한계)
- [와이어 프로토콜 보안](#와이어-프로토콜-보안)
- [데몬 보안](#데몬-보안)
- [위협 모델](#위협-모델)
- [인증](#인증)
- [보안 체크리스트](#보안-체크리스트)

---

## 보안 원칙

### 1. 단순함이 보안

복잡한 시스템은 취약점을 만듭니다. Pocket AI는 검증된 단순한 방식을 사용합니다.

| 기존 (복잡) | 개선 (단순) |
|------------|-----------|
| X25519 ECDH | 랜덤 대칭키 생성 |
| HKDF 키 유도 | 직접 키 사용 |
| XChaCha20-Poly1305 | AES-256-GCM |
| HMAC-SHA512 키 트리 | 단일 세션 키 |
| 복잡한 키 교환 프로토콜 | QR 코드 직접 전달 |

### 2. 서버 Blind (메시지 내용)

- 서버는 암호화된 메시지만 중계
- 세션 암호화 키는 서버 공개키로 암호화되어 저장 (서버가 복호화 가능한 키와 분리)
- **서버는 메시지 내용을 읽을 수 없음** - 세션 키로만 복호화 가능하며, 세션 키는 서버의 별도 공개키로 봉인됨
- 서버 침해 시에도 메시지 내용 보호 (봉인된 키와 서버 비밀키 모두 필요)

### 3. 최소 권한

| 컴포넌트 | 권한 범위 |
|---------|---------|
| Agent/Daemon | 로컬 CLI 접근만 |
| Server | 메시지 라우팅 + 암호화된 세션 키 보관 |
| Client (PWA) | 표시만 |

---

## 암호화 설계

### 암호화 스택

```
┌─────────────────────────────────────────────────┐
│                 암호화 계층                       │
├─────────────────────────────────────────────────┤
│                                                 │
│  1. 키 생성                                      │
│     └── crypto.randomBytes(32)  // 256-bit      │
│                                                 │
│  2. 키 전달                                      │
│     └── QR 코드 (Base64 인코딩, 디바이스 페어링)   │
│     └── 서버 보관 (암호화됨, 멀티 디바이스)        │
│                                                 │
│  3. 메시지 암호화                                 │
│     └── AES-256-GCM (Web Crypto / Node crypto)  │
│                                                 │
│  4. 메시지 래핑                                   │
│     └── { t: 'encrypted', c: 'BASE64' }         │
│                                                 │
│  5. 전송                                         │
│     └── Socket.IO (wss://) + TLS 1.3            │
│                                                 │
└─────────────────────────────────────────────────┘
```

### AES-256-GCM 선택 이유

| 속성 | 설명 |
|-----|------|
| **표준** | NIST 승인, TLS 1.3 기본 |
| **성능** | 하드웨어 가속 (AES-NI) |
| **브라우저** | Web Crypto API 기본 지원 |
| **Node.js** | crypto 모듈 기본 지원 |
| **인증** | GCM 모드로 무결성 보장 |

### 메시지 암호화 프로세스

```typescript
// 암호화 (Node.js)
function encrypt(plaintext: string, key: Buffer): EncryptedData {
  const nonce = crypto.randomBytes(12)  // 96-bit nonce (GCM 표준)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ])

  const authTag = cipher.getAuthTag()  // 128-bit 인증 태그

  return {
    ciphertext: encrypted.toString('base64'),
    nonce: nonce.toString('base64'),
    tag: authTag.toString('base64')
  }
}

// 복호화 (Node.js)
function decrypt(data: EncryptedData, key: Buffer): string {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(data.nonce, 'base64')
  )
  decipher.setAuthTag(Buffer.from(data.tag, 'base64'))

  return Buffer.concat([
    decipher.update(Buffer.from(data.ciphertext, 'base64')),
    decipher.final()
  ]).toString('utf8')
}
```

```typescript
// 암호화 (Web Crypto API - PWA)
async function encrypt(plaintext: string, key: CryptoKey): Promise<EncryptedData> {
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, tagLength: 128 },
    key,
    encoded
  )

  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    nonce: btoa(String.fromCharCode(...nonce)),
    // GCM에서 tag는 ciphertext에 포함됨
  }
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

### 키 생성 (CLI/Agent)

```typescript
// CLI Agent가 시작 시 키 생성
function generateSessionKey(): { key: Buffer, keyBase64: string } {
  const key = crypto.randomBytes(32)  // 256-bit
  return {
    key,
    keyBase64: key.toString('base64')
  }
}
```

### QR 코드 키 전달 (디바이스 페어링)

```typescript
// QR 코드에 포함되는 데이터
interface QRPayload {
  key: string        // Base64 인코딩된 256-bit 키
  agentId: string    // Agent 식별자
  server: string     // 서버 URL
  expires: number    // 만료 시간 (Unix timestamp)
}

// QR 코드 생성
function generateQRCode(payload: QRPayload): string {
  const json = JSON.stringify(payload)
  const compressed = zlib.deflateSync(json).toString('base64')
  return qrcode.generate(compressed)
}

// QR 코드 파싱
function parseQRCode(data: string): QRPayload {
  const json = zlib.inflateSync(Buffer.from(data, 'base64')).toString()
  return JSON.parse(json)
}
```

### 키 저장 (멀티 디바이스 지원)

| 위치 | 저장 방식 | 보호 | 비고 |
|-----|---------|-----|------|
| CLI (Agent) | 메모리 (primary) | 프로세스 종료 시 삭제 | 주 키 보유자 |
| CLI (Agent) | 로컬 암호화 파일 (optional) | OS 키체인 또는 파일 암호화 | 세션 지속성 선택 |
| PWA | IndexedDB | 세션 스코프, 브라우저 보안 | 세션 종료 시 삭제 |
| Daemon | 메모리 (volatile) | 프로세스 종료 시 삭제 | 재시작 시 재설정 필요 |
| Server | 서버 공개키로 암호화 | 서버 비밀키로만 복호화 가능 | 멀티 디바이스 키 복구용 |

### 서버 측 암호화된 키 보관 (Happy Coder 참조)

멀티 디바이스 지원을 위해 서버에 세션 키를 **암호화된 상태로** 보관합니다.

```typescript
// 서버에 세션 키 등록 (Agent → Server)
interface EncryptedKeyDeposit {
  sessionId: string
  encryptedSessionKey: string   // 서버 공개키로 암호화된 세션 키
  keyFingerprint: string        // 키 무결성 확인용 해시
}

// 새 디바이스의 키 복구 흐름
// 1. 새 디바이스가 사용자 인증 (OAuth 등)
// 2. 서버가 encryptedSessionKey를 자체 비밀키로 복호화
// 3. 새 디바이스의 공개키로 재암호화하여 전달
// 4. 새 디바이스가 자체 비밀키로 복호화하여 세션 키 획득
```

**핵심 원칙**: 서버는 세션 키를 복호화할 수 있는 능력이 있지만, 메시지 내용에 접근하려면 세션 키 + 각 메시지의 nonce가 필요합니다. 서버 비밀키 관리를 HSM(Hardware Security Module)으로 분리하면 이 위험을 더욱 최소화할 수 있습니다.

### 키 수명 주기

```
┌──────────────────────────────────────────────────────────────┐
│                        키 수명 주기                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. 생성 (CLI Agent)                                          │
│     └── crypto.randomBytes(32)                               │
│                                                              │
│  2. 디바이스 페어링 (QR 코드)                                  │
│     └── 1회용, 5분 만료, 인증 키 아닌 페어링용                  │
│                                                              │
│  3. 서버 보관 (암호화됨)                                       │
│     └── 서버 공개키로 봉인하여 저장                             │
│     └── 멀티 디바이스 키 복구에 사용                            │
│                                                              │
│  4. 사용 (Client + Agent + Daemon)                            │
│     └── 세션 동안 메시지 암호화/복호화                          │
│                                                              │
│  5. 갱신 (24시간+ 세션)                                       │
│     └── 기존 키로 새 키 암호화하여 전달                         │
│     └── 서버의 보관 키도 갱신                                  │
│                                                              │
│  6. 폐기                                                      │
│     └── 세션 종료 시 모든 위치에서 삭제                         │
│     └── 서버 보관분도 삭제                                     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 키 갱신

세션이 오래 지속되는 경우 (24시간+):

```typescript
// 키 갱신 요청 (Agent → Client)
interface KeyRotationMessage {
  type: 'key-rotation'
  newKeyEncrypted: string  // 기존 키로 암호화된 새 키
  switchAfterMessageId: string  // 이 메시지 이후부터 새 키 사용
}

// 서버 보관 키도 함께 갱신
interface ServerKeyUpdate {
  sessionId: string
  newEncryptedSessionKey: string  // 새 키를 서버 공개키로 암호화
  oldKeyFingerprint: string      // 교체 대상 확인
}
```

---

## 서버 역할과 한계

### 원칙

서버는 메시지 내용을 읽을 수 없습니다. 다만 멀티 디바이스 지원을 위해 **암호화된 세션 키**를 보관합니다.

```
┌─────────────────────────────────────────────────────────────┐
│                    서버가 아는 것                            │
├─────────────────────────────────────────────────────────────┤
│  ✓ sessionId (세션 식별자)                                   │
│  ✓ agentId, clientId (연결 식별자)                          │
│  ✓ 타임스탬프                                                │
│  ✓ 메시지 크기                                               │
│  ✓ 연결 상태                                                 │
│  ✓ 암호화된 세션 키 (서버 공개키로 봉인됨)                    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   서버가 모르는 것                            │
├─────────────────────────────────────────────────────────────┤
│  ✗ 명령어 내용                                               │
│  ✗ 응답 내용                                                 │
│  ✗ 어떤 AI CLI를 사용하는지                                   │
│  ✗ 어떤 프로젝트에서 작업 중인지                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                서버가 할 수 있지만 하지 않는 것               │
├─────────────────────────────────────────────────────────────┤
│  △ 세션 키 복호화 (서버 비밀키 필요)                          │
│    └── HSM 분리로 운영자도 접근 불가하게 설계                  │
│    └── 프로덕션: 서버 비밀키는 HSM에만 저장                   │
│    └── 키 복구 API 호출 시에만 HSM이 일시적으로 복호화        │
└─────────────────────────────────────────────────────────────┘
```

### 서버 코드 예시

```typescript
// 서버는 메시지를 그대로 전달만 함 (Socket.IO)
io.on('connection', (socket) => {
  const { sessionId } = socket.handshake.auth

  socket.on('message', async (wireMessage: WireMessage) => {
    // wireMessage = { t: 'encrypted', c: 'BASE64...' }

    // 복호화 시도 없음 - 세션 키가 평문으로 존재하지 않음
    // 메타데이터만 검증
    if (!isValidSession(sessionId)) {
      return socket.emit('error', { code: 'INVALID_SESSION' })
    }

    // 상대방에게 그대로 전달
    const peerSocket = getPeerSocket(sessionId, socket.id)
    if (peerSocket) {
      peerSocket.emit('message', wireMessage)
    } else {
      // 오프라인 - 큐에 저장 (여전히 암호화된 상태)
      await messageQueue.add(sessionId, wireMessage)
    }
  })
})
```

---

## 와이어 프로토콜 보안

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

  // 세션 유효성 검증
  const session = await getSession(sessionId)
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
function wrapMessage(payload: PlaintextPayload, key: Buffer): WireMessage {
  const json = JSON.stringify(payload)
  const encrypted = encrypt(json, key)

  return {
    t: 'encrypted',
    c: Buffer.from(JSON.stringify(encrypted)).toString('base64')
  }
}

// 수신 시: 컨테이너 언래핑 → 복호화 → 평문
function unwrapMessage(wire: WireMessage, key: Buffer): PlaintextPayload {
  if (wire.t !== 'encrypted') throw new Error('INVALID_MESSAGE_TYPE')

  const encrypted = JSON.parse(Buffer.from(wire.c, 'base64').toString())
  const json = decrypt(encrypted, key)

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
socket.emit('message', wrapMessage(sessionEvent, sessionKey))
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
│     └── 세션 키를 메모리에만 보관 (volatile)                  │
│     └── 디스크에 저장하지 않음                                │
│                                                             │
│  3. 프로세스 격리                                             │
│     └── 현재 사용자 권한으로만 실행                           │
│     └── 루트 권한 불필요                                     │
│                                                             │
│  4. 재시작 처리                                               │
│     └── 키가 메모리에만 있으므로 재시작 시 소실               │
│     └── 옵션 A: 서버에서 암호화된 키 복구 (인증 후)           │
│     └── 옵션 B: QR 코드로 새 세션 설정                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 데몬 인증

```typescript
// 데몬 → 서버 인증
interface DaemonAuth {
  machineId: string       // 머신 고유 식별자
  daemonToken: string     // 설치 시 발급된 토큰
  sessionId: string       // 복구할 세션 ID
}

// 머신 식별자 생성 (예시)
function getMachineId(): string {
  const username = os.userInfo().username
  const hostname = os.hostname()
  const platform = os.platform()
  // 머신 고유 해시 생성
  return crypto.createHash('sha256')
    .update(`${username}:${hostname}:${platform}`)
    .digest('hex')
    .substring(0, 16)
}
```

### 데몬 재시작 시 키 복구 흐름

```
데몬 재시작                   서버                        비고
    │                          │
    ├── 1. 인증 요청 ──────────>│                     머신ID + 토큰
    │                          │
    │                          ├── 2. 인증 검증           머신 바인딩 확인
    │                          │
    │<──── 3. 암호화된 키 ──────┤                     서버 비밀키로 복호화 후
    │       (디바이스 키로      │                     데몬 전용 키로 재암호화
    │        재암호화됨)        │
    │                          │
    ├── 4. 키 복호화            │                     메모리에 세션 키 복원
    │                          │
    ├── 5. 세션 재개 ──────────>│                     기존 세션에 재연결
    │                          │
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

### 위협 2: 서버 침해

| 항목 | 내용 |
|-----|------|
| **위협** | 공격자가 서버 접근 권한 획득 |
| **영향** | 높음 (암호화된 세션 키 노출 가능) |
| **방어** | 세션 키는 서버 공개키로 암호화됨. 서버 비밀키 없이 복호화 불가 |
| **완화** | 프로덕션: 서버 비밀키를 HSM에 격리 보관 |
| **잔여 위험** | 중간 (서버 비밀키까지 탈취 시 세션 키 복호화 가능) |

### 위협 3: QR 코드 노출

| 항목 | 내용 |
|-----|------|
| **위협** | 타인이 QR 코드 촬영 |
| **영향** | 치명적 (세션 탈취 가능) |
| **방어** | 5분 만료, 1회 사용, 사용 후 즉시 폐기 |
| **잔여 위험** | 중간 (물리적 보안 필요) |

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
| **영향** | 치명적 (세션 키 탈취 → 메시지 복호화 가능) |
| **방어** | OS 프로세스 격리, 사용자 권한으로만 실행, 키는 메모리에만 보관 |
| **완화** | 데몬 프로세스 무결성 검증, 비정상 접근 탐지 |
| **잔여 위험** | 중간 (로컬 권한 상승 공격 시 노출) |

### 위협 7: 서버 비밀키 침해 (멀티 디바이스 관련)

| 항목 | 내용 |
|-----|------|
| **위협** | 서버의 비밀키 탈취 → 보관된 모든 세션 키 복호화 가능 |
| **영향** | 치명적 (활성 세션의 메시지 복호화 가능) |
| **방어** | HSM(Hardware Security Module)에 서버 비밀키 격리 |
| **완화** | 정기적 서버 키 로테이션, 세션 키 갱신 시 새 서버 키로 재봉인 |
| **잔여 위험** | 낮음 (HSM 사용 시), 중간 (소프트웨어 키 관리 시) |

### 위협 8: 멀티 디바이스 세션 공유 악용

| 항목 | 내용 |
|-----|------|
| **위협** | 비인가 디바이스가 세션 키 복구를 요청 |
| **영향** | 높음 (세션 탈취) |
| **방어** | 키 복구 시 강력한 사용자 인증 필수 (OAuth + 디바이스 확인) |
| **완화** | 활성 디바이스 목록 관리, 새 디바이스 추가 시 기존 디바이스 알림 |
| **잔여 위험** | 낮음 (인증 우회 필요) |

### 위협 매트릭스

| 위협 | 가능성 | 영향 | 방어 | 잔여 위험 |
|-----|-------|-----|-----|---------|
| 네트워크 도청 | 중간 | 높음 | AES + TLS | 매우 낮음 |
| 서버 침해 | 낮음 | 높음 | 암호화된 키 + HSM | 중간 |
| QR 노출 | 낮음 | 치명적 | 시간/횟수 제한 | 중간 |
| Agent 침해 | 낮음 | 치명적 | 로컬 보안 | 중간 |
| 디바이스 분실 | 중간 | 높음 | 키 삭제 + 원격 해제 | 낮음 |
| 데몬 침해 | 낮음 | 치명적 | OS 격리 + 메모리 키 | 중간 |
| 서버 비밀키 탈취 | 매우 낮음 | 치명적 | HSM + 키 로테이션 | 낮음 |
| 멀티 디바이스 악용 | 낮음 | 높음 | 강력한 인증 | 낮음 |

---

## 인증

### 인증 구조

Pocket AI의 인증은 **OAuth + JWT** (사용자 인증)와 **QR 코드** (디바이스 페어링)를 명확하게 분리합니다.

```
┌─────────────────────────────────────────────────────────────┐
│                      인증 구조                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Phase 1 (MVP): OAuth 로그인 + QR 디바이스 페어링            │
│  ├── GitHub OAuth로 계정 생성/로그인                   │
│  ├── JWT 토큰 기반 API 인증 (모든 요청에 필수)                │
│  ├── QR 코드 = 디바이스 페어링 + E2E 암호화 키 교환           │
│  │   (QR은 인증 수단이 아님)                                 │
│  └── 멀티 디바이스 세션 관리                                  │
│                                                             │
│  Phase 2: 팀/엔터프라이즈 SSO                               │
│  ├── SAML 2.0 / OIDC 연동                                  │
│  ├── 조직 기반 접근 제어                                     │
│  ├── 감사 로그                                               │
│  └── IP 허용 목록                                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Phase 1: OAuth + JWT 인증 (MVP)

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

// 인증된 세션 생성
POST /api/sessions
Authorization: Bearer <jwt>
{
  "agentId": "uuid",
  "machineId": "hash"   // 데몬 머신 식별자
}

// 멀티 디바이스 세션 키 복구
POST /api/sessions/:sessionId/recover-key
Authorization: Bearer <jwt>
{
  "devicePublicKey": "base64"  // 새 디바이스의 공개키
}
Response: {
  "encryptedSessionKey": "base64"  // 새 디바이스 공개키로 암호화된 세션 키
}
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

  // 세션 유효성 + 소유자 확인
  const session = await getSession(sessionId)
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
- [ ] 키는 메모리에 우선 저장 (로컬 파일 저장은 선택적, 반드시 암호화)
- [ ] QR 코드는 5분 후 만료, 1회 사용
- [ ] 서버에 평문 세션 키 절대 전송 금지 (반드시 서버 공개키로 암호화)
- [ ] 로그에 민감 정보 기록 금지 (키, 평문 메시지, 토큰)
- [ ] 데몬 프로세스는 사용자 권한으로만 실행
- [ ] 데몬 재시작 시 키 복구 흐름에 인증 필수

### 배포 시

- [ ] TLS 1.3 필수
- [ ] Socket.IO transports를 `['websocket']`으로 제한 (polling 비활성화)
- [ ] HTTPS 리다이렉트 설정
- [ ] CORS 제한적 설정
- [ ] Rate limiting 적용 (특히 키 복구 API)
- [ ] 보안 헤더 설정 (CSP, X-Frame-Options 등)
- [ ] 서버 비밀키 HSM 보관 (프로덕션)

### 운영 시

- [ ] 정기 보안 업데이트
- [ ] 의존성 취약점 스캔
- [ ] 접근 로그 모니터링
- [ ] 이상 징후 알림 설정
- [ ] 서버 키 정기 로테이션 (90일 권장)
- [ ] 활성 디바이스 목록 주기적 감사
- [ ] 키 복구 API 호출 패턴 모니터링

### Phase별 추가 체크리스트

**Phase 1 MVP (OAuth/JWT + QR 디바이스 페어링):**
- [ ] OAuth redirect URI 화이트리스트 설정
- [ ] JWT 서명 키 안전한 보관
- [ ] Refresh token rotation 구현
- [ ] 디바이스별 세션 관리 UI 제공
- [ ] QR 코드 페어링 시 JWT 인증 필수 (미인증 QR 스캔 거부)
- [ ] 페어링된 디바이스 목록 및 취소 기능 제공

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

1. **단순함**: 복잡한 프로토콜 대신 검증된 AES-256-GCM
2. **OAuth from Day 1**: GitHub OAuth + JWT로 사용자 인증 (QR은 인증 수단이 아님)
3. **QR = 디바이스 페어링**: QR 코드는 PC↔폰 연결 및 E2E 암호화 키 교환에만 사용
4. **서버 Blind**: 메시지 내용은 서버가 절대 읽을 수 없음
5. **멀티 디바이스**: 세션 키를 서버에 암호화 보관하여 새 디바이스 지원 (HSM으로 보호)
6. **데몬 보안**: 메모리 기반 키 보관 + 머신 바인딩
7. **단계별 확장**: OAuth/JWT (MVP) → 팀 SSO로 점진적 보안 강화
8. **와이어 보안**: Socket.IO + 암호화 컨테이너 래핑으로 이중 보호

복잡성을 줄여 공격 표면을 최소화하면서, 실용적인 멀티 디바이스 지원을 제공합니다.
