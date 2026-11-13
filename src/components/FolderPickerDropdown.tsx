import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { LibraryNode } from '../types';
import { getAllNodes } from '../utils';
import { CoverArt } from './CoverArt';
import { Folder, Search, ChevronDown, Check, FolderRoot } from 'lucide-react';

interface Props {
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  allTreeNodes: LibraryNode[];
  excludeNodeId?: string;
  allowRoot?: boolean;
  placeholder?: string;
}

export const FolderPickerDropdown: React.FC<Props> = ({
  selectedFolderId,
  onSelectFolder,
  allTreeNodes,
  excludeNodeId,
  allowRoot = true,
  placeholder = 'Select destination folder...',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Compute invalid node IDs (the excluded node and all its descendants) to avoid circular loops
  const invalidNodeIds = useMemo(() => {
    const set = new Set<string>();
    if (!excludeNodeId) return set;
    set.add(excludeNodeId);
    const findAndCollectDescendants = (nodes: LibraryNode[]) => {
      for (const n of nodes) {
        if (set.has(n.id) || (n.parent_id && set.has(n.parent_id))) {
          set.add(n.id);
        }
        if (n.children && n.children.length > 0) {
          findAndCollectDescendants(n.children);
        }
      }
    };
    findAndCollectDescendants(allTreeNodes);
    return set;
  }, [allTreeNodes, excludeNodeId]);

  // Flatten and filter eligible folders
  const allContainers = useMemo(() => {
    return getAllNodes(allTreeNodes).filter(c => !invalidNodeIds.has(c.id));
  }, [allTreeNodes, invalidNodeIds]);

  const selectedNode = useMemo(() => {
    if (!selectedFolderId) return null;
    return allContainers.find(c => c.id === selectedFolderId) || null;
  }, [selectedFolderId, allContainers]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const filteredContainers = useMemo(() => {
    if (!search.trim()) return allContainers;
    const q = search.toLowerCase();
    return allContainers.filter(c => c.name.toLowerCase().includes(q));
  }, [allContainers, search]);

  return (
    <div className="folder-picker-dropdown" ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      {/* Trigger Button */}
      <button
        type="button"
        className="folder-picker-trigger"
        onClick={() => setIsOpen(prev => !prev)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '7px 10px',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid var(--bd)',
          borderRadius: 6,
          color: '#f4f4f5',
          fontSize: 12,
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'all 0.15s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
          {selectedNode ? (
            <>
              <CoverArt
                src={selectedNode.cover_url || null}
                alt={selectedNode.name}
                size={18}
                type="folder"
                seed={selectedNode.name}
                rounded={3}
              />
              <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedNode.name}
              </span>
            </>
          ) : (
            <>
              <FolderRoot size={16} style={{ color: '#38bdf8', flexShrink: 0 }} />
              <span style={{ color: selectedFolderId === '' ? '#f4f4f5' : 'var(--mu)', fontWeight: 500 }}>
                {allowRoot ? '(Root / Top Level)' : placeholder}
              </span>
            </>
          )}
        </div>
        <ChevronDown size={14} style={{ color: 'var(--mu)', flexShrink: 0 }} />
      </button>

      {/* Floating Popover List */}
      {isOpen && (
        <div
          className="folder-picker-popover footer-popover"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 1000,
            background: '#18181f',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: 8,
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.08)',
            padding: 6,
            maxHeight: 280,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Search Box */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 5,
              padding: '4px 8px',
              marginBottom: 6,
            }}
          >
            <Search size={13} style={{ color: 'var(--mu)' }} />
            <input
              type="search"
              placeholder="Filter folders..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
              style={{
                background: 'transparent',
                border: 'none',
                color: '#fff',
                fontSize: 12,
                outline: 'none',
                width: '100%',
                padding: 0,
              }}
            />
          </div>

          {/* List Options */}
          <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
            {allowRoot && !search.trim() && (
              <button
                type="button"
                className={`folder-picker-option ${selectedFolderId === null || selectedFolderId === '' ? 'selected' : ''}`}
                onClick={() => {
                  onSelectFolder(null);
                  setIsOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '6px 8px',
                  borderRadius: 4,
                  background: (selectedFolderId === null || selectedFolderId === '') ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                  border: 'none',
                  color: (selectedFolderId === null || selectedFolderId === '') ? '#38bdf8' : '#f4f4f5',
                  fontSize: 12,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <FolderRoot size={14} style={{ color: '#38bdf8' }} />
                  <span style={{ fontWeight: 500 }}>(Root / Top Level)</span>
                </div>
                {(selectedFolderId === null || selectedFolderId === '') && <Check size={13} style={{ color: '#38bdf8' }} />}
              </button>
            )}

            {filteredContainers.length === 0 ? (
              <div style={{ padding: '12px 8px', fontSize: 11, color: 'var(--mu)', textAlign: 'center' }}>
                No folders found
              </div>
            ) : (
              filteredContainers.map(c => {
                const isSelected = selectedFolderId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`folder-picker-option ${isSelected ? 'selected' : ''}`}
                    onClick={() => {
                      onSelectFolder(c.id);
                      setIsOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      padding: '5px 8px',
                      borderRadius: 4,
                      background: isSelected ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                      border: 'none',
                      color: isSelected ? '#c7d2fe' : '#e4e4e7',
                      fontSize: 12,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                      <CoverArt
                        src={c.cover_url || null}
                        alt={c.name}
                        size={16}
                        type="folder"
                        seed={c.name}
                        rounded={3}
                      />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.name}
                      </span>
                    </div>
                    {isSelected && <Check size={13} style={{ color: '#818cf8', flexShrink: 0 }} />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
