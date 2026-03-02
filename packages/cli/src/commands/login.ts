import { Command } from 'commander';
import open from 'open';
import http from 'http';
import { URL } from 'url';
import { setToken, setRefreshToken, getServerUrl, getToken } from '../config.js';

export const loginCommand = new Command('login')
  .description('GitHub OAuth로 로그인')
  .option('--server <url>', '서버 URL 지정')
  .action(async (options) => {
    const serverUrl = options.server || getServerUrl();

    const existingToken = getToken();
    if (existingToken) {
      console.log('이미 로그인되어 있습니다. pocket-ai logout 후 다시 시도하세요.');
      process.exit(0);
    }

    const localPort = 9876;

    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url || '/', `http://localhost:${localPort}`);
      const token = url.searchParams.get('token');
      const refreshTokenParam = url.searchParams.get('refreshToken');

      if (token) {
        setToken(token);
        if (refreshTokenParam) {
          setRefreshToken(refreshTokenParam);
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <html>
            <body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;background:#030712;color:#f3f4f6">
              <div style="text-align:center">
                <h1 style="color:#34d399">로그인 성공!</h1>
                <p style="color:#9ca3af">잠시 후 이 창이 자동으로 닫힙니다.</p>
              </div>
            </body>
            <script>setTimeout(() => window.close(), 1500);</script>
          </html>
        `);

        console.log('\n✅ 로그인 성공!');
        console.log('이제 pocket-ai start로 세션을 시작할 수 있습니다.\n');

        server.close();
        process.exit(0);
      } else {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Login failed - no token received');
      }
    });

    server.listen(localPort, () => {
      // cli_port를 쿼리 파라미터로 전달 → 서버가 state에 인코딩 → OAuth 콜백 후 여기로 리다이렉트
      const loginUrl = `${serverUrl}/auth/github?cli_port=${localPort}`;

      console.log('브라우저에서 GitHub 로그인 페이지를 엽니다...');
      console.log(`URL: ${loginUrl}\n`);
      console.log('브라우저가 열리지 않으면 위 URL을 직접 열어주세요.');
      console.log('대기 중...\n');

      open(loginUrl).catch(() => {});
    });

    setTimeout(() => {
      console.log('\n로그인 시간이 초과되었습니다 (5분). 다시 시도해주세요.');
      server.close();
      process.exit(1);
    }, 5 * 60 * 1000);
  });
