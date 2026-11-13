import React, { useState } from 'react';
import type { LibraryNode } from '../types';
import { moveTracksBatch } from '../api';
import { FolderPickerDropdown } from './FolderPickerDropdown';
import { FolderInput } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  selectedTrackIds: number[];
  allTreeNodes: LibraryNode[];
  onMoved: () => void;
}

export const MoveTracksModal: React.FC<Props> = ({
  isOpen,
  onClose,
  selectedTrackIds,
  allTreeNodes,
  onMoved,
}) => {
  const [targetNodeId, setTargetNodeId] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || selectedTrackIds.length === 0) return null;

  const handleMove = async () => {
    if (!targetNodeId) {
      setError('Please choose a destination folder');
      return;
    }
    setMoving(true);
    setError(null);
    try {
      await moveTracksBatch(selectedTrackIds, targetNodeId);
      onMoved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to move tracks');
    } finally {
      setMoving(false);
    }
  };

  return (
    <>
      <div className="ov on" onClick={onClose} />
      <div className="dlg on" role="dialog" aria-label="Move Tracks">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FolderInput size={18} style={{ color: '#38bdf8' }} />
            <h2 style={{ margin: 0, fontSize: 16 }}>
              Move {selectedTrackIds.length} Track{selectedTrackIds.length > 1 ? 's' : ''}
            </h2>
          </div>
          <button onClick={onClose} style={{ padding: '2px 8px' }}>✕</button>
        </div>

        {error && <div style={{ color: '#f87171', marginBottom: 12, fontSize: 12 }}>{error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--mu)' }}>Choose Destination Folder:</span>
          <FolderPickerDropdown
            selectedFolderId={targetNodeId}
            onSelectFolder={setTargetNodeId}
            allTreeNodes={allTreeNodes}
            allowRoot={false}
            placeholder="Select destination folder..."
          />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={moving}>
            Cancel
          </button>
          <button className="p" onClick={handleMove} disabled={moving || !targetNodeId}>
            {moving ? 'Moving...' : 'Move Tracks'}
          </button>
        </div>
      </div>
    </>
  );
};
