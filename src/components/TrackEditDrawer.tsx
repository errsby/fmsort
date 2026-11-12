import React, { useState, useEffect } from 'react';
import type { Track } from '../types';
import { fmtDuration } from '../utils';
import { updateTrack, deleteTrack } from '../api';

interface Props {
  track: Track | null;
  isOpen: boolean;
  onClose: () => void;
  onTrackUpdated: () => void;
  onTrackDeleted: () => void;
}

export const TrackEditDrawer: React.FC<Props> = ({
  track,
  isOpen,
  onClose,
  onTrackUpdated,
  onTrackDeleted,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<Track>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (track) {
      setFormData({
        t: track.t,
        a: track.a,
        al: track.al,
        y: track.y,
        f: track.f,
        c: track.c,
        bc: track.bc,
        mb: track.mb,
        isrc: track.isrc,
        len: track.len,
        bpm: track.bpm,
        key: track.key,
      });
      setIsEditing(false);
      setError(null);
    }
  }, [track]);

  if (!isOpen || !track) return null;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateTrack(track.id, formData);
      setIsEditing(false);
      onTrackUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to save track');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete track "${track.t}"?`)) return;
    try {
      await deleteTrack(track.id);
      onClose();
      onTrackDeleted();
    } catch (err: any) {
      setError(err.message || 'Failed to delete track');
    }
  };

  return (
    <>
      <div className="ov on" onClick={onClose} />
      <aside className="sheet on" aria-label="Metadata">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Track Inspector
          </span>
          <button onClick={onClose} style={{ padding: '2px 8px' }}>
            Close
          </button>
        </div>

        {error && (
          <div style={{ color: '#f87171', padding: '8px 0', fontSize: 12 }}>
            {error}
          </div>
        )}

        {!isEditing ? (
          <>
            <h2 style={{ margin: '12px 0 2px', fontSize: 18 }}>{track.t}</h2>
            <div style={{ color: 'var(--mu)', marginBottom: 14 }}>
              {track.a} · {track.al}
            </div>

            <dl>
              <dt>Release year</dt>
              <dd className="mono">{track.y || '—'}</dd>

              <dt>Format</dt>
              <dd className="mono">{track.f || '—'}</dd>

              <dt>Catalog no.</dt>
              <dd className="mono">{track.c || '—'}</dd>

              <dt>Barcode</dt>
              <dd className="mono">{track.bc || '—'}</dd>

              <dt>Release MBID</dt>
              <dd className="mono" style={{ fontSize: 11 }}>
                {track.mb ? (
                  <a
                    href={`https://musicbrainz.org/release/${track.mb}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#93c5fd', textDecoration: 'none' }}
                  >
                    {track.mb} ↗
                  </a>
                ) : (
                  '—'
                )}
              </dd>

              <dt>ISRC</dt>
              <dd className="mono">{track.isrc || '—'}</dd>

              <dt>Length</dt>
              <dd className="mono">{fmtDuration(track.len)}</dd>

              <dt>BPM</dt>
              <dd className="mono">{track.bpm || '—'}</dd>

              <dt>Key</dt>
              <dd className="mono">{track.key || '—'}</dd>
            </dl>

            <div style={{ marginTop: 'auto', paddingTop: 20, display: 'flex', gap: 8 }}>
              <button className="p" onClick={() => setIsEditing(true)}>
                Edit Metadata
              </button>
              <button className="danger" onClick={handleDelete}>
                Delete Track
              </button>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>Edit Track Details</h3>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--mu)' }}>
              Track Title
              <input
                type="text"
                value={formData.t || ''}
                onChange={e => setFormData({ ...formData, t: e.target.value })}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--mu)' }}>
              Artist
              <input
                type="text"
                value={formData.a || ''}
                onChange={e => setFormData({ ...formData, a: e.target.value })}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--mu)' }}>
              Album
              <input
                type="text"
                value={formData.al || ''}
                onChange={e => setFormData({ ...formData, al: e.target.value })}
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--mu)' }}>
                Release Year
                <input
                  type="number"
                  value={formData.y || 0}
                  onChange={e => setFormData({ ...formData, y: parseInt(e.target.value, 10) || 0 })}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--mu)' }}>
                Format
                <input
                  type="text"
                  value={formData.f || ''}
                  onChange={e => setFormData({ ...formData, f: e.target.value })}
                />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--mu)' }}>
                Catalog No.
                <input
                  type="text"
                  value={formData.c || ''}
                  onChange={e => setFormData({ ...formData, c: e.target.value })}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--mu)' }}>
                Barcode
                <input
                  type="text"
                  value={formData.bc || ''}
                  onChange={e => setFormData({ ...formData, bc: e.target.value })}
                />
              </label>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--mu)' }}>
              MBID
              <input
                type="text"
                value={formData.mb || ''}
                onChange={e => setFormData({ ...formData, mb: e.target.value })}
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--mu)' }}>
                ISRC
                <input
                  type="text"
                  value={formData.isrc || ''}
                  onChange={e => setFormData({ ...formData, isrc: e.target.value })}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--mu)' }}>
                Length (seconds)
                <input
                  type="number"
                  value={formData.len || 0}
                  onChange={e => setFormData({ ...formData, len: parseInt(e.target.value, 10) || 0 })}
                />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--mu)' }}>
                BPM
                <input
                  type="number"
                  value={formData.bpm || 0}
                  onChange={e => setFormData({ ...formData, bpm: parseInt(e.target.value, 10) || 0 })}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--mu)' }}>
                Musical Key
                <input
                  type="text"
                  placeholder="e.g. Am, C, F#m"
                  value={formData.key || ''}
                  onChange={e => setFormData({ ...formData, key: e.target.value })}
                />
              </label>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button className="p" disabled={saving} onClick={handleSave}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button disabled={saving} onClick={() => setIsEditing(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
};
