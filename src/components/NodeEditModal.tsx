import React, { useState, useEffect } from 'react';
import type { LibraryNode } from '../types';
import { getAllNodes } from '../utils';
import { updateNode, deleteNode } from '../api';
import { CoverArt, getDiceBearUrl } from './CoverArt';
import type { FunkyVariant } from './CoverArt';
import { Sparkles } from 'lucide-react';

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
  const [variant, setVariant] = useState<FunkyVariant | 'auto'>('auto');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (node) {
      setName(node.name);
      setType(node.type);
      setParentId(node.parent_id || '');
      setCoverUrl(node.cover_url || '');
      setVariant('auto');
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
        parent_id: parentId || null,
        cover_url: coverUrl.trim() || undefined,
      });
      onUpdated(node.id);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to update container');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const confirmMsg = `Are you sure you want to delete container "${node.name}"?\n(Child crates and tracks inside will be reassigned or deleted)`;
    if (!window.confirm(confirmMsg)) return;

    setSaving(true);
    setError(null);
    try {
      await deleteNode(node.id);
      onUpdated(undefined); // signal to reset or select root
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete container');
    } finally {
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
          {/* Container Name first for instant live feedback */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--mu)' }}>
            Container Name
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          </label>

          {/* Funky Text-Generated Thumbnail Live Preview */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: 8, border: '1px solid var(--bd)' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <CoverArt
                src={coverUrl}
                alt={name}
                size={52}
                type={type === 'Artist' ? 'artist' : type === 'Playlist' ? 'playlist' : type === 'Folder' ? 'folder' : 'album'}
                seed={name}
                variant={variant}
                rounded={type === 'Artist' ? 'full' : 6}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#f4f4f5' }}>
                    {coverUrl ? 'Custom Image / DiceBear API' : 'Funky Text-Generated Thumbnail'}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--mu)' }}>
                    {coverUrl ? 'API URL set' : 'Live morph on typing'}
                  </span>
                </div>
                <input
                  type="url"
                  placeholder="Paste artwork URL or use funky generators below..."
                  value={coverUrl}
                  onChange={e => setCoverUrl(e.target.value)}
                  style={{ width: '100%', fontSize: 11, padding: '4px 8px' }}
                />
              </div>
            </div>

            {/* Quick Generator & Variant Preset Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingTop: 6, borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <span style={{ fontSize: 10, color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                Funky Style:
              </span>
              <select
                value={variant}
                onChange={e => setVariant(e.target.value as any)}
                style={{ fontSize: 11, padding: '2px 6px', height: 24, borderRadius: 4, background: '#1c1c22', border: '1px solid var(--bd)', color: '#f4f4f5' }}
              >
                <option value="auto">Auto (seeded by name)</option>
                <option value="bauhaus">Bauhaus Geometric</option>
                <option value="ring">Groovy Rings</option>
                <option value="sunset">Sunset Gradient</option>
                <option value="pixel">8-Bit Pixel Synth</option>
                <option value="marble">Psychedelic Marble</option>
              </select>

              <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                <button
                  type="button"
                  title="Generate DiceBear Shapes vector art URL"
                  onClick={() => setCoverUrl(getDiceBearUrl(name || 'Crate', 'shapes'))}
                  style={{ fontSize: 10, padding: '2px 8px', height: 24, display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(255, 255, 255, 0.06)', borderRadius: 4, border: '1px solid rgba(255, 255, 255, 0.1)' }}
                >
                  <Sparkles size={11} color="#38bdf8" />
                  <span>DiceBear Shapes</span>
                </button>
                <button
                  type="button"
                  title="Generate DiceBear Rings vector art URL"
                  onClick={() => setCoverUrl(getDiceBearUrl(name || 'Crate', 'rings'))}
                  style={{ fontSize: 10, padding: '2px 8px', height: 24, display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(255, 255, 255, 0.06)', borderRadius: 4, border: '1px solid rgba(255, 255, 255, 0.1)' }}
                >
                  <span>DiceBear Rings</span>
                </button>
                {coverUrl && (
                  <button
                    type="button"
                    title="Reset to live local SVG thumbnail"
                    onClick={() => setCoverUrl('')}
                    style={{ fontSize: 10, padding: '2px 6px', height: 24, color: 'var(--mu)', background: 'transparent', border: '1px solid var(--bd)' }}
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          </div>

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
