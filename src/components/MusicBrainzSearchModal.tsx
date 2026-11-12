import React, { useState, useEffect, useRef } from 'react';
import type { LibraryNode, MbReleaseSummary } from '../types';
import { searchMusicBrainz, importMusicBrainzRelease } from '../api';
import { getAllNodes } from '../utils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentNode: LibraryNode | null;
  allTreeNodes: LibraryNode[];
  onImportSuccess: (destNodeId: string) => void;
}

export const MusicBrainzSearchModal: React.FC<Props> = ({
  isOpen,
  onClose,
  currentNode,
  allTreeNodes,
  onImportSuccess,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MbReleaseSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [targetNodeId, setTargetNodeId] = useState<string>('');
  const [createAlbumContainer, setCreateAlbumContainer] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTargetNodeId(currentNode?.id || allTreeNodes[0]?.id || '');
      setQuery('');
      setResults([]);
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, currentNode, allTreeNodes]);

  useEffect(() => {
    if (!isOpen) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    debounceTimer.current = setTimeout(async () => {
      try {
        const res = await searchMusicBrainz(trimmed);
        setResults(res);
      } catch (err: any) {
        setError(err.message || 'Error querying MusicBrainz');
      } finally {
        setLoading(false);
      }
    }, 450);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query, isOpen]);

  if (!isOpen) return null;

  const allContainers = getAllNodes(allTreeNodes);

  const handleImport = async (mbid: string) => {
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
      <div className="dlg on" role="dialog" aria-label="MusicBrainz search">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Search Live MusicBrainz</h2>
          <button onClick={onClose} style={{ padding: '2px 8px' }}>
            ✕
          </button>
        </div>

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
            placeholder="Artist, album title, catalog number, or barcode..."
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
            Querying MusicBrainz live database (rate-limited to 1 req/sec)...
          </div>
        )}

        <div style={{ marginTop: 8 }}>
          {!loading && results.length === 0 && query.trim() !== '' && (
            <p style={{ color: 'var(--mu)', margin: '14px 0' }}>
              No releases found on MusicBrainz matching &ldquo;{query}&rdquo;.
            </p>
          )}

          {results.map(r => (
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
                onClick={() => handleImport(r.id)}
              >
                {importingId === r.id ? 'Importing...' : 'Import Release'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};
