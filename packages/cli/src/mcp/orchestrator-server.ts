#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

// Helper to run a command and capture its output
const runModelCli = (engine: 'codex' | 'gemini', prompt: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        // Create a temporary file to hold the prompt to avoid shell escaping issues
        const tmpFile = path.join(os.tmpdir(), `pocket-ai-${engine}-req-${Date.now()}.txt`);
        fs.writeFileSync(tmpFile, prompt, 'utf-8');

        // Note: we assume pocket-ai is globally installed or linkable, but since this runs inside 
        // the pocket-ai context, we'll invoke the underlying CLI directly if possible.
        // For simplicity, we can spawn "pocket-ai" start [engine] --headless and pass it the prompt via stdin.
        // Wait, pocket-ai CLI is exactly what we are building. 
        // A safer way is to just use the raw CLI (aider or gemini) because we want a single-shot query, not a session.
        // However, we can just use our own pocket-ai start --headless and send the text, then wait for exit.

        // Actually, for Codex, we can run `aider --message-file <tmpFile>`.
        // For Gemini, we might need a custom script or just rely on a built-in single-shot mode if it exists.
        // Let's use `pocket-ai start <engine> --headless` as a generic approach?
        // Wait, Pocket-AI daemon expects a websocket connection if we use `start`.
        // To keep it simple and stateless for the MCP tool, let's spawn `aider` or `gemini` directly if available.
        // Better yet, we can spawn `npx aider --message-file <tmpFile>` and `npx gemini ...` (or whatever the gemini CLI is).

        // Let's look at how Pocket AI spawns them in start.ts: 
        // it uses `node-pty` to spawn the binary (e.g., 'codex' or 'gemini').
        const child = spawn(engine, [], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, AIDER_NO_AUTO_COMMITS: '1' }
        });

        let output = '';
        let errorOutput = '';

        child.stdout.on('data', (data) => output += data.toString());
        child.stderr.on('data', (data) => errorOutput += data.toString());

        child.on('error', (err) => {
            reject(new Error(`Failed to start ${engine}: ${err.message}`));
        });

        // For aider/codex, just write the prompt and wait for it to finish.
        // Actually Aider might stay open waiting for more input. We should send /exit after the prompt.
        if (engine === 'codex') {
            child.stdin.write(prompt + '\n/exit\n');
        } else {
            child.stdin.write(prompt + '\n');
            child.stdin.end();
        }

        child.on('close', (code) => {
            try { fs.unlinkSync(tmpFile); } catch { }
            if (code !== 0 && !output.trim()) {
                reject(new Error(`${engine} failed (code ${code}): ${errorOutput}`));
            } else {
                resolve(stripAnsi(output));
            }
        });
    });
};

function stripAnsi(input: string): string {
    return input.replace(/\\x1B\\[[0-?]*[ -/]*[@-~]/g, '');
}

const server = new Server({
    name: "pocket-ai-orchestrator",
    version: "1.0.0"
}, {
    capabilities: {
        tools: {}
    }
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "ask_gemini",
                description: "Ask Google's Gemini model a question or give it a task. Useful for broad knowledge, reasoning, and long-context analysis.",
                inputSchema: {
                    type: "object",
                    properties: {
                        prompt: { type: "string", description: "The prompt or task for Gemini" }
                    },
                    required: ["prompt"]
                }
            },
            {
                name: "ask_codex",
                description: "Ask Codex (Aider) a coding question or instruct it to modify files. Highly specialized in code editing and repository context.",
                inputSchema: {
                    type: "object",
                    properties: {
                        prompt: { type: "string", description: "The coding prompt or instruction for Codex" }
                    },
                    required: ["prompt"]
                }
            }
        ]
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === "ask_gemini" || name === "ask_codex") {
        const engine = name === "ask_gemini" ? "gemini" : "codex";
        const prompt = typeof args?.prompt === 'string' ? args.prompt : '';

        if (!prompt) {
            throw new Error("Missing 'prompt' argument");
        }

        try {
            const result = await runModelCli(engine, prompt);
            return {
                content: [{ type: "text", text: result }],
                isError: false
            };
        } catch (err: any) {
            return {
                content: [{ type: "text", text: `Error calling ${engine}: ${err.message}` }],
                isError: true
            };
        }
    }

    throw new Error(`Unknown tool: ${name}`);
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Pocket AI Orchestrator MCP Server running on stdio");
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
