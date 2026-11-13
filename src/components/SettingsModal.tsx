import React from 'react';
import { Settings, CheckCircle2, ShieldCheck, Sparkles, X, RotateCcw } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  statusEnabled: boolean;
  onToggleStatus: (enabled: boolean) => void;
  completedCount: number;
  onResetCompleted: () => void;
}

export const SettingsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  statusEnabled,
  onToggleStatus,
  completedCount,
  onResetCompleted,
}) => {
  if (!isOpen) return null;

  return (
    <>
      <div className="ov on" onClick={onClose} />
      <div
        className="dlg on"
        role="dialog"
        aria-label="Application Settings"
        style={{ maxWidth: 520, padding: '20px 24px' }}
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
              <div style={{ fontSize: 11, color: 'var(--mu)', marginTop: 1 }}>Preferences &amp; Library Status</div>
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
                  Marking an album as completed (via right-click) reveals its artwork and full vibrancy.
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

          {/* Quick Shortcuts Guide */}
          <div
            style={{
              border: '1px solid var(--bd)',
              background: 'rgba(255, 255, 255, 0.02)',
              borderRadius: 8,
              padding: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Sparkles size={14} style={{ color: '#38bdf8' }} />
              <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#f4f4f5' }}>
                Key Shortcuts Reference
              </h4>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: 11, color: 'var(--mu)' }}>
              <div><kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3, color: '#fafafa' }}>⌘K</kbd> Command Palette</div>
              <div><kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3, color: '#fafafa' }}>⌘F</kbd> Quick Track Filter</div>
              <div><kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3, color: '#fafafa' }}>⌘A</kbd> Select All in crate</div>
              <div><kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3, color: '#fafafa' }}>S</kbd> / <kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3, color: '#fafafa' }}>/</kbd> Search &amp; Add Music</div>
              <div><kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3, color: '#fafafa' }}>Shift</kbd> + Click Range select</div>
              <div><kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3, color: '#fafafa' }}>⌫</kbd> Delete selected</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <button
            type="button"
            className="p"
            onClick={onClose}
            style={{ padding: '6px 18px', fontSize: 12, borderRadius: 5 }}
          >
            Done
          </button>
        </div>
      </div>
    </>
  );
};
