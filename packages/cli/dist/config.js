import Conf from 'conf';
import crypto from 'crypto';
const config = new Conf({
    projectName: 'pocket-ai',
    defaults: {
        serverUrl: 'https://pocket-ai-production.up.railway.app',
    },
});
// CWD를 해시로 변환 (키 저장용)
function hashSessionScope(cwd, engine) {
    return crypto.createHash('sha256').update(`${cwd}::${engine}`).digest('hex').slice(0, 16);
}
export function getToken() {
    return config.get('token');
}
export function setToken(token) {
    config.set('token', token);
}
export function clearToken() {
    config.delete('token');
}
export function getServerUrl() {
    return process.env.POCKET_AI_SERVER || config.get('serverUrl');
}
export function setServerUrl(url) {
    config.set('serverUrl', url);
}
// 세션 키 저장 (Happy 방식: 동일 cwd에서 재접속 시 동일 키 사용)
export function saveSessionKeys(cwd, keys, engine = 'claude') {
    const cwdHash = hashSessionScope(cwd, engine);
    const sessionKeys = config.get('sessionKeys') || {};
    sessionKeys[cwdHash] = keys;
    config.set('sessionKeys', sessionKeys);
}
// 세션 키 로드
export function loadSessionKeys(cwd, engine = 'claude') {
    const cwdHash = hashSessionScope(cwd, engine);
    const sessionKeys = config.get('sessionKeys') || {};
    // Backward compatibility: old versions keyed by cwd only.
    const legacyCwdHash = crypto.createHash('sha256').update(cwd).digest('hex').slice(0, 16);
    return sessionKeys[cwdHash] || sessionKeys[legacyCwdHash] || null;
}
// 세션 키 삭제
export function clearSessionKeys(cwd, engine = 'claude') {
    const cwdHash = hashSessionScope(cwd, engine);
    const sessionKeys = config.get('sessionKeys') || {};
    delete sessionKeys[cwdHash];
    const legacyCwdHash = crypto.createHash('sha256').update(cwd).digest('hex').slice(0, 16);
    delete sessionKeys[legacyCwdHash];
    config.set('sessionKeys', sessionKeys);
}
