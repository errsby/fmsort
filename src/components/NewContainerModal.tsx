import React, { useState, useEffect } from 'react';
import type { LibraryNode } from '../types';
import { createNode } from '../api';
import { CoverArt, getDiceBearUrl } from './CoverArt';
import type { FunkyVariant } from './CoverArt';
import { FolderPickerDropdown } from './FolderPickerDropdown';
import { Sparkles, FolderPlus } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentNode: LibraryNode | null;
  allTreeNodes: LibraryNode[];
  onCreated: (newNodeId: string) => void;
}

export const NewContainerModal: React.FC<Props> = ({
  isOpen,
  onClose,
  currentNode,
  allTreeNodes,
  onCreated,
}) => {
  const [parentId, setParentId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [variant, setVariant] = useState<FunkyVariant | 'auto'>('auto');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setParentId(currentNode?.id || null);
      setName('');
      setCoverUrl('');
      setVariant('auto');
      setError(null);
    }
  }, [isOpen, currentNode]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Folder name cannot be empty');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await createNode({
        parent_id: parentId || null,
        type: 'Folder',
        name: name.trim(),
        cover_url: coverUrl.trim() || undefined,
      });
      onCreated(res.id);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to create folder');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="ov on" onClick={onClose} />
      <div className="dlg on" role="dialog" aria-label="Create New Folder">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FolderPlus size={18} style={{ color: '#38bdf8' }} />
            <h2 style={{ margin: 0, fontSize: 16 }}>New Folder / Crate</h2>
          </div>
          <button onClick={onClose} style={{ padding: '2px 8px' }}>✕</button>
        </div>

        {error && <div style={{ color: '#f87171', marginBottom: 12, fontSize: 12 }}>{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Folder Name first so live thumbnail responds immediately to typing */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--mu)' }}>
            Folder Name
            <input
              type="text"
              placeholder="e.g. Ambient &amp; Drone, Warp Records, Favorites..."
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
                alt={name || 'Folder'}
                size={52}
                type="folder"
                seed={name || 'New Crate'}
                variant={variant}
                rounded={6}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#f4f4f5' }}>
                    {coverUrl ? 'Custom Image URL' : 'Text-Generated Thumbnail'}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--mu)' }}>
                    {coverUrl ? 'Custom' : 'Live morph on typing'}
                  </span>
                </div>
                <input
                  type="url"
                  placeholder="Paste artwork URL or use generators below..."
                  value={coverUrl}
                  onChange={e => setCoverUrl(e.target.value)}
                  style={{ width: '100%', fontSize: 11, padding: '4px 8px' }}
                />
              </div>
            </div>

            {/* Quick Generator & Variant Preset Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingTop: 6, borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <span style={{ fontSize: 10, color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                Style:
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
                    title="Reset to local SVG thumbnail"
                    onClick={() => setCoverUrl('')}
                    style={{ fontSize: 10, padding: '2px 6px', height: 24, color: 'var(--mu)', background: 'transparent', border: '1px solid var(--bd)' }}
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Custom Parent Folder Picker Submenu */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--mu)' }}>Parent Folder</span>
            <FolderPickerDropdown
              selectedFolderId={parentId}
              onSelectFolder={setParentId}
              allTreeNodes={allTreeNodes}
              allowRoot={true}
              placeholder="Select parent folder..."
            />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="p" disabled={saving}>
              {saving ? 'Creating...' : 'Create Folder'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
};
