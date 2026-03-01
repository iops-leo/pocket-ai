import { FastifyInstance } from 'fastify';
import { db } from '../db/db.js';

declare module 'fastify' {
    interface FastifyInstance {
        githubOAuth2: import('@fastify/oauth2').OAuth2Namespace;
    }
}

export async function authRoutes(fastify: FastifyInstance) {

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

            // CLI 로그인: state에 포트가 인코딩된 경우 로컬 서버로 리다이렉트
            const rawState = (request.query as any)?.state as string || '';
            const cliMatch = rawState.match(/_cli_(\d+)$/);
            const cliPort = cliMatch ? parseInt(cliMatch[1]) : null;

            if (cliPort && cliPort >= 1024 && cliPort <= 65535) {
                reply.redirect(`http://localhost:${cliPort}/callback?token=${appToken}`);
            } else {
                const frontendUrl = process.env.PWA_URL || 'http://localhost:3002';
                reply.redirect(`${frontendUrl}/login?token=${appToken}`);
            }

        } catch (err) {
            fastify.log.error(err);
            reply.code(500).send({ error: 'OAuth flow failed' });
        }
    });
}
