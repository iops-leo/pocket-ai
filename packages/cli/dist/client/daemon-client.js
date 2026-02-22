import net from 'net';
import { loadDaemonState, isDaemonRunning } from '../daemon/state.js';
/**
 * 데몬 클라이언트
 *
 * CLI에서 데몬과 통신
 */
export class DaemonClient {
    socketPath = null;
    /**
     * 데몬이 실행 중인지 확인하고 소켓 경로 로드
     */
    async ensureConnected() {
        if (!(await isDaemonRunning())) {
            return false;
        }
        const state = await loadDaemonState();
        if (!state) {
            return false;
        }
        this.socketPath = state.ipcSocketPath;
        return true;
    }
    /**
     * IPC 메시지 전송
     */
    async send(message) {
        if (!this.socketPath) {
            throw new Error('Daemon is not running');
        }
        return new Promise((resolve, reject) => {
            const socket = net.connect(this.socketPath);
            let buffer = '';
            socket.on('connect', () => {
                socket.write(JSON.stringify(message) + '\n');
            });
            socket.on('data', (chunk) => {
                buffer += chunk.toString();
                // 개행 문자로 응답 구분
                if (buffer.includes('\n')) {
                    try {
                        const response = JSON.parse(buffer.trim());
                        socket.end();
                        resolve(response);
                    }
                    catch (err) {
                        socket.end();
                        reject(new Error('Invalid response from daemon'));
                    }
                }
            });
            socket.on('error', (err) => {
                reject(err);
            });
            socket.on('timeout', () => {
                socket.end();
                reject(new Error('Connection timeout'));
            });
            socket.setTimeout(5000); // 5초 타임아웃
        });
    }
    /**
     * 세션 시작 요청
     */
    async startSession(cwd, engine) {
        const response = await this.send({
            type: 'start-session',
            payload: { cwd, engine }
        });
        if (!response.success) {
            throw new Error(response.error || 'Failed to start session');
        }
        return response.data;
    }
    /**
     * 세션 중지 요청
     */
    async stopSession(sessionId) {
        const response = await this.send({
            type: 'stop-session',
            payload: { sessionId }
        });
        if (!response.success) {
            throw new Error(response.error || 'Failed to stop session');
        }
    }
    /**
     * 세션 전환 요청
     */
    async switchSession(sessionId) {
        const response = await this.send({
            type: 'switch-session',
            payload: { sessionId }
        });
        if (!response.success) {
            throw new Error(response.error || 'Failed to switch session');
        }
    }
    /**
     * 세션 목록 조회
     */
    async listSessions() {
        const response = await this.send({
            type: 'list-sessions'
        });
        if (!response.success) {
            throw new Error(response.error || 'Failed to list sessions');
        }
        return response.data.sessions;
    }
    /**
     * 데몬 상태 조회
     */
    async getStatus() {
        const response = await this.send({
            type: 'get-status'
        });
        if (!response.success) {
            throw new Error(response.error || 'Failed to get status');
        }
        return response.data;
    }
    /**
     * 데몬 종료 요청
     */
    async shutdown() {
        const response = await this.send({
            type: 'shutdown'
        });
        if (!response.success) {
            throw new Error(response.error || 'Failed to shutdown daemon');
        }
    }
}
