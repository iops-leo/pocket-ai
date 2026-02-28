# Pocket AI — 경쟁 분석 & 전략 문서

> 최종 업데이트: 2026-02-28
> 분석 기준: 5개 전문 에이전트 병렬 조사 결과 종합

---

## 목차

1. [시장 현황](#1-시장-현황)
2. [경쟁사 지형도](#2-경쟁사-지형도)
3. [Pocket AI 차별화 포인트](#3-pocket-ai-차별화-포인트)
4. [사용자 채택 장벽](#4-사용자-채택-장벽)
5. [현재 구현 갭](#5-현재-구현-갭)
6. [Aider vs Codex 결정](#6-aider-vs-codex-결정)
7. [전략 로드맵](#7-전략-로드맵)

---

## 1. 시장 현황

### 수요 검증

| 지표 | 수치 | 출처 |
|------|------|------|
| AI 에이전트 시장 규모 (2025) | $7.6B | Gartner |
| CAGR | 49.6% | Gartner |
| AI 도구 사용 개발자 비율 | 84% | Stack Overflow 2025 |
| 일/주간 AI 도구 사용자 | 82% | Stack Overflow 2025 |
| Happy Coder GitHub Stars | 13,800 | 출시 직후 수집 |
| Anthropic Remote Control 출시 | 2026-02-24 | Anthropic 공식 |

**핵심 인사이트**: Anthropic이 공식 원격 제어 기능을 출시했다는 것 자체가 이 시장이 실재함을 증명한다. 커뮤니티는 이미 Happy Coder로 갭을 메우고 있었다.

### 오케스트레이션 생태계 현황

| 도구 | 멀티에이전트 | 모바일 | MCP | 주력 |
|-------------|--------------|--------|-----|-------------------------------|
| Claude Code | ✅ 실험적 팀 기능 | ✅ RC (Max 전용) | ✅ | 가장 깊은 네이티브 조율 |
| Gemini CLI | ❌ | ❌ | ✅ | 무료 접근, 1M 컨텍스트 |
| Codex CLI | SDK 기반 | ❌ | ✅ (서버로 노출) | 파이프라인/SDK 오케스트레이션 |
| Aider | ❌ | ❌ | ❌ | 100+ 모델 지원, git-native |
| Cursor | ❌ | ❌ | ✅ | AI-first IDE (18% 점유율) |

**공백**: 현재 시장에서 "Claude + Gemini + Codex를 동등한 파트너로 하나의 워크플로우에서 오케스트레이션 + 모바일 접근"이 가능한 프로덕션 도구는 없다.

---

## 2. 경쟁사 지형도

### 2.1 Happy Coder (slopus/happy) — 가장 직접적인 경쟁자

**GitHub**: github.com/slopus/happy | **Stars**: 13,800 | **라이선스**: MIT

**아키텍처**: CLI wrapper + 릴레이 서버 + Expo 앱 (iOS/Android/Web)

**강점**:
- 진짜 E2E 암호화 (공유 시크릿)
- iOS/Android/Web 지원
- 활발한 커뮤니티 (44 기여자, 1,586 커밋)
- 완전 무료

**약점**:
- QR 코드 페어링 필수 (계정 불필요 → 세션 자동 발견 불가)
- Claude + Codex만 지원 (Gemini 없음)
- 번들된 Claude Code 버전이 업스트림보다 수 주 뒤처짐 (Issue #439)
- 438개 오픈 이슈 — 유지보수 부채 가시적

**Pocket AI 대비**:
```
Happy Coder: 기기 페어링 필요 (QR)
Pocket AI:   GitHub OAuth → 자동 세션 발견

Happy Coder: Claude + Codex만
Pocket AI:   Claude + Gemini + Aider + 커스텀 엔진 (--cmd)
```

---

### 2.2 Anthropic Remote Control — 공식 1st-party 위협

**출시**: 2026-02-24 | **플랜**: Max 전용 ($100–200/월) | **상태**: Research Preview

**작동 방식**: 실행 중인 세션에서 `claude remote-control` → URL/QR 생성 → claude.ai 또는 앱으로 접속

**강점**:
- 공식 지원 (신뢰, 안정성)
- iOS/Android/Browser 동시 접속
- 자동 재연결 (네트워크 끊김/랩탑 슬립)

**치명적 약점 (공식 문서 확인)**:
> **"Terminal must stay open — not a daemon; closing terminal ends the session"**
> **"Session exits after ~10 minutes of network unavailability"**
> **"Max plan only — Pro support not yet live"**

즉:
- 터미널 닫으면 세션 죽음 → Pocket AI 데몬이 해결
- Anthropic 서버를 메시지가 통과 → Pocket AI는 진짜 E2E 암호화
- $100–200/월 벽 → Pocket AI는 API 키로 작동

---

### 2.3 OpenCode (sst/opencode) — 거대한 커뮤니티, 모바일 없음

**GitHub**: github.com/sst/opencode | **Stars**: 112,000 (!!) | **라이선스**: MIT

**특징**:
- 75+ LLM 지원 (OpenAI, Anthropic, Google, AWS, Ollama 등)
- `opencode serve`로 HTTP API 노출
- 커뮤니티 모바일 포탈 존재하지만 VPS + Tailscale 셀프호스팅 필요
- SQLite 세션 영속성

**Pocket AI 전략적 기회**:

```bash
# 이미 지원됨
pocket-ai start --cmd opencode

# OpenCode 112k 커뮤니티 + Pocket AI 원격 접근 = 강력한 조합
```

OpenCode 커뮤니티는 모바일 원격 접근을 원하지만 셀프호스팅 없이는 불가능하다.
Pocket AI가 이 갭을 채울 수 있다.

---

### 2.4 oh-my-claudecode (OMC) — 경쟁자가 아닌 보완재

**GitHub**: github.com/Yeachan-Heo/oh-my-claudecode | **Stars**: 7,700

**포지션**: 로컬 오케스트레이션 플러그인. 모바일/원격 접근 기능 없음.

**관계**: OMC는 경쟁자가 아니다. OMC를 로컬에서 실행하고 Pocket AI로 원격 접근하는 조합이 자연스럽다. 실제로 현재 분석 세션도 이 패턴을 사용 중이다.

---

### 2.5 전체 비교표

| 항목 | Pocket AI | Happy Coder | Anthropic RC | OpenCode | OpenClaw |
|------|-----------|-------------|--------------|----------|----------|
| **Stars** | — | 13.8k | 공식 | 112k | 낮음 |
| **모바일** | PWA | iOS/Android/Web | iOS/Android/Web | 커뮤니티 포탈 | 메시징 앱 |
| **E2E 암호화** | ✅ AES-256-GCM | ✅ 공유시크릿 | ❌ Anthropic 경유 | ❌ | ❌ |
| **데몬** | ✅ | 부분 | ❌ 터미널 필요 | ❌ | ❌ |
| **멀티엔진** | Claude+Gemini+Codex+Aider+커스텀 | Claude+Codex | Claude만 | 75+ | Claude/GPT |
| **인증** | GitHub OAuth | QR 코드 | claude.ai 계정 | API 키 | 없음 |
| **비용** | 무료 | 무료 | Max $100-200/월 | 무료 | 무료 |
| **설치** | npm -g | Homebrew | 내장 | npm -g | npm -g |

---

## 3. Pocket AI 차별화 포인트

### 핵심 3가지 (실제 데이터 기반)

#### 1. 데몬 — 공식 RC의 #1 단점을 해결

```
Anthropic RC:  터미널 닫으면 세션 종료
Happy Coder:   데몬 불완전 (v1.4.0에서 개선 중)
Pocket AI:     데몬으로 터미널 독립적 세션 유지
```

"퇴근하면서 폰으로 장기 작업 모니터링" — 이 유스케이스를 지원하는 건 현재 Pocket AI뿐.

#### 2. 계정 기반 자동 발견 — QR 없이

```
Happy Coder:   QR 스캔 → 기기 페어링 (PC와 폰이 같은 장소에 있어야)
Anthropic RC:  URL/QR 생성 (세션마다 새로 스캔)
Pocket AI:     GitHub OAuth 로그인 → 내 모든 세션 자동 표시
```

#### 3. 진짜 멀티엔진 오케스트레이션

```
Happy Coder:   Claude + Codex (선택 전환)
Anthropic RC:  Claude만
Pocket AI:     Claude가 지휘 + Gemini/Codex CLI/Aider 동적 호출 (MCP)
               + PWA에서 빌트인 worker 토글 (Gemini/Codex/Aider ON/OFF)
               + --cmd 커스텀 엔진 (OpenCode, GPT, 로컬 모델 등)
               + 사용자 정의 커스텀 worker 등록 (PWA UI에서 추가/삭제)
```

---

## 4. 사용자 채택 장벽

Stack Overflow 2025 + METR 연구 + Reddit/GitHub 이슈 분석 결과:

| 순위 | 장벽 | 심각도 | Pocket AI 대응 |
|------|------|--------|----------------|
| 1 | AI 출력이 "거의 맞지만 틀림" — 검증 부담 | 🔴 66% | 미해결 (Claude 품질 의존) |
| 2 | 세션 컨텍스트 손실 | 🔴 높음 | 부분 해결 (이력 복원) |
| 3 | AI 신뢰 하락 (29%만 신뢰) | 🔴 높음 | 미해결 (생태계 문제) |
| 4 | 멀티툴 인증 분산 | 🟠 중상 | **개선 기회** — 단일 진입점 |
| 5 | 예측 불가 토큰 비용 | 🟠 중상 | 사용자 계정 → 투명함 |
| 6 | 워크스테이션 고정 (모바일 불가) | 🟡 중간 | **✅ 핵심 해결 문제** |
| 7 | 보안/데이터 유출 우려 | 🟠 중상 | **✅ E2E 암호화** |
| 8 | 체감 vs 실제 생산성 차이 | 🟡 중간 | 미해결 |

**METR 연구 핵심 발견**: 숙련된 개발자가 AI 도구 사용 시 **19% 더 느렸다**. 단, 이는 단일 모델 사용 기준. 멀티모델 오케스트레이션 효과는 아직 측정되지 않음.

---

## 5. 현재 구현 갭

### Critical — 지금 당장 수정 필요

#### 갭 1: PWA에서 오케스트레이션이 보이지 않음

```
마케팅:   "Claude가 지휘하고 Gemini와 Codex가 실행"
실제:     TerminalChat.tsx에서 ask_gemini = Read 툴과 동일하게 렌더링
```

`apps/pwa/src/components/renderers/` 에 오케스트레이션 전용 카드 필요:
- 작업자 아이콘 (Gemini/Aider)
- 위임된 프롬프트 표시
- 실행 시간 타이머
- 계층 구조 (Claude → Worker → 결과)

#### 갭 2: 사전 검증 없음

```typescript
// 현재: 세션 중간에 터짐
child.on('error', () => reject("gemini 실행 실패: 설치 여부 확인"))

// 필요: 시작 전 확인
$ pocket-ai doctor
  ✅ claude    v1.2.3  인증됨
  ✅ gemini    v2.1.0  인증됨 (Google OAuth)
  ❌ aider             미설치 → pip install aider-chat
```

#### 갭 3: cleanup 취약성

```
SIGINT/SIGTERM → ~/.claude/claude.json 정리됨 ✅
SIGKILL/크래시 → MCP 엔트리 잔류 ❌ → 독점 전략 무력화
```

스타트업 시 스테일 엔트리 감지 + 제거 필요.

### High — Phase 2에서 해결

| 문제 | 위치 | 해결 방법 |
|------|------|-----------|
| 출력 크기 무제한 | orchestrator-server.ts:38,72 | 32KB 상한선 + `[truncated]` 마커 |
| stderr stdout 혼합 | orchestrator-server.ts:39,73 | 분리 처리, stderr는 로그만 |
| 통합 테스트 0개 | packages/cli/ | 최소 5개 테스트 케이스 |
| 동시 실행 불가 | MCP 핸들러 | 병렬 실행 지원 (큰 UX 개선) |

---

## 6. Aider vs Codex 결정

### 현재 상태

```typescript
// orchestrator-server.ts
function callAider(prompt: string) {
    spawn('aider', ['--message', prompt, '--yes-always', '--no-pretty'])
    //     ↑ aider 바이너리 실행
}

// 하지만 툴 이름은
server.tool("ask_codex", description: "Ask Aider (Codex)...")
```

### 문제

사용자가 "Codex"라고 들으면 **OpenAI Codex CLI** (`npm install -g @openai/codex`)를 기대한다.
실제론 **Aider** (`pip install aider-chat`)가 실행된다. 전혀 다른 도구.

### 3가지 옵션

#### Option A: Aider 유지 + 이름 변경 (권장)
```typescript
// ask_codex → ask_aider
tool name: "ask_aider"
description: "Ask Aider to modify code files. Git-native, supports 100+ models."
binary: aider --message ... --yes-always
```
- 정직하고 명확함
- Aider는 git-native이고 멀티모델 지원이 강점

#### Option B: OpenAI Codex CLI 실제 지원
```typescript
// 실제 codex CLI 사용
spawn('codex', ['--quiet', '--approval-mode', 'auto-edit', '-q', prompt])
```
- "Codex"라는 이름이 살아남음
- 설치: `npm install -g @openai/codex`
- GPT-5.2-Codex 모델 사용 (강력)
- API 키 필요 (OPENAI_API_KEY)

#### Option C: 둘 다 지원
```typescript
if (which('codex')) callCodexCLI(prompt)
else if (which('aider')) callAider(prompt)
else throw new Error("codex 또는 aider를 설치하세요")
```
- 유연하지만 복잡도 증가

**결정 및 구현 완료**: **Option C (둘 다 지원)** — `ask_aider` (Aider CLI)와 `ask_codex` (OpenAI Codex CLI)를 독립적인 별도 툴로 구현. 각자의 강점을 Claude가 맥락에 따라 선택한다.

```
ask_aider  → aider --message ... --yes-always --no-auto-commits   # git-native, 100+ 모델
ask_codex  → codex ... --approval-mode auto-edit --quiet           # GPT-5.2-Codex, OPENAI_API_KEY 필요
```

두 도구는 서로 보완적이며, 사용자는 PWA에서 각각 ON/OFF 토글로 제어 가능하다.

---

## 7. 전략 로드맵

### Phase 2 (즉시 — 핵심 경험 개선)

**목표**: "보이는 오케스트레이션" + "안전한 첫 경험"

```
[x] ask_aider + ask_codex 분리 지원 (각각 독립 CLI 바이너리) ✅
[x] PWA 설정 패널: 빌트인 worker (Gemini/Codex/Aider) 토글 UI ✅
[x] PWA 설정 패널: 커스텀 worker 등록/삭제 UI ✅
[x] workers.json 기반 커스텀 worker 영속화 ✅
[ ] pocket-ai doctor 명령어 (worker 사전 검증)
[ ] PWA 오케스트레이션 전용 렌더러 (worker 카드)
[ ] startup 시 스테일 MCP 엔트리 정리
[ ] 출력 32KB 제한
[ ] 통합 테스트 5개
```

**핵심 메시지 (RC 출시로 강화)**:
> "터미널 닫아도 살아있는 세션, 무료로"

### Phase 3 (성장 — 생태계 확장)

```
[ ] OpenCode --cmd 공식 지원 + 가이드 (112k 커뮤니티)
[ ] Push 알림 (Claude 권한 요청 시 폰에 도착)
[ ] 오케스트레이션 대시보드 (어떤 worker가 무슨 작업 중인지 실시간)
[ ] Worker 병렬 실행 (ask_gemini + ask_aider 동시)
[ ] 커스텀 worker 마켓플레이스
```

### Phase 4 (차별화 강화 — 장기)

```
[ ] Worker 결과 승인 플로우 (모바일에서 Aider 변경사항 확인/거부)
[ ] 오케스트레이션 템플릿 ("새 기능 추가" → 자동으로 UI는 Gemini, 코드는 Aider)
[ ] 팀 기능 (여러 기기에서 같은 세션 공유)
[ ] 로컬 모델 지원 (Ollama + --cmd)
```

---

## 참고 소스

### 경쟁사
- Happy Coder: https://github.com/slopus/happy
- Anthropic Remote Control: https://code.claude.com/docs/en/remote-control
- OpenCode: https://github.com/sst/opencode
- oh-my-claudecode: https://github.com/Yeachan-Heo/oh-my-claudecode

### 시장 데이터
- Stack Overflow 2025 Developer Survey: https://survey.stackoverflow.co/2025/ai
- METR AI Productivity Study: https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/
- Greptile State of AI Coding 2025: https://www.greptile.com/state-of-ai-coding-2025
- RedMonk Developer IDE Survey: https://redmonk.com/kholterhoff/2025/12/22/10-things-developers-want-from-their-agentic-ides-in-2025/

### 언론
- Anthropic RC 출시: https://venturebeat.com/orchestration/anthropic-just-released-a-mobile-version-of-claude-code-called-remote
- DevOps.com RC 분석: https://devops.com/claude-code-remote-control-keeps-your-agent-local-and-puts-it-in-your-pocket/
