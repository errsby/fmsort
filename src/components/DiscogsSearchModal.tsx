import React, { useState, useEffect, useRef } from 'react';
import type { LibraryNode, DiscogsReleaseSummary, MbReleaseSummary } from '../types';
import {
  fetchDiscogsStatus,
  saveDiscogsToken,
  searchDiscogs,
  importDiscogsRelease,
  searchMusicBrainz,
  importMusicBrainzRelease,
} from '../api';
import { getAllNodes } from '../utils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentNode: LibraryNode | null;
  allTreeNodes: LibraryNode[];
  onImportSuccess: (destNodeId: string) => void;
}

export const DiscogsSearchModal: React.FC<Props> = ({
  isOpen,
  onClose,
  currentNode,
  allTreeNodes,
  onImportSuccess,
}) => {
  const [provider, setProvider] = useState<'discogs' | 'musicbrainz'>('discogs');
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [tokenPreview, setTokenPreview] = useState<string>('');
  const [tokenInput, setTokenInput] = useState<string>('');
  const [isEditingToken, setIsEditingToken] = useState(false);
  const [savingToken, setSavingToken] = useState(false);

  const [query, setQuery] = useState('');
  const [discogsResults, setDiscogsResults] = useState<DiscogsReleaseSummary[]>([]);
  const [mbResults, setMbResults] = useState<MbReleaseSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [importingId, setImportingId] = useState<string | number | null>(null);
  const [targetNodeId, setTargetNodeId] = useState<string>('');
  const [createAlbumContainer, setCreateAlbumContainer] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  const checkTokenStatus = async () => {
    try {
      const status = await fetchDiscogsStatus();
      setHasToken(status.hasToken);
      setTokenPreview(status.tokenPreview || '');
      if (!status.hasToken) {
        setIsEditingToken(true);
      }
    } catch {
      setHasToken(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setTargetNodeId(currentNode?.id || allTreeNodes[0]?.id || '');
      setQuery('');
      setDiscogsResults([]);
      setMbResults([]);
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
      setDiscogsResults([]);
      setMbResults([]);
      setLoading(false);
      return;
    }

    if (provider === 'discogs' && !hasToken) {
      return;
    }

    setLoading(true);
    setError(null);

    debounceTimer.current = setTimeout(async () => {
      try {
        if (provider === 'discogs') {
          const res = await searchDiscogs(trimmed);
          setDiscogsResults(res);
        } else {
          const res = await searchMusicBrainz(trimmed);
          setMbResults(res);
        }
      } catch (err: any) {
        if (err.message === 'NO_TOKEN') {
          setHasToken(false);
          setIsEditingToken(true);
        } else {
          setError(err.message || 'Error querying database');
        }
      } finally {
        setLoading(false);
      }
    }, provider === 'discogs' ? 350 : 500);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query, isOpen, provider, hasToken]);

  if (!isOpen) return null;

  const allContainers = getAllNodes(allTreeNodes);

  const handleSaveToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;
    setSavingToken(true);
    setError(null);
    try {
      await saveDiscogsToken(tokenInput.trim());
      setHasToken(true);
      setIsEditingToken(false);
      setTokenInput('');
      await checkTokenStatus();
      // Re-trigger search if query exists
      if (query.trim()) {
        setLoading(true);
        const res = await searchDiscogs(query.trim());
        setDiscogsResults(res);
        setLoading(false);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save token');
    } finally {
      setSavingToken(false);
    }
  };

  const handleImportDiscogs = async (releaseId: number) => {
    if (!targetNodeId) return;
    setImportingId(releaseId);
    setError(null);
    try {
      const { destNodeId } = await importDiscogsRelease(releaseId, targetNodeId, createAlbumContainer);
      onImportSuccess(destNodeId);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to import release');
    } finally {
      setImportingId(null);
    }
  };

  const handleImportMb = async (mbid: string) => {
    if (!targetNodeId) return;
    setImportingId(mbid);
    setError(null);
    try {
      const { destNodeId } = await importMusicBrainzRelease(mbid, targetNodeId, createAlbumContainer);
      onImportSuccess(destNodeId);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to import release');
    } finally {
      setImportingId(null);
    }
  };

  return (
    <>
      <div className="ov on" onClick={onClose} />
      <div className="dlg on" role="dialog" aria-label="Search and Import Releases">
        {/* Top Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>Import Releases</h2>
            <div style={{ display: 'flex', background: 'var(--bg)', border: '1px solid var(--bd)', borderRadius: 6, padding: 2 }}>
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
                Discogs (17.5M+)
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

        {/* Discogs Token Setup Banner */}
        {provider === 'discogs' && (
          <div style={{ marginBottom: 14 }}>
            {hasToken && !isEditingToken ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--mu)', background: '#131b26', border: '1px solid #1e3a5f', padding: '5px 10px', borderRadius: 6 }}>
                <span>✓ Discogs Personal Token Active {tokenPreview && `(${tokenPreview})`}</span>
                <button
                  type="button"
                  onClick={() => setIsEditingToken(true)}
                  style={{ border: 'none', background: 'transparent', padding: '1px 4px', fontSize: 11, color: '#93c5fd', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Change Token
                </button>
              </div>
            ) : (
              <div style={{ background: '#1c1917', border: '1px solid #78350f', borderRadius: 8, padding: 12 }}>
                <div style={{ fontWeight: 500, color: '#fde68a', fontSize: 13, marginBottom: 4 }}>
                  Connect your Discogs Account
                </div>
                <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--mu)' }}>
                  To search all 17.5+ million physical releases on Discogs, enter a free personal access token.{' '}
                  <a
                    href="https://www.discogs.com/settings/developers"
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#93c5fd', textDecoration: 'underline' }}
                  >
                    Generate one in 10 seconds on Discogs ↗
                  </a>
                </p>
                <form onSubmit={handleSaveToken} style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="password"
                    placeholder="Paste Discogs Personal Access Token..."
                    value={tokenInput}
                    onChange={e => setTokenInput(e.target.value)}
                    style={{ flex: 1, fontSize: 12 }}
                  />
                  <button type="submit" className="p" disabled={savingToken || !tokenInput.trim()}>
                    {savingToken ? 'Saving...' : 'Save & Connect'}
                  </button>
                  {hasToken && (
                    <button type="button" onClick={() => setIsEditingToken(false)}>
                      Cancel
                    </button>
                  )}
                </form>
              </div>
            )}
          </div>
        )}

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
              Create Album container for release
            </label>
          </div>

          <input
            ref={inputRef}
            type="search"
            placeholder={
              provider === 'discogs'
                ? 'Search 17.5M+ releases (Artist, Album, Catalog #, Barcode, Vinyl edition)...'
                : 'Search MusicBrainz releases...'
            }
            value={query}
            onChange={e => setQuery(e.target.value)}
            disabled={provider === 'discogs' && !hasToken}
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
            Searching {provider === 'discogs' ? 'Discogs database (17.5M+ items)' : 'MusicBrainz'}...
          </div>
        )}

        {/* Results Container */}
        <div style={{ marginTop: 8 }}>
          {provider === 'discogs' && (
            <>
              {!loading && discogsResults.length === 0 && query.trim() !== '' && hasToken && (
                <p style={{ color: 'var(--mu)', margin: '14px 0' }}>
                  No releases found on Discogs matching &ldquo;{query}&rdquo;.
                </p>
              )}

              {discogsResults.map(r => (
                <div key={r.id} className="r">
                  {r.thumb ? (
                    <img
                      src={r.thumb}
                      alt=""
                      style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 4, background: '#1c1c20' }}
                    />
                  ) : (
                    <div style={{ width: 44, height: 44, borderRadius: 4, background: '#27272a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mu)', fontSize: 10 }}>
                      ♫
                    </div>
                  )}
                  <div>
                    <strong>{r.artist}</strong> — {r.title}
                    <small>
                      {r.year ? r.year : 'Unknown Year'}
                      {r.format && ` · ${r.format}`}
                      {r.catalog_no !== '—' && ` · Cat #${r.catalog_no}`}
                      {r.barcode !== '—' && ` · Barcode ${r.barcode}`}
                      {r.country && ` · ${r.country}`}
                      {r.label && ` · ${r.label}`}
                    </small>
                  </div>
                  <button
                    className="p"
                    disabled={importingId !== null}
                    onClick={() => handleImportDiscogs(r.id)}
                  >
                    {importingId === r.id ? 'Importing...' : 'Import Release'}
                  </button>
                </div>
              ))}
            </>
          )}

          {provider === 'musicbrainz' && (
            <>
              {!loading && mbResults.length === 0 && query.trim() !== '' && (
                <p style={{ color: 'var(--mu)', margin: '14px 0' }}>
                  No releases found on MusicBrainz matching &ldquo;{query}&rdquo;.
                </p>
              )}

              {mbResults.map(r => (
                <div key={r.id} className="r">
                  <div>
                    <strong>{r.artist}</strong> — {r.title}
                    <small>
                      {r.year ? r.year : 'Unknown Year'} · {r.format}
                      {r.catalog_no !== '—' && ` · Cat #${r.catalog_no}`}
                      {r.country && ` · ${r.country}`}
                      {` · ${r.track_count} tracks`}
                      {r.label && ` · ${r.label}`}
                    </small>
                  </div>
                  <button
                    className="p"
                    disabled={importingId !== null}
                    onClick={() => handleImportMb(r.id)}
                  >
                    {importingId === r.id ? 'Importing...' : 'Import Release'}
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
};
