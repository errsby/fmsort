import type { LibraryNode, Track } from '../types';
import { DEFAULT_SEED_DATA } from './defaultSeed';

const DB_NAME = 'fmsort_library_db';
const DB_VERSION = 1;

interface StoredNode {
  id: string;
  parent_id: string | null;
  type: string;
  name: string;
  sort_order: number;
  cover_url?: string;
  created_at?: string;
}

interface StoredTrack {
  id: number;
  node_id: string;
  title: string;
  artist: string;
  album: string;
  year?: number;
  format?: string;
  catalog_no?: string;
  barcode?: string;
  mbid?: string;
  isrc?: string;
  length?: number;
  bpm?: number;
  key?: string;
  sort_order?: number;
  cover_url?: string;
  created_at?: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('IndexedDB not supported in non-browser environment'));
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('nodes')) {
          const nodeStore = db.createObjectStore('nodes', { keyPath: 'id' });
          nodeStore.createIndex('parent_id', 'parent_id', { unique: false });
        }
        if (!db.objectStoreNames.contains('tracks')) {
          const trackStore = db.createObjectStore('tracks', { keyPath: 'id' });
          trackStore.createIndex('node_id', 'node_id', { unique: false });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

interface StorageTxStores {
  nodes: IDBObjectStore;
  tracks: IDBObjectStore;
  settings: IDBObjectStore;
  [key: string]: IDBObjectStore;
}

async function runTx<T>(
  storeNames: string | string[],
  mode: IDBTransactionMode,
  callback: (stores: StorageTxStores) => Promise<T> | T
): Promise<T> {
  const db = await getDb();
  const tx = db.transaction(storeNames, mode);
  const names = Array.isArray(storeNames) ? storeNames : [storeNames];
  const stores = {} as StorageTxStores;
  for (const name of names) {
    stores[name] = tx.objectStore(name);
  }

  return new Promise<T>((resolve, reject) => {
    let result: T;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);

    Promise.resolve(callback(stores))
      .then((res) => {
        result = res;
      })
      .catch((err) => {
        tx.abort();
        reject(err);
      });
  });
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Convert StoredTrack to App Track model
function mapStoredTrack(st: StoredTrack): Track {
  return {
    id: st.id,
    node_id: st.node_id,
    t: st.title,
    a: st.artist,
    al: st.album,
    y: st.year || 0,
    f: st.format || 'Digital',
    c: st.catalog_no || '—',
    bc: st.barcode || '—',
    mb: st.mbid || '',
    isrc: st.isrc || '',
    len: st.length || 0,
    bpm: st.bpm || 0,
    key: st.key || '',
    sort_order: st.sort_order || 0,
    cover_url: st.cover_url || '',
  };
}

// Seed Initial Library if Empty
async function ensureSeedData() {
  const nodeCount = await runTx('nodes', 'readonly', (stores) => reqToPromise(stores.nodes.count()));
  if (nodeCount > 0) return;

  await runTx(['nodes', 'tracks', 'settings'], 'readwrite', async (stores) => {
    for (const n of DEFAULT_SEED_DATA.nodes) {
      stores.nodes.put(n);
    }
    for (const t of DEFAULT_SEED_DATA.tracks) {
      stores.tracks.put({
        id: t.id,
        node_id: t.node_id,
        title: t.t,
        artist: t.a,
        album: t.al,
        year: t.y,
        format: t.f,
        catalog_no: t.c,
        barcode: t.bc,
        mbid: t.mb,
        isrc: t.isrc,
        length: t.len,
        bpm: t.bpm,
        key: t.key,
        sort_order: t.sort_order,
        cover_url: t.cover_url,
      });
    }
    stores.settings.put({ key: 'status_enabled', value: 'false' });
    stores.settings.put({ key: 'completion_folder_ids', value: '[]' });
    stores.settings.put({ key: 'completed_album_keys', value: '[]' });
  });
}

// Public Storage Adapter Operations

export async function clientFetchTree(): Promise<LibraryNode[]> {
  await ensureSeedData();

  const [rawNodes, rawTracks] = await runTx(['nodes', 'tracks'], 'readonly', async (stores) => {
    const nodes = await reqToPromise(stores.nodes.getAll());
    const tracks = await reqToPromise(stores.tracks.getAll());
    return [nodes as StoredNode[], tracks as StoredTrack[]];
  });

  const tracksByNode = new Map<string, Track[]>();
  for (const st of rawTracks) {
    if (!tracksByNode.has(st.node_id)) {
      tracksByNode.set(st.node_id, []);
    }
    tracksByNode.get(st.node_id)!.push(mapStoredTrack(st));
  }

  for (const list of tracksByNode.values()) {
    list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }

  const nodeMap = new Map<string, LibraryNode>();
  for (const n of rawNodes) {
    nodeMap.set(n.id, {
      id: n.id,
      parent_id: n.parent_id,
      type: n.type,
      name: n.name,
      sort_order: n.sort_order,
      cover_url: n.cover_url,
      children: [],
      tracks: tracksByNode.get(n.id) || [],
    });
  }

  const rootNodes: LibraryNode[] = [];
  for (const n of rawNodes) {
    const nodeObj = nodeMap.get(n.id)!;
    if (n.parent_id && nodeMap.has(n.parent_id)) {
      nodeMap.get(n.parent_id)!.children.push(nodeObj);
    } else {
      rootNodes.push(nodeObj);
    }
  }

  const sortRecursive = (list: LibraryNode[]) => {
    list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name));
    for (const item of list) {
      if (item.children && item.children.length > 0) {
        sortRecursive(item.children);
      }
    }
  };

  sortRecursive(rootNodes);
  return rootNodes;
}

export async function clientCreateNode(data: {
  parent_id: string | null;
  type: string;
  name: string;
  sort_order?: number;
  cover_url?: string;
}): Promise<LibraryNode> {
  const id = 'n_' + Math.random().toString(36).substring(2, 9);
  const newNode: StoredNode = {
    id,
    parent_id: data.parent_id,
    type: data.type,
    name: data.name,
    sort_order: data.sort_order ?? 0,
    cover_url: data.cover_url || '',
    created_at: new Date().toISOString(),
  };

  await runTx('nodes', 'readwrite', (stores) => stores.nodes.put(newNode));

  return {
    id,
    parent_id: data.parent_id,
    type: data.type,
    name: data.name,
    sort_order: data.sort_order ?? 0,
    cover_url: data.cover_url,
    children: [],
    tracks: [],
  };
}

export async function clientUpdateNode(
  id: string,
  updates: { name?: string; type?: string; parent_id?: string | null; sort_order?: number; cover_url?: string }
): Promise<void> {
  await runTx('nodes', 'readwrite', async (stores) => {
    const existing = (await reqToPromise(stores.nodes.get(id))) as StoredNode | undefined;
    if (!existing) return;

    if (updates.name !== undefined) existing.name = updates.name;
    if (updates.type !== undefined) existing.type = updates.type;
    if (updates.parent_id !== undefined) existing.parent_id = updates.parent_id;
    if (updates.sort_order !== undefined) existing.sort_order = updates.sort_order;
    if (updates.cover_url !== undefined) existing.cover_url = updates.cover_url;

    stores.nodes.put(existing);
  });
}

export async function clientDeleteNode(id: string): Promise<void> {
  const allNodes = (await runTx('nodes', 'readonly', (stores) => reqToPromise(stores.nodes.getAll()))) as StoredNode[];

  // Collect descendants
  const toDelete = new Set<string>([id]);
  let added = true;
  while (added) {
    added = false;
    for (const n of allNodes) {
      if (n.parent_id && toDelete.has(n.parent_id) && !toDelete.has(n.id)) {
        toDelete.add(n.id);
        added = true;
      }
    }
  }

  await runTx(['nodes', 'tracks'], 'readwrite', async (stores) => {
    // Delete nodes
    for (const nid of toDelete) {
      stores.nodes.delete(nid);
    }
    // Delete associated tracks
    const allTracks = (await reqToPromise(stores.tracks.getAll())) as StoredTrack[];
    for (const t of allTracks) {
      if (toDelete.has(t.node_id)) {
        stores.tracks.delete(t.id);
      }
    }
  });
}

export async function clientCreateTrack(nodeId: string, track: Partial<Track>): Promise<Track> {
  const allTracks = (await runTx('tracks', 'readonly', (stores) => reqToPromise(stores.tracks.getAll()))) as StoredTrack[];
  const maxId = allTracks.reduce((max, t) => Math.max(max, t.id), 1000);
  const newId = maxId + 1;

  const newStored: StoredTrack = {
    id: newId,
    node_id: nodeId,
    title: track.t || 'Untitled Track',
    artist: track.a || 'Unknown Artist',
    album: track.al || 'Untitled Album',
    year: track.y || undefined,
    format: track.f || 'Digital',
    catalog_no: track.c || '—',
    barcode: track.bc || '—',
    mbid: track.mb || '',
    isrc: track.isrc || '',
    length: track.len || 0,
    bpm: track.bpm || 0,
    key: track.key || '',
    sort_order: track.sort_order ?? allTracks.filter((t) => t.node_id === nodeId).length,
    cover_url: track.cover_url || '',
    created_at: new Date().toISOString(),
  };

  await runTx('tracks', 'readwrite', (stores) => stores.tracks.put(newStored));
  return mapStoredTrack(newStored);
}

export async function clientUpdateTrack(id: number, track: Partial<Track>): Promise<void> {
  await runTx('tracks', 'readwrite', async (stores) => {
    const existing = (await reqToPromise(stores.tracks.get(id))) as StoredTrack | undefined;
    if (!existing) return;

    if (track.t !== undefined) existing.title = track.t;
    if (track.a !== undefined) existing.artist = track.a;
    if (track.al !== undefined) existing.album = track.al;
    if (track.y !== undefined) existing.year = track.y;
    if (track.f !== undefined) existing.format = track.f;
    if (track.c !== undefined) existing.catalog_no = track.c;
    if (track.bc !== undefined) existing.barcode = track.bc;
    if (track.mb !== undefined) existing.mbid = track.mb;
    if (track.isrc !== undefined) existing.isrc = track.isrc;
    if (track.len !== undefined) existing.length = track.len;
    if (track.bpm !== undefined) existing.bpm = track.bpm;
    if (track.key !== undefined) existing.key = track.key;
    if (track.node_id !== undefined) existing.node_id = track.node_id;
    if (track.sort_order !== undefined) existing.sort_order = track.sort_order;
    if (track.cover_url !== undefined) existing.cover_url = track.cover_url;

    stores.tracks.put(existing);
  });
}

export async function clientDeleteTrack(id: number): Promise<void> {
  await runTx('tracks', 'readwrite', (stores) => stores.tracks.delete(id));
}

export async function clientDeleteTracksBatch(ids: number[]): Promise<void> {
  await runTx('tracks', 'readwrite', (stores) => {
    for (const id of ids) {
      stores.tracks.delete(id);
    }
  });
}

export async function clientMoveTracksBatch(ids: number[], targetNodeId: string): Promise<void> {
  await runTx('tracks', 'readwrite', async (stores) => {
    for (const id of ids) {
      const track = (await reqToPromise(stores.tracks.get(id))) as StoredTrack | undefined;
      if (track) {
        track.node_id = targetNodeId;
        stores.tracks.put(track);
      }
    }
  });
}

export async function clientPasteItems(data: {
  targetNodeId: string;
  trackIds?: number[];
  nodeIds?: string[];
  operation: 'copy' | 'cut';
}): Promise<{
  success: boolean;
  createdTracksCount: number;
  createdNodesCount: number;
  movedCount: number;
  newTrackIds?: number[];
  newNodeIds?: string[];
}> {
  const { targetNodeId, trackIds = [], nodeIds = [], operation } = data;

  if (operation === 'cut') {
    await runTx(['nodes', 'tracks'], 'readwrite', async (stores) => {
      // Reparent cut nodes
      for (const nid of nodeIds) {
        const node = (await reqToPromise(stores.nodes.get(nid))) as StoredNode | undefined;
        if (node) {
          node.parent_id = targetNodeId;
          stores.nodes.put(node);
        }
      }
      // Move cut tracks
      for (const tid of trackIds) {
        const track = (await reqToPromise(stores.tracks.get(tid))) as StoredTrack | undefined;
        if (track) {
          track.node_id = targetNodeId;
          stores.tracks.put(track);
        }
      }
    });

    return {
      success: true,
      createdTracksCount: 0,
      createdNodesCount: 0,
      movedCount: trackIds.length + nodeIds.length,
    };
  }

  // Operation is 'copy': deep clone nodes & duplicate tracks
  let createdTracksCount = 0;
  let createdNodesCount = 0;
  const newTrackIds: number[] = [];
  const newNodeIds: string[] = [];

  await runTx(['nodes', 'tracks'], 'readwrite', async (stores) => {
    const allTracks = (await reqToPromise(stores.tracks.getAll())) as StoredTrack[];
    let nextTrackId = allTracks.reduce((max, t) => Math.max(max, t.id), 1000) + 1;

    // Clone tracks directly
    for (const tid of trackIds) {
      const orig = (await reqToPromise(stores.tracks.get(tid))) as StoredTrack | undefined;
      if (orig) {
        const cloneId = nextTrackId++;
        const cloned: StoredTrack = {
          ...orig,
          id: cloneId,
          node_id: targetNodeId,
        };
        stores.tracks.put(cloned);
        newTrackIds.push(cloneId);
        createdTracksCount++;
      }
    }

    // Clone nodes recursively
    const allNodes = (await reqToPromise(stores.nodes.getAll())) as StoredNode[];
    const cloneNodeRecursive = async (sourceId: string, parentId: string) => {
      const source = allNodes.find((n) => n.id === sourceId);
      if (!source) return;

      const newId = 'n_' + Math.random().toString(36).substring(2, 9);
      const clonedNode: StoredNode = {
        ...source,
        id: newId,
        parent_id: parentId,
        name: `${source.name} (Copy)`,
      };
      stores.nodes.put(clonedNode);
      newNodeIds.push(newId);
      createdNodesCount++;

      // Clone node's direct tracks
      const nodeTracks = allTracks.filter((t) => t.node_id === sourceId);
      for (const t of nodeTracks) {
        const cloneId = nextTrackId++;
        stores.tracks.put({
          ...t,
          id: cloneId,
          node_id: newId,
        });
        createdTracksCount++;
      }

      // Clone children
      const children = allNodes.filter((n) => n.parent_id === sourceId);
      for (const child of children) {
        await cloneNodeRecursive(child.id, newId);
      }
    };

    for (const nid of nodeIds) {
      await cloneNodeRecursive(nid, targetNodeId);
    }
  });

  return {
    success: true,
    createdTracksCount,
    createdNodesCount,
    movedCount: 0,
    newTrackIds,
    newNodeIds,
  };
}

// Settings & Album Completion
export async function clientFetchSettings(): Promise<{
  statusEnabled: boolean;
  completionFolderIds: string[];
  completedAlbumKeys: string[];
}> {
  await ensureSeedData();

  const settings = await runTx('settings', 'readonly', async (stores) => {
    const sEnabled = (await reqToPromise(stores.settings.get('status_enabled'))) as { value: string } | undefined;
    const fIds = (await reqToPromise(stores.settings.get('completion_folder_ids'))) as { value: string } | undefined;
    const aKeys = (await reqToPromise(stores.settings.get('completed_album_keys'))) as { value: string } | undefined;

    return {
      statusEnabled: sEnabled ? sEnabled.value === 'true' : false,
      completionFolderIds: fIds ? JSON.parse(fIds.value || '[]') : [],
      completedAlbumKeys: aKeys ? JSON.parse(aKeys.value || '[]') : [],
    };
  });

  return settings;
}

export async function clientSaveSettings(updates: {
  statusEnabled?: boolean;
  completionFolderIds?: string[];
  completedAlbumKeys?: string[];
}): Promise<{
  statusEnabled: boolean;
  completionFolderIds: string[];
  completedAlbumKeys: string[];
}> {
  await runTx('settings', 'readwrite', (stores) => {
    if (updates.statusEnabled !== undefined) {
      stores.settings.put({ key: 'status_enabled', value: String(updates.statusEnabled) });
    }
    if (updates.completionFolderIds !== undefined) {
      stores.settings.put({ key: 'completion_folder_ids', value: JSON.stringify(updates.completionFolderIds) });
    }
    if (updates.completedAlbumKeys !== undefined) {
      stores.settings.put({ key: 'completed_album_keys', value: JSON.stringify(updates.completedAlbumKeys) });
    }
  });

  return clientFetchSettings();
}

export async function clientToggleAlbumsCompleted(
  keys: string[],
  completed: boolean
): Promise<{ success: boolean; completedAlbumKeys: string[] }> {
  const current = await clientFetchSettings();
  const keySet = new Set(current.completedAlbumKeys);

  for (const k of keys) {
    if (completed) keySet.add(k);
    else keySet.delete(k);
  }

  const updated = Array.from(keySet);
  await clientSaveSettings({ completedAlbumKeys: updated });
  return { success: true, completedAlbumKeys: updated };
}

// Backup Export & Import
export async function clientExportLibrary(): Promise<any> {
  const [nodes, tracks, settings] = await runTx(['nodes', 'tracks', 'settings'], 'readonly', async (stores) => {
    const n = await reqToPromise(stores.nodes.getAll());
    const t = await reqToPromise(stores.tracks.getAll());
    const s = await reqToPromise(stores.settings.getAll());
    return [n, t, s];
  });

  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    nodes,
    tracks,
    settings,
  };
}

export async function clientImportLibrary(data: any): Promise<{ tree: LibraryNode[] }> {
  if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.tracks)) {
    throw new Error('Invalid library backup file format');
  }

  await runTx(['nodes', 'tracks', 'settings'], 'readwrite', async (stores) => {
    stores.nodes.clear();
    stores.tracks.clear();
    stores.settings.clear();

    for (const n of data.nodes) {
      stores.nodes.put(n);
    }
    for (const t of data.tracks) {
      stores.tracks.put(t);
    }
    if (Array.isArray(data.settings)) {
      for (const s of data.settings) {
        stores.settings.put(s);
      }
    }
  });

  const tree = await clientFetchTree();
  return { tree };
}
