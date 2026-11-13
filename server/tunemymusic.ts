import {
  db,
  createNode,
  createTrack,
  getFullTree,
  type NodeRecord,
} from './db';
import {
  searchDeezerArtists,
  searchDeezerReleases,
} from './deezer';

export interface ParsedTuneTrack {
  title: string;
  artist: string;
  album: string;
  isrc: string; // ONLY authentic 12-char ISRC, or ''
  deezerId?: string; // e.g. "3115569011"
  playlist?: string;
  type?: 'Track' | 'Artist' | 'Album' | 'Playlist';
}

export interface TuneImportOptions {
  targetNodeId?: string | null;
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

// Authentic ISRC regex: 2 country letters, 3 registrant chars, 2 year digits, 5 designation digits
const ISRC_REGEX = /^[A-Z]{2}[- ]?[A-Z0-9]{3}[- ]?\d{2}[- ]?\d{5}$/i;

function cleanCell(cell: string | undefined): string {
  if (!cell) return '';
  return cell.replace(/^["'\uFEFF]|["'\r\n]$/g, '').trim();
}

/**
 * Robust CSV row parser handling quotes, escaped quotes (""), and commas inside quotes.
 */
export function parseCsvRow(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++; // skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      cells.push(cleanCell(cur));
      cur = '';
    } else {
      cur += c;
    }
  }
  cells.push(cleanCell(cur));
  return cells;
}

/**
 * Parses Tune My Music CSV export text files.
 * Correctly distinguishes authentic 12-character ISRCs from Deezer/platform numeric IDs.
 */
export function parseTuneMyMusicText(rawContent: string): ParsedTuneTrack[] {
  if (!rawContent || typeof rawContent !== 'string') return [];

  // Strip UTF-8 Byte Order Mark (BOM)
  const content = rawContent.replace(/^\uFEFF/, '').trim();
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  // Detect header row
  const headerLine = lines[0];
  const headerCells = parseCsvRow(headerLine).map(h => h.toLowerCase());

  const titleIdx = headerCells.findIndex(h =>
    h.includes('track name') || h.includes('song name') || h === 'title' || h === 'track'
  );
  const artistIdx = headerCells.findIndex(h =>
    h.includes('artist name') || h === 'artist'
  );
  const albumIdx = headerCells.findIndex(h =>
    h === 'album' || h.includes('album name')
  );
  const typeIdx = headerCells.findIndex(h =>
    h === 'type'
  );
  const playlistIdx = headerCells.findIndex(h =>
    h.includes('playlist')
  );
  const isrcIdx = headerCells.findIndex(h =>
    h.includes('isrc')
  );
  const deezerIdx = headerCells.findIndex(h =>
    h.includes('deezer')
  );

  const parsedTracks: ParsedTuneTrack[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Skip comment lines
    if (line.startsWith('#') || line.startsWith('//') || line.startsWith('---')) {
      continue;
    }

    const cells = parseCsvRow(line);
    if (cells.length === 0 || cells.every(c => !c)) continue;

    const rawType = (typeIdx >= 0 ? cells[typeIdx] : 'Track') || 'Track';

    if (rawType.toLowerCase() === 'artist') {
      // Favorite Artist export row (e.g. "Tapir!","","","Favorite Artists","Artist","","158978552")
      const artistName = cleanCell(cells[titleIdx >= 0 ? titleIdx : 0]) || cleanCell(cells[artistIdx >= 0 ? artistIdx : 1]);
      const dzId = deezerIdx >= 0 ? cleanCell(cells[deezerIdx]) : cleanCell(cells[isrcIdx >= 0 ? isrcIdx : 6]);
      if (artistName) {
        parsedTracks.push({
          type: 'Artist',
          artist: artistName,
          title: '',
          album: '',
          isrc: '',
          deezerId: /^\d+$/.test(dzId) ? dzId : undefined,
        });
      }
      continue;
    }

    const title = cleanCell(cells[titleIdx >= 0 ? titleIdx : 0]);
    const artist = cleanCell(cells[artistIdx >= 0 ? artistIdx : 1]);
    const album = cleanCell(albumIdx >= 0 ? cells[albumIdx] : '') || 'Singles & Releases';
    const playlist = playlistIdx >= 0 ? cleanCell(cells[playlistIdx]) : '';

    if (!title && !artist) continue;

    const rawIsrc = isrcIdx >= 0 ? cleanCell(cells[isrcIdx]) : '';
    const rawDeezer = deezerIdx >= 0 ? cleanCell(cells[deezerIdx]) : '';

    let isrc = '';
    let deezerId = '';

    // Check if rawIsrc is a genuine 12-char ISRC
    if (ISRC_REGEX.test(rawIsrc)) {
      isrc = rawIsrc.replace(/[- ]/g, '').toUpperCase();
    } else if (/^\d+$/.test(rawIsrc)) {
      // It is a Deezer track ID! (Tune My Music exports Deezer IDs in the ISRC column)
      deezerId = rawIsrc;
    }

    if (!deezerId && /^\d+$/.test(rawDeezer)) {
      deezerId = rawDeezer;
    }

    // Fallback scan across all cells for a genuine 12-char ISRC if not found yet
    if (!isrc) {
      for (const cell of cells) {
        const cleanC = cell.replace(/[- ]/g, '').toUpperCase();
        if (/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(cleanC)) {
          isrc = cleanC;
          break;
        }
      }
    }

    parsedTracks.push({
      type: 'Track',
      title: title || 'Untitled Track',
      artist: artist || 'Unknown Artist',
      album: album || 'Singles & Releases',
      isrc,
      deezerId: deezerId || undefined,
      playlist,
    });
  }

  return parsedTracks;
}

/**
 * Connects Tune My Music parsed tracks to Deezer & Discogs metadata system,
 * executes an instantaneous SQLite transaction for all crates and tracks,
 * and enriches top items with artwork.
 */
export async function connectAndImportTuneMyMusic(
  tracks: ParsedTuneTrack[],
  options: TuneImportOptions = {}
): Promise<TuneImportResult> {
  const t0 = performance.now();
  const targetParentId = (options.targetNodeId && options.targetNodeId !== 'uncategorized' && options.targetNodeId !== 'root')
    ? options.targetNodeId
    : null;

  console.log(`[TuneMyMusic Server] Starting import of ${tracks.length} tracks/items into targetNodeId: ${targetParentId || 'root'}`);

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

  for (const item of tracks) {
    const artKey = (item.artist || 'Unknown Artist').trim().toLowerCase();
    if (!artistsMap.has(artKey)) {
      artistsMap.set(artKey, {
        artistName: item.artist.trim() || 'Unknown Artist',
        albums: new Map(),
      });
    }

    if (item.type === 'Artist') {
      // Just registering the artist container
      continue;
    }

    const artistEntry = artistsMap.get(artKey)!;
    const albKey = (item.album || 'Singles & Releases').trim().toLowerCase();

    if (!artistEntry.albums.has(albKey)) {
      artistEntry.albums.set(albKey, {
        albumName: item.album.trim() || 'Singles & Releases',
        tracks: [],
      });
    }

    artistEntry.albums.get(albKey)!.tracks.push(item);
  }

  // 2. Fetch existing nodes to reuse containers if they already exist
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
  let importedTracksCount = 0;
  let totalAlbumsCount = 0;
  let matchedArtworks = 0;
  let matchedIsrcs = 0;

  // Track new nodes for fast parallel artwork enrichment
  const newArtistNodesToEnrich: { node: NodeRecord; name: string }[] = [];
  const newAlbumNodesToEnrich: { node: NodeRecord; artist: string; album: string }[] = [];

  // Helper ID generator
  const genId = () => `n_${Math.random().toString(36).substring(2, 9)}`;

  // Prepared statements for maximum batch performance
  const insertNodeStmt = db.prepare(
    'INSERT INTO nodes (id, parent_id, type, name, cover_url) VALUES (?, ?, ?, ?, ?)'
  );
  const insertTrackStmt = db.prepare(
    'INSERT INTO tracks (node_id, title, artist, album, year, format, catalog_no, barcode, mbid, isrc, length, bpm, key, sort_order, cover_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );

  // 3. EXECUTE SINGLE HIGH-SPEED ATOMIC TRANSACTION
  const txStart = performance.now();
  db.transaction(() => {
    for (const [_, artistData] of artistsMap) {
      const artistKey = `${targetParentId || 'root'}:::artist:::${artistData.artistName.trim().toLowerCase()}`;
      let artistNode = existingNodeMap.get(artistKey);

      if (!artistNode) {
        const newId = genId();
        insertNodeStmt.run(newId, targetParentId, 'Artist', artistData.artistName, '');
        artistNode = {
          id: newId,
          parent_id: targetParentId,
          type: 'Artist',
          name: artistData.artistName,
          cover_url: '',
          sort_order: 0,
          created_at: new Date().toISOString(),
        };
        existingNodeMap.set(artistKey, artistNode);
        newArtistNodesToEnrich.push({ node: artistNode, name: artistData.artistName });
      }

      if (!finalDestinationNodeId) {
        finalDestinationNodeId = artistNode.id;
      }

      // Albums under Artist
      for (const [_, albumData] of artistData.albums) {
        totalAlbumsCount++;
        const albumKey = `${artistNode.id}:::album:::${albumData.albumName.trim().toLowerCase()}`;
        let albumNode = existingNodeMap.get(albumKey);

        if (!albumNode) {
          const newId = genId();
          insertNodeStmt.run(newId, artistNode.id, 'Album', albumData.albumName, '');
          albumNode = {
            id: newId,
            parent_id: artistNode.id,
            type: 'Album',
            name: albumData.albumName,
            cover_url: '',
            sort_order: 0,
            created_at: new Date().toISOString(),
          };
          existingNodeMap.set(albumKey, albumNode);
          newAlbumNodesToEnrich.push({
            node: albumNode,
            artist: artistData.artistName,
            album: albumData.albumName,
          });
        }

        // Tracks under Album
        for (const [idx, tr] of albumData.tracks.entries()) {
          const serviceId = tr.deezerId ? `deezer-${tr.deezerId}` : '';
          insertTrackStmt.run(
            albumNode.id,
            tr.title,
            artistData.artistName,
            albumData.albumName,
            0, // year
            'Digital Track',
            '—', // catalog_no
            '—', // barcode
            serviceId, // mbid / service ID
            tr.isrc || '—',
            0, // length
            0, // bpm
            '', // key
            idx,
            '' // cover_url
          );
          importedTracksCount++;
          if (tr.isrc) matchedIsrcs++;
        }
      }
    }
  })();

  const txElapsed = (performance.now() - txStart).toFixed(2);
  console.log(`[TuneMyMusic Server] Database transaction finished in ${txElapsed} ms! Saved ${importedTracksCount} tracks across ${artistsMap.size} artists.`);

  // 4. FAST BOUNDED PARALLEL ARTWORK ENRICHMENT (Timeout bounded to 2.5s maximum)
  try {
    const artworkTasks: Promise<any>[] = [];

    // Top 15 artists
    for (const item of newArtistNodesToEnrich.slice(0, 15)) {
      artworkTasks.push(
        searchDeezerArtists(item.name)
          .then(res => {
            if (res && res.length > 0 && res[0].thumb) {
              db.run('UPDATE nodes SET cover_url = ? WHERE id = ?', [res[0].thumb, item.node.id]);
              matchedArtworks++;
            }
          })
          .catch(() => {})
      );
    }

    // Top 15 albums
    for (const item of newAlbumNodesToEnrich.slice(0, 15)) {
      const q = `${item.artist} ${item.album}`.trim();
      artworkTasks.push(
        searchDeezerReleases(q)
          .then(res => {
            if (res && res.length > 0 && res[0].thumb) {
              db.run('UPDATE nodes SET cover_url = ? WHERE id = ?', [res[0].thumb, item.node.id]);
              db.run('UPDATE tracks SET cover_url = ? WHERE node_id = ? AND (cover_url IS NULL OR cover_url = "")', [res[0].thumb, item.node.id]);
              matchedArtworks++;
            }
          })
          .catch(() => {})
      );
    }

    if (artworkTasks.length > 0) {
      // Run with 2.5s timeout so import NEVER hangs
      const timeoutPromise = new Promise(resolve => setTimeout(resolve, 2500));
      await Promise.race([Promise.allSettled(artworkTasks), timeoutPromise]);
    }
  } catch (err: any) {
    console.warn('[TuneMyMusic Server] Artwork background enrichment warning:', err?.message);
  }

  const updatedTree = getFullTree();
  const totalDuration = (performance.now() - t0).toFixed(0);
  console.log(`[TuneMyMusic Server] Total import completed in ${totalDuration} ms. Success!`);

  return {
    success: true,
    totalParsed: tracks.length,
    importedTracks: importedTracksCount,
    artistsCount: artistsMap.size,
    albumsCount: totalAlbumsCount,
    matchedArtworks,
    matchedIsrcs,
    destNodeId: finalDestinationNodeId || targetParentId || '',
    tree: updatedTree,
  };
}
