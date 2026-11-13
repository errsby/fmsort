import { Database } from 'bun:sqlite';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface ExportDataPayload {
  version: string;
  exportedAt: string;
  source: string;
  stats: {
    usersCount: number;
    spacesCount: number;
    nodesCount: number;
    tracksCount: number;
    settingsCount: number;
  };
  users: any[];
  spaces: any[];
  nodes: any[];
  tracks: any[];
  settings: any[];
}

export function exportDatabaseToJson(dbPath = 'data/fmsort.db', userId?: string): ExportDataPayload {
  const db = new Database(dbPath, { readonly: true });

  const userFilter = userId ? 'WHERE user_id = ?' : '';
  const userParams = userId ? [userId] : [];

  const users = userId
    ? (db.query('SELECT * FROM users WHERE id = ?').all(userId) as any[])
    : (db.query('SELECT * FROM users').all() as any[]);

  const spaces = db.query(`SELECT * FROM spaces ${userFilter}`).all(...userParams) as any[];
  const nodes = db.query(`SELECT * FROM nodes ${userFilter}`).all(...userParams) as any[];
  const tracks = db.query(`SELECT * FROM tracks ${userFilter}`).all(...userParams) as any[];
  const settings = userId
    ? (db.query('SELECT * FROM user_settings WHERE user_id = ?').all(userId) as any[])
    : (db.query('SELECT * FROM user_settings').all() as any[]);

  db.close();

  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    source: 'fmsort-sqlite',
    stats: {
      usersCount: users.length,
      spacesCount: spaces.length,
      nodesCount: nodes.length,
      tracksCount: tracks.length,
      settingsCount: settings.length,
    },
    users,
    spaces,
    nodes,
    tracks,
    settings,
  };
}

export function exportToPostgresSql(payload: ExportDataPayload): string {
  const escapeSql = (val: any): string => {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'number') return String(val);
    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
    return `'${String(val).replace(/'/g, "''")}'`;
  };

  const lines: string[] = [
    `-- FMSort PostgreSQL Migration Dump`,
    `-- Generated: ${payload.exportedAt}`,
    `-- Records: ${payload.stats.nodesCount} nodes, ${payload.stats.tracksCount} tracks`,
    `BEGIN;`,
    ``,
  ];

  // Users
  for (const u of payload.users) {
    lines.push(
      `INSERT INTO users (id, email, password_hash, display_name, avatar_url, role, created_at, updated_at) VALUES (${escapeSql(u.id)}, ${escapeSql(u.email)}, ${escapeSql(u.password_hash)}, ${escapeSql(u.display_name)}, ${escapeSql(u.avatar_url || '')}, ${escapeSql(u.role || 'user')}, ${escapeSql(u.created_at)}, ${escapeSql(u.updated_at)}) ON CONFLICT (id) DO NOTHING;`
    );
  }
  lines.push('');

  // Spaces
  for (const s of payload.spaces) {
    lines.push(
      `INSERT INTO spaces (id, user_id, name, description, icon, cover_url, sort_order, created_at) VALUES (${escapeSql(s.id)}, ${escapeSql(s.user_id)}, ${escapeSql(s.name)}, ${escapeSql(s.description || '')}, ${escapeSql(s.icon || '')}, ${escapeSql(s.cover_url || '')}, ${s.sort_order || 0}, ${escapeSql(s.created_at)}) ON CONFLICT (id) DO NOTHING;`
    );
  }
  lines.push('');

  // Nodes (insert roots first, then children)
  const sortedNodes = [...payload.nodes].sort((a, b) => {
    if (!a.parent_id && b.parent_id) return -1;
    if (a.parent_id && !b.parent_id) return 1;
    return 0;
  });

  for (const n of sortedNodes) {
    lines.push(
      `INSERT INTO nodes (id, user_id, parent_id, type, name, sort_order, cover_url, space_id, created_at) VALUES (${escapeSql(n.id)}, ${escapeSql(n.user_id)}, ${escapeSql(n.parent_id)}, ${escapeSql(n.type)}, ${escapeSql(n.name)}, ${n.sort_order || 0}, ${escapeSql(n.cover_url || '')}, ${escapeSql(n.space_id || 'default')}, ${escapeSql(n.created_at)}) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, cover_url = EXCLUDED.cover_url;`
    );
  }
  lines.push('');

  // Tracks
  for (const t of payload.tracks) {
    lines.push(
      `INSERT INTO tracks (id, user_id, node_id, title, artist, album, year, format, catalog_no, barcode, mbid, isrc, length, bpm, key, sort_order, cover_url, created_at) VALUES (${t.id}, ${escapeSql(t.user_id)}, ${escapeSql(t.node_id)}, ${escapeSql(t.title)}, ${escapeSql(t.artist)}, ${escapeSql(t.album)}, ${t.year || 'NULL'}, ${escapeSql(t.format || '')}, ${escapeSql(t.catalog_no || '')}, ${escapeSql(t.barcode || '')}, ${escapeSql(t.mbid || '')}, ${escapeSql(t.isrc || '')}, ${t.length || 0}, ${t.bpm || 0}, ${escapeSql(t.key || '')}, ${t.sort_order || 0}, ${escapeSql(t.cover_url || '')}, ${escapeSql(t.created_at)}) ON CONFLICT (id) DO NOTHING;`
    );
  }
  lines.push('');

  // User Settings
  for (const s of payload.settings) {
    lines.push(
      `INSERT INTO user_settings (user_id, key, value) VALUES (${escapeSql(s.user_id)}, ${escapeSql(s.key)}, ${escapeSql(s.value)}) ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value;`
    );
  }
  lines.push('');

  lines.push(`COMMIT;`);
  return lines.join('\n');
}

// CLI direct execution
if (import.meta.main) {
  try {
    const dbPath = process.env.DB_PATH || 'data/fmsort.db';
    console.log(`[Export] Reading database from ${dbPath}...`);
    const payload = exportDatabaseToJson(dbPath);
    console.log(`[Export] Found ${payload.stats.nodesCount} nodes, ${payload.stats.tracksCount} tracks.`);

    mkdirSync('data/exports', { recursive: true });

    const jsonPath = 'data/exports/fmsort_export.json';
    writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf-8');
    console.log(`[Export] Wrote JSON dump to ${jsonPath}`);

    const sqlPath = 'data/exports/fmsort_postgres.sql';
    const sql = exportToPostgresSql(payload);
    writeFileSync(sqlPath, sql, 'utf-8');
    console.log(`[Export] Wrote Postgres SQL migration to ${sqlPath}`);

    console.log('[Export] Complete!');
  } catch (err) {
    console.error('[Export] Failed:', err);
    process.exit(1);
  }
}
