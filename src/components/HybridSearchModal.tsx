import React, { useState, useEffect, useRef } from 'react';
import type {
  LibraryNode,
  SearchProvider,
  UnifiedReleaseSummary,
  UnifiedArtistSummary,
} from '../types';
import {
  fetchDiscogsStatus,
  saveDiscogsToken,
  searchHybrid,
  searchDiscogs,
  searchMusicBrainz,
  importUniversalRelease,
  importArtistContainer,
} from '../api';
import { getAllNodes } from '../utils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentNode: LibraryNode | null;
  allTreeNodes: LibraryNode[];
  onImportSuccess: (destNodeId: string) => void;
}

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
  const [releaseResults, setReleaseResults] = useState<UnifiedReleaseSummary[]>([]);
  const [counts, setCounts] = useState<{ artists: number; discogsReleases: number; deezerReleases: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const [importingKey, setImportingKey] = useState<string | null>(null);
  const [addedArtists, setAddedArtists] = useState<Set<string>>(new Set());
  const [targetNodeId, setTargetNodeId] = useState<string>('');
  const [createAlbumContainer, setCreateAlbumContainer] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

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
      setReleaseResults([]);
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

    const trimmed = query.trim();
    if (!trimmed) {
      setArtistResults([]);
      setReleaseResults([]);
      setCounts(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    debounceTimer.current = setTimeout(async () => {
      try {
        if (provider === 'hybrid') {
          const res = await searchHybrid(trimmed);
          setArtistResults(res.artists || []);
          setReleaseResults(res.releases || []);
          setCounts(res.counts || null);
          setHasDiscogsToken(res.discogsConfigured);
        } else if (provider === 'discogs') {
          const res = await searchDiscogs(trimmed);
          setArtistResults([]);
          setReleaseResults(
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
          );
        } else if (provider === 'deezer') {
          const res = await searchHybrid(trimmed);
          setArtistResults((res.artists || []).filter(a => a.source === 'deezer'));
          setReleaseResults((res.releases || []).filter(r => r.source === 'deezer'));
        } else if (provider === 'musicbrainz') {
          const res = await searchMusicBrainz(trimmed);
          setArtistResults([]);
          setReleaseResults(
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
          );
        }
      } catch (err: any) {
        if (err.message === 'NO_TOKEN') {
          setHasDiscogsToken(false);
          setIsEditingToken(true);
        } else {
          setError(err.message || 'Error querying database');
        }
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
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
        setReleaseResults(res.releases || []);
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
      const { destNodeId } = await importArtistContainer(artist.name, targetNodeId);
      setAddedArtists(prev => new Set(prev).add(artist.name));
      onImportSuccess(destNodeId);
    } catch (err: any) {
      setError(err.message || 'Failed to add artist container');
    } finally {
      setImportingKey(null);
    }
  };

  const handleImportRelease = async (r: UnifiedReleaseSummary) => {
    if (!targetNodeId) return;
    const key = `release-${r.source}-${r.id}`;
    setImportingKey(key);
    setError(null);
    try {
      const { destNodeId } = await importUniversalRelease(
        r.source,
        r.id,
        targetNodeId,
        createAlbumContainer
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
          <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: '#172554', color: '#93c5fd', border: '1px solid #1e40af', fontWeight: 600, letterSpacing: '0.04em' }}>
            DISCOGS
          </span>
        );
      case 'deezer':
        return (
          <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: '#3b0764', color: '#d8b4fe', border: '1px solid #6b21a8', fontWeight: 600, letterSpacing: '0.04em' }}>
            DEEZER
          </span>
        );
      case 'musicbrainz':
        return (
          <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: '#451a03', color: '#fcd34d', border: '1px solid #92400e', fontWeight: 600, letterSpacing: '0.04em' }}>
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
      <div className="dlg on" role="dialog" aria-label="Search and Import Releases">
        {/* Top Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>Search & Import</h2>
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
                }}
              >
                ⚡ Hybrid (Artists & Releases)
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
                }}
              >
                MusicBrainz
              </button>
            </div>
          </div>
          <button onClick={onClose} style={{ padding: '2px 8px' }}>✕</button>
        </div>

        {/* Server Provider Status */}
        <div style={{ marginBottom: 12 }}>
          {hasDiscogsToken ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#93c5fd', background: '#0f172a', border: '1px solid #1e3a5f', padding: '4px 10px', borderRadius: 6 }}>
              <span>✓ Discogs 17.5M+ Catalog & Deezer Streaming Active</span>
            </div>
          ) : (
            <div style={{ background: '#1c1917', border: '1px solid #78350f', borderRadius: 6, padding: '6px 10px', fontSize: 11, color: 'var(--mu)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>⚡ Deezer active. Discogs server credentials not yet configured in <code>.env</code>.</span>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
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
              Create Album container when importing releases
            </label>
          </div>

          <input
            ref={inputRef}
            type="search"
            placeholder="Search artists, albums, catalog numbers, barcodes, vinyl pressings..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoComplete="off"
          />
        </div>

        {error && (
          <div style={{ color: '#f87171', padding: '8px 0', fontSize: 12 }}>
            {error}
          </div>
        )}

        {loading && (
          <div style={{ color: 'var(--mu)', padding: '14px 0', textAlign: 'center' }}>
            Searching {provider === 'hybrid' ? 'artists & releases across Discogs & Deezer' : provider}...
          </div>
        )}

        {/* Results Container */}
        <div style={{ marginTop: 4 }}>
          {!loading && artistResults.length === 0 && releaseResults.length === 0 && query.trim() !== '' && (
            <p style={{ color: 'var(--mu)', margin: '14px 0' }}>
              No artists or releases found matching &ldquo;{query}&rdquo;.
            </p>
          )}

          {/* ============================================================ */}
          {/* SECTION 1: ARTISTS (ALWAYS DISPLAYED FIRST)                   */}
          {/* ============================================================ */}
          {artistResults.length > 0 && (
            <div style={{ marginBottom: 20 }}>
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
                  — Add artist container or scope releases
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
                      {artist.thumb ? (
                        <img
                          src={artist.thumb}
                          alt=""
                          style={{
                            width: 42,
                            height: 42,
                            borderRadius: '50%',
                            objectFit: 'cover',
                            background: '#1c1c20',
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 42,
                            height: 42,
                            borderRadius: '50%',
                            background: '#27272a',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--mu)',
                            fontSize: 16,
                            flexShrink: 0,
                          }}
                        >
                          👤
                        </div>
                      )}

                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <strong style={{ fontSize: 14 }}>{artist.name}</strong>
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
          {/* SECTION 2: RELEASES & ALBUMS (DISPLAYED AFTER ARTISTS)        */}
          {/* ============================================================ */}
          {releaseResults.length > 0 && (
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
                <span>💿 Releases & Albums ({releaseResults.length})</span>
                {counts && (
                  <span style={{ color: 'var(--mu)', fontWeight: 400, textTransform: 'none', fontSize: 11 }}>
                    — {counts.discogsReleases} from Discogs, {counts.deezerReleases} from Deezer
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {releaseResults.map(r => {
                  const key = `release-${r.source}-${r.id}`;
                  const isImporting = importingKey === key;

                  return (
                    <div key={key} className="r">
                      {r.thumb ? (
                        <img
                          src={r.thumb}
                          alt=""
                          style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 4, background: '#1c1c20', flexShrink: 0 }}
                        />
                      ) : (
                        <div style={{ width: 44, height: 44, borderRadius: 4, background: '#27272a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mu)', fontSize: 11, flexShrink: 0 }}>
                          ♫
                        </div>
                      )}

                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <strong>{r.artist}</strong> — {r.title}
                          {getSourceBadge(r.source)}
                        </div>
                        <small>
                          {r.year ? r.year : 'Unknown Year'}
                          {r.format && ` · ${r.format}`}
                          {r.catalog_no !== '—' && ` · Cat #${r.catalog_no}`}
                          {r.barcode !== '—' && ` · Barcode ${r.barcode}`}
                          {r.country && ` · ${r.country}`}
                          {r.label && ` · ${r.label}`}
                          {r.track_count ? ` · ${r.track_count} tracks` : ''}
                        </small>
                      </div>

                      <button
                        className="p"
                        disabled={importingKey !== null}
                        onClick={() => handleImportRelease(r)}
                        style={{ flexShrink: 0 }}
                      >
                        {isImporting ? 'Importing...' : 'Import Release'}
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
