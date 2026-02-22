import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { db } from '../db/db.js';

interface ActiveSession {
    sessionId: string;
    publicKey: string;
    status: 'online' | 'offline';
    metadata: any;
    userId: string;
    socketId: string;
    offlineSince?: number;
}

// 인메모리 스토어 (런타임 상태 캐시)
export const activeSessions = new Map<string, ActiveSession>();

// 서버 시작 시 DB에서 세션 복원
export async function loadSessionsFromDB(): Promise<void> {
    try {
        const rows = await db
            .selectFrom('sessions')
            .selectAll()
            .execute();

        for (const row of rows) {
            activeSessions.set(row.id, {
                sessionId: row.id,
                publicKey: row.public_key,
                metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
                status: 'offline', // 재시작 후 모두 offline → CLI 재연결 시 online으로 전환
                userId: row.user_id,
                socketId: '',
            });
        }

        console.log(`DB에서 세션 ${rows.length}개 복원 완료`);
    } catch (err) {
        console.error('세션 복원 실패:', err);
    }
}

// 오래된 offline 세션 정리 (24시간 이상)
const SESSION_CLEANUP_MS = 24 * 60 * 60 * 1000;
setInterval(async () => {
    const cutoff = new Date(Date.now() - SESSION_CLEANUP_MS);
    try {
        const deleted = await db
            .deleteFrom('sessions')
            .where('status', '=', 'offline')
            .where('updated_at', '<', cutoff)
            .executeTakeFirst();
        if (deleted.numDeletedRows > 0n) {
            // 메모리에서도 제거
            for (const [id, s] of activeSessions.entries()) {
                if (s.status === 'offline' && s.offlineSince && (Date.now() - s.offlineSince > SESSION_CLEANUP_MS)) {
                    activeSessions.delete(id);
                }
            }
        }
    } catch { /* 정리 실패는 무시 */ }
}, 60 * 60 * 1000); // 1시간마다

export async function sessionRoutes(fastify: FastifyInstance) {

    // POST /api/sessions: CLI가 세션 등록
    fastify.post('/', async (request, reply) => {
        const token = request.headers.authorization?.replace('Bearer ', '');
        if (!token) return reply.code(401).send({ error: 'Missing token' });

        let decoded: any;
        try {
            decoded = fastify.jwt.verify(token);
        } catch {
            return reply.code(401).send({ error: 'Invalid token' });
        }

        const { publicKey, metadata } = request.body as any;
        if (!publicKey) return reply.code(400).send({ error: 'Missing publicKey' });

        const sessionId = crypto.randomUUID();
        const metadataStr = JSON.stringify(metadata ?? {});

        // DB에 저장
        await db
            .insertInto('sessions')
            .values({
                id: sessionId,
                user_id: decoded.sub,
                public_key: publicKey,
                metadata: metadataStr,
                status: 'offline',
            })
            .execute();

        // 메모리에도 캐시
        activeSessions.set(sessionId, {
            sessionId,
            publicKey,
            metadata: metadata ?? {},
            status: 'offline',
            userId: decoded.sub,
            socketId: '',
        });

        return { success: true, data: { sessionId } };
    });

    // GET /api/sessions: PWA가 온라인 세션 목록 조회
    fastify.get('/', async (request, reply) => {
        const token = request.headers.authorization?.replace('Bearer ', '');
        if (!token) return reply.code(401).send({ error: 'Missing token' });

        let decoded: any;
        try {
            decoded = fastify.jwt.verify(token);
        } catch {
            return reply.code(401).send({ error: 'Invalid token' });
        }

        const userId = decoded.sub;
        const userSessions = Array.from(activeSessions.values())
            .filter(s => s.userId === userId && s.status === 'online')
            .map(s => ({
                sessionId: s.sessionId,
                publicKey: s.publicKey,
                metadata: s.metadata,
                status: s.status,
            }));

        return { success: true, data: userSessions };
    });
}
