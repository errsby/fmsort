import React, { useState } from 'react';
import { exportLibrary, importLibrary } from '../api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onLibraryRestored: () => void;
}

export const BackupModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onLibraryRestored,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleExport = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await exportLibrary();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fmsort-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setSuccess('Library exported successfully.');
    } catch (err: any) {
      setError(err.message || 'Failed to export backup');
    } finally {
      setLoading(false);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm('Importing will overwrite your existing library database. Do you wish to continue?')) {
      e.target.value = '';
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const text = await file.text();
      const json = JSON.parse(text);
      if (!json.nodes || !json.tracks) {
        throw new Error('Invalid backup file format');
      }
      await importLibrary(json);
      setSuccess('Library restored successfully.');
      onLibraryRestored();
      setTimeout(onClose, 1000);
    } catch (err: any) {
      setError(err.message || 'Failed to import backup');
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  return (
    <>
      <div className="ov on" onClick={onClose} />
      <div className="dlg on" role="dialog" aria-label="Backup & Restore">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Backup & Restore Library</h2>
          <button onClick={onClose} style={{ padding: '2px 8px' }}>✕</button>
        </div>

        {error && <div style={{ color: '#f87171', marginBottom: 12, fontSize: 12 }}>{error}</div>}
        {success && <div style={{ color: '#4ade80', marginBottom: 12, fontSize: 12 }}>{success}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ border: '1px solid var(--bd)', borderRadius: 8, padding: 12 }}>
            <h4 style={{ margin: '0 0 6px', fontSize: 14 }}>Export Library</h4>
            <p style={{ margin: '0 0 10px', color: 'var(--mu)', fontSize: 12 }}>
              Download a complete JSON snapshot of all folders, playlists, containers, and tracks with their full MusicBrainz tags.
            </p>
            <button className="p" onClick={handleExport} disabled={loading}>
              Download JSON Backup
            </button>
          </div>

          <div style={{ border: '1px solid var(--bd)', borderRadius: 8, padding: 12 }}>
            <h4 style={{ margin: '0 0 6px', fontSize: 14 }}>Restore Library</h4>
            <p style={{ margin: '0 0 10px', color: 'var(--mu)', fontSize: 12 }}>
              Restore your library from a previously exported JSON backup file.
            </p>
            <label style={{ display: 'inline-block' }}>
              <input
                type="file"
                accept=".json"
                style={{ display: 'none' }}
                onChange={handleImportFile}
                disabled={loading}
              />
              <span className="p" style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 12px',
                borderRadius: 6,
                cursor: 'pointer',
                background: 'var(--fg)',
                color: '#09090b',
                fontWeight: 500
              }}>
                Choose Backup File (.json)
              </span>
            </label>
          </div>
        </div>
      </div>
    </>
  );
};
