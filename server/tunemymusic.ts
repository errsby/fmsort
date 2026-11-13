import {
  createNode,
  createTrack,
  getFullTree,
  type NodeRecord,
} from './db';
import {
  searchDeezerArtists,
  searchDeezerReleases,
  lookupIsrc,
} from './deezer';
import { normalizeArtist, normalizeAlbumTitle } from './search';

export interface ParsedTuneTrack {
  title: string;
  artist: string;
  album: string;
  isrc: string;
}

/**
 * Parses raw Tune My Music text files (supports CSV, tab-delimited, semicolon, and hyphenated text formats)
 */
export function parseTuneMyMusicText(rawContent: string): ParsedTuneTrack[] {
  if (!rawContent || typeof rawContent !== 'string') return [];

  // Remove UTF-8 BOM if present
  const content = rawContent.replace(/^\uFEFF/, '');
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  if (lines.length === 0) return [];

  const parsedTracks: ParsedTuneTrack[] = [];

  let headerIndices: {
    title: number;
    artist: number;
    album: number;
    isrc: number;
  } | null = null;

  for (const line of lines) {
    // Skip comments or divider lines
    if (line.startsWith('#') || line.startsWith('//') || line.startsWith('---')) {
      continue;
    }

    let parts: string[] = [];
    if (line.includes('\t')) {
      parts = line.split('\t').map(p => cleanCell(p));
    } else if (line.includes(',') && (line.includes('"') || (line.match(/,/g) || []).length >= 2)) {
      parts = parseCsvLine(line);
    } else if (line.includes(';')) {
      parts = line.split(';').map(p => cleanCell(p));
    } else if (line.includes(' - ') || line.includes(' – ') || line.includes(' — ')) {
      parts = line.split(/\s*[-–—]\s*/).map(p => cleanCell(p));
    } else {
      parts = [cleanCell(line)];
    }

    if (parts.length === 0) continue;

    // Check if this line is a header
    if (isHeader(parts)) {
      headerIndices = {
        title: parts.findIndex(p => {
          const s = p.toLowerCase();
          return s.includes('track name') || s.includes('song name') || s === 'title' || s === 'track';
        }),
        artist: parts.findIndex(p => {
          const s = p.toLowerCase();
          return s.includes('artist name') || s === 'artist';
        }),
        album: parts.findIndex(p => {
          const s = p.toLowerCase();
          return s.includes('album name') || s === 'album';
        }),
        isrc: parts.findIndex(p => p.toLowerCase().includes('isrc')),
      };
      if (headerIndices.title === -1) headerIndices.title = 0;
      if (headerIndices.artist === -1) headerIndices.artist = 1;
      if (headerIndices.album === -1) headerIndices.album = 2;
      continue;
    }

    let title = '';
    let artist = '';
    let album = '';
    let isrc = '';

    if (headerIndices) {
      title = parts[headerIndices.title] || '';
      artist = parts[headerIndices.artist] || '';
      album = headerIndices.album !== -1 ? (parts[headerIndices.album] || '') : '';
      isrc = headerIndices.isrc !== -1 ? (parts[headerIndices.isrc] || '') : '';
    } else {
      if (parts.length >= 3) {
        title = parts[0] || '';
        artist = parts[1] || '';
        album = parts[2] || '';
      } else if (parts.length === 2) {
        title = parts[0] || '';
        artist = parts[1] || '';
      } else {
        title = parts[0] || '';
        artist = 'Unknown Artist';
      }

      // Check if any column has a valid ISRC (12 chars matching regex)
      for (const p of parts) {
        const cleanP = p.trim().toUpperCase();
        if (/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(cleanP)) {
          isrc = cleanP;
          break;
        }
      }
    }

    // Validation
    if (!title && !artist) continue;
    if (title.toLowerCase() === 'track name' || title.toLowerCase() === 'title') continue;

    parsedTracks.push({
      title: title || 'Untitled Track',
      artist: artist || 'Unknown Artist',
      album: album || 'Singles & Releases',
      isrc: isrc && isrc !== '—' ? isrc.trim().toUpperCase() : '',
    });
  }

  return parsedTracks;
}

function cleanCell(cell: string): string {
  if (!cell) return '';
  return cell.replace(/^["']|["']$/g, '').trim();
}

function isHeader(parts: string[]): boolean {
  if (parts.length === 0) return true;
  const p0 = (parts[0] || '').toLowerCase();
  const p1 = (parts[1] || '').toLowerCase();
  return (
    p0.includes('track name') ||
    p0.includes('song name') ||
    p0 === 'title' ||
    p0 === 'track' ||
    p1.includes('artist name') ||
    p1 === 'artist'
  );
}

function parseCsvLine(text: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(cleanCell(cur));
      cur = '';
    } else {
      cur += char;
    }
  }
  result.push(cleanCell(cur));
  return result;
}

export interface TuneImportOptions {
  targetNodeId?: string | null;
  createArtistHierarchy?: boolean; // Default true: Folder -> Artist -> Album -> Tracks
}

export interface TuneImportResult {
  success: boolean;
  totalParsed: number;
  importedTracks: number;
  artistsCount: number;
  albumsCount: number;
  matchedArtworks: number;
  matchedIsrcs: number;
  destNodeId: string;
  tree: any[];
}

/**
 * Connects Tune My Music parsed tracks to Deezer & Discogs metadata system,
 * resolving artist photos, album artwork, release years, and ISRCs, then
 * builds out the structured library hierarchy.
 */
export async function connectAndImportTuneMyMusic(
  tracks: ParsedTuneTrack[],
  options: TuneImportOptions = {}
): Promise<TuneImportResult> {
  const targetParentId = (options.targetNodeId && options.targetNodeId !== 'uncategorized' && options.targetNodeId !== 'root')
    ? options.targetNodeId
    : null;

  // 1. Group parsed tracks by canonical Artist -> Album
  interface GroupedAlbumData {
    albumName: string;
    tracks: ParsedTuneTrack[];
    coverUrl?: string;
    year?: number;
  }

  interface GroupedArtistData {
    artistName: string;
    thumb?: string;
    albums: Map<string, GroupedAlbumData>;
  }

  const artistsMap = new Map<string, GroupedArtistData>();

  for (const track of tracks) {
    const artKey = normalizeArtist(track.artist) || 'unknown_artist';
    const albKey = normalizeAlbumTitle(track.album) || 'singles_and_releases';

    if (!artistsMap.has(artKey)) {
      artistsMap.set(artKey, {
        artistName: track.artist.trim(),
        albums: new Map(),
      });
    }

    const artistEntry = artistsMap.get(artKey)!;
    if (!artistEntry.albums.has(albKey)) {
      artistEntry.albums.set(albKey, {
        albumName: track.album.trim() || 'Singles & Releases',
        tracks: [],
      });
    }

    artistEntry.albums.get(albKey)!.tracks.push(track);
  }

  let matchedArtworks = 0;
  let matchedIsrcs = 0;
  let importedTracksCount = 0;
  let totalAlbumsCount = 0;

  // 2. Connect Artists & Albums to Deezer online catalog for metadata & artwork
  for (const [_, artistData] of artistsMap) {
    try {
      const deezerArtists = await searchDeezerArtists(artistData.artistName);
      if (deezerArtists.length > 0) {
        const top = deezerArtists[0];
        if (top.thumb) {
          artistData.thumb = top.thumb;
          matchedArtworks++;
        }
      }
    } catch {
      // offline / safe fallback
    }

    // Connect each album under this artist
    for (const [_, albumData] of artistData.albums) {
      totalAlbumsCount++;
      try {
        const q = `${artistData.artistName} ${albumData.albumName}`.trim();
        const deezerAlbums = await searchDeezerReleases(q);
        if (deezerAlbums.length > 0) {
          const top = deezerAlbums[0];
          if (top.thumb) {
            albumData.coverUrl = top.thumb;
            matchedArtworks++;
          }
          if (top.year) {
            albumData.year = top.year;
          }
        }
      } catch {
        // safe fallback
      }

      // Connect missing ISRCs on individual tracks
      for (const track of albumData.tracks) {
        if (!track.isrc) {
          try {
            const foundIsrc = await lookupIsrc(artistData.artistName, track.title);
            if (foundIsrc && foundIsrc !== '—') {
              track.isrc = foundIsrc;
              matchedIsrcs++;
            }
          } catch {
            // safe fallback
          }
        }
      }
    }
  }

  // 3. Build out Library Hierarchy in Database
  // Fetch existing nodes to reuse containers if they already exist
  const existingTree = getFullTree();
  const existingNodeMap = new Map<string, NodeRecord>();
  function mapNodes(nodes: any[]) {
    for (const n of nodes) {
      const key = `${n.parent_id || 'root'}:::${n.type.toLowerCase()}:::${n.name.trim().toLowerCase()}`;
      existingNodeMap.set(key, n);
      if (n.children && n.children.length > 0) {
        mapNodes(n.children);
      }
    }
  }
  mapNodes(existingTree);

  let finalDestinationNodeId = targetParentId || '';

  for (const [_, artistData] of artistsMap) {
    const artistKey = `${targetParentId || 'root'}:::artist:::${artistData.artistName.trim().toLowerCase()}`;
    let artistNode = existingNodeMap.get(artistKey);

    if (!artistNode) {
      artistNode = createNode({
        parent_id: targetParentId,
        type: 'Artist',
        name: artistData.artistName,
        cover_url: artistData.thumb || '',
      });
      existingNodeMap.set(artistKey, artistNode);
    } else if (!artistNode.cover_url && artistData.thumb) {
      // Update with new artwork if missing
      artistNode.cover_url = artistData.thumb;
    }

    if (!finalDestinationNodeId) {
      finalDestinationNodeId = artistNode.id;
    }

    // Albums under Artist
    for (const [_, albumData] of artistData.albums) {
      const albumKey = `${artistNode.id}:::album:::${albumData.albumName.trim().toLowerCase()}`;
      let albumNode = existingNodeMap.get(albumKey);

      if (!albumNode) {
        albumNode = createNode({
          parent_id: artistNode.id,
          type: 'Album',
          name: albumData.albumName,
          cover_url: albumData.coverUrl || artistData.thumb || '',
        });
        existingNodeMap.set(albumKey, albumNode);
      }

      // Tracks under Album
      const albumCover = albumData.coverUrl || artistData.thumb || '';
      for (const [idx, tr] of albumData.tracks.entries()) {
        createTrack({
          node_id: albumNode.id,
          t: tr.title,
          a: artistData.artistName,
          al: albumData.albumName,
          y: albumData.year || 0,
          f: 'Digital Track',
          c: '—',
          bc: '—',
          mb: '',
          isrc: tr.isrc || '—',
          len: 0,
          bpm: 0,
          key: '',
          sort_order: idx,
          cover_url: albumCover,
        });
        importedTracksCount++;
      }
    }
  }

  const updatedTree = getFullTree();

  return {
    success: true,
    totalParsed: tracks.length,
    importedTracks: importedTracksCount,
    artistsCount: artistsMap.size,
    albumsCount: totalAlbumsCount,
    matchedArtworks,
    matchedIsrcs,
    destNodeId: finalDestinationNodeId || (updatedTree[0]?.id || ''),
    tree: updatedTree,
  };
}
