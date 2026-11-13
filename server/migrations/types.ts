import type { Database } from 'bun:sqlite';

export interface Migration {
  id: string; // e.g. '001_initial_schema'
  description: string;
  up: (db: Database) => Promise<void> | void;
  down?: (db: Database) => Promise<void> | void;
}

export interface MigrationRecord {
  id: number;
  name: string;
  applied_at: string;
}
