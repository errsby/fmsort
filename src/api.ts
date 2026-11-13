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

export async function createNode(data: {
  parent_id: string | null;
  type: string;
  name: string;
  sort_order?: number;
  cover_url?: string;
}): Promise<LibraryNode> {
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
  updates: { name?: string; type?: string; parent_id?: string | null; sort_order?: number; cover_url?: string }
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

export async function pasteItems(data: {
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
  const res = await fetch(`${API_BASE}/items/paste`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to paste items');
  return res.json();
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

export async function fetchDiscogsArtwork(
  query: string,
  type: 'artist' | 'release'
): Promise<{ cover_image: string; thumb: string }> {
  try {
    const res = await fetch(`${API_BASE}/discogs/artwork?q=${encodeURIComponent(query)}&type=${type}`);
    if (!res.ok) return { cover_image: '', thumb: '' };
    return res.json();
  } catch {
    return { cover_image: '', thumb: '' };
  }
}

export async function enrichTrackIsrc(
  trackId: number
): Promise<{ success: boolean; id: number; isrc: string; updated: boolean }> {
  const res = await fetch(`${API_BASE}/tracks/${trackId}/enrich-isrc`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to resolve ISRC');
  return res.json();
}

export async function enrichAllIsrcs(
  trackIds?: number[]
): Promise<{ success: boolean; totalProcessed: number; updatedCount: number; tree: LibraryNode[] }> {
  const res = await fetch(`${API_BASE}/tracks/enrich-isrc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(trackIds ? { trackIds } : {}),
  });
  if (!res.ok) throw new Error('Failed to batch enrich ISRCs');
  return res.json();
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

export interface SuggestedProject {
  id: number | string;
  source: 'deezer' | 'discogs' | 'musicbrainz';
  title: string;
  artist: string;
  year: number;
  release_date?: string;
  record_type: string;
  cover_url: string;
  thumb: string;
  track_count?: number;
}

export async function fetchArtistSuggestedProjects(artistName: string): Promise<SuggestedProject[]> {
  const res = await fetch(`${API_BASE}/artists/suggestions?name=${encodeURIComponent(artistName)}`);
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({ projects: [] }));
  return data.projects || [];
}

export interface ArtistSocialLink {
  platform: 'deezer' | 'spotify' | 'apple' | 'youtube' | 'discogs' | 'bandcamp' | 'soundcloud' | 'wikipedia' | 'official' | 'instagram' | 'twitter' | 'web';
  label: string;
  url: string;
}

export interface ArtistProfileData {
  name: string;
  bio?: string;
  description?: string;
  picture?: string;
  backdropUrl?: string;
  genres: string[];
  country?: string;
  yearsActive?: string;
  fanCount?: number;
  albumCount?: number;
  deezerId?: number;
  deezerUrl?: string;
  wikipediaUrl?: string;
  socials: ArtistSocialLink[];
}

export async function fetchArtistProfile(artistName: string): Promise<ArtistProfileData | null> {
  const res = await fetch(`${API_BASE}/artists/profile?name=${encodeURIComponent(artistName)}`);
  if (!res.ok) return null;
  return res.json().catch(() => null);
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

export type { UnifiedTrackSummary } from './types';
import type { UnifiedTrackSummary } from './types';

export async function importSingleTrack(data: {
  trackId?: number | string;
  title: string;
  artist: string;
  album: string;
  duration?: number;
  coverUrl?: string;
  isrc?: string;
  targetNodeId: string;
  createAlbumContainer?: boolean;
}): Promise<{ success: boolean; track: any; destNodeId: string; tree: LibraryNode[] }> {
  const res = await fetch(`${API_BASE}/tracks/import-single`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to import single track');
  }
  return res.json();
}

export async function importArtistDiscography(data: {
  artistNodeId?: string;
  artistNodeIds?: string[];
  artistName?: string;
}): Promise<{
  success: boolean;
  importedAlbums: number;
  importedTracks: number;
  artistsProcessed: number;
  tree: LibraryNode[];
}> {
  const res = await fetch(`${API_BASE}/artists/import-discography`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to import artist discography');
  }
  return res.json();
}

export async function fetchReleaseTracklist(
  source: 'deezer' | 'discogs' | 'musicbrainz',
  id: string | number
): Promise<UnifiedTrackSummary[]> {
  try {
    if (source === 'deezer') {
      const res = await fetch(`${API_BASE}/deezer/album/${id}`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.tracks || []).map((t: any, idx: number) => ({
        id: t.mbid ? t.mbid.replace('deezer-', '') : `${id}-${idx}`,
        title: t.title,
        artist: t.artist,
        album: t.album || data.title,
        duration: t.length || 0,
        cover: t.cover_url || data.cover_url || '',
        preview: t.preview || '',
        isrc: t.isrc && t.isrc !== '—' ? t.isrc : '',
        source: 'deezer' as const,
      }));
    } else if (source === 'discogs') {
      const res = await fetch(`${API_BASE}/discogs/release/${id}`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.tracks || []).map((t: any, idx: number) => ({
        id: `discogs-${id}-${idx}`,
        title: t.title,
        artist: t.artist || data.artist,
        album: t.album || data.title,
        duration: t.length || 0,
        cover: t.cover_url || data.thumb || '',
        preview: '',
        isrc: t.isrc && t.isrc !== '—' ? t.isrc : '',
        source: 'discogs' as const,
      }));
    }
    return [];
  } catch {
    return [];
  }
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

export interface ParsedTuneTrack {
  title: string;
  artist: string;
  album: string;
  isrc: string; // ONLY authentic 12-char ISRC, or ''
  deezerId?: string; // e.g. "3115569011"
  playlist?: string;
  type?: 'Track' | 'Artist' | 'Album' | 'Playlist';
}

export interface TuneImportResponse {
  success: boolean;
  totalParsed: number;
  importedTracks: number;
  artistsCount: number;
  albumsCount: number;
  matchedArtworks: number;
  matchedIsrcs: number;
  destNodeId: string;
  tree: LibraryNode[];
}

export async function parseTuneMyMusic(text: string): Promise<{ tracks: ParsedTuneTrack[]; total: number }> {
  console.log('[API] POST /api/import/tunemymusic/parse - sending', text.length, 'bytes');
  const t0 = performance.now();
  const res = await fetch(`${API_BASE}/import/tunemymusic/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('[API] /import/tunemymusic/parse failed:', err);
    throw new Error(err.error || 'Failed to parse Tune My Music CSV file');
  }
  const data = await res.json();
  console.log(`[API] /import/tunemymusic/parse returned ${data.tracks?.length || 0} tracks in ${(performance.now() - t0).toFixed(0)} ms`);
  return data;
}

export async function importTuneMyMusic(data: {
  text?: string;
  tracks?: ParsedTuneTrack[];
  targetNodeId?: string | null;
}): Promise<TuneImportResponse> {
  const trackCount = data.tracks?.length || 0;
  console.log(`[API] POST /api/import/tunemymusic - submitting ${trackCount} tracks to targetNodeId: ${data.targetNodeId || 'root'}`);
  const t0 = performance.now();
  const res = await fetch(`${API_BASE}/import/tunemymusic`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('[API] /import/tunemymusic error response:', err);
    throw new Error(err.error || 'Failed to import Tune My Music data');
  }
  const result: TuneImportResponse = await res.json();
  console.log(`[API] /import/tunemymusic completed in ${(performance.now() - t0).toFixed(0)} ms:`, {
    importedTracks: result.importedTracks,
    artistsCount: result.artistsCount,
    albumsCount: result.albumsCount,
    destNodeId: result.destNodeId,
  });
  return result;
}

export interface AppSettings {
  statusEnabled?: boolean;
  completionFolderIds?: string[];
  completedAlbumKeys: string[];
}

export async function fetchSettings(): Promise<AppSettings> {
  const res = await fetch(`${API_BASE}/settings`);
  if (!res.ok) {
    return { statusEnabled: false, completionFolderIds: [], completedAlbumKeys: [] };
  }
  return res.json();
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  const res = await fetch(`${API_BASE}/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) {
    throw new Error('Failed to save settings');
  }
  return res.json();
}

export async function toggleAlbumsCompleted(keys: string[], completed: boolean): Promise<{ success: boolean; completedAlbumKeys: string[] }> {
  const res = await fetch(`${API_BASE}/albums/toggle-completed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keys, completed }),
  });
  if (!res.ok) {
    throw new Error('Failed to update album completion status');
  }
  return res.json();
}
