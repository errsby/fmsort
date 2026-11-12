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
  Heart,
  MessageCircle,
  Radio,
} from 'lucide-react';
import type { LibraryNode } from '../types';
import { flattenTracks } from '../utils';

interface SocialProps {
  tree: LibraryNode[];
  activeNode: LibraryNode | null;
  currentPage?: 'library' | 'feed';
  onPageChange?: (page: 'library' | 'feed') => void;
}

export const SocialWidgets: React.FC<SocialProps> = ({
  tree,
  currentPage = 'library',
  onPageChange,
}) => {
  const [activeMenu, setActiveMenu] = React.useState<'notifications' | 'profile' | null>(null);
  const [unreadCount, setUnreadCount] = React.useState(3);
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
    <div className="header-social-controls" ref={menuRef}>
      {/* Notifications Button */}
      <button
        type="button"
        className={`btn-icon header-notif-btn ${activeMenu === 'notifications' ? 'active' : ''}`}
        title="Social & Music Activity Notifications"
        aria-label="Activity Notifications"
        onClick={() => {
          setActiveMenu(activeMenu === 'notifications' ? null : 'notifications');
          if (activeMenu !== 'notifications') setUnreadCount(0);
        }}
      >
        <Bell size={15} />
        {unreadCount > 0 && <span className="unread-dot" />}
      </button>

      {/* User Profile Avatar with Online Status */}
      <button
        type="button"
        className="avatar-btn header-avatar-btn"
        title="User Profile & Community Status"
        aria-label="User Profile"
        onClick={() => setActiveMenu(activeMenu === 'profile' ? null : 'profile')}
      >
        <span>MC</span>
        <span className="avatar-online-dot" />
      </button>

      {/* Notifications Popover */}
      {activeMenu === 'notifications' && (
        <div className="popover-menu notif-popover">
          <div className="popover-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13 }}>
              <Bell size={14} style={{ color: '#38bdf8' }} />
              <span>Community Notifications</span>
            </div>
            <span className="badge-pill">Live Activity</span>
          </div>

          <div className="popover-body">
            <div className="notif-item unread">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <Heart size={13} style={{ color: '#f43f5e' }} />
                <strong style={{ fontSize: 12 }}>Elena Rostova liked your review</strong>
              </div>
              <p className="notif-desc">
                &ldquo;Live at Bush Hall is pure magic on vinyl &amp; hi-res.&rdquo;
              </p>
              <div className="notif-time">5m ago · Feed Activity</div>
            </div>

            <div className="notif-item unread">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <Disc size={13} style={{ color: '#fbbf24' }} />
                <strong style={{ fontSize: 12 }}>Marcus Chen shared a new pressing</strong>
              </div>
              <p className="notif-desc">
                Daft Punk — Homework (1997 French 2xLP Pressing) logged to collection.
              </p>
              <div className="notif-time">45m ago · Crate Dig</div>
            </div>

            <div className="notif-item">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <Sparkles size={13} style={{ color: '#a855f7' }} />
                <strong style={{ fontSize: 12 }}>Record Store Day 2026 Preview</strong>
              </div>
              <p className="notif-desc">
                420+ exclusive limited editions announced for independent record stores.
              </p>
              <div className="notif-time">2h ago · Release Radar</div>
            </div>

            <div className="notif-item">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <Database size={13} style={{ color: '#4ade80' }} />
                <strong style={{ fontSize: 12 }}>Local Catalog Synchronized</strong>
              </div>
              <p className="notif-desc">
                SQLite WAL database is active with zero latency. Discogs metadata verified.
              </p>
              <div className="notif-time">Today</div>
            </div>
          </div>

          <div className="popover-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {onPageChange && (
              <button
                type="button"
                className="notif-footer-link"
                onClick={() => {
                  onPageChange('feed');
                  setActiveMenu(null);
                }}
              >
                <span>View Full Feed</span>
                <span aria-hidden="true">→</span>
              </button>
            )}
            <button
              type="button"
              style={{ border: 'none', background: 'transparent', color: '#93c5fd', fontSize: 11, cursor: 'pointer', padding: 0 }}
              onClick={() => {
                setUnreadCount(0);
                setActiveMenu(null);
              }}
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
              <div style={{ fontWeight: 600, fontSize: 14 }}>Marcus Chen</div>
              <div style={{ fontSize: 11, color: '#a1a1aa' }}>@marcus_collector</div>
              <div className="profile-status-row">
                <span className="online-beacon-dot" />
                <span>Online &amp; Cataloging</span>
              </div>
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
              <span className="stat-val">Lossless</span>
              <span className="stat-lbl">Audio Mode</span>
            </div>
          </div>

          <div className="profile-options">
            {onPageChange && (
              <div
                className="profile-row interactive"
                onClick={() => {
                  onPageChange('feed');
                  setActiveMenu(null);
                }}
              >
                <Radio size={14} style={{ color: '#38bdf8' }} />
                <span>Open Community Feed</span>
              </div>
            )}
            <div className="profile-row">
              <User size={14} style={{ color: 'var(--mu)' }} />
              <span>Profile &amp; Account Settings</span>
            </div>
            <div className="profile-row">
              <Disc size={14} style={{ color: 'var(--mu)' }} />
              <span>Collector Preferences &amp; Formats</span>
            </div>
            <div className="profile-row">
              <Database size={14} style={{ color: 'var(--mu)' }} />
              <span>Library Storage &amp; SQLite Backups</span>
            </div>
          </div>

          <div className="popover-footer">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--mu)' }}>
              <ShieldCheck size={13} style={{ color: '#4ade80' }} />
              <span>Local Database Active · v1.0.0</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
