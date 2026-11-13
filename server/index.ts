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

            // Tier 1: Fast Phase (Deezer releases & artists in ~50ms, grouped into canonical albums)
            let fastRes: any = null;
            try {
              fastRes = await executeFastSearch(query);
              sendEvent('fast', {
                artists: fastRes.artists,
                albums: fastRes.albums,
                counts: {
                  artists: fastRes.artists.length,
                  albums: fastRes.albums.length,
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
                fastRes?.artists || []
              );

              if (isAborted) return;

              sendEvent('discogs', {
                artists: fullRes.artists,
                albums: fullRes.albums,
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
        const tracks = parseTuneMyMusicText(text);
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
          return errorJson('No valid tracks found to import');
        }

        const result = await connectAndImportTuneMyMusic(tracks, {
          targetNodeId: body.targetNodeId || null,
        });
        return json(result);
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
