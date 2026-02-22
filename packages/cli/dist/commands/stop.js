import { Command } from 'commander';
export const stopCommand = new Command('stop')
    .description('데몬 프로세스 종료 (향후 구현 예정)')
    .action(() => {
    console.log('데몬 모드는 아직 구현되지 않았습니다.');
    console.log('현재는 pocket-ai start로 실행한 프로세스를 직접 Ctrl+C로 종료하세요.');
});
