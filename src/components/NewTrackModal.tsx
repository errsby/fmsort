import React, { useState, useEffect } from 'react';
import type { LibraryNode } from '../types';
import { createTrack } from '../api';
import { CoverArt } from './CoverArt';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentNode: LibraryNode | null;
  onCreated: () => void;
}

export const NewTrackModal: React.FC<Props> = ({
  isOpen,
  onClose,
  currentNode,
  onCreated,
}) => {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [year, setYear] = useState<number>(0);
  const [format, setFormat] = useState('Digital');
  const [catalogNo, setCatalogNo] = useState('—');
  const [barcode, setBarcode] = useState('—');
  const [mbid, setMbid] = useState('—');
  const [isrc, setIsrc] = useState('—');
  const [mins, setMins] = useState<number>(0);
  const [secs, setSecs] = useState<number>(0);
  const [bpm, setBpm] = useState<number>(0);
  const [key, setKey] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setArtist('');
      setAlbum(currentNode?.name || '');
      setYear(new Date().getFullYear());
      setFormat('Digital');
      setCatalogNo('—');
      setBarcode('—');
      setMbid('—');
      setIsrc('—');
      setMins(3);
      setSecs(30);
      setBpm(0);
      setKey('');
      setCoverUrl(currentNode?.cover_url || '');
      setError(null);
    }
  }, [isOpen, currentNode]);

  if (!isOpen || !currentNode) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Track title is required');
      return;
    }
    if (!artist.trim()) {
      setError('Artist is required');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const lengthSeconds = Math.max(0, mins * 60 + secs);
      await createTrack(currentNode.id, {
        t: title.trim(),
        a: artist.trim(),
        al: album.trim() || '—',
        y: year || 0,
        f: format.trim() || 'Digital',
        c: catalogNo.trim() || '—',
        bc: barcode.trim() || '—',
        mb: mbid.trim() || '—',
        isrc: isrc.trim() || '—',
        len: lengthSeconds,
        bpm: bpm || 0,
        key: key.trim(),
        cover_url: coverUrl.trim(),
      });
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create track');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="ov on" onClick={onClose} />
      <div className="dlg on" role="dialog" aria-label="Add Track">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Add Track to [{currentNode.type}] {currentNode.name}</h2>
          <button onClick={onClose} style={{ padding: '2px 8px' }}>✕</button>
        </div>

        {error && <div style={{ color: '#f87171', marginBottom: 12, fontSize: 12 }}>{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '8px 10px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: 6, border: '1px solid var(--bd)' }}>
            <CoverArt
              src={coverUrl}
              alt={title || 'Track Cover'}
              size={46}
              type="album"
              seed={album || title || artist}
              rounded={6}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 11, color: 'var(--mu)', display: 'block', marginBottom: 3 }}>
                Cover Artwork URL (optional)
              </span>
              <input
                type="url"
                placeholder="https://... (or leave blank for album art)"
                value={coverUrl}
                onChange={e => setCoverUrl(e.target.value)}
                style={{ width: '100%', fontSize: 12, padding: '4px 8px' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--mu)' }}>
              Track Title *
              <input
                type="text"
                placeholder="Track Title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                autoFocus
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--mu)' }}>
              Artist *
              <input
                type="text"
                placeholder="Artist name"
                value={artist}
                onChange={e => setArtist(e.target.value)}
              />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--mu)' }}>
              Album / Release
              <input
                type="text"
                placeholder="Album name"
                value={album}
                onChange={e => setAlbum(e.target.value)}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--mu)' }}>
              Release Year
              <input
                type="number"
                value={year || ''}
                onChange={e => setYear(parseInt(e.target.value, 10) || 0)}
              />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--mu)' }}>
              Format
              <input
                type="text"
                placeholder="e.g. Vinyl LP, CD, Digital"
                value={format}
                onChange={e => setFormat(e.target.value)}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--mu)' }}>
              Catalog Number
              <input
                type="text"
                placeholder="Catalog no."
                value={catalogNo}
                onChange={e => setCatalogNo(e.target.value)}
              />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--mu)' }}>
              Barcode
              <input
                type="text"
                placeholder="Barcode"
                value={barcode}
                onChange={e => setBarcode(e.target.value)}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--mu)' }}>
              ISRC
              <input
                type="text"
                placeholder="ISRC code"
                value={isrc}
                onChange={e => setIsrc(e.target.value)}
              />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--mu)' }}>
              Duration
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input
                  type="number"
                  min="0"
                  style={{ width: 60 }}
                  value={mins}
                  onChange={e => setMins(parseInt(e.target.value, 10) || 0)}
                />
                m
                <input
                  type="number"
                  min="0"
                  max="59"
                  style={{ width: 60 }}
                  value={secs}
                  onChange={e => setSecs(parseInt(e.target.value, 10) || 0)}
                />
                s
              </div>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--mu)' }}>
              BPM
              <input
                type="number"
                placeholder="BPM"
                value={bpm || ''}
                onChange={e => setBpm(parseInt(e.target.value, 10) || 0)}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--mu)' }}>
              Musical Key
              <input
                type="text"
                placeholder="e.g. Am"
                value={key}
                onChange={e => setKey(e.target.value)}
              />
            </label>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="p" disabled={saving}>
              {saving ? 'Adding...' : 'Add Track'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
};
