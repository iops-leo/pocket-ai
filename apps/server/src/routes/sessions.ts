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

    // GET /api/sessions: PWA/CLI가 사용자 세션 목록 조회 (online/offline 모두)
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
            .filter(s => s.userId === userId)
            .sort((a, b) => {
                if (a.status !== b.status) {
                    return a.status === 'online' ? -1 : 1; // online 우선
                }
                return b.sessionId.localeCompare(a.sessionId);
            })
            .map(s => ({
                sessionId: s.sessionId,
                publicKey: s.publicKey,
                metadata: s.metadata,
                status: s.status,
            }));

        return { success: true, data: userSessions };
    });

    // GET /api/sessions/recent-paths: 사용자의 최근 작업 경로 조회
    fastify.get<{
        Querystring: { limit?: string };
    }>('/recent-paths', async (request, reply) => {
        const token = request.headers.authorization?.replace('Bearer ', '');
        if (!token) return reply.code(401).send({ error: 'Missing token' });

        let decoded: any;
        try {
            decoded = fastify.jwt.verify(token);
        } catch {
            return reply.code(401).send({ error: 'Invalid token' });
        }

        const userId = decoded.sub;
        const limit = Math.min(Math.max(parseInt(request.query.limit || '8', 10), 1), 20);

        const rows = await db
            .selectFrom('sessions')
            .select(['metadata', 'created_at'])
            .where('user_id', '=', userId)
            .orderBy('created_at', 'desc')
            .execute();

        const recentPaths: string[] = [];
        const seen = new Set<string>();

        for (const row of rows) {
            let parsedMetadata: any = row.metadata;
            if (typeof row.metadata === 'string') {
                try {
                    parsedMetadata = JSON.parse(row.metadata);
                } catch {
                    parsedMetadata = {};
                }
            }
            const cwd = typeof parsedMetadata?.cwd === 'string'
                ? parsedMetadata.cwd.trim()
                : '';

            if (!cwd || seen.has(cwd)) continue;

            seen.add(cwd);
            recentPaths.push(cwd);

            if (recentPaths.length >= limit) break;
        }

        return { success: true, data: recentPaths };
    });

    // GET /api/sessions/:id/messages: 세션 메시지 이력 조회 (암호화된 상태)
    fastify.get<{
        Params: { id: string };
        Querystring: { limit?: string; before?: string };
    }>('/:id/messages', async (request, reply) => {
        const token = request.headers.authorization?.replace('Bearer ', '');
        if (!token) return reply.code(401).send({ error: 'Missing token' });

        let decoded: any;
        try {
            decoded = fastify.jwt.verify(token);
        } catch {
            return reply.code(401).send({ error: 'Invalid token' });
        }

        const sessionId = request.params.id;
        const limit = Math.min(parseInt(request.query.limit || '100'), 200);
        const beforeSeq = request.query.before ? parseInt(request.query.before) : undefined;

        // 세션 소유권 확인
        const session = activeSessions.get(sessionId);
        if (!session || session.userId !== decoded.sub) {
            // 메모리에 없으면 DB 확인
            const dbSession = await db
                .selectFrom('sessions')
                .select(['user_id'])
                .where('id', '=', sessionId)
                .executeTakeFirst();

            if (!dbSession || dbSession.user_id !== decoded.sub) {
                return reply.code(403).send({ error: 'Session not found or unauthorized' });
            }
        }

        // 메시지 조회 (최신순 → seq 역순)
        let query = db
            .selectFrom('messages')
            .selectAll()
            .where('session_id', '=', sessionId)
            .orderBy('seq', 'desc')
            .limit(limit + 1); // hasMore 판별용 +1

        if (beforeSeq !== undefined) {
            query = query.where('seq', '<', beforeSeq);
        }

        const rows = await query.execute();

        const hasMore = rows.length > limit;
        const messages = rows.slice(0, limit).reverse().map(row => ({
            id: row.id,
            sessionId: row.session_id,
            seq: row.seq,
            sender: row.sender,
            encryptedBody: typeof row.encrypted_body === 'string'
                ? JSON.parse(row.encrypted_body)
                : row.encrypted_body,
            createdAt: row.created_at.toISOString(),
        }));

        return {
            success: true,
            data: {
                messages,
                hasMore,
                nextCursor: hasMore ? rows[limit].seq : undefined,
            },
        };
    });
}
