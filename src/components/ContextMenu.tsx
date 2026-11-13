import React, { useEffect, useRef, useState } from 'react';
import type { Track, LibraryNode } from '../types';
import { CoverArt } from './CoverArt';
import {
  Folder,
  Disc,
  User,
  ListMusic,
  Sparkles,
  Pencil,
  Trash2,
  Copy,
  ExternalLink,
  Plus,
  Command,
  RefreshCw,
  FolderInput,
  FileText,
  Check,
  Music,
  Layers,
  Image as ImageIcon,
  ChevronRight,
  CheckCircle2,
  RotateCcw,
  FolderPlus,
  SlidersHorizontal,
} from 'lucide-react';

export type ContextTarget =
  | { type: 'track'; track: Track; isMulti?: boolean; count?: number; selectedTracks?: Track[] }
  | { type: 'node'; node: LibraryNode; isMulti?: boolean; count?: number; selectedNodes?: LibraryNode[] }
  | { type: 'table'; activeNode: LibraryNode | null }
  | { type: 'sidebar' };

export interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  target: ContextTarget | null;
}

interface Props {
  state: ContextMenuState;
  onClose: () => void;
  // Track actions
  onInspectTrack?: (track: Track) => void;
  onResolveIsrc?: (track: Track) => void;
  onBatchResolveIsrc?: (trackIds: number[]) => void;
  onMoveTracks?: (trackIds: number[]) => void;
  onDeleteTrack?: (track: Track) => void;
  onBatchDeleteTracks?: (trackIds: number[]) => void;
  // Node actions
  onSelectNode?: (node: LibraryNode) => void;
  onImportArtistDiscography?: (nodes: LibraryNode[]) => void;
  onAddMusicToNode?: (node: LibraryNode) => void;
  onAddTrackToNode?: (node: LibraryNode) => void;
  onNewContainerInside?: (node: LibraryNode, type: string) => void;
  onEditNode?: (node: LibraryNode) => void;
  onDeleteNode?: (node: LibraryNode) => void;
  onBatchDeleteNodes?: (nodes: LibraryNode[]) => void;
  onRefreshArtwork?: (node: LibraryNode) => void;
  onBatchRefreshArtwork?: (nodes: LibraryNode[]) => void;
  onResolveNodeIsrcs?: (node: LibraryNode) => void;
  onBatchResolveNodeIsrcs?: (nodes: LibraryNode[]) => void;
  // Global actions
  onOpenImport?: () => void;
  onOpenTuneImport?: (node?: LibraryNode | null) => void;
  onOpenNewTrack?: () => void;
  onOpenNewContainer?: (type?: string) => void;
  onOpenCommandPalette?: () => void;
  onRefreshLibrary?: () => void;
  onOpenBackup?: () => void;
  onShowToast?: (message: string) => void;
  // Status Tracking actions
  statusEnabled?: boolean;
  isAlbumCompleted?: (artist?: string, album?: string) => boolean;
  onToggleAlbumCompleted?: (artist?: string, album?: string, completed?: boolean) => void;
  onBatchToggleAlbumsCompleted?: (albums: { artist?: string; album: string }[], completed: boolean) => void;
}

export const ContextMenu: React.FC<Props> = ({
  state,
  onClose,
  onInspectTrack,
  onResolveIsrc,
  onBatchResolveIsrc,
  onMoveTracks,
  onDeleteTrack,
  onBatchDeleteTracks,
  onSelectNode,
  onImportArtistDiscography,
  onAddMusicToNode,
  onAddTrackToNode,
  onNewContainerInside,
  onEditNode,
  onDeleteNode,
  onBatchDeleteNodes,
  onRefreshArtwork,
  onBatchRefreshArtwork,
  onResolveNodeIsrcs,
  onBatchResolveNodeIsrcs,
  onOpenImport,
  onOpenTuneImport,
  onOpenNewTrack,
  onOpenNewContainer,
  onOpenCommandPalette,
  onRefreshLibrary,
  onShowToast,
  statusEnabled,
  isAlbumCompleted,
  onToggleAlbumCompleted,
  onBatchToggleAlbumsCompleted,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [submenuOpen, setSubmenuOpen] = useState<string | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: state.x, y: state.y });

  // Auto-adjust positioning to stay inside the viewport
  useEffect(() => {
    if (!state.isOpen) return;

    const updatePosition = () => {
      const menuWidth = 240;
      const menuHeight = 360;
      const pad = 12;

      let x = state.x;
      let y = state.y;

      if (x + menuWidth > window.innerWidth - pad) {
        x = Math.max(pad, window.innerWidth - menuWidth - pad);
      }
      if (y + menuHeight > window.innerHeight - pad) {
        y = Math.max(pad, window.innerHeight - menuHeight - pad);
      }

      setPosition({ x, y });
    };

    updatePosition();
  }, [state.isOpen, state.x, state.y]);

  // Click outside and keydown dismissal
  useEffect(() => {
    if (!state.isOpen) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleScroll = () => {
      onClose();
    };

    document.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [state.isOpen, onClose]);

  if (!state.isOpen || !state.target) return null;

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    if (onShowToast) onShowToast(`Copied ${label} to clipboard`);
    setTimeout(() => {
      setCopiedKey(null);
      onClose();
    }, 450);
  };

  const renderContent = () => {
    const target = state.target!;

    // =========================================================================
    // 1. Single Track or Multi-Track Selection
    // =========================================================================
    if (target.type === 'track') {
      const { track, isMulti, count, selectedTracks } = target;

      // Batch Track Selection
      if (isMulti && count && count > 1) {
        const albumMap = new Map<string, { artist?: string; album: string }>();
        if (selectedTracks) {
          selectedTracks.forEach(t => {
            if (t.al) {
              const key = `${(t.a || '').toLowerCase()}:::${t.al.toLowerCase()}`;
              if (!albumMap.has(key)) {
                albumMap.set(key, { artist: t.a, album: t.al });
              }
            }
          });
        }
        const distinctAlbums = Array.from(albumMap.values());

        return (
          <>
            <div className="ctx-header">
              <div className="ctx-header-icon">
                <Layers size={16} />
              </div>
              <div className="ctx-header-meta">
                <div className="ctx-header-title">{count} Tracks Selected</div>
                <div className="ctx-header-sub">Batch Track Operations</div>
              </div>
            </div>

            <div className="ctx-divider" />

            {/* Batch Status Toggle for Tracks */}
            {statusEnabled && distinctAlbums.length > 0 && (
              <>
                <button
                  type="button"
                  className="ctx-item"
                  onClick={() => {
                    onClose();
                    onBatchToggleAlbumsCompleted?.(distinctAlbums, true);
                  }}
                >
                  <CheckCircle2 size={14} style={{ color: '#22c55e' }} />
                  <span className="ctx-item-label" style={{ fontWeight: 500 }}>
                    Mark {distinctAlbums.length} Album{distinctAlbums.length > 1 ? 's' : ''} as Completed
                  </span>
                  <span className="ctx-item-shortcut">C</span>
                </button>

                <button
                  type="button"
                  className="ctx-item"
                  onClick={() => {
                    onClose();
                    onBatchToggleAlbumsCompleted?.(distinctAlbums, false);
                  }}
                >
                  <RotateCcw size={14} style={{ color: '#f59e0b' }} />
                  <span className="ctx-item-label">
                    Mark {distinctAlbums.length} Album{distinctAlbums.length > 1 ? 's' : ''} as Incomplete
                  </span>
                </button>

                <div className="ctx-divider" />
              </>
            )}

            <button
              type="button"
              className="ctx-item"
              onClick={() => {
                onClose();
                onMoveTracks?.([]);
              }}
            >
              <FolderInput size={14} />
              <span className="ctx-item-label">Move Selected Tracks...</span>
              <span className="ctx-item-shortcut">M</span>
            </button>

            {/* Advanced Batch Tools */}
            <div
              className="ctx-item ctx-submenu-trigger"
              onMouseEnter={() => setSubmenuOpen('advanced')}
              onMouseLeave={() => setSubmenuOpen(null)}
            >
              <SlidersHorizontal size={14} style={{ color: '#a78bfa' }} />
              <span className="ctx-item-label">Advanced Tools</span>
              <ChevronRight size={13} style={{ color: 'var(--mu)', marginLeft: 'auto' }} />

              {submenuOpen === 'advanced' && (
                <div className="ctx-submenu">
                  <button
                    type="button"
                    className="ctx-item"
                    onClick={e => {
                      e.stopPropagation();
                      onClose();
                      onBatchResolveIsrc?.([]);
                    }}
                  >
                    <Sparkles size={14} style={{ color: '#60a5fa' }} />
                    <span className="ctx-item-label">Resolve Missing ISRCs</span>
                    <span className="ctx-item-shortcut">R</span>
                  </button>
                </div>
              )}
            </div>

            <div className="ctx-divider" />

            <button
              type="button"
              className="ctx-item danger"
              onClick={() => {
                onClose();
                onBatchDeleteTracks?.([]);
              }}
            >
              <Trash2 size={14} />
              <span className="ctx-item-label">Delete {count} Tracks</span>
              <span className="ctx-item-shortcut">⌫</span>
            </button>
          </>
        );
      }

      // Single Track
      return (
        <>
          <div className="ctx-header">
            <CoverArt
              src={track.cover_url}
              alt={track.t}
              size={32}
              type="album"
              seed={track.al || track.t || track.a}
              rounded={4}
            />
            <div className="ctx-header-meta">
              <div className="ctx-header-title">{track.t}</div>
              <div className="ctx-header-sub">{track.a} {track.al ? `· ${track.al}` : ''}</div>
            </div>
          </div>

          <div className="ctx-divider" />

          {/* Status Completion Toggle */}
          {statusEnabled && track.al && (
            <>
              {(() => {
                const isCompleted = isAlbumCompleted?.(track.a, track.al) || false;
                return (
                  <button
                    type="button"
                    className="ctx-item"
                    onClick={() => {
                      onClose();
                      onToggleAlbumCompleted?.(track.a, track.al, !isCompleted);
                    }}
                  >
                    {isCompleted ? (
                      <RotateCcw size={14} style={{ color: '#f59e0b' }} />
                    ) : (
                      <CheckCircle2 size={14} style={{ color: '#22c55e' }} />
                    )}
                    <span className="ctx-item-label" style={{ fontWeight: 500 }}>
                      {isCompleted ? `Mark Album Incomplete` : `Mark Album Completed`}
                    </span>
                    <span className="ctx-item-shortcut">C</span>
                  </button>
                );
              })()}
              <div className="ctx-divider" />
            </>
          )}

          {/* Primary Track Actions */}
          <button
            type="button"
            className="ctx-item"
            onClick={() => {
              onClose();
              onInspectTrack?.(track);
            }}
          >
            <FileText size={14} />
            <span className="ctx-item-label">Inspect &amp; Edit Metadata</span>
            <span className="ctx-item-shortcut">Enter</span>
          </button>

          <button
            type="button"
            className="ctx-item"
            onClick={() => {
              onClose();
              onMoveTracks?.([track.id]);
            }}
          >
            <FolderInput size={14} />
            <span className="ctx-item-label">Move Track...</span>
            <span className="ctx-item-shortcut">M</span>
          </button>

          <div className="ctx-divider" />

          {/* Advanced Metadata Tools Submenu */}
          <div
            className="ctx-item ctx-submenu-trigger"
            onMouseEnter={() => setSubmenuOpen('advanced')}
            onMouseLeave={() => setSubmenuOpen(null)}
          >
            <SlidersHorizontal size={14} style={{ color: '#a78bfa' }} />
            <span className="ctx-item-label">Advanced Tools</span>
            <ChevronRight size={13} style={{ color: 'var(--mu)', marginLeft: 'auto' }} />

            {submenuOpen === 'advanced' && (
              <div className="ctx-submenu">
                <button
                  type="button"
                  className="ctx-item"
                  onClick={e => {
                    e.stopPropagation();
                    onClose();
                    onResolveIsrc?.(track);
                  }}
                >
                  <Sparkles size={14} style={{ color: '#60a5fa' }} />
                  <span className="ctx-item-label">Find Verified ISRC</span>
                  <span className="ctx-item-shortcut">R</span>
                </button>

                <div className="ctx-divider" />

                <button
                  type="button"
                  className="ctx-item"
                  onClick={e => {
                    e.stopPropagation();
                    handleCopy(`${track.a} - ${track.t}`, 'Track Name');
                  }}
                >
                  {copiedKey === 'Track Name' ? <Check size={14} style={{ color: '#4ade80' }} /> : <Copy size={14} />}
                  <span className="ctx-item-label">Copy "Artist - Title"</span>
                  <span className="ctx-item-shortcut">⌘C</span>
                </button>

                {track.isrc && track.isrc !== '—' && (
                  <button
                    type="button"
                    className="ctx-item"
                    onClick={e => {
                      e.stopPropagation();
                      handleCopy(track.isrc, 'ISRC');
                    }}
                  >
                    {copiedKey === 'ISRC' ? <Check size={14} style={{ color: '#4ade80' }} /> : <Copy size={14} />}
                    <span className="ctx-item-label">Copy ISRC ({track.isrc})</span>
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="ctx-divider" />

          {/* Danger */}
          <button
            type="button"
            className="ctx-item danger"
            onClick={() => {
              onClose();
              onDeleteTrack?.(track);
            }}
          >
            <Trash2 size={14} />
            <span className="ctx-item-label">Delete Track</span>
            <span className="ctx-item-shortcut">⌫</span>
          </button>
        </>
      );
    }

    // =========================================================================
    // 2. Node (Folder, Album, Artist, Playlist) - Single or Multi-Selection
    // =========================================================================
    if (target.type === 'node') {
      const { node, isMulti, count = 1, selectedNodes = [node] } = target;
      const artistNodes = selectedNodes.filter(n => n.type === 'Artist');
      const artistCount = artistNodes.length;
      const albumNodes = selectedNodes.filter(n => n.type === 'Album');
      const albumCount = albumNodes.length;
      const folderNodes = selectedNodes.filter(n => n.type === 'Folder');
      const folderCount = folderNodes.length;

      // Multi-Container Selection Actions
      if (isMulti && count > 1) {
        return (
          <>
            <div className="ctx-header">
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  background: 'rgba(99, 102, 241, 0.2)',
                  border: '1px solid rgba(99, 102, 241, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#a5b4fc',
                  flexShrink: 0,
                }}
              >
                <Layers size={16} />
              </div>
              <div className="ctx-header-meta">
                <div className="ctx-header-title">{count} Containers Selected</div>
                <div className="ctx-header-sub" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                  {albumCount > 0 && (
                    <span className="active-hero-badge" style={{ fontSize: 9, background: '#312e81', color: '#c7d2fe', border: '1px solid #4338ca' }}>
                      {albumCount} ALBUM{albumCount > 1 ? 'S' : ''}
                    </span>
                  )}
                  {artistCount > 0 && (
                    <span className="active-hero-badge" style={{ fontSize: 9, background: '#064e3b', color: '#a7f3d0', border: '1px solid #059669' }}>
                      {artistCount} ARTIST{artistCount > 1 ? 'S' : ''}
                    </span>
                  )}
                  {folderCount > 0 && (
                    <span className="active-hero-badge" style={{ fontSize: 9, background: '#78350f', color: '#fde68a', border: '1px solid #d97706' }}>
                      {folderCount} FOLDER{folderCount > 1 ? 'S' : ''}
                    </span>
                  )}
                  <span> · Batch actions</span>
                </div>
              </div>
            </div>

            <div className="ctx-divider" />

            {/* Batch Album Completion Status */}
            {statusEnabled && albumCount > 0 && (
              <>
                <button
                  type="button"
                  className="ctx-item"
                  onClick={() => {
                    onClose();
                    const albumsToMark = albumNodes.map(n => ({ artist: n.tracks?.[0]?.a, album: n.name }));
                    onBatchToggleAlbumsCompleted?.(albumsToMark, true);
                  }}
                >
                  <CheckCircle2 size={14} style={{ color: '#22c55e' }} />
                  <span className="ctx-item-label" style={{ fontWeight: 500 }}>
                    Mark {albumCount} Album{albumCount > 1 ? 's' : ''} as Completed
                  </span>
                  <span className="ctx-item-shortcut">C</span>
                </button>
                <button
                  type="button"
                  className="ctx-item"
                  onClick={() => {
                    onClose();
                    const albumsToMark = albumNodes.map(n => ({ artist: n.tracks?.[0]?.a, album: n.name }));
                    onBatchToggleAlbumsCompleted?.(albumsToMark, false);
                  }}
                >
                  <RotateCcw size={14} style={{ color: '#f59e0b' }} />
                  <span className="ctx-item-label">
                    Mark {albumCount} Album{albumCount > 1 ? 's' : ''} as Incomplete
                  </span>
                </button>
                <div className="ctx-divider" />
              </>
            )}

            {/* Batch Artist Full Discography Import */}
            {artistCount > 0 && (
              <button
                type="button"
                className="ctx-item"
                onClick={() => {
                  onClose();
                  onImportArtistDiscography?.(artistNodes);
                }}
              >
                <Layers size={14} style={{ color: '#818cf8' }} />
                <span className="ctx-item-label" style={{ fontWeight: 500 }}>
                  {artistCount === 1 ? 'Import Complete Discography' : `Import Complete Discographies (${artistCount} Artists)`}
                </span>
                <span className="ctx-item-shortcut">D</span>
              </button>
            )}

            {/* Advanced Batch Tools */}
            <div
              className="ctx-item ctx-submenu-trigger"
              onMouseEnter={() => setSubmenuOpen('advanced')}
              onMouseLeave={() => setSubmenuOpen(null)}
            >
              <SlidersHorizontal size={14} style={{ color: '#a78bfa' }} />
              <span className="ctx-item-label">Advanced Tools ({count})</span>
              <ChevronRight size={13} style={{ color: 'var(--mu)', marginLeft: 'auto' }} />

              {submenuOpen === 'advanced' && (
                <div className="ctx-submenu">
                  <button
                    type="button"
                    className="ctx-item"
                    onClick={e => {
                      e.stopPropagation();
                      onClose();
                      onBatchRefreshArtwork?.(selectedNodes);
                    }}
                  >
                    <ImageIcon size={14} />
                    <span className="ctx-item-label">Refresh Discogs Artwork</span>
                  </button>

                  <button
                    type="button"
                    className="ctx-item"
                    onClick={e => {
                      e.stopPropagation();
                      onClose();
                      onBatchResolveNodeIsrcs?.(selectedNodes);
                    }}
                  >
                    <Sparkles size={14} style={{ color: '#60a5fa' }} />
                    <span className="ctx-item-label">Resolve Missing ISRCs</span>
                    <span className="ctx-item-shortcut">R</span>
                  </button>
                </div>
              )}
            </div>

            <div className="ctx-divider" />

            {/* Batch Delete Containers */}
            <button
              type="button"
              className="ctx-item danger"
              onClick={() => {
                onClose();
                onBatchDeleteNodes?.(selectedNodes);
              }}
            >
              <Trash2 size={14} />
              <span className="ctx-item-label">Delete {count} Containers</span>
              <span className="ctx-item-shortcut">⌫</span>
            </button>
          </>
        );
      }

      // Single Node Actions
      const isFolder = node.type === 'Folder';
      const isAlbum = node.type === 'Album';
      const isArtist = node.type === 'Artist';

      return (
        <>
          {/* Header Preview */}
          <div className="ctx-header">
            <CoverArt
              src={isFolder ? null : (node.cover_url || node.tracks?.[0]?.cover_url)}
              alt={node.name}
              size={32}
              type={isArtist ? 'artist' : isFolder ? 'folder' : 'album'}
              seed={node.name}
              rounded={isArtist ? 'full' : 4}
            />
            <div className="ctx-header-meta">
              <div className="ctx-header-title">{node.name}</div>
              <div className="ctx-header-sub">
                <span className="active-hero-badge" style={{ fontSize: 9 }}>{node.type.toUpperCase()}</span>
                <span> · {node.tracks?.length || 0} tracks</span>
              </div>
            </div>
          </div>

          <div className="ctx-divider" />

          {/* Album Completion Status */}
          {statusEnabled && isAlbum && (
            <>
              {(() => {
                const albumArtist = node.tracks?.[0]?.a || '';
                const isCompleted = isAlbumCompleted?.(albumArtist, node.name) || false;
                return (
                  <button
                    type="button"
                    className="ctx-item"
                    onClick={() => {
                      onClose();
                      onToggleAlbumCompleted?.(albumArtist, node.name, !isCompleted);
                    }}
                  >
                    {isCompleted ? (
                      <RotateCcw size={14} style={{ color: '#f59e0b' }} />
                    ) : (
                      <CheckCircle2 size={14} style={{ color: '#22c55e' }} />
                    )}
                    <span className="ctx-item-label" style={{ fontWeight: 500 }}>
                      {isCompleted ? 'Mark as Incomplete' : 'Mark as Completed'}
                    </span>
                    <span className="ctx-item-shortcut">C</span>
                  </button>
                );
              })()}
              <div className="ctx-divider" />
            </>
          )}

          {/* 1. TOP ITEM: Search Releases (with attached Add Track Manually & Discography dropdown selection) */}
          <div
            className="ctx-item ctx-submenu-trigger"
            onMouseEnter={() => setSubmenuOpen('addMusic')}
            onMouseLeave={() => setSubmenuOpen(null)}
            onClick={() => {
              onClose();
              onAddMusicToNode?.(node);
            }}
          >
            <Sparkles size={14} style={{ color: '#60a5fa' }} />
            <span className="ctx-item-label" style={{ fontWeight: 500 }}>Search Releases</span>
            <span className="ctx-item-shortcut">A</span>
            <ChevronRight size={13} style={{ color: 'var(--mu)', marginLeft: 4 }} />

            {submenuOpen === 'addMusic' && (
              <div className="ctx-submenu">
                <button
                  type="button"
                  className="ctx-item"
                  onClick={e => {
                    e.stopPropagation();
                    onClose();
                    onAddMusicToNode?.(node);
                  }}
                >
                  <Sparkles size={14} style={{ color: '#60a5fa' }} />
                  <span className="ctx-item-label">Search Releases (Discogs / Deezer)</span>
                  <span className="ctx-item-shortcut">A</span>
                </button>
                <button
                  type="button"
                  className="ctx-item"
                  onClick={e => {
                    e.stopPropagation();
                    onClose();
                    onAddTrackToNode?.(node);
                  }}
                >
                  <Plus size={14} />
                  <span className="ctx-item-label">Add Track Manually...</span>
                  <span className="ctx-item-shortcut">T</span>
                </button>
                {isArtist && (
                  <button
                    type="button"
                    className="ctx-item"
                    onClick={e => {
                      e.stopPropagation();
                      onClose();
                      onImportArtistDiscography?.([node]);
                    }}
                  >
                    <Layers size={14} style={{ color: '#818cf8' }} />
                    <span className="ctx-item-label">Import Complete Discography</span>
                    <span className="ctx-item-shortcut">D</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 2. Open Container */}
          <button
            type="button"
            className="ctx-item"
            onClick={() => {
              onClose();
              onSelectNode?.(node);
            }}
          >
            <ExternalLink size={14} />
            <span className="ctx-item-label">Open Container</span>
            <span className="ctx-item-shortcut">Enter</span>
          </button>

          <div className="ctx-divider" />

          {/* 3. New Container Inside Submenu */}
          <div
            className="ctx-item ctx-submenu-trigger"
            onMouseEnter={() => setSubmenuOpen('newContainer')}
            onMouseLeave={() => setSubmenuOpen(null)}
          >
            <FolderPlus size={14} style={{ color: '#f59e0b' }} />
            <span className="ctx-item-label">New Container Inside</span>
            <span className="ctx-item-shortcut">N</span>
            <ChevronRight size={13} style={{ color: 'var(--mu)', marginLeft: 'auto' }} />

            {submenuOpen === 'newContainer' && (
              <div className="ctx-submenu">
                <button
                  type="button"
                  className="ctx-item"
                  onClick={e => {
                    e.stopPropagation();
                    onClose();
                    onNewContainerInside?.(node, 'Folder');
                  }}
                >
                  <Folder size={14} style={{ color: '#f59e0b' }} />
                  <span className="ctx-item-label">New Folder</span>
                </button>
                <button
                  type="button"
                  className="ctx-item"
                  onClick={e => {
                    e.stopPropagation();
                    onClose();
                    onNewContainerInside?.(node, 'Album');
                  }}
                >
                  <Disc size={14} style={{ color: '#818cf8' }} />
                  <span className="ctx-item-label">New Album</span>
                </button>
                <button
                  type="button"
                  className="ctx-item"
                  onClick={e => {
                    e.stopPropagation();
                    onClose();
                    onNewContainerInside?.(node, 'Artist');
                  }}
                >
                  <User size={14} style={{ color: '#10b981' }} />
                  <span className="ctx-item-label">New Artist</span>
                </button>
                <button
                  type="button"
                  className="ctx-item"
                  onClick={e => {
                    e.stopPropagation();
                    onClose();
                    onNewContainerInside?.(node, 'Playlist');
                  }}
                >
                  <ListMusic size={14} style={{ color: '#38bdf8' }} />
                  <span className="ctx-item-label">New Playlist</span>
                </button>
              </div>
            )}
          </div>

          {/* 4. Import Integrations (Strictly 3rd-party) */}
          <div
            className="ctx-item ctx-submenu-trigger"
            onMouseEnter={() => setSubmenuOpen('import')}
            onMouseLeave={() => setSubmenuOpen(null)}
          >
            <FolderInput size={14} style={{ color: '#06b6d4' }} />
            <span className="ctx-item-label">Import Integrations</span>
            <ChevronRight size={13} style={{ color: 'var(--mu)', marginLeft: 'auto' }} />

            {submenuOpen === 'import' && (
              <div className="ctx-submenu">
                <button
                  type="button"
                  className="ctx-item"
                  onClick={e => {
                    e.stopPropagation();
                    onClose();
                    onOpenTuneImport?.(node);
                  }}
                >
                  <FileText size={14} style={{ color: '#06b6d4' }} />
                  <span className="ctx-item-label">Tune My Music (.csv)</span>
                  <span className="ctx-item-badge">CSV</span>
                </button>
              </div>
            )}
          </div>

          {/* 5. Advanced Tools Submenu */}
          <div
            className="ctx-item ctx-submenu-trigger"
            onMouseEnter={() => setSubmenuOpen('advanced')}
            onMouseLeave={() => setSubmenuOpen(null)}
          >
            <SlidersHorizontal size={14} style={{ color: '#a78bfa' }} />
            <span className="ctx-item-label">Advanced Tools</span>
            <ChevronRight size={13} style={{ color: 'var(--mu)', marginLeft: 'auto' }} />

            {submenuOpen === 'advanced' && (
              <div className="ctx-submenu">
                {(isAlbum || isArtist) && (
                  <button
                    type="button"
                    className="ctx-item"
                    onClick={e => {
                      e.stopPropagation();
                      onClose();
                      onRefreshArtwork?.(node);
                    }}
                  >
                    <ImageIcon size={14} />
                    <span className="ctx-item-label">Refresh Discogs Artwork</span>
                  </button>
                )}

                <button
                  type="button"
                  className="ctx-item"
                  onClick={e => {
                    e.stopPropagation();
                    onClose();
                    onResolveNodeIsrcs?.(node);
                  }}
                >
                  <Sparkles size={14} style={{ color: '#60a5fa' }} />
                  <span className="ctx-item-label">Resolve Missing ISRCs</span>
                  <span className="ctx-item-shortcut">R</span>
                </button>

                <button
                  type="button"
                  className="ctx-item"
                  onClick={e => {
                    e.stopPropagation();
                    handleCopy(node.name, 'Container Name');
                  }}
                >
                  {copiedKey === 'Container Name' ? <Check size={14} style={{ color: '#4ade80' }} /> : <Copy size={14} />}
                  <span className="ctx-item-label">Copy Name</span>
                  <span className="ctx-item-shortcut">⌘C</span>
                </button>
              </div>
            )}
          </div>

          <div className="ctx-divider" />

          {/* 6. Rename / Edit Container */}
          <button
            type="button"
            className="ctx-item"
            onClick={() => {
              onClose();
              onEditNode?.(node);
            }}
          >
            <Pencil size={14} />
            <span className="ctx-item-label">Rename / Edit Container...</span>
            <span className="ctx-item-shortcut">E</span>
          </button>

          {/* 7. Delete Container */}
          <button
            type="button"
            className="ctx-item danger"
            onClick={() => {
              onClose();
              onDeleteNode?.(node);
            }}
          >
            <Trash2 size={14} />
            <span className="ctx-item-label">Delete Container</span>
            <span className="ctx-item-shortcut">⌫</span>
          </button>
        </>
      );
    }

    // =========================================================================
    // 3. Main Table Background / Empty Library Area
    // =========================================================================
    if (target.type === 'table') {
      const activeNode = target.activeNode;
      const isAlbum = activeNode?.type === 'Album';
      return (
        <>
          <div className="ctx-header">
            <div className="ctx-header-icon">
              <Music size={16} />
            </div>
            <div className="ctx-header-meta">
              <div className="ctx-header-title">{activeNode ? activeNode.name : 'Library View'}</div>
              <div className="ctx-header-sub">Quick Actions</div>
            </div>
          </div>

          <div className="ctx-divider" />

          {/* Status Completion Toggle for Active Album Page */}
          {statusEnabled && isAlbum && activeNode && (
            <>
              {(() => {
                const activeArtist = activeNode.tracks?.[0]?.a || '';
                const isCompleted = isAlbumCompleted?.(activeArtist, activeNode.name) || false;
                return (
                  <button
                    type="button"
                    className="ctx-item"
                    onClick={() => {
                      onClose();
                      onToggleAlbumCompleted?.(activeArtist, activeNode.name, !isCompleted);
                    }}
                  >
                    {isCompleted ? (
                      <RotateCcw size={14} style={{ color: '#f59e0b' }} />
                    ) : (
                      <CheckCircle2 size={14} style={{ color: '#22c55e' }} />
                    )}
                    <span className="ctx-item-label" style={{ fontWeight: 500 }}>
                      {isCompleted ? 'Mark Album as Incomplete' : 'Mark Album as Completed'}
                    </span>
                    <span className="ctx-item-shortcut">C</span>
                  </button>
                );
              })()}
              <div className="ctx-divider" />
            </>
          )}

          {/* 1. TOP ITEM: Search Releases (with attached Add Track Manually dropdown selection) */}
          <div
            className="ctx-item ctx-submenu-trigger"
            onMouseEnter={() => setSubmenuOpen('addMusic')}
            onMouseLeave={() => setSubmenuOpen(null)}
            onClick={() => {
              onClose();
              onOpenImport?.();
            }}
          >
            <Sparkles size={14} style={{ color: '#60a5fa' }} />
            <span className="ctx-item-label" style={{ fontWeight: 500 }}>Search Releases</span>
            <span className="ctx-item-shortcut">A</span>
            <ChevronRight size={13} style={{ color: 'var(--mu)', marginLeft: 4 }} />

            {submenuOpen === 'addMusic' && (
              <div className="ctx-submenu">
                <button
                  type="button"
                  className="ctx-item"
                  onClick={e => {
                    e.stopPropagation();
                    onClose();
                    onOpenImport?.();
                  }}
                >
                  <Sparkles size={14} style={{ color: '#60a5fa' }} />
                  <span className="ctx-item-label">Search Releases (Discogs / Deezer)</span>
                  <span className="ctx-item-shortcut">A</span>
                </button>
                <button
                  type="button"
                  className="ctx-item"
                  onClick={e => {
                    e.stopPropagation();
                    onClose();
                    onOpenNewTrack?.();
                  }}
                >
                  <Plus size={14} />
                  <span className="ctx-item-label">Add Track Manually...</span>
                  <span className="ctx-item-shortcut">T</span>
                </button>
              </div>
            )}
          </div>

          {/* 2. New Container Here Submenu */}
          <div
            className="ctx-item ctx-submenu-trigger"
            onMouseEnter={() => setSubmenuOpen('newContainer')}
            onMouseLeave={() => setSubmenuOpen(null)}
          >
            <FolderPlus size={14} style={{ color: '#f59e0b' }} />
            <span className="ctx-item-label">New Container Here</span>
            <span className="ctx-item-shortcut">N</span>
            <ChevronRight size={13} style={{ color: 'var(--mu)', marginLeft: 'auto' }} />

            {submenuOpen === 'newContainer' && (
              <div className="ctx-submenu">
                <button
                  type="button"
                  className="ctx-item"
                  onClick={e => {
                    e.stopPropagation();
                    onClose();
                    if (activeNode) onNewContainerInside?.(activeNode, 'Folder');
                    else onOpenNewContainer?.('Folder');
                  }}
                >
                  <Folder size={14} style={{ color: '#f59e0b' }} />
                  <span className="ctx-item-label">New Folder</span>
                </button>
                <button
                  type="button"
                  className="ctx-item"
                  onClick={e => {
                    e.stopPropagation();
                    onClose();
                    if (activeNode) onNewContainerInside?.(activeNode, 'Album');
                    else onOpenNewContainer?.('Album');
                  }}
                >
                  <Disc size={14} style={{ color: '#818cf8' }} />
                  <span className="ctx-item-label">New Album</span>
                </button>
                <button
                  type="button"
                  className="ctx-item"
                  onClick={e => {
                    e.stopPropagation();
                    onClose();
                    if (activeNode) onNewContainerInside?.(activeNode, 'Artist');
                    else onOpenNewContainer?.('Artist');
                  }}
                >
                  <User size={14} style={{ color: '#10b981' }} />
                  <span className="ctx-item-label">New Artist</span>
                </button>
                <button
                  type="button"
                  className="ctx-item"
                  onClick={e => {
                    e.stopPropagation();
                    onClose();
                    if (activeNode) onNewContainerInside?.(activeNode, 'Playlist');
                    else onOpenNewContainer?.('Playlist');
                  }}
                >
                  <ListMusic size={14} style={{ color: '#38bdf8' }} />
                  <span className="ctx-item-label">New Playlist</span>
                </button>
              </div>
            )}
          </div>

          <div className="ctx-divider" />

          {/* 3. Import Integrations (Strictly 3rd-party) */}
          <div
            className="ctx-item ctx-submenu-trigger"
            onMouseEnter={() => setSubmenuOpen('import')}
            onMouseLeave={() => setSubmenuOpen(null)}
          >
            <FolderInput size={14} style={{ color: '#06b6d4' }} />
            <span className="ctx-item-label">Import Integrations</span>
            <ChevronRight size={13} style={{ color: 'var(--mu)', marginLeft: 'auto' }} />

            {submenuOpen === 'import' && (
              <div className="ctx-submenu">
                <button
                  type="button"
                  className="ctx-item"
                  onClick={e => {
                    e.stopPropagation();
                    onClose();
                    onOpenTuneImport?.(activeNode);
                  }}
                >
                  <FileText size={14} style={{ color: '#06b6d4' }} />
                  <span className="ctx-item-label">Tune My Music (.csv)</span>
                  <span className="ctx-item-badge">CSV</span>
                </button>
              </div>
            )}
          </div>

          {/* 4. Advanced Tools Submenu */}
          <div
            className="ctx-item ctx-submenu-trigger"
            onMouseEnter={() => setSubmenuOpen('advanced')}
            onMouseLeave={() => setSubmenuOpen(null)}
          >
            <SlidersHorizontal size={14} style={{ color: '#a78bfa' }} />
            <span className="ctx-item-label">Advanced Tools</span>
            <ChevronRight size={13} style={{ color: 'var(--mu)', marginLeft: 'auto' }} />

            {submenuOpen === 'advanced' && (
              <div className="ctx-submenu">
                <button
                  type="button"
                  className="ctx-item"
                  onClick={e => {
                    e.stopPropagation();
                    onClose();
                    onOpenCommandPalette?.();
                  }}
                >
                  <Command size={14} />
                  <span className="ctx-item-label">Command Palette</span>
                  <span className="ctx-item-shortcut">⌘K</span>
                </button>
                {activeNode && (
                  <button
                    type="button"
                    className="ctx-item"
                    onClick={e => {
                      e.stopPropagation();
                      onClose();
                      onResolveNodeIsrcs?.(activeNode);
                    }}
                  >
                    <Sparkles size={14} style={{ color: '#60a5fa' }} />
                    <span className="ctx-item-label">Resolve Missing ISRCs</span>
                    <span className="ctx-item-shortcut">R</span>
                  </button>
                )}
                <button
                  type="button"
                  className="ctx-item"
                  onClick={e => {
                    e.stopPropagation();
                    onClose();
                    onRefreshLibrary?.();
                  }}
                >
                  <RefreshCw size={14} />
                  <span className="ctx-item-label">Refresh Library</span>
                </button>
              </div>
            )}
          </div>
        </>
      );
    }

    // =========================================================================
    // 4. Sidebar Root / Tree Background
    // =========================================================================
    if (target.type === 'sidebar') {
      return (
        <>
          <div className="ctx-header">
            <div className="ctx-header-icon">
              <Folder size={16} />
            </div>
            <div className="ctx-header-meta">
              <div className="ctx-header-title">Library Sidebar</div>
              <div className="ctx-header-sub">Root Operations</div>
            </div>
          </div>

          <div className="ctx-divider" />

          {/* 1. TOP ITEM: Search Releases */}
          <div
            className="ctx-item ctx-submenu-trigger"
            onMouseEnter={() => setSubmenuOpen('addMusic')}
            onMouseLeave={() => setSubmenuOpen(null)}
            onClick={() => {
              onClose();
              onOpenImport?.();
            }}
          >
            <Sparkles size={14} style={{ color: '#60a5fa' }} />
            <span className="ctx-item-label" style={{ fontWeight: 500 }}>Search Releases</span>
            <span className="ctx-item-shortcut">A</span>
            <ChevronRight size={13} style={{ color: 'var(--mu)', marginLeft: 4 }} />

            {submenuOpen === 'addMusic' && (
              <div className="ctx-submenu">
                <button
                  type="button"
                  className="ctx-item"
                  onClick={e => {
                    e.stopPropagation();
                    onClose();
                    onOpenImport?.();
                  }}
                >
                  <Sparkles size={14} style={{ color: '#60a5fa' }} />
                  <span className="ctx-item-label">Search Releases (Discogs / Deezer)</span>
                  <span className="ctx-item-shortcut">A</span>
                </button>
                <button
                  type="button"
                  className="ctx-item"
                  onClick={e => {
                    e.stopPropagation();
                    onClose();
                    onOpenNewTrack?.();
                  }}
                >
                  <Plus size={14} />
                  <span className="ctx-item-label">Add Track Manually...</span>
                  <span className="ctx-item-shortcut">T</span>
                </button>
              </div>
            )}
          </div>

          {/* 2. New Root Container Submenu */}
          <div
            className="ctx-item ctx-submenu-trigger"
            onMouseEnter={() => setSubmenuOpen('newContainer')}
            onMouseLeave={() => setSubmenuOpen(null)}
          >
            <FolderPlus size={14} style={{ color: '#f59e0b' }} />
            <span className="ctx-item-label">New Root Container</span>
            <span className="ctx-item-shortcut">N</span>
            <ChevronRight size={13} style={{ color: 'var(--mu)', marginLeft: 'auto' }} />

            {submenuOpen === 'newContainer' && (
              <div className="ctx-submenu">
                <button
                  type="button"
                  className="ctx-item"
                  onClick={e => {
                    e.stopPropagation();
                    onClose();
                    onOpenNewContainer?.('Folder');
                  }}
                >
                  <Folder size={14} style={{ color: '#f59e0b' }} />
                  <span className="ctx-item-label">New Folder</span>
                </button>
                <button
                  type="button"
                  className="ctx-item"
                  onClick={e => {
                    e.stopPropagation();
                    onClose();
                    onOpenNewContainer?.('Album');
                  }}
                >
                  <Disc size={14} style={{ color: '#818cf8' }} />
                  <span className="ctx-item-label">New Album</span>
                </button>
                <button
                  type="button"
                  className="ctx-item"
                  onClick={e => {
                    e.stopPropagation();
                    onClose();
                    onOpenNewContainer?.('Artist');
                  }}
                >
                  <User size={14} style={{ color: '#10b981' }} />
                  <span className="ctx-item-label">New Artist</span>
                </button>
                <button
                  type="button"
                  className="ctx-item"
                  onClick={e => {
                    e.stopPropagation();
                    onClose();
                    onOpenNewContainer?.('Playlist');
                  }}
                >
                  <ListMusic size={14} style={{ color: '#38bdf8' }} />
                  <span className="ctx-item-label">New Playlist</span>
                </button>
              </div>
            )}
          </div>

          {/* 3. Import Integrations */}
          <div
            className="ctx-item ctx-submenu-trigger"
            onMouseEnter={() => setSubmenuOpen('import')}
            onMouseLeave={() => setSubmenuOpen(null)}
          >
            <FolderInput size={14} style={{ color: '#06b6d4' }} />
            <span className="ctx-item-label">Import Integrations</span>
            <ChevronRight size={13} style={{ color: 'var(--mu)', marginLeft: 'auto' }} />

            {submenuOpen === 'import' && (
              <div className="ctx-submenu">
                <button
                  type="button"
                  className="ctx-item"
                  onClick={e => {
                    e.stopPropagation();
                    onClose();
                    onOpenTuneImport?.(null);
                  }}
                >
                  <FileText size={14} style={{ color: '#06b6d4' }} />
                  <span className="ctx-item-label">Tune My Music (.csv)</span>
                  <span className="ctx-item-badge">CSV</span>
                </button>
              </div>
            )}
          </div>

          <div className="ctx-divider" />

          {/* Command Palette */}
          <button
            type="button"
            className="ctx-item"
            onClick={() => {
              onClose();
              onOpenCommandPalette?.();
            }}
          >
            <Command size={14} />
            <span className="ctx-item-label">Command Palette</span>
            <span className="ctx-item-shortcut">⌘K</span>
          </button>

          {/* Refresh Library */}
          <button
            type="button"
            className="ctx-item"
            onClick={() => {
              onClose();
              onRefreshLibrary?.();
            }}
          >
            <RefreshCw size={14} />
            <span className="ctx-item-label">Refresh Library</span>
          </button>
        </>
      );
    }

    return null;
  };

  return (
    <div
      ref={menuRef}
      className="ctx-menu"
      style={{
        left: position.x,
        top: position.y,
      }}
      role="menu"
    >
      {renderContent()}
    </div>
  );
};
