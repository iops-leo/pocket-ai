import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .createTable('refresh_tokens')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
        .addColumn('user_id', 'uuid', (col) => col.references('users.id').onDelete('cascade').notNull())
        .addColumn('token_hash', 'varchar(128)', (col) => col.notNull().unique())
        .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
        .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`now()`).notNull())
        .addColumn('revoked_at', 'timestamptz')
        .execute()

    await db.schema
        .createIndex('idx_refresh_tokens_user_id')
        .on('refresh_tokens')
        .column('user_id')
        .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropTable('refresh_tokens').execute()
}
