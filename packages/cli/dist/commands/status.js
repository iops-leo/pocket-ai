import { Command } from 'commander';
import { getToken, getServerUrl } from '../config.js';
import { fetchSessions } from '../server/connection.js';
export const statusCommand = new Command('status')
    .description('현재 상태 확인')
    .action(async () => {
    const token = getToken();
    const serverUrl = getServerUrl();
    console.log('\nPocket AI 상태\n');
    console.log(`서버: ${serverUrl}`);
    console.log(`인증: ${token ? '로그인됨' : '로그인 필요 (pocket-ai login)'}`);
    if (token) {
        try {
            const sessions = await fetchSessions();
            console.log(`활성 세션: ${sessions.length}개`);
            for (const s of sessions) {
                console.log(`  - ${s.sessionId.slice(0, 8)}... (${s.metadata?.hostname || 'Unknown'})`);
            }
        }
        catch {
            console.log('활성 세션: 서버 연결 불가');
        }
    }
    console.log('');
});
