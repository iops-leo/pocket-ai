import 'dotenv/config';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import { Migrator, FileMigrationProvider } from 'kysely';
import { db } from '../src/db/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrateToLatest() {
    const migrator = new Migrator({
        db,
        provider: new FileMigrationProvider({
            fs,
            path,
            migrationFolder: path.join(__dirname, '../src/db/migrations'),
        }),
    });

    const { error, results } = await migrator.migrateToLatest();

    results?.forEach((it) => {
        if (it.status === 'Success') {
            console.log(`migration "${it.migrationName}" was executed successfully`);
        } else if (it.status === 'Error') {
            console.error(`failed to execute migration "${it.migrationName}"`);
        }
    });

    if (error) {
        console.error('failed to migrate');
        console.error(error);
        process.exit(1);
    }

    await db.destroy();
}

async function migrateDown() {
    const migrator = new Migrator({
        db,
        provider: new FileMigrationProvider({
            fs,
            path,
            migrationFolder: path.join(__dirname, '../src/db/migrations'),
        }),
    });

    const { error, results } = await migrator.migrateDown();

    results?.forEach((it) => {
        if (it.status === 'Success') {
            console.log(`migration "${it.migrationName}" was reverted successfully`);
        } else if (it.status === 'Error') {
            console.error(`failed to revert migration "${it.migrationName}"`);
        }
    });

    if (error) {
        console.error('failed to migrate down');
        console.error(error);
        process.exit(1);
    }

    await db.destroy();
}

const arg = process.argv[2];
if (arg === 'up') {
    migrateToLatest();
} else if (arg === 'down') {
    migrateDown();
} else {
    console.log('Usage: tsx scripts/migrate.ts up|down');
    process.exit(1);
}
