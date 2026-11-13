import type { Migration } from './types';

export const migration001: Migration = {
  id: '001_initial_schema',
  description: 'Create baseline tables (nodes, tracks, settings, spaces)',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS spaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        icon TEXT DEFAULT '',
        cover_url TEXT DEFAULT '',
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        parent_id TEXT REFERENCES nodes(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        cover_url TEXT DEFAULT '',
        space_id TEXT DEFAULT 'default' REFERENCES spaces(id) ON DELETE SET DEFAULT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS tracks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        album TEXT NOT NULL,
        year INTEGER,
        format TEXT,
        catalog_no TEXT,
        barcode TEXT,
        mbid TEXT,
        isrc TEXT,
        length INTEGER DEFAULT 0,
        bpm INTEGER DEFAULT 0,
        key TEXT DEFAULT '',
        sort_order INTEGER DEFAULT 0,
        cover_url TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    // Ensure default space exists
    const spaceCount = db.query('SELECT count(*) as count FROM spaces WHERE id = ?').get('default') as { count: number };
    if (!spaceCount || spaceCount.count === 0) {
      db.prepare(`
        INSERT INTO spaces (id, name, description, sort_order)
        VALUES (?, ?, ?, ?)
      `).run('default', 'Main Space', 'Default music sorting space', 0);
    }
  },
};
