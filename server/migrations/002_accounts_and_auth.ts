import type { Migration } from './types';

export const migration002: Migration = {
  id: '002_accounts_and_auth',
  description: 'Add users, sessions, oauth accounts, user_settings, user_workspaces and user_id relations',
  up: (db) => {
    // 1. Create users table
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        display_name TEXT NOT NULL,
        avatar_url TEXT DEFAULT '',
        role TEXT DEFAULT 'user',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT UNIQUE NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS oauth_accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        provider_user_id TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(provider, provider_user_id)
      );

      CREATE TABLE IF NOT EXISTS user_settings (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        key TEXT NOT NULL,
        value TEXT,
        PRIMARY KEY (user_id, key)
      );

      CREATE TABLE IF NOT EXISTS user_workspaces (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        node_id TEXT NOT NULL,
        history TEXT DEFAULT '[]',
        history_index INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // 2. Insert default local user for standalone and backwards compatibility
    const defaultUserId = 'usr_local_admin';
    const existingUser = db.query('SELECT id FROM users WHERE id = ?').get(defaultUserId);
    if (!existingUser) {
      db.prepare(`
        INSERT INTO users (id, email, password_hash, display_name, role)
        VALUES (?, ?, NULL, ?, ?)
      `).run(defaultUserId, 'local@fmsort.app', 'Local Library', 'admin');
    }

    // 3. Helper to check if column exists
    const hasColumn = (tableName: string, colName: string): boolean => {
      const cols = db.query(`PRAGMA table_info(${tableName})`).all() as { name: string }[];
      return cols.some(c => c.name === colName);
    };

    // 4. Add user_id to spaces if missing
    if (!hasColumn('spaces', 'user_id')) {
      db.exec(`ALTER TABLE spaces ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;`);
    }

    // 5. Add user_id to nodes if missing
    if (!hasColumn('nodes', 'user_id')) {
      db.exec(`ALTER TABLE nodes ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;`);
    }

    // 6. Add user_id to tracks if missing
    if (!hasColumn('tracks', 'user_id')) {
      db.exec(`ALTER TABLE tracks ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;`);
    }

    // 7. Ensure existing records are backfilled with defaultUserId
    db.prepare('UPDATE spaces SET user_id = ? WHERE user_id IS NULL').run(defaultUserId);
    db.prepare('UPDATE nodes SET user_id = ? WHERE user_id IS NULL').run(defaultUserId);
    db.prepare('UPDATE tracks SET user_id = ? WHERE user_id IS NULL').run(defaultUserId);

    // 8. Migrate legacy settings to user_settings
    try {
      const legacySettings = db.query('SELECT key, value FROM settings').all() as { key: string; value: string }[];
      const insertSetting = db.prepare(`
        INSERT OR REPLACE INTO user_settings (user_id, key, value)
        VALUES (?, ?, ?)
      `);
      for (const s of legacySettings) {
        insertSetting.run(defaultUserId, s.key, s.value);
      }
    } catch (e) {
      console.warn('Could not backfill user_settings from settings:', e);
    }

    // 9. Multi-tenant performance indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_nodes_user_id ON nodes(user_id);
      CREATE INDEX IF NOT EXISTS idx_nodes_parent_id ON nodes(parent_id);
      CREATE INDEX IF NOT EXISTS idx_tracks_user_id ON tracks(user_id);
      CREATE INDEX IF NOT EXISTS idx_tracks_node_id ON tracks(node_id);
      CREATE INDEX IF NOT EXISTS idx_spaces_user_id ON spaces(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
      CREATE INDEX IF NOT EXISTS idx_user_workspaces_user ON user_workspaces(user_id);
    `);
  },
};
