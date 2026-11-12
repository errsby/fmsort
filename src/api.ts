import type {
  LibraryNode,
  Track,
  MbReleaseSummary,
  DiscogsReleaseSummary,
  DiscogsStatus,
  HybridSearchResponse,
  UnifiedReleaseSummary,
  UnifiedArtistSummary,
} from './types';

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

export async function searchHybrid(query: string): Promise<HybridSearchResponse> {
  const res = await fetch(`${API_BASE}/search/hybrid?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error('Failed to perform hybrid search');
  return res.json();
}

export async function streamHybridSearch(
  query: string,
  onUpdate: (data: HybridSearchResponse) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${API_BASE}/search/stream?q=${encodeURIComponent(query)}`, {
    signal,
    headers: { 'Accept': 'text/event-stream' },
  });

  if (!res.ok) {
    throw new Error('Streaming search failed');
  }

  if (!res.body) {
    const data = await res.json();
    onUpdate({ ...data, discogsLoading: false });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() || '';

      for (const chunk of chunks) {
        if (!chunk.trim()) continue;
        const lines = chunk.split('\n');
        let event = '';
        let dataStr = '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            event = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataStr = line.slice(5).trim();
          }
        }

        if (dataStr) {
          try {
            const parsed = JSON.parse(dataStr);
            if (event === 'fast' || event === 'discogs') {
              onUpdate(parsed);
            }
          } catch {}
        }
      }
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      // Ignored: aborted on new keystroke
      return;
    }
    throw err;
  }
}

export async function importUniversalRelease(
  source: 'discogs' | 'deezer' | 'musicbrainz',
  releaseId: string | number,
  targetNodeId: string,
  createAlbumContainer = true,
  coverUrl?: string
): Promise<{ destNodeId: string; tree: LibraryNode[] }> {
  const res = await fetch(`${API_BASE}/releases/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, releaseId, targetNodeId, createAlbumContainer, coverUrl }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to import release');
  }
  return res.json();
}

export async function importArtistContainer(
  name: string,
  targetNodeId: string,
  thumb?: string
): Promise<{ destNodeId: string; tree: LibraryNode[] }> {
  const res = await fetch(`${API_BASE}/artists/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, targetNodeId, thumb }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create artist container');
  }
  return res.json();
}

export async function fetchDiscogsStatus(): Promise<DiscogsStatus> {
  const res = await fetch(`${API_BASE}/discogs/status`);
  if (!res.ok) throw new Error('Failed to fetch Discogs status');
  return res.json();
}

export async function saveDiscogsToken(token: string): Promise<void> {
  const res = await fetch(`${API_BASE}/discogs/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to save Discogs token');
  }
}

export async function searchDiscogs(query: string): Promise<DiscogsReleaseSummary[]> {
  const res = await fetch(`${API_BASE}/discogs/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 401) {
      throw new Error('NO_TOKEN');
    }
    throw new Error(err.error || 'Failed to search Discogs');
  }
  return res.json();
}

export async function importDiscogsRelease(
  releaseId: number,
  targetNodeId: string,
  createAlbumContainer = true
): Promise<{ destNodeId: string; tree: LibraryNode[] }> {
  const res = await fetch(`${API_BASE}/discogs/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ releaseId, targetNodeId, createAlbumContainer }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to import Discogs release');
  }
  return res.json();
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
