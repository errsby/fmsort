/**
 * MusicBrainz API Service with Rate Limiting and In-Memory Caching
 */

interface MbRateLimitItem {
  url: string;
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
}

const queue: MbRateLimitItem[] = [];
let isProcessingQueue = false;
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 1100; // MusicBrainz 1 req/sec policy

const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes cache

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
          'User-Agent': 'FMSort/1.0.0 ( https://github.com/err/fmsort )',
          'Accept': 'application/json',
        },
      });

      if (!res.ok) {
        throw new Error(`MusicBrainz HTTP error: ${res.status} ${res.statusText}`);
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

function fetchWithRateLimit<T>(url: string): Promise<T> {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return Promise.resolve(cached.data as T);
  }

  return new Promise<T>((resolve, reject) => {
    queue.push({ url, resolve, reject });
    processQueue();
  });
}

export interface MbReleaseSummary {
  id: string; // MBID
  title: string;
  artist: string;
  year: number;
  format: string;
  catalog_no: string;
  barcode: string;
  country: string;
  track_count: number;
  label: string;
  thumb: string;
}

export interface MbTrackDetail {
  title: string;
  artist: string;
  album: string;
  year: number;
  format: string;
  catalog_no: string;
  barcode: string;
  mbid: string;
  isrc: string;
  length: number; // in seconds
  bpm: number;
  key: string;
  cover_url?: string;
}

export interface MbReleaseDetail {
  id: string;
  title: string;
  artist: string;
  year: number;
  format: string;
  catalog_no: string;
  barcode: string;
  label: string;
  cover_url: string;
  tracks: MbTrackDetail[];
}

export async function searchMusicBrainzReleases(query: string): Promise<MbReleaseSummary[]> {
  const cleanQ = query.trim();
  if (!cleanQ) return [];

  const isBarcode = /^\d{8,14}$/.test(cleanQ);
  const mbQuery = isBarcode ? `barcode:${cleanQ}` : cleanQ;
  const url = `https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(mbQuery)}&fmt=json&limit=25`;
  const data = await fetchWithRateLimit<any>(url);

  if (!data || !Array.isArray(data.releases)) {
    return [];
  }

  return data.releases.map((r: any) => {
    const artist = (r['artist-credit'] || [])
      .map((ac: any) => ac.name + (ac.joinphrase || ''))
      .join('');
    
    let year = 0;
    if (r.date) {
      const match = r.date.match(/^(\d{4})/);
      if (match) year = parseInt(match[1], 10);
    }

    const firstMedia = r.media?.[0];
    const format = firstMedia?.format || (r.media?.length ? `${r.media.length}x Media` : 'Release');

    let catalog_no = '—';
    let label = '';
    const labelInfo = r['label-info-list']?.[0];
    if (labelInfo) {
      if (labelInfo['catalog-number']) catalog_no = labelInfo['catalog-number'];
      if (labelInfo.label?.name) label = labelInfo.label.name;
    }

    return {
      id: r.id,
      title: r.title || 'Untitled',
      artist: artist || 'Unknown Artist',
      year,
      format,
      catalog_no,
      barcode: r.barcode || '—',
      country: r.country || '',
      track_count: r['track-count'] || (r.media ? r.media.reduce((acc: number, m: any) => acc + (m['track-count'] || 0), 0) : 0),
      label,
      thumb: `https://coverartarchive.org/release/${r.id}/front-250`,
    };
  });
}

export async function getMusicBrainzReleaseDetails(mbid: string): Promise<MbReleaseDetail> {
  const url = `https://musicbrainz.org/ws/2/release/${mbid}?inc=recordings+artists+labels+isrcs&fmt=json`;
  const data = await fetchWithRateLimit<any>(url);

  const albumTitle = data.title || 'Untitled';
  const albumArtist = (data['artist-credit'] || [])
    .map((ac: any) => ac.name + (ac.joinphrase || ''))
    .join('') || 'Unknown Artist';

  let year = 0;
  if (data.date) {
    const match = data.date.match(/^(\d{4})/);
    if (match) year = parseInt(match[1], 10);
  }

  let catalog_no = '—';
  let label = '';
  const labelInfo = data['label-info-list']?.[0];
  if (labelInfo) {
    if (labelInfo['catalog-number']) catalog_no = labelInfo['catalog-number'];
    if (labelInfo.label?.name) label = labelInfo.label.name;
  }

  const barcode = data.barcode || '—';

  const tracks: MbTrackDetail[] = [];
  const mediaList = data.media || [];

  for (const media of mediaList) {
    const formatName = media.format || 'Digital';
    const mediaTracks = media.tracks || [];

    for (const tr of mediaTracks) {
      const rec = tr.recording || {};
      const trackTitle = tr.title || rec.title || 'Untitled Track';

      let trackArtist = albumArtist;
      if (tr['artist-credit'] && tr['artist-credit'].length > 0) {
        trackArtist = tr['artist-credit'].map((ac: any) => ac.name + (ac.joinphrase || '')).join('');
      } else if (rec['artist-credit'] && rec['artist-credit'].length > 0) {
        trackArtist = rec['artist-credit'].map((ac: any) => ac.name + (ac.joinphrase || '')).join('');
      }

      const lengthSeconds = Math.round(((tr.length || rec.length || 0) / 1000));
      const isrc = rec.isrcs?.[0] || '—';
      const trackMbid = rec.id || tr.id || data.id;

      const releaseCover = `https://coverartarchive.org/release/${data.id}/front-250`;

      tracks.push({
        title: trackTitle,
        artist: trackArtist,
        album: albumTitle,
        year,
        format: formatName,
        catalog_no,
        barcode,
        mbid: trackMbid,
        isrc,
        length: lengthSeconds,
        bpm: 0,
        key: '',
        cover_url: releaseCover,
      });
    }
  }

  const releaseCover = `https://coverartarchive.org/release/${data.id}/front-250`;

  return {
    id: data.id,
    title: albumTitle,
    artist: albumArtist,
    year,
    format: mediaList[0]?.format || 'Release',
    catalog_no,
    barcode,
    label,
    cover_url: releaseCover,
    tracks,
  };
}
