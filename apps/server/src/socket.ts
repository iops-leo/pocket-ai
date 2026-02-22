import { Server, Socket } from 'socket.io';
import { FastifyInstance } from 'fastify';
import { activeSessions } from './routes/sessions';

export function setupSocketIO(io: Server, fastify: FastifyInstance) {

    io.on('connection', (socket: Socket) => {
        fastify.log.info(`New connection: ${socket.id}`);

        // 1. `client-auth`: CLI connects and authenticates its session
        socket.on('client-auth', (payload: any) => {
            // payload usually contains token and publicKey.
            // For simplicity in this new design, the CLI might have already called POST /api/sessions
            // and got a sessionId, or it just passes its publicKey here and we create the session.
            const { sessionId, token } = payload;

            // Basic token verification
            try {
                const decoded: any = fastify.jwt.verify(token);

                const session = activeSessions.get(sessionId);
                if (session && session.userId === decoded.sub) {
                    session.status = 'online';
                    session.socketId = socket.id;
                    socket.join(`session_${sessionId}`);

                    socket.emit('auth-success', { sessionId });
                    fastify.log.info(`Session ${sessionId} online via ${socket.id}`);
                } else {
                    socket.emit('auth-error', { error: 'Invalid session or ownership' });
                }
            } catch (err) {
                socket.emit('auth-error', { error: 'Invalid token' });
            }
        });

        // 2. `session-join`: PWA connects to a specific session
        socket.on('session-join', (payload: any) => {
            const { sessionId, token } = payload;

            try {
                const decoded: any = fastify.jwt.verify(token);
                const session = activeSessions.get(sessionId);

                if (session && session.userId === decoded.sub && session.status === 'online') {
                    // Join the room to receive broadcasts
                    socket.join(`session_${sessionId}`);
                    socket.emit('join-success', { sessionId, publicKey: session.publicKey });
                    fastify.log.info(`PWA joined session ${sessionId} room`);
                } else {
                    socket.emit('join-error', { error: 'Session offline or unauthorized' });
                }
            } catch (err) {
                socket.emit('join-error', { error: 'Invalid token' });
            }
        });

        // 3. `key-exchange`: ECDH public key exchange (separate from encrypted message relay)
        socket.on('key-exchange', (payload: any) => {
            const { sessionId } = payload;
            if (!sessionId) return;
            if (!socket.rooms.has(`session_${sessionId}`)) return;
            socket.to(`session_${sessionId}`).emit('key-exchange', payload);
        });

        // 4. `update`: Pure relay for encrypted messages between PWA and CLI
        socket.on('update', (payload: any) => {
            // payload is expected to match `EncryptedMessage` from @pocket-ai/wire
            const { sessionId, body } = payload;

            if (!sessionId || !body) return;
            if (!socket.rooms.has(`session_${sessionId}`)) return;

            // We just relay to the entire room.
            // The CLI and PWA filter based on the 'sender' field.
            // Notice we do NOT decrypt the `body`.
            socket.to(`session_${sessionId}`).emit('update', payload);
        });

        socket.on('disconnect', () => {
            // Find if this socket belonged to a CLI session and mark it offline
            for (const [sessionId, session] of activeSessions.entries()) {
                if (session.socketId === socket.id) {
                    session.status = 'offline';
                    session.socketId = '';
                    session.offlineSince = Date.now();
                    fastify.log.info(`Session ${sessionId} went offline`);
                    // Notify PWA clients in the room
                    io.to(`session_${sessionId}`).emit('session-offline', { sessionId });
                    break;
                }
            }
        });
    });
}
