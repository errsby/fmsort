import {
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
  exportLibrary,
  importLibrary,
  getSetting,
  setSetting,
} from './db';
import {
  searchMusicBrainzReleases,
  getMusicBrainzReleaseDetails,
} from './musicbrainz';
import {
  isDiscogsConfigured,
  searchDiscogsReleases,
  searchDiscogsArtists,
  getDiscogsReleaseDetails,
} from './discogs';
import {
  searchDeezerReleases,
  searchDeezerArtists,
  getDeezerReleaseDetails,
} from './deezer';

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

            // Tier 1: Fast Phase (Deezer releases & artists in ~60-80ms)
            let deezerReleases: any[] = [];
            let deezerArtists: any[] = [];

            try {
              const [dReleases, dArtists] = await Promise.all([
                searchDeezerReleases(query).catch(() => []),
                searchDeezerArtists(query).catch(() => []),
              ]);

              deezerReleases = dReleases.map(d => ({
                source: 'deezer' as const,
                id: d.id,
                title: d.title,
                artist: d.artist,
                year: d.year,
                format: d.format,
                catalog_no: d.catalog_no,
                barcode: d.barcode,
                country: d.country,
                label: d.label,
                thumb: d.thumb,
                track_count: d.track_count,
              }));

              deezerArtists = dArtists.map(a => ({
                source: 'deezer' as const,
                id: a.id,
                name: a.name,
                thumb: a.thumb,
                nb_album: a.nb_album,
              }));

              // Send immediate fast results
              sendEvent('fast', {
                artists: deezerArtists,
                releases: deezerReleases,
                counts: {
                  artists: deezerArtists.length,
                  deezerReleases: deezerReleases.length,
                  discogsReleases: 0,
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

            // Tier 2: Discogs Deep Phase (Physical pressings & vinyl in background)
            try {
              const [discReleases, discArtists] = await Promise.all([
                searchDiscogsReleases(query).catch(() => []),
                searchDiscogsArtists(query).catch(() => []),
              ]);

              if (isAborted) return;

              const mappedDiscogsReleases = discReleases.map(d => ({
                source: 'discogs' as const,
                id: d.id,
                title: d.title,
                artist: d.artist,
                year: d.year,
                format: d.format,
                catalog_no: d.catalog_no,
                barcode: d.barcode,
                country: d.country,
                label: d.label,
                thumb: d.thumb,
                track_count: 0,
              }));

              const mappedDiscogsArtists = discArtists.map(a => ({
                source: 'discogs' as const,
                id: a.id,
                name: a.name,
                thumb: a.thumb,
                nb_album: 0,
              }));

              // Merge and deduplicate artists
              const artistMap = new Map<string, any>();
              for (const a of [...mappedDiscogsArtists, ...deezerArtists]) {
                const cleanName = a.name.replace(/\s\(\d+\)$/, '').trim();
                const normKey = cleanName.toLowerCase();
                if (!artistMap.has(normKey)) {
                  artistMap.set(normKey, { ...a, name: cleanName });
                } else {
                  const existing = artistMap.get(normKey);
                  if (!existing.thumb && a.thumb) existing.thumb = a.thumb;
                  if (a.nb_album) existing.nb_album = a.nb_album;
                }
              }

              const combinedArtists = Array.from(artistMap.values());
              const combinedReleases = [...mappedDiscogsReleases, ...deezerReleases];

              sendEvent('discogs', {
                artists: combinedArtists,
                releases: combinedReleases,
                counts: {
                  artists: combinedArtists.length,
                  deezerReleases: deezerReleases.length,
                  discogsReleases: mappedDiscogsReleases.length,
                },
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
          return json({ artists: [], releases: [], discogsConfigured: discogsEnabled });
        }

        // 1. Parallel search: Deezer releases & artists + Discogs releases & artists
        const promises: Promise<any>[] = [
          // [0] Deezer releases
          searchDeezerReleases(query)
            .then(items =>
              items.map(d => ({
                source: 'deezer' as const,
                id: d.id,
                title: d.title,
                artist: d.artist,
                year: d.year,
                format: d.format,
                catalog_no: d.catalog_no,
                barcode: d.barcode,
                country: d.country,
                label: d.label,
                thumb: d.thumb,
                track_count: d.track_count,
              }))
            )
            .catch(err => {
              console.warn('[Hybrid] Deezer releases error:', err.message);
              return [];
            }),
          // [1] Deezer artists
          searchDeezerArtists(query)
            .then(items =>
              items.map(a => ({
                source: 'deezer' as const,
                id: a.id,
                name: a.name,
                thumb: a.thumb,
                nb_album: a.nb_album,
              }))
            )
            .catch(err => {
              console.warn('[Hybrid] Deezer artists error:', err.message);
              return [];
            }),
        ];

        if (discogsEnabled) {
          // [2] Discogs releases
          promises.push(
            searchDiscogsReleases(query)
              .then(items =>
                items.map(d => ({
                  source: 'discogs' as const,
                  id: d.id,
                  title: d.title,
                  artist: d.artist,
                  year: d.year,
                  format: d.format,
                  catalog_no: d.catalog_no,
                  barcode: d.barcode,
                  country: d.country,
                  label: d.label,
                  thumb: d.thumb,
                  track_count: 0,
                }))
              )
              .catch(err => {
                console.warn('[Hybrid] Discogs releases error:', err.message);
                return [];
              })
          );
          // [3] Discogs artists
          promises.push(
            searchDiscogsArtists(query)
              .then(items =>
                items.map(a => ({
                  source: 'discogs' as const,
                  id: a.id,
                  name: a.name,
                  thumb: a.thumb,
                  nb_album: 0,
                }))
              )
              .catch(err => {
                console.warn('[Hybrid] Discogs artists error:', err.message);
                return [];
              })
          );
        }

        const settled = await Promise.all(promises);
        const deezerReleases = settled[0] || [];
        const deezerArtists = settled[1] || [];
        const discogsReleases = discogsEnabled ? (settled[2] || []) : [];
        const discogsArtists = discogsEnabled ? (settled[3] || []) : [];

        // Deduplicate artists by normalized name while preserving sources
        const artistMap = new Map<string, any>();
        for (const a of [...discogsArtists, ...deezerArtists]) {
          // Clean "(2)", "(3)" suffix from Discogs titles if present
          const cleanName = a.name.replace(/\s\(\d+\)$/, '').trim();
          const normKey = cleanName.toLowerCase();
          if (!artistMap.has(normKey)) {
            artistMap.set(normKey, { ...a, name: cleanName });
          } else {
            // If existing doesn't have thumb, take this one
            const existing = artistMap.get(normKey);
            if (!existing.thumb && a.thumb) existing.thumb = a.thumb;
            if (a.nb_album) existing.nb_album = a.nb_album;
          }
        }
        const combinedArtists = Array.from(artistMap.values());

        // Combine: Discogs physical pressings + Deezer digital releases
        const combinedReleases = [...discogsReleases, ...deezerReleases];

        return json({
          artists: combinedArtists,
          releases: combinedReleases,
          discogsConfigured: discogsEnabled,
          counts: {
            artists: combinedArtists.length,
            discogsReleases: discogsReleases.length,
            deezerReleases: deezerReleases.length,
          },
        });
      }

      // 11. Add Artist Container: POST /api/artists/import
      if (path === '/api/artists/import' && method === 'POST') {
        const body = await req.json();
        const { name, targetNodeId, thumb, cover_url } = body;
        if (!name || !targetNodeId) {
          return errorJson('Missing artist name or targetNodeId');
        }

        const newArtistNode = createNode({
          parent_id: targetNodeId,
          type: 'Artist',
          name: name.trim(),
          cover_url: thumb || cover_url || '',
        });

        const updatedTree = getFullTree();
        return json({ success: true, destNodeId: newArtistNode.id, tree: updatedTree });
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

      // 13. Unified Universal Import: POST /api/releases/import
      if (path === '/api/releases/import' && method === 'POST') {
        const body = await req.json();
        const { source, releaseId, targetNodeId, createAlbumContainer = true, coverUrl } = body;

        if (!source || !releaseId || !targetNodeId) {
          return errorJson('Missing source, releaseId, or targetNodeId');
        }

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

        let destNodeId = targetNodeId;
        if (createAlbumContainer) {
          const newAlbumNode = createNode({
            parent_id: targetNodeId,
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
