# Multi-Model Orchestration in Pocket AI

Pocket AI 지원하는 "멀티 모델 오케스트레이션(Multi-Model Orchestration)" 기능은 메인 추론 엔진인 **Claude**가 특정 작업(예: 디자인 분석, 코드 적용 등)을 수행할 때 스스로 판단하여 다른 서브 엔진(**Gemini**, **Codex**) 등에게 작업을 위임(Delegate)할 수 있도록 하는 기능입니다.

## Architecture 

이 기능은 **Anthropic의 Model Context Protocol (MCP)** 기술을 기반으로 작동합니다. Pocket AI는 CLI 구동 시 백그라운드에서 동작하는 가상의 로컬 MCP 서버(`orchestrator-server.ts`)를 내장하고 있습니다.

### 핵심 개념

1. **메인 지휘자 (Claude)**:
   - 사용자와 대화하며 목표를 이해하고 계획을 수립합니다.
   - `pocket-ai start claude` 모드로 실행되며, `ClaudeStreamBridge`를 통해 구조화된 JSON 형태로 CLI 데몬과 통신합니다.
2. **로컬 오케스트레이터 (MCP Server)**:
   - `packages/cli/src/mcp/orchestrator-server.ts` 스크립트로 구성된 Node.js 기반 MCP 서버입니다.
   - Claude가 접근할 수 있는 `tools` (예: `ask_gemini`, `ask_codex`)를 제공합니다.
3. **서브 워커 (Gemini / Codex CLI)**:
   - 사용자의 로컬 환경에 미리 설치된 전용 CLI 도구(`gemini`, `aider` 등)를 자식 프로세스(Sub-process) 단위로 띄워 명령을 실행하고 그 텍스트 결과를 Claude에게 문자열로 반환하는 단일-샷(Single-shot) 워커입니다.
   - Claude가 필요한 순간에만 잠시 실행되고 종료되는 가벼운 Headless 모드로 동작합니다.

### 동작 플로우

```mermaid
sequenceDiagram
    participant User as User (PWA)
    participant Daemon as Pocket AI Daemon
    participant Claude as Claude Code CLI
    participant MCP as Orchestrator MCP
    participant Worker as Gemini / Codex CLI

    User->>Daemon: "이 컴포넌트 디자인 제미나이한테 물어보고 수정해줘"
    Daemon->>Claude: JSON Stream (Prompt)
    Claude->>Claude: 계획 수립 (Tool 필요성 인식)
    Claude->>MCP: JSON-RPC: Call Tool `ask_gemini`
    MCP->>Worker: spawn `gemini` (stdin: "...")
    Worker-->>MCP: stdout (디자인 피드백 결과)
    MCP-->>Claude: JSON-RPC (Result Text)
    Claude->>Claude: 피드백 반영 및 코드 생성
    Claude-->>Daemon: JSON Stream (Assistant Message)
    Daemon-->>User: 결과 출력
```

## 구현 세부사항

### 1. `orchestrator-server.ts`
- **위치**: `packages/cli/src/mcp/orchestrator-server.ts`
- `@modelcontextprotocol/sdk`를 사용하여 Stdio 방식으로 통신하는 MCP 서버입니다.
- **제공 도구 (Tools)**:
  - `ask_gemini`: 사용자의 프롬프트를 받아 `gemini` CLI를 백그라운드로 스폰(spawn)하여 실행합니다. 긴 컨텍스트 분석 및 일반적인 추론뿐만 아니라 **UI 디자인, 프론트엔드 컴포넌트(React/Web) 생성, 시각적 창의성(UX)** 작업에 고도로 특화되어 있습니다.
    - **설정된 설명 (Description)**: `"Ask Google's Gemini model a question or give it a task. Useful for broad knowledge, reasoning, long-context analysis, and highly specialized in generating UI designs, front-end components (React/Web), and creative visual tasks."`
  - `ask_codex`: `codex` (Aider) CLI를 스폰하여 실행합니다. 코드 베이스를 직접 수정하거나 파일 상태를 점검하는 데 특화되어 터미널 백엔드 및 레포지토리 컨텍스트 관리에 최적화되어 있습니다.
    - **설정된 설명 (Description)**: `"Ask Codex (Aider) a coding question or instruct it to modify files. Highly specialized in code editing and repository context."`
  
> **💡 설정 및 접근 제어 (Subscriptions)**: 
> Pocket AI는 환경 변수(`POCKET_AI_ENABLE_GEMINI`, `POCKET_AI_ENABLE_CODEX`)를 통해 사용자가 실제로 구독/설치한 도구만 Claude에게 노출시킵니다.
> 만약 특정 도구를 구독하지 않거나 CLI 연동이 안 된 상태라면, 해당 도구는 호출 목록에서 제외되거나 에러를 반환하여 메인 모델이 상황을 인지하고 사용자에게 안내하도록 완벽히 통제됩니다.

### 2. 서브 워커(Sub-worker) 동작 원리와 호출 방식
각 모델은 단순한 API 호출이 아니라, **사용자의 로컬 머신에 설치된 CLI 생태계에 편승(Piggyback)**하여 동작합니다. 즉, 사용자가 사전에 터미널에서 `npm install -g @google/gemini-cli` 또는 `pip install aider-chat` 등으로 CLI를 세팅하고 인증해둔 상태를 활용합니다.

호출 방식은 크게 두 가지로 나뉩니다:
1. **명시적 호출 (Explicit Invocation)**: 사용자가 *"디자인 피드백은 제미나이한테 받아줘"* 라고 직간접적으로 지정할 경우.
2. **자율적 호출 (Autonomous Invocation)**: 사용자가 지정하지 않더라도, Claude가 작업의 복잡도(예: "이건 긴 문서 분석이니 내가 하기보다 Gemini에게 넘기는 게 낫겠다")를 스스로 판단하여 도구를 활용하는 경우.

### 2. 데몬 통합 (`start.ts`)
- `pocket-ai start claude` 명령어 실행 시 `start.ts` 내에서 다음 과정이 자동으로 진행됩니다.
  1. **MCP 프로세스 스폰**: 분리된(detached) 백그라운드 프로세스로 `orchestrator-server.js` 를 실행합니다.
  2. **Claude 설정 등록**: `~/.claude/claude.json` 안의 `mcpServers` 속성을 파싱하여, `pocket-ai-orchestrator`라는 이름으로 MCP 서버 실행 명령 및 인자(args)를 자동 주입합니다.
  3. **Claude 실행**: 설정이 완료된 후 `ClaudeStreamBridge`가 가동되면서, Claude는 즉시 로컬 MCP 툴을 사용할 수 있는 상태로 실행됩니다.

## 실행 예시 (Usage)

Pocket AI 채팅 화면에서 다음과 같이 자연스럽게 Claude에게 요청할 수 있습니다:

> **사용자**: "현재 파일 구조를 분석해서 아키텍처 문서를 작성해줘. 그리고 추가적인 백엔드 코드 생성은 코덱스(ask_codex)에게 지시해서 완료해."

> **사용자**: "내가 디자인한 UI 초안에 대해서 제미나이(ask_gemini)에게 UX 피드백을 받아본 뒤에 코드를 수정해줘."

Claude 모델은 지시받은 내용에 따라 내부적으로 등록된 MCP 서버를 호출하게 되고, 해당 호출 로그 역시 PWA 터미널이나 서버 콘솔에서 확인할 수 있습니다.

## 기존 타 오픈소스와의 비교 (vs `oh-my-claudecode`)

`oh-my-claudecode` 프로젝트 역시 Claude의 다중 에이전트(Multi-Agent) 시스템 구현체로 널리 알려져 있으나, 본 프로젝트의 접근 방식은 다음과 같은 명확한 차별점이 있습니다:

1. **PWA(웹 기반 UI)와의 완벽한 융합**: 
   단순한 터미널 사용 경험에 갇히지 않고, 사용자가 모바일/웹(태블릿 등)에서 PWA를 통해 조작하면 뒷단의 데몬 서버가 백그라운드에서 오케스트레이션을 대신 수행해 줍니다.
2. **경량화 및 커스텀 유연성**:
   사전에 정의된 무겁고 강제된 팀(Team) 파이프라인 대신, 단순한 도구(Tool) 기반의 위임 방식을 채택하여 새로운 도구 추가나 로직 변경에 극도로 유연합니다.
3. **네이티브 MCP 표준 준수**:
   Anthropic의 모델 컨텍스트 프로토콜을 그대로 따르므로 매우 안정적입니다.
   *(단, 사용자의 환경에 이미 `oh-my-claudecode` 기반 MCP가 글로벌(또는 Claude 설정)로 세팅되어 있다면, `claude` 명령어 실행 시 해당 도구들도 함께 노출되므로 충돌 없이 둘 다 사용할 수도 있습니다.)*

## 안전성 및 계정 정지(Block) 완전 방지 설계

기존의 일부 완전 자동화(Auto-pilot) 도구들(예: OpenHands 체제)은 에이전트가 코드를 짜고 무한 에러 루프에 빠져 단시간에 API를 수천 번 호출하다가 **API 제공자의 계정 정지(Account Block) 제재**를 당하는 경우가 종종 발생했습니다.

하지만 Pocket AI의 오케스트레이션은 이 문제로부터 완벽히 안전합니다:
1. **Single-Shot 원칙**: Gemini나 Codex 워커는 스스로 무한 루프를 돌 수 없습니다. 통제권을 가진 Claude가 필요할 때만 딱 1개의 질문을 API 규격(MCP)에 맞게 백그라운드 터미널로 던지고 텍스트 결과만 읽어오는 단발성(Single-shot) 실행에 국한됩니다.
2. **완전한 인간/메인 모델 개입**: 모든 워커 실행은 Claude의 계획 하에 이뤄지거나, 사용자와의 대화 턴(Turn) 안에서만 발생합니다. 보이지 않는 곳에서 혼자 수만 번 재시도하며 API 토큰을 낭비하는 일은 원천 차단됩니다.
3. **표준 프로토콜 사용**: 공식 Anthropic MCP 스펙을 해킹/편법 없이 100% 준수합니다.

## 제한 사항 및 고려점
- **API 사용량**: 메인 모델인 Claude와 병렬로 스폰된 서브 모델(Gemini, GPT-4o 등)의 API 요청이 동시에 발생하므로 할당량과 비용(Token) 관리에 유의해야 합니다.
- **성능 및 지연(Latency)**: CLI 스폰에 의존하므로, 워커 프로세스가 기동되고 응답을 뱉을 때까지 메인 모델이 대기(Blocking)해야 하므로 처리 시간이 늘어날 수 있습니다. 사용하지 않는 데몬은 안정적으로 정리되도록 시그널 처리가 되어있습니다.
