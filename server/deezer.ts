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

  for (const tr of tracklist) {
    const trackTitle = tr.title || tr.title_short || 'Untitled Track';
    const trackArtist = tr.artist?.name || albumArtist;
    const lengthSeconds = tr.duration || 0;
    const isrc = tr.isrc || '—';

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
    tracks,
  };

  cache.set(url, { data: detail, timestamp: Date.now() });
  return detail;
}
