import type { LibraryNode, Track } from './types';

export const fmtDuration = (s: number): string => {
  if (!s || isNaN(s)) return '0:00';
  const sec = Math.round(s);
  if (sec >= 3600) {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const remainder = sec % 60;
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  }
  const mins = Math.floor(sec / 60);
  const remainder = sec % 60;
  return `${mins}:${String(remainder).padStart(2, '0')}`;
};

export const fmtTotalRuntime = (tracks: Track[]): string => {
  const total = tracks.reduce((p, x) => p + (x.len || 0), 0);
  if (total >= 3600) {
    return `${Math.floor(total / 3600)} hr ${Math.floor((total % 3600) / 60)} min`;
  }
  return `${Math.round(total / 60)} min`;
};

export const flattenTracks = (node: LibraryNode): Track[] => {
  const allTracks: Track[] = [...(node.tracks || [])];
  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      allTracks.push(...flattenTracks(child));
    }
  }
  return allTracks;
};

export const getAllNodes = (nodes: LibraryNode[], out: LibraryNode[] = []): LibraryNode[] => {
  for (const n of nodes) {
    out.push(n);
    if (n.children && n.children.length > 0) {
      getAllNodes(n.children, out);
    }
  }
  return out;
};

export const findNodeById = (nodes: LibraryNode[], id: string): LibraryNode | null => {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children && n.children.length > 0) {
      const found = findNodeById(n.children, id);
      if (found) return found;
    }
  }
  return null;
};

export const findNodePath = (
  nodes: LibraryNode[],
  targetId: string,
  currentPath: LibraryNode[] = []
): LibraryNode[] | null => {
  for (const n of nodes) {
    const nextPath = [...currentPath, n];
    if (n.id === targetId) return nextPath;
    if (n.children && n.children.length > 0) {
      const found = findNodePath(n.children, targetId, nextPath);
      if (found) return found;
    }
  }
  return null;
};
