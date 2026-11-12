/**
 * Deezer API Service - Instant, Key-less Music Search & Tracklists
 */

export interface DeezerArtistSummary {
  id: number;
  name: string;
  thumb: string;
  nb_album: number;
}

export async function searchDeezerArtists(query: string): Promise<DeezerArtistSummary[]> {
  const cleanQ = query.trim();
  if (!cleanQ) return [];

  const url = `https://api.deezer.com/search/artist?q=${encodeURIComponent(cleanQ)}&limit=6`;
  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'FMSort/1.0.0 ( https://github.com/err/fmsort )',
      'Accept': 'application/json',
    },
  });

  if (!res.ok) {
    return [];
  }

  const json = await res.json();
  if (!json || !Array.isArray(json.data)) {
    return [];
  }

  const results: DeezerArtistSummary[] = json.data.map((item: any) => ({
    id: item.id,
    name: item.name || 'Unknown Artist',
    thumb: item.picture_small || item.picture_medium || '',
    nb_album: item.nb_album || 0,
  }));

  cache.set(url, { data: results, timestamp: Date.now() });
  return results;
}

export interface DeezerReleaseSummary {
  id: number;
  title: string;
  artist: string;
  year: number;
  format: string;
  catalog_no: string;
  barcode: string;
  country: string;
  label: string;
  thumb: string;
  track_count: number;
}

export interface DeezerTrackDetail {
  title: string;
  artist: string;
  album: string;
  year: number;
  format: string;
  catalog_no: string;
  barcode: string;
  mbid: string; // deezer-{id}
  isrc: string;
  length: number; // in seconds
  bpm: number;
  key: string;
  cover_url?: string;
}

export interface DeezerReleaseDetail {
  id: number;
  title: string;
  artist: string;
  year: number;
  format: string;
  catalog_no: string;
  barcode: string;
  label: string;
  cover_url: string;
  tracks: DeezerTrackDetail[];
}

const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 1000 * 60 * 30; // 30 mins

export async function searchDeezerReleases(query: string): Promise<DeezerReleaseSummary[]> {
  const cleanQ = query.trim();
  if (!cleanQ) return [];

  const url = `https://api.deezer.com/search/album?q=${encodeURIComponent(cleanQ)}&limit=25`;
  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'FMSort/1.0.0 ( https://github.com/err/fmsort )',
      'Accept': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Deezer API error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  if (!json || !Array.isArray(json.data)) {
    return [];
  }

  const results: DeezerReleaseSummary[] = json.data.map((item: any) => {
    return {
      id: item.id,
      title: item.title || 'Untitled',
      artist: item.artist?.name || 'Unknown Artist',
      year: 0, // Deezer search returns year in album detail or we extract if present
      format: 'Digital Release',
      catalog_no: '—',
      barcode: '—',
      country: '',
      label: '',
      thumb: item.cover_small || item.cover_medium || '',
      track_count: item.nb_tracks || 0,
    };
  });

  cache.set(url, { data: results, timestamp: Date.now() });
  return results;
}

export async function getDeezerReleaseDetails(albumId: string | number): Promise<DeezerReleaseDetail> {
  const url = `https://api.deezer.com/album/${albumId}`;
  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'FMSort/1.0.0 ( https://github.com/err/fmsort )',
      'Accept': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Deezer album error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const albumTitle = data.title || 'Untitled';
  const albumArtist = data.artist?.name || 'Unknown Artist';
  let year = 0;
  if (data.release_date) {
    const match = data.release_date.match(/^(\d{4})/);
    if (match) year = parseInt(match[1], 10);
  }

  const barcode = data.upc || '—';
  const label = data.label || '';
  const tracks: DeezerTrackDetail[] = [];
  const tracklist = data.tracks?.data || [];

  const coverUrl = data.cover_medium || data.cover_big || data.cover_small || '';

  // Fetch real verified ISRCs for each track in parallel
  const trackIsrcMap = new Map<number, string>();
  await Promise.all(
    tracklist.map(async (tr: any) => {
      try {
        const trackRes = await fetch(`https://api.deezer.com/track/${tr.id}`, {
          headers: {
            'User-Agent': 'FMSort/1.0.0 ( https://github.com/err/fmsort )',
            'Accept': 'application/json',
          },
        });
        if (trackRes.ok) {
          const tData = await trackRes.json();
          if (tData.isrc) trackIsrcMap.set(tr.id, tData.isrc);
        }
      } catch {}
    })
  );

  for (const tr of tracklist) {
    const trackTitle = tr.title || tr.title_short || 'Untitled Track';
    const trackArtist = tr.artist?.name || albumArtist;
    const lengthSeconds = tr.duration || 0;
    const isrc = trackIsrcMap.get(tr.id) || tr.isrc || '—';

    tracks.push({
      title: trackTitle,
      artist: trackArtist,
      album: albumTitle,
      year,
      format: 'Digital',
      catalog_no: '—',
      barcode,
      mbid: `deezer-${tr.id}`,
      isrc,
      length: lengthSeconds,
      bpm: tr.bpm || 0,
      key: '',
      cover_url: coverUrl,
    });
  }

  const detail: DeezerReleaseDetail = {
    id: data.id,
    title: albumTitle,
    artist: albumArtist,
    year,
    format: 'Digital Album',
    catalog_no: '—',
    barcode,
    label,
    cover_url: coverUrl,
    tracks,
  };

  cache.set(url, { data: detail, timestamp: Date.now() });
  return detail;
}

/**
 * Universal ISRC Lookup fallback for any artist + track title.
 * Queries Deezer's catalog to find the official 12-character ISRC code.
 */
export async function lookupIsrc(artist: string, title: string): Promise<string> {
  const cleanArtist = (artist || '').replace(/\s\(\d+\)$/, '').trim();
  const cleanTitle = (title || '')
    .replace(/\s\([^)]*mix[^)]*\)/i, '')
    .replace(/\s\(feat\..*?\)/i, '')
    .replace(/^\d+[\s.-]+/, '')
    .trim();
  const q = `${cleanArtist} ${cleanTitle}`.trim();
  if (!q) return '—';

  const cacheKey = `isrc:${q.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const searchUrl = `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=1`;
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'FMSort/1.0.0 ( https://github.com/err/fmsort )',
        'Accept': 'application/json',
      },
    });
    if (!res.ok) return '—';
    const sData = await res.json();
    if (!sData.data || !Array.isArray(sData.data) || sData.data.length === 0) return '—';

    const trackId = sData.data[0].id;
    const trackRes = await fetch(`https://api.deezer.com/track/${trackId}`, {
      headers: {
        'User-Agent': 'FMSort/1.0.0 ( https://github.com/err/fmsort )',
        'Accept': 'application/json',
      },
    });
    if (!trackRes.ok) return '—';
    const tData = await trackRes.json();
    const isrc = (tData.isrc || '').trim() || '—';
    if (isrc && isrc !== '—') {
      cache.set(cacheKey, { data: isrc, timestamp: Date.now() });
    }
    return isrc;
  } catch (err: any) {
    console.warn('[Deezer ISRC lookup error]', err.message);
    return '—';
  }
}
