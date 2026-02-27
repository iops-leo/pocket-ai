import { spawn } from 'child_process';
import readline from 'readline';

console.log("Starting claude...");
const child = spawn('claude', [
    '--output-format', 'stream-json',
    '--input-format', 'stream-json',
    '--permission-prompt-tool', 'stdio',
    '--verbose'
], { stdio: ['pipe', 'pipe', 'pipe'] });

const rl = readline.createInterface({ input: child.stdout });

rl.on('line', (line) => {
    if (!line.trim()) return;
    try {
        const msg = JSON.parse(line);
        if (msg.type === 'system') {
            console.log("[Claude Init] Session ID:", msg.session_id);
            // Send our prompt
            child.stdin.write(JSON.stringify({
                type: 'user',
                message: { role: 'user', content: 'Use the ask_gemini tool to ask Gemini what its name is.' }
            }) + '\n');
        } else if (msg.type === 'assistant') {
            const content = msg.message?.content;
            if (Array.isArray(content)) {
                for (const block of content) {
                    if (block.type === 'text') {
                        process.stdout.write(block.text);
                    } else if (block.type === 'tool_use') {
                        console.log("\n[Tool Use Request]:", block.name, block.input);
                    }
                }
            }
        } else if (msg.type === 'user') {
            const content = msg.message?.content;
            if (Array.isArray(content)) {
                for (const block of content) {
                    if (block.type === 'tool_result') {
                        console.log("\n[Tool Result]:", block.content);
                        child.stdin.write(JSON.stringify({
                            type: 'control_request',
                            request_id: 'exit',
                            request: { subtype: 'interrupt' }
                        }) + '\n');
                        child.kill();
                        process.exit(0);
                    }
                }
            }
        } else if (msg.type === 'control_request') {
            console.log("\n[Control Request] approving tool use:", msg.request.tool_name);
            child.stdin.write(JSON.stringify({
                type: 'control_response',
                response: {
                    subtype: 'success',
                    request_id: msg.request_id,
                    response: { behavior: 'allow' }
                }
            }) + '\n');
        }
    } catch { }
});

child.stderr.on('data', d => process.stderr.write(d));
