import {
  db,
  initDb,
  getFullTree,
  createNode,
  updateNode,
  deleteNode,
  createTrack,
  updateTrack,
  deleteTrack,
  deleteTracksBatch,
  moveTracksBatch,
  pasteItems,
  exportLibrary,
  importLibrary,
  getSetting,
  setSetting,
  getAllTracks,
  getTrackById,
} from './db';
import {
  executeFastSearch,
  executeEnrichedSearch,
  executeHybridSearch,
} from './search';
import {
  searchMusicBrainzReleases,
  getMusicBrainzReleaseDetails,
} from './musicbrainz';
import {
  isDiscogsConfigured,
  searchDiscogsReleases,
  searchDiscogsArtists,
  getDiscogsReleaseDetails,
  getDiscogsBiggerArtwork,
  getDiscogsArtistReleases,
} from './discogs';
import {
  searchDeezerReleases,
  searchDeezerArtists,
  getDeezerReleaseDetails,
  lookupIsrc,
  getArtistSuggestedProjects,
} from './deezer';
import { getArtistProfile } from './artistProfile';
import {
  parseTuneMyMusicText,
  connectAndImportTuneMyMusic,
} from './tunemymusic';

initDb();

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

function errorJson(message: string, status = 400) {
  return json({ error: message }, status);
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    // API Routes
    try {
      // 1. Full Library Tree
      if (path === '/api/tree' && method === 'GET') {
        const tree = getFullTree();
        return json(tree);
      }

      // 2. Create Node
      if (path === '/api/nodes' && method === 'POST') {
        const body = await req.json();
        if (!body.name || !body.type) {
          return errorJson('Missing name or type');
        }
        const node = createNode({
          parent_id: body.parent_id || null,
          type: body.type,
          name: body.name,
          sort_order: body.sort_order,
          cover_url: body.cover_url || '',
        });
        return json(node, 201);
      }

      // 3. Update Node: PATCH /api/nodes/:id
      const nodeMatch = path.match(/^\/api\/nodes\/([^/]+)$/);
      if (nodeMatch && method === 'PATCH') {
        const id = decodeURIComponent(nodeMatch[1]);
        const body = await req.json();
        updateNode(id, body);
        return json({ success: true });
      }

      // 4. Delete Node: DELETE /api/nodes/:id
      if (nodeMatch && method === 'DELETE') {
        const id = decodeURIComponent(nodeMatch[1]);
        deleteNode(id);
        return json({ success: true });
      }

      // 5. Add Track to Node: POST /api/nodes/:id/tracks
      const nodeTracksMatch = path.match(/^\/api\/nodes\/([^/]+)\/tracks$/);
      if (nodeTracksMatch && method === 'POST') {
        const nodeId = decodeURIComponent(nodeTracksMatch[1]);
        const body = await req.json();
        const track = createTrack({
          node_id: nodeId,
          t: body.t || body.title || 'Untitled',
          a: body.a || body.artist || 'Unknown Artist',
          al: body.al || body.album || '',
          y: body.y || body.year || 0,
          f: body.f || body.format || '',
          c: body.c || body.catalog_no || '—',
          bc: body.bc || body.barcode || '—',
          mb: body.mb || body.mbid || '—',
          isrc: body.isrc || '—',
          len: body.len || body.length || 0,
          bpm: body.bpm || 0,
          key: body.key || '',
          sort_order: body.sort_order || 0,
          cover_url: body.cover_url || '',
        });
        return json(track, 201);
      }

      // 6. Update Track: PATCH /api/tracks/:id
      const trackMatch = path.match(/^\/api\/tracks\/(\d+)$/);
      if (trackMatch && method === 'PATCH') {
        const id = parseInt(trackMatch[1], 10);
        const body = await req.json();
        updateTrack(id, body);
        return json({ success: true });
      }

      // 7. Delete Track: DELETE /api/tracks/:id
      if (trackMatch && method === 'DELETE') {
        const id = parseInt(trackMatch[1], 10);
        deleteTrack(id);
        return json({ success: true });
      }

      // 8. Batch Delete Tracks: POST /api/tracks/batch-delete
      if (path === '/api/tracks/batch-delete' && method === 'POST') {
        const body = await req.json();
        if (!Array.isArray(body.ids)) {
          return errorJson('ids must be an array');
        }
        deleteTracksBatch(body.ids);
        return json({ success: true });
      }

      // 9. Batch Move Tracks: POST /api/tracks/batch-move
      if (path === '/api/tracks/batch-move' && method === 'POST') {
        const body = await req.json();
        if (!Array.isArray(body.ids) || !body.targetNodeId) {
          return errorJson('Missing ids or targetNodeId');
        }
        moveTracksBatch(body.ids, body.targetNodeId);
        return json({ success: true });
      }

      // 9a. Copy & Paste Items: POST /api/items/paste
      if (path === '/api/items/paste' && method === 'POST') {
        const body = await req.json();
        const { targetNodeId, trackIds, nodeIds, operation = 'copy' } = body;
        if (!targetNodeId) {
          return errorJson('Missing targetNodeId');
        }
        const result = pasteItems({
          targetNodeId,
          trackIds: Array.isArray(trackIds) ? trackIds : [],
          nodeIds: Array.isArray(nodeIds) ? nodeIds : [],
          operation: operation === 'cut' ? 'cut' : 'copy',
        });
        return json({ success: true, ...result });
      }

      // 9b. Enrich Single Track ISRC: POST /api/tracks/:id/enrich-isrc
      const enrichSingleMatch = path.match(/^\/api\/tracks\/(\d+)\/enrich-isrc$/);
      if (enrichSingleMatch && method === 'POST') {
        const id = parseInt(enrichSingleMatch[1], 10);
        const tr = getTrackById(id);
        if (!tr) return errorJson('Track not found', 404);

        const isrc = await lookupIsrc(tr.artist, tr.title);
        if (isrc && isrc !== '—') {
          updateTrack(id, { isrc });
          return json({ success: true, id, isrc, updated: true });
        }
        return json({ success: true, id, isrc: tr.isrc || '—', updated: false });
      }

      // 9c. Batch Enrich Missing ISRCs: POST /api/tracks/enrich-isrc
      if (path === '/api/tracks/enrich-isrc' && method === 'POST') {
        const body = await req.json().catch(() => ({}));
        const trackIds: number[] | undefined = body.trackIds;

        const allTracks = getAllTracks();
        const targets = trackIds && Array.isArray(trackIds)
          ? allTracks.filter(t => trackIds.includes(t.id) && (!t.isrc || t.isrc === '—'))
          : allTracks.filter(t => !t.isrc || t.isrc === '—');

        let updatedCount = 0;
        const results: { id: number; title: string; isrc: string }[] = [];

        // Concurrency-limited enrichment in chunks of 5
        const CHUNK_SIZE = 5;
        for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
          const chunk = targets.slice(i, i + CHUNK_SIZE);
          await Promise.all(
            chunk.map(async tr => {
              try {
                const isrc = await lookupIsrc(tr.artist, tr.title);
                if (isrc && isrc !== '—') {
                  updateTrack(tr.id, { isrc });
                  updatedCount++;
                  results.push({ id: tr.id, title: tr.title, isrc });
                }
              } catch {}
            })
          );
        }

        return json({
          success: true,
          totalProcessed: targets.length,
          updatedCount,
          results,
          tree: getFullTree(),
        });
      }

      // 10a. Progressive Streaming Music Search (SSE): GET /api/search/stream?q=...
      if (path === '/api/search/stream' && method === 'GET') {
        const query = (url.searchParams.get('q') || '').trim();
        const discogsEnabled = isDiscogsConfigured();

        if (!query) {
          return new Response('event: done\ndata: {}\n\n', {
            headers: {
              'Content-Type': 'text/event-stream; charset=utf-8',
              'Cache-Control': 'no-cache, no-transform',
              'Connection': 'keep-alive',
            },
          });
        }

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            let isAborted = false;
            req.signal.addEventListener('abort', () => {
              isAborted = true;
            });

            const sendEvent = (event: string, data: any) => {
              if (isAborted) return;
              try {
                controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
              } catch {}
            };

            // Tier 1: Fast Phase (Deezer releases, artists, & tracks in ~50ms, grouped into canonical albums)
            let fastRes: any = null;
            try {
              fastRes = await executeFastSearch(query);
              sendEvent('fast', {
                artists: fastRes.artists,
                albums: fastRes.albums,
                tracks: fastRes.tracks || [],
                counts: {
                  artists: fastRes.artists.length,
                  albums: fastRes.albums.length,
                  tracks: fastRes.tracks?.length || 0,
                  totalVersions: fastRes.albums.reduce((acc: number, a: any) => acc + a.versions.length, 0),
                  deezerCount: fastRes.deezerCount,
                  discogsCount: 0,
                },
                discogsLoading: discogsEnabled,
                discogsConfigured: discogsEnabled,
                phase: 'fast',
              });
            } catch (err: any) {
              console.warn('[Stream Search Fast Error]', err.message);
            }

            if (isAborted || !discogsEnabled) {
              sendEvent('done', { done: true });
              try { controller.close(); } catch {}
              return;
            }

            // Tier 2: Discogs & MusicBrainz Phase (merges pressings and variants into canonical album versions)
            try {
              const fullRes = await executeEnrichedSearch(
                query,
                fastRes?.rawDeezerList || [],
                fastRes?.artists || [],
                fastRes?.tracks || []
              );

              if (isAborted) return;

              sendEvent('discogs', {
                artists: fullRes.artists,
                albums: fullRes.albums,
                tracks: fullRes.tracks || [],
                counts: fullRes.counts,
                discogsLoading: false,
                discogsConfigured: true,
                phase: 'discogs',
              });
            } catch (err: any) {
              console.warn('[Stream Search Discogs Error]', err.message);
            }

            sendEvent('done', { done: true });
            try { controller.close(); } catch {}
          },
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
          },
        });
      }

      // 10. Hybrid Music Search: GET /api/search/hybrid?q=...
      if (path === '/api/search/hybrid' && method === 'GET') {
        const query = (url.searchParams.get('q') || '').trim();
        const discogsEnabled = isDiscogsConfigured();

        if (!query) {
          return json({ artists: [], albums: [], releases: [], discogsConfigured: discogsEnabled });
        }

        const result = await executeHybridSearch(query);
        return json({
          artists: result.artists,
          albums: result.albums,
          tracks: result.tracks || [],
          releases: result.albums.map(a => a.versions[0]).filter(Boolean),
          counts: result.counts,
          discogsConfigured: result.discogsConfigured,
        });
      }

      // 11. Add Artist Container: POST /api/artists/import
      if (path === '/api/artists/import' && method === 'POST') {
        const body = await req.json();
        const { name, targetNodeId, thumb, cover_url } = body;
        if (!name) {
          return errorJson('Missing artist name');
        }

        const parentId = (targetNodeId && targetNodeId !== 'uncategorized' && targetNodeId !== 'root')
          ? targetNodeId
          : null;

        const newArtistNode = createNode({
          parent_id: parentId,
          type: 'Artist',
          name: name.trim(),
          cover_url: thumb || cover_url || '',
        });

        const updatedTree = getFullTree();
        return json({ success: true, destNodeId: newArtistNode.id, tree: updatedTree });
      }

      // 11c. Import Full Artist Discography: POST /api/artists/import-discography
      if (path === '/api/artists/import-discography' && method === 'POST') {
        const body = await req.json();
        const { artistNodeId, artistNodeIds, artistName } = body;

        let targetIds: string[] = [];
        if (Array.isArray(artistNodeIds) && artistNodeIds.length > 0) {
          targetIds = artistNodeIds;
        } else if (artistNodeId) {
          targetIds = [artistNodeId];
        }

        if (targetIds.length === 0) {
          return errorJson('Missing artist node id');
        }

        let totalAlbumsImported = 0;
        let totalTracksImported = 0;
        let artistsProcessed = 0;

        for (const nodeId of targetIds) {
          const artistNode = db.query('SELECT * FROM nodes WHERE id = ?').get(nodeId) as any;
          if (!artistNode) continue;

          const targetName = (artistName && targetIds.length === 1 ? artistName : artistNode.name).trim();
          if (!targetName) continue;

          artistsProcessed++;

          // 1. Fetch artist albums from Deezer
          let albumsToImport: {
            title: string;
            cover: string;
            year: number;
            tracks: { title: string; duration: number; isrc: string; preview: string }[];
          }[] = [];

          try {
            const dzArtRes = await fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(targetName)}&limit=1`, {
              headers: { 'User-Agent': 'FMSort/1.0.0' }
            });
            if (dzArtRes.ok) {
              const dzArtJson = await dzArtRes.json();
              const dzArtist = dzArtJson?.data?.[0];
              if (dzArtist && dzArtist.id) {
                // Update artist node cover if missing
                if (!artistNode.cover_url && (dzArtist.picture_xl || dzArtist.picture_medium || dzArtist.picture)) {
                  updateNode(artistNode.id, { cover_url: dzArtist.picture_xl || dzArtist.picture_medium || dzArtist.picture });
                }

                // Fetch artist albums (limit up to 100)
                const dzAlbumsRes = await fetch(`https://api.deezer.com/artist/${dzArtist.id}/albums?limit=100`, {
                  headers: { 'User-Agent': 'FMSort/1.0.0' }
                });
                if (dzAlbumsRes.ok) {
                  const dzAlbumsJson = await dzAlbumsRes.json();
                  const dzAlbums = Array.isArray(dzAlbumsJson?.data) ? dzAlbumsJson.data : [];

                  // Concurrently fetch tracklists in chunks of 5
                  const chunkSize = 5;
                  for (let i = 0; i < dzAlbums.length; i += chunkSize) {
                    const chunk = dzAlbums.slice(i, i + chunkSize);
                    const chunkResults = await Promise.all(
                      chunk.map(async (alb: any) => {
                        try {
                          const tRes = await fetch(`https://api.deezer.com/album/${alb.id}/tracks`, {
                            headers: { 'User-Agent': 'FMSort/1.0.0' }
                          });
                          if (!tRes.ok) return null;
                          const tJson = await tRes.json();
                          const tracks = Array.isArray(tJson?.data) ? tJson.data : [];
                          const year = alb.release_date ? parseInt(alb.release_date.slice(0, 4), 10) || 0 : 0;
                          return {
                            title: alb.title,
                            cover: alb.cover_big || alb.cover_medium || alb.cover || '',
                            year,
                            tracks: tracks.map((tr: any) => ({
                              title: tr.title,
                              duration: tr.duration || 0,
                              isrc: tr.isrc || '',
                              preview: tr.preview || '',
                            })),
                          };
                        } catch {
                          return null;
                        }
                      })
                    );
                    for (const r of chunkResults) {
                      if (r) albumsToImport.push(r);
                    }
                  }
                }
              }
            }
          } catch (err: any) {
            console.warn('[Import Discography] Deezer fetch error:', err?.message);
          }

          // 2. Discogs fallback if Deezer had 0 albums and Discogs is configured
          if (albumsToImport.length === 0 && isDiscogsConfigured()) {
            try {
              const dArtists = await searchDiscogsArtists(targetName);
              if (dArtists.length > 0) {
                const dArtist = dArtists[0];
                if (!artistNode.cover_url && dArtist.thumb) {
                  updateNode(artistNode.id, { cover_url: dArtist.thumb });
                }
                const dReleases = await getDiscogsArtistReleases(dArtist.id);
                for (const rel of dReleases) {
                  albumsToImport.push({
                    title: rel.title,
                    cover: rel.thumb || rel.cover_image || '',
                    year: rel.year || 0,
                    tracks: [],
                  });
                }
              }
            } catch (err: any) {
              console.warn('[Import Discography] Discogs fallback error:', err?.message);
            }
          }

          // 3. Database operations: create Album nodes under artistNode.id and populate tracks
          db.transaction(() => {
            for (const alb of albumsToImport) {
              if (!alb.title) continue;

              // Check if Album node already exists with same title under this artist
              let albumNode = db.query(
                'SELECT * FROM nodes WHERE parent_id = ? AND type = "Album" AND LOWER(name) = LOWER(?)'
              ).get(artistNode.id, alb.title) as any;

              if (!albumNode) {
                albumNode = createNode({
                  parent_id: artistNode.id,
                  type: 'Album',
                  name: alb.title,
                  cover_url: alb.cover || '',
                });
                totalAlbumsImported++;
              }

              for (let tIdx = 0; tIdx < alb.tracks.length; tIdx++) {
                const tr = alb.tracks[tIdx];
                const existingTrack = db.query(
                  'SELECT id FROM tracks WHERE node_id = ? AND LOWER(title) = LOWER(?)'
                ).get(albumNode.id, tr.title);

                if (!existingTrack) {
                  createTrack({
                    node_id: albumNode.id,
                    t: tr.title,
                    a: targetName,
                    al: alb.title,
                    y: alb.year || 0,
                    f: 'Digital Track',
                    c: '—',
                    cat: '—',
                    bc: '—',
                    mbid: '',
                    isrc: tr.isrc || '',
                    len: tr.duration || 0,
                    bpm: 0,
                    key: '',
                    sort_order: tIdx + 1,
                    cover_url: alb.cover || '',
                  });
                  totalTracksImported++;
                }
              }
            }
          })();
        }

        const updatedTree = getFullTree();
        return json({
          success: true,
          importedAlbums: totalAlbumsImported,
          importedTracks: totalTracksImported,
          artistsProcessed,
          tree: updatedTree,
        });
      }

      // 11b. Import single track: POST /api/tracks/import-single
      if (path === '/api/tracks/import-single' && method === 'POST') {
        const body = await req.json();
        const {
          trackId,
          title,
          artist,
          album,
          duration = 0,
          coverUrl = '',
          isrc = '',
          targetNodeId,
          createAlbumContainer = true,
        } = body;

        if (!title) {
          return errorJson('Missing track title');
        }

        const parentId = (targetNodeId && targetNodeId !== 'uncategorized' && targetNodeId !== 'root')
          ? targetNodeId
          : null;

        let destNodeId = parentId;

        if (createAlbumContainer) {
          const albumName = album || 'Singles & Releases';
          const existingAlbum = parentId
            ? (db.query('SELECT id FROM nodes WHERE parent_id = ? AND type = "Album" AND LOWER(name) = LOWER(?)').get(parentId, albumName) as any)
            : (db.query('SELECT id FROM nodes WHERE parent_id IS NULL AND type = "Album" AND LOWER(name) = LOWER(?)').get(albumName) as any);

          if (existingAlbum) {
            destNodeId = existingAlbum.id;
          } else {
            const newAlbum = createNode({
              parent_id: parentId,
              type: 'Album',
              name: albumName,
              cover_url: coverUrl || '',
            });
            destNodeId = newAlbum.id;
          }
        } else if (!destNodeId) {
          let uncat = db.query('SELECT id FROM nodes WHERE parent_id IS NULL AND LOWER(name) = "uncategorized"').get() as any;
          if (!uncat) {
            uncat = createNode({ parent_id: null, type: 'Folder', name: 'Uncategorized', cover_url: '' });
          }
          destNodeId = uncat.id;
        }

        const newTrack = createTrack({
          node_id: destNodeId,
          t: title,
          a: artist || 'Unknown Artist',
          al: album || 'Singles & Releases',
          y: 0,
          f: 'Digital Track',
          c: '—',
          bc: '—',
          mb: trackId ? `deezer-${trackId}` : '',
          isrc: isrc || '—',
          len: duration || 0,
          bpm: 0,
          key: '',
          cover_url: coverUrl || '',
        });

        return json({
          success: true,
          track: newTrack,
          destNodeId,
          tree: getFullTree(),
        });
      }

      // 11. Deezer Search: GET /api/deezer/search?q=...
      if (path === '/api/deezer/search' && method === 'GET') {
        const query = url.searchParams.get('q') || '';
        const results = await searchDeezerReleases(query);
        return json(results);
      }

      // 12. Deezer Album Details: GET /api/deezer/album/:id
      const deezerAlbumMatch = path.match(/^\/api\/deezer\/album\/(\d+)$/);
      if (deezerAlbumMatch && method === 'GET') {
        const id = parseInt(deezerAlbumMatch[1], 10);
        const details = await getDeezerReleaseDetails(id);
        return json(details);
      }

      // 12b. Artist Suggested Projects: GET /api/artists/suggestions?name=...
      if (path === '/api/artists/suggestions' && method === 'GET') {
        const name = (url.searchParams.get('name') || '').trim();
        if (!name) return json({ artist: '', projects: [] });
        const projects = await getArtistSuggestedProjects(name);
        return json({ artist: name, projects });
      }

      // 12c. Artist Profile & Information: GET /api/artists/profile?name=...
      if (path === '/api/artists/profile' && method === 'GET') {
        const name = (url.searchParams.get('name') || '').trim();
        if (!name) return json({ name: '', genres: [], socials: [] });
        const profile = await getArtistProfile(name);
        return json(profile);
      }

      // 13. Unified Universal Import: POST /api/releases/import
      if (path === '/api/releases/import' && method === 'POST') {
        const body = await req.json();
        const { source, releaseId, targetNodeId, createAlbumContainer = true, coverUrl } = body;

        if (!source || !releaseId) {
          return errorJson('Missing source or releaseId');
        }

        const parentId = (targetNodeId && targetNodeId !== 'uncategorized' && targetNodeId !== 'root')
          ? targetNodeId
          : null;

        let releaseTitle = 'Untitled Album';
        let releaseCover = coverUrl || '';
        let tracksToInsert: any[] = [];

        if (source === 'discogs') {
          const rel = await getDiscogsReleaseDetails(releaseId);
          releaseTitle = rel.title;
          if (rel.cover_url) releaseCover = rel.cover_url;
          tracksToInsert = rel.tracks.map((t, idx) => ({
            ...t,
            cover_url: t.cover_url || releaseCover,
            sort_order: idx,
          }));
        } else if (source === 'deezer') {
          const rel = await getDeezerReleaseDetails(releaseId);
          releaseTitle = rel.title;
          if (rel.cover_url) releaseCover = rel.cover_url;
          tracksToInsert = rel.tracks.map((t, idx) => ({
            ...t,
            cover_url: t.cover_url || releaseCover,
            sort_order: idx,
          }));
        } else if (source === 'musicbrainz') {
          const rel = await getMusicBrainzReleaseDetails(releaseId);
          releaseTitle = rel.title;
          if (rel.cover_url) releaseCover = rel.cover_url;
          tracksToInsert = rel.tracks.map((t, idx) => ({
            ...t,
            cover_url: t.cover_url || releaseCover,
            sort_order: idx,
          }));
        } else {
          return errorJson(`Unknown source: ${source}`);
        }

        // Enrich missing ISRCs via Deezer fallback
        await Promise.all(
          tracksToInsert.map(async tr => {
            if (!tr.isrc || tr.isrc === '—') {
              try {
                const found = await lookupIsrc(tr.artist, tr.title);
                if (found && found !== '—') tr.isrc = found;
              } catch {}
            }
          })
        );

        let destNodeId = parentId || targetNodeId || '';
        if (createAlbumContainer) {
          const newAlbumNode = createNode({
            parent_id: parentId,
            type: 'Album',
            name: releaseTitle,
            cover_url: releaseCover,
          });
          destNodeId = newAlbumNode.id;
        }

        for (const tr of tracksToInsert) {
          createTrack({
            node_id: destNodeId,
            t: tr.title,
            a: tr.artist,
            al: tr.album,
            y: tr.year,
            f: tr.format,
            c: tr.catalog_no,
            bc: tr.barcode,
            mb: tr.mbid,
            isrc: tr.isrc,
            len: tr.length,
            bpm: tr.bpm,
            key: tr.key,
            sort_order: tr.sort_order,
            cover_url: tr.cover_url || releaseCover,
          });
        }

        const updatedTree = getFullTree();
        return json({ success: true, destNodeId, tree: updatedTree });
      }

      // 14. Discogs Status: GET /api/discogs/status
      if (path === '/api/discogs/status' && method === 'GET') {
        const configured = isDiscogsConfigured();
        return json({ hasToken: configured });
      }

      // 11. Save Discogs Token: POST /api/discogs/token
      if (path === '/api/discogs/token' && method === 'POST') {
        const body = await req.json();
        const token = (body.token || '').trim();
        if (!token) {
          return errorJson('Token cannot be empty');
        }
        setSetting('discogs_token', token);
        return json({ success: true, hasToken: true });
      }

      // 12. Discogs Search: GET /api/discogs/search?q=...
      if (path === '/api/discogs/search' && method === 'GET') {
        const query = url.searchParams.get('q') || '';
        try {
          const results = await searchDiscogsReleases(query);
          return json(results);
        } catch (err: any) {
          if (err.message && err.message.startsWith('NO_TOKEN:')) {
            return errorJson(err.message, 401);
          }
          throw err;
        }
      }

      // 12b. Discogs Bigger Artwork Lookup: GET /api/discogs/artwork?q=...&type=artist|release
      if (path === '/api/discogs/artwork' && method === 'GET') {
        const query = (url.searchParams.get('q') || '').trim();
        const type = (url.searchParams.get('type') === 'artist' ? 'artist' : 'release') as 'artist' | 'release';
        try {
          const artwork = await getDiscogsBiggerArtwork(query, type);
          return json(artwork || { cover_image: '', thumb: '' });
        } catch (err: any) {
          return json({ cover_image: '', thumb: '' });
        }
      }

      // 13. Discogs Release Details: GET /api/discogs/release/:id
      const discogsReleaseMatch = path.match(/^\/api\/discogs\/release\/([^/]+)$/);
      if (discogsReleaseMatch && method === 'GET') {
        const id = discogsReleaseMatch[1];
        const details = await getDiscogsReleaseDetails(id);
        return json(details);
      }

      // 14. Discogs Import: POST /api/discogs/import
      if (path === '/api/discogs/import' && method === 'POST') {
        const body = await req.json();
        const { releaseId, targetNodeId, createAlbumContainer = true } = body;

        if (!releaseId || !targetNodeId) {
          return errorJson('Missing releaseId or targetNodeId');
        }

        const release = await getDiscogsReleaseDetails(releaseId);

        // Enrich missing ISRCs via Deezer fallback
        await Promise.all(
          release.tracks.map(async tr => {
            if (!tr.isrc || tr.isrc === '—') {
              try {
                const found = await lookupIsrc(tr.artist, tr.title);
                if (found && found !== '—') tr.isrc = found;
              } catch {}
            }
          })
        );

        let destNodeId = targetNodeId;
        if (createAlbumContainer) {
          const newAlbumNode = createNode({
            parent_id: targetNodeId,
            type: 'Album',
            name: release.title,
          });
          destNodeId = newAlbumNode.id;
        }

        for (let i = 0; i < release.tracks.length; i++) {
          const tr = release.tracks[i];
          createTrack({
            node_id: destNodeId,
            t: tr.title,
            a: tr.artist,
            al: tr.album,
            y: tr.year,
            f: tr.format,
            c: tr.catalog_no,
            bc: tr.barcode,
            mb: tr.mbid,
            isrc: tr.isrc,
            len: tr.length,
            bpm: tr.bpm,
            key: tr.key,
            sort_order: i,
          });
        }

        const updatedTree = getFullTree();
        return json({ success: true, destNodeId, tree: updatedTree });
      }

      // 15. MusicBrainz Search: GET /api/musicbrainz/search?q=...
      if (path === '/api/musicbrainz/search' && method === 'GET') {
        const query = url.searchParams.get('q') || '';
        try {
          const results = await searchMusicBrainzReleases(query);
          return json(results);
        } catch (err: any) {
          console.warn('[MusicBrainz search error]', err.message);
          return json([]);
        }
      }

      // 11. MusicBrainz Release Details: GET /api/musicbrainz/release/:mbid
      const mbReleaseMatch = path.match(/^\/api\/musicbrainz\/release\/([^/]+)$/);
      if (mbReleaseMatch && method === 'GET') {
        const mbid = mbReleaseMatch[1];
        const details = await getMusicBrainzReleaseDetails(mbid);
        return json(details);
      }

      // 12. MusicBrainz Import: POST /api/musicbrainz/import
      if (path === '/api/musicbrainz/import' && method === 'POST') {
        const body = await req.json();
        const { mbid, targetNodeId, createAlbumContainer = true } = body;

        if (!mbid || !targetNodeId) {
          return errorJson('Missing mbid or targetNodeId');
        }

        const release = await getMusicBrainzReleaseDetails(mbid);

        // Enrich missing ISRCs via Deezer fallback
        await Promise.all(
          release.tracks.map(async tr => {
            if (!tr.isrc || tr.isrc === '—') {
              try {
                const found = await lookupIsrc(tr.artist, tr.title);
                if (found && found !== '—') tr.isrc = found;
              } catch {}
            }
          })
        );

        let destNodeId = targetNodeId;
        if (createAlbumContainer) {
          const newAlbumNode = createNode({
            parent_id: targetNodeId,
            type: 'Album',
            name: release.title,
          });
          destNodeId = newAlbumNode.id;
        }

        for (let i = 0; i < release.tracks.length; i++) {
          const tr = release.tracks[i];
          createTrack({
            node_id: destNodeId,
            t: tr.title,
            a: tr.artist,
            al: tr.album,
            y: tr.year,
            f: tr.format,
            c: tr.catalog_no,
            bc: tr.barcode,
            mb: tr.mbid,
            isrc: tr.isrc,
            len: tr.length,
            bpm: tr.bpm,
            key: tr.key,
            sort_order: i,
          });
        }

        const updatedTree = getFullTree();
        return json({ success: true, destNodeId, tree: updatedTree });
      }

      // 13. Backup / Export: GET /api/export
      if (path === '/api/export' && method === 'GET') {
        const backup = exportLibrary();
        return json(backup);
      }

      // 14. Restore / Import: POST /api/import
      if (path === '/api/import' && method === 'POST') {
        const body = await req.json();
        if (!body.nodes || !body.tracks) {
          return errorJson('Invalid backup format');
        }
        importLibrary(body);
        return json({ success: true, tree: getFullTree() });
      }

      // 14b. Tune My Music Parse: POST /api/import/tunemymusic/parse
      if (path === '/api/import/tunemymusic/parse' && method === 'POST') {
        const body = await req.json();
        const text = (body.text || '').trim();
        console.log(`[API Server] POST /api/import/tunemymusic/parse - ${text.length} chars received`);
        const tracks = parseTuneMyMusicText(text);
        console.log(`[API Server] Parsed ${tracks.length} items from CSV`);
        return json({ success: true, tracks, total: tracks.length });
      }

      // 14c. Tune My Music Connect & Import: POST /api/import/tunemymusic
      if (path === '/api/import/tunemymusic' && method === 'POST') {
        const body = await req.json();
        let tracks = body.tracks;
        if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
          if (body.text) {
            tracks = parseTuneMyMusicText(body.text);
          }
        }
        if (!tracks || tracks.length === 0) {
          console.warn('[API Server] POST /api/import/tunemymusic - No valid tracks found');
          return errorJson('No valid tracks found to import');
        }

        console.log(`[API Server] POST /api/import/tunemymusic - Processing ${tracks.length} items for targetNodeId: ${body.targetNodeId || 'root'}`);
        const result = await connectAndImportTuneMyMusic(tracks, {
          targetNodeId: body.targetNodeId || null,
        });
        console.log(`[API Server] Import response: ${result.importedTracks} tracks saved across ${result.artistsCount} artists.`);
        return json(result);
      }

      // 14d. Settings & Status Tracking API
      const cleanLegacyKeys = (keys: string[]): string[] => {
        const primaryAlbums = new Set<string>();
        keys.forEach(k => {
          if (k.includes(':::') && !k.startsWith('album:::') && !k.startsWith('_:::')) {
            const albumName = k.split(':::')[1];
            if (albumName) primaryAlbums.add(albumName);
          }
        });
        const result = new Set<string>();
        keys.forEach(k => {
          if (k.startsWith('album:::') || k.startsWith('_:::')) {
            const albumName = k.replace(/^(album|_):::/, '');
            if (!primaryAlbums.has(albumName)) {
              result.add(`_:::${albumName}`);
            }
          } else {
            result.add(k);
          }
        });
        return Array.from(result);
      };

      if (path === '/api/settings' && method === 'GET') {
        const statusEnabled = getSetting('status_enabled') === 'true';
        const rawKeys = getSetting('completed_album_keys');
        let completedAlbumKeys: string[] = [];
        try {
          if (rawKeys) completedAlbumKeys = cleanLegacyKeys(JSON.parse(rawKeys));
        } catch {}
        return json({ statusEnabled, completedAlbumKeys });
      }

      if (path === '/api/settings' && method === 'POST') {
        const body = await req.json();
        if (typeof body.statusEnabled === 'boolean') {
          setSetting('status_enabled', body.statusEnabled ? 'true' : 'false');
        }
        if (Array.isArray(body.completedAlbumKeys)) {
          const cleaned = cleanLegacyKeys(body.completedAlbumKeys);
          setSetting('completed_album_keys', JSON.stringify(cleaned));
        }
        const statusEnabled = getSetting('status_enabled') === 'true';
        const rawKeys = getSetting('completed_album_keys');
        let completedAlbumKeys: string[] = [];
        try {
          if (rawKeys) completedAlbumKeys = cleanLegacyKeys(JSON.parse(rawKeys));
        } catch {}
        return json({ success: true, statusEnabled, completedAlbumKeys });
      }

      if (path === '/api/albums/toggle-completed' && method === 'POST') {
        const body = await req.json();
        const keysToAddOrRemove: string[] = Array.isArray(body.keys) ? body.keys : [body.key].filter(Boolean);
        const completed: boolean = body.completed !== false; // default true

        const rawKeys = getSetting('completed_album_keys');
        const currentKeys = new Set<string>();
        try {
          if (rawKeys) cleanLegacyKeys(JSON.parse(rawKeys)).forEach((k: string) => currentKeys.add(k));
        } catch {}

        keysToAddOrRemove.forEach(k => {
          if (completed) {
            currentKeys.add(k);
          } else {
            currentKeys.delete(k);
            // Also delete any fallback/legacy variations
            const albumName = k.includes(':::') ? k.split(':::')[1] : k;
            currentKeys.delete(`album:::${albumName}`);
            currentKeys.delete(`_:::${albumName}`);
          }
        });

        const updatedArray = cleanLegacyKeys(Array.from(currentKeys));
        setSetting('completed_album_keys', JSON.stringify(updatedArray));
        return json({ success: true, completedAlbumKeys: updatedArray });
      }

      // 15. Static fallback if dist exists
      const distFilePath = 'dist' + (path === '/' ? '/index.html' : path);
      const distFile = Bun.file(distFilePath);
      if (await distFile.exists()) {
        return new Response(distFile);
      }

      // SPA fallback for client-side routing
      const indexHtml = Bun.file('dist/index.html');
      if (await indexHtml.exists()) {
        return new Response(indexHtml);
      }

      return errorJson('Not found', 404);
    } catch (err: any) {
      console.error('API Error:', err);
      return errorJson(err.message || 'Internal Server Error', 500);
    }
  },
});

console.log(`[FMSort Server] Running on http://localhost:${PORT}`);
