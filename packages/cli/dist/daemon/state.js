import fs from 'fs/promises';
import path from 'path';
import os from 'os';
const STATE_DIR = path.join(os.homedir(), '.pocket-ai');
const STATE_FILE = path.join(STATE_DIR, 'daemon-state.json');
const PID_FILE = path.join(STATE_DIR, 'daemon.pid');
/**
 * 상태 디렉토리 생성
 */
async function ensureStateDir() {
    try {
        await fs.mkdir(STATE_DIR, { recursive: true });
    }
    catch (err) {
        // 이미 존재하면 무시
    }
}
/**
 * 데몬 상태 로드
 */
export async function loadDaemonState() {
    try {
        const data = await fs.readFile(STATE_FILE, 'utf-8');
        return JSON.parse(data);
    }
    catch (err) {
        return null;
    }
}
/**
 * 데몬 상태 저장
 */
export async function saveDaemonState(state) {
    await ensureStateDir();
    await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}
/**
 * 데몬 PID 저장
 */
export async function saveDaemonPid(pid) {
    await ensureStateDir();
    await fs.writeFile(PID_FILE, pid.toString(), 'utf-8');
}
/**
 * 데몬 PID 로드
 */
export async function loadDaemonPid() {
    try {
        const data = await fs.readFile(PID_FILE, 'utf-8');
        return parseInt(data.trim());
    }
    catch (err) {
        return null;
    }
}
/**
 * 데몬 상태 초기화
 */
export async function initDaemonState(pid, ipcSocketPath) {
    const state = {
        pid,
        startedAt: Date.now(),
        sessions: {},
        ipcSocketPath
    };
    await saveDaemonState(state);
    await saveDaemonPid(pid);
    return state;
}
/**
 * 데몬 상태 삭제
 */
export async function clearDaemonState() {
    try {
        await fs.unlink(STATE_FILE);
        await fs.unlink(PID_FILE);
    }
    catch (err) {
        // 파일이 없으면 무시
    }
}
/**
 * 데몬이 실행 중인지 확인
 */
export async function isDaemonRunning() {
    const pid = await loadDaemonPid();
    if (!pid)
        return false;
    try {
        // PID가 존재하는지 확인 (시그널 0은 프로세스 존재 여부만 체크)
        process.kill(pid, 0);
        return true;
    }
    catch (err) {
        // 프로세스가 없으면 에러 발생
        return false;
    }
}
/**
 * 상태 파일 경로들
 */
export const STATE_PATHS = {
    dir: STATE_DIR,
    state: STATE_FILE,
    pid: PID_FILE
};
