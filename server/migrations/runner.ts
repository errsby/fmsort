import { Database } from 'bun:sqlite';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { Migration } from './types';
import { migration001 } from './001_initial_schema';
import { migration002 } from './002_accounts_and_auth';
import { migration003 } from './003_cloud_sync_metadata';

export const allMigrations: Migration[] = [
  migration001,
  migration002,
  migration003,
];

export interface MigrationSummary {
  total: number;
  previouslyApplied: number;
  newlyApplied: string[];
}

export function runMigrations(dbInstance?: Database, dbPath = 'data/fmsort.db'): MigrationSummary {
  let db = dbInstance;
  let shouldClose = false;

  if (!db) {
    mkdirSync(dirname(dbPath), { recursive: true });
    db = new Database(dbPath, { create: true });
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA foreign_keys = ON;');
    shouldClose = true;
  }

  // 1. Ensure migrations tracking table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // 2. Fetch already applied migrations
  const appliedRows = db.query('SELECT name FROM schema_migrations ORDER BY id ASC').all() as { name: string }[];
  const appliedSet = new Set(appliedRows.map(r => r.name));

  const newlyApplied: string[] = [];

  // 3. Run unapplied migrations in chronological order
  for (const m of allMigrations) {
    if (!appliedSet.has(m.id)) {
      console.log(`[Migrations] Applying ${m.id}: ${m.description}...`);
      
      const applyTx = db.transaction(() => {
        m.up(db!);
        db!.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(m.id);
      });

      applyTx();
      newlyApplied.push(m.id);
      console.log(`[Migrations] ✓ Successfully applied ${m.id}`);
    }
  }

  if (newlyApplied.length === 0) {
    console.log(`[Migrations] Schema is up to date (${appliedSet.size} migrations applied).`);
  } else {
    console.log(`[Migrations] Applied ${newlyApplied.length} new migration(s). Total applied: ${appliedSet.size + newlyApplied.length}.`);
  }

  const summary: MigrationSummary = {
    total: allMigrations.length,
    previouslyApplied: appliedSet.size,
    newlyApplied,
  };

  if (shouldClose && db) {
    db.close();
  }

  return summary;
}

// CLI direct execution
if (import.meta.main) {
  try {
    const targetPath = process.env.DB_PATH || 'data/fmsort.db';
    console.log(`[Migrations] Running migrations on ${targetPath}...`);
    runMigrations(undefined, targetPath);
    process.exit(0);
  } catch (err) {
    console.error('[Migrations] Migration failed:', err);
    process.exit(1);
  }
}
