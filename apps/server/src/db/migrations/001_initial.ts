import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
    // Users
    await db.schema
        .createTable('users')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
        .addColumn('email', 'varchar(255)', (col) => col.notNull().unique())
        .addColumn('name', 'varchar(255)')
        .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
        .addColumn('last_login_at', 'timestamp')
        .execute()

    // OAuth Accounts
    await db.schema
        .createTable('oauth_accounts')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
        .addColumn('user_id', 'uuid', (col) => col.references('users.id').onDelete('cascade').notNull())
        .addColumn('provider', 'varchar(50)', (col) => col.notNull())
        .addColumn('provider_account_id', 'varchar(255)', (col) => col.notNull())
        .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
        .addUniqueConstraint('oauth_accounts_provider_provider_account_id_unique', ['provider', 'provider_account_id'])
        .execute()

    // Subscriptions
    await db.schema
        .createTable('subscriptions')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
        .addColumn('user_id', 'uuid', (col) => col.references('users.id').onDelete('cascade').notNull().unique())
        .addColumn('status', 'varchar(50)', (col) => col.notNull().defaultTo('active'))
        .addColumn('plan', 'varchar(50)', (col) => col.notNull().defaultTo('free'))
        .addColumn('current_period_end', 'timestamp')
        .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
        .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
        .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropTable('subscriptions').execute()
    await db.schema.dropTable('oauth_accounts').execute()
    await db.schema.dropTable('users').execute()
}
