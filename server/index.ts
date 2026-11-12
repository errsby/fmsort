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
} from './db';
import {
  searchMusicBrainzReleases,
  getMusicBrainzReleaseDetails,
} from './musicbrainz';

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

      // 10. MusicBrainz Search: GET /api/musicbrainz/search?q=...
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
