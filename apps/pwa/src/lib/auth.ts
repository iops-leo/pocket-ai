const TOKEN_KEY = 'pocket_ai_token';
const REFRESH_TOKEN_KEY = 'pocket_ai_refresh_token';

export function getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(token: string, refreshToken: string): void {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
}

let refreshPromise: Promise<string | null> | null = null;

/**
 * Refresh token으로 새 access token을 발급받는다.
 * 동시 호출 시 하나의 요청만 실행 (dedup).
 */
export async function tryRefreshToken(): Promise<string | null> {
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
        const refreshToken = getRefreshToken();
        if (!refreshToken) return null;

        try {
            const serverUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
            const res = await fetch(`${serverUrl}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken }),
            });

            if (!res.ok) return null;

            const data = await res.json();
            if (data.token && data.refreshToken) {
                setTokens(data.token, data.refreshToken);
                return data.token;
            }
            return null;
        } catch {
            return null;
        }
    })();

    try {
        return await refreshPromise;
    } finally {
        refreshPromise = null;
    }
}

/**
 * Authorization 헤더를 자동 추가하고, 401 시 토큰 갱신 후 재시도하는 fetch 래퍼.
 */
export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    const token = getToken();
    const headers = new Headers(options.headers);
    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    const res = await fetch(url, { ...options, headers });

    if (res.status === 401) {
        const newToken = await tryRefreshToken();
        if (newToken) {
            headers.set('Authorization', `Bearer ${newToken}`);
            return fetch(url, { ...options, headers });
        }
        // 갱신 실패 → 토큰 정리 (호출자가 리다이렉트 처리)
        clearTokens();
    }

    return res;
}
