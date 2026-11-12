import React, { useRef, useEffect } from 'react';
import {
  Bell,
  User,
  Check,
  ExternalLink,
  Sparkles,
  Database,
  ShieldCheck,
  Disc,
  Library,
  Rss,
} from 'lucide-react';
import type { LibraryNode } from '../types';
import { flattenTracks } from '../utils';

interface SocialProps {
  tree: LibraryNode[];
  activeNode: LibraryNode | null;
  currentPage: 'library' | 'feed';
  onPageChange: (page: 'library' | 'feed') => void;
}

export const SocialWidgets: React.FC<SocialProps> = ({
  tree,
  currentPage,
  onPageChange,
}) => {
  const [activeMenu, setActiveMenu] = React.useState<'notifications' | 'profile' | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    if (activeMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeMenu]);

  // Compute live library stats
  const totalContainers = React.useMemo(() => {
    const countNodes = (nodes: LibraryNode[]): number => {
      let count = nodes.length;
      for (const n of nodes) {
        if (n.children && n.children.length > 0) {
          count += countNodes(n.children);
        }
      }
      return count;
    };
    return countNodes(tree);
  }, [tree]);

  const totalTracks = React.useMemo(() => {
    let count = 0;
    for (const n of tree) {
      count += flattenTracks(n).length;
    }
    return count;
  }, [tree]);

  return (
    <div className="header-right" ref={menuRef} style={{ position: 'relative' }}>
      {/* Primary Page Navigation Tabs: Library & Feed */}
      <div className="header-primary-nav" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={currentPage === 'library'}
          className={`nav-tab-btn ${currentPage === 'library' ? 'active' : ''}`}
          onClick={() => onPageChange('library')}
          title="Switch to Library Workspace"
        >
          <Library size={14} className="nav-tab-icon" />
          <span className="nav-tab-text">Library</span>
          {currentPage === 'library' && (
            <>
              <span className="nav-tab-top-accent" />
              <span className="nav-tab-seamless-bridge" />
            </>
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={currentPage === 'feed'}
          className={`nav-tab-btn ${currentPage === 'feed' ? 'active' : ''}`}
          onClick={() => onPageChange('feed')}
          title="Switch to Community Feed"
        >
          <Rss size={14} className="nav-tab-icon" />
          <span className="nav-tab-text">Feed</span>
          <span className="feed-live-beacon" title="Live stream active">
            <span className="beacon-ping" />
            <span className="beacon-dot" />
          </span>
          {currentPage === 'feed' && (
            <>
              <span className="nav-tab-top-accent" />
              <span className="nav-tab-seamless-bridge" />
            </>
          )}
        </button>
      </div>

      {/* Notifications Button */}
      <button
        type="button"
        className={`btn-icon ${activeMenu === 'notifications' ? 'active' : ''}`}
        title="Notifications"
        aria-label="Notifications"
        onClick={() => setActiveMenu(activeMenu === 'notifications' ? null : 'notifications')}
      >
        <Bell size={16} />
        <span className="unread-dot" />
      </button>

      {/* User Profile Avatar */}
      <button
        type="button"
        className="avatar-btn"
        title="User Profile & Account"
        aria-label="User Profile & Account"
        onClick={() => setActiveMenu(activeMenu === 'profile' ? null : 'profile')}
      >
        <span>MC</span>
      </button>

      {/* Notifications Popover */}
      {activeMenu === 'notifications' && (
        <div className="popover-menu notif-popover">
          <div className="popover-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13 }}>
              <Bell size={15} style={{ color: '#38bdf8' }} />
              <span>Notifications</span>
            </div>
            <span style={{ fontSize: 11, color: 'var(--mu)' }}>2 unread</span>
          </div>

          <div className="popover-body">
            <div className="notif-item unread">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <ShieldCheck size={14} style={{ color: '#38bdf8' }} />
                <strong style={{ fontSize: 12 }}>Discogs Server Credentials Active</strong>
              </div>
              <p className="notif-desc">
                Your Developer App is connected. 17.5M+ physical releases and vinyl pressings are searchable.
              </p>
              <div className="notif-time">Just now</div>
            </div>

            <div className="notif-item unread">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <Database size={14} style={{ color: '#4ade80' }} />
                <strong style={{ fontSize: 12 }}>Local Database Initialized</strong>
              </div>
              <p className="notif-desc">
                SQLite WAL persistence is active. Your library operates with zero latency.
              </p>
              <div className="notif-time">Today</div>
            </div>
          </div>

          <div className="popover-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--mu)' }}>All systems operational</span>
            <button
              type="button"
              style={{ border: 'none', background: 'transparent', color: '#93c5fd', fontSize: 11, cursor: 'pointer', padding: 0 }}
              onClick={() => setActiveMenu(null)}
            >
              Mark all as read
            </button>
          </div>
        </div>
      )}

      {/* Profile Popover */}
      {activeMenu === 'profile' && (
        <div className="popover-menu profile-popover">
          <div className="profile-hero">
            <div className="profile-large-avatar">
              <span>MC</span>
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Music Collector</div>
              <div style={{ fontSize: 11, color: 'var(--mu)' }}>@collector_hq</div>
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="profile-stats">
            <div className="stat-card">
              <span className="stat-val">{totalContainers}</span>
              <span className="stat-lbl">Containers</span>
            </div>
            <div className="stat-card">
              <span className="stat-val">{totalTracks}</span>
              <span className="stat-lbl">Tracks</span>
            </div>
            <div className="stat-card">
              <span className="stat-val">Hi-Res</span>
              <span className="stat-lbl">Audio Mode</span>
            </div>
          </div>

          <div className="profile-options">
            <div className="profile-row">
              <User size={14} style={{ color: 'var(--mu)' }} />
              <span>Profile & Account Settings</span>
            </div>
            <div className="profile-row">
              <Disc size={14} style={{ color: 'var(--mu)' }} />
              <span>Collector Preferences & Formats</span>
            </div>
            <div className="profile-row">
              <ShieldCheck size={14} style={{ color: 'var(--mu)' }} />
              <span>Connected APIs (Discogs & Deezer)</span>
            </div>
            <div className="profile-row" style={{ color: '#93c5fd' }}>
              <Check size={14} />
              <span>Theme: Dark Studio (Geist)</span>
            </div>
          </div>

          <div className="popover-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--mu)' }}>FMSort Studio v1.0</span>
            <button
              type="button"
              style={{ border: 'none', background: 'transparent', color: '#f87171', fontSize: 11, cursor: 'pointer', padding: 0 }}
              onClick={() => setActiveMenu(null)}
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
