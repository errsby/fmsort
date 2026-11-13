import {
  executeFastSearch,
  executeEnrichedSearch,
  executeHybridSearch,
} from '../server/search';
import {
  searchDeezerReleases,
  searchDeezerArtists,
  getDeezerReleaseDetails,
  lookupIsrc,
  getArtistSuggestedProjects,
} from '../server/deezer';
import {
  searchDiscogsReleases,
  getDiscogsReleaseDetails,
  getDiscogsBiggerArtwork,
  isDiscogsConfigured,
} from '../server/discogs';
import {
  searchMusicBrainzReleases,
  getMusicBrainzReleaseDetails,
} from '../server/musicbrainz';
import { getArtistProfile } from '../server/artistProfile';
import { parseTuneMyMusicText } from '../server/tunemymusic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Discogs-Token',
};

function json(data: any, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

function errorJson(message: string, status = 400) {
  return json({ error: message }, status);
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  if (method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    // 1. Progressive Streaming Search (SSE): GET /api/search/stream?q=...
    if (path.endsWith('/api/search/stream') && method === 'GET') {
      const query = (url.searchParams.get('q') || '').trim();
      const discogsEnabled = isDiscogsConfigured();

      if (!query) {
        return new Response('event: done\ndata: {}\n\n', {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            ...CORS_HEADERS,
          },
        });
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          let isAborted = false;
          req.signal?.addEventListener('abort', () => {
            isAborted = true;
          });

          const sendEvent = (event: string, data: any) => {
            if (isAborted) return;
            try {
              controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
            } catch {}
          };

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
            console.warn('[Vercel Search Fast Error]', err.message);
          }

          if (isAborted || !discogsEnabled) {
            sendEvent('done', { done: true });
            try { controller.close(); } catch {}
            return;
          }

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
            console.warn('[Vercel Search Discogs Error]', err.message);
          }

          sendEvent('done', { done: true });
          try { controller.close(); } catch {}
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          ...CORS_HEADERS,
        },
      });
    }

    // 2. Hybrid Search: GET /api/search/hybrid?q=...
    if (path.endsWith('/api/search/hybrid') && method === 'GET') {
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
        releases: result.albums.map((a: any) => a.versions[0]).filter(Boolean),
        counts: result.counts,
        discogsConfigured: result.discogsConfigured,
      });
    }

    // 3. Artist Suggestions: GET /api/artists/suggestions?name=...
    if (path.endsWith('/api/artists/suggestions') && method === 'GET') {
      const name = url.searchParams.get('name') || '';
      if (!name.trim()) return json({ projects: [] });
      const projects = await getArtistSuggestedProjects(name);
      return json({ projects });
    }

    // 4. Artist Profile: GET /api/artists/profile?name=...
    if (path.endsWith('/api/artists/profile') && method === 'GET') {
      const name = url.searchParams.get('name') || '';
      if (!name.trim()) return errorJson('Artist name required', 400);
      const profile = await getArtistProfile(name);
      return json(profile);
    }

    // 5. Discogs Status & Search
    if (path.endsWith('/api/discogs/status') && method === 'GET') {
      return json({ configured: isDiscogsConfigured() });
    }

    if (path.endsWith('/api/discogs/search') && method === 'GET') {
      const q = url.searchParams.get('q') || '';
      const results = await searchDiscogsReleases(q);
      return json(results);
    }

    if (path.endsWith('/api/discogs/artwork') && method === 'GET') {
      const q = url.searchParams.get('q') || '';
      const type = (url.searchParams.get('type') as 'artist' | 'release') || 'release';
      const artwork = await getDiscogsBiggerArtwork(q, type);
      return json(artwork);
    }

    // 6. Release Tracklists
    const discogsRelMatch = path.match(/\/api\/discogs\/release\/([0-9]+)/);
    if (discogsRelMatch?.[1] && method === 'GET') {
      const id = parseInt(discogsRelMatch[1], 10);
      const details = await getDiscogsReleaseDetails(id);
      return json(details);
    }

    const deezerRelMatch = path.match(/\/api\/deezer\/album\/([0-9]+)/);
    if (deezerRelMatch?.[1] && method === 'GET') {
      const id = parseInt(deezerRelMatch[1], 10);
      const details = await getDeezerReleaseDetails(id);
      return json(details);
    }

    const mbRelMatch = path.match(/\/api\/musicbrainz\/release\/([a-zA-Z0-9-]+)/);
    if (mbRelMatch?.[1] && method === 'GET') {
      const mbid = mbRelMatch[1];
      const details = await getMusicBrainzReleaseDetails(mbid);
      return json(details);
    }

    if (path.endsWith('/api/musicbrainz/search') && method === 'GET') {
      const q = url.searchParams.get('q') || '';
      const results = await searchMusicBrainzReleases(q);
      return json(results);
    }

    // 7. TuneMyMusic Parsing: POST /api/import/tunemymusic/parse
    if (path.endsWith('/api/import/tunemymusic/parse') && method === 'POST') {
      const body = await req.json();
      const text = body.text || '';
      const parsed = parseTuneMyMusicText(text);
      return json(parsed);
    }

    // 8. ISRC Enrichment: POST /api/tracks/enrich-isrc
    if (path.endsWith('/api/tracks/enrich-isrc') && method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const { artist, title, isrc } = body;
      if (isrc && isrc !== '—') {
        return json({ isrc, updated: false });
      }
      if (artist && title) {
        const found = await lookupIsrc(artist, title);
        if (found) {
          return json({ isrc: found, updated: true });
        }
      }
      return json({ isrc: '', updated: false });
    }

    return errorJson(`Endpoint not found: ${path}`, 404);
  } catch (err: any) {
    console.error('[Vercel Function Error]', err);
    return errorJson(err.message || 'Internal Server Error', 500);
  }
}
