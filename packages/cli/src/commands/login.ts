import { Command } from 'commander';
import open from 'open';
import http from 'http';
import { URL } from 'url';
import { setToken, getServerUrl, getToken } from '../config.js';

export const loginCommand = new Command('login')
  .description('GitHub OAuth로 로그인')
  .option('--server <url>', '서버 URL 지정')
  .action(async (options) => {
    const serverUrl = options.server || getServerUrl();

    // Check if already logged in
    const existingToken = getToken();
    if (existingToken) {
      console.log('이미 로그인되어 있습니다. 다시 로그인하려면 pocket-ai logout을 먼저 실행하세요.');
      console.log('계속하려면 Enter, 취소하려면 Ctrl+C...');
      await new Promise<void>((resolve) => {
        process.stdin.once('data', () => resolve());
      });
    }

    // Start a temporary local server to receive the OAuth callback
    const localPort = 9876;

    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url || '/', `http://localhost:${localPort}`);
      const token = url.searchParams.get('token');

      if (token) {
        setToken(token);

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <html>
            <body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;background:#030712;color:#f3f4f6">
              <div style="text-align:center">
                <h1 style="color:#34d399">로그인 성공!</h1>
                <p>이 창을 닫고 터미널로 돌아가세요.</p>
              </div>
            </body>
          </html>
        `);

        console.log('\n로그인 성공!');
        console.log('이제 pocket-ai start로 세션을 시작할 수 있습니다.\n');

        server.close();
        process.exit(0);
      } else {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Login failed - no token received');
      }
    });

    server.listen(localPort, () => {
      // The OAuth callback needs to redirect to our local server
      // We pass the local callback URL as a parameter
      const callbackUrl = `http://localhost:${localPort}/callback`;
      const loginUrl = `${serverUrl}/auth/github?redirect_uri=${encodeURIComponent(callbackUrl)}`;

      console.log('브라우저에서 GitHub 로그인 페이지를 엽니다...');
      console.log(`URL: ${loginUrl}\n`);
      console.log('브라우저가 자동으로 열리지 않으면 위 URL을 직접 열어주세요.');
      console.log('대기 중...\n');

      open(loginUrl).catch(() => {
        // If open fails, user can manually open the URL
      });
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      console.log('\n로그인 시간이 초과되었습니다. 다시 시도해주세요.');
      server.close();
      process.exit(1);
    }, 5 * 60 * 1000);
  });
