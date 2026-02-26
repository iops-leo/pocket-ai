# Pocket AI — 시스템 점검 보고서

> 작성일: 2026-02-26
> 분석 범위: apps/pwa, apps/server, packages/cli, packages/wire
> 분석 관점: UI/UX (Designer) · 아키텍처 (Architect) · 코드 품질 (Quality Reviewer)

---

## 총평 스코어카드

| 영역 | 등급 | 핵심 이슈 |
|------|------|---------|
| UI/UX | 5/10 | Arial 강제 적용, 모바일 safe area 미적용, 접근성 미비 |
| 아키텍처 | 6/10 | 인메모리 세션 스토어, CSRF 검증 누락, 확장성 병목 |
| 백엔드 품질 | 7/10 | seq race condition, JWT 타입 미검증, 브로드캐스트 범위 |
| 보안 | 6/10 | Session key 평문 저장, ECDH 공개키 인증 부재 |
| 안정성 | 7/10 | session-join DB fallback 없음, 메시지 유실 가능 |

---

## Part 1. UI/UX

### 1-1. 폰트 — 즉시 수정 필요 [P0]

`apps/pwa/src/app/globals.css:20`에 `font-family: Arial`이 선언되어 Geist 폰트를 덮어쓰고 있다.
`layout.tsx`에서 CSS 변수(`--font-geist-sans`)를 등록했지만 body에 적용이 안 된 상태.

```css
/* 현재 — Arial 강제 적용 */
body { font-family: Arial, Helvetica, sans-serif; }

/* 수정 */
body { font-family: var(--font-geist-sans), system-ui, sans-serif; }
```

### 1-2. 모바일 PWA UX 이슈 [P0]

**iOS safe area 미적용** (`TerminalChat.tsx:546`)
입력창이 iPhone 홈 바에 가려진다. `pb-4` → `max(16px, env(safe-area-inset-bottom))`로 수정 필요.

**채팅 후 뒤로 가기 시 사이드바 미복원** (`dashboard/page.tsx:182-184`)
`setActiveSession(null)` 호출 시 모바일이면 `setIsMobileSidebarOpen(true)` 함께 호출해야 함.
`hasAutoOpenedMobileSidebar.current = true`로 인해 최초 1회만 자동 오픈되어 이후 빈 화면 방치.

**`window.prompt()` 사용** (`SessionSidebar.tsx:330`)
PWA 전체화면 모드에서 네이티브 prompt는 UX를 끊는다. 인라인 편집 패턴으로 교체 필요.

### 1-3. 컴포넌트 일관성 [P1]

**버튼 시스템 없음** — `rounded-lg`/`rounded-xl` 혼재, 공유 Button 컴포넌트 없음.

| 위치 | 클래스 |
|------|--------|
| `login/page.tsx:102` | `rounded-xl py-4 font-bold` |
| `NewSessionModal.tsx:344` | `rounded-xl py-2.5 font-medium` |
| `SessionSidebar.tsx:242` | `rounded-lg py-2.5 font-medium` ← 불일치 |

**Session 타입 중복 정의** — `dashboard/page.tsx:13-24`와 `SessionSidebar.tsx:8-19`에 각각 정의. `wire` 패키지나 `@/types`로 단일화 필요.

**모달 닫기 버튼 형태 불일치**
- `NewSessionModal.tsx`: `rounded-lg` (사각형)
- `SessionDetailsModal.tsx`: `rounded-full` (원형)

### 1-4. 하드코딩 텍스트 i18n 누락 [P1]

CLAUDE.md i18n 규칙 위반 — `useTranslations` 없이 한국어 직접 사용:

- `SlashCommandDropdown.tsx:115-119` — "슬래시 명령어", "↑↓ 이동 · Tab/Enter 선택 · Esc 닫기"
- `MessageList.tsx:63-68` — "세션 연결됨", "AI에게 메시지를 보내세요"

### 1-5. 에러/로딩/빈 상태 처리 [P1]

**삭제/이름변경 실패 묵음 처리**
```tsx
// dashboard/page.tsx:299, 333
} catch {
  // 실패 시 사용자에게 아무 피드백 없음
}
```

**세션 없음 empty state 중복** (`dashboard/page.tsx:417-434`)
"세션 선택" 문구와 "세션 없음" 박스가 동시에 렌더링됨. 조건 분기 필요.

**시스템 에러가 채팅 버블로 노출** (`TerminalChat.tsx:186-192`)
E2E 오류가 어시스턴트 메시지 형태로 표시되어 AI 응답으로 오해 가능.

**성공 피드백 없음** — 세션 생성 후 토스트/알림 없음.

### 1-6. 접근성 [P2]

- **ARIA 속성 전무** — `aria-label`, `aria-modal`, `aria-labelledby` 미사용
- **포커스 트랩 없음** — `NewSessionModal.tsx`에서 Tab 키가 모달 바깥으로 이동
- **색상 대비 미달** — `text-gray-600` on `bg-gray-900` = 3.0:1 (WCAG AA 기준 4.5:1 미달)
- **rename/delete 버튼 hover-only** — 키보드 포커스 시 시각적으로 보이지 않음 (`focus-visible:opacity-100` 없음)
- **터치 영역 32px** — iOS HIG 권장치 44px 미달 (`SessionSidebar.tsx:326-341`)

---

## Part 2. 아키텍처

### 2-1. 보안 취약점

**[CRITICAL] OAuth CSRF state 검증 무력화** (`apps/server/src/index.ts:49-51`)
```typescript
checkStateFunction: (_request: any, callback: any) => {
    callback();  // state 검증 없이 항상 통과
},
```
공격자가 임의의 state로 OAuth 콜백을 트리거 가능. JWT 토큰이 URL 쿼리 파라미터로 노출 (`?token=...`).

**[HIGH] session-online 이벤트 전체 브로드캐스트** (`socket.ts:118`)
```typescript
io.emit('session-online', { sessionId, metadata });  // 모든 사용자에게 노출!
```
다른 사용자의 PWA에도 세션 ID와 메타데이터가 전달됨.
수정: `io.to(`user_${userId}`).emit(...)` 방식으로 사용자별 룸 격리.

**[HIGH] Session key 평문 로컬 저장** (`packages/cli/src/config.ts:52-60`)
`~/.config/pocket-ai/config.json`에 ECDH 키쌍과 AES session key가 Base64 평문으로 저장됨.
로컬 파일 접근 권한이 있는 공격자가 전체 대화 이력 복호화 가능.

**[MEDIUM] ECDH 공개키 인증 부재**
키 교환 시 공개키 진위 검증 메커니즘 없음. MITM 시 공격자 키 주입 가능.
TOFU(Trust-On-First-Use) 핑거프린트 검증 추가 권장.

### 2-2. 확장성 병목

**인메모리 세션 스토어** (`apps/server/src/routes/sessions.ts:16`)
전체 세션을 메모리 Map으로 관리 → 수평 확장(멀티 인스턴스) 불가.
서버 시작 시 DB의 **모든** 세션을 로드 (`loadSessionsFromDB`).
Redis Adapter 연동이 문서에는 계획되어 있으나 코드에 미구현.

**DB 커넥션 풀 고정** (`apps/server/src/db/db.ts:72`)
`max: 10` 하드코딩. 메시지 저장이 per-message DB insert이므로 연결 수 증가 시 병목.

**`recent-paths` 전체 테이블 스캔** (`sessions.ts:185-216`)
사용자의 모든 세션 조회 후 앱 레이어에서 중복 제거. `user_id` 단독 인덱스 없어 순차 스캔.

### 2-3. 안정성 이슈

**session-join에 DB fallback 없음** (`socket.ts:128-145`)
`client-auth`는 DB fallback이 있지만 `session-join`은 없음.
서버 재시작 후 CLI가 재연결 중인 짧은 윈도우 동안 PWA가 영구히 join 실패.

**메시지 전달 보장 없음**
`update` 이벤트가 fire-and-forget. 네트워크 단절 시 메시지 유실 가능.
Socket.IO acknowledgement + gap detection + 재동기화 메커니즘 없음.

**PWA 키쌍 미저장** (`dashboard/page.tsx:201-202`)
PWA가 세션 생성 시 ECDH 키쌍을 생성하지만 저장하지 않음.
페이지 새로고침 시 키쌍 유실 → 해당 세션 메시지 복호화 불가.

**메모리-DB 정리 기준 불일치** (`sessions.ts:55-57`)
메모리 cleanup은 `offlineSince` 기준, DB cleanup은 `updated_at` 기준으로 상이.
서버 재시작 후 복원된 세션에 `offlineSince`가 미설정 → 자동 정리 대상에서 누락.

**E2E session key fallback 위험** (`TerminalChat.tsx:176-183`)
5초 타임아웃 후 `sharedSecretRef`를 직접 메시지 복호화에 사용하는 fallback 존재.
CLI는 session key로 암호화했는데 PWA는 shared secret으로 복호화 시도 → 실패해도 명확한 피드백 없음.

### 2-4. E2E 암호화 강점 (확인된 보안 구현)

- **표준 준수**: ECDH P-256 + AES-256-GCM (TLS 1.3 동일 조합)
- **96-bit 랜덤 IV**: 매 암호화마다 신규 생성 (`encryption.ts:113`)
- **Non-extractable derived key**: `extractable: false` 설정 (`encryption.ts:48`)
- **Pure Relay**: 서버가 암호화된 body를 그대로 저장, 복호화하지 않음
- **Session Key 분리**: ECDH는 key transport에만, 실제 메시지는 별도 session key

---

## Part 3. 백엔드 코드 품질

### 3-1. Critical

**seq race condition** (`socket.ts:8-30`)
```
Message A: getNextSeq() → DB 조회 (lastSeq=5)
Message B: getNextSeq() → DB 조회 (lastSeq=5)  ← 캐시 미스
Message A: → next=6, 캐시 설정
Message B: → next=6  ← 중복!
```
`messages` 테이블에 `(session_id, seq)` UNIQUE 제약조건 없음 (`migrations/003_messages.ts:17-21`).
`saveMessage`가 `.catch()` fire-and-forget이라 중복 INSERT 발생.

**JWT decoded.sub 타입 미검증** (`routes/sessions.ts:71-76`, `socket.ts:56`)
```typescript
let decoded: any;
decoded = fastify.jwt.verify(token);
const userId = decoded.sub;  // sub가 undefined여도 진행
```
`sub`가 없는 JWT → `userId === undefined` → 소유권 검사 통과 가능.
서버 전체 7개 라우트 핸들러 + 2개 소켓 핸들러 동일 패턴.

### 3-2. High

**DELETE 엔드포인트 소유권 검증 비대칭** (`sessions.ts:306-324`)
메모리에 세션 있을 시 DB 소유권 재확인 없이 삭제 진행.
멀티 인스턴스 환경에서 메모리 세션의 userId가 DB 실제 소유자와 다를 수 있음.

**Socket.IO 이벤트 Zod 스키마 미적용** (`socket.ts`)
`schemas.ts`에 `ClientAuthSchema`, `SessionJoinSchema` 등이 정의되어 있으나 실제 핸들러에서 미사용.
모든 이벤트 핸들러가 `payload: any`로 수신.

**IPC DaemonClient 멀티라인 버퍼 파싱 버그** (`client/daemon-client.ts:47-58`)
단일 data 이벤트에 여러 줄이 도착하거나 JSON이 분할 청크로 올 때 `JSON.parse`가 실패.
서버 측(`ipc-server.ts:73-74`)은 `split('\n')`으로 올바르게 처리하는데 클라이언트만 비대칭.

**seenUuids/seenLineHashes Set 무제한 메모리 증가** (`session-watcher.ts:67, 266`)
장시간 세션에서 수천~수만 개 누적 가능. GeminiSessionWatcher는 재초기화(`689`)하는데 일관성 없음.

**login.ts 포트 충돌 시 unhandled rejection** (`commands/login.ts:19`)
포트 `9876` 하드코딩. 서버 에러 이벤트 핸들러 없음. 5분 내 재시도 시 `EADDRINUSE`.

### 3-3. Medium

**`io.emit` 전체 브로드캐스트** (`socket.ts:118`) — 위 아키텍처 섹션 참조

**recent-paths LIMIT 없음** (`sessions.ts:185-216`) — 사용자 세션 전체 조회 후 앱 레이어 필터링

**Daemon handleStartSession이 성공 반환하지만 실제 구현 없음** (`daemon.ts:107-117`)
```typescript
// TODO: 새 세션 생성 (node-pty + Socket.IO)
return { success: true, data: { sessionId, created: true } };  // 실제 PTY 생성 안 함
```

**cleanup 기준 이중성** (`sessions.ts:45-62`) — 위 아키텍처 섹션 참조

**Daemon setInterval 클린업 누락** (`daemon.ts:46-47`)
`start()`에서 5초 interval 반환값 미저장 → `shutdown()`에서 `clearInterval` 불가.

**JSONB 이중 직렬화** (`socket.ts:41`)
`JSON.stringify(body) as any`로 string 저장 후, 조회 시 이중 직렬화 방어 코드 필요.

---

## 종합 우선순위 액션 아이템

### 즉시 수정 (P0) — 기능 손상/보안

| # | 항목 | 위치 | 노력 |
|---|------|------|------|
| 1 | `globals.css` body font-family를 `var(--font-geist-sans)`로 수정 | `globals.css:20` | 1줄 |
| 2 | `io.emit('session-online')` → 사용자별 룸으로 제한 | `socket.ts:118` | 1줄 |
| 3 | `(session_id, seq)` UNIQUE 제약조건 추가 (DB 마이그레이션) | `migrations/` | Low |
| 4 | JWT `decoded.sub` 타입 검증 미들웨어 통일 | `routes/*.ts` | Low |
| 5 | OAuth `checkStateFunction` CSRF state 검증 구현 | `index.ts:49-51` | Low |

### 높은 우선순위 (P1) — UX/안정성

| # | 항목 | 위치 | 노력 |
|---|------|------|------|
| 6 | iOS safe area inset 적용 (입력창 하단) | `TerminalChat.tsx:546` | Low |
| 7 | 모바일 채팅 뒤로가기 시 사이드바 재오픈 | `dashboard/page.tsx:182` | Low |
| 8 | `session-join`에 DB fallback 추가 | `socket.ts:128` | Low |
| 9 | Socket.IO 이벤트에 Zod 스키마 검증 적용 (schemas.ts 활용) | `socket.ts` | Low |
| 10 | 하드코딩 텍스트 i18n 처리 | `SlashCommandDropdown.tsx`, `MessageList.tsx` | Low |
| 11 | 삭제/이름변경 실패 시 에러 토스트 추가 | `dashboard/page.tsx:299,333` | Low |
| 12 | `window.prompt()` → 인라인 편집 교체 | `SessionSidebar.tsx:330` | Medium |
| 13 | IPC DaemonClient 버퍼 파싱 `split('\n')` 방식으로 통일 | `daemon-client.ts:47` | Low |
| 14 | `seenUuids`/`seenLineHashes` Set 상한 추가 (예: LRU 10000) | `session-watcher.ts` | Low |
| 15 | Daemon `setInterval` 반환값 저장 + `clearInterval` | `daemon.ts:46` | 1줄 |

### 중기 개선 (P2) — 품질/보안

| # | 항목 | 노력 |
|---|------|------|
| 16 | Session key 로컬 저장 암호화 (OS keychain) | Medium |
| 17 | `recent-paths` DB 레벨 LIMIT + `user_id` 인덱스 추가 | Low |
| 18 | PWA 생성 세션의 ECDH 키쌍 로컬 저장 | Medium |
| 19 | 메모리-DB cleanup 기준 통일 (offlineSince 설정) | Low |
| 20 | 공유 컴포넌트 추출 (Button, LoadingScreen, AppLogo, Session 타입) | Medium |
| 21 | 시스템 에러 메시지를 채팅 버블이 아닌 SystemMessage 배너로 분리 | Low |
| 22 | 모달 ARIA 속성 + 포커스 트랩 추가 | Low |
| 23 | Rate limiting 도입 (Socket.IO + REST API) | Medium |

### 장기 과제 (P3) — 확장성

| # | 항목 | 노력 |
|---|------|------|
| 24 | Redis Adapter로 Socket.IO 수평 확장 지원 | High |
| 25 | activeSessions를 Redis로 이전 | High |
| 26 | 메시지 전달 보장 (ACK + gap detection + 재동기화) | High |
| 27 | Session key rotation 정책 구현 | Medium |
| 28 | Daemon 핵심 기능 구현 (다중 세션 관리) | High |
| 29 | 스와이프 제스처 (사이드바 open/close) | Medium |
| 30 | Gemini CLI transcript parser 고도화 | Medium |

---

## 긍정적 평가 (잘 된 부분)

- **JSONL 트랜스크립트 파싱**: Claude Code 네이티브 파일을 직접 읽어 안정적인 이벤트 추출
- **Engine별 watcher 팩토리**: `SessionTranscriptWatcher` 인터페이스로 Claude/Codex/Gemini 추상화
- **세션 재등록 복원력**: `auth-error` 수신 시 자동 재등록 + `onSessionIdUpdate` 콜백
- **AES-256-GCM 구현 품질**: 랜덤 96-bit IV, non-extractable derived key, session key 분리
- **Pure Relay 설계 일관성**: DB에 암호화된 body 그대로 저장, 서버 plaintext 미접촉
- **`resolveWorkingDirectory`**: `~` 확장, 상대경로 절대화, 존재 확인 모두 처리하는 방어적 구현
- **PWA disconnect grace period**: 1.5초 grace로 빠른 재연결 시 UI 깜빡임 방지

---

*분석 도구: Designer · Architect · Quality Reviewer 에이전트 병렬 실행*
