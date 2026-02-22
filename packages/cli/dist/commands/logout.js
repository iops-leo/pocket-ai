import { Command } from 'commander';
import { clearToken } from '../config.js';
export const logoutCommand = new Command('logout')
    .description('로그아웃 (저장된 토큰 삭제)')
    .action(() => {
    clearToken();
    console.log('로그아웃되었습니다.');
});
