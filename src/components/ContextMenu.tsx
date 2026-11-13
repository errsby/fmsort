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
  Search,
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
} from 'lucide-react';

export type ContextTarget =
  | { type: 'track'; track: Track; isMulti?: boolean; count?: number }
  | { type: 'node'; node: LibraryNode }
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
  onAddMusicToNode?: (node: LibraryNode) => void;
  onAddTrackToNode?: (node: LibraryNode) => void;
  onNewContainerInside?: (node: LibraryNode, type: string) => void;
  onEditNode?: (node: LibraryNode) => void;
  onDeleteNode?: (node: LibraryNode) => void;
  onRefreshArtwork?: (node: LibraryNode) => void;
  onResolveNodeIsrcs?: (node: LibraryNode) => void;
  // Global actions
  onOpenImport?: () => void;
  onOpenTuneImport?: (node?: LibraryNode | null) => void;
  onOpenNewTrack?: () => void;
  onOpenNewContainer?: () => void;
  onOpenCommandPalette?: () => void;
  onRefreshLibrary?: () => void;
  onOpenBackup?: () => void;
  onShowToast?: (message: string) => void;
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
  onAddMusicToNode,
  onAddTrackToNode,
  onNewContainerInside,
  onEditNode,
  onDeleteNode,
  onRefreshArtwork,
  onResolveNodeIsrcs,
  onOpenImport,
  onOpenTuneImport,
  onOpenNewTrack,
  onOpenNewContainer,
  onOpenCommandPalette,
  onRefreshLibrary,
  onOpenBackup,
  onShowToast,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [submenuOpen, setSubmenuOpen] = useState<'import' | null>(null);
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
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedKey(label);
    if (onShowToast) onShowToast(`Copied ${label} to clipboard`);
    setTimeout(() => {
      setCopiedKey(null);
      onClose();
    }, 450);
  };

  const renderContent = () => {
    const target = state.target!;

    // 1. Single Track or Multi-Track Selection
    if (target.type === 'track') {
      const { track, isMulti, count } = target;

      if (isMulti && count && count > 1) {
        return (
          <>
            {/* Header */}
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

            <button
              type="button"
              className="ctx-item"
              onClick={() => {
                onClose();
                onBatchResolveIsrc?.([]);
              }}
            >
              <Sparkles size={14} style={{ color: '#60a5fa' }} />
              <span className="ctx-item-label">Resolve Missing ISRCs</span>
              <span className="ctx-item-shortcut">R</span>
            </button>

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
          {/* Header Preview */}
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

          {(!track.isrc || track.isrc === '—') && (
            <button
              type="button"
              className="ctx-item"
              onClick={() => {
                onClose();
                onResolveIsrc?.(track);
              }}
            >
              <Sparkles size={14} style={{ color: '#60a5fa' }} />
              <span className="ctx-item-label">Find Verified ISRC</span>
              <span className="ctx-item-badge">Auto</span>
            </button>
          )}

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

          {/* Copy Actions */}
          <button
            type="button"
            className="ctx-item"
            onClick={() => handleCopy(`${track.a} - ${track.t}`, 'Track Name')}
          >
            {copiedKey === 'Track Name' ? <Check size={14} style={{ color: '#4ade80' }} /> : <Copy size={14} />}
            <span className="ctx-item-label">Copy "Artist - Title"</span>
          </button>

          {track.isrc && track.isrc !== '—' && (
            <button
              type="button"
              className="ctx-item"
              onClick={() => handleCopy(track.isrc, 'ISRC')}
            >
              {copiedKey === 'ISRC' ? <Check size={14} style={{ color: '#4ade80' }} /> : <Copy size={14} />}
              <span className="ctx-item-label">Copy ISRC ({track.isrc})</span>
            </button>
          )}

          <button
            type="button"
            className="ctx-item"
            onClick={() => handleCopy(JSON.stringify(track, null, 2), 'JSON')}
          >
            {copiedKey === 'JSON' ? <Check size={14} style={{ color: '#4ade80' }} /> : <Copy size={14} />}
            <span className="ctx-item-label">Copy as JSON</span>
          </button>

          <div className="ctx-divider" />

          {/* External Lookups */}
          <a
            className="ctx-item"
            href={`https://www.discogs.com/search/?q=${encodeURIComponent(`${track.a} ${track.t}`)}&type=release`}
            target="_blank"
            rel="noreferrer"
            onClick={onClose}
          >
            <ExternalLink size={14} />
            <span className="ctx-item-label">Search on Discogs</span>
          </a>

          <a
            className="ctx-item"
            href={`https://www.deezer.com/search/${encodeURIComponent(`${track.a} ${track.t}`)}`}
            target="_blank"
            rel="noreferrer"
            onClick={onClose}
          >
            <ExternalLink size={14} />
            <span className="ctx-item-label">Search on Deezer</span>
          </a>

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

    // 2. Node (Folder, Album, Artist, Playlist)
    if (target.type === 'node') {
      const { node } = target;
      const isFolder = node.type === 'Folder';
      const isAlbum = node.type === 'Album';
      const isArtist = node.type === 'Artist';

      return (
        <>
          {/* Header Preview */}
          <div className="ctx-header">
            <CoverArt
              src={node.cover_url || node.tracks?.[0]?.cover_url}
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

          {/* Import Subdropdown */}
          <div
            className="ctx-item ctx-submenu-trigger"
            onMouseEnter={() => setSubmenuOpen('import')}
            onMouseLeave={() => setSubmenuOpen(null)}
          >
            <FolderInput size={14} style={{ color: '#818cf8' }} />
            <span className="ctx-item-label">Import</span>
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
                  <span className="ctx-item-label">Tune My Music (.txt)</span>
                  <span className="ctx-item-badge">TXT</span>
                </button>

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
                </button>

                <button
                  type="button"
                  className="ctx-item"
                  onClick={e => {
                    e.stopPropagation();
                    onClose();
                    onOpenBackup?.();
                  }}
                >
                  <Copy size={14} />
                  <span className="ctx-item-label">Backup &amp; Restore Archive</span>
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            className="ctx-item"
            onClick={() => {
              onClose();
              onAddTrackToNode?.(node);
            }}
          >
            <Plus size={14} />
            <span className="ctx-item-label">Add Track Manually...</span>
            <span className="ctx-item-shortcut">A</span>
          </button>

          <div className="ctx-divider" />

          {/* Sub-container creation */}
          <button
            type="button"
            className="ctx-item"
            onClick={() => {
              onClose();
              onNewContainerInside?.(node, 'Folder');
            }}
          >
            <Folder size={14} />
            <span className="ctx-item-label">New Subfolder Here</span>
          </button>

          <button
            type="button"
            className="ctx-item"
            onClick={() => {
              onClose();
              onNewContainerInside?.(node, 'Album');
            }}
          >
            <Disc size={14} />
            <span className="ctx-item-label">New Album Here</span>
          </button>

          <div className="ctx-divider" />

          {/* Node Operations */}
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

          {(isAlbum || isArtist) && (
            <>
              <button
                type="button"
                className="ctx-item"
                onClick={() => {
                  onClose();
                  onRefreshArtwork?.(node);
                }}
              >
                <ImageIcon size={14} />
                <span className="ctx-item-label">Refresh Discogs Artwork</span>
              </button>

              <button
                type="button"
                className="ctx-item"
                onClick={() => {
                  onClose();
                  onResolveNodeIsrcs?.(node);
                }}
              >
                <Sparkles size={14} style={{ color: '#60a5fa' }} />
                <span className="ctx-item-label">Resolve All ISRCs</span>
                <span className="ctx-item-shortcut">R</span>
              </button>
            </>
          )}

          <div className="ctx-divider" />

          {/* Danger */}
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

    // 3. Main Table Background / Empty Library Area
    if (target.type === 'table') {
      const activeNode = target.activeNode;
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

          {/* Import Subdropdown */}
          <div
            className="ctx-item ctx-submenu-trigger"
            onMouseEnter={() => setSubmenuOpen('import')}
            onMouseLeave={() => setSubmenuOpen(null)}
          >
            <FolderInput size={14} style={{ color: '#818cf8' }} />
            <span className="ctx-item-label">Import</span>
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
                  <span className="ctx-item-label">Tune My Music (.txt)</span>
                  <span className="ctx-item-badge">TXT</span>
                </button>

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
                </button>

                <button
                  type="button"
                  className="ctx-item"
                  onClick={e => {
                    e.stopPropagation();
                    onClose();
                    onOpenBackup?.();
                  }}
                >
                  <Copy size={14} />
                  <span className="ctx-item-label">Backup &amp; Restore Archive</span>
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            className="ctx-item"
            onClick={() => {
              onClose();
              onOpenNewTrack?.();
            }}
          >
            <Plus size={14} />
            <span className="ctx-item-label">Add Track Manually</span>
          </button>

          <button
            type="button"
            className="ctx-item"
            onClick={() => {
              onClose();
              onOpenNewContainer?.();
            }}
          >
            <Folder size={14} />
            <span className="ctx-item-label">New Folder / Container</span>
          </button>

          <div className="ctx-divider" />

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

          <button
            type="button"
            className="ctx-item"
            onClick={() => {
              onClose();
              onOpenBackup?.();
            }}
          >
            <Copy size={14} />
            <span className="ctx-item-label">Backup &amp; Restore...</span>
          </button>
        </>
      );
    }

    // 4. Sidebar Background
    return (
      <>
        <div className="ctx-header">
          <div className="ctx-header-icon">
            <Folder size={16} />
          </div>
          <div className="ctx-header-meta">
            <div className="ctx-header-title">Library Sidebar</div>
            <div className="ctx-header-sub">Organization</div>
          </div>
        </div>

        <div className="ctx-divider" />

        <button
          type="button"
          className="ctx-item"
          onClick={() => {
            onClose();
            onOpenNewContainer?.();
          }}
        >
          <Folder size={14} />
          <span className="ctx-item-label">New Root Folder</span>
        </button>

        {/* Import Subdropdown */}
        <div
          className="ctx-item ctx-submenu-trigger"
          onMouseEnter={() => setSubmenuOpen('import')}
          onMouseLeave={() => setSubmenuOpen(null)}
        >
          <FolderInput size={14} style={{ color: '#818cf8' }} />
          <span className="ctx-item-label">Import</span>
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
                <span className="ctx-item-label">Tune My Music (.txt)</span>
                <span className="ctx-item-badge">TXT</span>
              </button>

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
              </button>

              <button
                type="button"
                className="ctx-item"
                onClick={e => {
                  e.stopPropagation();
                  onClose();
                  onOpenBackup?.();
                }}
              >
                <Copy size={14} />
                <span className="ctx-item-label">Backup &amp; Restore Archive</span>
              </button>
            </div>
          )}
        </div>

        <div className="ctx-divider" />

        <button
          type="button"
          className="ctx-item"
          onClick={() => {
            onClose();
            onRefreshLibrary?.();
          }}
        >
          <RefreshCw size={14} />
          <span className="ctx-item-label">Refresh Library Tree</span>
        </button>

        <button
          type="button"
          className="ctx-item"
          onClick={() => {
            onClose();
            onOpenBackup?.();
          }}
        >
          <Copy size={14} />
          <span className="ctx-item-label">Backup &amp; Restore...</span>
        </button>
      </>
    );
  };

  return (
    <div
      ref={menuRef}
      className="ctx-menu"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
      role="menu"
      aria-label="Context Menu"
    >
      {renderContent()}
    </div>
  );
};