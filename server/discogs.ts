import fs from 'fs';
import path from 'path';
import { getSetting } from './db';

function loadEnvFile() {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  } catch {}
}
loadEnvFile();

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
  cover_image?: string;
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
  cover_url?: string;
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
  cover_url: string;
  tracks: DiscogsTrackDetail[];
}

export interface DiscogsArtistSummary {
  id: number;
  name: string;
  thumb: string;
  cover_image?: string;
}

export interface DiscogsArtistDetail {
  id: number;
  name: string;
  realname?: string;
  profile?: string;
  thumb: string;
  cover_image?: string;
  uri?: string;
}

/**
 * Detects if a query is a Discogs artist code:
 * - e.g. "a23524", "[a23524]", "[a:23524]", "A23524"
 * - "artist:23524", "artist/23524", "discogs:artist:23524", "discogs:23524"
 * - "https://www.discogs.com/artist/23524-Arthur-Russell"
 * - Or pure numeric IDs up to 7 digits (e.g. "23524", "108713")
 */
export function parseDiscogsArtistCode(query: string): number | null {
  const clean = query.trim();
  if (!clean) return null;

  // 1. Discogs artist URL e.g. https://www.discogs.com/artist/23524-Arthur-Russell
  const urlMatch = clean.match(/(?:https?:\/\/)?(?:www\.)?discogs\.com\/artist\/(\d+)/i);
  if (urlMatch) {
    const id = parseInt(urlMatch[1], 10);
    if (!isNaN(id) && id > 0) return id;
  }

  // 2. Discogs BBCode or standard artist code: [a12345], a12345, [a:12345], a:12345
  const codeMatch = clean.match(/^\[?a:?(\d+)\]?$/i);
  if (codeMatch) {
    const id = parseInt(codeMatch[1], 10);
    if (!isNaN(id) && id > 0) return id;
  }

  // 3. Prefixes: artist:12345, artist/12345, discogs:artist:12345, discogs:12345
  const prefixMatch = clean.match(/^(?:discogs:)?(?:artist[:/=#]|discogs:)(\d+)$/i);
  if (prefixMatch) {
    const id = parseInt(prefixMatch[1], 10);
    if (!isNaN(id) && id > 0) return id;
  }

  // 4. Pure numeric (1 to 7 digits), excluding 8-14 digit barcodes (UPC/EAN)
  if (/^\d{1,7}$/.test(clean)) {
    const id = parseInt(clean, 10);
    if (!isNaN(id) && id > 0) return id;
  }

  return null;
}

/**
 * Returns true if the query is an EXPLICIT artist code
 * (e.g. starts with 'a', '[a', 'artist:', 'discogs.com/artist/', etc.)
 */
export function isExplicitDiscogsArtistCode(query: string): boolean {
  const clean = query.trim();
  if (!clean) return false;
  return (
    /(?:https?:\/\/)?(?:www\.)?discogs\.com\/artist\/\d+/i.test(clean) ||
    /^\[?a:?\d+\]?$/i.test(clean) ||
    /^(?:discogs:)?(?:artist[:/=#]|discogs:)\d+$/i.test(clean)
  );
}

/**
 * Parses Discogs name BBCode e.g. [a=Arthur Russell]
 */
export function parseDiscogsArtistName(query: string): string | null {
  const clean = query.trim();
  const match = clean.match(/^\[a=([^\]]+)\]$/i);
  return match ? match[1].trim() : null;
}

/**
 * Parses Discogs release code e.g. r1918919, [r1918919], release:1918919, discogs.com/release/1918919
 */
export function parseDiscogsReleaseCode(query: string): number | null {
  const clean = query.trim();
  if (!clean) return null;

  const urlMatch = clean.match(/(?:https?:\/\/)?(?:www\.)?discogs\.com\/release\/(\d+)/i);
  if (urlMatch) {
    const id = parseInt(urlMatch[1], 10);
    if (!isNaN(id) && id > 0) return id;
  }

  const codeMatch = clean.match(/^\[?r:?(\d+)\]?$/i);
  if (codeMatch) {
    const id = parseInt(codeMatch[1], 10);
    if (!isNaN(id) && id > 0) return id;
  }

  const prefixMatch = clean.match(/^(?:discogs:)?release[:/=#](\d+)$/i);
  if (prefixMatch) {
    const id = parseInt(prefixMatch[1], 10);
    if (!isNaN(id) && id > 0) return id;
  }

  return null;
}

/**
 * Parses Discogs master code e.g. m757880, [m757880], master:757880, discogs.com/master/757880
 */
export function parseDiscogsMasterCode(query: string): number | null {
  const clean = query.trim();
  if (!clean) return null;

  const urlMatch = clean.match(/(?:https?:\/\/)?(?:www\.)?discogs\.com\/master\/(\d+)/i);
  if (urlMatch) {
    const id = parseInt(urlMatch[1], 10);
    if (!isNaN(id) && id > 0) return id;
  }

  const codeMatch = clean.match(/^\[?m:?(\d+)\]?$/i);
  if (codeMatch) {
    const id = parseInt(codeMatch[1], 10);
    if (!isNaN(id) && id > 0) return id;
  }

  const prefixMatch = clean.match(/^(?:discogs:)?master[:/=#](\d+)$/i);
  if (prefixMatch) {
    const id = parseInt(prefixMatch[1], 10);
    if (!isNaN(id) && id > 0) return id;
  }

  return null;
}

/**
 * Fetches an artist directly by Discogs ID
 */
export async function getDiscogsArtistById(artistId: number | string): Promise<DiscogsArtistDetail | null> {
  const authHeader = getDiscogsAuthHeader();
  if (!authHeader) return null;

  const idNum = typeof artistId === 'number' ? artistId : parseInt(artistId, 10);
  if (isNaN(idNum) || idNum <= 0) return null;

  try {
    const url = `https://api.discogs.com/artists/${idNum}`;
    const data = await fetchDiscogsWithRateLimit<any>(url, authHeader);
    if (!data || !data.id || !data.name) return null;

    let thumb = '';
    let cover_image = '';
    if (Array.isArray(data.images) && data.images.length > 0) {
      const primary = data.images.find((i: any) => i.type === 'primary') || data.images[0];
      thumb = primary.uri150 || primary.uri || primary.resource_url || '';
      cover_image = primary.uri || primary.resource_url || thumb;
    }

    return {
      id: data.id,
      name: data.name,
      realname: data.realname,
      profile: data.profile,
      thumb,
      cover_image,
      uri: data.uri,
    };
  } catch {
    return null;
  }
}

/**
 * Fetches releases for a Discogs artist by ID
 */
export async function getDiscogsArtistReleases(artistId: number | string): Promise<DiscogsReleaseSummary[]> {
  const authHeader = getDiscogsAuthHeader();
  if (!authHeader) return [];

  const idNum = typeof artistId === 'number' ? artistId : parseInt(artistId, 10);
  if (isNaN(idNum) || idNum <= 0) return [];

  try {
    const url = `https://api.discogs.com/artists/${idNum}/releases?page=1&per_page=30&sort=year&sort_order=desc`;
    const data = await fetchDiscogsWithRateLimit<any>(url, authHeader);
    if (!data || !Array.isArray(data.releases)) return [];

    return data.releases.map((r: any) => {
      const releaseId = r.main_release || r.id;
      const year = r.year ? parseInt(r.year, 10) || 0 : 0;
      const format = r.format || (r.type === 'master' ? 'Vinyl LP / Master' : 'Release');
      return {
        id: releaseId,
        title: r.title || 'Untitled',
        artist: r.artist || 'Unknown Artist',
        year,
        format,
        catalog_no: '—',
        barcode: '—',
        country: '',
        label: '',
        thumb: r.thumb || '',
        cover_image: r.thumb || '',
      };
    });
  } catch {
    return [];
  }
}

export async function searchDiscogsArtists(query: string): Promise<DiscogsArtistSummary[]> {
  const authHeader = getDiscogsAuthHeader();
  if (!authHeader) return [];

  const cleanQ = query.trim();
  if (!cleanQ) return [];

  // Check if query is a Discogs artist code or ID
  const artistId = parseDiscogsArtistCode(cleanQ);
  if (artistId) {
    const directArtist = await getDiscogsArtistById(artistId);
    if (directArtist) {
      return [{
        id: directArtist.id,
        name: directArtist.name,
        thumb: directArtist.thumb,
        cover_image: directArtist.cover_image || directArtist.thumb,
      }];
    }
  }

  // Check if query is [a=Name] BBCode
  const bbName = parseDiscogsArtistName(cleanQ);
  const searchTerm = bbName || cleanQ;

  const url = `https://api.discogs.com/database/search?q=${encodeURIComponent(searchTerm)}&type=artist&per_page=6`;
  const data = await fetchDiscogsWithRateLimit<any>(url, authHeader);

  if (!data || !Array.isArray(data.results)) {
    return [];
  }

  return data.results.map((r: any) => ({
    id: r.id,
    name: r.title,
    thumb: r.thumb || '',
    cover_image: r.cover_image || r.thumb || '',
  }));
}

export async function searchDiscogsReleases(query: string): Promise<DiscogsReleaseSummary[]> {
  const authHeader = getDiscogsAuthHeader();
  if (!authHeader) {
    throw new Error('NO_TOKEN: Server Discogs credentials not configured.');
  }

  const cleanQ = query.trim();
  if (!cleanQ) return [];

  // 1. If explicit artist code (e.g. a23524, [a23524], artist:23524): fetch artist releases directly!
  const isExplicitArtist = isExplicitDiscogsArtistCode(cleanQ);
  const artistId = parseDiscogsArtistCode(cleanQ);
  if (isExplicitArtist && artistId) {
    return getDiscogsArtistReleases(artistId);
  }

  // 2. If release code (e.g. r1918919, [r1918919], release:1918919): fetch single release
  const releaseId = parseDiscogsReleaseCode(cleanQ);
  if (releaseId) {
    const details = await getDiscogsReleaseDetails(releaseId).catch(() => null);
    if (details) {
      return [{
        id: details.id,
        title: details.title,
        artist: details.artist,
        year: details.year,
        format: details.format,
        catalog_no: details.catalog_no,
        barcode: details.barcode,
        country: '',
        label: details.label,
        thumb: details.cover_url,
        cover_image: details.cover_url,
      }];
    }
  }

  // 3. If master code (e.g. m757880, [m757880], master:757880)
  const masterId = parseDiscogsMasterCode(cleanQ);
  if (masterId) {
    try {
      const mUrl = `https://api.discogs.com/masters/${masterId}`;
      const mData = await fetchDiscogsWithRateLimit<any>(mUrl, authHeader);
      const targetRelId = mData?.main_release || masterId;
      const details = await getDiscogsReleaseDetails(targetRelId).catch(() => null);
      if (details) {
        return [{
          id: details.id,
          title: details.title,
          artist: details.artist,
          year: details.year,
          format: details.format,
          catalog_no: details.catalog_no,
          barcode: details.barcode,
          country: '',
          label: details.label,
          thumb: details.cover_url,
          cover_image: details.cover_url,
        }];
      }
    } catch {}
  }

  const isBarcode = /^\d{8,14}$/.test(cleanQ);
  const searchParam = isBarcode ? `barcode=${encodeURIComponent(cleanQ)}` : `q=${encodeURIComponent(cleanQ)}`;
  let url = `https://api.discogs.com/database/search?${searchParam}&type=release&per_page=30`;
  let data = await fetchDiscogsWithRateLimit<any>(url, authHeader);

  if ((!data || !Array.isArray(data.results) || data.results.length === 0)) {
    if (isBarcode) {
      // Fallback to general query if barcode specific filter returned 0
      url = `https://api.discogs.com/database/search?q=${encodeURIComponent(cleanQ)}&type=release&per_page=30`;
      data = await fetchDiscogsWithRateLimit<any>(url, authHeader);
    } else {
      // Try catno query in case query is a catalog number
      url = `https://api.discogs.com/database/search?catno=${encodeURIComponent(cleanQ)}&type=release&per_page=30`;
      const catnoData = await fetchDiscogsWithRateLimit<any>(url, authHeader).catch(() => null);
      if (catnoData && Array.isArray(catnoData.results) && catnoData.results.length > 0) {
        data = catnoData;
      }
    }
  }

  // If numeric ID (1-7 digits) that returned 0 database releases, also check artist releases
  if ((!data || !Array.isArray(data.results) || data.results.length === 0) && artistId) {
    const artistReleases = await getDiscogsArtistReleases(artistId);
    if (artistReleases.length > 0) {
      return artistReleases;
    }
  }

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
      cover_image: r.cover_image || r.thumb || '',
    };
  });
}

export async function getDiscogsBiggerArtwork(query: string, type: 'artist' | 'release'): Promise<{ cover_image: string; thumb: string } | null> {
  const authHeader = getDiscogsAuthHeader();
  if (!authHeader) return null;

  const cleanQ = query.trim();
  if (!cleanQ) return null;

  const url = `https://api.discogs.com/database/search?q=${encodeURIComponent(cleanQ)}&type=${type}&per_page=1`;
  const data = await fetchDiscogsWithRateLimit<any>(url, authHeader);

  if (!data || !Array.isArray(data.results) || data.results.length === 0) {
    return null;
  }

  const first = data.results[0];
  return {
    cover_image: first.cover_image || first.thumb || '',
    thumb: first.thumb || '',
  };
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

  let coverUrl = data.thumb || '';
  if (Array.isArray(data.images) && data.images.length > 0) {
    coverUrl = data.images[0].uri || data.images[0].resource_url || data.thumb || '';
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
      cover_url: coverUrl,
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
    cover_url: coverUrl,
    tracks,
  };
}
