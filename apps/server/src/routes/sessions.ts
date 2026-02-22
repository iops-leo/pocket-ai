import { FastifyInstance } from 'fastify';
import crypto from 'crypto';

/**
 * In-memory store for active sessions.
 * In production this would be Redis or another stateless store.
 * The Database (PostgreSQL) is NOT used for session states deliberately.
 */
interface ActiveSession {
    sessionId: string;
    publicKey: string; // The CLI's ECDH public key
    status: 'online' | 'offline';
    metadata: any;
    userId: string;
    socketId: string;
    offlineSince?: number; // timestamp when went offline
}

// Global in-memory store
export const activeSessions = new Map<string, ActiveSession>();

// Cleanup offline sessions after 30 minutes
const SESSION_TTL_MS = 30 * 60 * 1000;

setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of activeSessions.entries()) {
        if (session.status === 'offline' && session.offlineSince && (now - session.offlineSince > SESSION_TTL_MS)) {
            activeSessions.delete(sessionId);
        }
    }
}, 60 * 1000); // Check every minute

export async function sessionRoutes(fastify: FastifyInstance) {

    // POST /api/sessions: Used by the CLI (`pocket-ai start`) to register a session
    fastify.post('/', async (request, reply) => {
        // 1. Verify CLI auth token
        const token = request.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return reply.code(401).send({ error: 'Missing token' });
        }

        let decoded: any;
        try {
            decoded = fastify.jwt.verify(token);
        } catch (err) {
            return reply.code(401).send({ error: 'Invalid token' });
        }

        const { publicKey, metadata } = request.body as any;
        if (!publicKey) {
            return reply.code(400).send({ error: 'Missing publicKey' });
        }

        // 2. Generate a unique Session ID
        const sessionId = crypto.randomUUID();

        // 3. Store the session logic (Wait, the actual socket connection handles the online state,
        // but the REST API registers the intent/public key first, OR we can just do this all via Socket.IO 'client-auth' event).
        // Let's allow creating via REST first.
        activeSessions.set(sessionId, {
            sessionId,
            publicKey,
            metadata,
            status: 'offline', // will be 'online' when socket connects
            userId: decoded.sub, // from JWT
            socketId: '',
        });

        return {
            success: true,
            data: { sessionId }
        };
    });

    // GET /api/sessions: Used by the PWA to list active sessions for the user
    fastify.get('/', async (request, reply) => {
        // 1. Verify User auth token
        const token = request.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return reply.code(401).send({ error: 'Missing token' });
        }

        let decoded: any;
        try {
            decoded = fastify.jwt.verify(token);
        } catch (err) {
            return reply.code(401).send({ error: 'Invalid token' });
        }

        const userId = decoded.sub;

        // 2. Filter active sessions belonging to this user
        const userSessions = Array.from(activeSessions.values())
            .filter(s => s.userId === userId && s.status === 'online')
            .map(s => ({
                sessionId: s.sessionId,
                publicKey: s.publicKey,
                metadata: s.metadata,
                status: s.status,
            }));

        return {
            success: true,
            data: userSessions
        };
    });
}
