import React, { useState, useEffect } from 'react';
import type { LibraryNode } from '../types';
import { getAllNodes } from '../utils';
import { updateNode, deleteNode } from '../api';
import { CoverArt } from './CoverArt';

interface Props {
  node: LibraryNode | null;
  isOpen: boolean;
  onClose: () => void;
  allTreeNodes: LibraryNode[];
  onUpdated: (newActiveId?: string) => void;
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

export const NodeEditModal: React.FC<Props> = ({
  node,
  isOpen,
  onClose,
  allTreeNodes,
  onUpdated,
}) => {
  const [name, setName] = useState('');
  const [type, setType] = useState('Folder');
  const [parentId, setParentId] = useState<string>('');
  const [coverUrl, setCoverUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (node) {
      setName(node.name);
      setType(node.type);
      setParentId(node.parent_id || '');
      setCoverUrl(node.cover_url || '');
      setError(null);
    }
  }, [node]);

  if (!isOpen || !node) return null;

  // Filter out the node itself and its descendants from candidate parents to prevent circular loops
  const allContainers = getAllNodes(allTreeNodes);
  const getDescendantIds = (n: LibraryNode, set = new Set<string>()): Set<string> => {
    set.add(n.id);
    for (const c of n.children || []) {
      getDescendantIds(c, set);
    }
    return set;
  };
  const invalidParents = getDescendantIds(node);
  const eligibleParents = allContainers.filter(c => !invalidParents.has(c.id));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Container name cannot be empty');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updateNode(node.id, {
        name: name.trim(),
        type,
        parent_id: parentId === '' ? null : parentId,
        cover_url: coverUrl.trim(),
      });
      onUpdated(node.id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update container');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(
        `Are you sure you want to delete "[${node.type}] ${node.name}" and all of its tracks and nested containers?`
      )
    )
      return;

    setSaving(true);
    setError(null);
    try {
      await deleteNode(node.id);
      onClose();
      onUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to delete container');
      setSaving(false);
    }
  };

  return (
    <>
      <div className="ov on" onClick={onClose} />
      <div className="dlg on" role="dialog" aria-label="Edit Container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Manage Container Settings</h2>
          <button onClick={onClose} style={{ padding: '2px 8px' }}>✕</button>
        </div>

        {error && <div style={{ color: '#f87171', marginBottom: 12, fontSize: 12 }}>{error}</div>}

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '8px 10px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: 6, border: '1px solid var(--bd)' }}>
            <CoverArt
              src={coverUrl}
              alt={name}
              size={50}
              type={type === 'Artist' ? 'artist' : type === 'Playlist' ? 'playlist' : 'album'}
              seed={name}
              rounded={type === 'Artist' ? 'full' : 6}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 11, color: 'var(--mu)', display: 'block', marginBottom: 3 }}>
                Artwork / Avatar URL
              </span>
              <input
                type="url"
                placeholder="https://... image link"
                value={coverUrl}
                onChange={e => setCoverUrl(e.target.value)}
                style={{ width: '100%', fontSize: 12, padding: '4px 8px' }}
              />
            </div>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--mu)' }}>
            Container Name
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--mu)' }}>
            Container Type
            <select value={type} onChange={e => setType(e.target.value)}>
              {COMMON_TYPES.map(t => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              {!COMMON_TYPES.includes(type) && (
                <option value={type}>{type} (Custom)</option>
              )}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--mu)' }}>
            Parent Container
            <select value={parentId} onChange={e => setParentId(e.target.value)}>
              <option value="">(Root / Top Level)</option>
              {eligibleParents.map(c => (
                <option key={c.id} value={c.id}>
                  [{c.type}] {c.name}
                </option>
              ))}
            </select>
          </label>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
            <button
              type="button"
              className="danger"
              disabled={saving}
              onClick={handleDelete}
            >
              Delete Container
            </button>

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={onClose} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="p" disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </>
  );
};
