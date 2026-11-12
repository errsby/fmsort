import { getSetting } from './db';

interface DiscogsRateLimitItem {
  url: string;
  token: string;
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
}

const queue: DiscogsRateLimitItem[] = [];
let isProcessingQueue = false;
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 1050; // Discogs allows 60 req/min

const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes

export function getDiscogsToken(): string | null {
  const envToken = process.env.DISCOGS_TOKEN;
  if (envToken && envToken.trim()) return envToken.trim();
  const dbToken = getSetting('discogs_token');
  if (dbToken && dbToken.trim()) return dbToken.trim();
  return null;
}

async function processQueue() {
  if (isProcessingQueue || queue.length === 0) return;
  isProcessingQueue = true;

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break;

    const now = Date.now();
    const timeSinceLast = now - lastRequestTime;
    if (timeSinceLast < MIN_REQUEST_INTERVAL_MS) {
      await new Promise(r => setTimeout(r, MIN_REQUEST_INTERVAL_MS - timeSinceLast));
    }

    try {
      lastRequestTime = Date.now();
      const res = await fetch(item.url, {
        headers: {
          'User-Agent': 'FMSort/1.0.0 ( +https://github.com/err/fmsort )',
          'Authorization': `Discogs token=${item.token}`,
          'Accept': 'application/json',
        },
      });

      if (res.status === 429) {
        // Rate limited - wait 2 seconds and retry
        console.warn('[Discogs] Rate limit hit (429), pausing 2s...');
        await new Promise(r => setTimeout(r, 2000));
        queue.unshift(item);
        continue;
      }

      if (!res.ok) {
        throw new Error(`Discogs API error: ${res.status} ${res.statusText}`);
      }

      const json = await res.json();
      cache.set(item.url, { data: json, timestamp: Date.now() });
      item.resolve(json);
    } catch (err) {
      item.reject(err);
    }
  }

  isProcessingQueue = false;
}

function fetchDiscogsWithRateLimit<T>(url: string, token: string): Promise<T> {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return Promise.resolve(cached.data as T);
  }

  return new Promise<T>((resolve, reject) => {
    queue.push({ url, token, resolve, reject });
    processQueue();
  });
}

export function parseDuration(durationStr?: string): number {
  if (!durationStr || typeof durationStr !== 'string') return 0;
  const parts = durationStr.trim().split(':').map(p => parseInt(p, 10));
  if (parts.some(isNaN)) return 0;

  if (parts.length === 3) {
    // HH:MM:SS
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    // MM:SS
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 1) {
    return parts[0];
  }
  return 0;
}

export interface DiscogsReleaseSummary {
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
}

export interface DiscogsTrackDetail {
  title: string;
  artist: string;
  album: string;
  year: number;
  format: string;
  catalog_no: string;
  barcode: string;
  mbid: string; // Discogs ID identifier
  isrc: string;
  length: number; // in seconds
  bpm: number;
  key: string;
}

export interface DiscogsReleaseDetail {
  id: number;
  title: string;
  artist: string;
  year: number;
  format: string;
  catalog_no: string;
  barcode: string;
  label: string;
  tracks: DiscogsTrackDetail[];
}

export async function searchDiscogsReleases(query: string): Promise<DiscogsReleaseSummary[]> {
  const token = getDiscogsToken();
  if (!token) {
    throw new Error('NO_TOKEN: Please provide a Discogs Personal Access Token to search.');
  }

  const cleanQ = query.trim();
  if (!cleanQ) return [];

  const url = `https://api.discogs.com/database/search?q=${encodeURIComponent(cleanQ)}&type=release&per_page=30`;
  const data = await fetchDiscogsWithRateLimit<any>(url, token);

  if (!data || !Array.isArray(data.results)) {
    return [];
  }

  return data.results.map((r: any) => {
    let artist = 'Unknown Artist';
    let albumTitle = r.title || 'Untitled';

    // Discogs search results often format title as "Artist - Title"
    if (r.title && r.title.includes(' - ')) {
      const parts = r.title.split(' - ');
      artist = parts[0].trim();
      albumTitle = parts.slice(1).join(' - ').trim();
    }

    const year = r.year ? parseInt(r.year, 10) || 0 : 0;
    const format = Array.isArray(r.format) ? r.format.join(', ') : r.format || 'Release';
    const catalog_no = r.catno || '—';
    const barcode = Array.isArray(r.barcode) && r.barcode.length > 0 ? r.barcode[0] : (r.barcode || '—');
    const label = Array.isArray(r.label) && r.label.length > 0 ? r.label[0] : (r.label || '');

    return {
      id: r.id,
      title: albumTitle,
      artist,
      year,
      format,
      catalog_no,
      barcode,
      country: r.country || '',
      label,
      thumb: r.thumb || '',
    };
  });
}

export async function getDiscogsReleaseDetails(releaseId: string | number): Promise<DiscogsReleaseDetail> {
  const token = getDiscogsToken();
  if (!token) {
    throw new Error('NO_TOKEN: Please provide a Discogs Personal Access Token.');
  }

  const url = `https://api.discogs.com/releases/${releaseId}`;
  const data = await fetchDiscogsWithRateLimit<any>(url, token);

  const albumTitle = data.title || 'Untitled';
  const albumArtist = (data.artists || []).map((a: any) => a.name).join(', ') || 'Unknown Artist';
  const year = data.year || (data.released ? parseInt(data.released.slice(0, 4), 10) : 0) || 0;

  // Format description
  let formatName = 'Release';
  if (Array.isArray(data.formats) && data.formats.length > 0) {
    const f = data.formats[0];
    const descs = Array.isArray(f.descriptions) ? f.descriptions.join(', ') : '';
    formatName = `${f.name || 'Release'}${descs ? ` (${descs})` : ''}`;
  }

  // Label & Catalog
  let catalog_no = '—';
  let labelName = '';
  if (Array.isArray(data.labels) && data.labels.length > 0) {
    const l = data.labels[0];
    if (l.catno) catalog_no = l.catno;
    if (l.name) labelName = l.name;
  }

  // Barcode / ISRC from identifiers
  let barcode = '—';
  let releaseIsrc = '—';
  if (Array.isArray(data.identifiers)) {
    const bc = data.identifiers.find((i: any) => i.type && i.type.toLowerCase().includes('barcode'));
    if (bc && bc.value) barcode = bc.value;

    const is = data.identifiers.find((i: any) => i.type && i.type.toLowerCase().includes('isrc'));
    if (is && is.value) releaseIsrc = is.value;
  }

  const tracks: DiscogsTrackDetail[] = [];
  const tracklist = data.tracklist || [];

  for (const tr of tracklist) {
    // Discogs tracklist includes tracks and sometimes headings/index tracks
    if (tr.type_ && tr.type_ !== 'track') continue;

    const trackTitle = tr.title || 'Untitled Track';
    let trackArtist = albumArtist;
    if (Array.isArray(tr.artists) && tr.artists.length > 0) {
      trackArtist = tr.artists.map((a: any) => a.name).join(', ');
    }

    const durationSeconds = parseDuration(tr.duration);

    tracks.push({
      title: trackTitle,
      artist: trackArtist,
      album: albumTitle,
      year,
      format: formatName,
      catalog_no,
      barcode,
      mbid: `discogs-${data.id}`,
      isrc: releaseIsrc,
      length: durationSeconds,
      bpm: 0,
      key: '',
    });
  }

  return {
    id: data.id,
    title: albumTitle,
    artist: albumArtist,
    year,
    format: formatName,
    catalog_no,
    barcode,
    label: labelName,
    tracks,
  };
}
