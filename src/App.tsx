import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { LibraryNode, Track, ColumnDef, ColumnKey } from './types';
import { fetchTree, deleteTracksBatch } from './api';
import {
  fmtDuration,
  fmtTotalRuntime,
  flattenTracks,
  findNodeById,
  findNodePath,
} from './utils';

import { HybridSearchModal } from './components/HybridSearchModal';
import { CommandPaletteModal } from './components/CommandPaletteModal';
import { TrackEditDrawer } from './components/TrackEditDrawer';
import { NewContainerModal } from './components/NewContainerModal';
import { NewTrackModal } from './components/NewTrackModal';
import { MoveTracksModal } from './components/MoveTracksModal';
import { NodeEditModal } from './components/NodeEditModal';
import { BackupModal } from './components/BackupModal';
import { SocialWidgets } from './components/SocialWidgets';
import {
  Search,
  FolderPlus,
  Plus,
  SlidersHorizontal,
  Layers,
  Settings,
  Sparkles,
  Disc,
  MoreHorizontal,
} from 'lucide-react';

const COLUMNS: ColumnDef[] = [
  { key: 'title', label: 'Title' },
  { key: 'artist', label: 'Artist' },
  { key: 'album', label: 'Album' },
  { key: 'year', label: 'Year' },
  { key: 'format', label: 'Format' },
  { key: 'cat', label: 'Catalog no.', isMono: true },
  { key: 'bc', label: 'Barcode', isMono: true, isOptional: true },
  { key: 'mbid', label: 'MBID', isMono: true },
  { key: 'isrc', label: 'ISRC', isMono: true },
  { key: 'len', label: 'Length' },
  { key: 'bpm', label: 'BPM', isOptional: true },
  { key: 'key', label: 'Key', isOptional: true },
];

const DEFAULT_VISIBILITY: Record<ColumnKey, boolean> = {
  title: true,
  artist: true,
  album: true,
  year: true,
  format: true,
  cat: true,
  mbid: true,
  isrc: true,
  len: true,
  bc: false,
  bpm: false,
  key: false,
};

export const App: React.FC = () => {
  const [tree, setTree] = useState<LibraryNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeNodeId, setActiveNodeId] = useState<string>('');
  const [openNodes, setOpenNodes] = useState<Record<string, boolean>>({
    f1: true,
    brain: true,
    neu: true,
    p1: true,
    g1: true,
    p2: true,
  });
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<number>>(new Set());
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>(() => {
    try {
      const saved = localStorage.getItem('fmsort_cols');
      return saved ? JSON.parse(saved) : DEFAULT_VISIBILITY;
    } catch {
      return DEFAULT_VISIBILITY;
    }
  });
  const [sortConfig, setSortConfig] = useState<{ key: ColumnKey; direction: 'asc' | 'desc' } | null>(null);
  const [filterText, setFilterText] = useState('');
  const [activeTrack, setActiveTrack] = useState<Track | null>(null);

  // Modals state
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [newContainerOpen, setNewContainerOpen] = useState(false);
  const [newTrackOpen, setNewTrackOpen] = useState(false);
  const [moveTracksOpen, setMoveTracksOpen] = useState(false);
  const [nodeEditOpen, setNodeEditOpen] = useState(false);
  const [nodeToEdit, setNodeToEdit] = useState<LibraryNode | null>(null);
  const [backupOpen, setBackupOpen] = useState(false);
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const [addMusicMenuOpen, setAddMusicMenuOpen] = useState(false);
  const [sidebarOpenMobile, setSidebarOpenMobile] = useState(false);

  const addMusicRef = useRef<HTMLDivElement>(null);
  const columnMenuRef = useRef<HTMLTableHeaderCellElement>(null);

  const loadTree = async (preferredNodeId?: string) => {
    try {
      const data = await fetchTree();
      setTree(data);
      if (preferredNodeId && findNodeById(data, preferredNodeId)) {
        setActiveNodeId(preferredNodeId);
      } else if (!activeNodeId && data.length > 0) {
        setActiveNodeId(data[0].id);
      }
    } catch (err) {
      console.error('Failed to load library:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTree();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('fmsort_cols', JSON.stringify(visibleColumns));
    } catch (e) {
      console.warn('Could not save column preferences', e);
    }
  }, [visibleColumns]);

  // Click outside to close menus
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (addMusicRef.current && !addMusicRef.current.contains(e.target as Node)) {
        setAddMusicMenuOpen(false);
      }
      if (columnMenuRef.current && !columnMenuRef.current.contains(e.target as Node)) {
        setColumnMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcut for Command Palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      } else if (e.key === 'Escape') {
        setImportModalOpen(false);
        setCommandPaletteOpen(false);
        setNewContainerOpen(false);
        setNewTrackOpen(false);
        setMoveTracksOpen(false);
        setNodeEditOpen(false);
        setNodeToEdit(null);
        setBackupOpen(false);
        setColumnMenuOpen(false);
        setAddMusicMenuOpen(false);
        setActiveTrack(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const activeNode = useMemo(() => {
    if (!activeNodeId) return tree[0] || null;
    return findNodeById(tree, activeNodeId) || tree[0] || null;
  }, [tree, activeNodeId]);

  const activePath = useMemo(() => {
    if (!activeNode) return [];
    return findNodePath(tree, activeNode.id) || [];
  }, [tree, activeNode]);

  const activeFlatTracks = useMemo(() => {
    if (!activeNode) return [];
    return flattenTracks(activeNode);
  }, [activeNode]);

  const toggleNodeExpansion = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenNodes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleSectionCollapse = (id: string) => {
    setCollapsedSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const selectNode = (node: LibraryNode) => {
    setActiveNodeId(node.id);
    const path = findNodePath(tree, node.id) || [];
    setOpenNodes(prev => {
      const next = { ...prev };
      for (const p of path) next[p.id] = true;
      return next;
    });
    setSelectedTrackIds(new Set());
    setSidebarOpenMobile(false);
  };

  const toggleTrackSelect = (id: number) => {
    setSelectedTrackIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllCurrent = () => {
    if (selectedTrackIds.size === activeFlatTracks.length && activeFlatTracks.length > 0) {
      setSelectedTrackIds(new Set());
    } else {
      setSelectedTrackIds(new Set(activeFlatTracks.map(t => t.id)));
    }
  };

  const handleSort = (key: ColumnKey) => {
    setSortConfig(prev => {
      if (!prev || prev.key !== key) {
        return { key, direction: 'asc' };
      }
      if (prev.direction === 'asc') {
        return { key, direction: 'desc' };
      }
      return null;
    });
  };

  const handleBatchDelete = async () => {
    if (selectedTrackIds.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedTrackIds.size} selected tracks?`)) return;
    try {
      await deleteTracksBatch(Array.from(selectedTrackIds));
      setSelectedTrackIds(new Set());
      await loadTree(activeNodeId);
    } catch (err) {
      alert('Failed to delete tracks');
    }
  };

  // Helper to sort tracks
  const sortTracks = (tracks: Track[]): Track[] => {
    if (!sortConfig) return tracks;
    const { key, direction } = sortConfig;
    const mult = direction === 'asc' ? 1 : -1;

    return [...tracks].sort((a, b) => {
      let va: any = '';
      let vb: any = '';

      switch (key) {
        case 'title':
          va = a.t.toLowerCase();
          vb = b.t.toLowerCase();
          break;
        case 'artist':
          va = a.a.toLowerCase();
          vb = b.a.toLowerCase();
          break;
        case 'album':
          va = a.al.toLowerCase();
          vb = b.al.toLowerCase();
          break;
        case 'year':
          va = a.y || 0;
          vb = b.y || 0;
          break;
        case 'format':
          va = a.f.toLowerCase();
          vb = b.f.toLowerCase();
          break;
        case 'cat':
          va = a.c.toLowerCase();
          vb = b.c.toLowerCase();
          break;
        case 'bc':
          va = a.bc.toLowerCase();
          vb = b.bc.toLowerCase();
          break;
        case 'mbid':
          va = a.mb.toLowerCase();
          vb = b.mb.toLowerCase();
          break;
        case 'isrc':
          va = a.isrc.toLowerCase();
          vb = b.isrc.toLowerCase();
          break;
        case 'len':
          va = a.len || 0;
          vb = b.len || 0;
          break;
        case 'bpm':
          va = a.bpm || 0;
          vb = b.bpm || 0;
          break;
        case 'key':
          va = a.key.toLowerCase();
          vb = b.key.toLowerCase();
          break;
      }

      if (va > vb) return 1 * mult;
      if (va < vb) return -1 * mult;
      return 0;
    });
  };

  // Render tree node recursively
  const renderTreeNode = (n: LibraryNode, depth: number) => {
    const hasChildren = n.children && n.children.length > 0;
    const isOpen = openNodes[n.id] ?? false;
    const isActive = activeNode?.id === n.id;

    return (
      <React.Fragment key={n.id}>
        <div
          className={`n ${isActive ? 'on' : ''}`}
          style={{ paddingLeft: `${6 + depth * 14}px` }}
          onClick={() => selectNode(n)}
          tabIndex={0}
          role="treeitem"
        >
          <span
            className={`ar ${isOpen ? 'o' : ''}`}
            onClick={e => toggleNodeExpansion(n.id, e)}
          >
            {hasChildren ? '›' : ''}
          </span>
          <span className="ty">{n.type}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{n.name}</span>
          <button
            type="button"
            className="node-more-btn"
            title={`Manage ${n.name}`}
            onClick={(e) => {
              e.stopPropagation();
              setNodeToEdit(n);
              setNodeEditOpen(true);
            }}
          >
            <MoreHorizontal size={13} />
          </button>
        </div>
        {isOpen && hasChildren && n.children.map(c => renderTreeNode(c, depth + 1))}
      </React.Fragment>
    );
  };

  // Render table rows recursively for current node and its children
  const renderSections = (n: LibraryNode, depth: number): React.ReactNode[] => {
    const activeCols = COLUMNS.filter(c => visibleColumns[c.key]);
    const colSpan = activeCols.length + 2;
    const nodesOut: React.ReactNode[] = [];

    // Filter tracks if filterText is active
    let nodeTracks = n.tracks || [];
    if (filterText.trim()) {
      const ft = filterText.toLowerCase();
      nodeTracks = nodeTracks.filter(
        t =>
          t.t.toLowerCase().includes(ft) ||
          t.a.toLowerCase().includes(ft) ||
          t.al.toLowerCase().includes(ft) ||
          t.c.toLowerCase().includes(ft) ||
          t.bc.toLowerCase().includes(ft) ||
          t.mb.toLowerCase().includes(ft)
      );
    }

    const sorted = sortTracks(nodeTracks);

    // Track rows
    sorted.forEach(t => {
      const isSelected = selectedTrackIds.has(t.id);
      nodesOut.push(
        <tr key={`t-${t.id}`} className={`t ${isSelected ? 's' : ''}`}>
          <td style={{ paddingLeft: `${10 + depth * 16}px` }}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleTrackSelect(t.id)}
              aria-label={`Select ${t.t}`}
            />
          </td>
          {activeCols.map(col => {
            if (col.key === 'title') {
              return (
                <td key={col.key}>
                  <span
                    className="ttl"
                    tabIndex={0}
                    onClick={() => setActiveTrack(t)}
                  >
                    {t.t}
                  </span>
                </td>
              );
            }
            if (col.key === 'artist') return <td key={col.key}>{t.a}</td>;
            if (col.key === 'album') return <td key={col.key}>{t.al}</td>;
            if (col.key === 'year') return <td key={col.key}>{t.y || '—'}</td>;
            if (col.key === 'format') return <td key={col.key}>{t.f || '—'}</td>;
            if (col.key === 'cat') return <td key={col.key} className="mono">{t.c || '—'}</td>;
            if (col.key === 'bc') return <td key={col.key} className="mono">{t.bc || '—'}</td>;
            if (col.key === 'mbid') {
              const displayMbid = t.mb && t.mb.length > 8 ? `${t.mb.slice(0, 8)}…` : t.mb || '—';
              return (
                <td key={col.key} className="mono" title={t.mb}>
                  {displayMbid}
                </td>
              );
            }
            if (col.key === 'isrc') return <td key={col.key} className="mono">{t.isrc || '—'}</td>;
            if (col.key === 'len') return <td key={col.key} className="mono">{fmtDuration(t.len)}</td>;
            if (col.key === 'bpm') return <td key={col.key} className="mono">{t.bpm || '—'}</td>;
            if (col.key === 'key') return <td key={col.key} className="mono">{t.key || '—'}</td>;
            return <td key={col.key}>—</td>;
          })}
          <td style={{ width: 36 }}></td>
        </tr>
      );
    });

    // Sub-containers as section header rows
    if (n.children && n.children.length > 0) {
      n.children.forEach(child => {
        const childTracks = flattenTracks(child);
        const isCollapsed = collapsedSections[child.id] ?? false;

        nodesOut.push(
          <tr
            key={`h-${child.id}`}
            className="h"
            onClick={() => toggleSectionCollapse(child.id)}
          >
            <td colSpan={colSpan} style={{ paddingLeft: `${10 + depth * 16}px` }}>
              <span className={`ar ${isCollapsed ? '' : 'o'}`}>›</span>{' '}
              <span className="ty">{child.type}</span> {child.name}
              <span className="m">
                {childTracks.length} tracks · {fmtTotalRuntime(childTracks)}
              </span>
            </td>
          </tr>
        );

        if (!isCollapsed) {
          nodesOut.push(...renderSections(child, depth + 1));
        }
      });
    }

    return nodesOut;
  };

  return (
    <>
      {/* Header */}
      <header>
        {/* Left: Mobile Toggle & Breadcrumbs at the very left */}
        <div className="header-left">
          <button
            id="mb"
            aria-label="Toggle library"
            onClick={() => setSidebarOpenMobile(!sidebarOpenMobile)}
          >
            Library
          </button>

          <nav className="crumbs" aria-label="Breadcrumb">
            <span
              className="crumb-link"
              onClick={() => tree[0] && selectNode(tree[0])}
            >
              Library
            </span>
            {activePath.map((item, idx) => (
              <React.Fragment key={item.id}>
                <span>/</span>
                {idx === activePath.length - 1 ? (
                  <b>{item.name}</b>
                ) : (
                  <span className="crumb-link" onClick={() => selectNode(item)}>
                    {item.name}
                  </span>
                )}
              </React.Fragment>
            ))}
          </nav>
        </div>

        {/* Center: Search Command Bar in the middle */}
        <div className="header-center">
          <button className="cmd" onClick={() => setCommandPaletteOpen(true)}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Search size={14} style={{ color: 'var(--mu)' }} />
              <span>Search or jump to…</span>
            </span>
            <span className="mono">⌘K</span>
          </button>
        </div>

        {/* Right: Social & Profile Actions */}
        <SocialWidgets tree={tree} activeNode={activeNode} />
      </header>

      {/* Main Workspace */}
      <main>
        {/* Sidebar */}
        <aside id="side" className={sidebarOpenMobile ? 'on' : ''}>
          <div className="tree-list">
            {loading ? (
              <div style={{ color: 'var(--mu)', padding: 12 }}>Loading library...</div>
            ) : tree.length === 0 ? (
              <div className="empty-sidebar-box">
                <FolderPlus size={22} style={{ color: 'var(--mu)', marginBottom: 8 }} />
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, color: '#f4f4f5' }}>Blank Library</div>
                <p style={{ fontSize: 11, color: 'var(--mu)', margin: '0 0 12px', lineHeight: 1.4 }}>
                  Create your first container or import music to organize your library.
                </p>
                <button
                  className="p"
                  style={{ fontSize: 11, width: '100%', justifyContent: 'center' }}
                  onClick={() => setNewContainerOpen(true)}
                >
                  <Plus size={13} />
                  <span>New Container</span>
                </button>
              </div>
            ) : (
              tree.map(n => renderTreeNode(n, 0))
            )}
          </div>

          <div className="tree-actions">
            <button
              style={{ flex: 1, fontSize: 12 }}
              onClick={() => setNewContainerOpen(true)}
            >
              <FolderPlus size={13} />
              <span>Container</span>
            </button>
            <button
              style={{ fontSize: 12 }}
              title="Backup / Restore"
              onClick={() => setBackupOpen(true)}
            >
              <Layers size={13} />
              <span>Backup</span>
            </button>
          </div>
        </aside>

        {/* Section / Table */}
        <section>
          {/* Toolbar */}
          <div className="tb">
            <h1>
              <span>{activeNode ? activeNode.name : 'Library'}</span>
              {activeNode && <span className="ty">{activeNode.type}</span>}
            </h1>

            <span className="sel">
              {selectedTrackIds.size > 0 && `${selectedTrackIds.size} selected · `}
              {activeFlatTracks.length} tracks {activeFlatTracks.length > 0 && `· ${fmtTotalRuntime(activeFlatTracks)}`}
            </span>

            <input
              type="search"
              placeholder="Filter tracks..."
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
              style={{ padding: '4px 9px', fontSize: 12, width: 140 }}
            />

            {/* Merged unified Add Music Button */}
            <div style={{ position: 'relative' }} ref={addMusicRef}>
              <button
                className="p"
                onClick={() => setAddMusicMenuOpen(!addMusicMenuOpen)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Plus size={14} />
                <span>Add Music</span>
              </button>

              {addMusicMenuOpen && (
                <div className="add-music-dropdown">
                  <button
                    type="button"
                    className="add-music-option"
                    onClick={() => {
                      setAddMusicMenuOpen(false);
                      setImportModalOpen(true);
                    }}
                  >
                    <div style={{ padding: 6, borderRadius: 6, background: '#1e3a5f', color: '#60a5fa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Sparkles size={16} />
                    </div>
                    <div>
                      <div className="add-music-title">Search &amp; Import Releases</div>
                      <div className="add-music-desc">Search artists &amp; albums from Discogs 17.5M+ and Deezer</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    className="add-music-option"
                    onClick={() => {
                      setAddMusicMenuOpen(false);
                      setNewTrackOpen(true);
                    }}
                  >
                    <div style={{ padding: 6, borderRadius: 6, background: '#143825', color: '#34d399', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Plus size={16} />
                    </div>
                    <div>
                      <div className="add-music-title">Add Track Manually</div>
                      <div className="add-music-desc">Enter custom track metadata, duration &amp; catalog tags</div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Batch Actions Toolbar */}
          {selectedTrackIds.size > 0 && (
            <div className="batch-bar">
              <span>
                <b>{selectedTrackIds.size}</b> track{selectedTrackIds.size > 1 ? 's' : ''} selected
              </span>
              <button
                className="p"
                style={{ fontSize: 11, padding: '2px 8px' }}
                onClick={() => setMoveTracksOpen(true)}
              >
                Move Selected…
              </button>
              <button
                className="danger"
                style={{ fontSize: 11, padding: '2px 8px' }}
                onClick={handleBatchDelete}
              >
                Delete Selected
              </button>
              <button
                style={{ fontSize: 11, padding: '2px 8px' }}
                onClick={() => setSelectedTrackIds(new Set())}
              >
                Deselect All
              </button>
            </div>
          )}

          {/* Table */}
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 30 }}>
                    <input
                      type="checkbox"
                      checked={
                        selectedTrackIds.size > 0 &&
                        selectedTrackIds.size === activeFlatTracks.length
                      }
                      onChange={toggleSelectAllCurrent}
                      aria-label="Select all tracks"
                    />
                  </th>
                  {COLUMNS.filter(c => visibleColumns[c.key]).map(col => {
                    const isSorted = sortConfig && sortConfig.key === col.key;
                    return (
                      <th
                        key={col.key}
                        onClick={() => handleSort(col.key)}
                      >
                        {col.label}
                        {isSorted && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                      </th>
                    );
                  })}
                  {/* Columns dropdown button in the actual column label row */}
                  <th
                    style={{ width: 36, textAlign: 'center', position: 'relative', cursor: 'default' }}
                    ref={columnMenuRef}
                  >
                    <button
                      type="button"
                      className="btn-icon"
                      style={{ width: 22, height: 22, border: 'none', color: columnMenuOpen ? 'var(--fg)' : 'var(--mu)', margin: '0 auto' }}
                      title="Customize Columns"
                      onClick={(e) => {
                        e.stopPropagation();
                        setColumnMenuOpen(!columnMenuOpen);
                      }}
                    >
                      <SlidersHorizontal size={12} />
                    </button>

                    {columnMenuOpen && (
                      <div className="menu on" style={{ right: 0, top: '100%', minWidth: 160 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--mu)', padding: '2px 4px 6px', borderBottom: '1px solid var(--bd)', marginBottom: 4 }}>
                          Toggle Columns
                        </div>
                        {COLUMNS.filter(c => c.key !== 'title').map(col => (
                          <label key={col.key}>
                            <input
                              type="checkbox"
                              checked={visibleColumns[col.key]}
                              onChange={e =>
                                setVisibleColumns(prev => ({
                                  ...prev,
                                  [col.key]: e.target.checked,
                                }))
                              }
                            />
                            <span>{col.label} {col.isOptional ? '(optional)' : ''}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </th>
                </tr>
              </thead>
              <tbody>
                {activeNode ? (
                  (() => {
                    const rows = renderSections(activeNode, 0);
                    if (rows.length === 0) {
                      return (
                        <tr>
                          <td
                            colSpan={COLUMNS.filter(c => visibleColumns[c.key]).length + 1}
                            style={{ padding: '60px 20px', color: 'var(--mu)', textAlign: 'center' }}
                          >
                            <div style={{ maxWidth: 400, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              <Disc size={36} style={{ color: '#52525b', marginBottom: 12 }} />
                              <div style={{ fontWeight: 600, fontSize: 14, color: '#f4f4f5', marginBottom: 4 }}>
                                [{activeNode.type}] {activeNode.name} is empty
                              </div>
                              <p style={{ fontSize: 12, margin: '0 0 16px', lineHeight: 1.4 }}>
                                Populate this container by searching Discogs &amp; Deezer or adding manual tracks.
                              </p>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button className="p" onClick={() => setImportModalOpen(true)}>
                                  <Sparkles size={13} />
                                  <span>Import Releases</span>
                                </button>
                                <button onClick={() => setNewTrackOpen(true)}>
                                  <Plus size={13} />
                                  <span>Add Track</span>
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    }
                    return rows;
                  })()
                ) : (
                  <tr>
                    <td
                      colSpan={COLUMNS.filter(c => visibleColumns[c.key]).length + 1}
                      style={{ padding: 0, borderBottom: 'none' }}
                    >
                      <div className="empty-library-hero">
                        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#1c1c24', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, border: '1px solid #272732' }}>
                          <Disc size={28} style={{ color: '#60a5fa' }} />
                        </div>
                        <h2 style={{ fontSize: 20, margin: '0 0 8px', fontWeight: 600 }}>Your Music Collection Starts Here</h2>
                        <p style={{ color: 'var(--mu)', fontSize: 13, maxWidth: 440, margin: '0 auto 20px', lineHeight: 1.5 }}>
                          Create custom folders, labels, and playlists, or search across Discogs&rsquo; 17.5M+ physical releases and Deezer streaming.
                        </p>
                        <div className="hero-actions">
                          <button className="p" style={{ padding: '8px 16px', fontSize: 13 }} onClick={() => setImportModalOpen(true)}>
                            <Sparkles size={15} />
                            <span>Import Releases &amp; Artists</span>
                          </button>
                          <button style={{ padding: '8px 16px', fontSize: 13 }} onClick={() => setNewContainerOpen(true)}>
                            <FolderPlus size={15} />
                            <span>Create Container</span>
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* Metadata Edit Drawer */}
      <TrackEditDrawer
        track={activeTrack}
        isOpen={activeTrack !== null}
        onClose={() => setActiveTrack(null)}
        onTrackUpdated={() => loadTree(activeNodeId)}
        onTrackDeleted={() => {
          setActiveTrack(null);
          loadTree(activeNodeId);
        }}
      />

      {/* Hybrid Search & Import Modal (Discogs + Deezer + MusicBrainz) */}
      <HybridSearchModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        currentNode={activeNode}
        allTreeNodes={tree}
        onImportSuccess={newDestId => {
          loadTree(newDestId);
        }}
      />

      {/* Command Palette */}
      <CommandPaletteModal
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        allTreeNodes={tree}
        onSelectNode={selectNode}
      />

      {/* New Container Modal */}
      <NewContainerModal
        isOpen={newContainerOpen}
        onClose={() => setNewContainerOpen(false)}
        currentNode={activeNode}
        allTreeNodes={tree}
        onCreated={newNodeId => {
          loadTree(newNodeId);
        }}
      />

      {/* New Track Modal */}
      <NewTrackModal
        isOpen={newTrackOpen}
        onClose={() => setNewTrackOpen(false)}
        currentNode={activeNode}
        onCreated={() => loadTree(activeNodeId)}
      />

      {/* Batch Move Tracks Modal */}
      <MoveTracksModal
        isOpen={moveTracksOpen}
        onClose={() => setMoveTracksOpen(false)}
        selectedTrackIds={Array.from(selectedTrackIds)}
        allTreeNodes={tree}
        onMoved={() => {
          setSelectedTrackIds(new Set());
          loadTree(activeNodeId);
        }}
      />

      {/* Edit Container Modal */}
      <NodeEditModal
        node={nodeToEdit || activeNode}
        isOpen={nodeEditOpen}
        onClose={() => {
          setNodeEditOpen(false);
          setNodeToEdit(null);
        }}
        allTreeNodes={tree}
        onUpdated={newId => {
          setNodeToEdit(null);
          loadTree(newId);
        }}
      />

      {/* Backup / Restore Modal */}
      <BackupModal
        isOpen={backupOpen}
        onClose={() => setBackupOpen(false)}
        onLibraryRestored={() => loadTree()}
      />
    </>
  );
};
