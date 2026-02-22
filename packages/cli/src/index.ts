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
  .version('0.1.0');

program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(startCommand);
program.addCommand(remoteCommand);
program.addCommand(statusCommand);
program.addCommand(stopCommand);

program.parse();
