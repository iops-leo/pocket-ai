import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .createTable('sessions')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('user_id', 'uuid', (col) => col.references('users.id').onDelete('cascade').notNull())
        .addColumn('public_key', 'text', (col) => col.notNull())
        .addColumn('metadata', 'jsonb', (col) => col.defaultTo(sql`'{}'`).notNull())
        .addColumn('status', 'varchar(20)', (col) => col.notNull().defaultTo('offline'))
        .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
        .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
        .execute()

    await db.schema
        .createIndex('sessions_user_id_idx')
        .on('sessions')
        .column('user_id')
        .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropTable('sessions').execute()
}
