import React, { useState, useEffect, useRef, useMemo } from 'react';
import type {
  LibraryNode,
  SearchProvider,
  UnifiedArtistSummary,
  UnifiedTrackSummary,
  GroupedAlbum,
  ReleaseVersion,
} from '../types';
import {
  fetchDiscogsStatus,
  saveDiscogsToken,
  searchHybrid,
  streamHybridSearch,
  searchDiscogs,
  searchMusicBrainz,
  importUniversalRelease,
  importArtistContainer,
  importSingleTrack,
  fetchReleaseTracklist,
} from '../api';
import { getAllNodes, groupRawReleases, fmtDuration } from '../utils';
import { CoverArt } from './CoverArt';
import { ErrorBoundary } from './ErrorBoundary';
import {
  Sparkles,
  Search,
  Disc,
  User,
  Check,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Layers,
  Radio,
  SlidersHorizontal,
  Play,
  Pause,
  Plus,
  Music,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentNode: LibraryNode | null;
  allTreeNodes: LibraryNode[];
  onImportSuccess: (destNodeId: string) => void;
  initialQuery?: string;
  initialTargetNodeId?: string;
}

type FilterCategory = 'all' | 'tracks' | 'albums' | 'vinyl' | 'digital' | 'artists';

export const HybridSearchModal: React.FC<Props> = ({
  isOpen,
  onClose,
  currentNode,
  allTreeNodes,
  onImportSuccess,
  initialQuery,
  initialTargetNodeId,
}) => {
  const [provider, setProvider] = useState<SearchProvider>('hybrid');
  const [hasDiscogsToken, setHasDiscogsToken] = useState<boolean | null>(null);
  const [tokenInput, setTokenInput] = useState<string>('');
  const [isEditingToken, setIsEditingToken] = useState(false);
  const [savingToken, setSavingToken] = useState(false);

  const [query, setQuery] = useState('');
  const [artistResults, setArtistResults] = useState<UnifiedArtistSummary[]>([]);
  const [albumResults, setAlbumResults] = useState<GroupedAlbum[]>([]);
  const [trackResults, setTrackResults] = useState<UnifiedTrackSummary[]>([]);
  const [selectedVersions, setSelectedVersions] = useState<Record<string, number>>({});
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('all');

  const [playingTrackId, setPlayingTrackId] = useState<string | number | null>(null);
  const [addedTrackIds, setAddedTrackIds] = useState<Set<string | number>>(new Set());
  const [expandedAlbumId, setExpandedAlbumId] = useState<string | null>(null);
  const [albumTracklists, setAlbumTracklists] = useState<Record<string, UnifiedTrackSummary[]>>({});
  const [loadingTracklistId, setLoadingTracklistId] = useState<string | null>(null);

  const [counts, setCounts] = useState<{
    artists: number;
    albums?: number;
    tracks?: number;
    totalVersions?: number;
    deezerCount?: number;
    discogsCount?: number;
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [discogsProgressiveLoading, setDiscogsProgressiveLoading] = useState(false);

  const [importingKey, setImportingKey] = useState<string | null>(null);
  const [addedArtists, setAddedArtists] = useState<Set<string>>(new Set());
  const [targetNodeId, setTargetNodeId] = useState<string>('');
  const [createAlbumContainer, setCreateAlbumContainer] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const allContainers = useMemo(() => {
    try {
      return getAllNodes(allTreeNodes || []);
    } catch {
      return [];
    }
  }, [allTreeNodes]);

  const checkTokenStatus = async () => {
    try {
      const status = await fetchDiscogsStatus();
      setHasDiscogsToken(Boolean(status?.hasToken));
    } catch {
      setHasDiscogsToken(false);
    }
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      const defaultTarget = initialTargetNodeId || currentNode?.id || allTreeNodes?.[0]?.id || allContainers[0]?.id || 'uncategorized';
      setTargetNodeId(defaultTarget);
      setQuery(initialQuery || '');
      setArtistResults([]);
      setAlbumResults([]);
      setTrackResults([]);
      setSelectedVersions({});
      setActiveFilter('all');
      setCounts(null);
      setAddedArtists(new Set());
      setAddedTrackIds(new Set());
      setExpandedAlbumId(null);
      setAlbumTracklists({});
      setError(null);
      checkTokenStatus();
      const timer = setTimeout(() => {
        try {
          if (inputRef.current) {
            inputRef.current.focus();
            if (initialQuery) {
              const len = inputRef.current.value.length;
              inputRef.current.setSelectionRange(len, len);
            }
          }
        } catch {
          // ignore focus failure
        }
      }, 100);
      return () => clearTimeout(timer);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlayingTrackId(null);
    }
  }, [isOpen, currentNode, allTreeNodes, initialQuery, initialTargetNodeId]);

  useEffect(() => {
    if (!isOpen) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    const trimmed = query.trim();
    if (!trimmed) {
      setArtistResults([]);
      setAlbumResults([]);
      setTrackResults([]);
      setSelectedVersions({});
      setCounts(null);
      setLoading(false);
      setDiscogsProgressiveLoading(false);
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlayingTrackId(null);
      return;
    }

    setLoading(true);
    setError(null);

    // Fast 120ms debounce for responsive instant typing
    debounceTimer.current = setTimeout(async () => {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        if (provider === 'hybrid') {
          await streamHybridSearch(
            trimmed,
            (res) => {
              if (!res) return;
              setArtistResults(res.artists || []);
              if (res.tracks && Array.isArray(res.tracks)) {
                setTrackResults(res.tracks);
              }
              if (res.albums && Array.isArray(res.albums) && res.albums.length > 0) {
                setAlbumResults(res.albums);
              } else if (res.releases && Array.isArray(res.releases)) {
                setAlbumResults(groupRawReleases(res.releases));
              } else {
                setAlbumResults([]);
              }
              setCounts(res.counts || null);
              if (typeof res.discogsConfigured === 'boolean') {
                setHasDiscogsToken(res.discogsConfigured);
              }
              setLoading(false);
              setDiscogsProgressiveLoading(Boolean(res.discogsLoading));
            },
            controller.signal
          );
        } else if (provider === 'discogs') {
          const res = await searchDiscogs(trimmed);
          setArtistResults([]);
          setTrackResults([]);
          setAlbumResults(
            groupRawReleases(
              (res || []).map(d => ({
                source: 'discogs' as const,
                id: d.id,
                title: d.title,
                artist: d.artist,
                year: d.year,
                format: d.format,
                catalog_no: d.catalog_no,
                barcode: d.barcode,
                country: d.country,
                label: d.label,
                thumb: d.thumb,
              }))
            )
          );
          setLoading(false);
        } else if (provider === 'deezer') {
          const res = await searchHybrid(trimmed);
          setArtistResults((res.artists || []).filter(a => a.source === 'deezer'));
          setTrackResults(res.tracks || []);
          if (res.albums && Array.isArray(res.albums) && res.albums.length > 0) {
            setAlbumResults(res.albums.filter(a => (a.sources || []).includes('deezer')));
          } else {
            setAlbumResults(
              groupRawReleases((res.releases || []).filter(r => r.source === 'deezer'))
            );
          }
          setLoading(false);
        } else if (provider === 'musicbrainz') {
          const res = await searchMusicBrainz(trimmed);
          setArtistResults([]);
          setTrackResults([]);
          setAlbumResults(
            groupRawReleases(
              (res || []).map(m => ({
                source: 'musicbrainz' as const,
                id: m.id,
                title: m.title,
                artist: m.artist,
                year: m.year,
                format: m.format,
                catalog_no: m.catalog_no,
                barcode: m.barcode,
                country: m.country,
                label: m.label,
                thumb: '',
                track_count: m.track_count,
              }))
            )
          );
          setLoading(false);
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        if (err.message === 'NO_TOKEN') {
          setHasDiscogsToken(false);
          setIsEditingToken(true);
        } else {
          setError(err.message || 'Error querying music catalog');
        }
        setLoading(false);
      }
    }, 120);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [query, isOpen, provider]);

  // Safe filtered albums according to active filter chip (Hooks called unconditionally at top level)
  const filteredAlbums = useMemo(() => {
    if (!albumResults || !Array.isArray(albumResults)) return [];
    if (activeFilter === 'tracks' || activeFilter === 'artists') return [];
    if (activeFilter === 'vinyl') {
      return albumResults.filter(a => {
        if (!a) return false;
        const hasDiscogs = (a.sources || []).includes('discogs');
        const hasVinylVersion = (a.versions || []).some(v => {
          const fmt = (v?.format || '').toLowerCase();
          return fmt.includes('vinyl') || fmt.includes('lp') || fmt.includes('12"') || fmt.includes('7"');
        });
        return hasDiscogs || hasVinylVersion;
      });
    }
    if (activeFilter === 'digital') {
      return albumResults.filter(a => a && (a.sources || []).includes('deezer'));
    }
    return albumResults;
  }, [albumResults, activeFilter]);

  const vinylCount = useMemo(() => {
    if (!albumResults || !Array.isArray(albumResults)) return 0;
    return albumResults.filter(a => {
      if (!a) return false;
      const hasDiscogs = (a.sources || []).includes('discogs');
      const hasVinylVersion = (a.versions || []).some(v => {
        const fmt = (v?.format || '').toLowerCase();
        return fmt.includes('vinyl') || fmt.includes('lp') || fmt.includes('12"') || fmt.includes('7"');
      });
      return hasDiscogs || hasVinylVersion;
    }).length;
  }, [albumResults]);

  const digitalCount = useMemo(() => {
    if (!albumResults || !Array.isArray(albumResults)) return 0;
    return albumResults.filter(a => a && (a.sources || []).includes('deezer')).length;
  }, [albumResults]);

  const totalVersionCount = useMemo(() => {
    if (!albumResults || !Array.isArray(albumResults)) return 0;
    return albumResults.reduce((acc, a) => acc + (a?.versions?.length || 0), 0);
  }, [albumResults]);

  if (!isOpen) return null;

  const handleSaveToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;
    setSavingToken(true);
    setError(null);
    try {
      await saveDiscogsToken(tokenInput.trim());
      setHasDiscogsToken(true);
      setIsEditingToken(false);
      setTokenInput('');
      await checkTokenStatus();
      if (query.trim()) {
        setLoading(true);
        const res = await searchHybrid(query.trim());
        setArtistResults(res.artists || []);
        if (res.albums) setAlbumResults(res.albums);
        setCounts(res.counts || null);
        setLoading(false);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save token');
    } finally {
      setSavingToken(false);
    }
  };

  const handleAddArtist = async (artist: UnifiedArtistSummary) => {
    if (!targetNodeId || !artist) return;
    const key = `artist-${artist.name || 'artist'}`;
    setImportingKey(key);
    setError(null);
    try {
      const { destNodeId } = await importArtistContainer(artist.name, targetNodeId, artist.thumb);
      setAddedArtists(prev => new Set(prev).add(artist.name));
      onImportSuccess(destNodeId);
    } catch (err: any) {
      setError(err.message || 'Failed to add artist container');
    } finally {
      setImportingKey(null);
    }
  };

  const handleImportRelease = async (version: ReleaseVersion) => {
    if (!targetNodeId || !version) return;
    const key = `release-${version.source}-${version.id}`;
    setImportingKey(key);
    setError(null);
    try {
      const { destNodeId } = await importUniversalRelease(
        version.source,
        version.id,
        targetNodeId,
        createAlbumContainer,
        version.thumb
      );
      onImportSuccess(destNodeId);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to import release');
    } finally {
      setImportingKey(null);
    }
  };

  const togglePlayPreview = (track: UnifiedTrackSummary) => {
    if (playingTrackId === track.id) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlayingTrackId(null);
    } else if (track.preview) {
      if (!audioRef.current) {
        audioRef.current = new Audio();
      }
      audioRef.current.pause();
      audioRef.current.src = track.preview;
      audioRef.current.play().catch(e => {
        console.warn('Preview playback error', e);
        setPlayingTrackId(null);
      });
      setPlayingTrackId(track.id);
    }
  };

  const handleAddTrack = async (track: UnifiedTrackSummary) => {
    if (!targetNodeId || !track) return;
    const key = `track-${track.id}`;
    setImportingKey(key);
    setError(null);
    try {
      const res = await importSingleTrack({
        trackId: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        duration: track.duration,
        coverUrl: track.cover,
        isrc: track.isrc,
        targetNodeId,
        createAlbumContainer,
      });
      setAddedTrackIds(prev => new Set(prev).add(track.id));
      onImportSuccess(res.destNodeId);
    } catch (err: any) {
      setError(err.message || 'Failed to add track');
    } finally {
      setImportingKey(null);
    }
  };

  const toggleAlbumTracks = async (albumId: string, version: ReleaseVersion) => {
    if (expandedAlbumId === albumId) {
      setExpandedAlbumId(null);
      return;
    }
    setExpandedAlbumId(albumId);
    if (!albumTracklists[albumId]) {
      setLoadingTracklistId(albumId);
      try {
        const tracks = await fetchReleaseTracklist(version.source, version.id);
        setAlbumTracklists(prev => ({ ...prev, [albumId]: tracks }));
      } catch (err: any) {
        console.warn('Failed to load tracklist', err?.message);
      } finally {
        setLoadingTracklistId(null);
      }
    }
  };

  const getSourceBadge = (source: string) => {
    switch (source) {
      case 'discogs':
        return (
          <span
            key="discogs"
            style={{
              fontSize: 9,
              padding: '1px 5px',
              borderRadius: 3,
              background: '#172554',
              color: '#93c5fd',
              border: '1px solid #1e40af',
              fontWeight: 600,
              letterSpacing: '0.04em',
            }}
          >
            DISCOGS
          </span>
        );
      case 'deezer':
        return (
          <span
            key="deezer"
            style={{
              fontSize: 9,
              padding: '1px 5px',
              borderRadius: 3,
              background: '#3b0764',
              color: '#d8b4fe',
              border: '1px solid #6b21a8',
              fontWeight: 600,
              letterSpacing: '0.04em',
            }}
          >
            DEEZER
          </span>
        );
      case 'musicbrainz':
        return (
          <span
            key="musicbrainz"
            style={{
              fontSize: 9,
              padding: '1px 5px',
              borderRadius: 3,
              background: '#451a03',
              color: '#fcd34d',
              border: '1px solid #92400e',
              fontWeight: 600,
              letterSpacing: '0.04em',
            }}
          >
            MUSICBRAINZ
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <div className="ov on" onClick={onClose} />
      <div className="dlg on search-dialog-wrap" role="dialog" aria-label="Search and Import Releases">
        <ErrorBoundary componentName="Music Search Engine Dialog">
          {/* Top Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sparkles size={16} style={{ color: '#818cf8' }} />
                <span>Search Music</span>
              </h2>

              {/* Provider Tabs */}
              <div style={{ display: 'flex', background: 'var(--bg)', border: '1px solid var(--bd)', borderRadius: 6, padding: 2 }}>
                <button
                  type="button"
                  onClick={() => setProvider('hybrid')}
                  style={{
                    border: 'none',
                    background: provider === 'hybrid' ? 'var(--hv)' : 'transparent',
                    color: provider === 'hybrid' ? 'var(--fg)' : 'var(--mu)',
                    padding: '3px 8px',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    borderRadius: 4,
                  }}
                >
                  ⚡ Hybrid (Artists &amp; Albums)
                </button>
                <button
                  type="button"
                  onClick={() => setProvider('discogs')}
                  style={{
                    border: 'none',
                    background: provider === 'discogs' ? 'var(--hv)' : 'transparent',
                    color: provider === 'discogs' ? 'var(--fg)' : 'var(--mu)',
                    padding: '3px 8px',
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: 'pointer',
                    borderRadius: 4,
                  }}
                >
                  Discogs
                </button>
                <button
                  type="button"
                  onClick={() => setProvider('deezer')}
                  style={{
                    border: 'none',
                    background: provider === 'deezer' ? 'var(--hv)' : 'transparent',
                    color: provider === 'deezer' ? 'var(--fg)' : 'var(--mu)',
                    padding: '3px 8px',
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: 'pointer',
                    borderRadius: 4,
                  }}
                >
                  Deezer
                </button>
                <button
                  type="button"
                  onClick={() => setProvider('musicbrainz')}
                  style={{
                    border: 'none',
                    background: provider === 'musicbrainz' ? 'var(--hv)' : 'transparent',
                    color: provider === 'musicbrainz' ? 'var(--fg)' : 'var(--mu)',
                    padding: '3px 8px',
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: 'pointer',
                    borderRadius: 4,
                  }}
                >
                  MusicBrainz
                </button>
              </div>
            </div>
            <button onClick={onClose} style={{ padding: '2px 8px', cursor: 'pointer' }}>✕</button>
          </div>

          {/* Server Provider Status Banner */}
          <div style={{ marginBottom: 12 }}>
            {hasDiscogsToken ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#93c5fd', background: '#0f172a', border: '1px solid #1e3a5f', padding: '4px 10px', borderRadius: 6 }}>
                <span>✓ Discogs Catalog (17.5M+ pressings) &amp; Deezer Streaming Active</span>
              </div>
            ) : (
              <div style={{ background: '#1c1917', border: '1px solid #78350f', borderRadius: 6, padding: '6px 10px', fontSize: 11, color: 'var(--mu)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>⚡ Deezer active. Discogs credentials not configured in <code>.env</code>.</span>
                <button
                  type="button"
                  onClick={() => setIsEditingToken(!isEditingToken)}
                  style={{ border: 'none', background: 'transparent', padding: '1px 4px', fontSize: 11, color: '#fde68a', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  {isEditingToken ? 'Hide' : 'Configure Discogs'}
                </button>
              </div>
            )}

            {isEditingToken && (
              <div style={{ marginTop: 8, background: '#18181b', border: '1px solid var(--bd)', borderRadius: 6, padding: 10 }}>
                <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--mu)' }}>
                  Insert credentials into <code>.env</code> (recommended) or paste a Discogs token below:
                </p>
                <form onSubmit={handleSaveToken} style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="password"
                    placeholder="Paste Discogs Personal Access Token..."
                    value={tokenInput}
                    onChange={e => setTokenInput(e.target.value)}
                    style={{ flex: 1, fontSize: 11, padding: '4px 8px' }}
                  />
                  <button type="submit" className="p" style={{ fontSize: 11, padding: '4px 10px' }} disabled={savingToken || !tokenInput.trim()}>
                    {savingToken ? 'Saving...' : 'Save Token'}
                  </button>
                  <button type="button" style={{ fontSize: 11 }} onClick={() => setIsEditingToken(false)}>
                    Close
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Destination & Options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ color: 'var(--mu)', fontSize: 12 }}>
                Destination container:
                <select
                  value={targetNodeId}
                  onChange={e => setTargetNodeId(e.target.value)}
                  style={{ marginLeft: 6 }}
                >
                  <option value="uncategorized">[Root] Uncategorized (Root Library)</option>
                  {allContainers.map(c => (
                    <option key={c.id} value={c.id}>
                      [{c.type || 'Folder'}] {c.name || 'Untitled'}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={createAlbumContainer}
                  onChange={e => setCreateAlbumContainer(e.target.checked)}
                />
                Create Album container on import
              </label>
            </div>

            {/* Search Input Bar with Clear & Icon */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, color: 'var(--mu)', pointerEvents: 'none' }} />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search albums, artists, catalog numbers, barcodes, vinyl pressings..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                autoComplete="off"
                style={{ paddingLeft: 32, paddingRight: query ? 30 : 10 }}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  style={{
                    position: 'absolute',
                    right: 8,
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--mu)',
                    fontSize: 12,
                    cursor: 'pointer',
                    padding: 2,
                  }}
                  title="Clear query"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Organization Filter Chips */}
          {(albumResults.length > 0 || artistResults.length > 0 || trackResults.length > 0) && (
            <div className="search-filter-pills">
              <button
                type="button"
                className={`search-filter-pill ${activeFilter === 'all' ? 'active' : ''}`}
                onClick={() => setActiveFilter('all')}
              >
                <span>All Results</span>
                <span className="search-filter-count">{albumResults.length + artistResults.length + trackResults.length}</span>
              </button>

              {trackResults.length > 0 && (
                <button
                  type="button"
                  className={`search-filter-pill ${activeFilter === 'tracks' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('tracks')}
                >
                  <span>🎵 Tracks</span>
                  <span className="search-filter-count">{trackResults.length}</span>
                </button>
              )}

              {albumResults.length > 0 && (
                <button
                  type="button"
                  className={`search-filter-pill ${activeFilter === 'albums' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('albums')}
                >
                  <span>Unique Albums</span>
                  <span className="search-filter-count">{albumResults.length}</span>
                </button>
              )}

              {vinylCount > 0 && (
                <button
                  type="button"
                  className={`search-filter-pill ${activeFilter === 'vinyl' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('vinyl')}
                >
                  <span>Vinyl &amp; Physical</span>
                  <span className="search-filter-count">{vinylCount}</span>
                </button>
              )}

              {digitalCount > 0 && (
                <button
                  type="button"
                  className={`search-filter-pill ${activeFilter === 'digital' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('digital')}
                >
                  <span>Digital Streaming</span>
                  <span className="search-filter-count">{digitalCount}</span>
                </button>
              )}

              {artistResults.length > 0 && (
                <button
                  type="button"
                  className={`search-filter-pill ${activeFilter === 'artists' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('artists')}
                >
                  <span>Artists</span>
                  <span className="search-filter-count">{artistResults.length}</span>
                </button>
              )}

              {totalVersionCount > albumResults.length && (
                <span style={{ fontSize: 11, color: '#71717a', marginLeft: 'auto' }}>
                  {totalVersionCount} pressings/versions cataloged
                </span>
              )}
            </div>
          )}

          {error && (
            <div style={{ color: '#f87171', padding: '8px 0', fontSize: 12 }}>
              {error}
            </div>
          )}

          {loading && (
            <div style={{ color: 'var(--mu)', padding: '14px 0', textAlign: 'center', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Loader2 size={15} className="spin" />
              <span>Searching music catalogs...</span>
            </div>
          )}

          {/* Progressive Discogs Enrichment Indicator */}
          {discogsProgressiveLoading && (
            <div className="progressive-search-banner">
              <div className="progressive-spinner" />
              <span>Fast digital albums loaded · Grouping Discogs vinyl pressings into album dropdowns...</span>
            </div>
          )}

          {/* Hidden Audio Player for 30s previews */}
          <audio
            ref={audioRef}
            onEnded={() => setPlayingTrackId(null)}
            onError={() => setPlayingTrackId(null)}
            style={{ display: 'none' }}
          />

          {/* Results Container */}
          <div style={{ marginTop: 6 }}>
            {!loading && artistResults.length === 0 && albumResults.length === 0 && trackResults.length === 0 && query.trim() !== '' && (
              <p style={{ color: 'var(--mu)', margin: '14px 0', textAlign: 'center' }}>
                No tracks, artists, or albums found matching &ldquo;{query}&rdquo;.
              </p>
            )}

            {/* ============================================================ */}
            {/* SECTION 0: INDIVIDUAL TRACKS                                 */}
            {/* ============================================================ */}
            {trackResults.length > 0 && (activeFilter === 'all' || activeFilter === 'tracks') && (
              <div style={{ marginBottom: 18 }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 0',
                  borderBottom: '1px solid var(--bd)',
                  marginBottom: 10,
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#e4e4e7',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase'
                }}>
                  <span>🎵 Individual Tracks ({trackResults.length})</span>
                  <span style={{ color: 'var(--mu)', fontWeight: 400, textTransform: 'none', fontSize: 11 }}>
                    — Preview 30s clips &amp; add individual songs directly to your crate
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {trackResults.map((track) => {
                    if (!track) return null;
                    const isAdded = addedTrackIds.has(track.id);
                    const isImporting = importingKey === `track-${track.id}`;
                    const isPlaying = playingTrackId === track.id;

                    return (
                      <div
                        key={`track-${track.id}`}
                        className="r"
                        style={{
                          padding: '6px 10px',
                          background: isPlaying ? 'rgba(99, 102, 241, 0.08)' : '#121216',
                          borderRadius: 6,
                          border: isPlaying ? '1px solid #6366f1' : '1px solid #222228',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                        }}
                      >
                        {/* Cover Art with Play Button Overlay */}
                        <div
                          style={{ position: 'relative', width: 44, height: 44, flexShrink: 0, cursor: track.preview ? 'pointer' : 'default' }}
                          onClick={() => track.preview && togglePlayPreview(track)}
                          title={track.preview ? (isPlaying ? 'Pause preview' : 'Play 30s preview') : 'No audio preview available'}
                        >
                          <CoverArt
                            src={track.cover}
                            alt={track.title}
                            size={44}
                            type="album"
                            seed={track.title || track.artist}
                            rounded={4}
                          />
                          {track.preview && (
                            <div
                              style={{
                                position: 'absolute',
                                inset: 0,
                                background: isPlaying ? 'rgba(0, 0, 0, 0.45)' : 'rgba(0, 0, 0, 0.25)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: 4,
                                transition: 'background 0.15s ease',
                              }}
                            >
                              {isPlaying ? (
                                <Pause size={18} style={{ color: '#818cf8', fill: '#818cf8' }} />
                              ) : (
                                <Play size={16} style={{ color: '#ffffff', fill: '#ffffff', marginLeft: 2 }} />
                              )}
                            </div>
                          )}
                        </div>

                        {/* Track Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: 13, color: isPlaying ? '#a5b4fc' : 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '65%' }}>
                              {track.title}
                            </strong>
                            {track.duration > 0 && (
                              <span style={{ fontSize: 11, color: 'var(--mu)', fontFamily: 'var(--font-mono, monospace)' }}>
                                {fmtDuration(track.duration)}
                              </span>
                            )}
                            {track.isrc && (
                              <span
                                style={{
                                  fontSize: 9,
                                  padding: '1px 5px',
                                  borderRadius: 3,
                                  background: '#14532d',
                                  color: '#86efac',
                                  border: '1px solid #166534',
                                  fontWeight: 600,
                                  letterSpacing: '0.04em',
                                }}
                                title={`ISRC: ${track.isrc}`}
                              >
                                ISRC
                              </span>
                            )}
                            {getSourceBadge(track.source || 'deezer')}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--mu)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <span style={{ color: '#e4e4e7', cursor: 'pointer' }} onClick={() => setQuery(track.artist)} title="Search artist">
                              {track.artist}
                            </span>
                            <span>·</span>
                            <span>{track.album || 'Single'}</span>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          {track.preview && (
                            <button
                              type="button"
                              onClick={() => togglePlayPreview(track)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                fontSize: 11,
                                padding: '4px 8px',
                                background: isPlaying ? '#312e81' : 'transparent',
                                border: isPlaying ? '1px solid #6366f1' : '1px solid var(--bd)',
                                color: isPlaying ? '#e0e7ff' : 'var(--fg)',
                                borderRadius: 4,
                                cursor: 'pointer',
                              }}
                              title={isPlaying ? 'Pause audio preview' : 'Listen to 30-second audio preview'}
                            >
                              {isPlaying ? <Pause size={12} /> : <Play size={12} />}
                              <span>{isPlaying ? 'Playing' : 'Preview'}</span>
                            </button>
                          )}
                          <button
                            type="button"
                            className={isAdded ? '' : 'p'}
                            disabled={isImporting || isAdded}
                            onClick={() => handleAddTrack(track)}
                            style={{
                              fontSize: 11,
                              padding: '4px 10px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                            title={`Add "${track.title}" to destination`}
                          >
                            {isAdded ? (
                              <>
                                <Check size={12} style={{ color: '#4ade80' }} />
                                <span style={{ color: '#4ade80' }}>Added</span>
                              </>
                            ) : isImporting ? (
                              <>
                                <Loader2 size={12} className="spin" />
                                <span>Adding...</span>
                              </>
                            ) : (
                              <>
                                <Plus size={12} />
                                <span>Add Track</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ============================================================ */}
            {/* SECTION 1: ARTISTS                                           */}
            {/* ============================================================ */}
            {artistResults.length > 0 && (activeFilter === 'all' || activeFilter === 'artists') && (
              <div style={{ marginBottom: 18 }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 0',
                  borderBottom: '1px solid var(--bd)',
                  marginBottom: 10,
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#e4e4e7',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase'
                }}>
                  <span>👤 Artists ({artistResults.length})</span>
                  <span style={{ color: 'var(--mu)', fontWeight: 400, textTransform: 'none', fontSize: 11 }}>
                    — Create artist container or explore releases
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {artistResults.map((artist, idx) => {
                    if (!artist) return null;
                    const artistName = artist.name || 'Unknown Artist';
                    const key = `artist-${artistName}-${idx}`;
                    const isImporting = importingKey === key;
                    const isAdded = addedArtists.has(artistName);

                    return (
                      <div
                        key={key}
                        className="r"
                        style={{
                          padding: '8px 10px',
                          background: '#121216',
                          borderRadius: 6,
                          border: '1px solid #222228',
                        }}
                      >
                        <CoverArt
                          src={artist.thumb}
                          alt={artistName}
                          size={40}
                          type="artist"
                          seed={artistName}
                          rounded="full"
                        />

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <strong style={{ fontSize: 13 }}>{artistName}</strong>
                            <span className="ty">Artist</span>
                            {getSourceBadge(artist.source)}
                          </div>
                          <small style={{ color: 'var(--mu)' }}>
                            {artist.nb_album ? `${artist.nb_album} releases cataloged` : 'Musical Artist'}
                          </small>
                        </div>

                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button
                            type="button"
                            style={{ fontSize: 11, padding: '3px 8px' }}
                            title="Search releases specifically by this artist"
                            onClick={() => setQuery(artistName)}
                          >
                            View Releases
                          </button>
                          <button
                            type="button"
                            className={isAdded ? '' : 'p'}
                            disabled={isImporting || isAdded}
                            onClick={() => handleAddArtist(artist)}
                            style={{ fontSize: 11, padding: '3px 10px' }}
                          >
                            {isAdded ? 'Added ✓' : isImporting ? 'Adding...' : '+ Add Artist'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ============================================================ */}
            {/* SECTION 2: CANONICAL ALBUMS WITH SELECTABLE VERSIONS         */}
            {/* ============================================================ */}
            {filteredAlbums.length > 0 && (
              <div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 0',
                  borderBottom: '1px solid var(--bd)',
                  marginBottom: 10,
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#e4e4e7',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase'
                }}>
                  <span>💿 Albums ({filteredAlbums.length})</span>
                  <span style={{ color: 'var(--mu)', fontWeight: 400, textTransform: 'none', fontSize: 11 }}>
                    — 1 version displayed per album · select variants from dropdown
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {filteredAlbums.map((album, albumIdx) => {
                    if (!album) return null;
                    const albumId = album.id || `album-${albumIdx}`;
                    const versions: ReleaseVersion[] = (album.versions && Array.isArray(album.versions) && album.versions.length > 0)
                      ? album.versions
                      : [{
                          source: (album.sources?.[0] || 'deezer') as any,
                          id: albumId,
                          title: album.title || 'Untitled Album',
                          artist: album.artist || 'Unknown Artist',
                          year: album.originalYear || 0,
                          format: album.primaryFormat || 'Album',
                          catalog_no: '—',
                          barcode: '—',
                          country: '—',
                          label: '—',
                          thumb: album.thumb || '',
                          badgeLabel: album.title || 'Standard Release',
                        }];

                    const selectedIdx = Math.min(Math.max(0, selectedVersions[albumId] ?? 0), versions.length - 1);
                    const activeVersion: ReleaseVersion = versions[selectedIdx] || versions[0];
                    const importKey = `release-${activeVersion.source}-${activeVersion.id}`;
                    const isImporting = importingKey === importKey;

                    return (
                      <div key={albumId} style={{ display: 'flex', flexDirection: 'column' }}>
                        <div className="album-search-card" style={{ marginBottom: expandedAlbumId === albumId ? 0 : 8, borderRadius: expandedAlbumId === albumId ? '8px 8px 0 0' : 8 }}>
                          {/* Album Artwork */}
                          <CoverArt
                            src={activeVersion.thumb || album.thumb}
                            alt={album.title || 'Album'}
                            size={52}
                            type="album"
                            seed={album.title || album.artist || 'Album'}
                            rounded={6}
                          />

                          {/* Info & Versions Dropdown */}
                          <div className="album-search-card-info">
                            <div className="album-search-card-header">
                              <span className="album-search-title">{album.title || 'Untitled'}</span>
                              <span style={{ color: 'var(--mu)' }}>by</span>
                              <span className="album-search-artist">{album.artist || 'Unknown'}</span>
                              <div style={{ display: 'inline-flex', gap: 4, marginLeft: 'auto' }}>
                                {(album.sources || []).map(s => getSourceBadge(s))}
                              </div>
                            </div>

                            {/* Version Selector Dropdown */}
                            <div className="album-version-picker-wrap">
                              {versions.length > 1 ? (
                                <>
                                  <span className="album-version-label">
                                    <Layers size={11} style={{ verticalAlign: -1, marginRight: 3 }} />
                                    Version ({versions.length}):
                                  </span>
                                  <select
                                    className="album-version-select"
                                    value={selectedIdx}
                                    onChange={e => {
                                      const idx = Number(e.target.value);
                                      setSelectedVersions(prev => ({
                                        ...prev,
                                        [albumId]: idx,
                                      }));
                                    }}
                                  >
                                    {versions.map((ver, idx) => (
                                      <option key={`${ver.source}-${ver.id}-${idx}`} value={idx}>
                                        {ver.badgeLabel || `${ver.source.toUpperCase()} · ${ver.format || 'Release'} (${ver.year || '—'})`}
                                      </option>
                                    ))}
                                  </select>
                                </>
                              ) : (
                                <span className="album-version-single-tag">
                                  {activeVersion.badgeLabel || 'Standard Version'}
                                </span>
                              )}
                            </div>

                            {/* Active Version Detailed Metadata */}
                            <div className="album-version-meta-row">
                              {Boolean(activeVersion.year && activeVersion.year > 0) && (
                                <span>{activeVersion.year}</span>
                              )}
                              {Boolean(activeVersion.format) && (
                                <span> · {activeVersion.format}</span>
                              )}
                              {Boolean(activeVersion.label && activeVersion.label !== '—') && (
                                <span> · {activeVersion.label}</span>
                              )}
                              {Boolean(activeVersion.catalog_no && activeVersion.catalog_no !== '—') && (
                                <span> · Cat #{activeVersion.catalog_no}</span>
                              )}
                              {Boolean(activeVersion.barcode && activeVersion.barcode !== '—') && (
                                <span> · Barcode {activeVersion.barcode}</span>
                              )}
                              {Boolean(activeVersion.track_count) && (
                                <span> · {activeVersion.track_count} tracks</span>
                              )}
                            </div>
                          </div>

                          {/* Action Buttons: Import Release & View Tracks */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0, alignItems: 'stretch' }}>
                            <button
                              className="p"
                              disabled={importingKey !== null}
                              onClick={() => handleImportRelease(activeVersion)}
                              style={{ padding: '6px 12px', fontSize: 12 }}
                              title={`Import entire album "${activeVersion.title || album.title}"`}
                            >
                              {isImporting ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                  <Loader2 size={12} className="spin" />
                                  <span>Importing...</span>
                                </span>
                              ) : (
                                <span>Import Album</span>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => toggleAlbumTracks(albumId, activeVersion)}
                              style={{
                                fontSize: 11,
                                padding: '3px 8px',
                                background: expandedAlbumId === albumId ? '#27272a' : 'transparent',
                                border: '1px solid var(--bd)',
                                borderRadius: 4,
                                color: expandedAlbumId === albumId ? '#e4e4e7' : 'var(--mu)',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 4,
                              }}
                              title="View individual tracks to preview or add single songs"
                            >
                              <Music size={11} />
                              <span>{expandedAlbumId === albumId ? 'Hide Tracks' : 'View Tracks'}</span>
                              {expandedAlbumId === albumId ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                            </button>
                          </div>
                        </div>

                        {/* Expandable Album Tracklist */}
                        {expandedAlbumId === albumId && (
                          <div
                            style={{
                              marginBottom: 8,
                              padding: '10px 14px',
                              background: '#0d0d11',
                              borderRadius: '0 0 8px 8px',
                              border: '1px solid #22222a',
                              borderTop: 'none',
                            }}
                          >
                            {loadingTracklistId === albumId ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--mu)', fontSize: 12, padding: '8px 4px' }}>
                                <Loader2 size={13} className="spin" />
                                <span>Loading tracklist from {activeVersion.source.toUpperCase()}...</span>
                              </div>
                            ) : (!albumTracklists[albumId] || albumTracklists[albumId].length === 0) ? (
                              <span style={{ fontSize: 11, color: 'var(--mu)' }}>No tracklist data found for this version.</span>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <div style={{ fontSize: 11, color: 'var(--mu)', marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                                  <span>Tracks ({albumTracklists[albumId].length}):</span>
                                  <span>Click &ldquo;+ Add&rdquo; to add any individual track to your crate</span>
                                </div>
                                {albumTracklists[albumId].map((t, tIdx) => {
                                  const isAdded = addedTrackIds.has(t.id);
                                  const isImportingTrack = importingKey === `track-${t.id}`;
                                  const isPlaying = playingTrackId === t.id;

                                  return (
                                    <div
                                      key={`album-track-${t.id}-${tIdx}`}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        padding: '4px 6px',
                                        borderRadius: 4,
                                        background: isPlaying ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                                      }}
                                    >
                                      <span style={{ fontSize: 11, color: 'var(--mu)', width: 22, textAlign: 'right', flexShrink: 0 }}>
                                        {tIdx + 1}.
                                      </span>
                                      {t.preview && (
                                        <button
                                          type="button"
                                          onClick={() => togglePlayPreview(t)}
                                          style={{
                                            background: 'transparent',
                                            border: 'none',
                                            padding: 2,
                                            cursor: 'pointer',
                                            color: isPlaying ? '#818cf8' : 'var(--mu)',
                                            display: 'flex',
                                            alignItems: 'center',
                                          }}
                                          title={isPlaying ? 'Pause preview' : 'Play 30s preview'}
                                        >
                                          {isPlaying ? <Pause size={12} /> : <Play size={12} />}
                                        </button>
                                      )}
                                      <span
                                        style={{
                                          fontSize: 12,
                                          flex: 1,
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap',
                                          color: isPlaying ? '#a5b4fc' : 'var(--fg)',
                                          fontWeight: isPlaying ? 600 : 400,
                                        }}
                                      >
                                        {t.title}
                                      </span>
                                      {t.duration > 0 && (
                                        <span style={{ fontSize: 11, color: 'var(--mu)', fontFamily: 'var(--font-mono, monospace)', flexShrink: 0 }}>
                                          {fmtDuration(t.duration)}
                                        </span>
                                      )}
                                      {t.isrc && (
                                        <span
                                          style={{
                                            fontSize: 9,
                                            padding: '1px 4px',
                                            borderRadius: 2,
                                            background: '#14532d',
                                            color: '#86efac',
                                            fontWeight: 600,
                                          }}
                                          title={`ISRC: ${t.isrc}`}
                                        >
                                          ISRC
                                        </span>
                                      )}
                                      <button
                                        type="button"
                                        className={isAdded ? '' : 'p'}
                                        disabled={isImportingTrack || isAdded}
                                        onClick={() => handleAddTrack({ ...t, cover: t.cover || activeVersion.thumb || album.thumb })}
                                        style={{ fontSize: 10, padding: '2px 8px', flexShrink: 0 }}
                                        title={`Add track "${t.title}" to destination`}
                                      >
                                        {isAdded ? (
                                          <span style={{ color: '#4ade80' }}>Added ✓</span>
                                        ) : isImportingTrack ? (
                                          'Adding...'
                                        ) : (
                                          '+ Add'
                                        )}
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </ErrorBoundary>
      </div>
    </>
  );
};
