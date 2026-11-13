import type { LibraryNode, Track, GroupedAlbum, ReleaseVersion, UnifiedReleaseSummary } from './types';

export const fmtDuration = (s: number): string => {
  if (!s || isNaN(s)) return '0:00';
  const sec = Math.round(s);
  if (sec >= 3600) {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const remainder = sec % 60;
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  }
  const mins = Math.floor(sec / 60);
  const remainder = sec % 60;
  return `${mins}:${String(remainder).padStart(2, '0')}`;
};

export const fmtTotalRuntime = (tracks: Track[]): string => {
  const total = tracks.reduce((p, x) => p + (x.len || 0), 0);
  if (total >= 3600) {
    return `${Math.floor(total / 3600)} hr ${Math.floor((total % 3600) / 60)} min`;
  }
  return `${Math.round(total / 60)} min`;
};

export const flattenTracks = (node: LibraryNode): Track[] => {
  const allTracks: Track[] = [...(node.tracks || [])];
  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      allTracks.push(...flattenTracks(child));
    }
  }
  return allTracks;
};

export const getAllNodes = (nodes: LibraryNode[] = [], out: LibraryNode[] = []): LibraryNode[] => {
  if (!nodes || !Array.isArray(nodes)) return out;
  for (const n of nodes) {
    if (!n) continue;
    out.push(n);
    if (n.children && Array.isArray(n.children) && n.children.length > 0) {
      getAllNodes(n.children, out);
    }
  }
  return out;
};

export const findNodeById = (nodes: LibraryNode[] = [], id: string): LibraryNode | null => {
  if (!nodes || !Array.isArray(nodes) || !id) return null;
  for (const n of nodes) {
    if (!n) continue;
    if (n.id === id) return n;
    if (n.children && Array.isArray(n.children) && n.children.length > 0) {
      const found = findNodeById(n.children, id);
      if (found) return found;
    }
  }
  return null;
};

export const findNodePath = (
  nodes: LibraryNode[] = [],
  targetId: string,
  currentPath: LibraryNode[] = []
): LibraryNode[] | null => {
  if (!nodes || !Array.isArray(nodes) || !targetId) return null;
  for (const n of nodes) {
    if (!n) continue;
    const nextPath = [...currentPath, n];
    if (n.id === targetId) return nextPath;
    if (n.children && Array.isArray(n.children) && n.children.length > 0) {
      const found = findNodePath(n.children, targetId, nextPath);
      if (found) return found;
    }
  }
  return null;
};

export function normalizeArtistName(artist: string): string {
  if (!artist) return '';
  return artist
    .replace(/\s\(\d+\)$/, '')
    .trim()
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

export function normalizeAlbumName(title: string): string {
  if (!title) return '';
  let clean = title
    // Strip parenthesized / bracketed variant tags (e.g. 2xLP, CD, Deluxe, Ltd, Reissue, 180g)
    .replace(
      /\s*[\(\[\{](?:.*?(?:\b(?:deluxe|remaster(?:ed)?|rm|re|reissue|expanded|anniversary|special|collector'?s?|bonus(?:\s+tracks?)?|standard|explicit|clean|international|vinyl|\d*x?lp|\d*x?cd|\d*x?12"|\d*x?7"|digital|limited|ltd|album|mono|stereo|edition|ver\.?|version|audiophile|box\s*set|180g|200g|gatefold|single|ep)\b).*?)[\)\]\}]/gi,
      ''
    )
    .replace(/\s*[\(\[]\d{4}(?:-\d{4})?[\)\]]/g, '')
    .replace(/\s*-\s*(?:single|ep|lp)\s*$/i, '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');

  return clean || title.trim().toLowerCase();
}

export function groupRawReleases(releases: UnifiedReleaseSummary[]): GroupedAlbum[] {
  if (!releases || !Array.isArray(releases)) return [];
  const map = new Map<string, GroupedAlbum>();

  for (const item of releases) {
    if (!item || !item.title) continue;

    const normArt = normalizeArtistName(item.artist);
    const normTit = normalizeAlbumName(item.title);
    const key = `${normArt}:::${normTit}`;

    const srcName = item.source.toUpperCase();
    const parts = [srcName];
    if (item.format) {
      parts.push(item.format.replace(/,\s*Album/i, '').replace(/,\s*Stereo/i, '').trim());
    } else if (item.source === 'deezer') {
      parts.push('Digital');
    }
    if (item.country && item.country !== '—') parts.push(item.country);
    if (item.year && item.year > 0) parts.push(item.year.toString());
    if (item.track_count && item.track_count > 0) parts.push(`${item.track_count} tracks`);

    const version: ReleaseVersion = {
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
      badgeLabel: parts.join(' · '),
    };

    if (!map.has(key)) {
      const displayTitle = item.title
        .replace(
          /\s*[\(\[\{](?:.*?(?:\b(?:deluxe|remaster(?:ed)?|rm|re|reissue|expanded|anniversary|special|collector'?s?|bonus(?:\s+tracks?)?|standard|explicit|clean|international|vinyl|\d*x?lp|\d*x?cd|\d*x?12"|\d*x?7"|digital|limited|ltd|album|mono|stereo|edition|ver\.?|version|audiophile|box\s*set|180g|200g|gatefold|single|ep)\b).*?)[\)\]\}]/gi,
          ''
        )
        .replace(/\s*[\(\[]\d{4}(?:-\d{4})?[\)\]]/g, '')
        .trim() || item.title;

      const displayArtist = item.artist.replace(/\s\(\d+\)$/, '').trim();

      map.set(key, {
        id: `album-${key.replace(/[^\w-]/g, '_')}`,
        title: displayTitle,
        artist: displayArtist,
        thumb: item.thumb || '',
        originalYear: item.year || 0,
        primaryFormat: item.format || (item.source === 'deezer' ? 'Digital Album' : 'Album'),
        sources: [item.source],
        versions: [version],
      });
    } else {
      const album = map.get(key)!;
      if (!album.sources.includes(item.source)) album.sources.push(item.source);
      if (!album.thumb && item.thumb) album.thumb = item.thumb;
      if (item.year && item.year > 0 && (!album.originalYear || item.year < album.originalYear)) {
        album.originalYear = item.year;
      }
      const exists = album.versions.some(
        v => v.source === item.source && v.id.toString() === item.id.toString()
      );
      if (!exists) album.versions.push(version);
    }
  }

  const result = Array.from(map.values());
  for (const album of result) {
    album.versions.sort((a, b) => {
      if (a.source === 'deezer' && b.source !== 'deezer') return -1;
      if (b.source === 'deezer' && a.source !== 'deezer') return 1;
      if (a.year && b.year && a.year !== b.year) return a.year - b.year;
      return 0;
    });
  }
  return result;
}
