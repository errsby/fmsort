import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { runMigrations } from './migrations/runner';

const DB_PATH = 'data/fmsort.db';

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH, { create: true });
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export interface TrackRecord {
  id: number;
  node_id: string;
  t: string;
  a: string;
  al: string;
  y: number;
  f: string;
  c: string;
  bc: string;
  mb: string;
  isrc: string;
  len: number;
  bpm: number;
  key: string;
  sort_order: number;
  cover_url?: string;
  created_at?: string;
}

export interface NodeRecord {
  id: string;
  parent_id: string | null;
  type: string;
  name: string;
  sort_order: number;
  cover_url?: string;
  children?: NodeRecord[];
  tracks?: TrackRecord[];
  created_at?: string;
}

export function initDb() {
  runMigrations(db);
}

function seedDefaultData() {
  const insertNode = db.prepare(`
    INSERT INTO nodes (id, parent_id, type, name, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertTrack = db.prepare(`
    INSERT INTO tracks (node_id, title, artist, album, year, format, catalog_no, barcode, mbid, isrc, length, bpm, key, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    // 1. Krautrock & Adjacent
    insertNode.run('f1', null, 'Folder', 'Krautrock & Adjacent', 0);
    insertNode.run('brain', 'f1', 'Label', 'Brain Records', 0);
    insertNode.run('neu', 'brain', 'Artist', 'Neu!', 0);
    insertNode.run('neu75', 'neu', 'Album', 'Neu! 75', 0);

    insertTrack.run('neu75', 'Isi', 'Neu!', 'Neu! 75', 1975, 'Vinyl LP', '1K 062-32 271', '4003099432712', 'a3f1c2d8-4b5e-4a10-9c11-0d2e7f6b1a01', 'DEBR07500011', 9 * 60 + 55, 128, 'D', 0);
    insertTrack.run('neu75', 'Seeland', 'Neu!', 'Neu! 75', 1975, 'Vinyl LP', '1K 062-32 271', '4003099432712', 'a3f1c2d8-4b5e-4a10-9c11-0d2e7f6b1a01', 'DEBR07500012', 4 * 60 + 37, 96, 'A', 1);
    insertTrack.run('neu75', 'Leb’ wohl', 'Neu!', 'Neu! 75', 1975, 'Vinyl LP', '1K 062-32 271', '4003099432712', 'a3f1c2d8-4b5e-4a10-9c11-0d2e7f6b1a01', 'DEBR07500013', 5 * 60 + 45, 72, 'F', 2);

    insertNode.run('clu', 'brain', 'Artist', 'Cluster', 1);
    insertNode.run('cl2', 'clu', 'Album', 'Zuckerzeit', 0);
    insertTrack.run('cl2', 'Rosa', 'Cluster', 'Zuckerzeit', 1974, 'Vinyl LP', 'Brain 1077', '4003099432774', 'b7e24a90-1c3d-4f55-8a2e-5d91c0e3f702', 'DEBR07400021', 5 * 60 + 40, 110, 'C', 0);
    insertTrack.run('cl2', 'Hollywood', 'Cluster', 'Zuckerzeit', 1974, 'Vinyl LP', 'Brain 1077', '4003099432774', 'b7e24a90-1c3d-4f55-8a2e-5d91c0e3f702', 'DEBR07400022', 5 * 60 + 12, 104, 'G', 1);

    // 2. Night Drives
    insertNode.run('p1', null, 'Playlist', 'Night Drives', 1);
    insertNode.run('e70', 'p1', 'Era', '1970s', 0);
    insertTrack.run('e70', 'Autobahn', 'Kraftwerk', 'Autobahn', 1974, 'Vinyl LP', '6305 231', '—', 'd2e04f16-88b3-4cf9-84a5-73b9f2ea1d04', 'DEPH07400041', 22 * 60 + 43, 120, 'D', 0);
    insertTrack.run('e70', 'Heroes', 'David Bowie', '"Heroes"', 1977, 'Vinyl LP', 'PL 12522', '—', 'e3f15a27-99c4-4da0-95b6-84cae3fb2e05', 'GBAYE7700051', 6 * 60 + 11, 112, 'E', 1);

    insertNode.run('e80', 'p1', 'Era', '1980s', 1);
    insertTrack.run('e80', 'Atmosphere', 'Joy Division', 'Closer', 1980, 'Vinyl LP', 'FACT 25', '5012093000253', 'f4a26b38-aad5-4eb1-a6c7-95dbf40c3f06', 'GBAAA8000061', 4 * 60 + 11, 138, 'Am', 0);
    insertTrack.run('e80', 'Blue Monday', 'New Order', 'Power, Corruption & Lies', 1983, '12" Single', 'FAC 73', '—', 'a5b37c49-bbe6-4fc2-b7d8-a6ec051d4a07', 'GBAAA8300071', 7 * 60 + 29, 130, 'F', 1);

    // 3. Dub
    insertNode.run('g1', null, 'Genre', 'Dub', 2);
    insertNode.run('p2', 'g1', 'Playlist', 'King Tubby Essentials', 0);
    insertNode.run('dubm', 'p2', 'Section', 'Dub Mixes', 0);
    insertTrack.run('dubm', 'Fat Man Dub', 'King Tubby', 'Dub From The Roots', 1974, 'Vinyl LP', 'SLP 001', '—', 'c1d93e05-77a2-4be8-b3f4-62a8e1d90c03', 'JMX017400031', 3 * 60 + 48, 0, '', 0);
    insertTrack.run('dubm', 'Dub Organiser', 'King Tubby', 'Dub From The Roots', 1974, 'Vinyl LP', 'SLP 001', '—', 'c1d93e05-77a2-4be8-b3f4-62a8e1d90c03', 'JMX017400032', 4 * 60 + 2, 0, '', 1);
  })();
}

export function getFullTree(): NodeRecord[] {
  const rawNodes = db.query(`
    SELECT id, parent_id, type, name, sort_order, cover_url
    FROM nodes
    ORDER BY sort_order ASC, name ASC
  `).all() as { id: string; parent_id: string | null; type: string; name: string; sort_order: number; cover_url?: string }[];

  const rawTracks = db.query(`
    SELECT id, node_id, title as t, artist as a, album as al, year as y,
           format as f, catalog_no as c, barcode as bc, mbid as mb, isrc,
           length as len, bpm, key, sort_order, cover_url
    FROM tracks
    ORDER BY sort_order ASC, id ASC
  `).all() as TrackRecord[];

  const tracksByNode = new Map<string, TrackRecord[]>();
  for (const track of rawTracks) {
    if (!tracksByNode.has(track.node_id)) {
      tracksByNode.set(track.node_id, []);
    }
    tracksByNode.get(track.node_id)!.push(track);
  }

  const nodeMap = new Map<string, NodeRecord>();
  for (const n of rawNodes) {
    nodeMap.set(n.id, {
      ...n,
      children: [],
      tracks: tracksByNode.get(n.id) || [],
    });
  }

  const rootNodes: NodeRecord[] = [];
  for (const n of rawNodes) {
    const nodeObj = nodeMap.get(n.id)!;
    if (n.parent_id && nodeMap.has(n.parent_id)) {
      nodeMap.get(n.parent_id)!.children!.push(nodeObj);
    } else {
      rootNodes.push(nodeObj);
    }
  }

  return rootNodes;
}

export function createNode(data: { id?: string; parent_id: string | null; type: string; name: string; sort_order?: number; cover_url?: string }): NodeRecord {
  const id = data.id || 'n_' + Math.random().toString(36).substring(2, 9);
  const sort_order = data.sort_order ?? 0;
  const cover_url = data.cover_url || '';
  
  db.prepare(`
    INSERT INTO nodes (id, parent_id, type, name, sort_order, cover_url)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, data.parent_id, data.type, data.name, sort_order, cover_url);

  return {
    id,
    parent_id: data.parent_id,
    type: data.type,
    name: data.name,
    sort_order,
    cover_url,
    children: [],
    tracks: [],
  };
}

export function updateNode(id: string, updates: Partial<{ name: string; type: string; parent_id: string | null; sort_order: number; cover_url: string }>) {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.type !== undefined) {
    fields.push('type = ?');
    values.push(updates.type);
  }
  if (updates.parent_id !== undefined) {
    fields.push('parent_id = ?');
    values.push(updates.parent_id);
  }
  if (updates.sort_order !== undefined) {
    fields.push('sort_order = ?');
    values.push(updates.sort_order);
  }
  if (updates.cover_url !== undefined) {
    fields.push('cover_url = ?');
    values.push(updates.cover_url);
  }

  if (fields.length === 0) return;
  values.push(id);

  db.prepare(`UPDATE nodes SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteNode(id: string) {
  // Cascades to child nodes and tracks automatically
  db.prepare('DELETE FROM nodes WHERE id = ?').run(id);
}

export function createTrack(data: {
  node_id: string;
  t: string;
  a: string;
  al: string;
  y?: number;
  f?: string;
  c?: string;
  bc?: string;
  mb?: string;
  isrc?: string;
  len?: number;
  bpm?: number;
  key?: string;
  sort_order?: number;
  cover_url?: string;
}): TrackRecord {
  const cover_url = data.cover_url || '';
  const result = db.prepare(`
    INSERT INTO tracks (node_id, title, artist, album, year, format, catalog_no, barcode, mbid, isrc, length, bpm, key, sort_order, cover_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.node_id,
    data.t,
    data.a,
    data.al,
    data.y ?? 0,
    data.f ?? '',
    data.c ?? '',
    data.bc ?? '',
    data.mb ?? '',
    data.isrc ?? '',
    data.len ?? 0,
    data.bpm ?? 0,
    data.key ?? '',
    data.sort_order ?? 0,
    cover_url
  );

  const trackId = Number(result.lastInsertRowid);
  return {
    id: trackId,
    node_id: data.node_id,
    t: data.t,
    a: data.a,
    al: data.al,
    y: data.y ?? 0,
    f: data.f ?? '',
    c: data.c ?? '',
    bc: data.bc ?? '',
    mb: data.mb ?? '',
    isrc: data.isrc ?? '',
    len: data.len ?? 0,
    bpm: data.bpm ?? 0,
    key: data.key ?? '',
    sort_order: data.sort_order ?? 0,
    cover_url,
  };
}

export function updateTrack(id: number, updates: Partial<{
  title: string;
  artist: string;
  album: string;
  year: number;
  format: string;
  catalog_no: string;
  barcode: string;
  mbid: string;
  isrc: string;
  length: number;
  bpm: number;
  key: string;
  node_id: string;
  sort_order: number;
  cover_url: string;
}>) {
  const fields: string[] = [];
  const values: any[] = [];

  const map: Record<string, string> = {
    title: 'title',
    artist: 'artist',
    album: 'album',
    year: 'year',
    format: 'format',
    catalog_no: 'catalog_no',
    barcode: 'barcode',
    mbid: 'mbid',
    isrc: 'isrc',
    length: 'length',
    bpm: 'bpm',
    key: 'key',
    node_id: 'node_id',
    sort_order: 'sort_order',
    cover_url: 'cover_url',
  };

  for (const [key, dbCol] of Object.entries(map)) {
    if ((updates as any)[key] !== undefined) {
      fields.push(`${dbCol} = ?`);
      values.push((updates as any)[key]);
    }
  }

  if (fields.length === 0) return;
  values.push(id);

  db.prepare(`UPDATE tracks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function getAllTracks(): TrackRecord[] {
  return db.prepare(`
    SELECT id, node_id, title, artist, album, year, format, catalog_no, barcode, mbid, isrc, length, bpm, key, sort_order, cover_url
    FROM tracks
    ORDER BY id ASC
  `).all() as TrackRecord[];
}

export function getTrackById(id: number): TrackRecord | null {
  const row = db.prepare(`
    SELECT id, node_id, title, artist, album, year, format, catalog_no, barcode, mbid, isrc, length, bpm, key, sort_order, cover_url
    FROM tracks
    WHERE id = ?
  `).get(id) as TrackRecord | undefined;
  return row || null;
}

export function deleteTrack(id: number) {
  db.prepare('DELETE FROM tracks WHERE id = ?').run(id);
}

export function deleteTracksBatch(ids: number[]) {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`DELETE FROM tracks WHERE id IN (${placeholders})`).run(...ids);
}

export function moveTracksBatch(ids: number[], targetNodeId: string) {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`UPDATE tracks SET node_id = ? WHERE id IN (${placeholders})`).run(targetNodeId, ...ids);
}

export function pasteItems(data: {
  targetNodeId: string;
  trackIds?: number[];
  nodeIds?: string[];
  operation: 'copy' | 'cut';
}): {
  createdTracksCount: number;
  createdNodesCount: number;
  movedCount: number;
  newTrackIds: number[];
  newNodeIds: string[];
} {
  const { targetNodeId, trackIds = [], nodeIds = [], operation } = data;
  let createdTracksCount = 0;
  let createdNodesCount = 0;
  let movedCount = 0;
  const newTrackIds: number[] = [];
  const newNodeIds: string[] = [];

  db.transaction(() => {
    // 1. Cut operation: move tracks and reparent nodes
    if (operation === 'cut') {
      if (trackIds.length > 0) {
        moveTracksBatch(trackIds, targetNodeId);
        movedCount += trackIds.length;
        newTrackIds.push(...trackIds);
      }
      if (nodeIds.length > 0) {
        for (const id of nodeIds) {
          if (id !== targetNodeId) {
            updateNode(id, { parent_id: targetNodeId });
            movedCount++;
            newNodeIds.push(id);
          }
        }
      }
      return;
    }

    // 2. Copy operation: duplicate tracks into targetNodeId
    if (trackIds.length > 0) {
      const copyTrackStmt = db.prepare(`
        INSERT INTO tracks (node_id, title, artist, album, year, format, catalog_no, barcode, mbid, isrc, length, bpm, key, sort_order, cover_url)
        SELECT ?, title, artist, album, year, format, catalog_no, barcode, mbid, isrc, length, bpm, key, sort_order, cover_url
        FROM tracks WHERE id = ?
      `);
      for (const id of trackIds) {
        const info = copyTrackStmt.run(targetNodeId, id);
        createdTracksCount++;
        if (info.lastInsertRowid) {
          newTrackIds.push(Number(info.lastInsertRowid));
        }
      }
    }

    // 3. Copy operation: recursively duplicate nodes into targetNodeId
    if (nodeIds.length > 0) {
      const cloneNodeRecursive = (sourceId: string, parentTargetId: string, isTopLevel = false) => {
        const sourceNode = db.prepare('SELECT * FROM nodes WHERE id = ?').get(sourceId) as any;
        if (!sourceNode) return;

        const isSameParent = sourceNode.parent_id === parentTargetId;
        const newName = isSameParent ? `${sourceNode.name} (Copy)` : sourceNode.name;

        const newNode = createNode({
          parent_id: parentTargetId,
          type: sourceNode.type,
          name: newName,
          cover_url: sourceNode.cover_url || '',
          sort_order: sourceNode.sort_order || 0,
        });
        createdNodesCount++;
        if (isTopLevel) {
          newNodeIds.push(newNode.id);
        }

        // Duplicate tracks in this source node into newNode.id
        const tracksInNode = db.prepare('SELECT id FROM tracks WHERE node_id = ?').all(sourceId) as { id: number }[];
        const copyTrackStmt = db.prepare(`
          INSERT INTO tracks (node_id, title, artist, album, year, format, catalog_no, barcode, mbid, isrc, length, bpm, key, sort_order, cover_url)
          SELECT ?, title, artist, album, year, format, catalog_no, barcode, mbid, isrc, length, bpm, key, sort_order, cover_url
          FROM tracks WHERE id = ?
        `);
        for (const tr of tracksInNode) {
          copyTrackStmt.run(newNode.id, tr.id);
          createdTracksCount++;
        }

        // Recursively duplicate child nodes
        const childNodes = db.prepare('SELECT id FROM nodes WHERE parent_id = ?').all(sourceId) as { id: string }[];
        for (const child of childNodes) {
          cloneNodeRecursive(child.id, newNode.id, false);
        }
      };

      for (const id of nodeIds) {
        if (id !== targetNodeId) {
          cloneNodeRecursive(id, targetNodeId, true);
        }
      }
    }
  })();

  return { createdTracksCount, createdNodesCount, movedCount, newTrackIds, newNodeIds };
}

export function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : null;
}
(globalThis as any).__fmsort_getSetting = getSetting;

export function setSetting(key: string, value: string): void {
  db.prepare(`
    INSERT INTO settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

export function exportLibrary() {
  const nodes = db.query('SELECT * FROM nodes').all();
  const tracks = db.query('SELECT * FROM tracks').all();
  return { version: 1, exported_at: new Date().toISOString(), nodes, tracks };
}

export function importLibrary(data: { nodes: any[]; tracks: any[] }) {
  db.transaction(() => {
    db.exec('DELETE FROM tracks;');
    db.exec('DELETE FROM nodes;');

    const insertNode = db.prepare(`
      INSERT INTO nodes (id, parent_id, type, name, sort_order, cover_url)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const n of data.nodes) {
      insertNode.run(n.id, n.parent_id, n.type, n.name, n.sort_order ?? 0, n.cover_url || '');
    }

    const insertTrack = db.prepare(`
      INSERT INTO tracks (id, node_id, title, artist, album, year, format, catalog_no, barcode, mbid, isrc, length, bpm, key, sort_order, cover_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const t of data.tracks) {
      insertTrack.run(
        t.id,
        t.node_id,
        t.title || t.t,
        t.artist || t.a,
        t.album || t.al,
        t.year || t.y || 0,
        t.format || t.f || '',
        t.catalog_no || t.c || '',
        t.barcode || t.bc || '',
        t.mbid || t.mb || '',
        t.isrc || '',
        t.length || t.len || 0,
        t.bpm || 0,
        t.key || '',
        t.sort_order || 0,
        t.cover_url || ''
      );
    }
  })();
}
