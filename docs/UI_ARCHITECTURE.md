# Pocket AI PWA 사용자 인터페이스 아키텍처

## 개요

Pocket AI PWA는 Next.js 14(App Router) 기반의 모던 웹 애플리케이션으로, PC의 AI CLI 세션을 모바일/웹에서 원격으로 제어할 수 있습니다. 모든 메시지는 AES-256-GCM으로 E2E 암호화되어 릴레이 서버는 평문을 절대 볼 수 없습니다.

## 핵심 기술 스택

| 계층 | 기술 | 버전 |
|-----|------|------|
| 프레임워크 | Next.js (App Router) | 14.2.35 |
| 언어 | TypeScript | 5.x |
| 스타일링 | Tailwind CSS | 3.4.1 |
| UI 아이콘 | Lucide React | 0.575.0 |
| 메시지 렌더러 | MessageList + ToolCard (커스텀) | - |
| 실시간 통신 | Socket.IO Client | 4.8.3 |
| 암호화 | @pocket-ai/wire | 1.0.0 |
| QR 코드 | html5-qrcode | 2.x (설치 예정) |

---

## 현재 구현된 화면 (MVP)

### 1. 로그인 페이지 (`/login`)

**파일**: `/apps/pwa/src/app/login/page.tsx`

**상태**: 완전 구현됨

**기능**:
- GitHub OAuth 로그인
- JWT 토큰을 localStorage에 저장 (`pocket_ai_token`)
- 토큰 있으면 자동으로 대시보드로 리다이렉트
- 로딩 상태 관리

**UI 특징**:
- 다크 테마 (bg-gray-950)
- 그래디언트 텍스트 (blue-400 → emerald-400)
- 반응형 디자인
- GitHub 아이콘 포함 로그인 버튼

**개선사항**:
- 에러 메시지 표시 (OAuth 실패 시)
- 로그인 프로세스 진행률 표시
- 접근성(a11y) 개선 필요

### 2. 대시보드 페이지 (`/dashboard`)

**파일**: `/apps/pwa/src/app/dashboard/page.tsx`

**상태**: 기본 구현 완료, 개선 필요

**기능**:
- 활성 PC 세션 목록 조회 (`GET /api/sessions`)
- 세션 클릭 시 터미널 세션 진입
- 10초 주기 폴링으로 세션 상태 갱신
- 로그아웃 버튼
- 새로고침 버튼

**현재 API 연동**:
```
GET {NEXT_PUBLIC_API_URL}/api/sessions
헤더: Authorization: Bearer {token}

응답:
{
  success: boolean,
  data: Array<Session> | null,
  error?: string
}

Session 인터페이스:
{
  sessionId: string,
  publicKey: string,
  metadata: {
    hostname?: string,
    engine?: string
  },
  status: string
}
```

**UI 특징**:
- 그리드 레이아웃 (md:grid-cols-2)
- 카드 스타일 세션 (호버 효과, 애니메이션)
- 세션당 호스트명, 엔진, 상태 표시
- 빈 상태 메시지

**개선 필요 사항**:
- Socket.IO를 이용한 실시간 세션 업데이트 (폴링 대신)
- 세션 오프라인/온라인 상태 시각화
- 세션 생성 버튼 추가 (향후)
- 세션 상세 정보 토글
- 에러 복구 UI

### 3. 터미널 채팅 컴포넌트 (`/dashboard` → 세션 클릭 시)

**파일**: `/apps/pwa/src/components/TerminalChat.tsx`

**상태**: 구현 완료 (Happy 스타일 구조화 채팅 UI)

**기능**:
- 구조화 메시지 렌더러 (xterm.js 제거)
  - `text` → 모노스페이스 텍스트 블록 (pre-wrap)
  - `tool-call` → 툴 카드 (아이콘 + 이름/인자 + 로딩 스피너)
  - `tool-result` → 툴 카드 완료 (체크/오류 아이콘 + 접힘/펼침 출력)
- Socket.IO로 실시간 세션 접속
- ECDH P-256 기반 키 교환
- AES-256-GCM E2E 암호화
- 사용자 입력 → 암호화 → 전송
- CLI 응답 수신 → 복호화 → MessageList 상태 업데이트

**Socket.IO 이벤트 흐름**:
```
1. session-join: { sessionId, token }
   ↓
2. join-success: { publicKey: string }
   ↓
3. 공유 비밀 파생 (ECDH)
   ↓
4. key-exchange: { sessionId, publicKey, sender: 'pwa' }
   ↓
5. update 이벤트로 암호화된 구조화 메시지 송수신
   - 전송: { t: 'encrypted', sessionId, sender: 'pwa', body: ... }
   - 수신: text/tool-call/tool-result → 복호화 → messages 상태 업데이트
```

**UI 특징**:
- 풀화면 구조화 채팅 뷰
- 상단 헤더 (뒤로가기, 세션 ID, 상태 인디케이터)
- 텍스트 블록 + 툴 카드 렌더러 (MessageList, ToolCard)
- 로딩 상태 오버레이
- 클립보드 붙여넣기 버튼
- 빠른 명령어 칩 (/switch, clear)

**개선 필요 사항**:
- 세션 종료 버튼
- 터미널 기록 검색 기능

---

## 개선 필요한 화면

### 1. 로그인 페이지 - 강화

**필요한 개선**:

1. **OAuth 에러 처리**
   ```tsx
   // searchParams에서 error 파라미터 확인
   const error = searchParams.get('error');
   // 에러 메시지 표시 (예: "계정 생성 실패", "접근 거부")
   ```

2. **로딩 상태 세분화**
   - "GitHub 로그인 처리 중..."
   - "계정 정보 확인 중..."

3. **비로그인 사용자 가이드**
   - "Pocket AI란?" 설명
   - CLI 설치 안내 사전 표시
   - FAQ 섹션

### 2. 대시보드 페이지 - 강화 및 개선

**필요한 개선**:

1. **실시간 세션 업데이트**
   ```tsx
   // Socket.IO로 폴링 대신 실시간 갱신
   useEffect(() => {
     const socket = io(serverUrl, { auth: { token } });
     socket.on('update-session', (session) => {
       setSessions(prev => [...]);
     });
     return () => socket.disconnect();
   }, []);
   ```

2. **세션 상태 개선**
   - online/offline 상태 표시
   - 마지막 활동 시간
   - 예상 반응 시간 (ping)

3. **세션 카드 기능 확장**
   - 세션 정보 모달/사이드패널
   - 빠른 작업 버튼 (복사, 공유 등)
   - 세션 로그 보기
   - 세션 삭제 기능

4. **검색 및 필터링**
   - 호스트명으로 검색
   - 엔진 필터 (Claude, Codex, Gemini)
   - 상태 필터 (온라인/오프라인)

5. **세션 생성/관리**
   ```tsx
   // QR 코드 페어링으로 새로운 CLI 세션 추가
   <button>새 세션 연결</button>
   ```

### 3. 터미널 채팅 - 강화

**필요한 개선**:

1. **연결 상태 관리**
   ```tsx
   // Socket 재연결 로직
   socket.on('disconnect', () => {
     showDisconnectNotification();
     attemptReconnect();
   });
   ```

2. **세션 제어 기능**
   - "세션 종료" 버튼
   - "연결 끊김/다시 연결" 상태
   - 타임아웃 처리 (10초 무응답)

3. **UI/UX 개선**
   - 터미널 스크롤 위치 고정 (최신 메시지)
   - 클립보드 복사 지원
   - 전체화면 모드
   - 터미널 기록 다운로드

4. **접근성**
   - 키보드 내비게이션
   - 스크린 리더 지원
   - ARIA 레이블

---

## 새로 만들어야 할 화면

### 1. 설정/프로필 페이지 (`/settings`) - CRITICAL

**파일**: `/apps/pwa/src/app/settings/page.tsx` (신규 생성)

**상태**: 미구현

**중요성**: CRITICAL - CLI 로그인 플로우에 필수

**기능**:

1. **프로필 정보**
   - GitHub 사용자명 표시
   - 계정 생성 날짜
   - 활성 디바이스 목록

2. **CLI 토큰 관리** (가장 중요)
   ```tsx
   // localStorage에서 'pocket_ai_token' 읽기
   const token = localStorage.getItem('pocket_ai_token');
   // JWT 토큰 전체 표시
   // 복사 버튼 제공 - 사용자가 CLI 로그인에 필요
   ```

   **CLI 로그인 플로우**:
   ```bash
   # 사용자는 PC에서 다음을 실행:
   pocket-ai login

   # PWA 설정 페이지에서 토큰 복사
   # CLI 프롬프트에 토큰 붙여넣기
   # 인증 완료
   ```

3. **토큰 관리**
   - 토큰 복사 버튼 (클립보드)
   - 토큰 재발급 버튼
   - 토큰 만료 날짜 표시
   - 로그아웃 옵션

4. **디바이스 관리** (향후)
   - 연결된 PC 목록
   - 디바이스 이름 변경
   - 디바이스 제거

**컴포넌트 구조**:
```
SettingsPage
├── ProfileCard
│   ├── UserAvatar
│   ├── UserName
│   └── CreatedDate
├── CLITokenSection (CRITICAL)
│   ├── TokenDisplay
│   ├── CopyButton
│   ├── RegenerateButton
│   └── ExpiryInfo
├── DeviceManagement (향후)
│   ├── DeviceList
│   └── DeviceCard
└── AccountSettings
    ├── LogoutButton
    └── DeleteAccountButton (향후)
```

**UI 스펙**:
```tsx
<div className="max-w-2xl mx-auto p-6">
  <h1 className="text-2xl font-bold mb-8">설정</h1>

  {/* 프로필 섹션 */}
  <section className="mb-8 p-6 border border-gray-700 rounded-2xl bg-gray-900">
    <h2 className="text-lg font-semibold mb-4">프로필</h2>
    {/* 프로필 정보 */}
  </section>

  {/* CLI 토큰 섹션 */}
  <section className="mb-8 p-6 border border-gray-700 rounded-2xl bg-gray-900 bg-yellow-500/5">
    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
      <span className="text-yellow-400">⚠️</span>
      CLI 로그인 토큰
    </h2>
    <p className="text-sm text-gray-400 mb-4">
      PC의 CLI에서 인증할 때 이 토큰이 필요합니다.
    </p>
    <div className="bg-gray-950 border border-gray-700 rounded-lg p-4 font-mono text-sm">
      {token}
    </div>
    <div className="mt-4 flex gap-3">
      <button className="px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-700">
        복사
      </button>
      <button className="px-4 py-2 border border-gray-600 rounded-lg hover:bg-gray-800">
        새 토큰 생성
      </button>
    </div>
  </section>

  {/* 계정 설정 */}
  <section className="p-6 border border-gray-700 rounded-2xl bg-gray-900">
    <h2 className="text-lg font-semibold mb-4">계정</h2>
    <button className="w-full px-4 py-2 text-red-400 border border-red-400/50 rounded-lg hover:bg-red-400/10">
      로그아웃
    </button>
  </section>
</div>
```

**API 연동**:
- `/api/profile` - 사용자 프로필 정보 조회 (선택)
- `/api/token/regenerate` - 토큰 재발급 (선택)

### 2. QR 코드 페어링 페이지 (`/pair-device`) - 구현 예정

**파일**: `/apps/pwa/src/app/pair-device/page.tsx` (신규 생성)

**상태**: 미구현

**목적**: PC의 CLI 데몬과 PWA를 QR 코드로 페어링

**기능**:

1. **QR 코드 생성**
   - 무작위 256-bit 대칭 키 생성
   - QR 코드로 인코딩:
     ```json
     {
       "type": "pocket-ai-pairing",
       "sessionId": "uuid",
       "encryptionKey": "base64-encoded-key",
       "serverUrl": "https://relay-server.com"
     }
     ```
   - 사용자가 출력하여 CLI에서 스캔

2. **QR 코드 스캔** (디바이스 페어링 시)
   - html5-qrcode 사용
   - CLI가 생성한 QR 코드 스캔
   - 공유 키 자동 동기화

3. **페어링 확인**
   - "PC에서 대기 중..." 상태
   - 페어링 성공 알림
   - 새 세션 자동으로 목록에 추가

**UI 스펙**:
```tsx
<div className="max-w-2xl mx-auto p-6">
  <h1 className="text-2xl font-bold mb-8">새 세션 연결</h1>

  <div className="grid md:grid-cols-2 gap-8">
    {/* QR 코드 생성 탭 */}
    <div className="p-6 border border-gray-700 rounded-2xl bg-gray-900">
      <h2 className="font-semibold mb-4">1단계: QR 코드 표시</h2>
      <div className="bg-white p-4 rounded-lg w-64 h-64 mx-auto flex items-center justify-center">
        {/* QR 코드 렌더링 (qrcode.react 라이브러리) */}
      </div>
      <p className="text-sm text-gray-400 mt-4 text-center">
        PC에서 <code>pocket-ai pair</code>를 실행하고<br/>
        이 QR 코드를 스캔하세요.
      </p>
    </div>

    {/* QR 코드 스캔 탭 */}
    <div className="p-6 border border-gray-700 rounded-2xl bg-gray-900">
      <h2 className="font-semibold mb-4">또는: QR 코드 스캔</h2>
      <div className="bg-gray-950 border border-gray-700 rounded-lg overflow-hidden">
        <video id="scanner" className="w-full h-64"></video>
      </div>
      <p className="text-sm text-gray-400 mt-4 text-center">
        html5-qrcode로 PC의 QR 코드 스캔
      </p>
    </div>
  </div>

  {/* 페어링 상태 */}
  {pairingState === 'waiting' && (
    <div className="mt-8 p-4 border border-blue-500/50 bg-blue-500/10 rounded-lg text-center">
      <Loader2 className="inline-block animate-spin mr-2" />
      PC에서 대기 중입니다...
    </div>
  )}
</div>
```

**컴포넌트**:
- `QRCodeGenerator` - QR 코드 생성 및 표시
- `QRCodeScanner` - html5-qrcode 통합
- `PairingStatus` - 페어링 진행 상태

**패키지 추가 필요**:
```bash
npm install qrcode.react html5-qrcode
```

### 3. 세션 상세 정보 모달 (`/dashboard` 내 모달)

**파일**: `/apps/pwa/src/components/SessionDetailsModal.tsx` (신규 생성)

**상태**: 미구현

**기능**:
- 세션 메타데이터 전체 표시
- 세션 공개 키 보기 (디버깅)
- 세션 통계 (메시지 수, 연결 시간)
- 세션 로그 보기
- 세션 복제/내보내기

**UI**:
```tsx
<dialog className="fixed inset-0 bg-black/50 flex items-center justify-center">
  <div className="bg-gray-900 border border-gray-700 rounded-2xl max-w-2xl w-full max-h-96 overflow-y-auto p-6">
    <h2 className="text-xl font-semibold mb-4">세션 정보</h2>

    <div className="space-y-4">
      <InfoRow label="세션 ID" value={sessionId} copyable />
      <InfoRow label="호스트명" value={metadata.hostname} />
      <InfoRow label="엔진" value={metadata.engine} />
      <InfoRow label="상태" value={status} />
      <InfoRow label="연결 시간" value={connectedAt} />
      <InfoRow label="공개 키" value={publicKey} copyable />
    </div>

    <button className="mt-6 w-full py-2 bg-blue-600 rounded-lg hover:bg-blue-700">
      닫기
    </button>
  </div>
</dialog>
```

---

## 컴포넌트 구조 및 계층

### 전체 컴포넌트 트리

```
RootLayout
├── ServiceWorkerRegistration
├── App Pages
│   ├── page.tsx (redirect to /login)
│   ├── login/page.tsx
│   │   └── LoginContent (with Suspense)
│   ├── dashboard/page.tsx
│   │   ├── SessionList
│   │   │   ├── SessionCard (반복)
│   │   │   └── EmptyState
│   │   ├── Header
│   │   │   ├── RefreshButton
│   │   │   └── LogoutButton
│   │   └── TerminalChat (조건부)
│   ├── settings/page.tsx (신규)
│   │   ├── ProfileSection
│   │   ├── CLITokenSection (CRITICAL)
│   │   ├── DeviceManagement
│   │   └── AccountSettings
│   └── pair-device/page.tsx (신규)
│       ├── QRCodeGenerator
│       ├── QRCodeScanner
│       └── PairingStatus
└── Shared Components
    ├── TerminalChat
    ├── MessageList
    ├── ToolCard
    ├── SessionDetailsModal (신규)
    ├── CopyButton (신규)
    ├── LoadingSpinner
    └── ErrorBoundary (향후)
```

### 컴포넌트별 책임

| 컴포넌트 | 책임 | 상태 관리 |
|---------|------|---------|
| LoginPage | OAuth 인증 | URL params, localStorage |
| DashboardPage | 세션 목록 조회/관리 | useState (sessions, activeSession) |
| TerminalChat | 구조화 채팅 UI, E2E 암호화 | useState (messages), useRef (socket, sharedSecret) |
| MessageList | text/tool 메시지 렌더링, 자동 스크롤 | Props (messages) |
| ToolCard | 툴 카드 렌더링 (상태, 접힘/펼침) | useState (expanded) |
| SettingsPage | 프로필 및 토큰 관리 | localStorage (token 표시) |
| PairDevicePage | QR 코드 페어링 | useState (pairingState) |
| SessionCard | 세션 카드 렌더링 | Props |
| QRCodeGenerator | QR 코드 생성 | useState (qrCode) |
| QRCodeScanner | QR 코드 스캔 | useState (scanResult) |

---

## 상태 관리 전략

### 1. localStorage (클라이언트 로컬)

**목적**: 영구 저장, 세션 간 유지

```typescript
// 로그인 토큰 (CRITICAL)
localStorage.getItem('pocket_ai_token')
localStorage.setItem('pocket_ai_token', token)
localStorage.removeItem('pocket_ai_token')

// 기타 설정 (향후)
localStorage.getItem('ui_preferences')  // 다크/라이트 모드 등
localStorage.getItem('paired_devices')  // 페어링된 디바이스 캐시
```

### 2. React State (컴포넌트 로컬)

**목적**: UI 상태, 폼 입력, 로딩 상태

```typescript
// DashboardPage
const [sessions, setSessions] = useState<Session[]>([])
const [activeSession, setActiveSession] = useState<string | null>(null)
const [isLoading, setIsLoading] = useState(true)
const [error, setError] = useState<string | null>(null)

// TerminalChat
const [isConnecting, setIsConnecting] = useState(true)
```

### 3. useRef (성능 최적화)

**목적**: Socket.IO, 터미널 인스턴스 등 변경해도 리렌더링 불필요

```typescript
// TerminalChat
const socketRef = useRef<Socket | null>(null)
const termInstance = useRef<Terminal | null>(null)
const sharedSecretRef = useRef<CryptoKey | null>(null)
```

### 4. Socket.IO Events (실시간)

**목적**: 서버 및 다른 클라이언트와 실시간 동기화

```typescript
// 수신 이벤트
socket.on('update-session', (session) => setSessions(...))
socket.on('session-offline', (sessionId) => ...)
socket.on('update', (encryptedPayload) => decrypt(...))

// 송신 이벤트
socket.emit('session-join', { sessionId, token })
socket.emit('key-exchange', { sessionId, publicKey, sender: 'pwa' })
socket.emit('update', { t: 'encrypted', sessionId, body: ciphertext })
```

### 상태 흐름도

```
초기 로드
  ↓
localStorage에서 토큰 확인
  ├→ 없음 → /login 리다이렉트
  └→ 있음 → /dashboard 이동
      ↓
      API에서 세션 목록 조회
      ↓
      Socket.IO 실시간 리스너 등록
      ├→ 세션 추가/제거 → setSessions 업데이트
      └→ 세션 상태 변경 → 카드 UI 업데이트
          ↓
          사용자가 세션 클릭
          ↓
          TerminalChat 컴포넌트 로드
          ├→ Socket.IO 연결
          ├→ ECDH 키 교환
          ├→ E2E 암호화 준비 완료
          └→ 사용자 입력 ↔ 암호화 ↔ 전송 루프
```

---

## API 연동

### 인증 헤더

**모든 API 요청**에 JWT 토큰 포함:

```typescript
const token = localStorage.getItem('pocket_ai_token')
fetch(`${NEXT_PUBLIC_API_URL}/api/...`, {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
})
```

### REST API 엔드포인트

#### 1. 세션 목록 조회

```http
GET /api/sessions
Authorization: Bearer {token}

응답 (200):
{
  "success": true,
  "data": [
    {
      "sessionId": "uuid",
      "publicKey": "base64-encoded-ECDH-public-key",
      "metadata": {
        "hostname": "my-pc",
        "engine": "claude",
        "createdAt": "2026-02-22T10:00:00Z"
      },
      "status": "online"
    }
  ]
}

응답 (401):
{
  "success": false,
  "error": "Unauthorized"
}
```

#### 2. 세션 생성 (향후)

```http
POST /api/sessions
Authorization: Bearer {token}
Content-Type: application/json

요청:
{
  "hostname": "my-new-pc",
  "engine": "claude"
}

응답 (201):
{
  "success": true,
  "data": {
    "sessionId": "uuid",
    "publicKey": "base64-public-key"
  }
}
```

#### 3. 프로필 조회 (향후)

```http
GET /api/profile
Authorization: Bearer {token}

응답 (200):
{
  "success": true,
  "data": {
    "id": "user-id",
    "username": "github-username",
    "email": "user@example.com",
    "createdAt": "2026-01-01T00:00:00Z",
    "profileImage": "https://..."
  }
}
```

#### 4. 토큰 재발급 (향후)

```http
POST /api/token/regenerate
Authorization: Bearer {token}

응답 (200):
{
  "success": true,
  "data": {
    "token": "new-jwt-token"
  }
}
```

### Socket.IO 이벤트

#### 연결 및 인증

```typescript
// 클라이언트 → 서버
io(serverUrl, {
  path: '/v1/updates',
  auth: {
    token: 'jwt-token',
    role: 'pwa' // 또는 'cli', 'agent'
  }
})

// 서버 응답
socket.on('connect', () => {
  // 연결 성공
})

socket.on('connect_error', (error) => {
  // 연결 실패
})
```

#### 세션 참여

```typescript
// PWA 클라이언트 → 서버
socket.emit('session-join', {
  sessionId: 'uuid',
  token: 'jwt-token'
})

// 서버 → PWA 클라이언트
socket.on('join-success', (data) => {
  // data.publicKey: CLI의 ECDH 공개 키 (base64)
  // ECDH 키 교환 시작
})

socket.on('join-error', (error) => {
  // error.error: 에러 메시지
})
```

#### 키 교환

```typescript
// PWA 클라이언트 → CLI 클라이언트 (via 서버)
socket.emit('key-exchange', {
  sessionId: 'uuid',
  publicKey: 'base64-encoded-pwa-public-key',
  sender: 'pwa'
})

// CLI 클라이언트 → PWA 클라이언트 (via 서버)
socket.on('key-exchange', (data) => {
  // data.publicKey: CLI의 ECDH 공개 키
  // data.sender: 'cli'
})
```

#### 메시지 송수신

```typescript
// PWA → 서버 → CLI (암호화됨)
socket.emit('update', {
  t: 'encrypted',
  sessionId: 'uuid',
  sender: 'pwa',
  body: 'BASE64_CIPHERTEXT' // AES-256-GCM 암호화
})

// CLI → 서버 → PWA (암호화됨)
socket.on('update', async (payload) => {
  if (payload.sender === 'cli' && payload.body) {
    const decrypted = await decrypt(payload.body, sharedSecret)
    const message = JSON.parse(decrypted)
    // message.t: 'text' | 'tool-call-start' | 'turn-end' 등
  }
})
```

#### 세션 상태 변경

```typescript
// 서버 → PWA (실시간)
socket.on('update-session', (session) => {
  // session: Session 객체
  // status가 변경됨 (online → offline 등)
})

socket.on('session-offline', (sessionId) => {
  // 세션이 오프라인 됨
})

socket.on('session-online', (sessionId) => {
  // 세션이 온라인 됨
})
```

---

## PWA 요구사항 및 구현

### 1. Web App Manifest

**파일**: `/apps/pwa/public/manifest.json`

```json
{
  "name": "Pocket AI",
  "short_name": "Pocket AI",
  "description": "어디서든 PC의 AI CLI 세션을 이어서 사용하세요",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait-primary",
  "theme_color": "#030712",
  "background_color": "#030712",
  "icons": [
    {
      "src": "/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icon-maskable-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable"
    }
  ],
  "screenshots": [
    {
      "src": "/screenshot-login.png",
      "sizes": "540x720",
      "type": "image/png",
      "form_factor": "narrow"
    },
    {
      "src": "/screenshot-dashboard.png",
      "sizes": "1280x720",
      "type": "image/png",
      "form_factor": "wide"
    }
  ],
  "shortcuts": [
    {
      "name": "대시보드",
      "short_name": "대시보드",
      "description": "활성 세션 목록 보기",
      "url": "/dashboard",
      "icons": [{ "src": "/icon-192x192.png", "sizes": "192x192" }]
    },
    {
      "name": "설정",
      "short_name": "설정",
      "description": "CLI 토큰 및 프로필 관리",
      "url": "/settings",
      "icons": [{ "src": "/icon-192x192.png", "sizes": "192x192" }]
    }
  ]
}
```

### 2. Service Worker

**파일**: `/apps/pwa/public/sw.js`

**기능**:
- 오프라인 지원 (캐싱)
- 백그라운드 동기화 (향후)
- 푸시 알림 (향후)

```javascript
// 기본 서비스 워커 구조
const CACHE_NAME = 'pocket-ai-v1'
const urlsToCache = [
  '/',
  '/manifest.json',
  '/offline.html'
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  )
})

self.addEventListener('fetch', (event) => {
  // 네트워크 우선 전략 (API는 항상 네트워크)
  if (event.request.url.includes('/api/')) {
    event.respondWith(fetch(event.request))
  } else {
    // 정적 자산: 캐시 우선
    event.respondWith(
      caches.match(event.request).then((response) =>
        response || fetch(event.request)
      )
    )
  }
})
```

### 3. PWA 메타데이터

**파일**: `/apps/pwa/src/app/layout.tsx` (기존)

**이미 구현됨**:
```typescript
export const metadata: Metadata = {
  title: "Pocket AI",
  description: "어디서든 PC의 AI CLI 세션을 이어서 사용하세요",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Pocket AI",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#030712",
};
```

**개선 필요**:
- apple-touch-icon 추가
- theme-color 메타 태그
- og: (Open Graph) 메타 태그

### 4. 설치 프롬프트 (향후)

```typescript
// installPrompt를 캡처해 사용자 정의 UI 표시
const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)

useEffect(() => {
  window.addEventListener('beforeinstallprompt', (e: any) => {
    e.preventDefault()
    setInstallPrompt(e)
  })
}, [])

const handleInstall = async () => {
  if (installPrompt) {
    installPrompt.prompt()
    setInstallPrompt(null)
  }
}
```

---

## 환경 변수

### 클라이언트 환경 변수 (`.env.local`)

```bash
# 릴레이 서버 URL
NEXT_PUBLIC_API_URL=https://relay-server.fly.dev
# 또는 개발 환경
# NEXT_PUBLIC_API_URL=http://localhost:3001

# Socket.IO 디버그 (개발 환경)
# NEXT_PUBLIC_DEBUG_SOCKET=true
```

### 필수 환경 변수

| 변수 | 설명 | 예시 |
|------|------|------|
| `NEXT_PUBLIC_API_URL` | 릴레이 서버 베이스 URL | `https://relay.fly.dev` |

---

## 성능 및 최적화

### 1. 코드 분할

```typescript
// TerminalChat은 동적 로드 (큰 라이브러리 의존)
const TerminalChat = dynamic(() => import('@/components/TerminalChat'), {
  ssr: false,
  loading: () => <Loader2 className="animate-spin" />
})
```

### 2. 이미지 최적화

```typescript
// Next.js Image 컴포넌트 사용 (자동 최적화)
import Image from 'next/image'

<Image
  src="/logo.png"
  alt="Pocket AI"
  width={64}
  height={64}
  priority // 중요 이미지
/>
```

### 3. Socket.IO 최적화

```typescript
// 불필요한 리렌더링 방지
const socketRef = useRef(null) // useState 대신 useRef

// 이벤트 리스너 정리
useEffect(() => {
  const socket = io(...)
  socket.on('event', handler)

  return () => {
    socket.off('event', handler)
    socket.disconnect()
  }
}, [])
```

### 4. 번들 크기 주의

| 라이브러리 | 크기 | 주의사항 |
|-----------|------|--------|
| socket.io-client | ~100KB | 필수 |
| lucide-react | ~50KB | 트리 쉐이킹됨 |
| tailwindcss | 빌드 시만 포함 | 프로덕션에 포함 안 됨 |
| ~~xterm.js~~ | ~~200KB~~ | **제거됨** - 구조화 채팅 UI로 교체, 번들 경량화 |

---

## 접근성 (a11y)

### WCAG 2.1 AA 준수 체크리스트

- [ ] 모든 상호작용 요소에 aria-label/aria-describedby
- [ ] 키보드 네비게이션 (Tab, Enter, Escape)
- [ ] 충분한 색상 대비 (최소 4.5:1)
- [ ] 포커스 인디케이터 시각화
- [ ] 스크린 리더 지원
- [ ] 터미널 접근성 개선 (aria-live 등)

**예시**:
```tsx
<button
  onClick={handleLogout}
  aria-label="로그아웃"
  title="로그아웃 (Alt+Q)"
  className="..."
>
  <LogOut size={20} />
</button>
```

---

## 에러 처리 및 사용자 피드백

### 1. 에러 바운더리 (향후)

```typescript
// ErrorBoundary 컴포넌트 추가
export class ErrorBoundary extends React.Component {
  state = { hasError: false }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-red-400">
          <p>오류가 발생했습니다.</p>
          <button onClick={() => window.location.href = '/'}>
            대시보드로 돌아가기
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
```

### 2. 토스트 알림 (향후)

```typescript
// 토스트 알림 시스템 구현
const showToast = (message: string, type: 'success' | 'error' | 'info') => {
  // 화면 오른쪽 아래에 알림 표시
}
```

### 3. 사용자 피드백 메시지

| 상황 | 메시지 | 색상 |
|------|--------|------|
| 로그인 성공 | "로그인되었습니다" | green |
| 토큰 복사 | "토큰이 복사되었습니다" | green |
| 연결 끊김 | "서버 연결이 끊어졌습니다" | red |
| 재연결 중 | "재연결 중..." | yellow |
| 토큰 만료 | "토큰이 만료되었습니다. 다시 로그인하세요." | red |

---

## 모바일 응답형 디자인

### 브레이크포인트

```
xs: 0px (모바일 기본)
sm: 640px
md: 768px (태블릿)
lg: 1024px
xl: 1280px
2xl: 1536px
```

### 모바일 최적화 예시

```tsx
{/* 모바일: 1줄, 태블릿+: 2줄 그리드 */}
<div className="grid gap-4 md:grid-cols-2">
  {sessions.map(session => <SessionCard />)}
</div>

{/* 모바일: 컬럼, 데스크탑: 로우 */}
<div className="flex flex-col md:flex-row gap-4">
  {content}
</div>

{/* 모바일: 작은 패딩, 데스크탑: 큰 패딩 */}
<div className="p-4 md:p-12">
  {content}
</div>
```

---

## 라우팅 구조

### 최종 라우트 맵

```
/                    → /login (리다이렉트)
/login               → 로그인 페이지
/dashboard           → 세션 목록 (기본)
  └─ (세션 클릭)    → TerminalChat (대시보드 내 표시)
/settings            → 프로필 & CLI 토큰 (신규)
/pair-device         → QR 코드 페어링 (신규)
/offline             → 오프라인 페이지 (향후)
/404                 → 404 에러 (기본)
```

---

## 개발 체크리스트

### Phase 1: 현재 구현 완성

- [x] 로그인 페이지
- [x] 대시보드 세션 목록
- [x] 터미널 채팅 (E2E 암호화)
- [x] Happy 스타일 구조화 채팅 UI (xterm.js → MessageList/ToolCard)
- [x] CLI output-parser (⏺ 패턴 → tool-call/tool-result 이벤트)
- [ ] 에러 처리 강화
- [ ] 로딩 상태 개선
- [ ] 접근성 개선

### Phase 2: 새로운 페이지

- [ ] 설정/프로필 페이지 (CRITICAL)
  - [ ] CLI 토큰 표시 및 복사
  - [ ] 프로필 정보
  - [ ] 로그아웃 버튼
- [ ] QR 코드 페어링 페이지
  - [ ] QR 코드 생성
  - [ ] QR 코드 스캔
  - [ ] 페어링 상태 표시

### Phase 3: 고급 기능

- [ ] 실시간 세션 업데이트 (Socket.IO)
- [ ] 세션 상세 정보 모달
- [ ] 토큰 재발급 기능
- [ ] 디바이스 관리
- [ ] 토스트 알림 시스템
- [ ] 에러 바운더리
- [ ] 서비스 워커 개선 (오프라인 캐시)

### Phase 4: 성능 & 디버깅

- [ ] 번들 크기 분석 및 최적화
- [ ] 성능 모니터링 (Core Web Vitals)
- [ ] E2E 테스트 (Playwright)
- [ ] 단위 테스트 (Jest + React Testing Library)

---

## 참고: 와이어 프로토콜 메시지 타입

CLI ↔ PWA 간 메시지 형식 (암호화 후 전송, `packages/wire/src/types.ts` 정의)

```typescript
// 텍스트 (CLI 출력 — ANSI 제거된 plain text)
{ t: 'text', text: string }

// 도구 호출 시작 (CLI output-parser가 ⏺ 패턴 감지 시 생성)
{ t: 'tool-call', id: string, name: string, arguments: string }

// 도구 실행 결과
{ t: 'tool-result', id: string, result: string, error?: string }

// 세션 이벤트
{ t: 'session-event', event: 'typing' | 'stopped-typing' | 'processing' }
```

**CLI output-parser (`packages/cli/src/utils/output-parser.ts`)**:
- `⏺ ToolName(args)` 패턴 감지 → `tool-call` 이벤트 생성
- 들여쓰기 라인 수집 → `tool-result` 이벤트 flush
- 로컬 터미널에는 raw ANSI 그대로 출력 (사용자 경험 유지)

---

## 요약

Pocket AI PWA는 **E2E 암호화된 터미널** 기능을 중심으로 설계되었습니다. 현재 MVP는 로그인, 대시보드, 터미널 채팅이 구현되었고, **설정 페이지의 CLI 토큰 표시**가 CLI 로그인 플로우를 완성하기 위해 CRITICAL하게 필요합니다.

각 페이지는 한글 UI, 다크 테마, 반응형 디자인을 유지하며, Socket.IO를 통한 실시간 업데이트와 AES-256-GCM 암호화로 보안을 보장합니다.

**다음 우선순위**:
1. `/settings` 페이지 구현 (토큰 복사 기능 CRITICAL)
2. 대시보드 실시간 업데이트 (Socket.IO 폴링 → 리스너)
3. `/pair-device` 페이지 (QR 코드 페어링)
