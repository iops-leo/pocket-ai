import { SessionPool } from './session-pool.js';
import { IPCServer } from './ipc-server.js';
import { initDaemonState, saveDaemonState, clearDaemonState, loadDaemonState } from './state.js';
import { getSessionKey, getSessionDisplayName } from '../session-manager.js';
/**
 * Pocket AI 데몬 (Happy 스타일)
 *
 * 백그라운드에서 여러 AI 세션을 관리
 */
export class Daemon {
    sessionPool;
    ipcServer;
    running = false;
    constructor() {
        this.sessionPool = new SessionPool();
        this.ipcServer = new IPCServer(this.handleIPCMessage.bind(this));
    }
    /**
     * 데몬 시작
     */
    async start() {
        if (this.running) {
            throw new Error('Daemon is already running');
        }
        console.log('[Daemon] Starting Pocket AI daemon...');
        // IPC 서버 시작
        const socketPath = await this.ipcServer.start();
        console.log(`[Daemon] IPC server listening on ${socketPath}`);
        // 상태 초기화
        await initDaemonState(process.pid, socketPath);
        console.log(`[Daemon] State initialized (PID: ${process.pid})`);
        this.running = true;
        // Graceful shutdown
        process.on('SIGINT', () => this.shutdown());
        process.on('SIGTERM', () => this.shutdown());
        // 상태 주기적 저장 (5초마다)
        setInterval(() => this.saveState(), 5000);
        console.log('[Daemon] Ready to manage sessions');
    }
    /**
     * IPC 메시지 핸들러
     */
    async handleIPCMessage(message) {
        try {
            switch (message.type) {
                case 'start-session':
                    return await this.handleStartSession(message.payload);
                case 'stop-session':
                    return await this.handleStopSession(message.payload);
                case 'switch-session':
                    return await this.handleSwitchSession(message.payload);
                case 'list-sessions':
                    return await this.handleListSessions();
                case 'get-status':
                    return await this.handleGetStatus();
                case 'shutdown':
                    await this.shutdown();
                    return { success: true };
                default:
                    return {
                        success: false,
                        error: `Unknown message type: ${message.type}`
                    };
            }
        }
        catch (err) {
            return {
                success: false,
                error: err.message
            };
        }
    }
    /**
     * 세션 시작
     */
    async handleStartSession(payload) {
        const { cwd, engine } = payload;
        // 이미 존재하는 세션인지 확인
        const existing = this.sessionPool.findByKey(cwd, engine);
        if (existing) {
            this.sessionPool.setActive(existing.state.id);
            return {
                success: true,
                data: { sessionId: existing.state.id, resumed: true }
            };
        }
        // TODO: 새 세션 생성 (node-pty + Socket.IO)
        // 현재는 스켈레톤만 구현
        const sessionKey = getSessionKey(cwd, engine);
        const sessionId = `session-${sessionKey.hash}`;
        console.log(`[Daemon] Starting session: ${getSessionDisplayName(sessionKey)}`);
        return {
            success: true,
            data: { sessionId, created: true }
        };
    }
    /**
     * 세션 중지
     */
    async handleStopSession(payload) {
        const { sessionId } = payload;
        const removed = this.sessionPool.remove(sessionId);
        if (removed) {
            console.log(`[Daemon] Stopped session: ${sessionId}`);
            return { success: true };
        }
        else {
            return {
                success: false,
                error: `Session not found: ${sessionId}`
            };
        }
    }
    /**
     * 세션 전환
     */
    async handleSwitchSession(payload) {
        const { sessionId } = payload;
        const success = this.sessionPool.setActive(sessionId);
        if (success) {
            console.log(`[Daemon] Switched to session: ${sessionId}`);
            return { success: true };
        }
        else {
            return {
                success: false,
                error: `Session not found: ${sessionId}`
            };
        }
    }
    /**
     * 세션 목록
     */
    async handleListSessions() {
        const sessions = this.sessionPool.list().map(s => ({
            id: s.state.id,
            cwd: s.key.cwd,
            engine: s.key.engine,
            status: s.state.status,
            active: s.state.id === this.sessionPool.getActive()?.state.id
        }));
        return {
            success: true,
            data: { sessions }
        };
    }
    /**
     * 데몬 상태
     */
    async handleGetStatus() {
        return {
            success: true,
            data: {
                running: this.running,
                pid: process.pid,
                sessionCount: this.sessionPool.count(),
                uptime: process.uptime()
            }
        };
    }
    /**
     * 상태 저장
     */
    async saveState() {
        try {
            const state = await loadDaemonState();
            if (state) {
                state.sessions = this.sessionPool.getAllStates();
                await saveDaemonState(state);
            }
        }
        catch (err) {
            console.error('[Daemon] Failed to save state:', err);
        }
    }
    /**
     * 데몬 종료
     */
    async shutdown() {
        if (!this.running)
            return;
        console.log('[Daemon] Shutting down...');
        this.running = false;
        // 모든 세션 종료
        this.sessionPool.clear();
        // IPC 서버 종료
        await this.ipcServer.stop();
        // 상태 파일 삭제
        await clearDaemonState();
        console.log('[Daemon] Shutdown complete');
        process.exit(0);
    }
}
/**
 * 데몬 프로세스 엔트리포인트
 */
export async function runDaemon() {
    const daemon = new Daemon();
    await daemon.start();
    // Keep alive
    await new Promise(() => { });
}
