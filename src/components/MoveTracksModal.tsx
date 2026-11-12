import React, { useState } from 'react';
import type { LibraryNode } from '../types';
import { getAllNodes } from '../utils';
import { moveTracksBatch } from '../api';

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
  const [targetNodeId, setTargetNodeId] = useState<string>('');
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || selectedTrackIds.length === 0) return null;

  const allContainers = getAllNodes(allTreeNodes);
  const effectiveTargetId = targetNodeId || allContainers[0]?.id || '';

  const handleMove = async () => {
    if (!effectiveTargetId) return;
    setMoving(true);
    setError(null);
    try {
      await moveTracksBatch(selectedTrackIds, effectiveTargetId);
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
          <h2 style={{ margin: 0, fontSize: 16 }}>
            Move {selectedTrackIds.length} Track{selectedTrackIds.length > 1 ? 's' : ''}
          </h2>
          <button onClick={onClose} style={{ padding: '2px 8px' }}>✕</button>
        </div>

        {error && <div style={{ color: '#f87171', marginBottom: 12, fontSize: 12 }}>{error}</div>}

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--mu)' }}>
          Choose Destination Container:
          <select
            value={effectiveTargetId}
            onChange={e => setTargetNodeId(e.target.value)}
          >
            {allContainers.map(c => (
              <option key={c.id} value={c.id}>
                [{c.type}] {c.name}
              </option>
            ))}
          </select>
        </label>

        <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={moving}>
            Cancel
          </button>
          <button className="p" onClick={handleMove} disabled={moving}>
            {moving ? 'Moving...' : 'Move Tracks'}
          </button>
        </div>
      </div>
    </>
  );
};
