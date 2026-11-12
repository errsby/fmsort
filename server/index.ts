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
  getDiscogsReleaseDetails,
} from './discogs';
import {
  searchDeezerReleases,
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

      // 10. Hybrid Music Search: GET /api/search/hybrid?q=...
      if (path === '/api/search/hybrid' && method === 'GET') {
        const query = (url.searchParams.get('q') || '').trim();
        const discogsEnabled = isDiscogsConfigured();

        if (!query) {
          return json({ results: [], discogsConfigured: discogsEnabled });
        }

        const promises: Promise<any>[] = [
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
              console.warn('[Hybrid] Deezer search error:', err.message);
              return [];
            }),
        ];

        if (discogsEnabled) {
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
                console.warn('[Hybrid] Discogs search error:', err.message);
                return [];
              })
          );
        }

        const settled = await Promise.all(promises);
        const deezerItems = settled[0] || [];
        const discogsItems = settled[1] || [];

        // Combine: Discogs physical variants + Deezer digital releases
        const combined = [...discogsItems, ...deezerItems];
        return json({
          results: combined,
          discogsConfigured: discogsEnabled,
          counts: {
            discogs: discogsItems.length,
            deezer: deezerItems.length,
          },
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

      // 13. Unified Universal Import: POST /api/releases/import
      if (path === '/api/releases/import' && method === 'POST') {
        const body = await req.json();
        const { source, releaseId, targetNodeId, createAlbumContainer = true } = body;

        if (!source || !releaseId || !targetNodeId) {
          return errorJson('Missing source, releaseId, or targetNodeId');
        }

        let releaseTitle = 'Untitled Album';
        let tracksToInsert: any[] = [];

        if (source === 'discogs') {
          const rel = await getDiscogsReleaseDetails(releaseId);
          releaseTitle = rel.title;
          tracksToInsert = rel.tracks.map((t, idx) => ({
            ...t,
            sort_order: idx,
          }));
        } else if (source === 'deezer') {
          const rel = await getDeezerReleaseDetails(releaseId);
          releaseTitle = rel.title;
          tracksToInsert = rel.tracks.map((t, idx) => ({
            ...t,
            sort_order: idx,
          }));
        } else if (source === 'musicbrainz') {
          const rel = await getMusicBrainzReleaseDetails(releaseId);
          releaseTitle = rel.title;
          tracksToInsert = rel.tracks.map((t, idx) => ({
            ...t,
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
        const results = await searchMusicBrainzReleases(query);
        return json(results);
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
