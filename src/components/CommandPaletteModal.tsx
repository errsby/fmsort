import React, { useState, useEffect, useRef } from 'react';
import type { LibraryNode } from '../types';
import { getAllNodes, findNodePath } from '../utils';
import { CoverArt } from './CoverArt';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  allTreeNodes: LibraryNode[];
  onSelectNode: (node: LibraryNode) => void;
}

export const CommandPaletteModal: React.FC<Props> = ({
  isOpen,
  onClose,
  allTreeNodes,
  onSelectNode,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const allNodes = getAllNodes(allTreeNodes);
  const q = query.trim().toLowerCase();

  const filtered = allNodes.filter(n => {
    if (!q) return true;
    return (
      n.name.toLowerCase().includes(q) ||
      n.type.toLowerCase().includes(q)
    );
  }).slice(0, 15);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1 < filtered.length ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 >= 0 ? prev - 1 : filtered.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        onSelectNode(filtered[selectedIndex]);
        onClose();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <>
      <div className="ov on" onClick={onClose} />
      <div className="dlg on" role="dialog" aria-label="Command bar">
        <input
          ref={inputRef}
          type="text"
          placeholder="Jump to a folder, label, artist, playlist, genre..."
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {filtered.length === 0 ? (
            <div style={{ color: 'var(--mu)', padding: '12px 6px', fontSize: 13 }}>
              No containers match &ldquo;{query}&rdquo;
            </div>
          ) : (
            filtered.map((n, idx) => {
              const path = findNodePath(allTreeNodes, n.id);
              const pathString = path ? path.map(p => p.name).join(' / ') : n.name;
              return (
                <div
                  key={n.id}
                  className={`cl ${idx === selectedIndex ? 'on' : ''}`}
                  onClick={() => {
                    onSelectNode(n);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                    <CoverArt
                      src={n.cover_url || n.tracks?.[0]?.cover_url}
                      alt={n.name}
                      size={26}
                      type={n.type === 'Artist' ? 'artist' : n.type === 'Playlist' ? 'playlist' : n.type === 'Folder' ? 'folder' : 'album'}
                      seed={n.name}
                      rounded={n.type === 'Artist' ? 'full' : 4}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, overflow: 'hidden' }}>
                      <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.name}</span>
                      <span style={{ color: 'var(--mu)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pathString}</span>
                    </div>
                  </div>
                  <span className="ty">{n.type}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
};
