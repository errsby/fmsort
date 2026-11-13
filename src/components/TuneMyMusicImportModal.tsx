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
  Sparkles,
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

  const realIsrcCount = useMemo(() => {
    return parsedTracks.filter(t => Boolean(t.isrc)).length;
  }, [parsedTracks]);

  const deezerIdCount = useMemo(() => {
    return parsedTracks.filter(t => Boolean(t.deezerId)).length;
  }, [parsedTracks]);

  useEffect(() => {
    if (isOpen) {
      setTargetNodeId(currentNode?.id || 'uncategorized');
    }
  }, [isOpen, currentNode]);

  if (!isOpen) return null;

  const handleProcessText = async (text: string, sourceName?: string) => {
    setError(null);
    setParsing(true);
    const t0 = performance.now();
    try {
      const res = await parseTuneMyMusic(text);
      const elapsed = (performance.now() - t0).toFixed(0);

      console.groupCollapsed(
        `%c[TuneMyMusic DevTools]%c Parsed ${res.tracks.length} items from ${sourceName || 'input'} (${elapsed} ms)`,
        'color: #06b6d4; font-weight: bold;',
        'color: inherit;'
      );
      console.log('Source:', sourceName || 'pasted text');
      console.log('Total Items:', res.tracks.length);
      console.log('Authentic ISRCs:', res.tracks.filter(t => t.isrc).length);
      console.log('Deezer Platform IDs:', res.tracks.filter(t => t.deezerId).length);
      console.log('First 10 Parsed Items:', res.tracks.slice(0, 10));
      console.groupEnd();

      if (res.tracks.length === 0) {
        setError('No valid songs or items found. Please verify this is a Tune My Music CSV export.');
      } else {
        setParsedTracks(res.tracks);
      }
    } catch (err: any) {
      console.error('[TuneMyMusic DevTools] Parse error:', err);
      setError(err?.message || 'Failed to parse CSV file');
    } finally {
      setParsing(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Only CSV (.csv) files are supported. Text (.txt) exports are not supported.');
      console.warn('[TuneMyMusic DevTools] Rejected non-CSV file:', file.name);
      return;
    }

    setFileName(file.name);
    console.log(`[TuneMyMusic DevTools] Reading CSV file: "${file.name}" (${(file.size / 1024).toFixed(1)} KB)`);

    try {
      const text = await file.text();
      setRawText(text);
      await handleProcessText(text, file.name);
    } catch (err: any) {
      console.error('[TuneMyMusic DevTools] File read error:', err);
      setError(err?.message || 'Failed to read CSV file');
    }
  };

  const handlePasteChange = async (text: string) => {
    setRawText(text);
    if (!text.trim()) {
      setParsedTracks([]);
      return;
    }
    await handleProcessText(text, 'pasted CSV text');
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Only CSV (.csv) files are supported. Text (.txt) exports are not supported.');
      console.warn('[TuneMyMusic DevTools] Rejected dropped non-CSV file:', file.name);
      return;
    }

    setFileName(file.name);
    console.log(`[TuneMyMusic DevTools] Dropped CSV file: "${file.name}" (${(file.size / 1024).toFixed(1)} KB)`);

    try {
      const text = await file.text();
      setRawText(text);
      await handleProcessText(text, file.name);
    } catch (err: any) {
      console.error('[TuneMyMusic DevTools] Drop read error:', err);
      setError(err?.message || 'Failed to process dropped CSV file');
    }
  };

  const handleStartImport = async () => {
    if (parsedTracks.length === 0 || importing) return;

    console.group(`%c[TuneMyMusic DevTools]%c Starting Import of ${parsedTracks.length} items`, 'color: #10b981; font-weight: bold;', 'color: inherit;');
    console.log('Target Destination Container ID:', targetNodeId);
    console.log('Items Payload Count:', parsedTracks.length);
    console.time('[TuneMyMusic DevTools] Full Import Duration');

    setImporting(true);
    setError(null);

    try {
      const res = await importTuneMyMusic({
        tracks: parsedTracks,
        targetNodeId: targetNodeId === 'uncategorized' ? null : targetNodeId,
      });

      console.timeEnd('[TuneMyMusic DevTools] Full Import Duration');
      console.log('%c[TuneMyMusic DevTools] Import Succeeded!%c', 'color: #10b981; font-weight: bold;', '', {
        importedTracks: res.importedTracks,
        artistsCount: res.artistsCount,
        albumsCount: res.albumsCount,
        matchedArtworks: res.matchedArtworks,
        destinationNodeId: res.destNodeId,
      });
      console.groupEnd();

      setImportResult(res);
      onImportSuccess(res.destNodeId);
    } catch (err: any) {
      console.timeEnd('[TuneMyMusic DevTools] Full Import Duration');
      console.error('[TuneMyMusic DevTools] Import Failed:', err);
      console.groupEnd();
      setError(err?.message || 'Import failed. Check DevTools console for details.');
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
        aria-label="Tune My Music CSV Import"
        style={{ width: 'min(780px, 94%)', maxHeight: '88vh' }}
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
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Import from Tune My Music (CSV)</h2>
                <div style={{ fontSize: 11, color: 'var(--mu)', marginTop: 2 }}>
                  Import exported playlists (.csv) into structured library crates with authentic ISRCs &amp; artwork
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
              <p style={{ margin: '0 0 20px', color: 'var(--mu)', fontSize: 13, lineHeight: 1.5, maxWidth: 500, marginLeft: 'auto', marginRight: 'auto' }}>
                Successfully cataloged <strong>{importResult.importedTracks} tracks</strong> across{' '}
                <strong>{importResult.artistsCount} artists</strong> and <strong>{importResult.albumsCount} albums</strong>.
                {importResult.matchedIsrcs > 0 && ` Resolved ${importResult.matchedIsrcs} verified ISRCs.`}
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

              {/* Tabs: Upload CSV File vs Paste CSV Text */}
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
                  Upload .csv File
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
                  Paste CSV Text
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
                    padding: '26px 20px',
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
                    accept=".csv,text/csv"
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                  />
                  <Upload size={30} style={{ color: '#06b6d4', margin: '0 auto 8px', display: 'block' }} />
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#f4f4f5', marginBottom: 4 }}>
                    {fileName ? `Loaded: ${fileName}` : 'Drop your Tune My Music .csv file here'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--mu)' }}>
                    Only CSV (.csv) exports supported · Click to browse computer
                  </div>
                </div>
              )}

              {/* Tab 2: Paste Raw CSV Text */}
              {activeTab === 'paste' && (
                <div style={{ marginBottom: 14 }}>
                  <textarea
                    placeholder="Paste Tune My Music CSV rows here...&#10;Track name,Artist name,Album,Playlist name,Type,ISRC,Deezer - id&#10;&quot;Die Hard&quot;,&quot;Kendrick Lamar&quot;,&quot;Mr. Morale&quot;,&quot;All&quot;,&quot;Playlist&quot;,&quot;USUM72208965&quot;,&quot;1766771527&quot;"
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
                <div style={{ color: '#f87171', fontSize: 12, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(239,68,68,0.1)', padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.2)' }}>
                  <AlertTriangle size={15} />
                  <span>{error}</span>
                </div>
              )}

              {parsing && (
                <div style={{ color: 'var(--mu)', fontSize: 12, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Loader2 size={13} className="spin" />
                  <span>Parsing CSV rows and validating ISRCs...</span>
                </div>
              )}

              {/* Active Importing Indicator */}
              {importing && (
                <div
                  style={{
                    background: '#111827',
                    border: '1px solid #3b82f6',
                    borderRadius: 8,
                    padding: '12px 16px',
                    marginBottom: 14,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <Loader2 size={18} className="spin" style={{ color: '#60a5fa' }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#f4f4f5' }}>
                      Importing {parsedTracks.length} items into library...
                    </div>
                    <div style={{ fontSize: 11, color: '#93c5fd', marginTop: 2 }}>
                      Creating crate hierarchy in database. Check browser DevTools console for live execution reports.
                    </div>
                  </div>
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
                      Parsed {parsedTracks.length} items · {uniqueArtists} artists · {uniqueAlbums} albums
                      {realIsrcCount > 0 && ` · ${realIsrcCount} ISRCs`}
                      {deezerIdCount > 0 && ` · ${deezerIdCount} Deezer IDs`}
                    </span>
                    <span style={{ fontSize: 11, color: '#38bdf8', fontWeight: 500 }}>
                      ⚡ SQLite Fast Ingestion
                    </span>
                  </div>

                  <div
                    style={{
                      maxHeight: 200,
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
                          <th style={{ padding: '6px 10px' }} title="Authentic 12-character ISRC or Platform Track ID">
                            ISRC / Platform ID
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedTracks.slice(0, 50).map((t, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #1c1c22' }}>
                            <td style={{ padding: '5px 10px', color: 'var(--mu)' }}>{idx + 1}</td>
                            <td style={{ padding: '5px 10px', fontWeight: 500, color: '#f4f4f5' }}>
                              {t.type === 'Artist' ? `[Artist Crate] ${t.artist}` : t.title}
                            </td>
                            <td style={{ padding: '5px 10px', color: '#d4d4d8' }}>{t.artist}</td>
                            <td style={{ padding: '5px 10px', color: 'var(--mu)' }}>{t.album || '—'}</td>
                            <td style={{ padding: '5px 10px' }}>
                              {t.isrc ? (
                                <span
                                  style={{
                                    color: '#60a5fa',
                                    fontFamily: 'monospace',
                                    fontWeight: 600,
                                    background: 'rgba(96, 165, 250, 0.1)',
                                    padding: '1px 5px',
                                    borderRadius: 3,
                                  }}
                                  title={`Authentic ISRC: ${t.isrc}`}
                                >
                                  {t.isrc}
                                </span>
                              ) : t.deezerId ? (
                                <span
                                  style={{
                                    color: '#c084fc',
                                    fontFamily: 'monospace',
                                    fontSize: 10,
                                    background: 'rgba(192, 132, 252, 0.12)',
                                    border: '1px solid rgba(192, 132, 252, 0.25)',
                                    padding: '1px 5px',
                                    borderRadius: 3,
                                  }}
                                  title={`Deezer Track ID: ${t.deezerId}`}
                                >
                                  Deezer #{t.deezerId}
                                </span>
                              ) : t.type === 'Artist' ? (
                                <span
                                  style={{
                                    color: '#34d399',
                                    fontSize: 10,
                                    background: 'rgba(52, 211, 153, 0.12)',
                                    padding: '1px 5px',
                                    borderRadius: 3,
                                  }}
                                >
                                  Artist Crate
                                </span>
                              ) : (
                                <span style={{ color: 'var(--mu)', fontSize: 11 }}>—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {parsedTracks.length > 50 && (
                      <div style={{ textAlign: 'center', padding: '6px 0', fontSize: 11, color: 'var(--mu)', borderTop: '1px solid #1c1c22' }}>
                        ...and {parsedTracks.length - 50} more items
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
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 170, justifyContent: 'center' }}
                >
                  {importing ? (
                    <>
                      <Loader2 size={13} className="spin" />
                      <span>Importing ({parsedTracks.length})...</span>
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
