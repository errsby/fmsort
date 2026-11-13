import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { LibraryNode, Track, ColumnDef, ColumnKey } from './types';
import {
  fetchTree,
  deleteTracksBatch,
  updateNode,
  deleteNode,
  createNode,
  deleteTrack,
  createTrack,
  moveTracksBatch,
  enrichTrackIsrc,
  fetchDiscogsArtwork,
  enrichAllIsrcs,
  importUniversalRelease,
  type SuggestedProject,
} from './api';
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
import { CoverArt, getFunkyPalette } from './components/CoverArt';
import { ContextMenu } from './components/ContextMenu';
import type { ContextMenuState } from './components/ContextMenu';
import { ArtistProjectsSuggestions } from './components/ArtistProjectsSuggestions';
import { SocialFeedPage } from './components/SocialFeedPage';
import {
  Search,
  FolderPlus,
  Plus,
  SlidersHorizontal,
  Layers,
  Settings,
  Sparkles,
  Disc,
  Disc3,
  MoreHorizontal,
  Folder,
  FolderOpen,
  ExternalLink,
  Check,
  Info,
  Radio,
  Library,
  Rss,
  ChevronLeft,
  UploadCloud,
  FileAudio,
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

const AUDIO_EXTENSIONS = new Set([
  'mp3', 'flac', 'wav', 'm4a', 'aac', 'ogg', 'aiff', 'aif', 'wma', 'alac', 'opus', 'dsd', 'dff', 'dsf'
]);

function parseAudioFilename(filename: string): { title: string; artist: string; format: string } {
  const dotIndex = filename.lastIndexOf('.');
  const ext = dotIndex !== -1 ? filename.slice(dotIndex + 1).toLowerCase() : '';
  const format = ext ? ext.toUpperCase() : 'Digital';
  let baseName = dotIndex !== -1 ? filename.slice(0, dotIndex) : filename;
  baseName = baseName.replace(/_/g, ' ').trim();
  baseName = baseName.replace(/^(\d+[\.\-\s]+|[A-Z]?\d+[\.\-\s]+)/i, '').trim();
  const parts = baseName.split(/\s+-\s+/);
  if (parts.length >= 2) {
    const artist = parts[0].trim();
    const title = parts.slice(1).join(' - ').trim();
    return { title: title || baseName, artist: artist || 'Unknown Artist', format };
  }
  return { title: baseName || 'Untitled', artist: '', format };
}

function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const audio = new Audio();
      audio.preload = 'metadata';
      const cleanup = () => {
        URL.revokeObjectURL(url);
      };
      audio.onloadedmetadata = () => {
        const dur = Math.round(audio.duration);
        cleanup();
        resolve(isFinite(dur) && dur > 0 ? dur : 0);
      };
      audio.onerror = () => {
        cleanup();
        resolve(0);
      };
      setTimeout(() => {
        cleanup();
        resolve(0);
      }, 1500);
      audio.src = url;
    } catch {
      resolve(0);
    }
  });
}

async function getFilesFromDataTransfer(dataTransfer: DataTransfer): Promise<File[]> {
  const files: File[] = [];
  const items = dataTransfer.items;
  if (items && items.length > 0 && typeof items[0].webkitGetAsEntry === 'function') {
    const traverseFileTree = async (entry: any): Promise<void> => {
      if (entry.isFile) {
        try {
          const file: File = await new Promise((resolve, reject) => entry.file(resolve, reject));
          files.push(file);
        } catch {}
      } else if (entry.isDirectory) {
        try {
          const dirReader = entry.createReader();
          const readEntries = (): Promise<any[]> => {
            return new Promise((resolve, reject) => {
              dirReader.readEntries(resolve, reject);
            });
          };
          let entries = await readEntries();
          while (entries.length > 0) {
            for (const childEntry of entries) {
              await traverseFileTree(childEntry);
            }
            entries = await readEntries();
          }
        } catch {}
      }
    };

    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry();
      if (entry) {
        await traverseFileTree(entry);
      }
    }
  } else if (dataTransfer.files && dataTransfer.files.length > 0) {
    for (let i = 0; i < dataTransfer.files.length; i++) {
      files.push(dataTransfer.files[i]);
    }
  }
  return files;
}

export const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<'library' | 'feed'>('library');
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
  const [heroBackdrop, setHeroBackdrop] = useState<string | null>(null);
  const [enrichingIsrc, setEnrichingIsrc] = useState(false);

  // Custom Context Menu State
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    target: null,
  });

  // Toast feedback state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<any>(null);

  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  // Drag & drop state for folder pages
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [isImportingFiles, setIsImportingFiles] = useState(false);
  const [draggingTrackIds, setDraggingTrackIds] = useState<number[]>([]);
  const [dropTargetNodeId, setDropTargetNodeId] = useState<string | null>(null);
  const fileDropCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Togglable Library Tree Dropdown under (../)
  const [treeDropdownOpen, setTreeDropdownOpen] = useState(false);
  const [menuSearch, setMenuSearch] = useState('');
  const treeDropdownRef = useRef<HTMLDivElement>(null);

  const addMusicRef = useRef<HTMLDivElement>(null);
  const columnMenuRef = useRef<HTMLTableHeaderCellElement>(null);

  const selectNode = (node: LibraryNode) => {
    setActiveNodeId(node.id);
    const path = findNodePath(tree, node.id) || [];
    setOpenNodes(prev => {
      const next = { ...prev };
      for (const p of path) next[p.id] = true;
      return next;
    });
    setSelectedTrackIds(new Set());
    setTreeDropdownOpen(false);
    setCollapsedSections({});
  };

  const activeNode = useMemo(() => {
    if (!activeNodeId) {
      return tree.length > 0 ? tree[0] : null;
    }
    return findNodeById(tree, activeNodeId) || (tree.length > 0 ? tree[0] : null);
  }, [tree, activeNodeId]);

  const activePath = useMemo(() => {
    if (!activeNode) return [];
    return findNodePath(tree, activeNode.id) || [];
  }, [tree, activeNode]);

  const activeFlatTracks = useMemo(() => {
    if (!activeNode) return [];
    return flattenTracks(activeNode);
  }, [activeNode]);

  const allLibraryTracks = useMemo(() => {
    const list: Track[] = [];
    for (const n of tree) {
      list.push(...flattenTracks(n));
    }
    return list;
  }, [tree]);

  const filteredRootNodes = useMemo(() => {
    if (!filterText) return tree;
    const q = filterText.toLowerCase();
    return tree.filter(n => n.name.toLowerCase().includes(q) || n.type.toLowerCase().includes(q));
  }, [tree, filterText]);

  const filteredMenuNodes = useMemo(() => {
    if (!menuSearch.trim()) return tree;
    const q = menuSearch.toLowerCase();
    const filterRec = (nodes: LibraryNode[]): LibraryNode[] => {
      const result: LibraryNode[] = [];
      for (const node of nodes) {
        const matchesSelf = node.name.toLowerCase().includes(q) || node.type.toLowerCase().includes(q);
        const filteredChildren = node.children ? filterRec(node.children) : [];
        if (matchesSelf || filteredChildren.length > 0) {
          result.push({
            ...node,
            children: filteredChildren.length > 0 ? filteredChildren : node.children,
          });
        }
      }
      return result;
    };
    return filterRec(tree);
  }, [tree, menuSearch]);

  const handleGoBack = () => {
    if (activePath.length > 1) {
      const parent = activePath[activePath.length - 2];
      if (parent) selectNode(parent);
    } else if (tree.length > 0) {
      selectNode(tree[0]);
    }
  };

  const loadTree = async (preferredNodeId?: string) => {
    try {
      const data = await fetchTree();
      setTree(data);
      if (preferredNodeId !== undefined) {
        if (preferredNodeId === '' || preferredNodeId === 'root') {
          setActiveNodeId(data.length > 0 ? data[0].id : '');
        } else if (findNodeById(data, preferredNodeId)) {
          setActiveNodeId(preferredNodeId);
        }
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
      if (treeDropdownRef.current && !treeDropdownRef.current.contains(e.target as Node)) {
        setTreeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcut for Command Palette and Back navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      } else if (e.key === 'Escape') {
        setTreeDropdownOpen(false);
        setContextMenu(prev => ({ ...prev, isOpen: false }));
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
      } else if (
        (e.key === 'Backspace' || (e.altKey && e.key === 'ArrowLeft')) &&
        !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)
      ) {
        if (activeNodeId) {
          e.preventDefault();
          handleGoBack();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeNodeId, activePath]);

  const isArtistWithoutSubitems = useMemo(() => {
    return Boolean(
      activeNode &&
      activeNode.type === 'Artist' &&
      (!activeNode.children || activeNode.children.length === 0) &&
      activeFlatTracks.length === 0
    );
  }, [activeNode, activeFlatTracks]);

  const handleImportSuggestedProject = async (project: SuggestedProject) => {
    if (!activeNode) return;
    try {
      showToast(`Importing "${project.title}"...`);
      await importUniversalRelease(
        project.source,
        project.id,
        activeNode.id,
        true,
        project.cover_url
      );
      showToast(`Added "${project.title}" to ${activeNode.name}`);
    } catch (err: any) {
      console.error('Failed to import project:', err);
      showToast(err.message || 'Failed to import project');
      throw err;
    }
  };

  const handleImportFeedRelease = async (title: string, artist: string, cover?: string) => {
    try {
      showToast(`Searching release "${title}"...`);
      const res = await fetch(`/api/deezer/search?q=${encodeURIComponent(`${artist} ${title}`)}`);
      const results = await res.json();
      const targetParent = activeNode || tree[0];
      const targetId = targetParent ? targetParent.id : 'root';

      if (Array.isArray(results) && results.length > 0) {
        const top = results[0];
        await importUniversalRelease('deezer', top.id, targetId, true, cover || top.thumb);
        showToast(`Imported "${title}" into your library!`);
        await loadTree(targetId);
      } else {
        await createNode({
          parent_id: targetId === 'root' ? null : targetId,
          type: 'Album',
          name: title,
          cover_url: cover || '',
        });
        showToast(`Created "${title}" in your library!`);
        await loadTree();
      }
    } catch (err: any) {
      console.warn('Feed import error:', err);
      showToast('Could not import release');
    }
  };

  const handleEnrichActiveTracksIsrc = async () => {
    if (!activeFlatTracks.length) return;
    setEnrichingIsrc(true);
    try {
      const ids = activeFlatTracks.filter(t => !t.isrc || t.isrc === '—').map(t => t.id);
      await enrichAllIsrcs(ids);
      await loadTree(activeNodeId || undefined);
    } catch (err: any) {
      console.warn('Failed to resolve ISRCs:', err);
    } finally {
      setEnrichingIsrc(false);
    }
  };

  // Fetch & manage bigger Discogs art backdrop for active Album / Artist / Folder
  useEffect(() => {
    let isCurrent = true;
    if (!activeNode) {
      setHeroBackdrop(null);
      return;
    }

    // Folders pull ambient backdrop from their first child container with cover art
    if (activeNode.type === 'Folder') {
      const firstChildWithCover = activeNode.children?.find(c => c.cover_url || c.tracks?.[0]?.cover_url);
      const folderCover = activeNode.cover_url || firstChildWithCover?.cover_url || firstChildWithCover?.tracks?.[0]?.cover_url || null;
      setHeroBackdrop(folderCover);
      return;
    }

    if (activeNode.type !== 'Album' && activeNode.type !== 'Artist' && activeNode.type !== 'Playlist') {
      setHeroBackdrop(null);
      return;
    }

    // 1. Initial immediate backdrop from node's cover or track's cover
    const immediateCover = activeNode.cover_url || activeNode.tracks?.[0]?.cover_url || null;
    setHeroBackdrop(immediateCover);

    // 2. Fetch bigger art from Discogs
    const queryType = activeNode.type === 'Artist' ? 'artist' : 'release';
    fetchDiscogsArtwork(activeNode.name, queryType)
      .then(art => {
        if (!isCurrent) return;
        if (art && art.cover_image) {
          setHeroBackdrop(art.cover_image);
          // Persist onto node if none was set
          if (!activeNode.cover_url) {
            updateNode(activeNode.id, { cover_url: art.cover_image }).catch(() => {});
          }
        }
      })
      .catch(() => {});

    return () => {
      isCurrent = false;
    };
  }, [activeNode?.id, activeNode?.name, activeNode?.type, activeNode?.cover_url]);

  // Context Menu Trigger Handlers
  const handleTrackContextMenu = (e: React.MouseEvent, track: Track) => {
    if (e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();

    const isMulti = selectedTrackIds.has(track.id) && selectedTrackIds.size > 1;
    if (!selectedTrackIds.has(track.id) && !isMulti) {
      setSelectedTrackIds(new Set([track.id]));
    }

    setContextMenu({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      target: {
        type: 'track',
        track,
        isMulti,
        count: isMulti ? selectedTrackIds.size : 1,
      },
    });
  };

  const handleNodeContextMenu = (e: React.MouseEvent, node: LibraryNode) => {
    if (e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();

    setContextMenu({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      target: {
        type: 'node',
        node,
      },
    });
  };

  const handleTableContextMenu = (e: React.MouseEvent) => {
    if (e.shiftKey) return;
    if ((e.target as HTMLElement).closest('.t') || (e.target as HTMLElement).closest('.folder-item-hero-row') || (e.target as HTMLElement).closest('.h')) return;
    e.preventDefault();

    setContextMenu({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      target: {
        type: 'table',
        activeNode,
      },
    });
  };

  const handleSidebarContextMenu = (e: React.MouseEvent) => {
    if (e.shiftKey) return;
    if ((e.target as HTMLElement).closest('.n')) return;
    e.preventDefault();

    setContextMenu({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      target: {
        type: 'sidebar',
      },
    });
  };

  const handleResolveIsrcAction = async (track: Track) => {
    showToast(`Searching ISRC for "${track.t}"...`);
    try {
      const res = await enrichTrackIsrc(track.id);
      if (res.updated) {
        showToast(`ISRC resolved: ${res.isrc}`);
        await loadTree(activeNodeId || undefined);
      } else {
        showToast('No ISRC found in digital music catalog');
      }
    } catch {
      showToast('Failed to resolve ISRC');
    }
  };

  const handleBatchResolveIsrcAction = async () => {
    const ids = Array.from(selectedTrackIds);
    if (ids.length === 0) return;
    showToast(`Resolving ISRCs for ${ids.length} tracks...`);
    try {
      const res = await enrichAllIsrcs(ids);
      showToast(`Resolved ${res.updatedCount} ISRCs`);
      await loadTree(activeNodeId || undefined);
    } catch {
      showToast('Failed to batch resolve ISRCs');
    }
  };

  const handleDeleteTrackAction = async (track: Track) => {
    if (!confirm(`Delete track "${track.t}"?`)) return;
    try {
      await deleteTrack(track.id);
      showToast(`Deleted "${track.t}"`);
      await loadTree(activeNodeId || undefined);
    } catch {
      showToast('Failed to delete track');
    }
  };

  const handleBatchDeleteTracksAction = async () => {
    const ids = Array.from(selectedTrackIds);
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} selected tracks?`)) return;
    try {
      await deleteTracksBatch(ids);
      setSelectedTrackIds(new Set());
      showToast(`Deleted ${ids.length} tracks`);
      await loadTree(activeNodeId || undefined);
    } catch {
      showToast('Failed to delete tracks');
    }
  };

  const handleDeleteNodeAction = async (node: LibraryNode) => {
    if (!confirm(`Delete container "${node.name}" and all its contents?`)) return;
    try {
      await deleteNode(node.id);
      showToast(`Deleted "${node.name}"`);
      await loadTree();
    } catch {
      showToast('Failed to delete container');
    }
  };

  const handleRefreshArtworkAction = async (node: LibraryNode) => {
    showToast(`Searching Discogs for ${node.name}...`);
    try {
      const art = await fetchDiscogsArtwork(node.name, node.type === 'Artist' ? 'artist' : 'release');
      if (art && art.cover_image) {
        await updateNode(node.id, { cover_url: art.cover_image });
        showToast(`Discogs artwork updated!`);
        await loadTree(activeNodeId || undefined);
      } else {
        showToast('No artwork found on Discogs');
      }
    } catch {
      showToast('Failed to refresh artwork');
    }
  };

  const handleResolveNodeIsrcsAction = async (node: LibraryNode) => {
    const trs = flattenTracks(node);
    const missing = trs.filter(t => !t.isrc || t.isrc === '—').map(t => t.id);
    if (missing.length === 0) {
      showToast('All tracks already have ISRCs');
      return;
    }
    showToast(`Resolving ${missing.length} missing ISRCs...`);
    try {
      const res = await enrichAllIsrcs(missing);
      showToast(`Resolved ${res.updatedCount} ISRCs`);
      await loadTree(activeNodeId || undefined);
    } catch {
      showToast('Failed to resolve ISRCs');
    }
  };

  const toggleNodeExpansion = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenNodes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const isSectionCollapsed = (child: LibraryNode, depth: number): boolean => {
    if (child.id in collapsedSections) {
      return collapsedSections[child.id];
    }
    // Subfolders within items (depth > 0) are closed by default
    if (depth > 0) return true;
    // Subfolders inside the container (type === 'Folder') are closed by default
    if (child.type === 'Folder') return true;
    // All other container items (Albums, Artists, Playlists, etc.) at depth 0 are opened by default
    return false;
  };

  const toggleSectionCollapse = (id: string, currentlyCollapsed: boolean) => {
    setCollapsedSections(prev => ({ ...prev, [id]: !currentlyCollapsed }));
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

  const handleImportAudioFiles = async (dataTransfer: DataTransfer, targetNode: LibraryNode) => {
    const rawFiles = await getFilesFromDataTransfer(dataTransfer);
    const audioFiles = rawFiles.filter(f => {
      if (f.type && f.type.startsWith('audio/')) return true;
      const dotIndex = f.name.lastIndexOf('.');
      if (dotIndex === -1) return false;
      const ext = f.name.slice(dotIndex + 1).toLowerCase();
      return AUDIO_EXTENSIONS.has(ext);
    });

    if (audioFiles.length === 0) {
      showToast('No valid audio files found in dropped items (MP3, FLAC, WAV, M4A, etc.)');
      return;
    }

    setIsImportingFiles(true);
    showToast(`Importing ${audioFiles.length} dropped audio file${audioFiles.length > 1 ? 's' : ''}...`);

    try {
      for (let i = 0; i < audioFiles.length; i++) {
        const file = audioFiles[i];
        const parsed = parseAudioFilename(file.name);
        const dur = await getAudioDuration(file);
        await createTrack(targetNode.id, {
          t: parsed.title,
          a: parsed.artist || (targetNode.type === 'Artist' ? targetNode.name : 'Unknown Artist'),
          al: targetNode.type === 'Album' ? targetNode.name : (targetNode.type === 'Folder' ? targetNode.name : ''),
          f: parsed.format,
          len: dur || 180,
          y: new Date().getFullYear(),
          sort_order: i,
        });
      }
      showToast(`Imported ${audioFiles.length} track${audioFiles.length > 1 ? 's' : ''} into "${targetNode.name}"`);
      await loadTree(activeNode?.id);
    } catch (err: any) {
      showToast(`Failed to import files: ${err?.message || 'Error'}`);
    } finally {
      setIsImportingFiles(false);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>, targetNode: LibraryNode) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);
    const audioFiles = fileList.filter(f => {
      if (f.type && f.type.startsWith('audio/')) return true;
      const dotIndex = f.name.lastIndexOf('.');
      if (dotIndex === -1) return false;
      const ext = f.name.slice(dotIndex + 1).toLowerCase();
      return AUDIO_EXTENSIONS.has(ext);
    });

    if (audioFiles.length === 0) {
      showToast('No valid audio files selected');
      return;
    }

    setIsImportingFiles(true);
    showToast(`Importing ${audioFiles.length} audio file${audioFiles.length > 1 ? 's' : ''}...`);

    try {
      for (let i = 0; i < audioFiles.length; i++) {
        const file = audioFiles[i];
        const parsed = parseAudioFilename(file.name);
        const dur = await getAudioDuration(file);
        await createTrack(targetNode.id, {
          t: parsed.title,
          a: parsed.artist || (targetNode.type === 'Artist' ? targetNode.name : 'Unknown Artist'),
          al: targetNode.type === 'Album' ? targetNode.name : (targetNode.type === 'Folder' ? targetNode.name : ''),
          f: parsed.format,
          len: dur || 180,
          y: new Date().getFullYear(),
          sort_order: i,
        });
      }
      showToast(`Imported ${audioFiles.length} track${audioFiles.length > 1 ? 's' : ''} into "${targetNode.name}"`);
      await loadTree(activeNode?.id);
    } catch (err: any) {
      showToast(`Failed to import files: ${err?.message || 'Error'}`);
    } finally {
      setIsImportingFiles(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFolderPageDragEnter = (e: React.DragEvent) => {
    if (activeNode?.type !== 'Folder') return;
    e.preventDefault();
    e.stopPropagation();
    fileDropCounter.current++;
    if (e.dataTransfer.types.includes('Files') || draggingTrackIds.length > 0) {
      setIsDraggingFiles(true);
    }
  };

  const handleFolderPageDragOver = (e: React.DragEvent) => {
    if (activeNode?.type !== 'Folder') return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files') || draggingTrackIds.length > 0) {
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleFolderPageDragLeave = (e: React.DragEvent) => {
    if (activeNode?.type !== 'Folder') return;
    e.preventDefault();
    e.stopPropagation();
    fileDropCounter.current--;
    if (fileDropCounter.current <= 0) {
      fileDropCounter.current = 0;
      setIsDraggingFiles(false);
    }
  };

  const handleFolderPageDrop = async (e: React.DragEvent) => {
    if (activeNode?.type !== 'Folder') return;
    e.preventDefault();
    e.stopPropagation();
    fileDropCounter.current = 0;
    setIsDraggingFiles(false);

    if (draggingTrackIds.length > 0) {
      try {
        await moveTracksBatch(draggingTrackIds, activeNode.id);
        showToast(`Moved ${draggingTrackIds.length} track${draggingTrackIds.length > 1 ? 's' : ''} into "${activeNode.name}"`);
        setSelectedTrackIds(new Set());
        setDraggingTrackIds([]);
        await loadTree(activeNode.id);
      } catch (err: any) {
        showToast(err?.message || 'Failed to move tracks');
      }
      return;
    }

    if (e.dataTransfer.types.includes('Files')) {
      await handleImportAudioFiles(e.dataTransfer, activeNode);
    }
  };

  const handleTrackDragStart = (e: React.DragEvent, track: Track) => {
    const ids = selectedTrackIds.has(track.id) ? Array.from(selectedTrackIds) : [track.id];
    setDraggingTrackIds(ids);
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'tracks', ids }));
    e.dataTransfer.setData('text/plain', `${ids.length} track(s)`);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleTrackDragEnd = () => {
    setDraggingTrackIds([]);
    setDropTargetNodeId(null);
  };

  const handleChildRowDragOver = (e: React.DragEvent, child: LibraryNode) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggingTrackIds.length > 0 || e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'move';
      setDropTargetNodeId(child.id);
    }
  };

  const handleChildRowDragLeave = (e: React.DragEvent, child: LibraryNode) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropTargetNodeId === child.id) {
      setDropTargetNodeId(null);
    }
  };

  const handleChildRowDrop = async (e: React.DragEvent, child: LibraryNode) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTargetNodeId(null);

    if (draggingTrackIds.length > 0) {
      try {
        await moveTracksBatch(draggingTrackIds, child.id);
        showToast(`Moved ${draggingTrackIds.length} track${draggingTrackIds.length > 1 ? 's' : ''} to "${child.name}"`);
        setSelectedTrackIds(new Set());
        setDraggingTrackIds([]);
        await loadTree(activeNode?.id);
      } catch (err: any) {
        showToast(err?.message || 'Failed to move tracks');
      }
      return;
    }

    if (e.dataTransfer.types.includes('Files')) {
      await handleImportAudioFiles(e.dataTransfer, child);
    }
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
          onContextMenu={e => handleNodeContextMenu(e, n)}
          tabIndex={0}
          role="treeitem"
        >
          <span
            className={`ar ${isOpen ? 'o' : ''}`}
            onClick={e => toggleNodeExpansion(n.id, e)}
          >
            {hasChildren ? '›' : ''}
          </span>
          <CoverArt
            src={n.cover_url || (n.type !== 'Folder' ? n.tracks?.[0]?.cover_url : null)}
            alt={n.name}
            size={18}
            type={n.type === 'Artist' ? 'artist' : n.type === 'Playlist' ? 'playlist' : n.type === 'Folder' ? 'folder' : 'album'}
            seed={n.name}
            rounded={n.type === 'Artist' ? 'full' : 3}
          />
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
        <tr
          key={`t-${t.id}`}
          className={`t ${isSelected ? 's' : ''} ${draggingTrackIds.includes(t.id) ? 'is-dragging' : ''}`}
          draggable={true}
          onDragStart={e => handleTrackDragStart(e, t)}
          onDragEnd={handleTrackDragEnd}
          onContextMenu={e => handleTrackContextMenu(e, t)}
        >
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <CoverArt
                      src={t.cover_url || n.cover_url}
                      alt={t.t}
                      size={26}
                      type="album"
                      seed={t.al || t.t || t.a}
                      rounded={4}
                    />
                    <span
                      className="ttl"
                      tabIndex={0}
                      onClick={() => setActiveTrack(t)}
                    >
                      {t.t}
                    </span>
                  </div>
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

    // Sub-containers as section header rows with backdrop designs
    if (n.children && n.children.length > 0) {
      n.children.forEach(child => {
        const childTracks = flattenTracks(child);
        const hasSubItems = (child.children && child.children.length > 0) || childTracks.length > 0;
        const isCollapsed = hasSubItems ? isSectionCollapsed(child, depth) : true;
        const backdropImg = child.cover_url || child.tracks?.[0]?.cover_url || null;

        if (child.type === 'Album' || child.type === 'Artist' || child.type === 'Playlist') {
          // Folder item with same backdrop design as full page
          nodesOut.push(
            <tr
              key={`h-${child.id}`}
              className={`folder-item-hero-row ${!hasSubItems ? 'is-empty' : ''} ${dropTargetNodeId === child.id ? 'is-drop-target' : ''}`}
              data-context-type="node"
              data-node-id={child.id}
              onClick={hasSubItems ? () => toggleSectionCollapse(child.id, isCollapsed) : () => selectNode(child)}
              onContextMenu={e => handleNodeContextMenu(e, child)}
              onDragOver={e => handleChildRowDragOver(e, child)}
              onDragLeave={e => handleChildRowDragLeave(e, child)}
              onDrop={e => handleChildRowDrop(e, child)}
            >
              <td colSpan={colSpan}>
                <div
                  className={`folder-item-hero ${hasSubItems && isCollapsed ? 'is-collapsed' : 'is-uncollapsed'}`}
                  style={{ paddingLeft: `${10 + depth * 16}px` }}
                >
                  {/* Backdrop Layer */}
                  {backdropImg && (
                    <div className="hero-backdrop" aria-hidden="true">
                      <div
                        className="hero-backdrop-glow"
                        style={{ backgroundImage: `url(${backdropImg})` }}
                      />
                      <div
                        className="hero-backdrop-artwork folder-backdrop-artwork"
                        style={{ backgroundImage: `url(${backdropImg})` }}
                      />
                      <div className="hero-backdrop-scrim folder-backdrop-scrim" />
                    </div>
                  )}

                  {/* Foreground Content - Compact Inlined Row */}
                  <div className="folder-item-content">
                    {hasSubItems ? (
                      <span className={`ar ${isCollapsed ? '' : 'o'}`}>›</span>
                    ) : (
                      <span className="ar empty" style={{ width: 14 }} />
                    )}

                    <CoverArt
                      src={backdropImg}
                      alt={child.name}
                      size={24}
                      type={child.type === 'Artist' ? 'artist' : child.type === 'Playlist' ? 'playlist' : 'album'}
                      seed={child.name}
                      rounded={child.type === 'Artist' ? 'full' : 4}
                    />

                    <span className="folder-item-type-plain">{child.type}</span>
                    <span className="folder-item-name">{child.name}</span>
                    {dropTargetNodeId === child.id && (
                      <span className="drop-target-badge">
                        {draggingTrackIds.length > 0 ? `Move ${draggingTrackIds.length} track(s) here` : 'Drop into crate'}
                      </span>
                    )}
                    {child.type === 'Album' && child.tracks?.[0]?.a && (
                      <span className="folder-item-artist">· {child.tracks[0].a}</span>
                    )}
                    {child.type === 'Artist' ? (
                      childTracks.length > 0 ? (
                        <span className="m">
                          {childTracks.length} {childTracks.length === 1 ? 'track' : 'tracks'} · {fmtTotalRuntime(childTracks)}
                        </span>
                      ) : null
                    ) : (
                      childTracks.length > 0 ? (
                        <span className="m">
                          {childTracks.length} {childTracks.length === 1 ? 'track' : 'tracks'} · {fmtTotalRuntime(childTracks)}
                        </span>
                      ) : null
                    )}

                    {/* Actions on right */}
                    <div className="folder-item-actions" onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        className="folder-item-nav-btn"
                        title={`Go to ${child.name}`}
                        onClick={() => selectNode(child)}
                      >
                        <span>Open</span>
                        <ExternalLink size={11} />
                      </button>
                      <button
                        type="button"
                        className="node-more-btn"
                        title={`Manage ${child.name}`}
                        onClick={() => {
                          setNodeToEdit(child);
                          setNodeEditOpen(true);
                        }}
                      >
                        <MoreHorizontal size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          );
        } else {
          // Child folder row
          nodesOut.push(
            <tr
              key={`h-${child.id}`}
              className={`h ${dropTargetNodeId === child.id ? 'is-drop-target' : ''}`}
              data-context-type="node"
              data-node-id={child.id}
              onClick={hasSubItems ? () => toggleSectionCollapse(child.id, isCollapsed) : () => selectNode(child)}
              onContextMenu={e => handleNodeContextMenu(e, child)}
              onDragOver={e => handleChildRowDragOver(e, child)}
              onDragLeave={e => handleChildRowDragLeave(e, child)}
              onDrop={e => handleChildRowDrop(e, child)}
            >
              <td colSpan={colSpan} style={{ paddingLeft: `${14 + depth * 16}px` }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {hasSubItems ? (
                    <span className={`ar ${isCollapsed ? '' : 'o'}`}>›</span>
                  ) : (
                    <span className="ar empty" style={{ width: 14 }} />
                  )}
                  <CoverArt
                    src={child.cover_url}
                    alt={child.name}
                    size={24}
                    type="folder"
                    seed={child.name}
                    rounded={4}
                  />
                  <span className="ty">{child.type}</span>
                  <span style={{ fontWeight: 600, color: '#f4f4f5' }}>{child.name}</span>
                  {dropTargetNodeId === child.id && (
                    <span className="drop-target-badge">
                      {draggingTrackIds.length > 0 ? `Move ${draggingTrackIds.length} track(s) here` : 'Drop into crate'}
                    </span>
                  )}
                  <span className="m">
                    {child.children?.length ? `${child.children.length} items` : ''}
                    {childTracks.length > 0 ? ` · ${childTracks.length} tracks · ${fmtTotalRuntime(childTracks)}` : ''}
                  </span>
                </div>
              </td>
            </tr>
          );
        }

        if (hasSubItems && !isCollapsed) {
          nodesOut.push(...renderSections(child, depth + 1));
        }
      });
    }

    return nodesOut;
  };

  return (
    <>
      <div className="app-shell">
        {/* Main Viewport: Scrollable Content + Docked Integrated Footer */}
        <div className="main-viewport">
          <main className="main-content-scroll">
        {currentPage === 'feed' ? (
          <SocialFeedPage
            tree={tree}
            onSwitchToLibrary={() => setCurrentPage('library')}
            onImportRelease={handleImportFeedRelease}
            showToast={showToast}
          />
        ) : activeNode ? (
          /* =========================================================================
             Container Detail View (Drilled Down View)
             ========================================================================= */
          <div
            className="container-detail-view"
            onContextMenu={handleTableContextMenu}
            onDragEnter={activeNode.type === 'Folder' ? handleFolderPageDragEnter : undefined}
            onDragOver={activeNode.type === 'Folder' ? handleFolderPageDragOver : undefined}
            onDragLeave={activeNode.type === 'Folder' ? handleFolderPageDragLeave : undefined}
            onDrop={activeNode.type === 'Folder' ? handleFolderPageDrop : undefined}
          >
            {/* Hidden file input for folder audio file drag-and-drop / selection */}
            <input
              type="file"
              ref={fileInputRef}
              multiple
              accept="audio/*,.mp3,.flac,.wav,.m4a,.aac,.ogg,.aiff,.wma,.opus"
              style={{ display: 'none' }}
              onChange={e => handleFileInputChange(e, activeNode)}
            />

            {/* Drag & Drop Visual Overlay on Folder Pages */}
            {isDraggingFiles && activeNode.type === 'Folder' && (
              <div
                className="folder-drop-overlay"
                onDragOver={handleFolderPageDragOver}
                onDragLeave={handleFolderPageDragLeave}
                onDrop={handleFolderPageDrop}
              >
                <div className="folder-drop-card">
                  <UploadCloud size={46} className="folder-drop-icon" />
                  <div className="folder-drop-title">
                    Drop audio files to add to {activeNode.name}
                  </div>
                  <div className="folder-drop-subtitle">
                    Drop MP3, FLAC, WAV, M4A, AIFF, OGG files or folders here to parse and add them automatically.
                  </div>
                  <div className="folder-drop-badge">
                    <Sparkles size={12} />
                    <span>Release into crate</span>
                  </div>
                </div>
              </div>
            )}
            {/* Active Container Hero Banner with Discogs / Ambient Background Artwork */}
            {(activeNode.type === 'Album' || activeNode.type === 'Artist' || activeNode.type === 'Playlist' || activeNode.type === 'Folder') && (
              <div className="active-hero-banner">
                {heroBackdrop ? (
                  <div className="hero-backdrop" aria-hidden="true">
                    <div
                      className="hero-backdrop-glow"
                      style={{ backgroundImage: `url(${heroBackdrop})` }}
                    />
                    <div
                      className="hero-backdrop-artwork"
                      style={{ backgroundImage: `url(${heroBackdrop})` }}
                    />
                    <div className="hero-backdrop-scrim" />
                  </div>
                ) : activeNode.type === 'Folder' ? (
                  <div className="hero-backdrop" aria-hidden="true">
                    <div
                      className="hero-backdrop-glow"
                      style={{
                        background: `radial-gradient(ellipse 90% 90% at 20% 30%, ${getFunkyPalette(activeNode.name)[1]}2e 0%, transparent 70%), radial-gradient(ellipse 70% 70% at 80% 60%, ${getFunkyPalette(activeNode.name)[2]}24 0%, transparent 65%)`,
                        filter: 'blur(36px)',
                      }}
                    />
                    <div className="hero-backdrop-scrim" />
                  </div>
                ) : null}

                <div className="active-hero-content">
                  <CoverArt
                    src={activeNode.cover_url || (activeNode.type !== 'Folder' ? (activeNode.tracks?.[0]?.cover_url || heroBackdrop) : null)}
                    alt={activeNode.name}
                    size={92}
                    type={activeNode.type === 'Artist' ? 'artist' : activeNode.type === 'Playlist' ? 'playlist' : activeNode.type === 'Folder' ? 'folder' : 'album'}
                    seed={activeNode.name}
                    rounded={activeNode.type === 'Artist' ? 'full' : 8}
                  />
                  <div className="active-hero-meta">
                    <div className="active-hero-badge-row">
                      <span className="active-hero-badge">{activeNode.type.toUpperCase()}</span>
                      {activeNode.type === 'Album' && activeNode.tracks?.[0]?.f && (
                        <span className="active-hero-tag">{activeNode.tracks[0].f}</span>
                      )}
                      {activeNode.type === 'Folder' && (
                        <span className="active-hero-tag">{activeNode.children?.length || 0} CONTAINERS</span>
                      )}
                    </div>
                    <h2 className="active-hero-title">{activeNode.name}</h2>
                    <div className="active-hero-sub">
                      {activeNode.type === 'Album' && activeNode.tracks?.[0]?.a && (
                        <span style={{ color: '#fafafa', fontWeight: 500 }}>{activeNode.tracks[0].a} · </span>
                      )}
                      {activeNode.type === 'Album' && activeNode.tracks?.[0]?.y ? (
                        <span>{activeNode.tracks[0].y} · </span>
                      ) : null}
                      {activeNode.type === 'Artist' ? (
                        activeFlatTracks.length > 0 ? (
                          <>
                            <span>{activeFlatTracks.length} {activeFlatTracks.length === 1 ? 'track' : 'tracks'}</span>
                            <span> · {fmtTotalRuntime(activeFlatTracks)}</span>
                          </>
                        ) : activeNode.children && activeNode.children.length > 0 ? (
                          <span>{activeNode.children.length} {activeNode.children.length === 1 ? 'release' : 'releases'}</span>
                        ) : null
                      ) : (
                        <>
                          <span>{activeFlatTracks.length} {activeFlatTracks.length === 1 ? 'track' : 'tracks'}</span>
                          {activeFlatTracks.length > 0 && <span> · {fmtTotalRuntime(activeFlatTracks)}</span>}
                        </>
                      )}
                      {activeFlatTracks.some(t => !t.isrc || t.isrc === '—') && (
                        <>
                          <span> · </span>
                          <button
                            type="button"
                            onClick={handleEnrichActiveTracksIsrc}
                            disabled={enrichingIsrc}
                            title="Search digital music catalog to find verified ISRC codes for these tracks"
                            style={{
                              background: 'rgba(255, 255, 255, 0.08)',
                              border: '1px solid rgba(255, 255, 255, 0.15)',
                              borderRadius: 4,
                              padding: '1px 8px',
                              color: '#e4e4e7',
                              fontSize: 11,
                              cursor: enrichingIsrc ? 'wait' : 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Sparkles size={11} />
                            <span>{enrichingIsrc ? 'Resolving ISRCs...' : 'Resolve ISRCs'}</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Toolbar */}
            <div className="tb">
              <h1>
                <span>{activeNode.name}</span>
                <span className="ty">{activeNode.type}</span>
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

              {/* Add Music Button inside container — on folder type pages replaced with Drop / Import Audio */}
              {activeNode.type !== 'Folder' ? (
                <div style={{ position: 'relative' }}>
                  <button
                    className="p"
                    onClick={() => setAddMusicMenuOpen(!addMusicMenuOpen)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Plus size={14} />
                    <span>Add Music</span>
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    className="p"
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isImportingFiles}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    title="Import or drop audio files into this folder"
                  >
                    <UploadCloud size={14} />
                    <span>{isImportingFiles ? 'Importing...' : 'Drop / Import Audio'}</span>
                  </button>
                </div>
              )}
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

            {/* Table or Artist Projects Suggestions for Artists without Subitems */}
            {isArtistWithoutSubitems ? (
              <ArtistProjectsSuggestions
                artistNode={activeNode}
                onImportProject={handleImportSuggestedProject}
                onFinishImport={() => loadTree(activeNode.id)}
                onOpenSearchModal={() => setImportModalOpen(true)}
                onNewTrack={() => setNewTrackOpen(true)}
              />
            ) : (
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
                    {(() => {
                      const rows = renderSections(activeNode, 0);
                      if (rows.length === 0) {
                        if (activeNode.type === 'Folder') {
                          return (
                            <tr>
                              <td
                                colSpan={COLUMNS.filter(c => visibleColumns[c.key]).length + 1}
                                style={{ padding: '40px 20px', textAlign: 'center' }}
                              >
                                <div
                                  className="folder-empty-dropzone"
                                  onClick={() => fileInputRef.current?.click()}
                                >
                                  <UploadCloud size={40} className="folder-drop-icon" />
                                  <div style={{ fontWeight: 600, fontSize: 15, color: '#f4f4f5' }}>
                                    Drag &amp; Drop audio files into {activeNode.name}
                                  </div>
                                  <p style={{ fontSize: 12, color: 'var(--mu)', margin: 0, lineHeight: 1.5, maxWidth: 420 }}>
                                    Drop audio files (MP3, FLAC, WAV, M4A, etc.) or music folders from your computer to populate this crate. Metadata and duration are resolved automatically.
                                  </p>
                                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                                    <button
                                      type="button"
                                      className="p"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        fileInputRef.current?.click();
                                      }}
                                    >
                                      <FileAudio size={13} />
                                      <span>Select Audio Files</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setNewContainerOpen(true);
                                      }}
                                    >
                                      <FolderPlus size={13} />
                                      <span>New Sub-Crate</span>
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        }

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
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="empty-library-hero" style={{ margin: 'auto', padding: '60px 20px', textAlign: 'center' }}>
            <Disc size={36} style={{ color: '#60a5fa', marginBottom: 16 }} />
            <h2 style={{ fontSize: 18, color: '#fafafa', marginBottom: 6 }}>No crates in library</h2>
            <p style={{ color: 'var(--mu)', fontSize: 13 }}>Import music using the footer below to get started.</p>
          </div>
        )}
          </main>

          {/* Integrated UI Footer — Docked at bottom of main viewport (does NOT extend into sidebar) */}
          <footer className="integrated-footer">
            {/* Left: Library Tree Dropdown (../) + Breadcrumbs (without dropdown arrows) */}
            <div className="footer-nav-left">
              {/* ../ Library Tree Toggle Button & Dropdown */}
              <div
                className="crumb-history-container"
                ref={treeDropdownRef}
              >
                <button
                  type="button"
                  className={`crumb-history-btn ${treeDropdownOpen ? 'active' : ''}`}
                  onClick={() => setTreeDropdownOpen(!treeDropdownOpen)}
                  title="Browse Library Crates (..)"
                  aria-label="Browse Library Crates"
                >
                  ../
                </button>

                {treeDropdownOpen && (
                  <div className="crumb-tree-dropdown footer-popover" role="menu">
                    {/* Menu Header with Integrated Search Box (⌘K) */}
                    <div className="crumb-menu-search-row">
                      <div className="crumb-menu-search-box">
                        <Search size={14} className="crumb-menu-search-icon" />
                        <input
                          type="search"
                          className="crumb-menu-search-input"
                          placeholder="Search crates or jump to… (⌘K)"
                          value={menuSearch}
                          onChange={e => setMenuSearch(e.target.value)}
                          autoFocus
                        />
                        <button
                          type="button"
                          className="crumb-menu-cmd-key"
                          onClick={() => {
                            setTreeDropdownOpen(false);
                            setCommandPaletteOpen(true);
                          }}
                          title="Open Command Palette (⌘K)"
                        >
                          ⌘K
                        </button>
                      </div>
                    </div>

                    {/* Menu Section Header */}
                    <div className="crumb-menu-section-header">
                      <div className="crumb-menu-section-title">
                        <Library size={13} className="crumb-menu-section-icon" />
                        <span>Crates &amp; Folders</span>
                      </div>
                      <span className="crumb-menu-section-badge">{tree.length}</span>
                    </div>

                    {/* Menu Directory List (Tree) */}
                    <div className="crumb-tree-list">
                      {loading ? (
                        <div style={{ color: 'var(--mu)', padding: '16px 12px', fontSize: 12 }}>Loading library...</div>
                      ) : tree.length === 0 ? (
                        <div className="empty-sidebar-box" style={{ padding: 14 }}>
                          <CoverArt size={28} type="folder" seed="Library" rounded={6} style={{ marginBottom: 6 }} />
                          <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 3, color: '#f4f4f5' }}>Blank Library</div>
                          <p style={{ fontSize: 11, color: 'var(--mu)', margin: '0 0 10px', lineHeight: 1.4 }}>
                            No crates in your library yet.
                          </p>
                        </div>
                      ) : (
                        (menuSearch.trim() ? filteredMenuNodes : tree).map(n => renderTreeNode(n, 0))
                      )}
                    </div>

                    {/* Menu Footer / System Actions: Export Button */}
                    <div className="crumb-menu-footer-actions">
                      <button
                        type="button"
                        className="crumb-menu-action-item"
                        onClick={() => {
                          setTreeDropdownOpen(false);
                          setBackupOpen(true);
                        }}
                        title="Export and Backup Library"
                      >
                        <div className="crumb-menu-action-left">
                          <Layers size={14} style={{ color: '#38bdf8' }} />
                          <span>Export Library</span>
                        </div>
                        <span className="crumb-menu-action-badge">Backup / JSON</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Breadcrumb path (WITHOUT dropdown arrows/menus) */}
              <nav className="unified-crumbs" aria-label="Breadcrumb">
                <span
                  className="crumb-link root-crumb"
                  onClick={() => setTreeDropdownOpen(!treeDropdownOpen)}
                  title="Toggle Library Navigation Menu"
                >
                  <Library size={13} style={{ marginRight: 4 }} />
                  <span>Library</span>
                </span>

                {activePath.map((item, idx) => {
                  const isLast = idx === activePath.length - 1;
                  return (
                    <React.Fragment key={item.id}>
                      <span className="crumb-sep">/</span>
                      {isLast ? (
                        <b className="crumb-current">{item.name}</b>
                      ) : (
                        <span className="crumb-link" onClick={() => selectNode(item)}>
                          {item.name}
                        </span>
                      )}
                    </React.Fragment>
                  );
                })}
              </nav>
            </div>

            {/* Right: Actions (Add Music) */}
            <div className="footer-nav-right">
              <div style={{ position: 'relative' }} ref={addMusicRef}>
                <button
                  type="button"
                  className="p footer-action-btn"
                  onClick={() => setAddMusicMenuOpen(!addMusicMenuOpen)}
                  title="Add Music"
                >
                  <Plus size={13} />
                  <span>Add Music</span>
                </button>

                {addMusicMenuOpen && (
                  <div className="add-music-dropdown footer-popover" style={{ right: 0, left: 'auto', bottom: 'calc(100% + 8px)', top: 'auto' }}>
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
          </footer>
        </div>
      </div>

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

      {/* Custom Right-Click Context Menu */}
      <ContextMenu
        state={contextMenu}
        onClose={() => setContextMenu(prev => ({ ...prev, isOpen: false }))}
        onInspectTrack={track => setActiveTrack(track)}
        onResolveIsrc={handleResolveIsrcAction}
        onBatchResolveIsrc={handleBatchResolveIsrcAction}
        onMoveTracks={ids => {
          if (ids.length > 0) setSelectedTrackIds(new Set(ids));
          setMoveTracksOpen(true);
        }}
        onDeleteTrack={handleDeleteTrackAction}
        onBatchDeleteTracks={handleBatchDeleteTracksAction}
        onSelectNode={node => selectNode(node)}
        onAddMusicToNode={node => {
          setActiveNodeId(node.id);
          setImportModalOpen(true);
        }}
        onAddTrackToNode={node => {
          setActiveNodeId(node.id);
          setNewTrackOpen(true);
        }}
        onNewContainerInside={node => {
          setActiveNodeId(node.id);
          setNewContainerOpen(true);
        }}
        onEditNode={node => {
          setNodeToEdit(node);
          setNodeEditOpen(true);
        }}
        onDeleteNode={handleDeleteNodeAction}
        onRefreshArtwork={handleRefreshArtworkAction}
        onResolveNodeIsrcs={handleResolveNodeIsrcsAction}
        onOpenImport={() => setImportModalOpen(true)}
        onOpenNewTrack={() => setNewTrackOpen(true)}
        onOpenNewContainer={() => setNewContainerOpen(true)}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        onRefreshLibrary={() => {
          loadTree(activeNodeId || undefined);
          showToast('Library refreshed');
        }}
        onOpenBackup={() => setBackupOpen(true)}
        onShowToast={showToast}
      />

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fmsort-toast" role="status">
          <Check size={15} style={{ color: '#4ade80' }} />
          <span>{toastMessage}</span>
        </div>
      )}
    </>
  );
};
