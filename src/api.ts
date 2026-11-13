import type {
  LibraryNode,
  Track,
  MbReleaseSummary,
  DiscogsReleaseSummary,
  DiscogsStatus,
  HybridSearchResponse,
  UnifiedReleaseSummary,
  UnifiedArtistSummary,
  UnifiedTrackSummary,
} from './types';

import {
  clientFetchTree,
  clientCreateNode,
  clientUpdateNode,
  clientDeleteNode,
  clientCreateTrack,
  clientUpdateTrack,
  clientDeleteTrack,
  clientDeleteTracksBatch,
  clientMoveTracksBatch,
  clientPasteItems,
  clientFetchSettings,
  clientSaveSettings,
  clientToggleAlbumsCompleted,
  clientExportLibrary,
  clientImportLibrary,
} from './storage/clientStorage';

const API_BASE = '/api';

// ==========================================
// 1. Client-Side CRUD (IndexedDB / Storage)
// ==========================================

export async function fetchTree(): Promise<LibraryNode[]> {
  return clientFetchTree();
}

export async function createNode(data: {
  parent_id: string | null;
  type: string;
  name: string;
  sort_order?: number;
  cover_url?: string;
}): Promise<LibraryNode> {
  return clientCreateNode(data);
}

export async function updateNode(
  id: string,
  updates: { name?: string; type?: string; parent_id?: string | null; sort_order?: number; cover_url?: string }
): Promise<void> {
  return clientUpdateNode(id, updates);
}

export async function deleteNode(id: string): Promise<void> {
  return clientDeleteNode(id);
}

export async function createTrack(nodeId: string, track: Partial<Track>): Promise<Track> {
  return clientCreateTrack(nodeId, track);
}

export async function updateTrack(id: number, track: Partial<Track>): Promise<void> {
  return clientUpdateTrack(id, track);
}

export async function deleteTrack(id: number): Promise<void> {
  return clientDeleteTrack(id);
}

export async function deleteTracksBatch(ids: number[]): Promise<void> {
  return clientDeleteTracksBatch(ids);
}

export async function moveTracksBatch(ids: number[], targetNodeId: string): Promise<void> {
  return clientMoveTracksBatch(ids, targetNodeId);
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
  return clientPasteItems(data);
}

// ==========================================
// 2. Settings & Completion Mode
// ==========================================

export interface AppSettings {
  statusEnabled?: boolean;
  completionFolderIds?: string[];
  completedAlbumKeys: string[];
}

export async function fetchSettings(): Promise<AppSettings> {
  return clientFetchSettings();
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  return clientSaveSettings(settings);
}

export async function toggleAlbumsCompleted(
  keys: string[],
  completed: boolean
): Promise<{ success: boolean; completedAlbumKeys: string[] }> {
  return clientToggleAlbumsCompleted(keys, completed);
}

export async function exportLibrary(): Promise<any> {
  return clientExportLibrary();
}

export async function importLibrary(data: any): Promise<{ tree: LibraryNode[] }> {
  return clientImportLibrary(data);
}

// ==========================================
// 3. Stateless 3rd-Party Metadata APIs
// ==========================================

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
    headers: { Accept: 'text/event-stream' },
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
    if (err.name === 'AbortError') return;
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

export async function fetchDiscogsStatus(): Promise<DiscogsStatus> {
  try {
    const res = await fetch(`${API_BASE}/discogs/status`);
    if (!res.ok) return { configured: false };
    return res.json();
  } catch {
    return { configured: false };
  }
}

export async function saveDiscogsToken(token: string): Promise<void> {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('fmsort_discogs_token', token);
    }
    await fetch(`${API_BASE}/discogs/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
  } catch {}
}

export async function searchDiscogs(query: string): Promise<DiscogsReleaseSummary[]> {
  const res = await fetch(`${API_BASE}/discogs/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error('NO_TOKEN');
    throw new Error(err.error || 'Failed to search Discogs');
  }
  return res.json();
}

export async function searchMusicBrainz(query: string): Promise<MbReleaseSummary[]> {
  const res = await fetch(`${API_BASE}/musicbrainz/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error('Failed to search MusicBrainz');
  return res.json();
}

export type { UnifiedTrackSummary } from './types';

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
    } else if (source === 'musicbrainz') {
      const res = await fetch(`${API_BASE}/musicbrainz/release/${id}`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.tracks || []).map((t: any, idx: number) => ({
        id: `mb-${id}-${idx}`,
        title: t.title,
        artist: t.artist || data.artist,
        album: t.album || data.title,
        duration: t.length || 0,
        cover: t.cover_url || '',
        preview: '',
        isrc: t.isrc && t.isrc !== '—' ? t.isrc : '',
        source: 'musicbrainz' as const,
      }));
    }
    return [];
  } catch {
    return [];
  }
}

// ==========================================
// 4. Release & Discography Importers (Client)
// ==========================================

export async function importUniversalRelease(
  source: 'discogs' | 'deezer' | 'musicbrainz',
  releaseId: string | number,
  targetNodeId: string,
  createAlbumContainer = true,
  coverUrl?: string
): Promise<{ destNodeId: string; tree: LibraryNode[] }> {
  const tracks = await fetchReleaseTracklist(source, releaseId);
  if (!tracks.length) {
    throw new Error('No tracks found for release');
  }

  let destNodeId = targetNodeId;
  const albumTitle = tracks[0].album || 'Untitled Album';
  const artistName = tracks[0].artist || 'Various Artists';
  const albumCover = coverUrl || tracks[0].cover || '';

  if (createAlbumContainer) {
    const parentId = targetNodeId && targetNodeId !== 'uncategorized' && targetNodeId !== 'root' ? targetNodeId : null;
    const albumNode = await clientCreateNode({
      parent_id: parentId,
      type: 'Album',
      name: albumTitle,
      cover_url: albumCover,
    });
    destNodeId = albumNode.id;
  }

  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    await clientCreateTrack(destNodeId, {
      t: t.title,
      a: t.artist || artistName,
      al: t.album || albumTitle,
      len: t.duration || 0,
      cover_url: t.cover || albumCover,
      isrc: t.isrc || '',
      sort_order: i,
    });
  }

  const tree = await clientFetchTree();
  return { destNodeId, tree };
}

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
  let destNodeId = data.targetNodeId;

  if (data.createAlbumContainer) {
    const parentId = data.targetNodeId && data.targetNodeId !== 'uncategorized' && data.targetNodeId !== 'root' ? data.targetNodeId : null;
    const albumNode = await clientCreateNode({
      parent_id: parentId,
      type: 'Album',
      name: data.album || 'Untitled Album',
      cover_url: data.coverUrl || '',
    });
    destNodeId = albumNode.id;
  }

  const created = await clientCreateTrack(destNodeId, {
    t: data.title,
    a: data.artist,
    al: data.album,
    len: data.duration || 0,
    cover_url: data.coverUrl || '',
    isrc: data.isrc || '',
  });

  const tree = await clientFetchTree();
  return { success: true, track: created, destNodeId, tree };
}

export async function importArtistContainer(
  name: string,
  targetNodeId: string,
  thumb?: string
): Promise<{ destNodeId: string; tree: LibraryNode[] }> {
  const parentId = targetNodeId && targetNodeId !== 'uncategorized' && targetNodeId !== 'root' ? targetNodeId : null;
  const node = await clientCreateNode({
    parent_id: parentId,
    type: 'Artist',
    name: name.trim(),
    cover_url: thumb || '',
  });
  const tree = await clientFetchTree();
  return { destNodeId: node.id, tree };
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
  const targetArtistId = data.artistNodeId || (data.artistNodeIds && data.artistNodeIds[0]);
  const name = data.artistName || '';
  if (!name.trim()) {
    const tree = await clientFetchTree();
    return { success: false, importedAlbums: 0, importedTracks: 0, artistsProcessed: 0, tree };
  }

  const projects = await fetchArtistSuggestedProjects(name);
  let importedAlbums = 0;
  let importedTracks = 0;

  if (targetArtistId) {
    for (const proj of projects.slice(0, 10)) {
      try {
        const res = await importUniversalRelease(proj.source, proj.id, targetArtistId, true, proj.cover_url);
        importedAlbums++;
      } catch {}
    }
  }

  const tree = await clientFetchTree();
  return {
    success: true,
    importedAlbums,
    importedTracks,
    artistsProcessed: 1,
    tree,
  };
}

export async function importDiscogsRelease(
  releaseId: number,
  targetNodeId: string,
  createAlbumContainer = true
): Promise<{ destNodeId: string; tree: LibraryNode[] }> {
  return importUniversalRelease('discogs', releaseId, targetNodeId, createAlbumContainer);
}

export async function importMusicBrainzRelease(
  mbid: string,
  targetNodeId: string,
  createAlbumContainer = true
): Promise<{ destNodeId: string; tree: LibraryNode[] }> {
  return importUniversalRelease('musicbrainz', mbid, targetNodeId, createAlbumContainer);
}

// ==========================================
// 5. ISRC Enrichment
// ==========================================

export async function enrichTrackIsrc(
  trackId: number
): Promise<{ success: boolean; id: number; isrc: string; updated: boolean }> {
  const tree = await clientFetchTree();
  let foundTrack: Track | null = null;
  const findTrack = (nodes: LibraryNode[]) => {
    for (const n of nodes) {
      const match = (n.tracks || []).find((t) => t.id === trackId);
      if (match) {
        foundTrack = match;
        return;
      }
      if (n.children) findTrack(n.children);
    }
  };
  findTrack(tree);

  if (!foundTrack || !(foundTrack as Track).a || !(foundTrack as Track).t) {
    return { success: false, id: trackId, isrc: '', updated: false };
  }

  try {
    const res = await fetch(`${API_BASE}/tracks/enrich-isrc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        artist: (foundTrack as Track).a,
        title: (foundTrack as Track).t,
        isrc: (foundTrack as Track).isrc,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.isrc && data.isrc !== (foundTrack as Track).isrc) {
        await clientUpdateTrack(trackId, { isrc: data.isrc });
        return { success: true, id: trackId, isrc: data.isrc, updated: true };
      }
    }
  } catch {}

  return { success: true, id: trackId, isrc: (foundTrack as Track).isrc || '', updated: false };
}

export async function enrichAllIsrcs(
  trackIds?: number[]
): Promise<{ success: boolean; totalProcessed: number; updatedCount: number; tree: LibraryNode[] }> {
  const tree = await clientFetchTree();
  const allTracks: Track[] = [];
  const collect = (nodes: LibraryNode[]) => {
    for (const n of nodes) {
      if (n.tracks) allTracks.push(...n.tracks);
      if (n.children) collect(n.children);
    }
  };
  collect(tree);

  const targets = trackIds ? allTracks.filter((t) => trackIds.includes(t.id)) : allTracks.filter((t) => !t.isrc || t.isrc === '—');

  let updatedCount = 0;
  for (const t of targets) {
    const res = await enrichTrackIsrc(t.id);
    if (res.updated) updatedCount++;
  }

  const updatedTree = await clientFetchTree();
  return { success: true, totalProcessed: targets.length, updatedCount, tree: updatedTree };
}

// ==========================================
// 6. TuneMyMusic Import
// ==========================================

export interface ParsedTuneTrack {
  title: string;
  artist: string;
  album: string;
  isrc: string;
  deezerId?: string;
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
  const res = await fetch(`${API_BASE}/import/tunemymusic/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to parse Tune My Music CSV file');
  }
  return res.json();
}

export async function importTuneMyMusic(data: {
  text?: string;
  tracks?: ParsedTuneTrack[];
  targetNodeId?: string | null;
}): Promise<TuneImportResponse> {
  let tracks = data.tracks;
  if (!tracks && data.text) {
    const parsed = await parseTuneMyMusic(data.text);
    tracks = parsed.tracks;
  }
  if (!tracks || !tracks.length) {
    throw new Error('No tracks found to import');
  }

  let targetFolderId = data.targetNodeId;
  if (!targetFolderId || targetFolderId === 'uncategorized' || targetFolderId === 'root') {
    const importFolder = await clientCreateNode({
      parent_id: null,
      type: 'Playlist',
      name: tracks[0]?.playlist || 'TuneMyMusic Import',
    });
    targetFolderId = importFolder.id;
  }

  const artistMap = new Map<string, string>();
  const albumMap = new Map<string, string>();

  let importedTracksCount = 0;
  for (let i = 0; i < tracks.length; i++) {
    const item = tracks[i];
    const artist = (item.artist || 'Unknown Artist').trim();
    const album = (item.album || 'Unknown Album').trim();

    let artistNodeId = artistMap.get(artist);
    if (!artistNodeId) {
      const artNode = await clientCreateNode({
        parent_id: targetFolderId,
        type: 'Artist',
        name: artist,
      });
      artistNodeId = artNode.id;
      artistMap.set(artist, artistNodeId);
    }

    const albumKey = `${artist}:::${album}`;
    let albumNodeId = albumMap.get(albumKey);
    if (!albumNodeId) {
      const albNode = await clientCreateNode({
        parent_id: artistNodeId,
        type: 'Album',
        name: album,
      });
      albumNodeId = albNode.id;
      albumMap.set(albumKey, albumNodeId);
    }

    await clientCreateTrack(albumNodeId, {
      t: item.title,
      a: artist,
      al: album,
      isrc: item.isrc || '',
      sort_order: i,
    });
    importedTracksCount++;
  }

  const tree = await clientFetchTree();
  return {
    success: true,
    totalParsed: tracks.length,
    importedTracks: importedTracksCount,
    artistsCount: artistMap.size,
    albumsCount: albumMap.size,
    matchedArtworks: 0,
    matchedIsrcs: tracks.filter((t) => t.isrc).length,
    destNodeId: targetFolderId,
    tree,
  };
}
