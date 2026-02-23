import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
    // 메시지 테이블: 암호화된 메시지를 저장
    // 서버는 복호화하지 않음 (E2E 암호화 유지)
    await db.schema
        .createTable('messages')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
        .addColumn('session_id', 'uuid', (col) => col.references('sessions.id').onDelete('cascade').notNull())
        .addColumn('seq', 'integer', (col) => col.notNull())
        .addColumn('sender', 'varchar(10)', (col) => col.notNull()) // 'cli' | 'pwa'
        .addColumn('encrypted_body', 'jsonb', (col) => col.notNull()) // { cipher: string, iv: string }
        .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
        .execute()

    // 복합 인덱스: 세션별 시간순 조회 최적화
    await db.schema
        .createIndex('messages_session_seq_idx')
        .on('messages')
        .columns(['session_id', 'seq'])
        .execute()

    // 세션별 메시지 개수 제한을 위한 인덱스
    await db.schema
        .createIndex('messages_session_created_idx')
        .on('messages')
        .columns(['session_id', 'created_at'])
        .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropTable('messages').execute()
}
