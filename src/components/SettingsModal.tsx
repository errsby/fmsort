import React from 'react';
import {
  Settings,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
  X,
  RotateCcw,
  Layers,
  ArrowLeft,
  Search,
  SlidersHorizontal,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  statusEnabled: boolean;
  onToggleStatus: (enabled: boolean) => void;
  completedCount: number;
  onResetCompleted: () => void;
  onOpenExport?: () => void;
}

export const SettingsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  statusEnabled,
  onToggleStatus,
  completedCount,
  onResetCompleted,
  onOpenExport,
}) => {
  if (!isOpen) return null;

  return (
    <>
      <div className="ov on" onClick={onClose} />
      <div
        className="dlg on"
        role="dialog"
        aria-label="Application Settings"
        style={{ maxWidth: 560, padding: '20px 24px', maxHeight: '88vh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 6,
                background: 'rgba(167, 139, 250, 0.15)',
                border: '1px solid rgba(167, 139, 250, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#c4b5fd',
              }}
            >
              <Settings size={16} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#f4f4f5' }}>Settings</h2>
              <div style={{ fontSize: 11, color: 'var(--mu)', marginTop: 1 }}>Preferences, Library Status &amp; Shortcuts</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--mu)',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: 4,
              fontSize: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Status Mode Card */}
          <div
            style={{
              border: `1px solid ${statusEnabled ? 'rgba(99, 102, 241, 0.45)' : 'var(--bd)'}`,
              background: statusEnabled ? 'rgba(99, 102, 241, 0.08)' : 'rgba(255, 255, 255, 0.02)',
              borderRadius: 8,
              padding: 14,
              transition: 'all 0.2s ease',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                  <ShieldCheck size={16} style={{ color: statusEnabled ? '#818cf8' : 'var(--mu)' }} />
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fafafa' }}>
                    Album Completion Status
                  </h4>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      padding: '1px 6px',
                      borderRadius: 4,
                      background: statusEnabled ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                      color: statusEnabled ? '#4ade80' : 'var(--mu)',
                      border: `1px solid ${statusEnabled ? 'rgba(34, 197, 94, 0.4)' : 'transparent'}`,
                    }}
                  >
                    {statusEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <p style={{ margin: '0 0 10px', color: 'var(--mu)', fontSize: 12, lineHeight: 1.45 }}>
                  When enabled, uncompleted albums are greyed out and do not display cover banner thumbnails.
                  Marking an album as completed (via right-click or shortcut <kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '0 4px', borderRadius: 3, color: '#fafafa' }}>C</kbd>) reveals its artwork and full vibrancy.
                  Completion status automatically stretches across all versions of the album across all your crates.
                </p>
              </div>

              {/* Toggle Switch */}
              <button
                type="button"
                onClick={() => onToggleStatus(!statusEnabled)}
                style={{
                  width: 44,
                  height: 24,
                  borderRadius: 12,
                  background: statusEnabled ? '#4f46e5' : '#27272a',
                  border: `1px solid ${statusEnabled ? '#6366f1' : '#3f3f46'}`,
                  position: 'relative',
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'background 0.2s ease',
                  padding: 0,
                }}
                role="switch"
                aria-checked={statusEnabled}
                title={`Turn Status ${statusEnabled ? 'Off' : 'On'}`}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: '#ffffff',
                    position: 'absolute',
                    top: 2,
                    left: statusEnabled ? 22 : 2,
                    transition: 'left 0.2s ease',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.4)',
                  }}
                />
              </button>
            </div>

            {/* Status Statistics & Reset */}
            {statusEnabled && (
              <div
                style={{
                  marginTop: 10,
                  paddingTop: 10,
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#e4e4e7' }}>
                  <CheckCircle2 size={13} style={{ color: '#22c55e' }} />
                  <span>
                    <strong>{completedCount}</strong> album{completedCount === 1 ? '' : 's'} marked as completed
                  </span>
                </div>

                {completedCount > 0 && (
                  <button
                    type="button"
                    onClick={onResetCompleted}
                    style={{
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      color: '#f87171',
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 11,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                    title="Reset all completed marks"
                  >
                    <RotateCcw size={11} />
                    <span>Reset All</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Export & Backup Section */}
          <div
            style={{
              border: '1px solid var(--bd)',
              background: 'rgba(255, 255, 255, 0.02)',
              borderRadius: 8,
              padding: 14,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                  <Layers size={16} style={{ color: '#38bdf8' }} />
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fafafa' }}>
                    Library Backup &amp; Export
                  </h4>
                </div>
                <p style={{ margin: 0, color: 'var(--mu)', fontSize: 12, lineHeight: 1.45 }}>
                  Export your entire crates hierarchy, tracks, and metadata to a portable JSON backup file, or restore from an existing archive.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenExport?.();
                }}
                style={{
                  background: 'rgba(56, 189, 248, 0.12)',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  color: '#7dd3fc',
                  padding: '6px 14px',
                  borderRadius: 5,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
                title="Open Export & Backup Archive (⌘E)"
              >
                <Layers size={14} />
                <span>Export / Backup</span>
              </button>
            </div>
          </div>

          {/* Comprehensive Key Shortcuts Reference */}
          <div
            style={{
              border: '1px solid var(--bd)',
              background: 'rgba(255, 255, 255, 0.02)',
              borderRadius: 8,
              padding: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <Sparkles size={15} style={{ color: '#a78bfa' }} />
              <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#f4f4f5' }}>
                Key Shortcuts Reference
              </h4>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Category: Navigation */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#818cf8', marginBottom: 5 }}>
                  Navigation &amp; Views
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 12px', fontSize: 11, color: 'var(--mu)' }}>
                  <div><kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3, color: '#fafafa' }}>Backspace</kbd> / <kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3, color: '#fafafa' }}>[</kbd> Go back up / parent</div>
                  <div><kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3, color: '#fafafa' }}>Alt + →</kbd> / <kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3, color: '#fafafa' }}>]</kbd> Go forward in history</div>
                  <div><kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3, color: '#fafafa' }}>Enter</kbd> Open container / Inspect track</div>
                  <div><kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3, color: '#fafafa' }}>Space</kbd> Preview &amp; inspect track</div>
                  <div><kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3, color: '#fafafa' }}>Esc</kbd> Close modal / Clear selection</div>
                </div>
              </div>

              {/* Category: Music & Catalog */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#38bdf8', marginBottom: 5 }}>
                  Releases &amp; Catalog
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 12px', fontSize: 11, color: 'var(--mu)' }}>
                  <div><kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3, color: '#fafafa' }}>A</kbd> / <kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3, color: '#fafafa' }}>⌘I</kbd> Search releases (Discogs)</div>
                  <div><kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3, color: '#fafafa' }}>T</kbd> Add track manually</div>
                  <div><kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3, color: '#fafafa' }}>N</kbd> New container (Folder / Album)</div>
                  <div><kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3, color: '#fafafa' }}>C</kbd> Toggle Album Completed status</div>
                </div>
              </div>

              {/* Category: Tools & Batch */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#34d399', marginBottom: 5 }}>
                  Tools &amp; Organization
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 12px', fontSize: 11, color: 'var(--mu)' }}>
                  <div><kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3, color: '#fafafa' }}>⌘K</kbd> Command Palette / Quick jump</div>
                  <div><kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3, color: '#fafafa' }}>⌘F</kbd> Filter tracks in crate</div>
                  <div><kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3, color: '#fafafa' }}>⌘A</kbd> Select all items in view</div>
                  <div><kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3, color: '#fafafa' }}>⌘C</kbd> / <kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3, color: '#fafafa' }}>⌘X</kbd> Copy / Cut selected items</div>
                  <div><kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3, color: '#fafafa' }}>⌘V</kbd> Paste items into active folder</div>
                  <div><kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3, color: '#fafafa' }}>M</kbd> Move selected tracks / items</div>
                  <div><kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3, color: '#fafafa' }}>R</kbd> Resolve missing ISRC codes</div>
                  <div><kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3, color: '#fafafa' }}>E</kbd> Rename / edit container</div>
                  <div><kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3, color: '#fafafa' }}>⌘E</kbd> Export &amp; backup library</div>
                  <div><kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3, color: '#fafafa' }}>⌫</kbd> Delete selected items</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <button
            type="button"
            className="p"
            onClick={onClose}
            style={{ padding: '6px 20px', fontSize: 12, borderRadius: 5 }}
          >
            Done
          </button>
        </div>
      </div>
    </>
  );
};
