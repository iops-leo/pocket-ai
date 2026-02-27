import { Server, Socket } from 'socket.io';
import { FastifyInstance } from 'fastify';
import { activeSessions } from './routes/sessions.js';
import { db, EncryptedBody } from './db/db.js';
import { sql } from 'kysely';

// 세션별 메시지 시퀀스 번호 관리 (메모리 캐시)
const sessionSeqMap = new Map<string, number>();

// Socket.IO per-socket rate limiting (update 이벤트 기준)
const socketRateStore = new Map<string, { count: number; resetAt: number }>();
const SOCKET_RATE_WINDOW_MS = 10_000; // 10초
const SOCKET_RATE_MAX_EVENTS = 60;    // 10초에 60 이벤트 (초당 6개)

function isSocketRateLimited(socketId: string): boolean {
    const now = Date.now();
    let record = socketRateStore.get(socketId);
    if (!record || now > record.resetAt) {
        record = { count: 0, resetAt: now + SOCKET_RATE_WINDOW_MS };
        socketRateStore.set(socketId, record);
    }
    record.count++;
    return record.count > SOCKET_RATE_MAX_EVENTS;
}

// 연결 해제된 소켓 항목 정리 (10분마다)
setInterval(() => {
    const now = Date.now();
    for (const [id, record] of socketRateStore.entries()) {
        if (now > record.resetAt) socketRateStore.delete(id);
    }
}, 10 * 60_000);

async function getNextSeq(sessionId: string): Promise<number> {
    // 캐시에 있으면 사용
    if (sessionSeqMap.has(sessionId)) {
        const next = sessionSeqMap.get(sessionId)! + 1;
        sessionSeqMap.set(sessionId, next);
        return next;
    }

    // 캐시에 없으면 DB에서 마지막 seq 조회
    const lastMsg = await db
        .selectFrom('messages')
        .select('seq')
        .where('session_id', '=', sessionId)
        .orderBy('seq', 'desc')
        .limit(1)
        .executeTakeFirst();

    const next = (lastMsg?.seq ?? 0) + 1;
    sessionSeqMap.set(sessionId, next);
    return next;
}

async function saveMessage(sessionId: string, sender: 'cli' | 'pwa', body: EncryptedBody): Promise<void> {
    const seq = await getNextSeq(sessionId);

    await db
        .insertInto('messages')
        .values({
            session_id: sessionId,
            seq,
            sender,
            encrypted_body: JSON.stringify(body) as any,  // JSONB로 저장
        })
        .execute();
}

export function setupSocketIO(io: Server, fastify: FastifyInstance) {

    io.on('connection', (socket: Socket) => {
        fastify.log.info(`New connection: ${socket.id}`);

        // 1. `client-auth`: CLI 인증 및 세션 활성화
        socket.on('client-auth', async (payload: any) => {
            const { sessionId, token, publicKey, metadata } = payload;

            try {
                const decoded: any = fastify.jwt.verify(token);
                if (typeof decoded?.sub !== 'string' || !decoded.sub) {
                    socket.emit('auth-error', { error: 'Invalid token' });
                    return;
                }
                let session = activeSessions.get(sessionId);

                // 메모리에 없으면 DB에서 복원 (서버 재시작 시)
                if (!session) {
                    const row = await db
                        .selectFrom('sessions')
                        .selectAll()
                        .where('id', '=', sessionId)
                        .executeTakeFirst();

                    if (row && row.user_id === decoded.sub) {
                        session = {
                            sessionId: row.id,
                            publicKey: row.public_key,
                            metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
                            status: 'offline',
                            userId: row.user_id,
                            socketId: '',
                            createdAt: row.created_at ? new Date(row.created_at).getTime() : undefined,
                        };
                        activeSessions.set(sessionId, session);
                    } else if (!row) {
                        // DB에도 없으면 삭제된 세션
                        socket.emit('auth-error', { error: 'Session deleted' });
                        return;
                    }
                }

                if (session && session.userId === decoded.sub) {
                    if (typeof publicKey === 'string' && publicKey.trim()) {
                        session.publicKey = publicKey;
                    }
                    if (metadata && typeof metadata === 'object') {
                        session.metadata = {
                            ...(session.metadata ?? {}),
                            ...metadata,
                        };
                    }
                    session.status = 'online';
                    session.socketId = socket.id;
                    socket.join(`session_${sessionId}`);
                    socket.join(`user_${decoded.sub}`); // 사용자별 룸 (본인 세션 이벤트만 수신)
                    socket.emit('auth-success', { sessionId });
                    fastify.log.info(`Session ${sessionId} online via ${socket.id}`);

                    // DB 상태 업데이트
                    const updatePayload: Record<string, any> = {
                        status: 'online',
                        updated_at: new Date(),
                    };
                    if (typeof publicKey === 'string' && publicKey.trim()) {
                        updatePayload.public_key = publicKey;
                    }
                    if (metadata && typeof metadata === 'object') {
                        updatePayload.metadata = JSON.stringify(session.metadata ?? {});
                    }
                    await db
                        .updateTable('sessions')
                        .set(updatePayload)
                        .where('id', '=', sessionId)
                        .execute();

                    // PWA에게 세션 온라인 알림 (해당 사용자만)
                    io.to(`user_${session.userId}`).emit('session-online', { sessionId, metadata: session.metadata });
                } else {
                    socket.emit('auth-error', { error: 'Invalid session or ownership' });
                }
            } catch (err) {
                socket.emit('auth-error', { error: 'Invalid token' });
            }
        });

        // 1.5. `pwa-dashboard-auth`: PWA 대시보드가 실시간 업데이트 수신을 위해 사용자 룸 가입
        socket.on('pwa-dashboard-auth', async (payload: any) => {
            const { token } = payload ?? {};
            try {
                const decoded: any = fastify.jwt.verify(token);
                if (typeof decoded?.sub !== 'string' || !decoded.sub) {
                    socket.emit('dashboard-auth-error', { error: 'Invalid token' });
                    return;
                }
                socket.join(`user_${decoded.sub}`);
                socket.emit('dashboard-auth-success');
                fastify.log.info(`Dashboard socket ${socket.id} joined user_${decoded.sub}`);
            } catch {
                socket.emit('dashboard-auth-error', { error: 'Invalid token' });
            }
        });

        // 2. `session-join`: PWA가 세션 참여
        socket.on('session-join', async (payload: any) => {
            const { sessionId, token } = payload;

            try {
                const decoded: any = fastify.jwt.verify(token);
                if (typeof decoded?.sub !== 'string' || !decoded.sub) {
                    socket.emit('join-error', { error: 'Invalid token' });
                    return;
                }

                let session = activeSessions.get(sessionId);

                // 메모리에 없으면 DB에서 복원 (서버 재시작 직후 PWA 접속 시)
                if (!session) {
                    const row = await db
                        .selectFrom('sessions')
                        .selectAll()
                        .where('id', '=', sessionId)
                        .executeTakeFirst();

                    if (row && row.user_id === decoded.sub) {
                        session = {
                            sessionId: row.id,
                            publicKey: row.public_key,
                            metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
                            status: row.status as 'online' | 'offline',
                            userId: row.user_id,
                            socketId: '',
                            createdAt: row.created_at ? new Date(row.created_at).getTime() : undefined,
                        };
                        activeSessions.set(sessionId, session);
                    }
                }

                if (session && session.userId === decoded.sub && session.status === 'online') {
                    socket.join(`session_${sessionId}`);
                    socket.join(`user_${decoded.sub}`); // 사용자별 룸
                    socket.emit('join-success', { sessionId, publicKey: session.publicKey, metadata: session.metadata });
                    fastify.log.info(`PWA joined session ${sessionId}`);
                } else {
                    socket.emit('join-error', { error: 'Session offline or unauthorized' });
                }
            } catch {
                socket.emit('join-error', { error: 'Invalid token' });
            }
        });

        // 3. `key-exchange`: ECDH 공개키 교환 중계
        socket.on('key-exchange', (payload: any) => {
            const { sessionId } = payload;
            if (!sessionId || !socket.rooms.has(`session_${sessionId}`)) return;
            socket.to(`session_${sessionId}`).emit('key-exchange', payload);
        });

        // 3.5. `session-key`: CLI가 wrap한 session key를 PWA에 중계
        socket.on('session-key', (payload: any) => {
            const { sessionId } = payload;
            if (!sessionId || !socket.rooms.has(`session_${sessionId}`)) return;
            socket.to(`session_${sessionId}`).emit('session-key', payload);
        });

        // 3.6. `slash-commands`: CLI의 슬래시 명령어 목록을 PWA에 중계
        socket.on('slash-commands', (payload: any) => {
            const { sessionId } = payload;
            if (!sessionId || !socket.rooms.has(`session_${sessionId}`)) return;
            socket.to(`session_${sessionId}`).emit('slash-commands', payload);
        });

        // 4. `update`: 암호화 메시지 중계 + DB 저장 (서버는 복호화하지 않음)
        socket.on('update', async (payload: any) => {
            if (isSocketRateLimited(socket.id)) {
                socket.emit('rate-limited', { error: 'Too many events' });
                return;
            }
            const { sessionId, sender, body } = payload;
            if (!sessionId || !body) return;
            if (!socket.rooms.has(`session_${sessionId}`)) return;

            // 메시지 중계 (실시간)
            socket.to(`session_${sessionId}`).emit('update', payload);

            // 암호화된 메시지 DB 저장 (비동기, non-blocking)
            if (body.cipher && body.iv && (sender === 'cli' || sender === 'pwa')) {
                saveMessage(sessionId, sender, body).catch((err) => {
                    // 저장 실패해도 중계는 이미 완료됨
                    console.error('Failed to save message:', err);
                });
            }
        });

        // 5. disconnect: 세션 offline 처리
        socket.on('disconnect', async () => {
            for (const [sessionId, session] of activeSessions.entries()) {
                if (session.socketId === socket.id) {
                    session.status = 'offline';
                    session.socketId = '';
                    session.offlineSince = Date.now();
                    fastify.log.info(`Session ${sessionId} went offline`);
                    io.to(`session_${sessionId}`).emit('session-offline', { sessionId });

                    // DB 상태 업데이트
                    await db
                        .updateTable('sessions')
                        .set({ status: 'offline', updated_at: new Date() })
                        .where('id', '=', sessionId)
                        .execute()
                        .catch(() => { /* disconnect 중 DB 실패는 무시 */ });
                    break;
                }
            }
        });
    });
}
