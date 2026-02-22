import { Command } from 'commander';
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { startCommand } from './commands/start.js';
import { remoteCommand } from './commands/remote.js';
import { statusCommand } from './commands/status.js';
import { stopCommand } from './commands/stop.js';
const program = new Command();
program
    .name('pocket-ai')
    .description('AI CLI 원격 제어 - 어디서든 PC의 AI CLI 세션을 이어서 사용하세요')
    .version('0.1.0')
    // 기본 액션: 인자 없이 'pocket-ai' 실행 시 claude 자동 시작 (Happy 스타일)
    .action(async (options) => {
    // 인자 없이 실행하면 자동으로 claude 시작
    const { startSession } = await import('./commands/start.js');
    await startSession('claude', options);
});
// 고급 사용자용 서브커맨드
program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(startCommand);
program.addCommand(remoteCommand);
program.addCommand(statusCommand);
program.addCommand(stopCommand);
program.parse();
