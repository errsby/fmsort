import {
  searchDeezerReleases,
  searchDeezerArtists,
  searchDeezerTracks,
  type DeezerTrackSummary,
} from './deezer';
import {
  isDiscogsConfigured,
  searchDiscogsReleases,
  searchDiscogsArtists,
} from './discogs';
import {
  searchMusicBrainzReleases,
} from './musicbrainz';

export interface RawReleaseItem {
  source: 'discogs' | 'deezer' | 'musicbrainz';
  id: string | number;
  title: string;
  artist: string;
  year: number;
  format: string;
  catalog_no: string;
  barcode: string;
  country: string;
  label: string;
  thumb: string;
  track_count?: number;
}

export interface ReleaseVersion {
  source: 'discogs' | 'deezer' | 'musicbrainz';
  id: string | number;
  title: string;
  artist: string;
  year: number;
  format: string;
  catalog_no: string;
  barcode: string;
  country: string;
  label: string;
  thumb: string;
  track_count?: number;
  badgeLabel: string;
}

export interface GroupedAlbum {
  id: string;
  title: string;
  artist: string;
  thumb: string;
  originalYear: number;
  primaryFormat: string;
  sources: ('discogs' | 'deezer' | 'musicbrainz')[];
  versions: ReleaseVersion[];
}

export interface UnifiedArtist {
  source: 'discogs' | 'deezer' | 'musicbrainz';
  id: string | number;
  name: string;
  thumb: string;
  nb_album?: number;
}

export interface SearchResult {
  artists: UnifiedArtist[];
  albums: GroupedAlbum[];
  tracks: DeezerTrackSummary[];
  counts: {
    artists: number;
    albums: number;
    tracks: number;
    totalVersions: number;
    deezerCount: number;
    discogsCount: number;
  };
  discogsConfigured: boolean;
  discogsLoading?: boolean;
}

// In-Memory Search Cache with 60-second TTL
interface CacheEntry {
  timestamp: number;
  data: SearchResult;
}
const SEARCH_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 1000;

function getCached(query: string): SearchResult | null {
  const key = query.toLowerCase().trim();
  const entry = SEARCH_CACHE.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    SEARCH_CACHE.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(query: string, data: SearchResult) {
  const key = query.toLowerCase().trim();
  SEARCH_CACHE.set(key, { timestamp: Date.now(), data });
  // Prune cache if over 150 entries
  if (SEARCH_CACHE.size > 150) {
    const oldestKey = SEARCH_CACHE.keys().next().value;
    if (oldestKey) SEARCH_CACHE.delete(oldestKey);
  }
}

/**
 * Normalizes artist name for fuzzy clustering.
 * e.g., "Daft Punk (2)" -> "daft punk", "The Beatles" -> "beatles"
 */
export function normalizeArtist(artist: string): string {
  if (!artist) return '';
  return artist
    .replace(/\s\(\d+\)$/, '') // Strip Discogs numbering suffix
    .trim()
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Normalizes album title to its canonical form by stripping edition variants,
 * remaster tags, years in parentheses, and vinyl markers.
 */
export function normalizeAlbumTitle(title: string): string {
  if (!title) return '';
  let clean = title
    // Strip parenthesized / bracketed variant tags (e.g. 2xLP, CD, Deluxe, Ltd, Reissue, 180g)
    .replace(
      /\s*[\(\[\{](?:.*?(?:\b(?:deluxe|remaster(?:ed)?|rm|re|reissue|expanded|anniversary|special|collector'?s?|bonus(?:\s+tracks?)?|standard|explicit|clean|international|vinyl|\d*x?lp|\d*x?cd|\d*x?12"|\d*x?7"|digital|limited|ltd|album|mono|stereo|edition|ver\.?|version|audiophile|box\s*set|180g|200g|gatefold|single|ep)\b).*?)[\)\]\}]/gi,
      ''
    )
    // Strip year in parenthesis e.g. (2013) or (1997-2017)
    .replace(/\s*[\(\[]\d{4}(?:-\d{4})?[\)\]]/g, '')
    // Strip trailing "- Single", "- EP", "EP"
    .replace(/\s*-\s*(?:single|ep|lp)\s*$/i, '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');

  return clean || title.trim().toLowerCase();
}

/**
 * Creates a clean, concise badge label for a release version in the dropdown.
 */
function createVersionBadge(r: RawReleaseItem): string {
  const srcName = r.source.toUpperCase();
  const parts: string[] = [srcName];

  if (r.format) {
    // Clean up format: e.g. "Vinyl, LP, Album, Stereo" -> "Vinyl LP"
    const fmt = r.format
      .replace(/,\s*Album/i, '')
      .replace(/,\s*Stereo/i, '')
      .replace(/,\s*Reissue/i, '')
      .trim();
    parts.push(fmt);
  } else if (r.source === 'deezer') {
    parts.push('Digital');
  }

  if (r.country && r.country !== '—') {
    parts.push(r.country);
  }

  if (r.year && r.year > 0) {
    parts.push(r.year.toString());
  }

  if (r.track_count && r.track_count > 0) {
    parts.push(`${r.track_count} tracks`);
  }

  return parts.join(' · ');
}

/**
 * Groups and deduplicates raw releases from multiple APIs into canonical album entities
 * with selectable versions dropdown.
 */
export function groupReleasesIntoAlbums(rawList: RawReleaseItem[]): GroupedAlbum[] {
  const groupMap = new Map<string, GroupedAlbum>();

  for (const item of rawList) {
    if (!item.title) continue;

    const normArt = normalizeArtist(item.artist);
    const normTit = normalizeAlbumTitle(item.title);
    const groupKey = `${normArt}:::${normTit}`;

    const versionObj: ReleaseVersion = {
      source: item.source,
      id: item.id,
      title: item.title,
      artist: item.artist.replace(/\s\(\d+\)$/, '').trim(),
      year: item.year || 0,
      format: item.format || (item.source === 'deezer' ? 'Digital Album' : 'Release'),
      catalog_no: item.catalog_no || '—',
      barcode: item.barcode || '—',
      country: item.country || '—',
      label: item.label || '—',
      thumb: item.thumb || '',
      track_count: item.track_count || 0,
      badgeLabel: createVersionBadge(item),
    };

    if (!groupMap.has(groupKey)) {
      // Clean display title (capitalized proper canonical title)
      const displayTitle = item.title
        .replace(
          /\s*[\(\[\{](?:(?:deluxe|remaster(?:ed)?|expanded|anniversary|special|collector'?s?|bonus(?:\s+tracks?)?|standard|explicit|clean|international|japan|us|uk|eu|vinyl|cd|2lp|lp|digital|limited|mono|stereo|reissue|edition|ver\.?|version).*?)[\)\]\}]/gi,
          ''
        )
        .replace(/\s*[\(\[]\d{4}(?:-\d{4})?[\)\]]/g, '')
        .trim() || item.title;

      const displayArtist = item.artist.replace(/\s\(\d+\)$/, '').trim();

      groupMap.set(groupKey, {
        id: `album-${groupKey.replace(/[^\w-]/g, '_')}`,
        title: displayTitle,
        artist: displayArtist,
        thumb: item.thumb || '',
        originalYear: item.year || 0,
        primaryFormat: item.format || (item.source === 'deezer' ? 'Digital Album' : 'Album'),
        sources: [item.source],
        versions: [versionObj],
      });
    } else {
      const album = groupMap.get(groupKey)!;

      // Add source badge if not present
      if (!album.sources.includes(item.source)) {
        album.sources.push(item.source);
      }

      // If existing thumbnail is empty or generic and this one has high-res art, upgrade it
      if (!album.thumb && item.thumb) {
        album.thumb = item.thumb;
      }

      // Update earliest year
      if (item.year && item.year > 0 && (!album.originalYear || item.year < album.originalYear)) {
        album.originalYear = item.year;
      }

      // Check if this version is already in versions (avoid exact duplicate IDs or identical release fingerprints)
      const isDuplicate = album.versions.some(
        v =>
          (v.source === item.source && v.id.toString() === item.id.toString()) ||
          (v.source === item.source && v.format === versionObj.format && v.year === versionObj.year && v.catalog_no === versionObj.catalog_no)
      );

      if (!isDuplicate) {
        album.versions.push(versionObj);
      }
    }
  }

  // Sort versions inside each album:
  // 1. Digital streaming version (Deezer) with rich track metadata or original first release
  // 2. Earliest year releases
  // 3. Reissues / Variants
  const result = Array.from(groupMap.values());
  for (const album of result) {
    album.versions.sort((a, b) => {
      // Deezer versions first for instant streaming previews, or earlier year
      if (a.source === 'deezer' && b.source !== 'deezer') return -1;
      if (b.source === 'deezer' && a.source !== 'deezer') return 1;
      if (a.year && b.year && a.year !== b.year) return a.year - b.year;
      if (a.track_count && b.track_count) return b.track_count - a.track_count;
      return 0;
    });

    // Make sure primary album metadata reflects best version
    const best = album.versions[0];
    if (best) {
      if (best.thumb) album.thumb = best.thumb;
      if (best.year && (!album.originalYear || best.year < album.originalYear)) {
        album.originalYear = best.year;
      }
    }
  }

  return result;
}

/**
 * Deduplicates and merges artists from multiple providers.
 */
export function deduplicateArtists(artists: UnifiedArtist[]): UnifiedArtist[] {
  const artistMap = new Map<string, UnifiedArtist>();
  for (const a of artists) {
    const cleanName = a.name.replace(/\s\(\d+\)$/, '').trim();
    const key = cleanName.toLowerCase();
    if (!artistMap.has(key)) {
      artistMap.set(key, { ...a, name: cleanName });
    } else {
      const existing = artistMap.get(key)!;
      if (!existing.thumb && a.thumb) existing.thumb = a.thumb;
      if (a.nb_album && (!existing.nb_album || a.nb_album > existing.nb_album)) {
        existing.nb_album = a.nb_album;
      }
    }
  }
  return Array.from(artistMap.values());
}

/**
 * Complete Search Engine Execution:
 * Runs Deezer, Discogs, and MusicBrainz in parallel, applies canonical clustering,
 * caches results, and returns structured search results.
 */
export async function executeHybridSearch(query: string): Promise<SearchResult> {
  const q = query.trim();
  if (!q) {
    return {
      artists: [],
      albums: [],
      counts: { artists: 0, albums: 0, totalVersions: 0, deezerCount: 0, discogsCount: 0 },
      discogsConfigured: isDiscogsConfigured(),
    };
  }

  const cached = getCached(q);
  if (cached) {
    return cached;
  }

  const discogsEnabled = isDiscogsConfigured();

  // Run in parallel
  const [deezerReleases, deezerArtists, deezerTracks, discogsReleases, discogsArtists, mbReleases] = await Promise.all([
    searchDeezerReleases(q).catch(() => []),
    searchDeezerArtists(q).catch(() => []),
    searchDeezerTracks(q).catch(() => []),
    discogsEnabled ? searchDiscogsReleases(q).catch(() => []) : Promise.resolve([]),
    discogsEnabled ? searchDiscogsArtists(q).catch(() => []) : Promise.resolve([]),
    searchMusicBrainzReleases(q).catch(() => []),
  ]);

  const rawList: RawReleaseItem[] = [];

  // 1. Deezer releases
  for (const d of deezerReleases) {
    rawList.push({
      source: 'deezer',
      id: d.id,
      title: d.title,
      artist: d.artist,
      year: d.year,
      format: d.format || 'Digital Album',
      catalog_no: d.catalog_no,
      barcode: d.barcode,
      country: d.country,
      label: d.label,
      thumb: d.thumb,
      track_count: d.track_count,
    });
  }

  // 2. Discogs releases
  for (const d of discogsReleases) {
    rawList.push({
      source: 'discogs',
      id: d.id,
      title: d.title,
      artist: d.artist,
      year: d.year,
      format: d.format || 'Vinyl',
      catalog_no: d.catalog_no,
      barcode: d.barcode,
      country: d.country,
      label: d.label,
      thumb: d.thumb,
      track_count: 0,
    });
  }

  // 3. MusicBrainz releases
  for (const m of mbReleases) {
    rawList.push({
      source: 'musicbrainz',
      id: m.id,
      title: m.title,
      artist: m.artist,
      year: m.year,
      format: m.format || 'CD',
      catalog_no: m.catalog_no,
      barcode: m.barcode,
      country: m.country,
      label: m.label,
      thumb: '',
      track_count: m.track_count,
    });
  }

  // Group releases into canonical albums with version dropdowns
  const groupedAlbums = groupReleasesIntoAlbums(rawList);

  // Combine & deduplicate artists
  const allArtists: UnifiedArtist[] = [
    ...deezerArtists.map(a => ({
      source: 'deezer' as const,
      id: a.id,
      name: a.name,
      thumb: a.thumb,
      nb_album: a.nb_album,
    })),
    ...discogsArtists.map(a => ({
      source: 'discogs' as const,
      id: a.id,
      name: a.name,
      thumb: a.thumb,
      nb_album: 0,
    })),
  ];
  const combinedArtists = deduplicateArtists(allArtists);

  const totalVersions = groupedAlbums.reduce((acc, a) => acc + a.versions.length, 0);

  const result: SearchResult = {
    artists: combinedArtists,
    albums: groupedAlbums,
    tracks: deezerTracks,
    counts: {
      artists: combinedArtists.length,
      albums: groupedAlbums.length,
      tracks: deezerTracks.length,
      totalVersions,
      deezerCount: deezerReleases.length,
      discogsCount: discogsReleases.length,
    },
    discogsConfigured: discogsEnabled,
  };

  setCache(q, result);
  return result;
}

/**
 * Fast streaming tier (Deezer) in ~50ms
 */
export async function executeFastSearch(query: string): Promise<{
  artists: UnifiedArtist[];
  albums: GroupedAlbum[];
  tracks: DeezerTrackSummary[];
  rawDeezerList: RawReleaseItem[];
  deezerCount: number;
}> {
  const q = query.trim();
  const [deezerReleases, deezerArtists, deezerTracks] = await Promise.all([
    searchDeezerReleases(q).catch(() => []),
    searchDeezerArtists(q).catch(() => []),
    searchDeezerTracks(q).catch(() => []),
  ]);

  const rawDeezerList: RawReleaseItem[] = deezerReleases.map(d => ({
    source: 'deezer' as const,
    id: d.id,
    title: d.title,
    artist: d.artist,
    year: d.year,
    format: d.format || 'Digital Album',
    catalog_no: d.catalog_no,
    barcode: d.barcode,
    country: d.country,
    label: d.label,
    thumb: d.thumb,
    track_count: d.track_count,
  }));

  const artists: UnifiedArtist[] = deezerArtists.map(a => ({
    source: 'deezer' as const,
    id: a.id,
    name: a.name,
    thumb: a.thumb,
    nb_album: a.nb_album,
  }));

  const albums = groupReleasesIntoAlbums(rawDeezerList);
  return {
    artists,
    albums,
    tracks: deezerTracks,
    rawDeezerList,
    deezerCount: deezerReleases.length,
  };
}

/**
 * Enriched streaming tier: merges Discogs and MusicBrainz with existing Deezer results
 */
export async function executeEnrichedSearch(
  query: string,
  existingFastRawList: RawReleaseItem[] = [],
  existingFastArtists: UnifiedArtist[] = [],
  existingFastTracks: DeezerTrackSummary[] = []
): Promise<SearchResult> {
  const q = query.trim();
  const discogsEnabled = isDiscogsConfigured();

  const [discogsReleases, discogsArtists, mbReleases] = await Promise.all([
    discogsEnabled ? searchDiscogsReleases(q).catch(() => []) : Promise.resolve([]),
    discogsEnabled ? searchDiscogsArtists(q).catch(() => []) : Promise.resolve([]),
    searchMusicBrainzReleases(q).catch(() => []),
  ]);

  const discogsRaw: RawReleaseItem[] = discogsReleases.map(d => ({
    source: 'discogs' as const,
    id: d.id,
    title: d.title,
    artist: d.artist,
    year: d.year,
    format: d.format || 'Vinyl',
    catalog_no: d.catalog_no,
    barcode: d.barcode,
    country: d.country,
    label: d.label,
    thumb: d.thumb,
    track_count: 0,
  }));

  const mbRaw: RawReleaseItem[] = mbReleases.map(m => ({
    source: 'musicbrainz' as const,
    id: m.id,
    title: m.title,
    artist: m.artist,
    year: m.year,
    format: m.format || 'CD',
    catalog_no: m.catalog_no,
    barcode: m.barcode,
    country: m.country,
    label: m.label,
    thumb: '',
    track_count: m.track_count,
  }));

  const combinedRaw = [...existingFastRawList, ...discogsRaw, ...mbRaw];
  const combinedAlbums = groupReleasesIntoAlbums(combinedRaw);

  const discogsArtistsMapped: UnifiedArtist[] = discogsArtists.map(a => ({
    source: 'discogs' as const,
    id: a.id,
    name: a.name,
    thumb: a.thumb,
    nb_album: 0,
  }));

  const combinedArtists = deduplicateArtists([...existingFastArtists, ...discogsArtistsMapped]);
  const totalVersions = combinedAlbums.reduce((acc, a) => acc + a.versions.length, 0);

  const result: SearchResult = {
    artists: combinedArtists,
    albums: combinedAlbums,
    tracks: existingFastTracks,
    counts: {
      artists: combinedArtists.length,
      albums: combinedAlbums.length,
      tracks: existingFastTracks.length,
      totalVersions,
      deezerCount: existingFastRawList.length,
      discogsCount: discogsReleases.length,
    },
    discogsConfigured: discogsEnabled,
  };

  setCache(q, result);
  return result;
}
