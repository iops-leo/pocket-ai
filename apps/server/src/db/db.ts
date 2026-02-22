import { Pool } from 'pg';
import { Kysely, PostgresDialect, Generated } from 'kysely';

export interface UserTable {
    id: Generated<string>;
    email: string;
    name: string | null;
    created_at: Generated<Date>;
    last_login_at: Date | null;
}

export interface OAuthAccountTable {
    id: Generated<string>;
    user_id: string;
    provider: string;
    provider_account_id: string;
    created_at: Generated<Date>;
}

export interface SubscriptionTable {
    id: Generated<string>;
    user_id: string;
    status: string; // 'active', 'canceled', 'past_due'
    plan: string;   // 'free', 'pro', 'team'
    current_period_end: Date | null;
    created_at: Generated<Date>;
    updated_at: Generated<Date>;
}

export interface Database {
    users: UserTable;
    oauth_accounts: OAuthAccountTable;
    subscriptions: SubscriptionTable;
}

// Ensure you set DATABASE_URL in .env
// Parse URL manually so ssl: { rejectUnauthorized: false } is never overridden
const dbUrl = new URL(process.env.DATABASE_URL!);
const dialect = new PostgresDialect({
    pool: new Pool({
        host: dbUrl.hostname,
        port: parseInt(dbUrl.port || '5432'),
        user: dbUrl.username,
        password: dbUrl.password,
        database: dbUrl.pathname.slice(1),
        max: 10,
        ssl: dbUrl.hostname.includes('supabase.com')
            ? { rejectUnauthorized: false }
            : false,
    })
});

export const db = new Kysely<Database>({
    dialect,
});
