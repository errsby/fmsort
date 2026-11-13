import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { LibraryNode, Track, ColumnDef, ColumnKey, ClipboardState } from './types';
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
  importArtistDiscography,
  fetchArtistProfile,
  fetchSettings,
  saveSettings,
  toggleAlbumsCompleted,
  pasteItems,
  type SuggestedProject,
  type ArtistProfileData,
} from './api';
import {
  fmtDuration,
  fmtTotalRuntime,
  flattenTracks,
  findNodeById,
  findNodePath,
  isAlbumCompleted,
  getAlbumKeys,
  getDistinctCompletedCount,
} from './utils';

import { HybridSearchModal } from './components/HybridSearchModal';
import { TuneMyMusicImportModal } from './components/TuneMyMusicImportModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CommandPaletteModal } from './components/CommandPaletteModal';
import { TrackEditDrawer } from './components/TrackEditDrawer';
import { NewContainerModal } from './components/NewContainerModal';
import { NewTrackModal } from './components/NewTrackModal';
import { MoveTracksModal } from './components/MoveTracksModal';
import { NodeEditModal } from './components/NodeEditModal';
import { BackupModal } from './components/BackupModal';
import { SettingsModal } from './components/SettingsModal';
import { CoverArt, getFunkyPalette } from './components/CoverArt';
import { ContextMenu } from './components/ContextMenu';
import type { ContextMenuState } from './components/ContextMenu';
import { ArtistProjectsSuggestions } from './components/ArtistProjectsSuggestions';
import { ArtistProfileHeader } from './components/ArtistProfileHeader';
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
  MoreVertical,
  Move,
  Folder,
  FolderOpen,
  ExternalLink,
  Check,
  Info,
  Radio,
  Library,
  ChevronDown,
  ChevronUp,
  FileText,
  FolderInput,
  Copy,
  Pin,
  Edit3,
  Trash2,
  CheckSquare,
  CheckCircle2,
  X,
  GripHorizontal,
  RotateCcw,
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

function isDescendant(tree: LibraryNode[], parentId: string, candidateChildId: string): boolean {
  const parentNode = findNodeById(tree, parentId);
  if (!parentNode) return false;
  const check = (node: LibraryNode): boolean => {
    if (node.id === candidateChildId) return true;
    for (const c of node.children || []) {
      if (check(c)) return true;
    }
    return false;
  };
  return (parentNode.children || []).some(check);
}

function flattenVisibleTree(nodes: LibraryNode[], openMap: Record<string, boolean>): LibraryNode[] {
  const result: LibraryNode[] = [];
  for (const n of nodes) {
    result.push(n);
    if (openMap[n.id] && n.children && n.children.length > 0) {
      result.push(...flattenVisibleTree(n.children, openMap));
    }
  }
  return result;
}

export interface Workspace {
  id: string;
  nodeId: string;
  history: string[];
  historyIndex: number;
}

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width?: number;
  height?: number;
}

const clampMenuCoordinates = (
  proposedX: number,
  proposedY: number,
  menuWidth: number,
  menuHeight: number
): { x: number; y: number } => {
  const winW = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const winH = typeof window !== 'undefined' ? window.innerHeight : 800;
  const SCREEN_PAD = 10;

  // Strictly clamp within window boundaries so it NEVER goes off screen/app
  const minX = SCREEN_PAD;
  const maxX = Math.max(minX, winW - menuWidth - SCREEN_PAD);
  const minY = SCREEN_PAD;
  const maxY = Math.max(minY, winH - menuHeight - SCREEN_PAD);

  const x = Math.max(minX, Math.min(maxX, proposedX));
  const y = Math.max(minY, Math.min(maxY, proposedY));

  return { x: Math.round(x), y: Math.round(y) };
};

interface NavMenuSavedState {
  isOpen: boolean;
  isPinned: boolean;
  position: { x: number; y: number } | null;
  width: number;
  height: number;
}

const getInitialNavMenuState = (): NavMenuSavedState => {
  try {
    const saved = localStorage.getItem('fmsort_nav_menu_state');
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        isOpen: Boolean(parsed.isOpen),
        isPinned: Boolean(parsed.isPinned),
        position:
          parsed.position &&
          typeof parsed.position.x === 'number' &&
          !isNaN(parsed.position.x) &&
          typeof parsed.position.y === 'number' &&
          !isNaN(parsed.position.y)
            ? { x: parsed.position.x, y: parsed.position.y }
            : null,
        width: typeof parsed.width === 'number' && parsed.width >= 300 && parsed.width <= 900 ? parsed.width : 360,
        height: typeof parsed.height === 'number' && parsed.height >= 260 && parsed.height <= 1200 ? parsed.height : 480,
      };
    }
  } catch {}
  return {
    isOpen: false,
    isPinned: false,
    position: null,
    width: 360,
    height: 480,
  };
};

export const App: React.FC = () => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => {
    try {
      const saved = localStorage.getItem('fmsort_workspaces');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}
    return [{ id: 'ws-1', nodeId: '', history: [], historyIndex: 0 }];
  });
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('fmsort_active_workspace_id');
      if (saved) return saved;
    } catch {}
    return 'ws-1';
  });

  const [hoverPreviewNode, setHoverPreviewNode] = useState<LibraryNode | null>(null);
  const [hoverPreviewPos, setHoverPreviewPos] = useState<{ left: number } | null>(null);
  const hoverTimeoutRef = useRef<any>(null);
  const [workspacePickerOpen, setWorkspacePickerOpen] = useState(false);
  const [workspacePickerSearch, setWorkspacePickerSearch] = useState('');
  const workspacePickerRef = useRef<HTMLDivElement>(null);
  const workspaceAddContainerRef = useRef<HTMLDivElement>(null);
  const workspacesDockRef = useRef<HTMLDivElement>(null);

  // Detached-but-connected Library Window & Workspace Drawer (Independently Movable & Resizable)
  const initialNavMenuStateRef = useRef<NavMenuSavedState>(getInitialNavMenuState());
  const [treeDropdownOpen, setTreeDropdownOpen] = useState<boolean>(initialNavMenuStateRef.current.isOpen);
  const [isMenuPinned, setIsMenuPinned] = useState<boolean>(initialNavMenuStateRef.current.isPinned);
  const isMenuPinnedRef = useRef(isMenuPinned);
  isMenuPinnedRef.current = isMenuPinned;
  const isDraggingMenuRef = useRef(false);
  const isResizingDrawerRef = useRef(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(initialNavMenuStateRef.current.position);
  const [menuWidth, setMenuWidth] = useState<number>(initialNavMenuStateRef.current.width);
  const [menuHeight, setMenuHeight] = useState<number>(initialNavMenuStateRef.current.height);
  const dropdownContainerRef = useRef<HTMLDivElement>(null);

  // Independent Workspace Drawer Position
  const [wsDrawerPosition, setWsDrawerPosition] = useState<{ x: number; y: number } | null>(() => {
    try {
      const saved = localStorage.getItem('fmsort_ws_drawer_position');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (
          parsed &&
          typeof parsed.x === 'number' &&
          !isNaN(parsed.x) &&
          typeof parsed.y === 'number' &&
          !isNaN(parsed.y)
        ) {
          return { x: parsed.x, y: parsed.y };
        }
      }
    } catch {}
    return null;
  });
  const [isInteractingWs, setIsInteractingWs] = useState(false);
  const isDraggingWsRef = useRef(false);

  // Persist Workspace Drawer Position
  useEffect(() => {
    try {
      if (wsDrawerPosition) {
        localStorage.setItem('fmsort_ws_drawer_position', JSON.stringify(wsDrawerPosition));
      } else {
        localStorage.removeItem('fmsort_ws_drawer_position');
      }
    } catch {}
  }, [wsDrawerPosition]);

  // Save library window state across page closes and reloads
  useEffect(() => {
    try {
      localStorage.setItem(
        'fmsort_nav_menu_state',
        JSON.stringify({
          isOpen: treeDropdownOpen,
          isPinned: isMenuPinned,
          position: menuPosition,
          width: menuWidth,
          height: menuHeight,
        })
      );
    } catch (e) {
      console.warn('Could not save nav menu state to localStorage', e);
    }
  }, [treeDropdownOpen, isMenuPinned, menuPosition, menuWidth, menuHeight]);

  // Re-clamp library window and workspace drawer on window resize
  useEffect(() => {
    const handleWindowResize = () => {
      if (menuPosition) {
        const clamped = clampMenuCoordinates(menuPosition.x, menuPosition.y, menuWidth, menuHeight);
        if (clamped.x !== menuPosition.x || clamped.y !== menuPosition.y) {
          setMenuPosition(clamped);
        }
      }
      if (wsDrawerPosition) {
        const dockEl = workspacesDockRef.current;
        const rect = dockEl?.getBoundingClientRect();
        const w = rect?.width || 280;
        const h = rect?.height || 38;
        const clamped = clampMenuCoordinates(wsDrawerPosition.x, wsDrawerPosition.y, w, h);
        if (clamped.x !== wsDrawerPosition.x || clamped.y !== wsDrawerPosition.y) {
          setWsDrawerPosition(clamped);
        }
      }
    };

    handleWindowResize();
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [menuPosition, menuWidth, menuHeight, wsDrawerPosition]);

  // "Select Multiple" Mode state
  const [selectMultipleMode, setSelectMultipleMode] = useState(false);
  // Attached Control Drawer (Selection Actions) placement relative to Workspace Dock
  const [controlDrawerOpenBelow, setControlDrawerOpenBelow] = useState(false);
  const [controlDrawerAlignRight, setControlDrawerAlignRight] = useState(false);

  const dragHoverTimeoutRef = useRef<any>(null);
  const draggedTracksRef = useRef<number[]>([]);
  const draggedNodesRef = useRef<string[]>([]);
  const isSwitchingWorkspaceDragRef = useRef<boolean>(false);
  const activeWorkspaceIdRef = useRef<string>(activeWorkspaceId);
  const activeNodeIdRef = useRef<string>('');

  // Persist workspaces across page reloads
  useEffect(() => {
    try {
      if (workspaces.length > 0) {
        localStorage.setItem('fmsort_workspaces', JSON.stringify(workspaces));
      }
    } catch {}
  }, [workspaces]);

  useEffect(() => {
    try {
      if (activeWorkspaceId) {
        localStorage.setItem('fmsort_active_workspace_id', activeWorkspaceId);
      }
    } catch {}
  }, [activeWorkspaceId]);
  const [isWorkspaceDropTarget, setIsWorkspaceDropTarget] = useState<string | null>(null);
  const [pinnedCrateIds, setPinnedCrateIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('fmsort_pinned_crates');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [clipboard, setClipboard] = useState<ClipboardState | null>(() => {
    try {
      const saved = sessionStorage.getItem('fmsort_clipboard');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      if (clipboard) {
        sessionStorage.setItem('fmsort_clipboard', JSON.stringify(clipboard));
      } else {
        sessionStorage.removeItem('fmsort_clipboard');
      }
    } catch {}
  }, [clipboard]);
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
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('fmsort_collapsed_sections');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Persist container collapse/expand choices across page reloads
  useEffect(() => {
    try {
      localStorage.setItem('fmsort_collapsed_sections', JSON.stringify(collapsedSections));
    } catch {}
  }, [collapsedSections]);
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
  const [tuneImportOpen, setTuneImportOpen] = useState(false);
  const [tuneImportTargetNode, setTuneImportTargetNode] = useState<LibraryNode | null>(null);
  const [searchInitialQuery, setSearchInitialQuery] = useState<string>('');
  const [searchInitialTargetNodeId, setSearchInitialTargetNodeId] = useState<string>('');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [newContainerOpen, setNewContainerOpen] = useState(false);
  const [newTrackOpen, setNewTrackOpen] = useState(false);
  const [newTrackTargetNode, setNewTrackTargetNode] = useState<LibraryNode | null>(null);
  const [moveTracksOpen, setMoveTracksOpen] = useState(false);
  const [nodeEditOpen, setNodeEditOpen] = useState(false);
  const [nodeToEdit, setNodeToEdit] = useState<LibraryNode | null>(null);
  const [backupOpen, setBackupOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statusEnabled, setStatusEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('fmsort_status_enabled') === 'true';
    } catch {
      return false;
    }
  });
  const [completedAlbumKeys, setCompletedAlbumKeys] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('fmsort_completed_album_keys');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Per-folder Album Completion Mode state
  const [completionFolderIds, setCompletionFolderIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('fmsort_completion_folder_ids');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Dock tray drop target state (for opening dropped items into new workspace)
  const [isDockTrayDropTarget, setIsDockTrayDropTarget] = useState(false);
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const [addMusicMenuOpen, setAddMusicMenuOpen] = useState(false);
  const [heroBackdrop, setHeroBackdrop] = useState<string | null>(null);
  const [enrichingIsrc, setEnrichingIsrc] = useState(false);
  const [artistProfile, setArtistProfile] = useState<ArtistProfileData | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [artistInfoExpanded, setArtistInfoExpanded] = useState(false);
  const [showArtistSuggestions, setShowArtistSuggestions] = useState(false);
  const filterInputRef = useRef<HTMLInputElement>(null);

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

  // Universal drag & drop state (tracks, folders, albums, artists)
  const [draggingTrackIds, setDraggingTrackIds] = useState<number[]>([]);
  const [draggingNodeIds, setDraggingNodeIds] = useState<string[]>([]);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dropTargetNodeId, setDropTargetNodeId] = useState<string | null>(null);

  // Multi-item selection state for containers (artists, albums, folders)
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());

  const setSelectedNodeId = (id: string | null) => {
    if (!id) {
      setSelectedNodeIds(new Set());
    } else {
      setSelectedNodeIds(new Set([id]));
    }
  };

  const selectedNodeId = useMemo(() => {
    return selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null;
  }, [selectedNodeIds]);

  // Keep attached control drawer orientation updated relative to workspace drawer & window bounds
  useEffect(() => {
    if (wsDrawerPosition) {
      setControlDrawerOpenBelow(wsDrawerPosition.y < 54);
      setControlDrawerAlignRight(wsDrawerPosition.x + 460 > window.innerWidth - 12);
    } else {
      setControlDrawerOpenBelow(false);
      setControlDrawerAlignRight(false);
    }
  }, [wsDrawerPosition, selectedTrackIds.size, selectedNodeIds.size]);

  const [menuSearch, setMenuSearch] = useState('');

  const slashTapTimeoutRef = useRef<any>(null);
  const lastSlashTapTimeRef = useRef<number>(0);
  const addMusicRef = useRef<HTMLDivElement>(null);
  const columnMenuRef = useRef<HTMLTableHeaderCellElement>(null);
  const lastSelectedNodeIdRef = useRef<string | null>(null);
  const lastSelectedTrackIdRef = useRef<number | null>(null);

  const selectNode = (node: LibraryNode, pushHistory = true) => {
    setActiveNodeId(node.id);
    const path = findNodePath(tree, node.id) || [];
    setOpenNodes(prev => {
      const next = { ...prev };
      for (const p of path) next[p.id] = true;
      return next;
    });
    setSelectedTrackIds(new Set());
    setSelectedNodeIds(new Set([node.id]));
    lastSelectedNodeIdRef.current = node.id;
    if (!isMenuPinnedRef.current) {
      setTreeDropdownOpen(false);
    }

    setWorkspaces(prev => prev.map(ws => {
      if (ws.id === activeWorkspaceId) {
        if (!pushHistory) {
          return { ...ws, nodeId: node.id };
        }
        const newHist = ws.history.slice(0, ws.historyIndex + 1);
        newHist.push(node.id);
        return { ...ws, nodeId: node.id, history: newHist, historyIndex: newHist.length - 1 };
      }
      return ws;
    }));

    if (pushHistory) {
      window.history.pushState(
        { nodeId: node.id, workspaceId: activeWorkspaceId, time: Date.now() },
        '',
        window.location.pathname
      );
    }
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

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return findNodeById(tree, selectedNodeId);
  }, [tree, selectedNodeId]);

  // Check if album completion mode is active for a given container or any of its ancestors
  const isNodeCompletionEnabled = useCallback(
    (nodeId: string | null | undefined): boolean => {
      if (!nodeId) return false;
      if (completionFolderIds.has(nodeId)) return true;
      const path = findNodePath(tree, nodeId) || [];
      return path.some(p => completionFolderIds.has(p.id));
    },
    [completionFolderIds, tree]
  );

  const handleToggleFolderCompletion = async (folderId: string) => {
    const targetNode = findNodeById(tree, folderId);
    const folderName = targetNode?.name || 'Folder';
    const isCurrentlyEnabled = completionFolderIds.has(folderId);
    const nextSet = new Set(completionFolderIds);
    if (isCurrentlyEnabled) {
      nextSet.delete(folderId);
    } else {
      nextSet.add(folderId);
    }
    setCompletionFolderIds(nextSet);
    try {
      localStorage.setItem('fmsort_completion_folder_ids', JSON.stringify(Array.from(nextSet)));
      await saveSettings({ completionFolderIds: Array.from(nextSet) });
      showToast(
        isCurrentlyEnabled
          ? `Album completion mode disabled for "${folderName}"`
          : `Album completion mode enabled for "${folderName}"`
      );
    } catch {
      showToast('Saved completion mode state locally');
    }
  };

  // Workspace Drawer Max Width Constraint (Stops sizing horizontally if conflicting with Lib Drawer)
  const wsMaxWidth = useMemo(() => {
    if (!treeDropdownOpen) return undefined;

    const wsX = wsDrawerPosition ? wsDrawerPosition.x : 16;
    const wsY = wsDrawerPosition ? wsDrawerPosition.y : (typeof window !== 'undefined' ? window.innerHeight - 54 : 700);

    // If library drawer has a custom position
    if (menuPosition) {
      const libX = menuPosition.x;
      const libY = menuPosition.y;
      const libW = menuWidth;
      const libH = menuHeight;

      // Check vertical conflict
      const wsH = 38;
      const verticalConflict = !(wsY + wsH < libY || wsY > libY + libH);

      // If library drawer is to the right and vertically in conflict or nearby
      if (libX > wsX && verticalConflict) {
        return `${Math.max(160, libX - wsX - 8)}px`;
      }

      // If lib drawer is aligned on the left or overlapping
      if (Math.abs(libX - wsX) < 40) {
        return `${Math.max(160, libW)}px`;
      }
    } else {
      // Default docked position: lib drawer sits directly above/aligned with ws drawer
      return `${Math.max(160, menuWidth)}px`;
    }

    return undefined;
  }, [treeDropdownOpen, menuWidth, menuHeight, menuPosition, wsDrawerPosition]);

  const firstSelectedTrack = useMemo(() => {
    if (selectedTrackIds.size === 0) return null;
    const firstId = Array.from(selectedTrackIds)[0];
    return activeFlatTracks.find(t => t.id === firstId) || null;
  }, [selectedTrackIds, activeFlatTracks]);

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

  // Navigation menu nodes: Pinned folders appear atop all other folders in user's pinned order
  const displayedNavNodes = useMemo(() => {
    const baseNodes = menuSearch.trim() ? filteredMenuNodes : tree;
    if (pinnedCrateIds.length === 0) return baseNodes;

    const pinnedSet = new Set(pinnedCrateIds);
    const pinnedList: LibraryNode[] = [];

    // Collect all pinned folders in their pinned order
    pinnedCrateIds.forEach(id => {
      const found = findNodeById(baseNodes, id);
      if (found) pinnedList.push(found);
    });

    // Unpinned root folders
    const unpinnedList = baseNodes.filter(n => !pinnedSet.has(n.id));
    return [...pinnedList, ...unpinnedList];
  }, [tree, filteredMenuNodes, menuSearch, pinnedCrateIds]);

  // Auto-resize Library Drawer smoothly when new lib items/folders are opened
  useEffect(() => {
    if (!treeDropdownOpen || isResizingDrawerRef.current) return;

    const visibleCount = flattenVisibleTree(displayedNavNodes, openNodes).length;
    // 47px header + 12px list padding + 28px per item + 8px breathing space
    const calculatedNeededH = 67 + Math.max(1, visibleCount) * 28;
    const maxH = typeof window !== 'undefined'
      ? Math.max(260, window.innerHeight - (menuPosition ? (menuPosition.y > 0 ? 30 : 60) : (wsDrawerPosition ? (window.innerHeight - wsDrawerPosition.y + 16) : 70)))
      : 800;

    const targetHeight = Math.min(maxH, Math.max(260, calculatedNeededH));

    if (targetHeight > menuHeight) {
      setMenuHeight(targetHeight);
      if (menuPosition) {
        const winH = window.innerHeight;
        if (menuPosition.y + targetHeight > winH - 10) {
          const clampedY = Math.max(10, winH - 10 - targetHeight);
          setMenuPosition(prev => prev ? { ...prev, y: Math.round(clampedY) } : null);
        }
      }
    }
  }, [openNodes, treeDropdownOpen, displayedNavNodes.length, menuPosition, wsDrawerPosition]);

  // Magic slug: "?sear=" URL query parameter opens the Music Search Modal with the specified query
  useEffect(() => {
    const checkSearSlug = () => {
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.has('sear')) {
          const queryText = params.get('sear') || '';
          const targetId = activeNodeIdRef.current || activeWorkspaceIdRef.current || 'uncategorized';
          setSearchInitialQuery(queryText);
          setSearchInitialTargetNodeId(targetId);
          setImportModalOpen(true);
        }
      } catch (err) {
        console.warn('Could not read ?sear= slug parameter:', err);
      }
    };

    checkSearSlug();
    window.addEventListener('popstate', checkSearSlug);
    return () => window.removeEventListener('popstate', checkSearSlug);
  }, []);

  const handleGoBack = () => {
    if (activePath.length > 1) {
      const parent = activePath[activePath.length - 2];
      if (parent) selectNode(parent);
    } else if (tree.length > 0) {
      selectNode(tree[0]);
    }
  };

  const allContainers = useMemo(() => {
    const list: LibraryNode[] = [];
    const walk = (nodes: LibraryNode[]) => {
      for (const n of nodes) {
        list.push(n);
        if (n.children && n.children.length > 0) {
          walk(n.children);
        }
      }
    };
    walk(tree);
    return list;
  }, [tree]);

  const togglePinCrate = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setPinnedCrateIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      try {
        localStorage.setItem('fmsort_pinned_crates', JSON.stringify(next));
      } catch {}
      const node = findNodeById(tree, id);
      showToast(next.includes(id) ? `Pinned "${node?.name || 'folder'}" to submenu` : `Unpinned "${node?.name || 'folder'}"`);
      return next;
    });
  };

  const moveCrateOrder = async (nodeId: string, direction: 'up' | 'down', e: React.MouseEvent) => {
    e.stopPropagation();
    const node = findNodeById(tree, nodeId);
    if (!node) return;
    const parent = node.parent_id ? findNodeById(tree, node.parent_id) : null;
    const siblings = parent ? (parent.children || []) : tree;
    const idx = siblings.findIndex(s => s.id === nodeId);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= siblings.length) return;

    const other = siblings[targetIdx];
    try {
      await Promise.all([
        updateNode(node.id, { sort_order: targetIdx }),
        updateNode(other.id, { sort_order: idx }),
      ]);
      await loadTree(activeNodeId);
      showToast(`Moved "${node.name}" ${direction}`);
    } catch {
      showToast('Failed to reorder folder');
    }
  };

  const movePinnedOrder = (idx: number, targetIdx: number) => {
    if (targetIdx < 0 || targetIdx >= pinnedCrateIds.length) return;
    setPinnedCrateIds(prev => {
      const copy = [...prev];
      const [removed] = copy.splice(idx, 1);
      copy.splice(targetIdx, 0, removed);
      try {
        localStorage.setItem('fmsort_pinned_crates', JSON.stringify(copy));
      } catch {}
      return copy;
    });
  };

  const openInNewWorkspace = (node: LibraryNode, switchTo: boolean = true) => {
    const existing = workspaces.find(ws => ws.nodeId === node.id);
    if (existing) {
      switchWorkspace(existing.id);
      showToast(`Switched to workspace "${node.name}"`);
      return;
    }

    const newWsId = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newWs: Workspace = {
      id: newWsId,
      nodeId: node.id,
      history: [node.id],
      historyIndex: 0,
    };

    setWorkspaces(prev => [...prev, newWs]);
    if (switchTo) {
      setActiveWorkspaceId(newWsId);
      setActiveNodeId(node.id);
      setSelectedTrackIds(new Set());
      setSelectedNodeIds(new Set());
      window.history.replaceState({ nodeId: node.id, workspaceId: newWsId }, '', window.location.pathname);
    }
    showToast(`Opened "${node.name}" in new workspace`);
  };

  const switchWorkspace = (wsId: string, isDragging = false) => {
    const ws = workspaces.find(w => w.id === wsId);
    if (!ws) return;
    activeWorkspaceIdRef.current = ws.id;
    activeNodeIdRef.current = ws.nodeId;
    setActiveWorkspaceId(ws.id);
    setActiveNodeId(ws.nodeId);
    if (!isDragging) {
      setSelectedTrackIds(new Set());
      setSelectedNodeIds(new Set());
    }
    window.history.replaceState({ nodeId: ws.nodeId, workspaceId: ws.id }, '', window.location.pathname);
  };

  const closeWorkspace = (wsId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (workspaces.length <= 1) {
      if (tree.length > 0 && activeNodeId !== tree[0].id) {
        selectNode(tree[0]);
        showToast('Reset workspace to library root');
      }
      return;
    }

    const idx = workspaces.findIndex(w => w.id === wsId);
    const remaining = workspaces.filter(w => w.id !== wsId);
    setWorkspaces(remaining);

    if (activeWorkspaceId === wsId) {
      const newIdx = Math.max(0, idx - 1);
      const nextWs = remaining[newIdx];
      activeWorkspaceIdRef.current = nextWs.id;
      activeNodeIdRef.current = nextWs.nodeId;
      setActiveWorkspaceId(nextWs.id);
      setActiveNodeId(nextWs.nodeId);
      window.history.replaceState({ nodeId: nextWs.nodeId, workspaceId: nextWs.id }, '', window.location.pathname);
    }
  };

  const handleWorkspaceChipDragOver = (e: React.DragEvent, wsId: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    if (isWorkspaceDropTarget !== wsId) {
      setIsWorkspaceDropTarget(wsId);
    }
  };

  const handleWorkspaceChipDragEnter = (e: React.DragEvent, wsId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsWorkspaceDropTarget(wsId);
    if (dragHoverTimeoutRef.current) clearTimeout(dragHoverTimeoutRef.current);
    // Spring-loaded workspace hover switch: 180ms feels instantaneous and responsive
    dragHoverTimeoutRef.current = setTimeout(() => {
      isSwitchingWorkspaceDragRef.current = true;
      switchWorkspace(wsId, true);
      setTimeout(() => {
        isSwitchingWorkspaceDragRef.current = false;
      }, 350);
    }, 180);
  };

  const handleWorkspaceChipDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const currentTarget = e.currentTarget as HTMLElement;
    const related = e.relatedTarget as Node | null;
    if (related && currentTarget.contains(related)) {
      return; // Still inside chip
    }
    if (dragHoverTimeoutRef.current) {
      clearTimeout(dragHoverTimeoutRef.current);
      dragHoverTimeoutRef.current = null;
    }
    setIsWorkspaceDropTarget(null);
  };

  const handleWorkspaceChipDrop = async (e: React.DragEvent, wsId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragHoverTimeoutRef.current) {
      clearTimeout(dragHoverTimeoutRef.current);
      dragHoverTimeoutRef.current = null;
    }
    setIsWorkspaceDropTarget(null);

    const targetWs = workspaces.find(w => w.id === wsId);
    if (!targetWs) return;
    const targetNode = findNodeById(tree, targetWs.nodeId);
    if (!targetNode) return;

    // Switch to target workspace
    switchWorkspace(wsId);

    const trackIds = getDraggedTrackIds(e);
    const nodeIds = getDraggedNodeIds(e);

    if (trackIds.length > 0) {
      try {
        await moveTracksBatch(trackIds, targetNode.id);
        showToast(`Moved ${trackIds.length} track${trackIds.length > 1 ? 's' : ''} into "${targetNode.name}"`);
        clearDragState();
        setSelectedTrackIds(new Set());
        await loadTree(targetNode.id);
      } catch (err: any) {
        showToast(err?.message || 'Failed to move tracks into workspace');
        clearDragState();
      }
      return;
    }

    if (nodeIds.length > 0) {
      const validIds = nodeIds.filter(
        id => id !== targetNode.id && !isDescendant(tree, id, targetNode.id)
      );
      if (validIds.length === 0) {
        showToast('Cannot move a container into its own subfolder');
        clearDragState();
        return;
      }
      try {
        await Promise.all(validIds.map(id => updateNode(id, { parent_id: targetNode.id })));
        const label = validIds.length === 1
          ? `"${findNodeById(tree, validIds[0])?.name || 'Container'}"`
          : `${validIds.length} containers`;
        showToast(`Moved ${label} into "${targetNode.name}"`);
        clearDragState();
        setSelectedNodeIds(new Set());
        await loadTree(targetNode.id);
      } catch (err: any) {
        showToast(err?.message || 'Failed to move container into workspace');
        clearDragState();
      }
      return;
    }

    clearDragState();
  };

  // Workspace Dock Tray Drag & Drop (Drop containers or tracks into workspace drawer to open as new workspace window)
  const handleWorkspaceTrayDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!isDockTrayDropTarget) {
      setIsDockTrayDropTarget(true);
    }
  };

  const handleWorkspaceTrayDragLeave = (e: React.DragEvent) => {
    const related = e.relatedTarget as Node | null;
    if (related && (e.currentTarget as Node).contains(related)) {
      return;
    }
    setIsDockTrayDropTarget(false);
  };

  const handleWorkspaceTrayDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDockTrayDropTarget(false);
    setIsWorkspaceDropTarget(null);

    const nodeIds = getDraggedNodeIds(e);
    const trackIds = getDraggedTrackIds(e);

    // If containers/nodes dropped from lib drawer or item UI table:
    if (nodeIds.length > 0) {
      const nodesToOpen = nodeIds.map(id => findNodeById(tree, id)).filter(Boolean) as LibraryNode[];
      if (nodesToOpen.length > 0) {
        nodesToOpen.forEach((node, idx) => {
          openInNewWorkspace(node, idx === nodesToOpen.length - 1);
        });
        clearDragState();
        return;
      }
    }

    // If tracks dropped from item UI table:
    if (trackIds.length > 0) {
      const firstTrack = activeFlatTracks.find(t => trackIds.includes(t.id));
      if (firstTrack?.al) {
        const albumNode = allContainers.find(
          c => c.type === 'Album' && c.name.toLowerCase() === firstTrack.al.toLowerCase()
        );
        if (albumNode) {
          openInNewWorkspace(albumNode);
          clearDragState();
          return;
        }
      }
      if (activeNode) {
        openInNewWorkspace(activeNode);
        clearDragState();
        return;
      }
    }

    clearDragState();
  };

  const handleWorkspaceChipMouseEnter = (node: LibraryNode | null, e: React.MouseEvent<HTMLDivElement>) => {
    if (!node) return;
    if (draggingTrackIds.length > 0 || draggedTracksRef.current.length > 0 || draggingNodeIds.length > 0 || draggedNodesRef.current.length > 0) {
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const wrapperRect = workspacesDockRef.current?.getBoundingClientRect();
    const leftPos = rect.left - (wrapperRect?.left || 0);

    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setHoverPreviewNode(node);
      setHoverPreviewPos({ left: Math.max(0, leftPos - 10) });
    }, 220);
  };

  const handleWorkspaceChipMouseLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setHoverPreviewNode(null);
    setHoverPreviewPos(null);
  };

  // Navigational Submenu Drag & Move with Screen Clamping & Workspace Drawer Collision Avoidance
  // Library Window Drag & Move with Screen Clamping
  const handleLibDragStart = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('input') || target.closest('button')) return;

    e.preventDefault();
    e.stopPropagation();

    const libEl = dropdownContainerRef.current;
    if (!libEl) return;
    const rect = libEl.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    isDraggingMenuRef.current = true;
    setIsInteracting(true);
    const initialPos = clampMenuCoordinates(rect.left, rect.top, rect.width, rect.height);
    setMenuPosition(initialPos);

    const handleMouseMove = (moveEv: MouseEvent) => {
      moveEv.preventDefault();
      const clamped = clampMenuCoordinates(
        moveEv.clientX - offsetX,
        moveEv.clientY - offsetY,
        rect.width,
        rect.height
      );
      setMenuPosition(clamped);
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      setTimeout(() => {
        isDraggingMenuRef.current = false;
        setIsInteracting(false);
      }, 60);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Workspace Drawer Independent Drag & Move with Screen Clamping
  const handleWsDragStart = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (
      target.closest('input') ||
      target.closest('button') ||
      target.closest('.workspace-chip') ||
      target.closest('.selection-popup-bar')
    ) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const dockEl = workspacesDockRef.current;
    if (!dockEl) return;
    const rect = dockEl.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    isDraggingWsRef.current = true;
    setIsInteractingWs(true);
    const initialPos = clampMenuCoordinates(rect.left, rect.top, rect.width, rect.height);
    setWsDrawerPosition(initialPos);

    const handleMouseMove = (moveEv: MouseEvent) => {
      moveEv.preventDefault();
      const clamped = clampMenuCoordinates(
        moveEv.clientX - offsetX,
        moveEv.clientY - offsetY,
        rect.width,
        rect.height
      );
      setWsDrawerPosition(clamped);
      setControlDrawerOpenBelow(clamped.y < 54);
      setControlDrawerAlignRight(clamped.x + 460 > window.innerWidth - 12);
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      setTimeout(() => {
        isDraggingWsRef.current = false;
        setIsInteractingWs(false);
      }, 60);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Library Window Vertical Resizing from Any Corner
  const handleLibResizeStart = (
    e: React.MouseEvent,
    corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top' | 'corner'
  ) => {
    e.preventDefault();
    e.stopPropagation();
    isResizingDrawerRef.current = true;
    setIsInteracting(true);

    const startY = e.clientY;
    const startHeight = menuHeight;
    const rect = dropdownContainerRef.current?.getBoundingClientRect();
    const currentTop = rect ? rect.top : (menuPosition?.y || 100);
    const currentLeft = rect ? rect.left : (menuPosition?.x || 16);
    const startPos = menuPosition ? { ...menuPosition } : { x: currentLeft, y: currentTop };

    const isTopCorner = corner === 'top-left' || corner === 'top-right' || corner === 'top';

    const handleMouseMove = (moveEv: MouseEvent) => {
      moveEv.preventDefault();
      const deltaY = moveEv.clientY - startY;
      let newHeight = startHeight;

      const visibleCount = flattenVisibleTree(displayedNavNodes, openNodes).length;
      const calculatedNeededH = 67 + Math.max(1, visibleCount) * 28;

      if (isTopCorner) {
        // Dragging top corners upward increases height
        const proposedHeight = startHeight - deltaY;
        const maxHeight = Math.max(260, startPos.y + startHeight - 10);
        const minAllowedHeight = Math.min(maxHeight, calculatedNeededH);
        newHeight = Math.max(minAllowedHeight, Math.min(maxHeight, proposedHeight));

        if (menuPosition) {
          const newY = Math.max(10, startPos.y - (newHeight - startHeight));
          setMenuPosition({ x: startPos.x, y: Math.round(newY) });
        }
      } else {
        // Dragging bottom corners downward increases height
        const proposedHeight = startHeight + deltaY;
        const maxHeight = window.innerHeight - startPos.y - 10;
        const minAllowedHeight = Math.min(maxHeight, calculatedNeededH);
        newHeight = Math.max(minAllowedHeight, Math.min(maxHeight, proposedHeight));
      }

      setMenuHeight(Math.round(newHeight));
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      setTimeout(() => {
        isResizingDrawerRef.current = false;
        setIsInteracting(false);
      }, 50);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const loadTree = async (preferredNodeId?: string) => {
    try {
      const data = await fetchTree();
      setTree(data);

      const curWsId = activeWorkspaceIdRef.current || activeWorkspaceId;
      const curActiveNodeId = activeNodeIdRef.current || activeNodeId;

      let targetId = '';
      if (preferredNodeId && findNodeById(data, preferredNodeId)) {
        targetId = preferredNodeId;
      } else if (curActiveNodeId && findNodeById(data, curActiveNodeId)) {
        targetId = curActiveNodeId;
      } else {
        const curWs = workspaces.find(w => w.id === curWsId);
        if (curWs && curWs.nodeId && findNodeById(data, curWs.nodeId)) {
          targetId = curWs.nodeId;
        } else {
          const historyNodeId = window.history.state?.nodeId;
          if (historyNodeId && findNodeById(data, historyNodeId)) {
            targetId = historyNodeId;
          } else if (data.length > 0) {
            targetId = data[0].id;
          }
        }
      }

      if (targetId) {
        setActiveNodeId(targetId);
        activeNodeIdRef.current = targetId;
        setWorkspaces(prev => {
          const updated = prev.map(ws => {
            if (ws.id === curWsId) {
              return {
                ...ws,
                nodeId: targetId,
                history: ws.history.length === 0 ? [targetId] : ws.history,
              };
            }
            if ((!ws.nodeId || !findNodeById(data, ws.nodeId)) && data.length > 0) {
              return {
                ...ws,
                nodeId: data[0].id,
                history: ws.history.length === 0 ? [data[0].id] : ws.history,
              };
            }
            return ws;
          });
          try {
            localStorage.setItem('fmsort_workspaces', JSON.stringify(updated));
          } catch {}
          return updated;
        });
        window.history.replaceState({ nodeId: targetId, workspaceId: curWsId }, '', window.location.pathname);
      }
    } catch (err) {
      console.error('Failed to load library:', err);
    } finally {
      setLoading(false);
    }
  };

  // Browser Back/Forward navigation without URL slugs
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const targetWsId = e.state?.workspaceId;
      if (targetWsId && workspaces.some(w => w.id === targetWsId)) {
        setActiveWorkspaceId(targetWsId);
      }
      const targetId = e.state?.nodeId;
      if (targetId) {
        const targetNode = findNodeById(tree, targetId);
        if (targetNode) {
          selectNode(targetNode, false);
          return;
        }
      }
      if (tree.length > 0) {
        selectNode(tree[0], false);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [tree, workspaces]);

  useEffect(() => {
    loadTree();
    fetchSettings()
      .then(s => {
        if (typeof s.statusEnabled === 'boolean') {
          setStatusEnabled(s.statusEnabled);
          try {
            localStorage.setItem('fmsort_status_enabled', String(s.statusEnabled));
          } catch {}
        }
        if (Array.isArray(s.completedAlbumKeys)) {
          setCompletedAlbumKeys(new Set(s.completedAlbumKeys));
          try {
            localStorage.setItem('fmsort_completed_album_keys', JSON.stringify(s.completedAlbumKeys));
          } catch {}
        }
        if (Array.isArray(s.completionFolderIds)) {
          setCompletionFolderIds(new Set(s.completionFolderIds));
          try {
            localStorage.setItem('fmsort_completion_folder_ids', JSON.stringify(s.completionFolderIds));
          } catch {}
        }
      })
      .catch(err => console.warn('Could not load settings:', err));
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
      if (isDraggingMenuRef.current || isResizingDrawerRef.current || isDraggingWsRef.current) return;
      if (addMusicRef.current && !addMusicRef.current.contains(e.target as Node)) {
        setAddMusicMenuOpen(false);
      }
      if (columnMenuRef.current && !columnMenuRef.current.contains(e.target as Node)) {
        setColumnMenuOpen(false);
      }
      if (!isMenuPinnedRef.current && treeDropdownOpen) {
        const isClickInsideLib = dropdownContainerRef.current?.contains(e.target as Node);
        const isClickInsideDock = workspacesDockRef.current?.contains(e.target as Node);
        if (!isClickInsideLib && !isClickInsideDock) {
          setTreeDropdownOpen(false);
        }
      }
      if (
        workspacePickerRef.current &&
        !workspacePickerRef.current.contains(e.target as Node) &&
        !workspaceAddContainerRef.current?.contains(e.target as Node)
      ) {
        setWorkspacePickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [treeDropdownOpen]);

  // Keyboard shortcuts for Command Palette, Back navigation, and Workspace Dock
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 't') {
        e.preventDefault();
        setWorkspacePickerOpen(prev => !prev);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        closeWorkspace(activeWorkspaceId);
      } else if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        const currentIdx = workspaces.findIndex(w => w.id === activeWorkspaceId);
        const nextIdx = e.shiftKey
          ? (currentIdx - 1 + workspaces.length) % workspaces.length
          : (currentIdx + 1) % workspaces.length;
        if (workspaces[nextIdx]) switchWorkspace(workspaces[nextIdx].id);
      } else if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key >= '1' && e.key <= '9') {
        const targetIdx = parseInt(e.key, 10) - 1;
        if (targetIdx < workspaces.length) {
          e.preventDefault();
          switchWorkspace(workspaces[targetIdx].id);
        }
      } else if (e.key === 'Escape') {
        if (!isMenuPinnedRef.current) {
          setTreeDropdownOpen(false);
        }
        setWorkspacePickerOpen(false);
        setSelectedTrackIds(new Set());
        setSelectedNodeIds(new Set());
        setSelectMultipleMode(false);
        setContextMenu(prev => ({ ...prev, isOpen: false }));
        setImportModalOpen(false);
        setTuneImportOpen(false);
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
        (e.key === 'Backspace' || (e.altKey && e.key === 'ArrowLeft') || e.key === '[') &&
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
  }, [activeNodeId, activePath, workspaces, activeWorkspaceId]);


  const handleOpenTuneImport = (node?: LibraryNode | null) => {
    setTuneImportTargetNode(node || selectedNode || activeNode || null);
    setTuneImportOpen(true);
  };

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

    // Folders never pull ambient backdrop from child album cover art (funky generative backdrop instead)
    if (activeNode.type === 'Folder') {
      setHeroBackdrop(null);
      return;
    }

    if (activeNode.type !== 'Album' && activeNode.type !== 'Artist' && activeNode.type !== 'Playlist') {
      setHeroBackdrop(null);
      return;
    }

    // When completion tracking is active for this album, uncompleted albums do not display their ambient backdrop
    const activeArtist = activeNode.tracks?.[0]?.a || (activePath.length > 1 && activePath[activePath.length - 2]?.type === 'Artist' ? activePath[activePath.length - 2].name : '');
    const isActiveAlbumCompleted = isAlbumCompleted(activeArtist, activeNode.name, completedAlbumKeys);
    if (isNodeCompletionEnabled(activeNode.id) && activeNode.type === 'Album' && !isActiveAlbumCompleted) {
      setHeroBackdrop(null);
      return;
    }

    // 1. Initial immediate backdrop from node's cover or track's cover
    const immediateCover = activeNode.cover_url || activeNode.tracks?.[0]?.cover_url || null;
    setHeroBackdrop(immediateCover);

    // 2. Fetch bigger art from Discogs
    const queryType = activeNode.type === 'Artist' ? 'artist' : 'release';
    const cleanQueryName = activeNode.name.replace(/\s*[\(\[](?:(?:\d{4}\s+)?(?:digital|master|remaster(?:ed)?|deluxe|anniversary|expanded|bonus|edition|version|reissue|definitive|mono|stereo|special|collector'?s|live|explicit|clean|vinyl|lp|cd|single|ep)[\s\w-]*|(?:\d{4}))[\)\]].*$/i, '').trim() || activeNode.name;
    fetchDiscogsArtwork(cleanQueryName, queryType)
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
  }, [activeNode?.id, activeNode?.name, activeNode?.type, activeNode?.cover_url, isNodeCompletionEnabled, completedAlbumKeys]);

  // Reset artist profile and suggestions state on container change (auto-collapsed by default)
  useEffect(() => {
    setArtistInfoExpanded(false);
    setShowArtistSuggestions(false);
    setArtistProfile(null);
    setLoadingProfile(false);
  }, [activeNode?.id]);

  const handleToggleArtistInfo = async () => {
    const next = !artistInfoExpanded;
    setArtistInfoExpanded(next);

    // Only load from network at the point in time the user uncollapses it
    if (next && !artistProfile && !loadingProfile && activeNode?.name) {
      setLoadingProfile(true);
      try {
        const profile = await fetchArtistProfile(activeNode.name);
        setArtistProfile(profile);
        if (profile?.backdropUrl && !activeNode.cover_url) {
          setHeroBackdrop(profile.backdropUrl);
        }
      } catch (err) {
        console.warn('Failed to load artist profile:', err);
      } finally {
        setLoadingProfile(false);
      }
    }
  };

  // Context Menu Trigger Handlers
  const handleTrackContextMenu = (e: React.MouseEvent, track: Track) => {
    if (e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();

    const isMulti = selectedTrackIds.has(track.id) && selectedTrackIds.size > 1;
    let activeTrackSelection = selectedTrackIds;
    if (!selectedTrackIds.has(track.id) && !isMulti) {
      activeTrackSelection = new Set([track.id]);
      setSelectedTrackIds(activeTrackSelection);
    }

    const currentSelectedTracks = activeFlatTracks.filter(t => activeTrackSelection.has(t.id));

    setContextMenu({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      target: {
        type: 'track',
        track,
        isMulti,
        count: isMulti ? activeTrackSelection.size : 1,
        selectedTracks: currentSelectedTracks.length > 0 ? currentSelectedTracks : [track],
      },
    });
  };

  const handleNodeContextMenu = (e: React.MouseEvent, node: LibraryNode) => {
    e.preventDefault();
    e.stopPropagation();

    const isMulti = selectedNodeIds.has(node.id) && selectedNodeIds.size > 1;
    let activeSelection = selectedNodeIds;
    if (!selectedNodeIds.has(node.id) && !isMulti) {
      activeSelection = new Set([node.id]);
      setSelectedNodeIds(activeSelection);
    }

    const currentSelectedNodes = Array.from(activeSelection)
      .map(id => findNodeById(tree, id))
      .filter((n): n is LibraryNode => Boolean(n));

    setContextMenu({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      target: {
        type: 'node',
        node,
        isMulti,
        count: isMulti ? activeSelection.size : 1,
        selectedNodes: currentSelectedNodes,
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

  const handleBatchDeleteNodesAction = async (nodesToDelete: LibraryNode[]) => {
    if (nodesToDelete.length === 0) return;
    if (!confirm(`Delete ${nodesToDelete.length} selected containers and all their contents?`)) return;
    try {
      await Promise.all(nodesToDelete.map(n => deleteNode(n.id)));
      showToast(`Deleted ${nodesToDelete.length} containers`);
      setSelectedNodeIds(new Set());
      await loadTree();
    } catch {
      showToast('Failed to delete containers');
    }
  };

  const handleImportArtistDiscographyAction = async (targetNodes: LibraryNode[]) => {
    const artists = targetNodes.filter(n => n.type === 'Artist');
    if (artists.length === 0) return;

    if (artists.length === 1) {
      showToast(`Importing complete discography for "${artists[0].name}"...`);
    } else {
      showToast(`Importing complete discographies for ${artists.length} artists...`);
    }

    try {
      const res = await importArtistDiscography({
        artistNodeIds: artists.map(a => a.id),
      });

      if (res.importedAlbums > 0) {
        showToast(`Imported ${res.importedAlbums} albums & ${res.importedTracks} tracks for ${artists.length === 1 ? `"${artists[0].name}"` : `${res.artistsProcessed} artists`}!`);
      } else {
        showToast(`Discography up-to-date. No new releases found.`);
      }

      // Auto-expand the artist nodes so user immediately sees the new subfolders!
      setOpenNodes(prev => {
        const next = { ...prev };
        artists.forEach(a => {
          next[a.id] = true;
        });
        return next;
      });

      await loadTree(activeNodeId || undefined);
    } catch (err: any) {
      showToast(err?.message || 'Failed to import discography');
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

  const handleBatchRefreshArtworkAction = async (nodes: LibraryNode[]) => {
    if (nodes.length === 0) return;
    showToast(`Searching Discogs artwork for ${nodes.length} containers...`);
    let updated = 0;
    for (const node of nodes) {
      try {
        const art = await fetchDiscogsArtwork(node.name, node.type === 'Artist' ? 'artist' : 'release');
        if (art && art.cover_image) {
          await updateNode(node.id, { cover_url: art.cover_image });
          updated++;
        }
      } catch {
        // Continue with others
      }
    }
    showToast(`Updated artwork for ${updated} / ${nodes.length} containers`);
    await loadTree(activeNodeId || undefined);
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

  const handleBatchResolveNodeIsrcsAction = async (nodes: LibraryNode[]) => {
    if (nodes.length === 0) return;
    const allTracks = nodes.flatMap(n => flattenTracks(n));
    const missing = allTracks.filter(t => !t.isrc || t.isrc === '—').map(t => t.id);
    if (missing.length === 0) {
      showToast(`All tracks in the ${nodes.length} selected containers already have ISRCs`);
      return;
    }
    showToast(`Resolving ${missing.length} missing ISRCs across ${nodes.length} containers...`);
    try {
      const res = await enrichAllIsrcs(missing);
      showToast(`Resolved ${res.updatedCount} ISRCs`);
      await loadTree(activeNodeId || undefined);
    } catch {
      showToast('Failed to resolve ISRCs');
    }
  };

  // Settings & Status Tracking Handlers
  const handleToggleStatus = async (enabled: boolean) => {
    setStatusEnabled(enabled);
    try {
      localStorage.setItem('fmsort_status_enabled', String(enabled));
    } catch {}
    try {
      await saveSettings({ statusEnabled: enabled });
      showToast(enabled ? 'Album Completion Status enabled' : 'Album Completion Status disabled');
    } catch (e) {
      console.error(e);
    }
  };

  const handleResetCompleted = async () => {
    setCompletedAlbumKeys(new Set());
    try {
      localStorage.removeItem('fmsort_completed_album_keys');
    } catch {}
    try {
      await saveSettings({ completedAlbumKeys: [] });
      showToast('Cleared all completed albums');
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleAlbumCompleted = async (artistName?: string, albumName?: string, targetCompleted?: boolean) => {
    if (!albumName) return;
    const keys = getAlbumKeys(artistName, albumName);
    if (keys.length === 0) return;

    const currentCompleted = isAlbumCompleted(artistName, albumName, completedAlbumKeys);
    const newCompleted = targetCompleted !== undefined ? targetCompleted : !currentCompleted;

    const nextSet = new Set(completedAlbumKeys);
    keys.forEach(k => {
      if (newCompleted) nextSet.add(k);
      else nextSet.delete(k);
    });
    setCompletedAlbumKeys(nextSet);
    try {
      localStorage.setItem('fmsort_completed_album_keys', JSON.stringify(Array.from(nextSet)));
    } catch {}

    try {
      const res = await toggleAlbumsCompleted(keys, newCompleted);
      if (res.completedAlbumKeys) {
        setCompletedAlbumKeys(new Set(res.completedAlbumKeys));
      }
      showToast(newCompleted ? `Marked "${albumName}" as completed` : `Marked "${albumName}" as incomplete`);
    } catch (err) {
      console.error('Failed to update album status:', err);
    }
  };

  const handleBatchToggleAlbumsCompleted = async (albums: { artist?: string; album: string }[], completed: boolean) => {
    const allKeys: string[] = [];
    albums.forEach(a => {
      getAlbumKeys(a.artist, a.album).forEach(k => allKeys.push(k));
    });
    if (allKeys.length === 0) return;

    const nextSet = new Set(completedAlbumKeys);
    allKeys.forEach(k => {
      if (completed) nextSet.add(k);
      else nextSet.delete(k);
    });
    setCompletedAlbumKeys(nextSet);
    try {
      localStorage.setItem('fmsort_completed_album_keys', JSON.stringify(Array.from(nextSet)));
    } catch {}

    try {
      const res = await toggleAlbumsCompleted(allKeys, completed);
      if (res.completedAlbumKeys) {
        setCompletedAlbumKeys(new Set(res.completedAlbumKeys));
      }
      showToast(completed ? `Marked ${albums.length} album(s) as completed` : `Marked ${albums.length} album(s) as incomplete`);
    } catch (err) {
      console.error('Failed to batch update album status:', err);
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
    // Sub-containers (artists, albums, subfolders) are collapsed by default so folder and artist pages stay clean and organized
    return true;
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

  // Copy & Paste Handlers for Tracks & Containers
  const copyToOsClipboard = (text: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).catch(() => {});
      }
    } catch {}
  };

  const copySelectedItems = (
    operation: 'copy' | 'cut' = 'copy',
    specificTracks?: Track[],
    specificNode?: LibraryNode,
    specificNodes?: LibraryNode[]
  ) => {
    // 1. Specific nodes provided (e.g. from multi-node context menu)
    if (specificNodes && specificNodes.length > 0) {
      const nodeIds = specificNodes.map(n => n.id);
      const label = specificNodes.length === 1 ? `"${specificNodes[0].name}"` : `${specificNodes.length} containers`;
      const newClip: ClipboardState = {
        operation,
        type: 'nodes',
        nodeIds,
        count: specificNodes.length,
        label,
      };
      setClipboard(newClip);
      copyToOsClipboard(specificNodes.map(n => n.name).join('\n'));
      showToast(`${operation === 'cut' ? 'Cut' : 'Copied'} ${label}`);
      return;
    }

    // 2. Specific single node provided (e.g. from context menu)
    if (specificNode) {
      const newClip: ClipboardState = {
        operation,
        type: 'nodes',
        nodeIds: [specificNode.id],
        count: 1,
        label: `"${specificNode.name}"`,
      };
      setClipboard(newClip);
      copyToOsClipboard(specificNode.name);
      showToast(`${operation === 'cut' ? 'Cut' : 'Copied'} "${specificNode.name}"`);
      return;
    }

    // 3. Specific tracks provided (e.g. from context menu)
    if (specificTracks && specificTracks.length > 0) {
      const trackIds = specificTracks.map(t => t.id);
      const label = specificTracks.length === 1 ? `"${specificTracks[0].t}"` : `${specificTracks.length} tracks`;
      const newClip: ClipboardState = {
        operation,
        type: 'tracks',
        trackIds,
        count: specificTracks.length,
        label,
      };
      setClipboard(newClip);
      copyToOsClipboard(specificTracks.map(t => `${t.a} - ${t.t}`).join('\n'));
      showToast(`${operation === 'cut' ? 'Cut' : 'Copied'} ${label}`);
      return;
    }

    // 4. Selection of tracks
    if (selectedTrackIds.size > 0) {
      const trackIds = Array.from(selectedTrackIds);
      const tracks = allLibraryTracks.filter(t => selectedTrackIds.has(t.id));
      const label = trackIds.length === 1
        ? `"${tracks[0]?.t || 'Track'}"`
        : `${trackIds.length} tracks`;
      const newClip: ClipboardState = {
        operation,
        type: 'tracks',
        trackIds,
        count: trackIds.length,
        label,
      };
      setClipboard(newClip);
      copyToOsClipboard(tracks.map(t => `${t.a} - ${t.t}`).join('\n'));
      showToast(`${operation === 'cut' ? 'Cut' : 'Copied'} ${label}`);
      return;
    }

    // 5. Selection of nodes
    if (selectedNodeIds.size > 0) {
      const nodeIds = Array.from(selectedNodeIds);
      const nodes = nodeIds.map(id => findNodeById(tree, id)).filter(Boolean) as LibraryNode[];
      const label = nodeIds.length === 1
        ? `"${nodes[0]?.name || 'Container'}"`
        : `${nodeIds.length} containers`;
      const newClip: ClipboardState = {
        operation,
        type: 'nodes',
        nodeIds,
        count: nodeIds.length,
        label,
      };
      setClipboard(newClip);
      copyToOsClipboard(nodes.map(n => n.name).join('\n'));
      showToast(`${operation === 'cut' ? 'Cut' : 'Copied'} ${label}`);
      return;
    }

    // 6. Active focused track
    if (activeTrack) {
      const newClip: ClipboardState = {
        operation,
        type: 'tracks',
        trackIds: [activeTrack.id],
        count: 1,
        label: `"${activeTrack.t}"`,
      };
      setClipboard(newClip);
      copyToOsClipboard(`${activeTrack.a} - ${activeTrack.t}`);
      showToast(`${operation === 'cut' ? 'Cut' : 'Copied'} "${activeTrack.t}"`);
      return;
    }

    // 7. Active node
    if (activeNode) {
      const newClip: ClipboardState = {
        operation,
        type: 'nodes',
        nodeIds: [activeNode.id],
        count: 1,
        label: `"${activeNode.name}"`,
      };
      setClipboard(newClip);
      copyToOsClipboard(activeNode.name);
      showToast(`${operation === 'cut' ? 'Cut' : 'Copied'} "${activeNode.name}"`);
      return;
    }

    showToast('Nothing selected to copy');
  };

  const pasteClipboard = async (targetNodeId?: string) => {
    if (!clipboard) {
      showToast('Clipboard is empty');
      return;
    }

    // Target node resolution:
    // 1. Explicit targetNodeId provided (e.g. from context menu)
    // 2. Currently selected container (selectedNode)
    // 3. Container of currently selected track (firstSelectedTrack?.node_id)
    // 4. Active container (activeNode)
    const targetNode =
      (targetNodeId && findNodeById(tree, targetNodeId)) ||
      (selectedNode) ||
      (firstSelectedTrack?.node_id && findNodeById(tree, firstSelectedTrack.node_id)) ||
      activeNode ||
      (tree.length > 0 ? tree[0] : null);

    if (!targetNode) {
      showToast('No folder open to paste into');
      return;
    }

    // Cyclical prevention for containers
    if (clipboard.type === 'nodes' && clipboard.nodeIds) {
      const isSelfOrDescendant = clipboard.nodeIds.some(
        id => id === targetNode.id || isDescendant(tree, id, targetNode.id)
      );
      if (isSelfOrDescendant) {
        showToast('Cannot paste a container into itself or its own subfolder');
        return;
      }
    }

    try {
      const res = await pasteItems({
        targetNodeId: targetNode.id,
        trackIds: clipboard.trackIds,
        nodeIds: clipboard.nodeIds,
        operation: clipboard.operation,
      });

      const isCut = clipboard.operation === 'cut';
      const actionWord = isCut ? 'Moved' : 'Pasted';
      showToast(`${actionWord} ${clipboard.label} into "${targetNode.name}"`);

      // Uncollapse the target container so the pasted items are immediately visible in the list UI
      setCollapsedSections(prev => ({ ...prev, [targetNode.id]: false }));

      if (isCut) {
        setClipboard(null);
      }

      // Highlight/select newly pasted items in the list UI
      if (res.newTrackIds && res.newTrackIds.length > 0) {
        setSelectedTrackIds(new Set(res.newTrackIds));
        setSelectedNodeIds(new Set());
      } else if (res.newNodeIds && res.newNodeIds.length > 0) {
        setSelectedNodeIds(new Set(res.newNodeIds));
        setSelectedTrackIds(new Set());
      }

      // Reload tree keeping the user on their active view
      await loadTree(activeNodeId || targetNode.id);
    } catch (err: any) {
      showToast(err?.message || 'Failed to paste items');
    }
  };

  // Universal Drag & Drop Handlers (Tracks & Containers)
  const clearDragState = () => {
    if (dragHoverTimeoutRef.current) {
      clearTimeout(dragHoverTimeoutRef.current);
      dragHoverTimeoutRef.current = null;
    }
    isSwitchingWorkspaceDragRef.current = false;
    draggedTracksRef.current = [];
    draggedNodesRef.current = [];
    setDraggingTrackIds([]);
    setDraggingNodeId(null);
    setDraggingNodeIds([]);
    setDropTargetNodeId(null);
    setIsWorkspaceDropTarget(null);
  };

  const getDraggedTrackIds = (e?: React.DragEvent): number[] => {
    if (draggedTracksRef.current.length > 0) return draggedTracksRef.current;
    if (draggingTrackIds.length > 0) return draggingTrackIds;
    if (e && e.dataTransfer) {
      try {
        const raw = e.dataTransfer.getData('text/fmsort-tracks');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {}
    }
    return [];
  };

  const getDraggedNodeIds = (e?: React.DragEvent): string[] => {
    if (draggedNodesRef.current.length > 0) return draggedNodesRef.current;
    if (draggingNodeIds.length > 0) return draggingNodeIds;
    if (draggingNodeId) return [draggingNodeId];
    if (e && e.dataTransfer) {
      try {
        const raw = e.dataTransfer.getData('text/fmsort-nodes');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
        const single = e.dataTransfer.getData('text/fmsort-node');
        if (single) return [single];
      } catch {}
    }
    return [];
  };

  const handleTrackDragStart = (e: React.DragEvent, track: Track) => {
    e.stopPropagation();
    const ids = selectedTrackIds.has(track.id) ? Array.from(selectedTrackIds) : [track.id];
    setDraggingTrackIds(ids);
    draggedTracksRef.current = ids;
    setDraggingNodeId(null);
    setDraggingNodeIds([]);
    draggedNodesRef.current = [];
    e.dataTransfer.setData('text/fmsort-type', 'tracks');
    e.dataTransfer.setData('text/fmsort-tracks', JSON.stringify(ids));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleNodeDragStart = (e: React.DragEvent, node: LibraryNode) => {
    e.stopPropagation();
    const ids = selectedNodeIds.has(node.id) ? Array.from(selectedNodeIds) : [node.id];
    if (!selectedNodeIds.has(node.id)) {
      setSelectedNodeIds(new Set([node.id]));
    }
    setDraggingNodeIds(ids);
    setDraggingNodeId(node.id);
    draggedNodesRef.current = ids;
    setDraggingTrackIds([]);
    draggedTracksRef.current = [];
    e.dataTransfer.setData('text/fmsort-type', 'node');
    e.dataTransfer.setData('text/fmsort-nodes', JSON.stringify(ids));
    e.dataTransfer.setData('text/fmsort-node', node.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    if (isSwitchingWorkspaceDragRef.current) {
      // Ignore synthetic dragend fired when workspace unmounts old table rows
      return;
    }
    clearDragState();
  };

  const handleNodeDragOver = (e: React.DragEvent, targetNode: LibraryNode) => {
    const isSelfOrDescendant = draggingNodeIds.some(
      id => id === targetNode.id || isDescendant(tree, id, targetNode.id)
    ) || (draggedNodesRef.current.some(
      id => id === targetNode.id || isDescendant(tree, id, targetNode.id)
    ));
    if (isSelfOrDescendant) {
      return;
    }
    const hasTracks = draggingTrackIds.length > 0 || draggedTracksRef.current.length > 0 || e.dataTransfer.types.includes('text/fmsort-tracks');
    const hasNodes = draggingNodeIds.length > 0 || draggingNodeId || draggedNodesRef.current.length > 0 || e.dataTransfer.types.includes('text/fmsort-nodes');
    if (hasTracks || hasNodes) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      setDropTargetNodeId(targetNode.id);
    }
  };

  const handleNodeDragLeave = (e: React.DragEvent, targetNode: LibraryNode) => {
    e.preventDefault();
    e.stopPropagation();
    const currentTarget = e.currentTarget as HTMLElement;
    const related = e.relatedTarget as Node | null;
    if (related && currentTarget.contains(related)) {
      return;
    }
    if (dropTargetNodeId === targetNode.id) {
      setDropTargetNodeId(null);
    }
  };

  const handleNodeDrop = async (e: React.DragEvent, targetNode: LibraryNode) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTargetNodeId(null);

    const trackIds = getDraggedTrackIds(e);
    const nodeIds = getDraggedNodeIds(e);

    // 1. Moving tracks into this container
    if (trackIds.length > 0) {
      try {
        await moveTracksBatch(trackIds, targetNode.id);
        showToast(`Moved ${trackIds.length} track${trackIds.length > 1 ? 's' : ''} into "${targetNode.name}"`);
        clearDragState();
        setSelectedTrackIds(new Set());
        await loadTree(activeNode?.id);
      } catch (err: any) {
        showToast(err?.message || 'Failed to move tracks');
        clearDragState();
      }
      return;
    }

    // 2. Moving / Sorting containers (Folder, Album, Artist, etc.)
    if (nodeIds.length > 0) {
      const validIds = nodeIds.filter(
        id => id !== targetNode.id && !isDescendant(tree, id, targetNode.id)
      );
      if (validIds.length === 0) {
        showToast('Cannot move a container into its own subfolder');
        clearDragState();
        return;
      }

      // 2A. Pinned Crates Reordering: If both source and target are pinned, reorder in pinned list
      if (validIds.length === 1 && pinnedCrateIds.includes(validIds[0]) && pinnedCrateIds.includes(targetNode.id)) {
        const sourceId = validIds[0];
        const sourcePinnedIdx = pinnedCrateIds.indexOf(sourceId);
        const targetPinnedIdx = pinnedCrateIds.indexOf(targetNode.id);
        if (sourcePinnedIdx !== -1 && targetPinnedIdx !== -1 && sourcePinnedIdx !== targetPinnedIdx) {
          const newPinned = [...pinnedCrateIds];
          const [removed] = newPinned.splice(sourcePinnedIdx, 1);
          newPinned.splice(targetPinnedIdx, 0, removed);
          setPinnedCrateIds(newPinned);
          try {
            localStorage.setItem('fmsort_pinned_crates', JSON.stringify(newPinned));
          } catch {}
          const sourceNode = findNodeById(tree, sourceId);
          showToast(`Reordered "${sourceNode?.name || 'crate'}"`);
          clearDragState();
          setSelectedNodeIds(new Set());
          return;
        }
      }

      // 2B. Sibling Crates Reordering: If source and target share the same parent, sort by moving
      if (validIds.length === 1 && !e.altKey) {
        const sourceId = validIds[0];
        const sourceNode = findNodeById(tree, sourceId);
        if (sourceNode && (sourceNode.parent_id || null) === (targetNode.parent_id || null)) {
          const parent = targetNode.parent_id ? findNodeById(tree, targetNode.parent_id) : null;
          const siblings = parent ? (parent.children || []) : tree;
          const sourceIdx = siblings.findIndex(s => s.id === sourceNode.id);
          const targetIdx = siblings.findIndex(s => s.id === targetNode.id);

          if (sourceIdx !== -1 && targetIdx !== -1 && sourceIdx !== targetIdx) {
            const reordered = [...siblings];
            const [removed] = reordered.splice(sourceIdx, 1);
            reordered.splice(targetIdx, 0, removed);

            try {
              await Promise.all(
                reordered.map((node, newOrder) => updateNode(node.id, { sort_order: newOrder }))
              );
              await loadTree(activeNodeId);
              showToast(`Reordered "${sourceNode.name}"`);
              clearDragState();
              setSelectedNodeIds(new Set());
              return;
            } catch (err: any) {
              console.warn('Failed to reorder siblings:', err);
            }
          }
        }
      }

      // 2C. Moving into target container (different parent or holding Alt)
      try {
        await Promise.all(validIds.map(id => updateNode(id, { parent_id: targetNode.id })));
        const label = validIds.length === 1
          ? `"${findNodeById(tree, validIds[0])?.name || 'Container'}"`
          : `${validIds.length} containers`;
        showToast(`Moved ${label} into "${targetNode.name}"`);
        clearDragState();
        setSelectedNodeIds(new Set());
        await loadTree(activeNode?.id);
      } catch (err: any) {
        showToast(err?.message || 'Failed to move container');
        clearDragState();
      }
      return;
    }

    clearDragState();
  };

  const handleEmptySpaceDragOver = (e: React.DragEvent) => {
    const hasTracks = draggingTrackIds.length > 0 || draggedTracksRef.current.length > 0 || e.dataTransfer.types.includes('text/fmsort-tracks');
    const hasNodes = draggingNodeIds.length > 0 || draggingNodeId || draggedNodesRef.current.length > 0 || e.dataTransfer.types.includes('text/fmsort-nodes');
    if (hasTracks || hasNodes) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dropTargetNodeId !== 'empty-space') {
        setDropTargetNodeId('empty-space');
      }
    }
  };

  const handleEmptySpaceDragLeave = (e: React.DragEvent) => {
    const currentTarget = e.currentTarget as HTMLElement;
    const related = e.relatedTarget as Node | null;
    if (!related || !currentTarget.contains(related)) {
      if (dropTargetNodeId === 'empty-space') {
        setDropTargetNodeId(null);
      }
    }
  };

  const handleEmptySpaceDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTargetNodeId(null);

    const targetNode = activeNode || (tree.length > 0 ? tree[0] : null);
    if (!targetNode) {
      showToast('No active folder open to drop into');
      clearDragState();
      return;
    }

    const trackIds = getDraggedTrackIds(e);
    const nodeIds = getDraggedNodeIds(e);

    // 1. Moving tracks into active folder (loose / uncategorized inside active folder)
    if (trackIds.length > 0) {
      try {
        // Exclude tracks that already belong directly to targetNode
        const alreadyInTarget = allLibraryTracks.filter(
          t => trackIds.includes(t.id) && t.node_id === targetNode.id
        );
        const idsToMove = trackIds.filter(
          id => !alreadyInTarget.some(t => t.id === id)
        );

        if (idsToMove.length === 0) {
          showToast(`Track${trackIds.length > 1 ? 's are' : ' is'} already in "${targetNode.name}"`);
          clearDragState();
          return;
        }

        await moveTracksBatch(idsToMove, targetNode.id);
        const count = idsToMove.length;
        showToast(`Moved ${count} track${count > 1 ? 's' : ''} into "${targetNode.name}"`);
        clearDragState();
        setSelectedTrackIds(new Set());
        await loadTree(targetNode.id);
      } catch (err: any) {
        showToast(err?.message || 'Failed to move tracks into folder');
        clearDragState();
      }
      return;
    }

    // 2. Moving containers into active folder
    if (nodeIds.length > 0) {
      const validIds = nodeIds.filter(
        id => id !== targetNode.id && !isDescendant(tree, id, targetNode.id)
      );
      if (validIds.length === 0) {
        showToast('Cannot move a container into itself or its own subfolder');
        clearDragState();
        return;
      }

      // Filter out containers that are already direct children of targetNode
      const nodesToMove = validIds.filter(id => {
        const n = findNodeById(tree, id);
        return n && n.parent_id !== targetNode.id;
      });

      if (nodesToMove.length === 0) {
        showToast(`Container${validIds.length > 1 ? 's are' : ' is'} already in "${targetNode.name}"`);
        clearDragState();
        return;
      }

      try {
        await Promise.all(nodesToMove.map(id => updateNode(id, { parent_id: targetNode.id })));
        const label = nodesToMove.length === 1
          ? `"${findNodeById(tree, nodesToMove[0])?.name || 'Container'}"`
          : `${nodesToMove.length} containers`;
        showToast(`Moved ${label} into "${targetNode.name}"`);
        clearDragState();
        setSelectedNodeIds(new Set());
        await loadTree(targetNode.id);
      } catch (err: any) {
        showToast(err?.message || 'Failed to move container into folder');
        clearDragState();
      }
      return;
    }

    clearDragState();
  };

  const handleTrackClick = (track: Track, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedNodeIds(new Set());

    const visibleTracks = activeFlatTracks;

    // Shift-click contiguous range selection across tracks
    if (e.shiftKey && lastSelectedTrackIdRef.current !== null && visibleTracks.length > 0) {
      const lastIdx = visibleTracks.findIndex(t => t.id === lastSelectedTrackIdRef.current);
      const currIdx = visibleTracks.findIndex(t => t.id === track.id);

      if (lastIdx !== -1 && currIdx !== -1) {
        const start = Math.min(lastIdx, currIdx);
        const end = Math.max(lastIdx, currIdx);
        const rangeTracks = visibleTracks.slice(start, end + 1);
        const rangeIds = rangeTracks.map(t => t.id);

        setSelectedTrackIds(prev => {
          const next = (e.metaKey || e.ctrlKey) ? new Set(prev) : new Set<number>();
          rangeIds.forEach(id => next.add(id));
          return next;
        });
        return;
      }
    }

    lastSelectedTrackIdRef.current = track.id;

    if (selectMultipleMode || e.shiftKey || e.metaKey || e.ctrlKey) {
      setSelectedTrackIds(prev => {
        const next = new Set(prev);
        if (next.has(track.id)) next.delete(track.id);
        else next.add(track.id);
        return next;
      });
    } else {
      setSelectedTrackIds(prev => {
        if (prev.size === 1 && prev.has(track.id)) {
          return new Set();
        }
        return new Set([track.id]);
      });
    }
  };

  const handleNodeClick = (
    node: LibraryNode,
    hasSubItems: boolean,
    isCollapsed: boolean,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    setSelectedTrackIds(new Set());

    // Sibling range selection across visible child albums / containers
    const visibleSiblingNodes = activeNode?.children || [];

    if (e.shiftKey && lastSelectedNodeIdRef.current && visibleSiblingNodes.length > 0) {
      const lastIdx = visibleSiblingNodes.findIndex(n => n.id === lastSelectedNodeIdRef.current);
      const currIdx = visibleSiblingNodes.findIndex(n => n.id === node.id);

      if (lastIdx !== -1 && currIdx !== -1) {
        const start = Math.min(lastIdx, currIdx);
        const end = Math.max(lastIdx, currIdx);
        const rangeNodes = visibleSiblingNodes.slice(start, end + 1);
        const rangeIds = rangeNodes.map(n => n.id);

        setSelectedNodeIds(prev => {
          const next = (e.metaKey || e.ctrlKey) ? new Set(prev) : new Set<string>();
          rangeIds.forEach(id => next.add(id));
          return next;
        });
        return;
      }
    }

    lastSelectedNodeIdRef.current = node.id;

    if (selectMultipleMode || e.shiftKey || e.metaKey || e.ctrlKey) {
      setSelectedNodeIds(prev => {
        const next = new Set(prev);
        if (next.has(node.id)) next.delete(node.id);
        else next.add(node.id);
        return next;
      });
    } else {
      const wasAlreadySelectedOnly = selectedNodeIds.size === 1 && selectedNodeIds.has(node.id);
      setSelectedNodeIds(new Set([node.id]));
      if (wasAlreadySelectedOnly && hasSubItems) {
        toggleSectionCollapse(node.id, isCollapsed);
      }
    }
  };

  // Keyboard keybinds for selected items without right-clicking
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (
        importModalOpen ||
        tuneImportOpen ||
        commandPaletteOpen ||
        newContainerOpen ||
        newTrackOpen ||
        moveTracksOpen ||
        nodeEditOpen ||
        backupOpen ||
        settingsOpen ||
        columnMenuOpen
      ) {
        return;
      }

      // Settings Modal on ⌘, / Ctrl+,
      if ((e.metaKey || e.ctrlKey) && (e.key === ',' || e.key === '<')) {
        e.preventDefault();
        setSettingsOpen(true);
        return;
      }

      // Export / Backup on ⌘E / Ctrl+E
      if ((e.metaKey || e.ctrlKey) && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        setBackupOpen(true);
        return;
      }

      // Back navigation: Backspace (when nothing selected), Alt+Left, or '['
      if (
        (e.key === '[' || (e.altKey && e.key === 'ArrowLeft') || (e.key === 'Backspace' && selectedNodeIds.size === 0 && selectedTrackIds.size === 0))
      ) {
        e.preventDefault();
        handleGoBack();
        return;
      }

      // Forward navigation: Alt+Right or ']'
      if (e.key === ']' || (e.altKey && e.key === 'ArrowRight')) {
        e.preventDefault();
        window.history.forward();
        return;
      }

      // Quick filter focus on ⌘F / Ctrl+F
      if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        filterInputRef.current?.focus();
        return;
      }

      // Select All on ⌘A / Ctrl+A
      if ((e.metaKey || e.ctrlKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        const hasChildren = activeNode?.children && activeNode.children.length > 0;
        const hasTracks = activeFlatTracks.length > 0;

        if (hasChildren && (selectedNodeIds.size > 0 || selectedTrackIds.size === 0)) {
          setSelectedTrackIds(new Set());
          setSelectedNodeIds(new Set(activeNode.children.map(c => c.id)));
          showToast(`Selected all ${activeNode.children.length} containers`);
        } else if (hasTracks) {
          setSelectedNodeIds(new Set());
          setSelectedTrackIds(new Set(activeFlatTracks.map(t => t.id)));
          showToast(`Selected all ${activeFlatTracks.length} tracks`);
        }
        return;
      }

      // Deselect All on Escape
      if (e.key === 'Escape') {
        if (selectedNodeIds.size > 0 || selectedTrackIds.size > 0) {
          e.preventDefault();
          setSelectedNodeIds(new Set());
          setSelectedTrackIds(new Set());
        }
        return;
      }

      // Toggle Album Completion Status on 'c' / 'C'
      if (!e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 'c' || e.key === 'C')) {
        if (selectedNode && selectedNode.type === 'Album') {
          e.preventDefault();
          handleToggleAlbumCompleted(selectedNode.tracks?.[0]?.a, selectedNode.name);
          return;
        }
        if (firstSelectedTrack && firstSelectedTrack.al) {
          e.preventDefault();
          handleToggleAlbumCompleted(firstSelectedTrack.a, firstSelectedTrack.al);
          return;
        }
        if (activeNode && activeNode.type === 'Album') {
          e.preventDefault();
          const activeArtist = activeNode.tracks?.[0]?.a || (activePath.length > 1 && activePath[activePath.length - 2]?.type === 'Artist' ? activePath[activePath.length - 2].name : '');
          handleToggleAlbumCompleted(activeArtist, activeNode.name);
          return;
        }
      }

      // Create New Container on 'n' / 'N'
      if (!e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        setNewContainerOpen(true);
        return;
      }

      // Add Track Manually on 't' / 'T'
      if (!e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        setNewTrackOpen(true);
        return;
      }

      // Spacebar to inspect selected track
      if (e.key === ' ' && firstSelectedTrack) {
        e.preventDefault();
        setActiveTrack(firstSelectedTrack);
        return;
      }

      // Copy (⌘C / Ctrl+C)
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && (e.key === 'c' || e.key === 'C')) {
        const hasSelection = (window.getSelection()?.toString() || '').trim().length > 0;
        if (!hasSelection && (selectedTrackIds.size > 0 || selectedNodeIds.size > 0 || activeTrack || activeNode)) {
          e.preventDefault();
          copySelectedItems('copy');
          return;
        }
      }

      // Cut (⌘X / Ctrl+X)
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && (e.key === 'x' || e.key === 'X')) {
        const hasSelection = (window.getSelection()?.toString() || '').trim().length > 0;
        if (!hasSelection && (selectedTrackIds.size > 0 || selectedNodeIds.size > 0 || activeTrack || activeNode)) {
          e.preventDefault();
          copySelectedItems('cut');
          return;
        }
      }

      // Paste (⌘V / Ctrl+V)
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && (e.key === 'v' || e.key === 'V')) {
        if (clipboard) {
          e.preventDefault();
          pasteClipboard();
          return;
        }
      }

      // Toggle Workspace Dropdown: ⌘\ / Ctrl+\
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && (e.key === '\\' || e.code === 'Backslash')) {
        e.preventDefault();
        setWorkspaceDropdownOpen(prev => !prev);
        return;
      }

      // Library Drawer Keybind: '/' to open/close drawer, rapid double-tap to pin
      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key === '/') {
        e.preventDefault();
        const now = Date.now();
        const timeSinceLast = now - lastSlashTapTimeRef.current;

        if (timeSinceLast > 0 && timeSinceLast < 280) {
          // Double-tap: PIN drawer
          lastSlashTapTimeRef.current = 0;
          if (slashTapTimeoutRef.current) {
            clearTimeout(slashTapTimeoutRef.current);
            slashTapTimeoutRef.current = null;
          }
          setTreeDropdownOpen(true);
          setIsMenuPinned(prev => {
            const next = !prev;
            showToast(next ? 'Library pinned' : 'Library unpinned');
            return next;
          });
        } else {
          // Single-tap: Toggle drawer (open/close) unless double-tap follows
          lastSlashTapTimeRef.current = now;
          if (slashTapTimeoutRef.current) {
            clearTimeout(slashTapTimeoutRef.current);
          }
          slashTapTimeoutRef.current = setTimeout(() => {
            slashTapTimeoutRef.current = null;
            setTreeDropdownOpen(prev => !prev);
          }, 240);
        }
        return;
      }

      // Music Search & Add keybind: 'a' / 'A', 's' / 'S', or ⌘I / Ctrl+I
      const isSearchShortcut =
        (!e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 'a' || e.key === 'A' || e.key === 's' || e.key === 'S')) ||
        ((e.metaKey || e.ctrlKey) && (e.key === 'i' || e.key === 'I'));

      if (isSearchShortcut) {
        e.preventDefault();
        const targetId = selectedNode
          ? selectedNode.id
          : firstSelectedTrack
            ? (firstSelectedTrack.parent_id || 'uncategorized')
            : (activeNode?.id || 'uncategorized');
        setSearchInitialQuery('');
        setSearchInitialTargetNodeId(targetId);
        setImportModalOpen(true);
        return;
      }

      // Container (Node) Shortcuts
      if (selectedNodeIds.size > 0) {
        if (selectedNode) {
          if (e.key === 'Enter') {
            e.preventDefault();
            selectNode(selectedNode);
            return;
          }
          if (e.key === 'e' || e.key === 'E') {
            e.preventDefault();
            setNodeToEdit(selectedNode);
            setNodeEditOpen(true);
            return;
          }
          if (e.key === 'r' || e.key === 'R') {
            e.preventDefault();
            handleResolveNodeIsrcsAction(selectedNode);
            return;
          }
          if (e.key === 'a' || e.key === 'A') {
            e.preventDefault();
            setNewTrackOpen(true);
            return;
          }
        }
        if (e.key === 'Backspace' || e.key === 'Delete') {
          e.preventDefault();
          if (selectedNodeIds.size === 1 && selectedNode) {
            handleDeleteNodeAction(selectedNode);
          } else {
            const nodesToDelete = Array.from(selectedNodeIds)
              .map(id => findNodeById(tree, id))
              .filter((n): n is LibraryNode => Boolean(n));
            handleBatchDeleteNodesAction(nodesToDelete);
          }
          return;
        }
      }

      // Track Shortcuts
      if (selectedTrackIds.size > 0) {
        if (e.key === 'Enter' || e.key === 'e' || e.key === 'E') {
          if (firstSelectedTrack) {
            e.preventDefault();
            setActiveTrack(firstSelectedTrack);
          }
          return;
        }
        if (e.key === 'r' || e.key === 'R') {
          e.preventDefault();
          if (selectedTrackIds.size === 1 && firstSelectedTrack) {
            handleResolveIsrcAction(firstSelectedTrack);
          } else {
            handleBatchResolveIsrcAction();
          }
          return;
        }
        if (e.key === 'm' || e.key === 'M') {
          e.preventDefault();
          setMoveTracksOpen(true);
          return;
        }
        if (e.key === 'Backspace' || e.key === 'Delete') {
          e.preventDefault();
          if (selectedTrackIds.size === 1 && firstSelectedTrack) {
            handleDeleteTrackAction(firstSelectedTrack);
          } else {
            handleBatchDeleteTracksAction();
          }
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (slashTapTimeoutRef.current) {
        clearTimeout(slashTapTimeoutRef.current);
      }
    };
  }, [
    selectedNodeId,
    selectedNodeIds,
    selectedNode,
    selectedTrackIds,
    firstSelectedTrack,
    importModalOpen,
    tuneImportOpen,
    commandPaletteOpen,
    newContainerOpen,
    newTrackOpen,
    moveTracksOpen,
    nodeEditOpen,
    backupOpen,
    settingsOpen,
    columnMenuOpen,
    activeNode,
    activeNodeId,
    activePath,
    activeTrack,
    clipboard,
    workspacePickerOpen,
  ]);

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

  // Helper to sort container nodes (folders)
  const sortNodes = (nodes: LibraryNode[]): LibraryNode[] => {
    if (!sortConfig) return nodes;
    const { key, direction } = sortConfig;
    const mult = direction === 'asc' ? 1 : -1;

    return [...nodes].sort((a, b) => {
      let va: any = '';
      let vb: any = '';

      switch (key) {
        case 'title':
        case 'album':
          va = a.name.toLowerCase();
          vb = b.name.toLowerCase();
          break;
        case 'artist': {
          const artA = a.tracks?.[0]?.a || a.name;
          const artB = b.tracks?.[0]?.a || b.name;
          va = artA.toLowerCase();
          vb = artB.toLowerCase();
          break;
        }
        case 'year': {
          const ya = a.tracks?.[0]?.y || 0;
          const yb = b.tracks?.[0]?.y || 0;
          return (ya - yb) * mult;
        }
        case 'format':
          va = a.type.toLowerCase();
          vb = b.type.toLowerCase();
          break;
        case 'cat':
          va = (a.tracks?.[0]?.c || '').toLowerCase();
          vb = (b.tracks?.[0]?.c || '').toLowerCase();
          break;
        case 'len': {
          const la = flattenTracks(a).reduce((sum, t) => sum + (t.len || 0), 0);
          const lb = flattenTracks(b).reduce((sum, t) => sum + (t.len || 0), 0);
          return (la - lb) * mult;
        }
        default:
          va = a.name.toLowerCase();
          vb = b.name.toLowerCase();
          break;
      }

      if (va > vb) return 1 * mult;
      if (va < vb) return -1 * mult;
      return 0;
    });
  };

  // Deep search predicate for tracks across title, artist, album, cat, barcode, MBID, ISRC, etc.
  const trackMatches = (t: Track, query: string): boolean => {
    if (!query) return true;
    const q = query.toLowerCase();
    return Boolean(
      (t.t && t.t.toLowerCase().includes(q)) ||
      (t.a && t.a.toLowerCase().includes(q)) ||
      (t.al && t.al.toLowerCase().includes(q)) ||
      (t.c && t.c.toLowerCase().includes(q)) ||
      (t.bc && t.bc.toLowerCase().includes(q)) ||
      (t.mb && t.mb.toLowerCase().includes(q)) ||
      (t.isrc && t.isrc.toLowerCase().includes(q)) ||
      (t.f && t.f.toLowerCase().includes(q)) ||
      (t.key && t.key.toLowerCase().includes(q)) ||
      (t.y ? String(t.y).includes(q) : false) ||
      (t.bpm ? String(t.bpm).includes(q) : false)
    );
  };

  // Deep recursive search predicate for folders at any depth
  const nodeMatchesSearch = (node: LibraryNode, query: string): boolean => {
    if (!query) return true;
    const q = query.toLowerCase();
    if (node.name && node.name.toLowerCase().includes(q)) return true;
    if (node.type && node.type.toLowerCase().includes(q)) return true;
    if (node.tracks && node.tracks.some(t => trackMatches(t, q))) return true;
    if (node.children && node.children.some(child => nodeMatchesSearch(child, q))) return true;
    return false;
  };

  // Render tree node recursively in navigation submenu
  const renderTreeNode = (n: LibraryNode, depth: number) => {
    const hasChildren = n.children && n.children.length > 0;
    const isOpen = openNodes[n.id] ?? false;
    const isActive = activeNode?.id === n.id;
    const isSelected = selectedNodeIds.has(n.id);
    const isTarget = dropTargetNodeId === n.id;
    const isDragging = draggingNodeIds.includes(n.id) || draggingNodeId === n.id;
    const isPinned = pinnedCrateIds.includes(n.id);

    return (
      <React.Fragment key={n.id}>
        <div
          className={`n ${isActive ? 'on' : ''} ${isSelected ? 'is-selected' : ''} ${isTarget ? 'is-drop-target' : ''} ${isDragging ? 'is-dragging' : ''}`}
          style={{ paddingLeft: `${6 + depth * 14}px` }}
          onClick={(e) => {
            if (e.shiftKey && lastSelectedNodeIdRef.current) {
              e.stopPropagation();
              setSelectedTrackIds(new Set());
              const flatVisible = flattenVisibleTree(tree, openNodes);
              const lastIdx = flatVisible.findIndex(item => item.id === lastSelectedNodeIdRef.current);
              const currIdx = flatVisible.findIndex(item => item.id === n.id);
              if (lastIdx !== -1 && currIdx !== -1) {
                const start = Math.min(lastIdx, currIdx);
                const end = Math.max(lastIdx, currIdx);
                const rangeIds = flatVisible.slice(start, end + 1).map(item => item.id);
                setSelectedNodeIds(prev => {
                  const next = (e.metaKey || e.ctrlKey) ? new Set(prev) : new Set<string>();
                  rangeIds.forEach(id => next.add(id));
                  return next;
                });
                return;
              }
            }
            lastSelectedNodeIdRef.current = n.id;

            if (e.shiftKey || e.metaKey || e.ctrlKey) {
              e.stopPropagation();
              setSelectedTrackIds(new Set());
              setSelectedNodeIds(prev => {
                const next = new Set(prev);
                if (next.has(n.id)) next.delete(n.id);
                else next.add(n.id);
                return next;
              });
            } else {
              selectNode(n);
              if (hasChildren) {
                setOpenNodes(prev => ({ ...prev, [n.id]: !prev[n.id] }));
              }
            }
          }}
          onContextMenu={e => handleNodeContextMenu(e, n)}
          onAuxClick={e => {
            if (e.button === 1) {
              e.preventDefault();
              openInNewWorkspace(n);
            }
          }}
          draggable={true}
          onDragStart={e => handleNodeDragStart(e, n)}
          onDragEnd={handleDragEnd}
          onDragOver={e => handleNodeDragOver(e, n)}
          onDragLeave={e => handleNodeDragLeave(e, n)}
          onDrop={e => handleNodeDrop(e, n)}
          tabIndex={0}
          role="treeitem"
        >
          <span
            className={`ar ${isOpen ? 'o' : ''} ${isPinned ? 'is-pinned-arrow' : ''}`}
            onClick={e => (hasChildren ? toggleNodeExpansion(n.id, e) : undefined)}
            style={isPinned ? { color: '#f59e0b' } : undefined}
          >
            {hasChildren || isPinned ? '›' : ''}
          </span>
          <CoverArt
            src={n.cover_url || null}
            alt={n.name}
            size={18}
            type="folder"
            seed={n.name}
            rounded={3}
          />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{n.name}</span>

          {/* Quick pin & manage buttons on hover */}
          <div className="tree-node-actions" onClick={e => e.stopPropagation()}>
            <button
              type="button"
              className={`tree-pin-btn ${isPinned ? 'pinned' : ''}`}
              title={isPinned ? 'Unpin folder' : 'Pin folder to top'}
              onClick={e => togglePinCrate(n.id, e)}
            >
              <Pin size={11} style={isPinned ? { color: '#f59e0b', fill: '#f59e0b' } : undefined} />
            </button>
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
        </div>
        {isOpen && hasChildren && n.children.map(c => renderTreeNode(c, depth + 1))}
      </React.Fragment>
    );
  };

  // Render table rows recursively for current node and its children
  const renderSections = (n: LibraryNode, depth: number): React.ReactNode[] => {
    const activeCols = COLUMNS.filter(c => visibleColumns[c.key]);
    const colSpan = activeCols.length + 1;
    const nodesOut: React.ReactNode[] = [];

    const q = filterText.trim().toLowerCase();

    // Filter tracks if filterText is active
    let nodeTracks = n.tracks || [];
    if (q) {
      const containerMatchedDirectly = n.name.toLowerCase().includes(q) || n.type.toLowerCase().includes(q);
      if (!containerMatchedDirectly) {
        nodeTracks = nodeTracks.filter(t => trackMatches(t, q));
      }
    }

    const sorted = sortTracks(nodeTracks);

    // Track rows
    sorted.forEach(t => {
      const isSelected = selectedTrackIds.has(t.id);
      const completionActiveForTrack = isNodeCompletionEnabled(n.id);
      const isTrackAlbumIncomplete = completionActiveForTrack && Boolean(t.al) && !isAlbumCompleted(t.a, t.al, completedAlbumKeys);
      nodesOut.push(
        <tr
          key={`t-${t.id}`}
          className={`t ${isSelected ? 's is-selected' : ''} ${draggingTrackIds.includes(t.id) ? 'is-dragging' : ''} ${isTrackAlbumIncomplete ? 'album-incomplete' : ''}`}
          draggable={true}
          onDragStart={e => handleTrackDragStart(e, t)}
          onDragEnd={handleDragEnd}
          onClick={e => handleTrackClick(t, e)}
          onDoubleClick={() => setActiveTrack(t)}
          onContextMenu={e => handleTrackContextMenu(e, t)}
        >
          {activeCols.map((col, colIdx) => {
            const cellStyle = colIdx === 0 ? { paddingLeft: `${14 + depth * 18}px` } : undefined;
            if (col.key === 'title') {
              return (
                <td key={col.key} style={cellStyle}>
                  <div className="tree-node-cell" style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
                    <span className="ar empty" style={{ width: 14 }} />
                    <CoverArt
                      src={t.cover_url || n.cover_url}
                      alt={t.t}
                      size={24}
                      type="track"
                      seed={t.al || t.t || t.a}
                      rounded={4}
                    />
                    <span
                      className="ttl"
                      tabIndex={0}
                    >
                      {t.t}
                    </span>
                  </div>
                </td>
              );
            }
            if (col.key === 'artist') return <td key={col.key} style={cellStyle}>{t.a}</td>;
            if (col.key === 'album') return <td key={col.key} style={cellStyle}>{t.al}</td>;
            if (col.key === 'year') return <td key={col.key} style={cellStyle}>{t.y || '—'}</td>;
            if (col.key === 'format') return <td key={col.key} style={cellStyle}>{t.f || '—'}</td>;
            if (col.key === 'cat') return <td key={col.key} style={cellStyle} className="mono">{t.c || '—'}</td>;
            if (col.key === 'bc') return <td key={col.key} style={cellStyle} className="mono">{t.bc || '—'}</td>;
            if (col.key === 'mbid') {
              const displayMbid = t.mb && t.mb.length > 8 ? `${t.mb.slice(0, 8)}…` : t.mb || '—';
              return (
                <td key={col.key} style={cellStyle} className="mono" title={t.mb}>
                  {displayMbid}
                </td>
              );
            }
            if (col.key === 'isrc') return <td key={col.key} style={cellStyle} className="mono">{t.isrc || '—'}</td>;
            if (col.key === 'len') return <td key={col.key} style={cellStyle} className="mono">{fmtDuration(t.len)}</td>;
            if (col.key === 'bpm') return <td key={col.key} style={cellStyle} className="mono">{t.bpm || '—'}</td>;
            if (col.key === 'key') return <td key={col.key} style={cellStyle} className="mono">{t.key || '—'}</td>;
            return <td key={col.key} style={cellStyle}>—</td>;
          })}
          <td style={{ width: 36 }}></td>
        </tr>
      );
    });

    // Sub-containers aligned with table rows and structured in tree layout
    if (n.children && n.children.length > 0) {
      let nodeChildren = n.children;
      if (q) {
        nodeChildren = nodeChildren.filter(child => nodeMatchesSearch(child, q));
      }
      nodeChildren = sortNodes(nodeChildren);

      nodeChildren.forEach(child => {
        const childTracks = flattenTracks(child);
        const hasSubItems = (child.children && child.children.length > 0) || childTracks.length > 0;
        const isCollapsed = q ? false : (hasSubItems ? isSectionCollapsed(child, depth) : true);
        const isNodeSelected = selectedNodeIds.has(child.id);
        const isDropTarget = dropTargetNodeId === child.id;
        const isDragging = draggingNodeIds.includes(child.id) || draggingNodeId === child.id;

        const isChildAlbum = child.type === 'Album';
        const childArtist = child.tracks?.[0]?.a || (n.type === 'Artist' ? n.name : (activeNode?.type === 'Artist' ? activeNode.name : ''));
        const isChildCompleted = isChildAlbum ? isAlbumCompleted(childArtist, child.name, completedAlbumKeys) : false;
        const completionActiveForChild = isNodeCompletionEnabled(child.id);
        const isAlbumIncomplete = completionActiveForChild && isChildAlbum && !isChildCompleted;
        const isAlbumCompletedState = completionActiveForChild && isChildAlbum && isChildCompleted;

        nodesOut.push(
          <tr
            key={`h-${child.id}`}
            className={`t container-row ${child.type.toLowerCase()}-row ${!hasSubItems ? 'is-empty' : ''} ${isNodeSelected ? 's is-selected' : ''} ${isDropTarget ? 'is-drop-target' : ''} ${isDragging ? 'is-dragging' : ''} ${isAlbumIncomplete ? 'album-incomplete' : ''} ${isAlbumCompletedState ? 'album-completed' : ''}`}
            data-context-type="node"
            data-node-id={child.id}
            draggable={true}
            onDragStart={e => handleNodeDragStart(e, child)}
            onDragEnd={handleDragEnd}
            onDragOver={e => handleNodeDragOver(e, child)}
            onDragLeave={e => handleNodeDragLeave(e, child)}
            onDrop={e => handleNodeDrop(e, child)}
            onClick={e => handleNodeClick(child, hasSubItems, isCollapsed, e)}
            onDoubleClick={() => selectNode(child)}
            onContextMenu={e => handleNodeContextMenu(e, child)}
            onAuxClick={e => {
              if (e.button === 1) {
                e.preventDefault();
                openInNewWorkspace(child);
              }
            }}
          >
            {activeCols.map((col, colIdx) => {
              const cellStyle = colIdx === 0 ? { paddingLeft: `${14 + depth * 18}px` } : undefined;

              if (col.key === 'title') {
                return (
                  <td key={col.key} style={cellStyle}>
                    <div className="tree-node-cell" style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
                      {/* Expand / Collapse Chevron */}
                      {hasSubItems ? (
                        <span
                          className={`ar ${isCollapsed ? '' : 'o'}`}
                          title={isCollapsed ? 'Expand' : 'Collapse'}
                          onClick={e => {
                            e.stopPropagation();
                            toggleSectionCollapse(child.id, isCollapsed);
                          }}
                        >
                          ›
                        </span>
                      ) : (
                        <span className="ar empty" style={{ width: 14 }} />
                      )}

                      {/* CoverArt (Folders always use text-generated thumbnails; albums and other items always keep small thumbnails in table even in completion mode) */}
                      <CoverArt
                        src={child.type === 'Folder' ? null : (child.cover_url || child.tracks?.[0]?.cover_url || null)}
                        alt={child.name}
                        size={24}
                        type={child.type === 'Artist' ? 'artist' : child.type === 'Playlist' ? 'playlist' : child.type === 'Folder' ? 'folder' : 'album'}
                        seed={child.name}
                        rounded={child.type === 'Artist' ? 'full' : 4}
                      />

                      {/* Name */}
                      <span className="ttl container-ttl">
                        {child.name}
                      </span>
                    </div>
                  </td>
                );
              }

              if (col.key === 'artist') {
                const artistDisplay = child.type === 'Album'
                  ? (child.tracks?.[0]?.a || '—')
                  : child.type === 'Artist'
                    ? child.name
                    : '—';
                return <td key={col.key} style={cellStyle}>{artistDisplay}</td>;
              }

              if (col.key === 'album') {
                const albumDisplay = child.type === 'Album'
                  ? child.name
                  : child.type === 'Artist'
                    ? (child.children?.length ? `${child.children.length} releases` : '—')
                    : '—';
                return <td key={col.key} style={cellStyle}>{albumDisplay}</td>;
              }

              if (col.key === 'year') {
                const yearDisplay = child.type === 'Album'
                  ? (child.tracks?.[0]?.y || '—')
                  : '—';
                return <td key={col.key} style={cellStyle}>{yearDisplay}</td>;
              }

              if (col.key === 'format') {
                const formatDisplay = child.type === 'Album'
                  ? (child.tracks?.[0]?.f || 'Album')
                  : child.type;
                return <td key={col.key} style={cellStyle}>{formatDisplay}</td>;
              }

              if (col.key === 'cat') {
                const catDisplay = child.type === 'Album' ? (child.tracks?.[0]?.c || '—') : '—';
                return <td key={col.key} style={cellStyle} className="mono">{catDisplay}</td>;
              }

              if (col.key === 'bc') {
                const bcDisplay = child.type === 'Album' ? (child.tracks?.[0]?.bc || '—') : '—';
                return <td key={col.key} style={cellStyle} className="mono">{bcDisplay}</td>;
              }

              if (col.key === 'mbid') {
                const mb = child.type === 'Album' ? (child.tracks?.[0]?.mb || '') : '';
                const displayMbid = mb && mb.length > 8 ? `${mb.slice(0, 8)}…` : mb || '—';
                return (
                  <td key={col.key} style={cellStyle} className="mono" title={mb || undefined}>
                    {displayMbid}
                  </td>
                );
              }

              if (col.key === 'isrc') {
                if (child.type === 'Album') {
                  const withIsrc = childTracks.filter(t => t.isrc && t.isrc !== '—').length;
                  return (
                    <td key={col.key} style={cellStyle} className="mono">
                      {childTracks.length > 0 ? `${withIsrc}/${childTracks.length}` : '—'}
                    </td>
                  );
                }
                return <td key={col.key} style={cellStyle}>—</td>;
              }

              if (col.key === 'len') {
                const totalSeconds = childTracks.reduce((p, x) => p + (x.len || 0), 0);
                const lenDisplay = totalSeconds > 0
                  ? fmtDuration(totalSeconds)
                  : (child.children?.length ? `${child.children.length} items` : '—');
                return <td key={col.key} style={cellStyle} className="mono">{lenDisplay}</td>;
              }

              if (col.key === 'bpm') return <td key={col.key} style={cellStyle}>—</td>;
              if (col.key === 'key') return <td key={col.key} style={cellStyle}>—</td>;

              return <td key={col.key} style={cellStyle}>—</td>;
            })}

            <td style={{ width: 36, textAlign: 'right', paddingRight: 8 }}>
              <button
                type="button"
                className="node-more-btn"
                title={`Manage ${child.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setNodeToEdit(child);
                  setNodeEditOpen(true);
                }}
              >
                <MoreHorizontal size={13} />
              </button>
            </td>
          </tr>
        );

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
          <main
            className={`main-content-scroll ${dropTargetNodeId === 'empty-space' ? 'is-empty-drop-target' : ''}`}
            onDragOver={handleEmptySpaceDragOver}
            onDragLeave={handleEmptySpaceDragLeave}
            onDrop={handleEmptySpaceDrop}
          >
        {activeNode ? (
          /* =========================================================================
             Container Detail View (Drilled Down View)
             ========================================================================= */
          <div
            className="container-detail-view"
            onContextMenu={handleTableContextMenu}
            onDragOver={handleEmptySpaceDragOver}
            onDragLeave={handleEmptySpaceDragLeave}
            onDrop={handleEmptySpaceDrop}
            onClick={() => {
              setSelectedNodeId(null);
              setSelectedTrackIds(new Set());
            }}
          >
            {/* Active Container Hero Banner with Discogs / Ambient Background Artwork */}
            {(() => {
              const isActiveAlbum = activeNode.type === 'Album';
              const activeArtist = activeNode.tracks?.[0]?.a || (activePath.length > 1 && activePath[activePath.length - 2]?.type === 'Artist' ? activePath[activePath.length - 2].name : '');
              const isActiveAlbumCompleted = isActiveAlbum ? isAlbumCompleted(activeArtist, activeNode.name, completedAlbumKeys) : false;
              const completionActiveForActive = isNodeCompletionEnabled(activeNode.id);
              const isActiveAlbumIncomplete = completionActiveForActive && isActiveAlbum && !isActiveAlbumCompleted;

              return (activeNode.type === 'Album' || activeNode.type === 'Artist' || activeNode.type === 'Playlist' || activeNode.type === 'Folder') && (
                <div className={`active-hero-banner ${isActiveAlbumIncomplete ? 'album-page-incomplete' : ''}`}>
                  {heroBackdrop && activeNode.type !== 'Folder' && !isActiveAlbumIncomplete ? (
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
                  ) : (
                    <div className="hero-backdrop" aria-hidden="true">
                      <div
                        className="hero-backdrop-glow"
                        style={{
                          background: isActiveAlbumIncomplete
                            ? 'radial-gradient(ellipse 90% 90% at 20% 30%, rgba(255, 255, 255, 0.03) 0%, transparent 70%)'
                            : `radial-gradient(ellipse 90% 90% at 20% 30%, ${getFunkyPalette(activeNode.name)[1]}2e 0%, transparent 70%), radial-gradient(ellipse 70% 70% at 80% 60%, ${getFunkyPalette(activeNode.name)[2]}24 0%, transparent 65%)`,
                          filter: 'blur(36px)',
                        }}
                      />
                      <div className="hero-backdrop-scrim" />
                    </div>
                  )}

                  {/* 1. TOP NAV BAR: Navigation button (../) and breadcrumb section ABOVE the header icon/type title */}
                  <div className="hero-top-nav-bar">
                    <div className="hero-nav-left">
                      {/* Breadcrumb path */}
                      <nav className="unified-crumbs" aria-label="Breadcrumb">
                        <span
                          className="crumb-link root-crumb"
                          onClick={() => setTreeDropdownOpen(!treeDropdownOpen)}
                          title="Toggle Library Navigation Drawer"
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
                                <span
                                  className="crumb-link"
                                  onClick={e => {
                                    if (e.metaKey || e.ctrlKey) {
                                      e.preventDefault();
                                      openInNewWorkspace(item);
                                      return;
                                    }
                                    selectNode(item);
                                  }}
                                  onAuxClick={e => {
                                    if (e.button === 1) {
                                      e.preventDefault();
                                      openInNewWorkspace(item);
                                    }
                                  }}
                                >
                                  {item.name}
                                </span>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </nav>
                    </div>

                    {/* Filter search and Add Music buttons placed on top across from breadcrumbs */}
                    <div className="hero-top-actions-right">
                      {/* Filter Box */}
                      <div className="header-filter-box">
                        <Search size={13} className="header-filter-icon" />
                        <input
                          ref={filterInputRef}
                          type="search"
                          className="header-filter-input"
                          placeholder="Filter page... (⌘F)"
                          value={filterText}
                          onChange={e => setFilterText(e.target.value)}
                        />
                        {filterText && (
                          <button
                            type="button"
                            className="header-filter-clear-btn"
                            onClick={() => setFilterText('')}
                            title="Clear filter"
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      {/* Add Music Button with [A] keybind */}
                      <div className="header-add-music-container" ref={addMusicRef}>
                        <button
                          type="button"
                          className={`header-add-music-btn ${addMusicMenuOpen ? 'active' : ''}`}
                          onClick={() => setAddMusicMenuOpen(!addMusicMenuOpen)}
                          title="Add Music (A)"
                        >
                          <Plus size={13} strokeWidth={2.4} />
                          <span>Add Music</span>
                          <kbd className="header-kbd">A</kbd>
                          <ChevronDown size={11} className={`header-add-music-arrow ${addMusicMenuOpen ? 'open' : ''}`} />
                        </button>

                        {addMusicMenuOpen && (
                          <div className="add-music-dropdown header-popover" style={{ right: 0, left: 'auto', top: 'calc(100% + 6px)', bottom: 'auto', minWidth: 260 }}>
                            <button
                              type="button"
                              className="add-music-option"
                              onClick={() => {
                                setAddMusicMenuOpen(false);
                                const targetId = selectedNode
                                  ? selectedNode.id
                                  : firstSelectedTrack
                                    ? (firstSelectedTrack.parent_id || 'uncategorized')
                                    : (activeNode?.id || 'uncategorized');
                                setSearchInitialQuery('');
                                setSearchInitialTargetNodeId(targetId);
                                setImportModalOpen(true);
                              }}
                            >
                              <div style={{ padding: 6, borderRadius: 6, background: '#1e3a5f', color: '#60a5fa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Sparkles size={16} />
                              </div>
                              <div style={{ flex: 1 }}>
                                <div className="add-music-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <span>Search &amp; Import Releases</span>
                                  <kbd className="header-kbd">A</kbd>
                                </div>
                                <div className="add-music-desc">Search artists &amp; albums from Discogs 17.5M+ and Deezer</div>
                              </div>
                            </button>

                            <button
                              type="button"
                              className="add-music-option"
                              onClick={() => {
                                setAddMusicMenuOpen(false);
                                handleOpenTuneImport(selectedNode || activeNode);
                              }}
                            >
                              <div style={{ padding: 6, borderRadius: 6, background: '#164e63', color: '#22d3ee', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <FileText size={16} />
                              </div>
                              <div style={{ flex: 1 }}>
                                <div className="add-music-title">Import Tune My Music (.csv)</div>
                                <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: 'rgba(34,211,238,0.15)', color: '#22d3ee', fontWeight: 600 }}>CSV</span>
                              </div>
                              <div className="add-music-desc">Smart import playlists with Deezer &amp; Discogs connection</div>
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
                                <div className="add-music-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <span>Add Track Manually</span>
                                  <kbd className="header-kbd">T</kbd>
                                </div>
                                <div className="add-music-desc">Enter custom track metadata, duration &amp; catalog tags</div>
                              </div>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 2. MAIN HERO CONTENT: Left side is Title & Meta; Right side is Actions across from title */}
                  <div className="active-hero-content">
                    <div className="hero-main-left">
                      <CoverArt
                        src={activeNode.type === 'Folder' ? null : (activeNode.cover_url || activeNode.tracks?.[0]?.cover_url || (activeNode.type === 'Artist' ? artistProfile?.picture : null) || heroBackdrop)}
                        alt={activeNode.name}
                        size={92}
                        type={activeNode.type === 'Artist' ? 'artist' : activeNode.type === 'Playlist' ? 'playlist' : activeNode.type === 'Folder' ? 'folder' : 'album'}
                        seed={activeNode.name}
                        rounded={activeNode.type === 'Artist' ? 'full' : 8}
                      />
                      <div className="active-hero-meta">
                        <div className="active-hero-badge-row">
                          <span className="active-hero-badge">{activeNode.type.toUpperCase()}</span>
                          {completionActiveForActive && isActiveAlbum && isActiveAlbumCompleted && (
                            <button
                              type="button"
                              className="active-hero-status-btn completed"
                              onClick={() => handleToggleAlbumCompleted(activeArtist, activeNode.name, false)}
                              title="Mark album as incomplete"
                            >
                              <Check size={11} strokeWidth={3} />
                              <span>COMPLETED</span>
                            </button>
                          )}
                          {activeNode.type === 'Album' && activeNode.tracks?.[0]?.f && (
                            <span className="active-hero-tag">{activeNode.tracks[0].f}</span>
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
                          {activeNode.type === 'Artist' && (
                            <>
                              <span> · </span>
                              <button
                                type="button"
                                className={`artist-info-toggle-pill ${artistInfoExpanded ? 'active' : ''}`}
                                onClick={handleToggleArtistInfo}
                                title="Show artist bio, Deezer stats, and social links"
                              >
                                <Info size={11} />
                                <span>Artist Info</span>
                                {artistInfoExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                              </button>
                              <span> · </span>
                              <button
                                type="button"
                                className={`artist-info-toggle-pill ${showArtistSuggestions ? 'active' : ''}`}
                                onClick={() => setShowArtistSuggestions(prev => !prev)}
                                title="Show suggested releases & discography"
                              >
                                <Sparkles size={11} />
                                <span>Suggested Releases</span>
                                {showArtistSuggestions ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Optional Artist Profile Header when expanded */}
                  {activeNode.type === 'Artist' && artistInfoExpanded && (
                    <ArtistProfileHeader
                      profile={artistProfile}
                      loading={loadingProfile}
                      artistName={activeNode.name}
                    />
                  )}
                </div>
              ); })()}

            {/* Suggested Releases & Discography for Artists (integrated onto all artist pages, auto-collapsed) */}
            {activeNode.type === 'Artist' && (
              <div className="artist-discography-section">
                <div className="artist-discography-toggle-bar">
                  <button
                    type="button"
                    className={`artist-discography-toggle-btn ${showArtistSuggestions ? 'expanded' : ''}`}
                    onClick={() => setShowArtistSuggestions(prev => !prev)}
                    title={showArtistSuggestions ? 'Collapse suggested releases' : 'Expand suggested releases'}
                  >
                    <div className="discography-toggle-left">
                      <Sparkles size={14} className="discography-toggle-icon" />
                      <span className="discography-toggle-title">Suggested Releases &amp; Discography</span>
                    </div>
                    <div className="discography-toggle-right">
                      <span className="discography-toggle-hint">
                        {showArtistSuggestions ? 'Hide Catalog' : 'Explore Catalog'}
                      </span>
                      {showArtistSuggestions ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                  </button>
                </div>

                {showArtistSuggestions && (
                  <div className="artist-discography-content-wrap">
                    <ArtistProjectsSuggestions
                      artistNode={activeNode}
                      onImportProject={handleImportSuggestedProject}
                      onFinishImport={() => loadTree(activeNode.id)}
                      onOpenSearchModal={() => setImportModalOpen(true)}
                      onNewTrack={() => setNewTrackOpen(true)}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Table */}
            <div
              className={`tw ${dropTargetNodeId === 'empty-space' ? 'is-empty-drop-target' : ''}`}
              onDragOver={handleEmptySpaceDragOver}
              onDragLeave={handleEmptySpaceDragLeave}
              onDrop={handleEmptySpaceDrop}
            >
                <table>
                  <thead>
                    <tr>
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
                        if (filterText.trim()) {
                          const query = filterText.trim().toLowerCase();
                          const matchesInLibrary = allLibraryTracks.filter(t => trackMatches(t, query)).length;
                          return (
                            <tr>
                              <td
                                colSpan={COLUMNS.filter(c => visibleColumns[c.key]).length + 1}
                                style={{ padding: '60px 20px', color: 'var(--mu)', textAlign: 'center' }}
                              >
                                <div style={{ maxWidth: 420, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                  <Search size={32} style={{ color: '#71717a', marginBottom: 12 }} />
                                  <div style={{ fontWeight: 600, fontSize: 14, color: '#f4f4f5', marginBottom: 4 }}>
                                    No results for &ldquo;{filterText}&rdquo; in {activeNode.name}
                                  </div>
                                  <p style={{ fontSize: 12, margin: '0 0 16px', lineHeight: 1.4, color: '#a1a1aa' }}>
                                    {matchesInLibrary > 0
                                      ? `Found ${matchesInLibrary} matching track(s) in other crates in your library.`
                                      : 'No tracks or folders match your query.'}
                                  </p>
                                  <div style={{ display: 'flex', gap: 8 }}>
                                    <button
                                      type="button"
                                      className="p"
                                      onClick={() => setFilterText('')}
                                    >
                                      <span>Clear Filter</span>
                                    </button>
                                    {matchesInLibrary > 0 && tree.length > 0 && activeNode.id !== tree[0].id && (
                                      <button
                                        type="button"
                                        className="btn-ghost"
                                        onClick={() => selectNode(tree[0])}
                                      >
                                        <span>Search in Library Root</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        }

                        if (activeNode.type === 'Folder') {
                          return (
                            <tr>
                              <td
                                colSpan={COLUMNS.filter(c => visibleColumns[c.key]).length + 1}
                                style={{ padding: '60px 20px', color: 'var(--mu)', textAlign: 'center' }}
                              >
                                <div style={{ maxWidth: 400, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                  <Folder size={36} style={{ color: '#52525b', marginBottom: 12 }} />
                                  <div style={{ fontWeight: 600, fontSize: 14, color: '#f4f4f5', marginBottom: 4 }}>
                                    {activeNode.name} is empty
                                  </div>
                                  <p style={{ fontSize: 12, margin: '0 0 16px', lineHeight: 1.4 }}>
                                    Drag and drop crates or tracks here, or create a new sub-crate.
                                  </p>
                                  <button
                                    type="button"
                                    className="p"
                                    onClick={() => setNewContainerOpen(true)}
                                  >
                                    <FolderPlus size={13} />
                                    <span>New Sub-Crate</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        }

                        if (activeNode.type === 'Artist') {
                          return (
                            <tr>
                              <td
                                colSpan={COLUMNS.filter(c => visibleColumns[c.key]).length + 1}
                                style={{ padding: '60px 20px', color: 'var(--mu)', textAlign: 'center' }}
                              >
                                <div style={{ maxWidth: 400, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                  <Disc size={36} style={{ color: '#52525b', marginBottom: 12 }} />
                                  <div style={{ fontWeight: 600, fontSize: 14, color: '#f4f4f5', marginBottom: 16 }}>
                                    {activeNode.name} has no content yet
                                  </div>
                                  <div style={{ display: 'flex', gap: 8 }}>
                                    <button
                                      type="button"
                                      className="p"
                                      onClick={() => setShowArtistSuggestions(true)}
                                    >
                                      <Sparkles size={13} />
                                      <span>Explore Suggested Releases</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setImportModalOpen(true)}
                                    >
                                      <Search size={13} />
                                      <span>Search Catalog</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setNewTrackOpen(true)}
                                    >
                                      <Plus size={13} />
                                      <span>Add Track</span>
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
          </div>
        ) : (
          <div className="empty-library-hero" style={{ margin: 'auto', padding: '60px 20px', textAlign: 'center' }}>
            <Disc size={36} style={{ color: '#60a5fa', marginBottom: 16 }} />
            <h2 style={{ fontSize: 18, color: '#fafafa', marginBottom: 6 }}>No crates in library</h2>
            <p style={{ color: 'var(--mu)', fontSize: 13, marginBottom: 16 }}>Import music to get started.</p>
            <button
              type="button"
              className="header-add-music-btn"
              style={{ margin: '0 auto', display: 'inline-flex' }}
              onClick={() => {
                setSearchInitialQuery('');
                setSearchInitialTargetNodeId('uncategorized');
                setImportModalOpen(true);
              }}
            >
              <Plus size={13} strokeWidth={2.4} />
              <span>Add Music</span>
              <kbd className="header-kbd">A</kbd>
            </button>
          </div>
        )}
          </main>
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
      <ErrorBoundary
        componentName="Music Search Modal"
        onReset={() => setImportModalOpen(false)}
      >
        <HybridSearchModal
          isOpen={importModalOpen}
          onClose={() => {
            setImportModalOpen(false);
            setSearchInitialQuery('');
            setSearchInitialTargetNodeId('');
            try {
              const url = new URL(window.location.href);
              if (url.searchParams.has('sear')) {
                url.searchParams.delete('sear');
                window.history.replaceState(window.history.state, '', url.pathname + (url.search || '') + url.hash);
              }
            } catch {}
          }}
          currentNode={selectedNode || activeNode}
          allTreeNodes={tree}
          initialQuery={searchInitialQuery}
          initialTargetNodeId={searchInitialTargetNodeId}
          onImportSuccess={newDestId => {
            loadTree(activeNodeId || newDestId);
          }}
        />
      </ErrorBoundary>

      {/* Tune My Music Import Modal */}
      <ErrorBoundary
        componentName="Tune My Music Import Modal"
        onReset={() => setTuneImportOpen(false)}
      >
        <TuneMyMusicImportModal
          isOpen={tuneImportOpen}
          onClose={() => setTuneImportOpen(false)}
          currentNode={tuneImportTargetNode || selectedNode || activeNode}
          allTreeNodes={tree}
          onImportSuccess={destId => {
            loadTree(destId);
            showToast('Tune My Music import completed');
          }}
        />
      </ErrorBoundary>

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
        onClose={() => {
          setNewTrackOpen(false);
          setNewTrackTargetNode(null);
        }}
        currentNode={newTrackTargetNode || activeNode}
        onCreated={() => {
          const destName = (newTrackTargetNode || activeNode)?.name;
          setNewTrackTargetNode(null);
          loadTree(activeNodeId);
          if (destName) showToast(`Added track to "${destName}"`);
        }}
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

      {/* Settings Modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onOpenExport={() => setBackupOpen(true)}
      />

      {/* Custom Right-Click Context Menu */}
      <ContextMenu
        state={contextMenu}
        onClose={() => setContextMenu(prev => ({ ...prev, isOpen: false }))}
        statusEnabled={statusEnabled}
        isAlbumCompleted={(artist, album) => isAlbumCompleted(artist, album, completedAlbumKeys)}
        onToggleAlbumCompleted={handleToggleAlbumCompleted}
        onBatchToggleAlbumsCompleted={handleBatchToggleAlbumsCompleted}
        isFolderCompletionEnabled={isNodeCompletionEnabled}
        onToggleFolderCompletion={handleToggleFolderCompletion}
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
        onOpenInNewWorkspace={openInNewWorkspace}
        onImportArtistDiscography={handleImportArtistDiscographyAction}
        onAddMusicToNode={node => {
          setSelectedNodeId(node.id);
          setSearchInitialQuery('');
          setSearchInitialTargetNodeId(node.id);
          setImportModalOpen(true);
        }}
        onAddTrackToNode={node => {
          setNewTrackTargetNode(node);
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
        onBatchDeleteNodes={handleBatchDeleteNodesAction}
        onRefreshArtwork={handleRefreshArtworkAction}
        onBatchRefreshArtwork={handleBatchRefreshArtworkAction}
        onResolveNodeIsrcs={handleResolveNodeIsrcsAction}
        onBatchResolveNodeIsrcs={handleBatchResolveNodeIsrcsAction}
        onOpenImport={() => {
          const target = selectedNode ? selectedNode.id : 'uncategorized';
          setSearchInitialQuery('');
          setSearchInitialTargetNodeId(target);
          setImportModalOpen(true);
        }}
        onOpenTuneImport={handleOpenTuneImport}
        onOpenNewTrack={() => setNewTrackOpen(true)}
        onOpenNewContainer={() => setNewContainerOpen(true)}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        onRefreshLibrary={() => {
          loadTree(activeNodeId || undefined);
          showToast('Library refreshed');
        }}
        onOpenBackup={() => setBackupOpen(true)}
        onShowToast={showToast}
        clipboard={clipboard}
        onCopyItems={copySelectedItems}
        onPasteItems={pasteClipboard}
      />

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fmsort-toast" role="status">
          <Check size={15} style={{ color: '#4ade80' }} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. Detached-but-Connected Floating Library Window (Independently Movable) */}
      {treeDropdownOpen && (
        <div
          ref={dropdownContainerRef}
          className={`detached-library-window ${isInteracting ? 'is-interacting' : ''} ${isMenuPinned ? 'is-pinned' : ''}`}
          role="region"
          aria-label="Library Navigation Window"
          style={{
            width: `${menuWidth}px`,
            height: `${menuHeight}px`,
            ...(menuPosition
              ? {
                  position: 'fixed',
                  left: `${menuPosition.x}px`,
                  top: `${menuPosition.y}px`,
                  bottom: 'auto',
                  right: 'auto',
                  zIndex: 1100,
                }
              : (() => {
                  const hasSelection = selectedTrackIds.size > 0 || selectedNodeIds.size > 0;
                  const selectionAboveOffset = hasSelection && !controlDrawerOpenBelow ? 44 : 0;
                  const selectionBelowOffset = hasSelection && controlDrawerOpenBelow ? 44 : 0;

                  if (!wsDrawerPosition) {
                    return {
                      position: 'fixed',
                      left: '16px',
                      bottom: `${58 + selectionAboveOffset}px`,
                      top: 'auto',
                      right: 'auto',
                      zIndex: 1100,
                    };
                  }
                  const winW = typeof window !== 'undefined' ? window.innerWidth : 1280;
                  const winH = typeof window !== 'undefined' ? window.innerHeight : 800;
                  const clampedX = Math.max(10, Math.min(winW - menuWidth - 10, wsDrawerPosition.x));
                  const dockH = workspacesDockRef.current?.getBoundingClientRect().height || 38;
                  if (wsDrawerPosition.y - menuHeight - 8 - selectionAboveOffset >= 10) {
                    return {
                      position: 'fixed',
                      left: `${clampedX}px`,
                      bottom: `calc(${winH - wsDrawerPosition.y}px + ${8 + selectionAboveOffset}px)`,
                      top: 'auto',
                      right: 'auto',
                      zIndex: 1100,
                    };
                  } else {
                    const clampedY = Math.min(winH - menuHeight - 10, wsDrawerPosition.y + dockH + 8 + selectionBelowOffset);
                    return {
                      position: 'fixed',
                      left: `${clampedX}px`,
                      top: `${clampedY}px`,
                      bottom: 'auto',
                      right: 'auto',
                      zIndex: 1100,
                    };
                  }
                })()),
          }}
        >
          <div className="drawer-library-expanded-panel">
            {/* Draggable Header with CMD+K Shortcut & 3-Dot Options Menu */}
            <div
              className="drawer-menu-header-row"
              onMouseDown={handleLibDragStart}
              onDoubleClick={() => setMenuPosition(null)}
              title="Drag header to move library window · Double-click to snap back"
            >
              <button
                type="button"
                className="drawer-cmdk-trigger-btn"
                onClick={() => {
                  if (!isMenuPinnedRef.current) {
                    setTreeDropdownOpen(false);
                  }
                  setCommandPaletteOpen(true);
                }}
                onMouseDown={e => e.stopPropagation()}
                title="Open Command Palette (⌘K)"
              >
                <Search size={12} className="drawer-cmdk-icon" />
                <span className="drawer-cmdk-label">Search library &amp; commands...</span>
                <kbd className="drawer-cmdk-kbd">⌘K</kbd>
              </button>

              {/* Compact Simple Pin Button */}
              <button
                type="button"
                className={`drawer-pin-compact-btn ${isMenuPinned ? 'is-pinned' : ''}`}
                onClick={() => setIsMenuPinned(!isMenuPinned)}
                onMouseDown={e => e.stopPropagation()}
                title={isMenuPinned ? 'Unpin window (click outside will close)' : 'Pin window (stay open)'}
                aria-label={isMenuPinned ? 'Unpin window' : 'Pin window'}
              >
                <Pin size={12} style={isMenuPinned ? { color: '#f59e0b', fill: '#f59e0b' } : undefined} />
              </button>
            </div>

            {/* Directory Tree List with Custom Scrollbar */}
            <div className="drawer-tree-list custom-fmsort-scrollbar">
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
                displayedNavNodes.map(n => renderTreeNode(n, 0))
              )}
            </div>
          </div>

          {/* Corner Vertical Resize Handles (Active from any corner) */}
          <div
            className="drawer-corner-resize drawer-corner-tl"
            onMouseDown={e => handleLibResizeStart(e, 'top-left')}
            title="Drag vertically to resize"
          />
          <div
            className="drawer-corner-resize drawer-corner-tr"
            onMouseDown={e => handleLibResizeStart(e, 'top-right')}
            title="Drag vertically to resize"
          />
          <div
            className="drawer-corner-resize drawer-corner-bl"
            onMouseDown={e => handleLibResizeStart(e, 'bottom-left')}
            title="Drag vertically to resize"
          />
          <div
            className="drawer-corner-resize drawer-corner-br"
            onMouseDown={e => handleLibResizeStart(e, 'bottom-right')}
            title="Drag vertically to resize"
          />
        </div>
      )}

      {/* 2. Independent Movable Workspace Drawer Dock */}
      <div
        className={`floating-workspaces-container bottom-left ${wsDrawerPosition ? 'is-moved' : ''}`}
        ref={workspacesDockRef}
        role="region"
        aria-label="Workspaces Drawer"
        style={{
          ...(wsDrawerPosition
            ? {
                position: 'fixed',
                left: `${wsDrawerPosition.x}px`,
                top: `${wsDrawerPosition.y}px`,
                bottom: 'auto',
                right: 'auto',
                zIndex: 1050,
              }
            : {}),
        }}
      >
        <div
          className={`floating-workspaces-dock-wrapper ${isInteractingWs ? 'is-interacting' : ''}`}
          style={{
            maxWidth: wsMaxWidth,
          }}
          onMouseDown={e => {
            const target = e.target as HTMLElement;
            if (
              target.closest('button') ||
              target.closest('.workspace-chip') ||
              target.closest('.workspace-picker-popover') ||
              target.closest('.selection-popup-bar')
            ) {
              return;
            }
            handleWsDragStart(e);
          }}
          onDoubleClick={e => {
            const target = e.target as HTMLElement;
            if (target.closest('.selection-popup-bar')) return;
            setWsDrawerPosition(null);
            setControlDrawerOpenBelow(false);
            setControlDrawerAlignRight(false);
          }}
          onDragOver={handleWorkspaceTrayDragOver}
          onDragLeave={handleWorkspaceTrayDragLeave}
          onDrop={handleWorkspaceTrayDrop}
          title="Drag to move workspace dock · Double-click to snap back"
        >
          {/* Attached & Connected Control Drawer (Selection Actions) */}
          {(selectedTrackIds.size > 0 || selectedNodeIds.size > 0) && (
            <div
              className={`selection-popup-bar ${controlDrawerOpenBelow ? 'open-below' : 'open-above'} ${controlDrawerAlignRight ? 'align-right' : ''}`}
              role="region"
              aria-label="Selection actions"
              onMouseDown={e => e.stopPropagation()}
            >
              {/* Action Buttons */}
              <div className="selection-popup-actions">
                {/* Track-specific actions */}
                {selectedTrackIds.size > 0 && (
                  <>
                    <button
                      type="button"
                      className="selection-action-btn"
                      onClick={() => {
                        if (firstSelectedTrack) setActiveTrack(firstSelectedTrack);
                      }}
                      title="Edit metadata (E)"
                    >
                      <Edit3 size={13} />
                      <span>Edit</span>
                      <kbd className="selection-kbd">E</kbd>
                    </button>

                    <button
                      type="button"
                      className="selection-action-btn"
                      onClick={() => setMoveTracksOpen(true)}
                      title="Move selected tracks (M)"
                    >
                      <FolderInput size={13} />
                      <span>Move</span>
                      <kbd className="selection-kbd">M</kbd>
                    </button>

                    <button
                      type="button"
                      className="selection-action-btn"
                      onClick={() => copySelectedItems(undefined, Array.from(selectedTrackIds), 'copy')}
                      title="Copy tracks to clipboard (⌘C)"
                    >
                      <Copy size={13} />
                      <span>Copy</span>
                      <kbd className="selection-kbd">⌘C</kbd>
                    </button>

                    <button
                      type="button"
                      className="selection-action-btn"
                      onClick={() => {
                        if (selectedTrackIds.size === 1 && firstSelectedTrack) {
                          handleResolveIsrcAction(firstSelectedTrack);
                        } else {
                          handleBatchResolveIsrcAction();
                        }
                      }}
                      title="Resolve ISRCs with Deezer/MusicBrainz (R)"
                    >
                      <Sparkles size={13} />
                      <span>ISRCs</span>
                      <kbd className="selection-kbd">R</kbd>
                    </button>

                    <button
                      type="button"
                      className="selection-action-btn is-danger"
                      onClick={() => {
                        if (selectedTrackIds.size === 1 && firstSelectedTrack) {
                          handleDeleteTrackAction(firstSelectedTrack);
                        } else {
                          handleBatchDeleteTracksAction();
                        }
                      }}
                      title="Delete selected tracks (Backspace / ⌦)"
                    >
                      <Trash2 size={13} />
                      <span>Delete</span>
                      <kbd className="selection-kbd">⌫</kbd>
                    </button>
                  </>
                )}

                {/* Container-specific actions */}
                {selectedNodeIds.size > 0 && (
                  <>
                    {selectedNode && (
                      <button
                        type="button"
                        className="selection-action-btn"
                        onClick={() => selectNode(selectedNode)}
                        title="Open container (Enter)"
                      >
                        <Folder size={13} />
                        <span>Open</span>
                        <kbd className="selection-kbd">↵</kbd>
                      </button>
                    )}

                    {selectedNode && (
                      <button
                        type="button"
                        className="selection-action-btn"
                        onClick={() => openInNewWorkspace(selectedNode)}
                        title="Open in new workspace tab (⌘↵)"
                      >
                        <Layers size={13} />
                        <span>New Tab</span>
                      </button>
                    )}

                    {selectedNode && selectedNode.type === 'Album' && isNodeCompletionEnabled(selectedNode.id) && (
                      <button
                        type="button"
                        className="selection-action-btn"
                        onClick={() => {
                          const artist = selectedNode.tracks?.[0]?.a || (activeNode?.type === 'Artist' ? activeNode.name : '');
                          const completed = isAlbumCompleted(artist, selectedNode.name, completedAlbumKeys);
                          handleToggleAlbumCompleted(artist, selectedNode.name, !completed);
                        }}
                        title="Toggle album completed status (C)"
                      >
                        <CheckCircle2 size={13} />
                        <span>Status</span>
                        <kbd className="selection-kbd">C</kbd>
                      </button>
                    )}

                    {selectedNode && (
                      <button
                        type="button"
                        className="selection-action-btn"
                        onClick={() => {
                          setNodeToEdit(selectedNode);
                          setNodeEditOpen(true);
                        }}
                        title="Rename / Edit container (E)"
                      >
                        <Edit3 size={13} />
                        <span>Rename</span>
                        <kbd className="selection-kbd">E</kbd>
                      </button>
                    )}

                    <button
                      type="button"
                      className="selection-action-btn"
                      onClick={() => copySelectedItems(Array.from(selectedNodeIds), undefined, 'copy')}
                      title="Copy container (⌘C)"
                    >
                      <Copy size={13} />
                      <span>Copy</span>
                      <kbd className="selection-kbd">⌘C</kbd>
                    </button>

                    <button
                      type="button"
                      className="selection-action-btn is-danger"
                      onClick={() => {
                        const nodesToDelete = allContainers.filter(n => selectedNodeIds.has(n.id));
                        if (nodesToDelete.length === 1) {
                          handleDeleteNodeAction(nodesToDelete[0]);
                        } else {
                          handleBatchDeleteNodesAction(nodesToDelete);
                        }
                      }}
                      title="Delete container(s) (Backspace / ⌦)"
                    >
                      <Trash2 size={13} />
                      <span>Delete</span>
                      <kbd className="selection-kbd">⌫</kbd>
                    </button>
                  </>
                )}
              </div>

              <div className="selection-popup-divider" />

              {/* 4. Dismiss / Clear Selection */}
              <button
                type="button"
                className="selection-dismiss-btn"
                onClick={() => {
                  setSelectedTrackIds(new Set());
                  setSelectedNodeIds(new Set());
                  setSelectMultipleMode(false);
                }}
                title="Deselect all (Esc)"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Iconic ../ Button that opens the detached library UI */}
          <button
            type="button"
            className={`drawer-crumb-btn ${treeDropdownOpen ? 'active' : ''}`}
            onClick={() => setTreeDropdownOpen(prev => !prev)}
            title="Browse Library Crates (.. / /)"
            aria-label="Browse Library Crates"
          >
            ../
          </button>

          {/* Settings Button (Moved next to lib drawer button) */}
          <button
            type="button"
            className="workspace-dock-settings-btn"
            onClick={() => setSettingsOpen(true)}
            title="Application & Library Settings (⌘,)"
            aria-label="Settings"
          >
            <Settings size={13} />
          </button>

          <div className="drawer-dock-divider" />

          {/* Workspace Chips List */}
          <div
            className={`footer-workspaces-dock ${isDockTrayDropTarget ? 'is-new-ws-drop-target' : ''}`}
            onDragOver={handleWorkspaceTrayDragOver}
            onDragLeave={handleWorkspaceTrayDragLeave}
            onDrop={handleWorkspaceTrayDrop}
          >
            {workspaces.map((ws, wsIdx) => {
              const wsNode = findNodeById(tree, ws.nodeId) || tree[0];
              const isActive = ws.id === activeWorkspaceId;
              const isTarget = isWorkspaceDropTarget === ws.id;

              return (
                <div
                  key={ws.id}
                  className={`workspace-chip ${isActive ? 'active' : ''} ${isTarget ? 'is-drop-target' : ''}`}
                  onClick={() => switchWorkspace(ws.id)}
                  onAuxClick={e => {
                    if (e.button === 1 && workspaces.length > 1) {
                      e.preventDefault();
                      closeWorkspace(ws.id);
                    }
                  }}
                  onMouseEnter={e => handleWorkspaceChipMouseEnter(wsNode, e)}
                  onMouseLeave={handleWorkspaceChipMouseLeave}
                  onDragEnter={e => handleWorkspaceChipDragEnter(e, ws.id)}
                  onDragOver={e => handleWorkspaceChipDragOver(e, ws.id)}
                  onDragLeave={handleWorkspaceChipDragLeave}
                  onDrop={e => handleWorkspaceChipDrop(e, ws.id)}
                  title={`Switch to "${wsNode?.name || 'Workspace'}" (⌘${wsIdx + 1}) · Middle-click to close · Drag items here`}
                >
                  <div className="workspace-chip-icon">
                    <CoverArt
                      src={wsNode?.cover_url || null}
                      alt={wsNode?.name || ''}
                      size={14}
                      type="folder"
                      seed={wsNode?.name || ''}
                      rounded={2}
                    />
                  </div>
                  <span className="workspace-chip-title">{wsNode?.name || 'Workspace'}</span>
                  {wsIdx < 9 && <kbd className="header-kbd" style={{ fontSize: '9px', padding: '1px 3px' }}>⌘{wsIdx + 1}</kbd>}
                  {workspaces.length > 1 && (
                    <button
                      type="button"
                      className="workspace-chip-close"
                      onClick={e => {
                        e.stopPropagation();
                        closeWorkspace(ws.id, e);
                      }}
                      title="Close workspace"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add Workspace (+) Button & Popover */}
          <div
            className={`workspace-add-container ${isDockTrayDropTarget ? 'is-new-ws-drop-target' : ''}`}
            ref={workspaceAddContainerRef}
            onDragOver={handleWorkspaceTrayDragOver}
            onDragLeave={handleWorkspaceTrayDragLeave}
            onDrop={handleWorkspaceTrayDrop}
          >
            <button
              type="button"
              className={`workspace-add-btn ${workspacePickerOpen ? 'active' : ''}`}
              onClick={() => setWorkspacePickerOpen(prev => !prev)}
              title="Open in New Workspace (⌘T) · Drop items here to open in new tab"
            >
              <Plus size={13} strokeWidth={2.4} />
            </button>

            {workspacePickerOpen && (
              <div className="workspace-picker-popover bottom-align" ref={workspacePickerRef} role="menu">
                <div className="workspace-picker-header">
                  <div className="workspace-picker-header-title">
                    <Layers size={13} style={{ color: '#818cf8' }} />
                    <span>Workspaces</span>
                  </div>
                  <span className="workspace-picker-shortcut">⌘1..{Math.min(workspaces.length, 9)}</span>
                </div>

                <div className="workspace-picker-quick-actions">
                  {activeNode && (
                    <button
                      type="button"
                      className="workspace-picker-quick-btn"
                      onClick={() => {
                        const newWsId = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                        setWorkspaces(prev => [...prev, { id: newWsId, nodeId: activeNode.id, history: [activeNode.id], historyIndex: 0 }]);
                        setActiveWorkspaceId(newWsId);
                        setWorkspacePickerOpen(false);
                        setWorkspacePickerSearch('');
                        showToast(`Duplicated workspace for "${activeNode.name}"`);
                      }}
                    >
                      <Copy size={12} style={{ color: '#a78bfa' }} />
                      <span>Duplicate View ("{activeNode.name}")</span>
                    </button>
                  )}
                </div>

                <div className="header-ws-search-wrap" style={{ margin: '6px 0' }}>
                  <Search size={12} className="header-ws-search-icon" />
                  <input
                    type="search"
                    className="header-ws-search-input"
                    placeholder="Search and open crate..."
                    value={workspacePickerSearch}
                    onChange={e => setWorkspacePickerSearch(e.target.value)}
                    autoFocus
                  />
                </div>

                {workspacePickerSearch.trim() && (
                  <div className="header-ws-search-results">
                    {allContainers
                      .filter(c => c.name.toLowerCase().includes(workspacePickerSearch.toLowerCase()))
                      .slice(0, 8)
                      .map(c => (
                        <button
                          key={c.id}
                          type="button"
                          className="header-ws-search-item"
                          onClick={() => {
                            openInNewWorkspace(c);
                            setWorkspacePickerOpen(false);
                            setWorkspacePickerSearch('');
                          }}
                        >
                          <CoverArt
                            src={c.cover_url || null}
                            alt={c.name}
                            size={18}
                            type="folder"
                            seed={c.name}
                            rounded={3}
                          />
                          <span className="header-ws-search-item-title">{c.name}</span>
                          <span className="header-ws-search-item-badge">{c.type}</span>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Hover Preview Card Tooltip */}
          {hoverPreviewNode && hoverPreviewPos && (
            <div
              className="workspace-preview-popover bottom-align"
              style={{ left: hoverPreviewPos.left }}
            >
              <div className="workspace-preview-media">
                <CoverArt
                  src={hoverPreviewNode.cover_url || null}
                  alt={hoverPreviewNode.name}
                  size={36}
                  type={hoverPreviewNode.type === 'Artist' ? 'artist' : 'folder'}
                  seed={hoverPreviewNode.name}
                  rounded={hoverPreviewNode.type === 'Artist' ? 'full' : 4}
                />
              </div>
              <div className="workspace-preview-info">
                <h4 className="workspace-preview-title">{hoverPreviewNode.name}</h4>
                <div className="workspace-preview-meta">
                  <span>{hoverPreviewNode.type}</span>
                  <span>·</span>
                  <span>{flattenTracks(hoverPreviewNode).length} tracks</span>
                  {hoverPreviewNode.children && hoverPreviewNode.children.length > 0 && (
                    <>
                      <span>·</span>
                      <span>{hoverPreviewNode.children.length} subfolders</span>
                    </>
                  )}
                </div>
                <div className="workspace-preview-hint">Click chip to switch · Drag items to move</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
