import Conf from 'conf';
const config = new Conf({
    projectName: 'pocket-ai',
    defaults: {
        serverUrl: 'https://pocket-ai-production.up.railway.app',
    },
});
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
