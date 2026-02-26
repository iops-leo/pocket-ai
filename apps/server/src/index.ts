import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { Server } from 'socket.io';
import { setupSocketIO } from './socket.js';
import { authRoutes } from './routes/auth.js';
import { sessionRoutes, loadSessionsFromDB } from './routes/sessions.js';
import oauthPlugin from '@fastify/oauth2';

const fastify = Fastify({
    logger: true
});

// Setup JWT
if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required');
}
fastify.register(jwt, {
    secret: process.env.JWT_SECRET
});

// Simple in-memory rate limiter (REST API)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1분
const RATE_LIMIT_MAX_REQUESTS = 120;  // 분당 120 요청

fastify.addHook('onRequest', async (request, reply) => {
    // /ping 헬스체크는 제외
    if (request.url === '/ping') return;

    const ip = request.ip ?? 'unknown';
    const now = Date.now();

    let record = rateLimitStore.get(ip);
    if (!record || now > record.resetAt) {
        record = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
        rateLimitStore.set(ip, record);
    }

    record.count++;
    if (record.count > RATE_LIMIT_MAX_REQUESTS) {
        reply.code(429).send({ error: 'Too Many Requests' });
        return;
    }
});

// 만료된 항목 정리 (5분마다)
setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of rateLimitStore.entries()) {
        if (now > record.resetAt) rateLimitStore.delete(ip);
    }
}, 5 * 60_000);

// Setup CORS
fastify.register(cors, {
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3002'],
});

if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
    throw new Error('GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables are required');
}

// OAuth CSRF 방어용 state 저장소 (10분 TTL)
const pendingOAuthStates = new Set<string>();

fastify.register(oauthPlugin, {
    name: 'githubOAuth2',
    credentials: {
        client: {
            id: process.env.GITHUB_CLIENT_ID,
            secret: process.env.GITHUB_CLIENT_SECRET
        },
        auth: (oauthPlugin as any).GITHUB_CONFIGURATION
    },
    startRedirectPath: '/auth/github',
    callbackUri: process.env.GITHUB_CALLBACK_URL || 'http://localhost:3001/auth/github/callback',
    scope: ['user:email'],
    // CLI 로그인 지원: cli_port 쿼리 파라미터를 state에 인코딩
    generateStateFunction: (request: any) => {
        const cliPort = request.query?.cli_port;
        const random = Math.random().toString(36).slice(2, 10);
        const state = cliPort ? `${random}_cli_${cliPort}` : random;
        pendingOAuthStates.add(state);
        // 10분 후 자동 만료
        setTimeout(() => pendingOAuthStates.delete(state), 10 * 60 * 1000);
        return state;
    },
    checkStateFunction: (request: any, callback: any) => {
        const state = (request.query as any)?.state as string;
        if (!state || !pendingOAuthStates.has(state)) {
            callback(new Error('Invalid OAuth state'));
            return;
        }
        pendingOAuthStates.delete(state);
        callback();
    },
} as any);

// Setup Socket.IO
const io = new Server(fastify.server, {
    cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3002'],
    },
    // CLI가 무거운 작업 중 ping 응답 지연으로 disconnect 방지
    pingTimeout: 60000,     // 60초 (기본 20초)
    pingInterval: 30000,    // 30초 (기본 25초)
});
setupSocketIO(io, fastify);
(fastify as any).io = io;

// Setup Routes
fastify.register(authRoutes, { prefix: '/auth' });
fastify.register(sessionRoutes, { prefix: '/api/sessions' });

// Health check
fastify.get('/ping', async (request, reply) => {
    return { pong: 'it worked!' };
});

const start = async () => {
    try {
        const port = parseInt(process.env.PORT || '3001', 10);
        await fastify.listen({ port, host: '0.0.0.0' });
        console.log(`Server listening at http://0.0.0.0:${port}`);

        // 서버 시작 후 DB에서 세션 복원
        await loadSessionsFromDB();
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
