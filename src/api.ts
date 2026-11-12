import type { LibraryNode, Track, MbReleaseSummary } from './types';

const API_BASE = '/api';

export async function fetchTree(): Promise<LibraryNode[]> {
  const res = await fetch(`${API_BASE}/tree`);
  if (!res.ok) throw new Error('Failed to load library tree');
  return res.json();
}

export async function createNode(data: { parent_id: string | null; type: string; name: string }): Promise<LibraryNode> {
  const res = await fetch(`${API_BASE}/nodes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create container');
  return res.json();
}

export async function updateNode(
  id: string,
  updates: { name?: string; type?: string; parent_id?: string | null; sort_order?: number }
): Promise<void> {
  const res = await fetch(`${API_BASE}/nodes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to update container');
}

export async function deleteNode(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/nodes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete container');
}

export async function createTrack(nodeId: string, track: Partial<Track>): Promise<Track> {
  const res = await fetch(`${API_BASE}/nodes/${encodeURIComponent(nodeId)}/tracks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(track),
  });
  if (!res.ok) throw new Error('Failed to create track');
  return res.json();
}

export async function updateTrack(id: number, track: Partial<Track>): Promise<void> {
  const res = await fetch(`${API_BASE}/tracks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: track.t,
      artist: track.a,
      album: track.al,
      year: track.y,
      format: track.f,
      catalog_no: track.c,
      barcode: track.bc,
      mbid: track.mb,
      isrc: track.isrc,
      length: track.len,
      bpm: track.bpm,
      key: track.key,
      node_id: track.node_id,
      sort_order: track.sort_order,
    }),
  });
  if (!res.ok) throw new Error('Failed to update track');
}

export async function deleteTrack(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/tracks/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete track');
}

export async function deleteTracksBatch(ids: number[]): Promise<void> {
  const res = await fetch(`${API_BASE}/tracks/batch-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error('Failed to delete tracks');
}

export async function moveTracksBatch(ids: number[], targetNodeId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/tracks/batch-move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, targetNodeId }),
  });
  if (!res.ok) throw new Error('Failed to move tracks');
}

export async function searchMusicBrainz(query: string): Promise<MbReleaseSummary[]> {
  const res = await fetch(`${API_BASE}/musicbrainz/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error('Failed to search MusicBrainz');
  return res.json();
}

export async function importMusicBrainzRelease(
  mbid: string,
  targetNodeId: string,
  createAlbumContainer = true
): Promise<{ destNodeId: string; tree: LibraryNode[] }> {
  const res = await fetch(`${API_BASE}/musicbrainz/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mbid, targetNodeId, createAlbumContainer }),
  });
  if (!res.ok) throw new Error('Failed to import release');
  return res.json();
}

export async function exportLibrary(): Promise<any> {
  const res = await fetch(`${API_BASE}/export`);
  if (!res.ok) throw new Error('Failed to export library');
  return res.json();
}

export async function importLibrary(data: any): Promise<{ tree: LibraryNode[] }> {
  const res = await fetch(`${API_BASE}/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to restore library');
  return res.json();
}
