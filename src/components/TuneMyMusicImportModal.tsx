import React, { useState, useRef, useMemo, useEffect } from 'react';
import type { LibraryNode } from '../types';
import { parseTuneMyMusic, importTuneMyMusic, type ParsedTuneTrack, type TuneImportResponse } from '../api';
import { getAllNodes } from '../utils';
import { ErrorBoundary } from './ErrorBoundary';
import {
  FileText,
  Upload,
  Check,
  AlertTriangle,
  Loader2,
  Folder,
  Music,
  Disc,
  User,
  Sparkles,
  Layers,
  ArrowRight,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentNode: LibraryNode | null;
  allTreeNodes: LibraryNode[];
  onImportSuccess: (destNodeId: string) => void;
}

export const TuneMyMusicImportModal: React.FC<Props> = ({
  isOpen,
  onClose,
  currentNode,
  allTreeNodes,
  onImportSuccess,
}) => {
  const [targetNodeId, setTargetNodeId] = useState<string>(currentNode?.id || 'uncategorized');
  const [rawText, setRawText] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [parsedTracks, setParsedTracks] = useState<ParsedTuneTrack[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<TuneImportResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'upload' | 'paste'>('upload');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const allContainers = useMemo(() => {
    try {
      return getAllNodes(allTreeNodes || []);
    } catch {
      return [];
    }
  }, [allTreeNodes]);

  // Derived stats
  const uniqueArtists = useMemo(() => {
    const s = new Set(parsedTracks.map(t => t.artist.toLowerCase().trim()).filter(Boolean));
    return s.size;
  }, [parsedTracks]);

  const uniqueAlbums = useMemo(() => {
    const s = new Set(parsedTracks.map(t => `${t.artist.toLowerCase()}:::${t.album.toLowerCase()}`).filter(Boolean));
    return s.size;
  }, [parsedTracks]);

  useEffect(() => {
    if (isOpen) {
      setTargetNodeId(currentNode?.id || 'uncategorized');
    }
  }, [isOpen, currentNode]);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);
    setParsing(true);
    try {
      const text = await file.text();
      setRawText(text);
      const res = await parseTuneMyMusic(text);
      if (res.tracks.length === 0) {
        setError('No valid songs found in this file. Please verify it is a Tune My Music export.');
      } else {
        setParsedTracks(res.tracks);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to read file');
    } finally {
      setParsing(false);
    }
  };

  const handlePasteChange = async (text: string) => {
    setRawText(text);
    setError(null);
    if (!text.trim()) {
      setParsedTracks([]);
      return;
    }
    setParsing(true);
    try {
      const res = await parseTuneMyMusic(text);
      setParsedTracks(res.tracks);
    } catch (err: any) {
      setError(err?.message || 'Failed to parse text');
    } finally {
      setParsing(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setFileName(file.name);
      setError(null);
      setParsing(true);
      try {
        const text = await file.text();
        setRawText(text);
        const res = await parseTuneMyMusic(text);
        if (res.tracks.length === 0) {
          setError('No valid tracks found in this file.');
        } else {
          setParsedTracks(res.tracks);
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to process dropped file');
      } finally {
        setParsing(false);
      }
    }
  };

  const handleStartImport = async () => {
    if (parsedTracks.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      const res = await importTuneMyMusic({
        tracks: parsedTracks,
        targetNodeId: targetNodeId === 'uncategorized' ? null : targetNodeId,
      });
      setImportResult(res);
      onImportSuccess(res.destNodeId);
    } catch (err: any) {
      setError(err?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <div className="ov on" onClick={onClose} />
      <div
        className="dlg on"
        role="dialog"
        aria-label="Tune My Music Import"
        style={{ width: 'min(760px, 94%)', maxHeight: '88vh' }}
      >
        <ErrorBoundary componentName="Tune My Music Modal">
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  background: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                }}
              >
                <FileText size={17} />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Import from Tune My Music</h2>
                <div style={{ fontSize: 11, color: 'var(--mu)', marginTop: 2 }}>
                  Connect exported playlists (.txt / .csv) into structured, artwork-enriched library containers
                </div>
              </div>
            </div>
            <button onClick={onClose} style={{ padding: '2px 8px', cursor: 'pointer' }}>✕</button>
          </div>

          {/* Result State */}
          {importResult ? (
            <div style={{ textAlign: 'center', padding: '30px 10px' }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  background: 'rgba(34, 197, 94, 0.15)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                  color: '#4ade80',
                }}
              >
                <Check size={28} />
              </div>
              <h3 style={{ margin: '0 0 8px', fontSize: 18, color: '#f4f4f5' }}>
                Import &amp; Connection Complete!
              </h3>
              <p style={{ margin: '0 0 20px', color: 'var(--mu)', fontSize: 13, lineHeight: 1.5, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto' }}>
                Successfully cataloged <strong>{importResult.importedTracks} tracks</strong> across{' '}
                <strong>{importResult.artistsCount} artists</strong> and <strong>{importResult.albumsCount} albums</strong>.
                Matched {importResult.matchedArtworks} high-res artworks and resolved {importResult.matchedIsrcs} verified ISRCs.
              </p>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button
                  type="button"
                  className="p"
                  onClick={() => {
                    onClose();
                  }}
                  style={{ padding: '8px 18px', fontSize: 13 }}
                >
                  View in Library
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Destination selector */}
              <div
                style={{
                  background: '#131318',
                  border: '1px solid #22222a',
                  borderRadius: 8,
                  padding: '10px 14px',
                  marginBottom: 14,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <label style={{ fontSize: 12, color: '#d4d4d8', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Folder size={14} style={{ color: '#818cf8' }} />
                  <span>Target Destination:</span>
                </label>
                <select
                  value={targetNodeId}
                  onChange={e => setTargetNodeId(e.target.value)}
                  style={{
                    background: '#1c1c24',
                    border: '1px solid #333342',
                    color: '#f4f4f5',
                    fontSize: 12,
                    padding: '4px 10px',
                    borderRadius: 6,
                    flex: 1,
                    minWidth: 220,
                  }}
                >
                  <option value="uncategorized">[Root] Uncategorized (Root Library)</option>
                  {allContainers.map(c => (
                    <option key={c.id} value={c.id}>
                      [{c.type || 'Container'}] {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tabs: Upload File vs Paste Text */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                <button
                  type="button"
                  onClick={() => setActiveTab('upload')}
                  style={{
                    padding: '5px 12px',
                    fontSize: 12,
                    fontWeight: activeTab === 'upload' ? 600 : 400,
                    background: activeTab === 'upload' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                    border: '1px solid',
                    borderColor: activeTab === 'upload' ? 'rgba(255, 255, 255, 0.2)' : 'transparent',
                    borderRadius: 6,
                    color: activeTab === 'upload' ? '#ffffff' : 'var(--mu)',
                    cursor: 'pointer',
                  }}
                >
                  Upload .txt File
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('paste')}
                  style={{
                    padding: '5px 12px',
                    fontSize: 12,
                    fontWeight: activeTab === 'paste' ? 600 : 400,
                    background: activeTab === 'paste' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                    border: '1px solid',
                    borderColor: activeTab === 'paste' ? 'rgba(255, 255, 255, 0.2)' : 'transparent',
                    borderRadius: 6,
                    color: activeTab === 'paste' ? '#ffffff' : 'var(--mu)',
                    cursor: 'pointer',
                  }}
                >
                  Paste Text
                </button>
              </div>

              {/* Tab 1: Upload Dropzone */}
              {activeTab === 'upload' && (
                <div
                  onDragOver={e => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: '2px dashed #2e2e38',
                    borderRadius: 10,
                    padding: '30px 20px',
                    textAlign: 'center',
                    background: '#121217',
                    cursor: 'pointer',
                    marginBottom: 14,
                    transition: 'border-color 0.15s ease',
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.csv,text/plain"
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                  />
                  <Upload size={32} style={{ color: '#818cf8', margin: '0 auto 10px', display: 'block' }} />
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#f4f4f5', marginBottom: 4 }}>
                    {fileName ? `Loaded: ${fileName}` : 'Drop your Tune My Music .txt file here'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--mu)' }}>
                    or click to browse your computer (supports tab, comma, and hyphenated exports)
                  </div>
                </div>
              )}

              {/* Tab 2: Paste Raw Text */}
              {activeTab === 'paste' && (
                <div style={{ marginBottom: 14 }}>
                  <textarea
                    placeholder="Paste Tune My Music export lines here...&#10;e.g.&#10;Track Name - Artist Name - Album Name&#10;One More Time - Daft Punk - Discovery"
                    value={rawText}
                    onChange={e => handlePasteChange(e.target.value)}
                    rows={6}
                    style={{
                      width: '100%',
                      fontFamily: 'monospace',
                      fontSize: 11,
                      padding: 10,
                      background: '#121217',
                      border: '1px solid #2e2e38',
                      borderRadius: 8,
                      color: '#e4e4e7',
                      boxSizing: 'border-box',
                      resize: 'vertical',
                    }}
                  />
                </div>
              )}

              {error && (
                <div style={{ color: '#f87171', fontSize: 12, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={14} />
                  <span>{error}</span>
                </div>
              )}

              {parsing && (
                <div style={{ color: 'var(--mu)', fontSize: 12, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Loader2 size={13} className="spin" />
                  <span>Parsing music items...</span>
                </div>
              )}

              {/* Parsed Tracks Preview */}
              {parsedTracks.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#e4e4e7',
                    }}
                  >
                    <span>
                      Parsed {parsedTracks.length} tracks · {uniqueArtists} artists · {uniqueAlbums} albums
                    </span>
                    <span style={{ fontSize: 11, color: '#818cf8', fontWeight: 500 }}>
                      ⚡ Will connect to Deezer/Discogs artwork &amp; ISRCs
                    </span>
                  </div>

                  <div
                    style={{
                      maxHeight: 180,
                      overflowY: 'auto',
                      border: '1px solid #272730',
                      borderRadius: 6,
                      background: '#0d0d11',
                    }}
                  >
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #272730', color: 'var(--mu)', textAlign: 'left' }}>
                          <th style={{ padding: '6px 10px' }}>#</th>
                          <th style={{ padding: '6px 10px' }}>Title</th>
                          <th style={{ padding: '6px 10px' }}>Artist</th>
                          <th style={{ padding: '6px 10px' }}>Album</th>
                          <th style={{ padding: '6px 10px' }}>ISRC</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedTracks.slice(0, 50).map((t, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #1c1c22' }}>
                            <td style={{ padding: '5px 10px', color: 'var(--mu)' }}>{idx + 1}</td>
                            <td style={{ padding: '5px 10px', fontWeight: 500, color: '#f4f4f5' }}>{t.title}</td>
                            <td style={{ padding: '5px 10px', color: '#d4d4d8' }}>{t.artist}</td>
                            <td style={{ padding: '5px 10px', color: 'var(--mu)' }}>{t.album || '—'}</td>
                            <td style={{ padding: '5px 10px', color: t.isrc ? '#93c5fd' : 'var(--mu)', fontFamily: 'monospace' }}>
                              {t.isrc || 'Auto-resolve'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {parsedTracks.length > 50 && (
                      <div style={{ textAlign: 'center', padding: '6px 0', fontSize: 11, color: 'var(--mu)', borderTop: '1px solid #1c1c22' }}>
                        ...and {parsedTracks.length - 50} more tracks
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
                <button type="button" onClick={onClose} disabled={importing}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="p"
                  disabled={parsedTracks.length === 0 || importing}
                  onClick={handleStartImport}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 160, justifyContent: 'center' }}
                >
                  {importing ? (
                    <>
                      <Loader2 size={13} className="spin" />
                      <span>Connecting &amp; Importing...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={13} />
                      <span>Connect &amp; Import ({parsedTracks.length})</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </ErrorBoundary>
      </div>
    </>
  );
};
