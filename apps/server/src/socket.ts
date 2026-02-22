import { Server, Socket } from 'socket.io';
import { FastifyInstance } from 'fastify';
import { activeSessions } from './routes/sessions.js';
import { db } from './db/db.js';

export function setupSocketIO(io: Server, fastify: FastifyInstance) {

    io.on('connection', (socket: Socket) => {
        fastify.log.info(`New connection: ${socket.id}`);

        // 1. `client-auth`: CLI 인증 및 세션 활성화
        socket.on('client-auth', async (payload: any) => {
            const { sessionId, token } = payload;

            try {
                const decoded: any = fastify.jwt.verify(token);
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
                        };
                        activeSessions.set(sessionId, session);
                    }
                }

                if (session && session.userId === decoded.sub) {
                    session.status = 'online';
                    session.socketId = socket.id;
                    socket.join(`session_${sessionId}`);
                    socket.emit('auth-success', { sessionId });
                    fastify.log.info(`Session ${sessionId} online via ${socket.id}`);

                    // DB 상태 업데이트
                    await db
                        .updateTable('sessions')
                        .set({ status: 'online', updated_at: new Date() })
                        .where('id', '=', sessionId)
                        .execute();
                } else {
                    socket.emit('auth-error', { error: 'Invalid session or ownership' });
                }
            } catch (err) {
                socket.emit('auth-error', { error: 'Invalid token' });
            }
        });

        // 2. `session-join`: PWA가 세션 참여
        socket.on('session-join', (payload: any) => {
            const { sessionId, token } = payload;

            try {
                const decoded: any = fastify.jwt.verify(token);
                const session = activeSessions.get(sessionId);

                if (session && session.userId === decoded.sub && session.status === 'online') {
                    socket.join(`session_${sessionId}`);
                    socket.emit('join-success', { sessionId, publicKey: session.publicKey });
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

        // 4. `update`: 암호화 메시지 중계 (서버는 복호화하지 않음)
        socket.on('update', (payload: any) => {
            const { sessionId, body } = payload;
            if (!sessionId || !body) return;
            if (!socket.rooms.has(`session_${sessionId}`)) return;
            socket.to(`session_${sessionId}`).emit('update', payload);
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
