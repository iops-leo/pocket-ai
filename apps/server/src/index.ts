import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { Server } from 'socket.io';
import { setupSocketIO } from './socket.js';
import { authRoutes } from './routes/auth.js';
import { sessionRoutes } from './routes/sessions.js';
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

// Setup CORS
fastify.register(cors, {
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3002'],
});

if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
    throw new Error('GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables are required');
}
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
    // CLI 로그인 지원: cli_port 쿼리 파라미터를 state에 인코딩
    generateStateFunction: (request: any) => {
        const cliPort = request.query?.cli_port;
        const random = Math.random().toString(36).slice(2, 10);
        return cliPort ? `${random}_cli_${cliPort}` : random;
    },
    checkStateFunction: (_request: any, callback: any) => {
        callback();
    },
} as any);

// Setup Socket.IO
const io = new Server(fastify.server, {
    cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3002'],
    }
});
setupSocketIO(io, fastify);

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
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
