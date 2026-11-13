import type { Migration } from './types';

export const migration003: Migration = {
  id: '003_cloud_sync_metadata',
  description: 'Add sync timestamps, soft-delete tracking, and version counters for cloud synchronization',
  up: (db) => {
    const hasColumn = (tableName: string, colName: string): boolean => {
      const cols = db.query(`PRAGMA table_info(${tableName})`).all() as { name: string }[];
      return cols.some(c => c.name === colName);
    };

    // Nodes sync columns
    if (!hasColumn('nodes', 'updated_at')) {
      db.exec("ALTER TABLE nodes ADD COLUMN updated_at TEXT DEFAULT NULL;");
      db.exec("UPDATE nodes SET updated_at = datetime('now') WHERE updated_at IS NULL;");
    }
    if (!hasColumn('nodes', 'deleted_at')) {
      db.exec("ALTER TABLE nodes ADD COLUMN deleted_at TEXT DEFAULT NULL;");
    }
    if (!hasColumn('nodes', 'version')) {
      db.exec("ALTER TABLE nodes ADD COLUMN version INTEGER DEFAULT 1;");
    }

    // Tracks sync columns
    if (!hasColumn('tracks', 'updated_at')) {
      db.exec("ALTER TABLE tracks ADD COLUMN updated_at TEXT DEFAULT NULL;");
      db.exec("UPDATE tracks SET updated_at = datetime('now') WHERE updated_at IS NULL;");
    }
    if (!hasColumn('tracks', 'deleted_at')) {
      db.exec("ALTER TABLE tracks ADD COLUMN deleted_at TEXT DEFAULT NULL;");
    }
    if (!hasColumn('tracks', 'version')) {
      db.exec("ALTER TABLE tracks ADD COLUMN version INTEGER DEFAULT 1;");
    }

    // Spaces sync columns
    if (!hasColumn('spaces', 'updated_at')) {
      db.exec("ALTER TABLE spaces ADD COLUMN updated_at TEXT DEFAULT NULL;");
      db.exec("UPDATE spaces SET updated_at = datetime('now') WHERE updated_at IS NULL;");
    }
    if (!hasColumn('spaces', 'deleted_at')) {
      db.exec("ALTER TABLE spaces ADD COLUMN deleted_at TEXT DEFAULT NULL;");
    }

    // Sync query indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_nodes_sync ON nodes(user_id, updated_at, deleted_at);
      CREATE INDEX IF NOT EXISTS idx_tracks_sync ON tracks(user_id, updated_at, deleted_at);
    `);
  },
};
