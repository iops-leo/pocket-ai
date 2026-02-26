import { sql } from 'kysely';
import { db } from '../db.js';

export async function up(): Promise<void> {
    await sql`CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id)`.execute(db);
    await sql`CREATE INDEX IF NOT EXISTS sessions_user_id_created_at_idx ON sessions (user_id, created_at DESC)`.execute(db);
}

export async function down(): Promise<void> {
    await sql`DROP INDEX IF EXISTS sessions_user_id_created_at_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS sessions_user_id_idx`.execute(db);
}
