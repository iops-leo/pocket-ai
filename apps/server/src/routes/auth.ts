import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { db } from '../db/db.js';

declare module 'fastify' {
    interface FastifyInstance {
        githubOAuth2: import('@fastify/oauth2').OAuth2Namespace;
    }
}

function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}

async function generateRefreshToken(userId: string): Promise<string> {
    const rawToken = crypto.randomBytes(64).toString('base64url');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90일

    await db.insertInto('refresh_tokens')
        .values({
            user_id: userId,
            token_hash: tokenHash,
            expires_at: expiresAt,
        })
        .execute();

    return rawToken;
}

export async function authRoutes(fastify: FastifyInstance) {

    // POST /auth/refresh — access token 갱신 (refresh token rotation)
    fastify.post('/auth/refresh', async (request, reply) => {
        const { refreshToken } = request.body as { refreshToken?: string };
        if (!refreshToken) {
            return reply.code(400).send({ error: 'Missing refreshToken' });
        }

        const tokenHash = hashToken(refreshToken);
        const row = await db.selectFrom('refresh_tokens')
            .where('token_hash', '=', tokenHash)
            .where('revoked_at', 'is', null)
            .selectAll()
            .executeTakeFirst();

        if (!row) {
            return reply.code(401).send({ error: 'Invalid refresh token' });
        }

        if (new Date(row.expires_at) < new Date()) {
            // 만료된 토큰 폐기
            await db.updateTable('refresh_tokens')
                .set({ revoked_at: new Date() })
                .where('id', '=', row.id)
                .execute();
            return reply.code(401).send({ error: 'Refresh token expired' });
        }

        // 기존 refresh token 폐기 (rotation)
        await db.updateTable('refresh_tokens')
            .set({ revoked_at: new Date() })
            .where('id', '=', row.id)
            .execute();

        // 사용자 정보 조회
        const user = await db.selectFrom('users')
            .where('id', '=', row.user_id)
            .selectAll()
            .executeTakeFirst();

        if (!user) {
            return reply.code(401).send({ error: 'User not found' });
        }

        // GitHub 로그인 정보는 oauth_accounts에서 가져옴
        const oauth = await db.selectFrom('oauth_accounts')
            .where('user_id', '=', user.id)
            .where('provider', '=', 'github')
            .selectAll()
            .executeTakeFirst();

        // 새 access token 발급
        const newAccessToken = fastify.jwt.sign({
            sub: user.id,
            email: user.email,
            name: user.name,
            login: oauth?.provider_account_id || '',
        }, { expiresIn: '30d' });

        // 새 refresh token 발급 (rotation)
        const newRefreshToken = await generateRefreshToken(user.id);

        return { token: newAccessToken, refreshToken: newRefreshToken };
    });

    // POST /auth/logout — refresh token 폐기
    fastify.post('/auth/logout', async (request, reply) => {
        const { refreshToken } = request.body as { refreshToken?: string };
        if (!refreshToken) {
            return reply.code(400).send({ error: 'Missing refreshToken' });
        }

        const tokenHash = hashToken(refreshToken);
        await db.updateTable('refresh_tokens')
            .set({ revoked_at: new Date() })
            .where('token_hash', '=', tokenHash)
            .where('revoked_at', 'is', null)
            .execute();

        return { ok: true };
    });

    fastify.get('/github/callback', async (request, reply) => {
        try {
            const token = await fastify.githubOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);

            const userResponse = await fetch('https://api.github.com/user', {
                headers: {
                    Authorization: `Bearer ${token.token.access_token}`,
                    Accept: 'application/vnd.github.v3+json'
                }
            });
            const githubUser: any = await userResponse.json();

            const emailsResponse = await fetch('https://api.github.com/user/emails', {
                headers: {
                    Authorization: `Bearer ${token.token.access_token}`,
                    Accept: 'application/vnd.github.v3+json'
                }
            });
            const githubEmails: any = await emailsResponse.json();

            // GitHub user object에 email이 있으면 그것 사용 (public email)
            let primaryEmail = githubUser.email;

            // 없으면 emails API 응답에서 찾기 (배열인지 먼저 확인)
            if (!primaryEmail && Array.isArray(githubEmails)) {
                primaryEmail = githubEmails.find(e => e.primary)?.email || githubEmails[0]?.email;
            }

            if (!primaryEmail) {
                return reply.code(400).send({ error: 'GitHub account must have an email' });
            }

            const name = githubUser.name || githubUser.login;
            const providerAccountId = githubUser.id.toString();

            let user = await db.selectFrom('users').where('email', '=', primaryEmail).selectAll().executeTakeFirst();

            if (!user) {
                const result = await db.insertInto('users')
                    .values({ email: primaryEmail, name })
                    .returningAll()
                    .executeTakeFirstOrThrow();
                user = result;
            } else {
                await db.updateTable('users')
                    .set({ last_login_at: new Date() })
                    .where('id', '=', user.id)
                    .execute();
            }

            const oauth = await db.selectFrom('oauth_accounts')
                .where('provider', '=', 'github')
                .where('provider_account_id', '=', providerAccountId)
                .selectAll()
                .executeTakeFirst();

            if (!oauth) {
                await db.insertInto('oauth_accounts')
                    .values({
                        user_id: user.id,
                        provider: 'github',
                        provider_account_id: providerAccountId
                    })
                    .execute();
            }

            const appToken = fastify.jwt.sign({
                sub: user.id,
                email: user.email,
                name: githubUser.name || githubUser.login,
                login: githubUser.login,
                avatar_url: githubUser.avatar_url,
            }, { expiresIn: '30d' });

            // Refresh token 발급
            const refreshToken = await generateRefreshToken(user.id);

            // CLI 로그인: state에 포트가 인코딩된 경우 로컬 서버로 리다이렉트
            const rawState = (request.query as any)?.state as string || '';
            const cliMatch = rawState.match(/_cli_(\d+)$/);
            const cliPort = cliMatch ? parseInt(cliMatch[1]) : null;

            if (cliPort && cliPort >= 1024 && cliPort <= 65535) {
                reply.redirect(`http://localhost:${cliPort}/callback?token=${appToken}&refreshToken=${refreshToken}`);
            } else {
                const frontendUrl = process.env.PWA_URL || 'http://localhost:3002';
                reply.redirect(`${frontendUrl}/login?token=${appToken}&refreshToken=${refreshToken}`);
            }

        } catch (err) {
            fastify.log.error(err);
            reply.code(500).send({ error: 'OAuth flow failed' });
        }
    });
}
