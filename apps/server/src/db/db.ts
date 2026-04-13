import BetterSqlite3 from 'better-sqlite3';
import { Kysely, SqliteDialect, Generated } from 'kysely';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

export interface UserTable {
    id: string;
    email: string;
    name: string | null;
    created_at: Generated<string>;
    last_login_at: string | null;
}

export interface OAuthAccountTable {
    id: string;
    user_id: string;
    provider: string;
    provider_account_id: string;
    created_at: Generated<string>;
}

export interface SessionTable {
    id: string;          // UUID (CLI가 생성)
    user_id: string;
    public_key: string;  // ECDH 공개키 (Base64)
    metadata: string;    // JSON string (hostname, engine 등)
    status: string;      // 'online' | 'offline'
    created_at: Generated<string>;
    updated_at: Generated<string>;
}

export interface EncryptedBody {
    cipher: string;
    iv: string;
}

export interface MessageTable {
    id: string;
    session_id: string;
    seq: number;
    sender: 'cli' | 'pwa';
    encrypted_body: string;  // 암호화된 메시지 (서버는 복호화 안함)
    created_at: Generated<string>;
}

export interface RefreshTokenTable {
    id: string;
    user_id: string;
    token_hash: string;
    expires_at: string;
    created_at: Generated<string>;
    revoked_at: string | null;
}

export interface Database {
    users: UserTable;
    oauth_accounts: OAuthAccountTable;
    sessions: SessionTable;
    messages: MessageTable;
    refresh_tokens: RefreshTokenTable;
}

// Auto-create directory for the SQLite database file
const dbPath = process.env.DATABASE_PATH || './data/pocket-ai.db';
mkdirSync(dirname(dbPath), { recursive: true });

const database = new BetterSqlite3(dbPath);
database.pragma('journal_mode = WAL');
database.pragma('foreign_keys = ON');

const dialect = new SqliteDialect({ database });

export const db = new Kysely<Database>({ dialect });
