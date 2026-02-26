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
  // 기본 액션: pocket-ai [engine] 형태로 실행 (engine 미지정 시 claude)
  // 예: pocket-ai → claude, pocket-ai codex → codex, pocket-ai gemini → gemini
  .argument('[engine]', 'AI 엔진 선택 (claude, codex, gemini)', 'claude')
  .action(async (engine: string, options) => {
    const { startSession } = await import('./commands/start.js');
    await startSession(engine || 'claude', options);
  });

// 고급 사용자용 서브커맨드
program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(startCommand);
program.addCommand(remoteCommand);
program.addCommand(statusCommand);
program.addCommand(stopCommand);

program.parse();
