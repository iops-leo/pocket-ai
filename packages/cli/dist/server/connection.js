import { io } from 'socket.io-client';
import { getServerUrl, getToken } from '../config.js';
export function connectToServer(options) {
    const serverUrl = getServerUrl();
    const token = getToken();
    if (!token) {
        throw new Error('Not authenticated. Run `pocket-ai login` first.');
    }
    // 현재 유효한 sessionId (서버 재시작 시 재등록 후 갱신됨)
    let currentSessionId = options.sessionId;
    const socket = io(serverUrl, {
        transports: ['websocket'], // polling 비활성화 → 로그 스팸 제거
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
    });
    const emitClientAuth = () => {
        socket.emit('client-auth', {
            sessionId: currentSessionId,
            token,
            publicKey: options.publicKey,
            metadata: options.metadata,
        });
    };
    socket.on('connect', () => {
        emitClientAuth();
    });
    socket.on('auth-success', options.onAuthSuccess);
    socket.on('auth-error', async (data) => {
        if (data.error === 'Session deleted') {
            // 삭제된 세션 → 재등록하지 않고 종료
            console.log('\n[Pocket AI] 이 세션은 삭제되었습니다. 다시 시작해주세요.');
            socket.disconnect();
            process.exit(0);
        }
        else if (data.error === 'Invalid session or ownership') {
            // 서버 재시작 등으로 세션이 사라진 경우 → 재등록
            try {
                const newSessionId = await registerSession(options.publicKey, options.metadata);
                currentSessionId = newSessionId;
                options.onSessionIdUpdate(newSessionId);
                emitClientAuth();
            }
            catch (err) {
                console.error('[Pocket AI] 세션 재등록 실패:', err.message);
                options.onAuthError(data);
            }
        }
        else {
            options.onAuthError(data);
        }
    });
    socket.on('key-exchange', options.onKeyExchange);
    socket.on('update', options.onUpdate);
    socket.on('session-killed', () => {
        console.log('\n[Pocket AI] 이 세션이 원격으로 삭제되었습니다. 종료합니다.');
        socket.disconnect();
        process.exit(0);
    });
    socket.on('disconnect', options.onDisconnect);
    socket.on('connect_error', (err) => {
        // 서버 다운 시 조용히 재시도 (에러 로그 스팸 방지)
        if (process.env.DEBUG) {
            console.error(`[Pocket AI] 연결 오류: ${err.message}`);
        }
    });
    return socket;
}
export async function registerSession(publicKey, metadata) {
    const serverUrl = getServerUrl();
    const token = getToken();
    if (!token) {
        throw new Error('Not authenticated. Run `pocket-ai login` first.');
    }
    const res = await fetch(`${serverUrl}/api/sessions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ publicKey, metadata }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(`Failed to register session: ${err.error}`);
    }
    const data = await res.json();
    return data.data.sessionId;
}
export async function fetchSessions() {
    const serverUrl = getServerUrl();
    const token = getToken();
    if (!token) {
        throw new Error('Not authenticated. Run `pocket-ai login` first.');
    }
    const res = await fetch(`${serverUrl}/api/sessions`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });
    if (!res.ok) {
        throw new Error('Failed to fetch sessions');
    }
    const data = await res.json();
    return data.data || [];
}
