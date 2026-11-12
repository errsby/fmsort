export interface Track {
  id: number;
  node_id: string;
  t: string; // title
  a: string; // artist
  al: string; // album
  y: number; // year
  f: string; // format
  c: string; // catalog no
  bc: string; // barcode
  mb: string; // MBID
  isrc: string; // ISRC
  len: number; // length in seconds
  bpm: number; // BPM
  key: string; // musical key
  sort_order: number;
}

export interface LibraryNode {
  id: string;
  parent_id: string | null;
  type: string; // 'Folder' | 'Label' | 'Artist' | 'Album' | 'Playlist' | 'Genre' | 'Section' | 'Era' | custom
  name: string;
  sort_order: number;
  children: LibraryNode[];
  tracks: Track[];
}

export type ColumnKey =
  | 'title'
  | 'artist'
  | 'album'
  | 'year'
  | 'format'
  | 'cat'
  | 'bc'
  | 'mbid'
  | 'isrc'
  | 'len'
  | 'bpm'
  | 'key';

export interface ColumnDef {
  key: ColumnKey;
  label: string;
  isMono?: boolean;
  isOptional?: boolean;
}

export interface MbReleaseSummary {
  id: string;
  title: string;
  artist: string;
  year: number;
  format: string;
  catalog_no: string;
  barcode: string;
  country: string;
  track_count: number;
  label: string;
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

export interface DiscogsStatus {
  hasToken: boolean;
  tokenPreview?: string;
}

export type SearchProvider = 'hybrid' | 'discogs' | 'deezer' | 'musicbrainz';

export interface UnifiedArtistSummary {
  source: 'discogs' | 'deezer' | 'musicbrainz';
  id: string | number;
  name: string;
  thumb: string;
  nb_album?: number;
}

export interface UnifiedReleaseSummary {
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

export interface HybridSearchResponse {
  artists: UnifiedArtistSummary[];
  releases: UnifiedReleaseSummary[];
  discogsConfigured: boolean;
  counts?: {
    artists: number;
    discogsReleases: number;
    deezerReleases: number;
  };
}
