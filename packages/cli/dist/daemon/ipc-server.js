import net from 'net';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
export class IPCServer {
    server = null;
    socketPath;
    handler;
    constructor(handler) {
        const sockDir = path.join(os.homedir(), '.pocket-ai');
        this.socketPath = path.join(sockDir, 'daemon.sock');
        this.handler = handler;
    }
    /**
     * IPC 서버 시작
     */
    async start() {
        // 기존 소켓 파일 삭제
        try {
            await fs.unlink(this.socketPath);
        }
        catch { }
        // 디렉토리 생성
        await fs.mkdir(path.dirname(this.socketPath), { recursive: true });
        return new Promise((resolve, reject) => {
            this.server = net.createServer((socket) => {
                this.handleConnection(socket);
            });
            this.server.on('error', (err) => {
                reject(err);
            });
            this.server.listen(this.socketPath, () => {
                resolve(this.socketPath);
            });
        });
    }
    /**
     * 클라이언트 연결 처리
     */
    handleConnection(socket) {
        let buffer = '';
        socket.on('data', async (chunk) => {
            buffer += chunk.toString();
            // 개행 문자로 메시지 구분
            const messages = buffer.split('\n');
            buffer = messages.pop() || '';
            for (const msgStr of messages) {
                if (!msgStr.trim())
                    continue;
                try {
                    const message = JSON.parse(msgStr);
                    const response = await this.handler(message);
                    socket.write(JSON.stringify(response) + '\n');
                }
                catch (err) {
                    const errorResponse = {
                        success: false,
                        error: err.message
                    };
                    socket.write(JSON.stringify(errorResponse) + '\n');
                }
            }
        });
        socket.on('error', (err) => {
            console.error('[IPC Server] Socket error:', err);
        });
    }
    /**
     * IPC 서버 중지
     */
    async stop() {
        return new Promise((resolve) => {
            if (!this.server) {
                resolve();
                return;
            }
            this.server.close(() => {
                this.server = null;
                // 소켓 파일 삭제
                fs.unlink(this.socketPath).catch(() => { });
                resolve();
            });
        });
    }
    getSocketPath() {
        return this.socketPath;
    }
}
