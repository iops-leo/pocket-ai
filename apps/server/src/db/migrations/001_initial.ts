import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
    // Users
    await db.schema
        .createTable('users')
        .addColumn('id', 'text', (col) => col.primaryKey())
        .addColumn('email', 'text', (col) => col.notNull().unique())
        .addColumn('name', 'text')
        .addColumn('created_at', 'text', (col) => col.defaultTo(sql`(datetime('now'))`).notNull())
        .addColumn('last_login_at', 'text')
        .execute()

    // OAuth Accounts (kept for GitHub OAuth mode)
    await db.schema
        .createTable('oauth_accounts')
        .addColumn('id', 'text', (col) => col.primaryKey())
        .addColumn('user_id', 'text', (col) => col.references('users.id').onDelete('cascade').notNull())
        .addColumn('provider', 'text', (col) => col.notNull())
        .addColumn('provider_account_id', 'text', (col) => col.notNull())
        .addColumn('created_at', 'text', (col) => col.defaultTo(sql`(datetime('now'))`).notNull())
        .execute()

    await db.schema
        .createIndex('oauth_accounts_provider_unique')
        .unique()
        .on('oauth_accounts')
        .columns(['provider', 'provider_account_id'])
        .execute()

    // Sessions
    await db.schema
        .createTable('sessions')
        .addColumn('id', 'text', (col) => col.primaryKey())
        .addColumn('user_id', 'text', (col) => col.references('users.id').onDelete('cascade').notNull())
        .addColumn('public_key', 'text', (col) => col.notNull())
        .addColumn('metadata', 'text', (col) => col.defaultTo('{}').notNull())
        .addColumn('status', 'text', (col) => col.notNull().defaultTo('offline'))
        .addColumn('created_at', 'text', (col) => col.defaultTo(sql`(datetime('now'))`).notNull())
        .addColumn('updated_at', 'text', (col) => col.defaultTo(sql`(datetime('now'))`).notNull())
        .execute()

    await db.schema.createIndex('sessions_user_id_idx').on('sessions').column('user_id').execute()
    await db.schema.createIndex('sessions_user_id_created_at_idx').on('sessions').columns(['user_id', 'created_at']).execute()

    // Messages
    await db.schema
        .createTable('messages')
        .addColumn('id', 'text', (col) => col.primaryKey())
        .addColumn('session_id', 'text', (col) => col.references('sessions.id').onDelete('cascade').notNull())
        .addColumn('seq', 'integer', (col) => col.notNull())
        .addColumn('sender', 'text', (col) => col.notNull())
        .addColumn('encrypted_body', 'text', (col) => col.notNull())
        .addColumn('created_at', 'text', (col) => col.defaultTo(sql`(datetime('now'))`).notNull())
        .execute()

    await db.schema.createIndex('messages_session_seq_idx').on('messages').columns(['session_id', 'seq']).execute()
    await db.schema.createIndex('messages_session_created_idx').on('messages').columns(['session_id', 'created_at']).execute()
    await db.schema.createIndex('messages_session_seq_unique').unique().on('messages').columns(['session_id', 'seq']).execute()

    // Refresh Tokens
    await db.schema
        .createTable('refresh_tokens')
        .addColumn('id', 'text', (col) => col.primaryKey())
        .addColumn('user_id', 'text', (col) => col.references('users.id').onDelete('cascade').notNull())
        .addColumn('token_hash', 'text', (col) => col.notNull().unique())
        .addColumn('expires_at', 'text', (col) => col.notNull())
        .addColumn('created_at', 'text', (col) => col.defaultTo(sql`(datetime('now'))`).notNull())
        .addColumn('revoked_at', 'text')
        .execute()

    await db.schema.createIndex('idx_refresh_tokens_user_id').on('refresh_tokens').column('user_id').execute()
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropTable('refresh_tokens').execute()
    await db.schema.dropTable('messages').execute()
    await db.schema.dropTable('sessions').execute()
    await db.schema.dropTable('oauth_accounts').execute()
    await db.schema.dropTable('users').execute()
}
