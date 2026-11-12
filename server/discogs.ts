import { getSetting } from './db';

interface DiscogsRateLimitItem {
  url: string;
  authHeader: string;
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
}

const queue: DiscogsRateLimitItem[] = [];
let isProcessingQueue = false;
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 1050; // Discogs allows 60 req/min

const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes

export function getDiscogsAuthHeader(): string | null {
  // 1. Personal Access Token from env or database
  const envToken = process.env.DISCOGS_TOKEN;
  if (envToken && envToken.trim()) {
    return `Discogs token=${envToken.trim()}`;
  }
  const dbToken = getSetting('discogs_token');
  if (dbToken && dbToken.trim()) {
    return `Discogs token=${dbToken.trim()}`;
  }

  // 2. Dev App Consumer Key & Consumer Secret from env or database
  const key = process.env.DISCOGS_KEY || getSetting('discogs_key');
  const secret = process.env.DISCOGS_SECRET || getSetting('discogs_secret');
  if (key && secret && key.trim() && secret.trim()) {
    return `Discogs key=${key.trim()}, secret=${secret.trim()}`;
  }

  return null;
}

export function isDiscogsConfigured(): boolean {
  return getDiscogsAuthHeader() !== null;
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
          'Authorization': item.authHeader,
          'Accept': 'application/json',
        },
      });

      if (res.status === 429) {
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

function fetchDiscogsWithRateLimit<T>(url: string, authHeader: string): Promise<T> {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return Promise.resolve(cached.data as T);
  }

  return new Promise<T>((resolve, reject) => {
    queue.push({ url, authHeader, resolve, reject });
    processQueue();
  });
}

export function parseDuration(durationStr?: string): number {
  if (!durationStr || typeof durationStr !== 'string') return 0;
  const parts = durationStr.trim().split(':').map(p => parseInt(p, 10));
  if (parts.some(isNaN)) return 0;

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
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

export interface DiscogsArtistSummary {
  id: number;
  name: string;
  thumb: string;
}

export async function searchDiscogsArtists(query: string): Promise<DiscogsArtistSummary[]> {
  const authHeader = getDiscogsAuthHeader();
  if (!authHeader) return [];

  const cleanQ = query.trim();
  if (!cleanQ) return [];

  const url = `https://api.discogs.com/database/search?q=${encodeURIComponent(cleanQ)}&type=artist&per_page=6`;
  const data = await fetchDiscogsWithRateLimit<any>(url, authHeader);

  if (!data || !Array.isArray(data.results)) {
    return [];
  }

  return data.results.map((r: any) => ({
    id: r.id,
    name: r.title,
    thumb: r.thumb || '',
  }));
}

export async function searchDiscogsReleases(query: string): Promise<DiscogsReleaseSummary[]> {
  const authHeader = getDiscogsAuthHeader();
  if (!authHeader) {
    throw new Error('NO_TOKEN: Server Discogs credentials not configured.');
  }

  const cleanQ = query.trim();
  if (!cleanQ) return [];

  const url = `https://api.discogs.com/database/search?q=${encodeURIComponent(cleanQ)}&type=release&per_page=30`;
  const data = await fetchDiscogsWithRateLimit<any>(url, authHeader);

  if (!data || !Array.isArray(data.results)) {
    return [];
  }

  return data.results.map((r: any) => {
    let artist = 'Unknown Artist';
    let albumTitle = r.title || 'Untitled';

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
  const authHeader = getDiscogsAuthHeader();
  if (!authHeader) {
    throw new Error('NO_TOKEN: Server Discogs credentials not configured.');
  }

  const url = `https://api.discogs.com/releases/${releaseId}`;
  const data = await fetchDiscogsWithRateLimit<any>(url, authHeader);

  const albumTitle = data.title || 'Untitled';
  const albumArtist = (data.artists || []).map((a: any) => a.name).join(', ') || 'Unknown Artist';
  const year = data.year || (data.released ? parseInt(data.released.slice(0, 4), 10) : 0) || 0;

  let formatName = 'Release';
  if (Array.isArray(data.formats) && data.formats.length > 0) {
    const f = data.formats[0];
    const descs = Array.isArray(f.descriptions) ? f.descriptions.join(', ') : '';
    formatName = `${f.name || 'Release'}${descs ? ` (${descs})` : ''}`;
  }

  let catalog_no = '—';
  let labelName = '';
  if (Array.isArray(data.labels) && data.labels.length > 0) {
    const l = data.labels[0];
    if (l.catno) catalog_no = l.catno;
    if (l.name) labelName = l.name;
  }

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
