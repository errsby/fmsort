import React, { useState } from 'react';
import {
  Settings,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
  X,
  RotateCcw,
  Layers,
  Database,
  CheckSquare,
  Keyboard,
  ExternalLink,
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

type SettingsTab = 'general' | 'backup' | 'shortcuts';

export const SettingsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  statusEnabled,
  onToggleStatus,
  completedCount,
  onResetCompleted,
  onOpenExport,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  if (!isOpen) return null;

  return (
    <>
      <div className="ov on" onClick={onClose} />
      <div
        className="dlg on settings-redesign-modal"
        role="dialog"
        aria-label="Application Settings"
      >
        {/* Header */}
        <div className="settings-header">
          <div className="settings-header-left">
            <div className="settings-header-icon-wrap">
              <Settings size={16} />
            </div>
            <div>
              <h2 className="settings-header-title">Settings &amp; Preferences</h2>
              <div className="settings-header-sub">Configure library behavior, completion tracking &amp; keybinds</div>
            </div>
          </div>
          <button
            type="button"
            className="settings-close-btn"
            onClick={onClose}
            title="Close (Esc)"
          >
            <X size={15} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="settings-tab-nav">
          <button
            type="button"
            className={`settings-tab-btn ${activeTab === 'general' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            <ShieldCheck size={14} />
            <span>General &amp; Status</span>
          </button>
          <button
            type="button"
            className={`settings-tab-btn ${activeTab === 'backup' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('backup')}
          >
            <Layers size={14} />
            <span>Backup &amp; Archive</span>
          </button>
          <button
            type="button"
            className={`settings-tab-btn ${activeTab === 'shortcuts' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('shortcuts')}
          >
            <Keyboard size={14} />
            <span>Keybinds</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="settings-tab-body">
          {activeTab === 'general' && (
            <div className="settings-section-stack">
              {/* Album Completion Mode Card */}
              <div className={`settings-card ${statusEnabled ? 'status-active' : ''}`}>
                <div className="settings-card-row">
                  <div className="settings-card-info">
                    <div className="settings-card-title-row">
                      <ShieldCheck size={15} className="settings-card-icon" style={{ color: statusEnabled ? '#818cf8' : '#71717a' }} />
                      <h4 className="settings-card-title">Album Completion Mode</h4>
                      <span className={`settings-status-badge ${statusEnabled ? 'enabled' : ''}`}>
                        {statusEnabled ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                    <p className="settings-card-desc">
                      Dims uncompleted albums and tracks in lists. Marking an album as completed (<kbd className="settings-kbd">C</kbd>) reveals full vibrancy across all crates.
                    </p>
                  </div>

                  {/* Toggle Switch */}
                  <button
                    type="button"
                    className={`settings-toggle-switch ${statusEnabled ? 'on' : ''}`}
                    onClick={() => onToggleStatus(!statusEnabled)}
                    role="switch"
                    aria-checked={statusEnabled}
                    title={`Turn Completion Status ${statusEnabled ? 'Off' : 'On'}`}
                  >
                    <div className="settings-toggle-knob" />
                  </button>
                </div>

                {/* Sub-box: Count & Reset */}
                {statusEnabled && (
                  <div className="settings-subbox">
                    <div className="settings-subbox-left">
                      <CheckCircle2 size={13} style={{ color: '#22c55e' }} />
                      <span>
                        <strong>{completedCount}</strong> album{completedCount === 1 ? '' : 's'} completed
                      </span>
                    </div>

                    {completedCount > 0 && (
                      <button
                        type="button"
                        className="settings-reset-btn"
                        onClick={onResetCompleted}
                        title="Reset all completed album marks"
                      >
                        <RotateCcw size={11} />
                        <span>Reset All</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Workflow & Productivity Preferences */}
              <div className="settings-card">
                <div className="settings-card-title-row" style={{ marginBottom: 10 }}>
                  <CheckSquare size={14} style={{ color: '#38bdf8' }} />
                  <h4 className="settings-card-title">Interactive Workflow Controls</h4>
                </div>
                <div className="settings-compact-list">
                  <div className="settings-compact-item">
                    <div className="settings-compact-left">
                      <span className="settings-compact-name">Selection Action Bar</span>
                      <span className="settings-compact-desc">Bottom popup bar showing batch operations when items are highlighted</span>
                    </div>
                    <span className="settings-pill-active">Enabled</span>
                  </div>

                  <div className="settings-compact-item">
                    <div className="settings-compact-left">
                      <span className="settings-compact-name">Click-to-Select Mode</span>
                      <span className="settings-compact-desc">Multi-select items rapidly without needing to hold Shift or Cmd key</span>
                    </div>
                    <span className="settings-pill-active">Available</span>
                  </div>

                  <div className="settings-compact-item">
                    <div className="settings-compact-left">
                      <span className="settings-compact-name">Pinnable Navigational Submenu</span>
                      <span className="settings-compact-desc">Drag, vertically resize, and pin the crate hierarchy menu to the screen</span>
                    </div>
                    <span className="settings-pill-active">Available</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'backup' && (
            <div className="settings-section-stack">
              <div className="settings-card">
                <div className="settings-card-row">
                  <div className="settings-card-info">
                    <div className="settings-card-title-row">
                      <Layers size={15} style={{ color: '#38bdf8' }} />
                      <h4 className="settings-card-title">Library Backup &amp; Archive</h4>
                      <span className="settings-status-badge enabled">JSON</span>
                    </div>
                    <p className="settings-card-desc">
                      Export your entire crates hierarchy, track records, and metadata to a portable JSON backup file.
                    </p>
                  </div>

                  <button
                    type="button"
                    className="settings-action-btn primary"
                    onClick={() => {
                      onClose();
                      onOpenExport?.();
                    }}
                    title="Open Export & Backup Archive (⌘E)"
                  >
                    <Layers size={13} />
                    <span>Export / Backup</span>
                    <kbd className="settings-kbd">⌘E</kbd>
                  </button>
                </div>
              </div>

              <div className="settings-card">
                <div className="settings-card-row">
                  <div className="settings-card-info">
                    <div className="settings-card-title-row">
                      <Database size={15} style={{ color: '#a78bfa' }} />
                      <h4 className="settings-card-title">SQLite Database Health</h4>
                    </div>
                    <p className="settings-card-desc">
                      Continuous database persistence with SQLite WAL mode. All crate operations, renames, and track links are permanently saved.
                    </p>
                  </div>
                  <span className="settings-pill-active">Healthy</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'shortcuts' && (
            <div className="settings-section-stack">
              <div className="settings-card">
                <div className="settings-card-title-row" style={{ marginBottom: 12 }}>
                  <Sparkles size={14} style={{ color: '#a78bfa' }} />
                  <h4 className="settings-card-title">Complete Keyboard Shortcuts</h4>
                </div>

                <div className="settings-shortcuts-grid">
                  {/* Category: Navigation */}
                  <div className="settings-shortcut-group">
                    <div className="settings-shortcut-cat-title">Navigation &amp; Views</div>
                    <div className="settings-shortcut-row"><kbd className="settings-kbd">Backspace</kbd> / <kbd className="settings-kbd">[</kbd> <span>Go back / parent</span></div>
                    <div className="settings-shortcut-row"><kbd className="settings-kbd">Alt + →</kbd> / <kbd className="settings-kbd">]</kbd> <span>Go forward in history</span></div>
                    <div className="settings-shortcut-row"><kbd className="settings-kbd">Enter</kbd> <span>Open container / Inspect</span></div>
                    <div className="settings-shortcut-row"><kbd className="settings-kbd">Space</kbd> <span>Quick preview track</span></div>
                    <div className="settings-shortcut-row"><kbd className="settings-kbd">⌘\</kbd> <span>Toggle workspace drawer</span></div>
                    <div className="settings-shortcut-row"><kbd className="settings-kbd">Esc</kbd> <span>Close modal / Clear selection</span></div>
                  </div>

                  {/* Category: Catalog */}
                  <div className="settings-shortcut-group">
                    <div className="settings-shortcut-cat-title">Releases &amp; Music</div>
                    <div className="settings-shortcut-row"><kbd className="settings-kbd">A</kbd> / <kbd className="settings-kbd">⌘I</kbd> <span>Search &amp; import releases</span></div>
                    <div className="settings-shortcut-row"><kbd className="settings-kbd">T</kbd> <span>Add track manually</span></div>
                    <div className="settings-shortcut-row"><kbd className="settings-kbd">N</kbd> <span>New folder / crate</span></div>
                    <div className="settings-shortcut-row"><kbd className="settings-kbd">C</kbd> <span>Toggle album completion</span></div>
                  </div>

                  {/* Category: Tools */}
                  <div className="settings-shortcut-group" style={{ gridColumn: 'span 2' }}>
                    <div className="settings-shortcut-cat-title">Organization &amp; Batch Operations</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 14px' }}>
                      <div className="settings-shortcut-row"><kbd className="settings-kbd">⌘K</kbd> <span>Command Palette</span></div>
                      <div className="settings-shortcut-row"><kbd className="settings-kbd">⌘F</kbd> <span>Filter tracks in crate</span></div>
                      <div className="settings-shortcut-row"><kbd className="settings-kbd">⌘A</kbd> <span>Select all in active view</span></div>
                      <div className="settings-shortcut-row"><kbd className="settings-kbd">⌘C</kbd> / <kbd className="settings-kbd">⌘X</kbd> <span>Copy / Cut selection</span></div>
                      <div className="settings-shortcut-row"><kbd className="settings-kbd">⌘V</kbd> <span>Paste items into folder</span></div>
                      <div className="settings-shortcut-row"><kbd className="settings-kbd">M</kbd> <span>Move selected tracks</span></div>
                      <div className="settings-shortcut-row"><kbd className="settings-kbd">R</kbd> <span>Resolve missing ISRCs</span></div>
                      <div className="settings-shortcut-row"><kbd className="settings-kbd">E</kbd> <span>Edit metadata / rename</span></div>
                      <div className="settings-shortcut-row"><kbd className="settings-kbd">⌘E</kbd> <span>Export &amp; backup library</span></div>
                      <div className="settings-shortcut-row"><kbd className="settings-kbd">⌫</kbd> <span>Delete selected items</span></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="settings-footer">
          <div className="settings-footer-brand">
            FMSort Studio · Local Catalog Manager
          </div>
          <button
            type="button"
            className="settings-done-btn"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </>
  );
};
