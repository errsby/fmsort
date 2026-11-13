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

export interface DeezerTrackSummary {
  id: number;
  title: string;
  artist: string;
  album: string;
  duration: number;
  cover: string;
  preview: string;
  isrc?: string;
  year?: number;
}

/**
 * Searches Deezer catalog for individual tracks matching query.
 */
export async function searchDeezerTracks(query: string): Promise<DeezerTrackSummary[]> {
  const q = query.trim();
  if (!q) return [];
  const cacheKey = `tracks:${q.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const url = `https://api.deezer.com/search/track?q=${encodeURIComponent(q)}&limit=25`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'FMSort/1.0.0 ( https://github.com/err/fmsort )',
        'Accept': 'application/json',
      },
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.data || !Array.isArray(data.data)) return [];

    const tracks: DeezerTrackSummary[] = data.data.map((t: any) => ({
      id: t.id,
      title: t.title || t.title_short || 'Untitled',
      artist: t.artist?.name || 'Unknown Artist',
      album: t.album?.title || 'Singles & Releases',
      duration: t.duration || 0,
      cover: t.album?.cover_medium || t.album?.cover || t.artist?.picture_medium || '',
      preview: t.preview || '',
      isrc: t.isrc || '',
    }));

    cache.set(cacheKey, { data: tracks, timestamp: Date.now() });
    return tracks;
  } catch (err: any) {
    console.warn('[Deezer track search error]', err.message);
    return [];
  }
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
  preview?: string;
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
      preview: tr.preview || '',
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

export async function getArtistSuggestedProjects(artistName: string): Promise<SuggestedProject[]> {
  const cleanQ = (artistName || '').trim();
  if (!cleanQ) return [];

  const cacheKey = `artist_projects_${cleanQ.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const projects: SuggestedProject[] = [];
  const seenTitles = new Set<string>();
  const normKey = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

  try {
    let artistId: number | null = null;
    let canonicalArtistName = cleanQ;

    // Search Deezer for artist
    let aRes = await fetch(`https://api.deezer.com/search/artist?q="${encodeURIComponent(cleanQ)}"&limit=5`, {
      headers: {
        'User-Agent': 'FMSort/1.0.0 ( https://github.com/err/fmsort )',
        'Accept': 'application/json',
      },
    });

    if (aRes.ok) {
      const aJson: any = await aRes.json();
      if (Array.isArray(aJson.data) && aJson.data.length > 0) {
        const match = aJson.data.find((a: any) => a.name.toLowerCase() === cleanQ.toLowerCase()) || aJson.data[0];
        if (match) {
          artistId = match.id;
          canonicalArtistName = match.name;
        }
      }
    }

    if (!artistId) {
      aRes = await fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(cleanQ)}&limit=5`, {
        headers: {
          'User-Agent': 'FMSort/1.0.0 ( https://github.com/err/fmsort )',
          'Accept': 'application/json',
        },
      });
      if (aRes.ok) {
        const aJson: any = await aRes.json();
        if (Array.isArray(aJson.data) && aJson.data.length > 0) {
          const match = aJson.data.find((a: any) => a.name.toLowerCase() === cleanQ.toLowerCase()) || aJson.data[0];
          if (match) {
            artistId = match.id;
            canonicalArtistName = match.name;
          }
        }
      }
    }

    if (artistId) {
      const albRes = await fetch(`https://api.deezer.com/artist/${artistId}/albums?limit=50`, {
        headers: {
          'User-Agent': 'FMSort/1.0.0 ( https://github.com/err/fmsort )',
          'Accept': 'application/json',
        },
      });

      if (albRes.ok) {
        const albJson: any = await albRes.json();
        if (Array.isArray(albJson.data)) {
          for (const item of albJson.data) {
            const rawTitle = (item.title || '').trim();
            if (!rawTitle) continue;
            const nKey = normKey(rawTitle);
            if (seenTitles.has(nKey)) continue;
            seenTitles.add(nKey);

            const year = item.release_date ? parseInt(item.release_date.slice(0, 4), 10) || 0 : 0;
            projects.push({
              id: item.id,
              source: 'deezer',
              title: rawTitle,
              artist: canonicalArtistName,
              year,
              release_date: item.release_date || '',
              record_type: (item.record_type || 'album').toLowerCase(),
              cover_url: item.cover_xl || item.cover_big || item.cover_medium || item.cover_small || '',
              thumb: item.cover_medium || item.cover_small || '',
              track_count: item.nb_tracks || 0,
            });
          }
        }
      }
    }

    if (projects.length === 0) {
      const rels = await searchDeezerReleases(cleanQ).catch(() => []);
      for (const r of rels) {
        const nKey = normKey(r.title);
        if (seenTitles.has(nKey)) continue;
        seenTitles.add(nKey);
        projects.push({
          id: r.id,
          source: 'deezer',
          title: r.title,
          artist: r.artist || canonicalArtistName,
          year: r.year || 0,
          record_type: 'album',
          cover_url: r.thumb || '',
          thumb: r.thumb || '',
          track_count: r.track_count || 0,
        });
      }
    }

    const typePriority: Record<string, number> = {
      album: 1,
      ep: 2,
      single: 3,
      compile: 4,
    };

    projects.sort((a, b) => {
      const prioA = typePriority[a.record_type] ?? 5;
      const prioB = typePriority[b.record_type] ?? 5;
      if (prioA !== prioB) return prioA - prioB;
      return (b.year || 0) - (a.year || 0);
    });

    cache.set(cacheKey, { data: projects, timestamp: Date.now() });
    return projects;
  } catch (err: any) {
    console.warn('[getArtistSuggestedProjects error]', err.message);
    return [];
  }
}
