import React, { useState, useEffect, useRef, useMemo } from 'react';
import type {
  LibraryNode,
  SearchProvider,
  UnifiedArtistSummary,
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
} from '../api';
import { getAllNodes, groupRawReleases } from '../utils';
import { CoverArt } from './CoverArt';
import {
  Sparkles,
  Search,
  Disc,
  User,
  Check,
  Loader2,
  ExternalLink,
  ChevronDown,
  Layers,
  Radio,
  SlidersHorizontal,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentNode: LibraryNode | null;
  allTreeNodes: LibraryNode[];
  onImportSuccess: (destNodeId: string) => void;
}

type FilterCategory = 'all' | 'albums' | 'vinyl' | 'digital' | 'artists';

export const HybridSearchModal: React.FC<Props> = ({
  isOpen,
  onClose,
  currentNode,
  allTreeNodes,
  onImportSuccess,
}) => {
  const [provider, setProvider] = useState<SearchProvider>('hybrid');
  const [hasDiscogsToken, setHasDiscogsToken] = useState<boolean | null>(null);
  const [tokenInput, setTokenInput] = useState<string>('');
  const [isEditingToken, setIsEditingToken] = useState(false);
  const [savingToken, setSavingToken] = useState(false);

  const [query, setQuery] = useState('');
  const [artistResults, setArtistResults] = useState<UnifiedArtistSummary[]>([]);
  const [albumResults, setAlbumResults] = useState<GroupedAlbum[]>([]);
  const [selectedVersions, setSelectedVersions] = useState<Record<string, number>>({});
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('all');

  const [counts, setCounts] = useState<{
    artists: number;
    albums?: number;
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
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const checkTokenStatus = async () => {
    try {
      const status = await fetchDiscogsStatus();
      setHasDiscogsToken(status.hasToken);
    } catch {
      setHasDiscogsToken(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setTargetNodeId(currentNode?.id || allTreeNodes[0]?.id || '');
      setQuery('');
      setArtistResults([]);
      setAlbumResults([]);
      setSelectedVersions({});
      setActiveFilter('all');
      setCounts(null);
      setAddedArtists(new Set());
      setError(null);
      checkTokenStatus();
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [isOpen, currentNode, allTreeNodes]);

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
      setSelectedVersions({});
      setCounts(null);
      setLoading(false);
      setDiscogsProgressiveLoading(false);
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
              setArtistResults(res.artists || []);
              if (res.albums && res.albums.length > 0) {
                setAlbumResults(res.albums);
              } else if (res.releases) {
                setAlbumResults(groupRawReleases(res.releases));
              }
              setCounts(res.counts || null);
              setHasDiscogsToken(res.discogsConfigured);
              setLoading(false);
              setDiscogsProgressiveLoading(!!res.discogsLoading);
            },
            controller.signal
          );
        } else if (provider === 'discogs') {
          const res = await searchDiscogs(trimmed);
          setArtistResults([]);
          setAlbumResults(
            groupRawReleases(
              res.map(d => ({
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
          if (res.albums) {
            setAlbumResults(res.albums.filter(a => a.sources.includes('deezer')));
          } else {
            setAlbumResults(
              groupRawReleases((res.releases || []).filter(r => r.source === 'deezer'))
            );
          }
          setLoading(false);
        } else if (provider === 'musicbrainz') {
          const res = await searchMusicBrainz(trimmed);
          setArtistResults([]);
          setAlbumResults(
            groupRawReleases(
              res.map(m => ({
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

  if (!isOpen) return null;

  const allContainers = getAllNodes(allTreeNodes);

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
    if (!targetNodeId) return;
    const key = `artist-${artist.name}`;
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
    if (!targetNodeId) return;
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

  // Filter albums according to active filter chip
  const filteredAlbums = useMemo(() => {
    if (activeFilter === 'artists') return [];
    if (activeFilter === 'vinyl') {
      return albumResults.filter(a =>
        a.sources.includes('discogs') ||
        a.versions.some(v => v.format.toLowerCase().includes('vinyl') || v.format.toLowerCase().includes('lp'))
      );
    }
    if (activeFilter === 'digital') {
      return albumResults.filter(a => a.sources.includes('deezer'));
    }
    return albumResults;
  }, [albumResults, activeFilter]);

  const vinylCount = useMemo(() => {
    return albumResults.filter(a =>
      a.sources.includes('discogs') ||
      a.versions.some(v => v.format.toLowerCase().includes('vinyl') || v.format.toLowerCase().includes('lp'))
    ).length;
  }, [albumResults]);

  const digitalCount = useMemo(() => {
    return albumResults.filter(a => a.sources.includes('deezer')).length;
  }, [albumResults]);

  const totalVersionCount = useMemo(() => {
    return albumResults.reduce((acc, a) => acc + a.versions.length, 0);
  }, [albumResults]);

  return (
    <>
      <div className="ov on" onClick={onClose} />
      <div className="dlg on search-dialog-wrap" role="dialog" aria-label="Search and Import Releases">
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
                {allContainers.map(c => (
                  <option key={c.id} value={c.id}>
                    [{c.type}] {c.name}
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
        {(albumResults.length > 0 || artistResults.length > 0) && (
          <div className="search-filter-pills">
            <button
              type="button"
              className={`search-filter-pill ${activeFilter === 'all' ? 'active' : ''}`}
              onClick={() => setActiveFilter('all')}
            >
              <span>All Results</span>
              <span className="search-filter-count">{albumResults.length + artistResults.length}</span>
            </button>

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

        {/* Results Container */}
        <div style={{ marginTop: 6 }}>
          {!loading && artistResults.length === 0 && albumResults.length === 0 && query.trim() !== '' && (
            <p style={{ color: 'var(--mu)', margin: '14px 0', textAlign: 'center' }}>
              No artists or albums found matching &ldquo;{query}&rdquo;.
            </p>
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
                {artistResults.map(artist => {
                  const key = `artist-${artist.name}`;
                  const isImporting = importingKey === key;
                  const isAdded = addedArtists.has(artist.name);

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
                        alt={artist.name}
                        size={40}
                        type="artist"
                        seed={artist.name}
                        rounded="full"
                      />

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <strong style={{ fontSize: 13 }}>{artist.name}</strong>
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
                          onClick={() => setQuery(artist.name)}
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
                {filteredAlbums.map(album => {
                  const selectedIdx = selectedVersions[album.id] ?? 0;
                  const activeVersion: ReleaseVersion = album.versions[selectedIdx] || album.versions[0];
                  const importKey = `release-${activeVersion.source}-${activeVersion.id}`;
                  const isImporting = importingKey === importKey;

                  return (
                    <div key={album.id} className="album-search-card">
                      {/* Album Artwork */}
                      <CoverArt
                        src={activeVersion.thumb || album.thumb}
                        alt={album.title}
                        size={52}
                        type="album"
                        seed={album.title || album.artist}
                        rounded={6}
                      />

                      {/* Info & Versions Dropdown */}
                      <div className="album-search-card-info">
                        <div className="album-search-card-header">
                          <span className="album-search-title">{album.title}</span>
                          <span style={{ color: 'var(--mu)' }}>by</span>
                          <span className="album-search-artist">{album.artist}</span>
                          <div style={{ display: 'inline-flex', gap: 4, marginLeft: 'auto' }}>
                            {album.sources.map(s => getSourceBadge(s))}
                          </div>
                        </div>

                        {/* Version Selector Dropdown */}
                        <div className="album-version-picker-wrap">
                          {album.versions.length > 1 ? (
                            <>
                              <span className="album-version-label">
                                <Layers size={11} style={{ verticalAlign: -1, marginRight: 3 }} />
                                Version ({album.versions.length}):
                              </span>
                              <select
                                className="album-version-select"
                                value={selectedIdx}
                                onChange={e => {
                                  const idx = Number(e.target.value);
                                  setSelectedVersions(prev => ({
                                    ...prev,
                                    [album.id]: idx,
                                  }));
                                }}
                              >
                                {album.versions.map((ver, idx) => (
                                  <option key={`${ver.source}-${ver.id}-${idx}`} value={idx}>
                                    {ver.badgeLabel}
                                  </option>
                                ))}
                              </select>
                            </>
                          ) : (
                            <span className="album-version-single-tag">
                              {activeVersion.badgeLabel}
                            </span>
                          )}
                        </div>

                        {/* Active Version Detailed Metadata */}
                        <div className="album-version-meta-row">
                          {activeVersion.year > 0 && <span>{activeVersion.year}</span>}
                          {activeVersion.format && <span> · {activeVersion.format}</span>}
                          {activeVersion.label && activeVersion.label !== '—' && (
                            <span> · {activeVersion.label}</span>
                          )}
                          {activeVersion.catalog_no && activeVersion.catalog_no !== '—' && (
                            <span> · Cat #{activeVersion.catalog_no}</span>
                          )}
                          {activeVersion.barcode && activeVersion.barcode !== '—' && (
                            <span> · Barcode {activeVersion.barcode}</span>
                          )}
                          {activeVersion.track_count ? (
                            <span> · {activeVersion.track_count} tracks</span>
                          ) : null}
                        </div>
                      </div>

                      {/* Action Import Button */}
                      <button
                        className="p"
                        disabled={importingKey !== null}
                        onClick={() => handleImportRelease(activeVersion)}
                        style={{ flexShrink: 0, padding: '6px 12px', fontSize: 12 }}
                        title={`Import ${activeVersion.badgeLabel}`}
                      >
                        {isImporting ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <Loader2 size={12} className="spin" />
                            <span>Importing...</span>
                          </span>
                        ) : (
                          <span>Import Release</span>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
