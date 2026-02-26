import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
    // (session_id, seq) 복합 UNIQUE 제약조건 추가
    // 동시 메시지 도착 시 seq 중복 삽입 방지 (race condition 방어)
    await sql`
        ALTER TABLE messages
        ADD CONSTRAINT messages_session_seq_unique UNIQUE (session_id, seq)
    `.execute(db)
}

export async function down(db: Kysely<any>): Promise<void> {
    await sql`
        ALTER TABLE messages
        DROP CONSTRAINT messages_session_seq_unique
    `.execute(db)
}
