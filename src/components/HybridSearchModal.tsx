import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
import { getAllNodes, groupRawReleases, fmtDuration, findNodePath } from '../utils';
import { CoverArt } from './CoverArt';
import { ErrorBoundary } from './ErrorBoundary';
import {
  Search,
  Sparkles,
  Play,
  Pause,
  Plus,
  Check,
  Loader2,
  Layers,
  Music,
  User,
  Disc,
  ChevronDown,
  ChevronRight,
  Folder,
  X,
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
  // Provider fixed to unified hybrid search
  const [provider, setProvider] = useState<SearchProvider>('hybrid');
  const [hasDiscogsToken, setHasDiscogsToken] = useState<boolean | null>(null);
  const [tokenInput, setTokenInput] = useState<string>('');
  const [isEditingToken, setIsEditingToken] = useState(false);
  const [savingToken, setSavingToken] = useState(false);

  // Search query & results
  const [query, setQuery] = useState('');
  const [artistResults, setArtistResults] = useState<UnifiedArtistSummary[]>([]);
  const [albumResults, setAlbumResults] = useState<GroupedAlbum[]>([]);
  const [trackResults, setTrackResults] = useState<UnifiedTrackSummary[]>([]);
  const [selectedVersions, setSelectedVersions] = useState<Record<string, number>>({});
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('all');
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  // Audio preview playback
  const [playingTrackId, setPlayingTrackId] = useState<string | number | null>(null);
  const [addedTrackIds, setAddedTrackIds] = useState<Set<string | number>>(new Set());

  // Album tracklist accordion
  const [expandedAlbumId, setExpandedAlbumId] = useState<string | null>(null);
  const [albumTracklists, setAlbumTracklists] = useState<Record<string, UnifiedTrackSummary[]>>({});
  const [loadingTracklistId, setLoadingTracklistId] = useState<string | null>(null);

  // Counts & loading
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

  // Destination crate & custom dropdown
  const [targetNodeId, setTargetNodeId] = useState<string>('');
  const [destDropdownOpen, setDestDropdownOpen] = useState(false);
  const [destSearchText, setDestSearchText] = useState('');
  const [destHighlightedIndex, setDestHighlightedIndex] = useState(0);
  const [destCoords, setDestCoords] = useState<{
    top?: number;
    bottom?: number;
    right: number;
    maxHeight: number;
    width: number;
  }>({ right: 16, maxHeight: 300, width: 320 });
  const [importingKey, setImportingKey] = useState<string | null>(null);
  const [addedArtists, setAddedArtists] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Refs
  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);
  const destButtonRef = useRef<HTMLButtonElement>(null);
  const destDropdownRef = useRef<HTMLDivElement>(null);
  const destInputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const allContainers = useMemo(() => {
    try {
      return getAllNodes(allTreeNodes || []);
    } catch {
      return [];
    }
  }, [allTreeNodes]);

  const targetNodeName = useMemo(() => {
    if (!targetNodeId || targetNodeId === 'uncategorized' || targetNodeId === 'root') {
      return '[Root] Uncategorized';
    }
    const found = allContainers.find(c => c.id === targetNodeId);
    return found ? found.name : 'Selected Crate';
  }, [targetNodeId, allContainers]);

  const checkTokenStatus = async () => {
    try {
      const status = await fetchDiscogsStatus();
      setHasDiscogsToken(Boolean(status?.hasToken));
    } catch {
      setHasDiscogsToken(false);
    }
  };

  const updateDestPosition = useCallback(() => {
    if (!destButtonRef.current) return;
    const rect = destButtonRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const menuWidth = Math.min(340, window.innerWidth - 32);
    const right = Math.max(12, window.innerWidth - rect.right);

    // If space below is at least 240px or greater than space above, open downwards; otherwise open upwards
    const openDownwards = spaceBelow >= 240 || spaceBelow >= spaceAbove;
    if (openDownwards) {
      setDestCoords({
        top: Math.round(rect.bottom + 6),
        right: Math.round(right),
        maxHeight: Math.min(320, Math.max(160, spaceBelow - 16)),
        width: menuWidth,
      });
    } else {
      setDestCoords({
        bottom: Math.round(window.innerHeight - rect.top + 6),
        right: Math.round(right),
        maxHeight: Math.min(320, Math.max(160, spaceAbove - 16)),
        width: menuWidth,
      });
    }
  }, []);

  // Filtered destination containers matching type-to-search query
  const filteredDestContainers = useMemo(() => {
    const list: { id: string; name: string; pathString: string; type: string }[] = [
      { id: 'uncategorized', name: '[Root] Uncategorized', pathString: 'Root', type: 'Folder' },
      ...allContainers.map(c => {
        const path = findNodePath(allTreeNodes, c.id);
        const pathString = path ? path.map(p => p.name).join(' / ') : c.name;
        return {
          id: c.id,
          name: c.name,
          pathString,
          type: c.type || 'Folder',
        };
      }),
    ];
    const q = destSearchText.trim().toLowerCase();
    if (!q) return list;
    return list.filter(item =>
      item.name.toLowerCase().includes(q) ||
      item.pathString.toLowerCase().includes(q) ||
      item.type.toLowerCase().includes(q)
    );
  }, [destSearchText, allContainers, allTreeNodes]);

  useEffect(() => {
    setDestHighlightedIndex(0);
  }, [destSearchText]);

  // Window resize & scroll listeners to keep coordinates pinned
  useEffect(() => {
    if (!destDropdownOpen) return;
    const handleUpdate = () => {
      updateDestPosition();
    };
    window.addEventListener('resize', handleUpdate);
    window.addEventListener('scroll', handleUpdate, true);
    return () => {
      window.removeEventListener('resize', handleUpdate);
      window.removeEventListener('scroll', handleUpdate, true);
    };
  }, [destDropdownOpen, updateDestPosition]);

  // Close destination dropdown on outside click
  useEffect(() => {
    if (!destDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        destDropdownRef.current && !destDropdownRef.current.contains(target) &&
        destButtonRef.current && !destButtonRef.current.contains(target)
      ) {
        setDestDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [destDropdownOpen]);

  // Audio cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  // Modal open reset
  useEffect(() => {
    if (isOpen) {
      const defaultTarget = initialTargetNodeId || currentNode?.id || allTreeNodes?.[0]?.id || allContainers[0]?.id || 'uncategorized';
      setTargetNodeId(defaultTarget);
      setDestDropdownOpen(false);
      setDestSearchText('');
      setDestHighlightedIndex(0);
      setQuery(initialQuery || '');
      setArtistResults([]);
      setAlbumResults([]);
      setTrackResults([]);
      setSelectedVersions({});
      setActiveFilter('all');
      setSelectedIndex(0);
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
        } catch {}
      }, 80);
      return () => clearTimeout(timer);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlayingTrackId(null);
      setDestDropdownOpen(false);
    }
  }, [isOpen, currentNode, allTreeNodes, initialQuery, initialTargetNodeId]);

  // Live streaming search effect with 120ms debounce
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

    debounceTimer.current = setTimeout(async () => {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
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
  }, [query, isOpen]);

  // Filtered albums according to active filter
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

  // Visible tracks according to active filter
  const visibleTracks = useMemo(() => {
    if (activeFilter === 'albums' || activeFilter === 'artists' || activeFilter === 'vinyl') {
      return [];
    }
    return trackResults;
  }, [trackResults, activeFilter]);

  // Visible artists according to active filter
  const visibleArtists = useMemo(() => {
    if (activeFilter === 'tracks' || activeFilter === 'albums' || activeFilter === 'vinyl' || activeFilter === 'digital') {
      return [];
    }
    return artistResults;
  }, [artistResults, activeFilter]);

  // Flattened selectable items for CMD+K keyboard navigation
  const selectableItems = useMemo(() => {
    const items: { type: 'track' | 'album' | 'artist'; id: string | number; data: any }[] = [];
    for (const t of visibleTracks) {
      items.push({ type: 'track', id: t.id, data: t });
    }
    for (const a of filteredAlbums) {
      items.push({ type: 'album', id: a.id, data: a });
    }
    for (const art of visibleArtists) {
      items.push({ type: 'artist', id: art.name, data: art });
    }
    return items;
  }, [visibleTracks, filteredAlbums, visibleArtists]);

  // Format version labels without platform branding
  const formatVersionLabel = useCallback((ver: ReleaseVersion): string => {
    let label = ver.badgeLabel || '';
    label = label.replace(/^(deezer|discogs|musicbrainz)\s*[·-]\s*/i, '');
    if (label && label !== 'Standard Release' && label !== 'Standard Version') {
      return label;
    }
    const parts: string[] = [];
    if (ver.format) parts.push(ver.format);
    if (ver.year && ver.year > 0) parts.push(String(ver.year));
    if (ver.country && ver.country !== '—') parts.push(ver.country);
    if (ver.track_count && ver.track_count > 0) parts.push(`${ver.track_count} tracks`);
    return parts.length > 0 ? parts.join(' · ') : 'Standard Edition';
  }, []);

  // Format badges without platform branding (Format tags only)
  const getFormatBadge = (formatName: string) => {
    const fmt = (formatName || '').toLowerCase();
    if (fmt.includes('vinyl') || fmt.includes('lp') || fmt.includes('12"') || fmt.includes('7"')) {
      return (
        <span
          key="fmt-vinyl"
          style={{
            fontSize: 9,
            padding: '1px 5px',
            borderRadius: 3,
            background: '#422006',
            color: '#fde68a',
            border: '1px solid #78350f',
            fontWeight: 600,
            letterSpacing: '0.04em',
          }}
        >
          VINYL
        </span>
      );
    }
    if (fmt.includes('cd')) {
      return (
        <span
          key="fmt-cd"
          style={{
            fontSize: 9,
            padding: '1px 5px',
            borderRadius: 3,
            background: '#1e293b',
            color: '#cbd5e1',
            border: '1px solid #334155',
            fontWeight: 600,
            letterSpacing: '0.04em',
          }}
        >
          CD
        </span>
      );
    }
    return (
      <span
        key="fmt-digital"
        style={{
          fontSize: 9,
          padding: '1px 5px',
          borderRadius: 3,
          background: '#1e1b4b',
          color: '#c7d2fe',
          border: '1px solid #3730a3',
          fontWeight: 600,
          letterSpacing: '0.04em',
        }}
      >
        DIGITAL
      </span>
    );
  };

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
        if (res.tracks) setTrackResults(res.tracks);
        setCounts(res.counts || null);
        setLoading(false);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save token');
    } finally {
      setSavingToken(false);
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
        console.warn('Preview error', e);
        setPlayingTrackId(null);
      });
      setPlayingTrackId(track.id);
    }
  };

  // Import single track directly into destination crate without album folder wrapper
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
        createAlbumContainer: false, // Individual tracks do not need album folders!
      });
      setAddedTrackIds(prev => new Set(prev).add(track.id));
      onImportSuccess(res.destNodeId);
    } catch (err: any) {
      setError(err.message || 'Failed to add track');
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
        true, // Albums create/use their album container
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

  const handleToggleDestDropdown = () => {
    if (!destDropdownOpen) {
      updateDestPosition();
      setDestSearchText('');
      const currentIdx = filteredDestContainers.findIndex(c => c.id === targetNodeId);
      setDestHighlightedIndex(currentIdx >= 0 ? currentIdx : 0);
      setDestDropdownOpen(true);
      setTimeout(() => destInputRef.current?.focus(), 40);
    } else {
      setDestDropdownOpen(false);
      inputRef.current?.focus();
    }
  };

  const handleDestKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setDestHighlightedIndex(prev => (prev + 1 < filteredDestContainers.length ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setDestHighlightedIndex(prev => (prev - 1 >= 0 ? prev - 1 : filteredDestContainers.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = filteredDestContainers[destHighlightedIndex];
      if (selected) {
        setTargetNodeId(selected.id);
        setDestDropdownOpen(false);
        inputRef.current?.focus();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDestDropdownOpen(false);
      inputRef.current?.focus();
    }
  };

  // Keyboard navigation matching CMD+K command palette
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (destDropdownOpen) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setDestDropdownOpen(false);
        inputRef.current?.focus();
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }

    if (selectableItems.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1 < selectableItems.length ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 >= 0 ? prev - 1 : selectableItems.length - 1));
    } else if (e.key === 'Enter') {
      const item = selectableItems[selectedIndex];
      if (item) {
        e.preventDefault();
        if (item.type === 'track') {
          handleAddTrack(item.data);
        } else if (item.type === 'album') {
          const versions = item.data.versions || [];
          const ver = versions[selectedVersions[item.data.id] || 0] || versions[0];
          if (ver) handleImportRelease(ver);
        } else if (item.type === 'artist') {
          handleAddArtist(item.data);
        }
      }
    }
  };

  if (!isOpen) return null;

  const hasSearched = query.trim().length > 0;

  return (
    <>
      {/* Background Overlay */}
      <div className="ov on" onClick={onClose} style={{ backdropFilter: 'blur(6px)' }} />

      {/* Floating CMD+K Style Dialog */}
      <div
        className="dlg on music-command-palette"
        role="dialog"
        aria-label="Music Search Command Palette"
        onKeyDown={handleKeyDown}
      >
        <ErrorBoundary componentName="Music Command Palette">
          {/* ============================================================ */}
          {/* TOP SEARCH BAR (SPOTLIGHT / CMD+K STYLE)                     */}
          {/* ============================================================ */}
          <div
            style={{
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              background: '#111115',
              borderBottom: (hasSearched || error || discogsProgressiveLoading || isEditingToken) ? '1px solid #22222a' : 'none',
            }}
          >
            <Search size={18} style={{ color: '#818cf8', flexShrink: 0 }} />

            <input
              ref={inputRef}
              type="text"
              className="music-cmd-search-input"
              placeholder="Search tracks, albums, artists, barcodes, cat numbers, ISRCs, Discogs codes (e.g. a23524)..."
              value={query}
              onChange={e => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              autoComplete="off"
              autoFocus
            />

            {loading && <Loader2 size={16} className="spin" style={{ color: '#818cf8', flexShrink: 0 }} />}

            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setSelectedIndex(0);
                  inputRef.current?.focus();
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--mu)',
                  cursor: 'pointer',
                  padding: 3,
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Clear query"
              >
                <X size={15} />
              </button>
            )}

            <button
              type="button"
              className="music-cmd-kbd"
              onClick={onClose}
              title="Close modal (Esc)"
              style={{ cursor: 'pointer' }}
            >
              ESC
            </button>
          </div>

          {/* ============================================================ */}
          {/* SUB-BAR: FILTER CHIPS (ONLY SHOWN AFTER SEARCHING)           */}
          {/* ============================================================ */}
          {hasSearched && (
            <div
              style={{
                padding: '8px 16px',
                background: '#0d0d11',
                borderBottom: '1px solid #1c1c22',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                className={`search-filter-pill ${activeFilter === 'all' ? 'active' : ''}`}
                onClick={() => {
                  setActiveFilter('all');
                  setSelectedIndex(0);
                }}
              >
                <span>All</span>
                {(trackResults.length > 0 || albumResults.length > 0 || artistResults.length > 0) && (
                  <span className="search-filter-count">{trackResults.length + albumResults.length + artistResults.length}</span>
                )}
              </button>

              {trackResults.length > 0 && (
                <button
                  type="button"
                  className={`search-filter-pill ${activeFilter === 'tracks' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveFilter('tracks');
                    setSelectedIndex(0);
                  }}
                >
                  <Music size={11} />
                  <span>Tracks</span>
                  <span className="search-filter-count">{trackResults.length}</span>
                </button>
              )}

              {albumResults.length > 0 && (
                <button
                  type="button"
                  className={`search-filter-pill ${activeFilter === 'albums' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveFilter('albums');
                    setSelectedIndex(0);
                  }}
                >
                  <Disc size={11} />
                  <span>Albums</span>
                  <span className="search-filter-count">{albumResults.length}</span>
                </button>
              )}

              {vinylCount > 0 && (
                <button
                  type="button"
                  className={`search-filter-pill ${activeFilter === 'vinyl' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveFilter('vinyl');
                    setSelectedIndex(0);
                  }}
                >
                  <span>Vinyl &amp; Physical</span>
                  <span className="search-filter-count">{vinylCount}</span>
                </button>
              )}

              {digitalCount > 0 && (
                <button
                  type="button"
                  className={`search-filter-pill ${activeFilter === 'digital' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveFilter('digital');
                    setSelectedIndex(0);
                  }}
                >
                  <span>Digital</span>
                  <span className="search-filter-count">{digitalCount}</span>
                </button>
              )}

              {artistResults.length > 0 && (
                <button
                  type="button"
                  className={`search-filter-pill ${activeFilter === 'artists' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveFilter('artists');
                    setSelectedIndex(0);
                  }}
                >
                  <User size={11} />
                  <span>Artists</span>
                  <span className="search-filter-count">{artistResults.length}</span>
                </button>
              )}
            </div>
          )}

          {/* Discogs Token Configuration Header if unconfigured and user opens settings */}
          {!hasDiscogsToken && isEditingToken && (
            <div style={{ padding: '10px 16px', background: '#141419', borderBottom: '1px solid #24242e' }}>
              <form onSubmit={handleSaveToken} style={{ display: 'flex', gap: 8 }}>
                <input
                  type="password"
                  placeholder="Paste access token..."
                  value={tokenInput}
                  onChange={e => setTokenInput(e.target.value)}
                  style={{ flex: 1, fontSize: 11, padding: '4px 8px' }}
                />
                <button type="submit" className="p" style={{ fontSize: 11, padding: '4px 10px' }} disabled={savingToken || !tokenInput.trim()}>
                  {savingToken ? 'Saving...' : 'Save'}
                </button>
                <button type="button" style={{ fontSize: 11 }} onClick={() => setIsEditingToken(false)}>
                  Cancel
                </button>
              </form>
            </div>
          )}

          {error && (
            <div style={{ color: '#f87171', padding: '8px 16px', fontSize: 12, background: 'rgba(239, 68, 68, 0.1)', borderBottom: '1px solid rgba(239, 68, 68, 0.2)' }}>
              {error}
            </div>
          )}

          {/* Progressive Discogs Loading Banner */}
          {discogsProgressiveLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 16px', background: 'rgba(99, 102, 241, 0.08)', borderBottom: '1px solid rgba(99, 102, 241, 0.2)', fontSize: 11, color: '#a5b4fc' }}>
              <Loader2 size={12} className="spin" />
              <span>Cataloging vinyl pressings and physical variants...</span>
            </div>
          )}

          {/* Hidden audio element for preview */}
          <audio
            ref={audioRef}
            onEnded={() => setPlayingTrackId(null)}
            onError={() => setPlayingTrackId(null)}
            style={{ display: 'none' }}
          />

          {/* ============================================================ */}
          {/* RESULTS LIST AREA (ONLY SHOWN AFTER SEARCHING)               */}
          {/* ============================================================ */}
          {hasSearched && (
            <div
              ref={resultsContainerRef}
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                minHeight: 180,
                maxHeight: '62vh',
              }}
            >
              {/* Empty State when no results found */}
              {!loading && visibleTracks.length === 0 && filteredAlbums.length === 0 && visibleArtists.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--mu)', padding: '36px 16px', fontSize: 13 }}>
                  No results found matching &ldquo;{query}&rdquo;.
                </div>
              )}

              {/* ============================================================ */}
              {/* SECTION 1: TRACKS                                            */}
              {/* ============================================================ */}
              {visibleTracks.length > 0 && (
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#a1a1aa',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      marginBottom: 6,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Music size={12} style={{ color: '#818cf8' }} />
                    <span>Tracks ({visibleTracks.length})</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {visibleTracks.map((track, trackIdx) => {
                      const isSelected = selectableItems[selectedIndex]?.type === 'track' && selectableItems[selectedIndex]?.id === track.id;
                      const isAdded = addedTrackIds.has(track.id);
                      const isImporting = importingKey === `track-${track.id}`;
                      const isPlaying = playingTrackId === track.id;

                      return (
                        <div
                          key={`track-${track.id}`}
                          className={`music-cmd-item ${isSelected ? 'selected' : ''}`}
                          onClick={() => setSelectedIndex(trackIdx)}
                        >
                          {/* Cover Art with Play Button */}
                          <div
                            style={{ position: 'relative', width: 40, height: 40, flexShrink: 0, cursor: track.preview ? 'pointer' : 'default' }}
                            onClick={e => {
                              e.stopPropagation();
                              if (track.preview) togglePlayPreview(track);
                            }}
                            title={track.preview ? (isPlaying ? 'Pause preview' : 'Play 30s preview') : 'No preview'}
                          >
                            <CoverArt
                              src={track.cover}
                              alt={track.title}
                              size={40}
                              type="album"
                              seed={track.title || track.artist}
                              rounded={4}
                            />
                            {track.preview && (
                              <div
                                style={{
                                  position: 'absolute',
                                  inset: 0,
                                  background: isPlaying ? 'rgba(0, 0, 0, 0.55)' : 'rgba(0, 0, 0, 0.25)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  borderRadius: 4,
                                }}
                              >
                                {isPlaying ? (
                                  <Pause size={16} style={{ color: '#818cf8', fill: '#818cf8' }} />
                                ) : (
                                  <Play size={14} style={{ color: '#ffffff', fill: '#ffffff', marginLeft: 2 }} />
                                )}
                              </div>
                            )}
                          </div>

                          {/* Track Info */}
                          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <strong style={{ fontSize: 13, color: isPlaying ? '#a5b4fc' : 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>
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
                                    fontWeight: 600,
                                  }}
                                  title={`ISRC: ${track.isrc}`}
                                >
                                  ISRC
                                </span>
                              )}
                              {getFormatBadge('Digital')}
                            </div>

                            <div style={{ fontSize: 11, color: 'var(--mu)', display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              <span style={{ color: '#d4d4d8', cursor: 'pointer' }} onClick={() => setQuery(track.artist)} title="Search artist">
                                {track.artist}
                              </span>
                              <span>·</span>
                              <span>{track.album || 'Single'}</span>
                            </div>
                          </div>

                          {/* Actions */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                            {track.preview && (
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  togglePlayPreview(track);
                                }}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  fontSize: 11,
                                  padding: '3px 8px',
                                  background: isPlaying ? '#312e81' : 'transparent',
                                  border: isPlaying ? '1px solid #6366f1' : '1px solid #272730',
                                  color: isPlaying ? '#e0e7ff' : 'var(--fg)',
                                  borderRadius: 4,
                                  cursor: 'pointer',
                                }}
                                title={isPlaying ? 'Pause audio preview' : 'Listen to 30-second audio preview'}
                              >
                                {isPlaying ? <Pause size={11} /> : <Play size={11} />}
                                <span>{isPlaying ? 'Playing' : 'Preview'}</span>
                              </button>
                            )}

                            <button
                              type="button"
                              className={isAdded ? '' : 'p'}
                              disabled={isImporting || isAdded}
                              onClick={e => {
                                e.stopPropagation();
                                handleAddTrack(track);
                              }}
                              style={{ fontSize: 11, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                              title={`Add "${track.title}" to ${targetNodeName}`}
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
            {/* SECTION 2: ALBUMS (CANONICAL WITH VERSION SELECTOR)          */}
            {/* ============================================================ */}
            {filteredAlbums.length > 0 && (
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#a1a1aa',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    marginBottom: 6,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Disc size={12} style={{ color: '#818cf8' }} />
                  <span>Albums ({filteredAlbums.length})</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {filteredAlbums.map((album, albumIdx) => {
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
                    const isSelected = selectableItems[selectedIndex]?.type === 'album' && selectableItems[selectedIndex]?.id === album.id;
                    const isExpanded = expandedAlbumId === albumId;

                    return (
                      <div key={albumId} style={{ display: 'flex', flexDirection: 'column' }}>
                        <div
                          className={`music-cmd-item ${isSelected ? 'selected' : ''}`}
                          style={{
                            background: isExpanded ? '#15151c' : '#111115',
                            border: isExpanded ? '1px solid #2e2e38' : '1px solid #202028',
                            borderRadius: isExpanded ? '6px 6px 0 0' : 6,
                            padding: '10px 12px',
                          }}
                          onClick={() => setSelectedIndex(visibleTracks.length + albumIdx)}
                        >
                          {/* Album Artwork */}
                          <CoverArt
                            src={activeVersion.thumb || album.thumb}
                            alt={album.title || 'Album'}
                            size={48}
                            type="album"
                            seed={album.title || album.artist || 'Album'}
                            rounded={6}
                          />

                          {/* Info & Versions Dropdown */}
                          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <strong style={{ fontSize: 13, color: 'var(--fg)' }}>{album.title || 'Untitled'}</strong>
                              <span style={{ color: 'var(--mu)', fontSize: 12 }}>by</span>
                              <span style={{ color: '#e4e4e7', fontSize: 12 }}>{album.artist || 'Unknown'}</span>
                              <div style={{ display: 'inline-flex', gap: 4, marginLeft: 'auto' }}>
                                {getFormatBadge(activeVersion.format || album.primaryFormat)}
                              </div>
                            </div>

                            {/* Version Selector (Format & Year, NO platform branding) */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              {versions.length > 1 ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <Layers size={11} style={{ color: 'var(--mu)' }} />
                                  <select
                                    value={selectedIdx}
                                    onChange={e => {
                                      const idx = Number(e.target.value);
                                      setSelectedVersions(prev => ({ ...prev, [albumId]: idx }));
                                    }}
                                    style={{
                                      fontSize: 11,
                                      padding: '2px 6px',
                                      background: '#181820',
                                      border: '1px solid #2b2b36',
                                      borderRadius: 4,
                                      color: 'var(--fg)',
                                      maxWidth: 260,
                                    }}
                                    onClick={e => e.stopPropagation()}
                                  >
                                    {versions.map((ver, idx) => (
                                      <option key={`${ver.source}-${ver.id}-${idx}`} value={idx}>
                                        {formatVersionLabel(ver)}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              ) : (
                                <span style={{ fontSize: 11, color: 'var(--mu)' }}>
                                  {formatVersionLabel(activeVersion)}
                                </span>
                              )}

                              {/* Metadata chips */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#71717a' }}>
                                {Boolean(activeVersion.year && activeVersion.year > 0) && (
                                  <span>{activeVersion.year}</span>
                                )}
                                {Boolean(activeVersion.label && activeVersion.label !== '—') && (
                                  <span>· {activeVersion.label}</span>
                                )}
                                {Boolean(activeVersion.catalog_no && activeVersion.catalog_no !== '—') && (
                                  <span>· #{activeVersion.catalog_no}</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                toggleAlbumTracks(albumId, activeVersion);
                              }}
                              style={{
                                fontSize: 11,
                                padding: '4px 8px',
                                background: isExpanded ? '#272730' : 'transparent',
                                border: '1px solid #272730',
                                borderRadius: 4,
                                color: isExpanded ? '#ffffff' : 'var(--mu)',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                              title="Inspect tracks in this album"
                            >
                              <Music size={11} />
                              <span>{isExpanded ? 'Hide' : 'Tracks'}</span>
                              {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                            </button>

                            <button
                              type="button"
                              className="p"
                              disabled={importingKey !== null}
                              onClick={e => {
                                e.stopPropagation();
                                handleImportRelease(activeVersion);
                              }}
                              style={{ fontSize: 11, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                              title={`Import entire release into ${targetNodeName}`}
                            >
                              {isImporting ? (
                                <>
                                  <Loader2 size={12} className="spin" />
                                  <span>Importing...</span>
                                </>
                              ) : (
                                <span>Import Album</span>
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Expandable Tracklist Accordion */}
                        {isExpanded && (
                          <div
                            style={{
                              padding: '10px 14px',
                              background: '#0a0a0e',
                              borderRadius: '0 0 6px 6px',
                              border: '1px solid #2e2e38',
                              borderTop: 'none',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 4,
                            }}
                          >
                            {loadingTracklistId === albumId ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--mu)', fontSize: 12, padding: '6px 0' }}>
                                <Loader2 size={12} className="spin" />
                                <span>Loading tracklist...</span>
                              </div>
                            ) : (!albumTracklists[albumId] || albumTracklists[albumId].length === 0) ? (
                              <span style={{ fontSize: 11, color: 'var(--mu)' }}>No tracklist data available for this version.</span>
                            ) : (
                              <>
                                <div style={{ fontSize: 11, color: 'var(--mu)', display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                  <span>Tracks ({albumTracklists[albumId].length}):</span>
                                  <span>Click &ldquo;+ Add&rdquo; to add individual songs directly to your crate</span>
                                </div>
                                {albumTracklists[albumId].map((t, tIdx) => {
                                  const isTrackAdded = addedTrackIds.has(t.id);
                                  const isImportingThisTrack = importingKey === `track-${t.id}`;
                                  const isTrackPlaying = playingTrackId === t.id;

                                  return (
                                    <div
                                      key={`alb-t-${t.id}-${tIdx}`}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        padding: '4px 6px',
                                        borderRadius: 4,
                                        background: isTrackPlaying ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                                      }}
                                    >
                                      <span style={{ fontSize: 11, color: 'var(--mu)', width: 20, textAlign: 'right', flexShrink: 0 }}>
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
                                            color: isTrackPlaying ? '#818cf8' : 'var(--mu)',
                                            display: 'flex',
                                            alignItems: 'center',
                                          }}
                                          title={isTrackPlaying ? 'Pause preview' : 'Play preview'}
                                        >
                                          {isTrackPlaying ? <Pause size={12} /> : <Play size={12} />}
                                        </button>
                                      )}
                                      <span
                                        style={{
                                          fontSize: 12,
                                          flex: 1,
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap',
                                          color: isTrackPlaying ? '#a5b4fc' : 'var(--fg)',
                                          fontWeight: isTrackPlaying ? 600 : 400,
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
                                        <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 2, background: '#14532d', color: '#86efac', fontWeight: 600 }}>
                                          ISRC
                                        </span>
                                      )}
                                      <button
                                        type="button"
                                        className={isTrackAdded ? '' : 'p'}
                                        disabled={isImportingThisTrack || isTrackAdded}
                                        onClick={() => handleAddTrack({ ...t, cover: t.cover || activeVersion.thumb || album.thumb })}
                                        style={{ fontSize: 10, padding: '2px 8px', flexShrink: 0 }}
                                        title={`Add "${t.title}" directly to ${targetNodeName}`}
                                      >
                                        {isTrackAdded ? (
                                          <span style={{ color: '#4ade80' }}>Added ✓</span>
                                        ) : isImportingThisTrack ? (
                                          'Adding...'
                                        ) : (
                                          '+ Add'
                                        )}
                                      </button>
                                    </div>
                                  );
                                })}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ============================================================ */}
            {/* SECTION 3: ARTISTS                                           */}
            {/* ============================================================ */}
            {visibleArtists.length > 0 && (
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#a1a1aa',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    marginBottom: 6,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <User size={12} style={{ color: '#818cf8' }} />
                  <span>Artists ({visibleArtists.length})</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {visibleArtists.map((artist, artistIdx) => {
                    if (!artist) return null;
                    const artistName = artist.name || 'Unknown Artist';
                    const key = `artist-${artistName}-${artistIdx}`;
                    const isImporting = importingKey === key;
                    const isAdded = addedArtists.has(artistName);
                    const isSelected = selectableItems[selectedIndex]?.type === 'artist' && selectableItems[selectedIndex]?.id === artistName;

                    return (
                      <div
                        key={key}
                        className={`music-cmd-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => setSelectedIndex(visibleTracks.length + filteredAlbums.length + artistIdx)}
                      >
                        <CoverArt
                          src={artist.thumb}
                          alt={artistName}
                          size={38}
                          type="artist"
                          seed={artistName}
                          rounded="full"
                        />

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <strong style={{ fontSize: 13, color: 'var(--fg)' }}>{artistName}</strong>
                            <span className="ty">Artist</span>
                            {artist.id && (
                              <span
                                style={{
                                  fontSize: 9,
                                  padding: '1px 5px',
                                  borderRadius: 3,
                                  background: '#1c1c24',
                                  color: '#a1a1aa',
                                  border: '1px solid #272733',
                                  fontFamily: 'var(--font-mono, monospace)',
                                }}
                                title={`Discogs Artist ID: ${artist.id}`}
                              >
                                a{artist.id}
                              </span>
                            )}
                          </div>
                          <small style={{ color: 'var(--mu)', fontSize: 11 }}>
                            {artist.nb_album ? `${artist.nb_album} releases cataloged` : 'Musical Artist'}
                          </small>
                        </div>

                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button
                            type="button"
                            style={{ fontSize: 11, padding: '3px 8px', background: 'transparent', border: '1px solid #272730', borderRadius: 4, color: 'var(--fg)', cursor: 'pointer' }}
                            title="Search releases specifically by this artist"
                            onClick={e => {
                              e.stopPropagation();
                              setQuery(artistName);
                              setActiveFilter('albums');
                            }}
                          >
                            View Releases
                          </button>
                          <button
                            type="button"
                            className={isAdded ? '' : 'p'}
                            disabled={isImporting || isAdded}
                            onClick={e => {
                              e.stopPropagation();
                              handleAddArtist(artist);
                            }}
                            style={{ fontSize: 11, padding: '3px 10px' }}
                            title={`Add artist container "${artistName}" to ${targetNodeName}`}
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
          </div>
          )}

          {/* ============================================================ */}
          {/* FOOTER BAR: KEYBOARD HINTS & CUSTOM DESTINATION DROPDOWN     */}
          {/* ============================================================ */}
          <div
            style={{
              padding: '8px 16px',
              background: '#09090c',
              borderTop: (hasSearched || error || discogsProgressiveLoading || isEditingToken) ? '1px solid #1c1c22' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 11,
              color: '#71717a',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            {/* Keyboard Shortcuts */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span className="music-cmd-kbd">↑</span>
                <span className="music-cmd-kbd">↓</span>
                <span>navigate</span>
              </span>

              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span className="music-cmd-kbd">↵</span>
                <span>add to crate</span>
              </span>

              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span className="music-cmd-kbd">esc</span>
                <span>close</span>
              </span>
            </div>

            {/* Custom Interactive Destination Dropdown Trigger */}
            <div style={{ position: 'relative' }}>
              <button
                ref={destButtonRef}
                type="button"
                onClick={handleToggleDestDropdown}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: destDropdownOpen ? 'rgba(99, 102, 241, 0.22)' : 'rgba(99, 102, 241, 0.1)',
                  border: destDropdownOpen ? '1px solid #818cf8' : '1px solid rgba(99, 102, 241, 0.3)',
                  color: '#c7d2fe',
                  borderRadius: 5,
                  padding: '3px 8px',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontWeight: 500,
                  transition: 'all 0.15s ease',
                }}
                title="Click to select which crate or folder to import into"
              >
                <Folder size={12} style={{ color: '#818cf8' }} />
                <span>Destination:</span>
                <span style={{ color: '#ffffff', fontWeight: 600 }}>{targetNodeName}</span>
                <ChevronDown
                  size={11}
                  style={{
                    transform: destDropdownOpen ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.15s ease',
                  }}
                />
              </button>
            </div>
          </div>
        </ErrorBoundary>
      </div>

      {/* Floating Custom Selection Popup rendered in Portal (Never cut off!) */}
      {destDropdownOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={destDropdownRef}
          onKeyDown={handleDestKeyDown}
          style={{
            position: 'fixed',
            top: destCoords.top,
            bottom: destCoords.bottom,
            right: destCoords.right,
            width: destCoords.width,
            maxHeight: destCoords.maxHeight,
            background: '#121217',
            border: '1px solid #2e2e3a',
            borderRadius: 8,
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.08)',
            zIndex: 999999,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Search input in dropdown header */}
          <div
            style={{
              padding: '6px 8px',
              borderBottom: '1px solid #1f1f26',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: '#0d0d12',
            }}
          >
            <Search size={13} style={{ color: '#818cf8', flexShrink: 0 }} />
            <input
              ref={destInputRef}
              type="text"
              placeholder="Filter crates & folders..."
              value={destSearchText}
              onChange={e => setDestSearchText(e.target.value)}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#ffffff',
                fontSize: 11,
                padding: '2px 0',
              }}
            />
            {destSearchText && (
              <button
                type="button"
                onClick={() => {
                  setDestSearchText('');
                  destInputRef.current?.focus();
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#71717a',
                  cursor: 'pointer',
                  padding: 2,
                  display: 'flex',
                }}
                title="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Scrollable list of crates */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: 4,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            {filteredDestContainers.length === 0 ? (
              <div style={{ padding: '16px 12px', fontSize: 11, color: '#71717a', textAlign: 'center' }}>
                No crates matching &ldquo;{destSearchText}&rdquo;
              </div>
            ) : (
              filteredDestContainers.map((item, idx) => {
                const isSelected = targetNodeId === item.id;
                const isHighlighted = destHighlightedIndex === idx;

                return (
                  <div
                    key={item.id}
                    ref={el => {
                      if (isHighlighted && el) {
                        el.scrollIntoView({ block: 'nearest' });
                      }
                    }}
                    onMouseEnter={() => setDestHighlightedIndex(idx)}
                    onClick={() => {
                      setTargetNodeId(item.id);
                      setDestDropdownOpen(false);
                      inputRef.current?.focus();
                    }}
                    style={{
                      padding: '6px 8px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 11,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: isHighlighted ? '#1f1f2a' : isSelected ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                      border: isSelected ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid transparent',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden' }}>
                      <Folder size={12} style={{ color: isSelected ? '#818cf8' : '#71717a', flexShrink: 0 }} />
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span
                          style={{
                            fontWeight: isSelected ? 600 : 400,
                            color: isSelected ? '#ffffff' : '#d4d4d8',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {item.name}
                        </span>
                        {item.pathString && item.pathString !== item.name && (
                          <span style={{ fontSize: 9, color: '#71717a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.pathString}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: 6 }}>
                      {isSelected && <Check size={11} style={{ color: '#818cf8' }} />}
                      <span className="ty" style={{ fontSize: 9 }}>
                        {item.type}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
