#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
// 세션 cwd: start.ts가 MCP 등록 시 env로 주입
const SESSION_CWD = process.env.POCKET_AI_CWD || process.cwd();
// 커스텀 worker 설정 파일 경로
const WORKERS_FILE = path.join(os.homedir(), '.config', 'pocket-ai', 'workers.json');
function loadCustomWorkers() {
    try {
        if (!fs.existsSync(WORKERS_FILE))
            return [];
        const parsed = JSON.parse(fs.readFileSync(WORKERS_FILE, 'utf-8'));
        if (!Array.isArray(parsed))
            return [];
        return parsed.filter((w) => typeof w.name === 'string' && w.name &&
            typeof w.binary === 'string' && w.binary &&
            typeof w.description === 'string' && w.description);
    }
    catch {
        return [];
    }
}
// ── 유틸 ─────────────────────────────────────────────────────
function stripAnsi(input) {
    // 버그 수정: \\x1B → \x1B (실제 이스케이프 문자 매칭)
    return input.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}
function withTimeout(promise, ms, label) {
    const timer = new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms));
    return Promise.race([promise, timer]);
}
// ── Gemini: -p/--prompt 헤드리스 모드 (기존 OAuth 인증 재사용) ──
function callGemini(prompt) {
    return new Promise((resolve, reject) => {
        // gemini -p "..." : non-interactive(headless) 모드, 로컬 OAuth 인증 재사용
        const child = spawn('gemini', ['-p', prompt, '--yolo'], {
            cwd: SESSION_CWD,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env },
        });
        let output = '';
        child.stdout.on('data', (d) => output += d.toString());
        child.stderr.on('data', (d) => output += d.toString());
        child.on('error', (err) => reject(new Error(`gemini 실행 실패: ${err.message}. 설치 여부 확인: npm install -g @google/gemini-cli`)));
        child.on('close', (code) => {
            const cleaned = stripAnsi(output).trim();
            if (code !== 0 && !cleaned) {
                reject(new Error(`gemini 비정상 종료 (code ${code}): ${output.slice(0, 200)}`));
            }
            else {
                resolve(cleaned);
            }
        });
    });
}
// ── Aider: 멀티모델 코드 편집 (100+ 모델 지원, git-native) ──
function callAider(prompt) {
    return new Promise((resolve, reject) => {
        const child = spawn('aider', [
            '--message', prompt,
            '--yes-always', // 확인 프롬프트 자동 승인
            '--no-auto-commits', // Git 자동 커밋 방지
            '--no-pretty', // ANSI 색상/포맷 비활성화
        ], {
            cwd: SESSION_CWD,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env },
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => stdout += d.toString());
        child.stderr.on('data', (d) => stderr += d.toString());
        child.on('error', (err) => reject(new Error(`aider 실행 실패: ${err.message}. 설치 여부 확인: pip install aider-chat`)));
        child.on('close', (code) => {
            const result = stripAnsi(stdout).trim();
            if (code !== 0 && !result) {
                reject(new Error(`aider가 비정상 종료되었습니다 (code ${code}): ${stderr.slice(0, 200)}`));
            }
            else {
                resolve(result || stripAnsi(stderr).trim());
            }
        });
        child.stdin.end();
    });
}
// ── 커스텀 Worker: 사용자 정의 CLI 에이전트 ────────────────────
function callCustomWorker(binary, prompt) {
    return new Promise((resolve, reject) => {
        const parts = binary.trim().split(/\s+/);
        const cmd = parts[0];
        const extraArgs = parts.slice(1);
        const child = spawn(cmd, [...extraArgs, prompt], {
            cwd: SESSION_CWD,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env },
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => stdout += d.toString());
        child.stderr.on('data', (d) => stderr += d.toString());
        child.on('error', (err) => reject(new Error(`${binary} 실행 실패: ${err.message}`)));
        child.on('close', (code) => {
            const result = stripAnsi(stdout).trim();
            if (code !== 0 && !result) {
                reject(new Error(`${binary} 비정상 종료 (code ${code}): ${stderr.slice(0, 200)}`));
            }
            else {
                resolve(result || stripAnsi(stderr).trim());
            }
        });
    });
}
// ── OpenAI Codex CLI: GPT 기반 코드 편집 ─────────────────────
function callCodex(prompt) {
    return new Promise((resolve, reject) => {
        // codex exec <prompt> : 비대화형 실행 모드 (Rust 기반 새 Codex CLI)
        const child = spawn('codex', [
            'exec', prompt,
        ], {
            cwd: SESSION_CWD,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env },
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => stdout += d.toString());
        child.stderr.on('data', (d) => stderr += d.toString());
        child.on('error', (err) => reject(new Error(`codex 실행 실패: ${err.message}. 설치 여부 확인: npm install -g @openai/codex`)));
        child.on('close', (code) => {
            const result = stripAnsi(stdout).trim();
            if (code !== 0 && !result) {
                reject(new Error(`codex가 비정상 종료되었습니다 (code ${code}): ${stderr.slice(0, 200)}`));
            }
            else {
                resolve(result || stripAnsi(stderr).trim());
            }
        });
    });
}
// ── MCP 서버 정의 ─────────────────────────────────────────────
const server = new Server({
    name: "pocket-ai-orchestrator",
    version: "1.0.0"
}, {
    capabilities: { tools: {} }
});
server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = [];
    if (process.env.POCKET_AI_ENABLE_GEMINI !== 'false') {
        tools.push({
            name: "ask_gemini",
            description: "Ask Google's Gemini model a question or give it a task. Useful for broad knowledge, reasoning, long-context analysis, and highly specialized in generating UI designs, front-end components (React/Web), and creative visual tasks.",
            inputSchema: {
                type: "object",
                properties: {
                    prompt: { type: "string", description: "The prompt or task for Gemini" }
                },
                required: ["prompt"]
            }
        });
    }
    if (process.env.POCKET_AI_ENABLE_AIDER !== 'false') {
        tools.push({
            name: "ask_aider",
            description: "Ask Aider to edit code files in the current project. Aider is git-native and supports 100+ models (Claude, GPT, Gemini, Ollama). Best for multi-file refactoring, incremental edits, and tasks that benefit from git diff visibility.",
            inputSchema: {
                type: "object",
                properties: {
                    prompt: { type: "string", description: "The coding instruction for Aider" }
                },
                required: ["prompt"]
            }
        });
    }
    if (process.env.POCKET_AI_ENABLE_CODEX !== 'false') {
        tools.push({
            name: "ask_codex",
            description: "Ask OpenAI Codex CLI to edit code files. Powered by GPT-5.2-Codex. Best for complex refactors, migrations, and tasks that benefit from GPT's code generation strengths. Requires OPENAI_API_KEY.",
            inputSchema: {
                type: "object",
                properties: {
                    prompt: { type: "string", description: "The coding instruction for Codex" }
                },
                required: ["prompt"]
            }
        });
    }
    // 커스텀 worker 동적 등록 (workers.json 실시간 반영)
    for (const worker of loadCustomWorkers()) {
        tools.push({
            name: `ask_${worker.name}`,
            description: worker.description,
            inputSchema: {
                type: "object",
                properties: {
                    prompt: { type: "string", description: `The instruction for ${worker.name}` }
                },
                required: ["prompt"]
            }
        });
    }
    return { tools };
});
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const prompt = typeof args?.prompt === 'string' ? args.prompt : '';
    if (!prompt)
        throw new Error("Missing 'prompt' argument");
    if (name === "ask_gemini") {
        if (process.env.POCKET_AI_ENABLE_GEMINI === 'false') {
            return {
                content: [{ type: "text", text: "Error: Gemini orchestration is disabled in Pocket AI settings." }],
                isError: true
            };
        }
        try {
            const result = await withTimeout(callGemini(prompt), 60_000, 'Gemini');
            return { content: [{ type: "text", text: result }], isError: false };
        }
        catch (err) {
            return { content: [{ type: "text", text: `Gemini 오류: ${err.message}` }], isError: true };
        }
    }
    if (name === "ask_aider") {
        if (process.env.POCKET_AI_ENABLE_AIDER === 'false') {
            return {
                content: [{ type: "text", text: "Error: Aider orchestration is disabled in Pocket AI settings." }],
                isError: true
            };
        }
        try {
            const result = await withTimeout(callAider(prompt), 120_000, 'Aider');
            return { content: [{ type: "text", text: result }], isError: false };
        }
        catch (err) {
            return { content: [{ type: "text", text: `Aider 오류: ${err.message}` }], isError: true };
        }
    }
    if (name === "ask_codex") {
        if (process.env.POCKET_AI_ENABLE_CODEX === 'false') {
            return {
                content: [{ type: "text", text: "Error: Codex orchestration is disabled in Pocket AI settings." }],
                isError: true
            };
        }
        try {
            const result = await withTimeout(callCodex(prompt), 120_000, 'Codex');
            return { content: [{ type: "text", text: result }], isError: false };
        }
        catch (err) {
            return { content: [{ type: "text", text: `Codex 오류: ${err.message}` }], isError: true };
        }
    }
    // 커스텀 worker 처리
    const customWorkers = loadCustomWorkers();
    const customWorker = customWorkers.find(w => `ask_${w.name}` === name);
    if (customWorker) {
        try {
            const result = await withTimeout(callCustomWorker(customWorker.binary, prompt), 120_000, customWorker.name);
            return { content: [{ type: "text", text: result }], isError: false };
        }
        catch (err) {
            return { content: [{ type: "text", text: `${customWorker.name} 오류: ${err.message}` }], isError: true };
        }
    }
    throw new Error(`Unknown tool: ${name}`);
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`[Pocket AI Orchestrator] MCP 서버 시작됨 (cwd: ${SESSION_CWD})`);
}
main().catch(err => {
    console.error(err);
    process.exit(1);
});
