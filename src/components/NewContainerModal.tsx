import React, { useState, useEffect } from 'react';
import type { LibraryNode } from '../types';
import { getAllNodes } from '../utils';
import { createNode } from '../api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentNode: LibraryNode | null;
  allTreeNodes: LibraryNode[];
  onCreated: (newNodeId: string) => void;
}

const COMMON_TYPES = [
  'Folder',
  'Label',
  'Artist',
  'Album',
  'Playlist',
  'Genre',
  'Section',
  'Era',
  'Box Set',
  'Compilation',
  'Mixtape',
];

export const NewContainerModal: React.FC<Props> = ({
  isOpen,
  onClose,
  currentNode,
  allTreeNodes,
  onCreated,
}) => {
  const [parentId, setParentId] = useState<string>('');
  const [type, setType] = useState('Folder');
  const [customType, setCustomType] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setParentId(currentNode?.id || '');
      setType('Folder');
      setCustomType('');
      setName('');
      setError(null);
    }
  }, [isOpen, currentNode]);

  if (!isOpen) return null;

  const allContainers = getAllNodes(allTreeNodes);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = name.trim();
    if (!finalName) {
      setError('Container name is required');
      return;
    }

    const finalType = type === 'CUSTOM' ? customType.trim() : type;
    if (!finalType) {
      setError('Container type is required');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const newNode = await createNode({
        parent_id: parentId === '' ? null : parentId,
        type: finalType,
        name: finalName,
      });
      onCreated(newNode.id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create container');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="ov on" onClick={onClose} />
      <div className="dlg on" role="dialog" aria-label="New Container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>New Container</h2>
          <button onClick={onClose} style={{ padding: '2px 8px' }}>✕</button>
        </div>

        {error && <div style={{ color: '#f87171', marginBottom: 12, fontSize: 12 }}>{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--mu)' }}>
            Parent Location
            <select value={parentId} onChange={e => setParentId(e.target.value)}>
              <option value="">(Root / Top Level)</option>
              {allContainers.map(c => (
                <option key={c.id} value={c.id}>
                  [{c.type}] {c.name}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--mu)' }}>
            Container Type
            <select value={type} onChange={e => setType(e.target.value)}>
              {COMMON_TYPES.map(t => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              <option value="CUSTOM">Custom Type...</option>
            </select>
          </label>

          {type === 'CUSTOM' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--mu)' }}>
              Custom Type Name
              <input
                type="text"
                placeholder="e.g. Catalog, Vault, Archive..."
                value={customType}
                onChange={e => setCustomType(e.target.value)}
              />
            </label>
          )}

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--mu)' }}>
            Container Name
            <input
              type="text"
              placeholder="e.g. German Ambient, Warp Records, Favorites..."
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          </label>

          <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="p" disabled={saving}>
              {saving ? 'Creating...' : 'Create Container'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
};
