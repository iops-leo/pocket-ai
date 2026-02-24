interface SessionKeys {
    publicKey: string;
    privateKey: string;
    sessionId: string;
    sessionKey?: string;
}
export declare function getToken(): string | undefined;
export declare function setToken(token: string): void;
export declare function clearToken(): void;
export declare function getServerUrl(): string;
export declare function setServerUrl(url: string): void;
export declare function saveSessionKeys(cwd: string, keys: SessionKeys, engine?: string): void;
export declare function loadSessionKeys(cwd: string, engine?: string): SessionKeys | null;
export declare function clearSessionKeys(cwd: string, engine?: string): void;
export {};
