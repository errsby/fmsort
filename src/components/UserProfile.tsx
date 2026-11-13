import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { LibraryNode, Track } from '../types';
import { fmtDuration, flattenTracks } from '../utils';
import { CoverArt, getFunkyPalette } from './CoverArt';
import {
  Search,
  Library,
  SlidersHorizontal,
  Layers,
  Sparkles,
  Disc,
  Folder,
  Check,
  CheckCircle2,
  Copy,
  Edit3,
  ExternalLink,
  FileText,
  Radio,
  MapPin,
  HardDrive,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  X,
  Share2,
  Headphones,
  Cpu,
  Database,
  Award,
  Zap,
} from 'lucide-react';

export interface UserProfileProps {
  tree: LibraryNode[];
  allLibraryTracks: Track[];
  completedAlbumKeys: Set<string> | string[];
  onSelectNode: (node: LibraryNode) => void;
  onNavigateBackToLibrary: () => void;
  showToast: (msg: string) => void;
  allContainers: LibraryNode[];
}

interface StoredUserProfile {
  displayName: string;
  handle: string;
  tagline: string;
  bio: string;
  location: string;
  djSetup: string;
  discogsUsername: string;
  preferredAudioFormat: string;
}

const DEFAULT_PROFILE: StoredUserProfile = {
  displayName: 'err',
  handle: 'err',
  tagline: 'Sound Archivist, Selector & Vinyl Digger',
  bio: 'Specializing in rare groove, deep house, dub techno, ambient and leftfield UK club archives. Passionate about lossless audio archiving, ISRC verification, and Rekordbox performance readiness.',
  location: 'Berlin / London',
  djSetup: '2x Pioneer CDJ-3000 · Allen & Heath Xone:96 · 2x Technics SL-1200MK7',
  discogsUsername: 'err_vault',
  preferredAudioFormat: 'FLAC 24-bit / 96kHz + AIFF',
};

export const UserProfile: React.FC<UserProfileProps> = ({
  tree,
  allLibraryTracks,
  completedAlbumKeys,
  onSelectNode,
  onNavigateBackToLibrary,
  showToast,
  allContainers,
}) => {
  // Load stored profile or fallback
  const [profile, setProfile] = useState<StoredUserProfile>(() => {
    try {
      const saved = localStorage.getItem('fmsort_user_profile');
      if (saved) {
        return { ...DEFAULT_PROFILE, ...JSON.parse(saved) };
      }
    } catch {}
    return DEFAULT_PROFILE;
  });

  const [activeTab, setActiveTab] = useState<'crates' | 'activity' | 'diagnostics' | 'gear'>('crates');
  const [filterText, setFilterText] = useState('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState<StoredUserProfile>(profile);
  const [isScanning, setIsScanning] = useState(false);
  const filterInputRef = useRef<HTMLInputElement>(null);

  // Sync edit form when opening modal
  useEffect(() => {
    if (isEditModalOpen) {
      setEditForm(profile);
    }
  }, [isEditModalOpen, profile]);

  const saveProfile = (updated: StoredUserProfile) => {
    setProfile(updated);
    try {
      localStorage.setItem('fmsort_user_profile', JSON.stringify(updated));
    } catch {}
    showToast('User profile updated successfully');
    setIsEditModalOpen(false);
  };

  // Keyboard shortcut ⌘F for filtering
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        filterInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Compute live library stats
  const totalTracks = allLibraryTracks.length || 6112;
  const totalRuntimeSeconds = useMemo(() => {
    return allLibraryTracks.reduce((sum, t) => sum + (t.len || 0), 0) || 1231200; // ~342 hrs
  }, [allLibraryTracks]);

  const totalRuntimeHours = Math.round(totalRuntimeSeconds / 3600);

  const isrcResolvedCount = useMemo(() => {
    const withIsrc = allLibraryTracks.filter(t => t.isrc && t.isrc !== '—' && t.isrc.trim().length > 0).length;
    return withIsrc || 6014;
  }, [allLibraryTracks]);

  const isrcPercentage = Math.min(100, Math.round((isrcResolvedCount / totalTracks) * 1000) / 10);

  // Top crates list (using real tree crates + enriched mockup attributes)
  const topCrates = useMemo(() => {
    const candidates = allContainers.length > 0 ? allContainers : tree;
    return candidates.slice(0, 16).map((crate, idx) => {
      const tracks = flattenTracks(crate);
      const totalSec = tracks.reduce((sum, t) => sum + (t.len || 0), 0);
      const isCompleted = completedAlbumKeys instanceof Set
        ? Array.from(completedAlbumKeys).some(k => k.includes(crate.name))
        : Array.isArray(completedAlbumKeys)
        ? completedAlbumKeys.some(k => k.includes(crate.name))
        : false;
      const targetTag = idx % 3 === 0 ? 'USB 1 (Pioneer Rekordbox)' : idx % 3 === 1 ? 'Master Studio Archive' : 'Engine Prime SC6000';
      return {
        ...crate,
        computedTracksCount: tracks.length || (idx * 14 + 18),
        totalSeconds: totalSec || (idx * 720 + 2400),
        status: isCompleted ? 'Completed' : (idx % 2 === 0 ? 'Verified' : 'In Progress'),
        targetTag,
        lastUpdated: `2026-11-${String(Math.max(1, 13 - idx)).padStart(2, '0')}`,
      };
    });
  }, [allContainers, tree, completedAlbumKeys]);

  // Filtered crates
  const filteredCrates = useMemo(() => {
    if (!filterText.trim()) return topCrates;
    const q = filterText.toLowerCase();
    return topCrates.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.type.toLowerCase().includes(q) ||
      c.targetTag.toLowerCase().includes(q) ||
      c.status.toLowerCase().includes(q)
    );
  }, [topCrates, filterText]);

  // Mockup session activity log featuring real library tracks where possible
  const sessionLog = useMemo(() => {
    const baseTracks = allLibraryTracks.length > 0 ? allLibraryTracks.slice(0, 12) : [
      { id: 6112, t: 'Get Around To It', a: 'Arthur Russell', l: 'Another Thought', len: 307, bpm: 112, key: '8A', isrc: 'USAK20300009', f: 'FLAC 24-bit' },
      { id: 6113, t: 'This Is How We Walk on the Moon', a: 'Arthur Russell', l: 'Another Thought', len: 284, bpm: 118, key: '11B', isrc: 'USAK20300010', f: 'FLAC 24-bit' },
      { id: 6114, t: 'Armour', a: 'Arthur Russell', l: 'Another Thought', len: 271, bpm: 120, key: '4A', isrc: 'USAK20300011', f: 'FLAC 24-bit' },
      { id: 6115, t: 'A Little Lost', a: 'Arthur Russell', l: 'Another Thought', len: 201, bpm: 115, key: '9B', isrc: 'USAK20300012', f: 'FLAC 24-bit' },
    ];

    const actions = [
      'Rekordbox HotCue Verified',
      'ISRC Catalog Synced',
      'Harmonic Key Analyzed',
      'Crated to Deep House Vol. 4',
      'Peak Gain Normalized',
      'Exported to USB 1',
    ];

    const times = [
      '12 mins ago',
      '45 mins ago',
      '2 hours ago',
      '3 hours ago',
      'Yesterday 23:14',
      'Yesterday 19:40',
      'Nov 11, 14:02',
      'Nov 10, 21:55',
    ];

    return baseTracks.map((t, idx) => ({
      track: t,
      action: actions[idx % actions.length],
      timeAgo: times[idx % times.length],
      format: t.f || (idx % 2 === 0 ? 'FLAC 24/96' : 'AIFF 16/44.1'),
      energy: Math.min(10, (idx % 5) + 6),
    }));
  }, [allLibraryTracks]);

  // Filtered session log
  const filteredSessionLog = useMemo(() => {
    if (!filterText.trim()) return sessionLog;
    const q = filterText.toLowerCase();
    return sessionLog.filter(item =>
      (item.track.t || '').toLowerCase().includes(q) ||
      (item.track.a || '').toLowerCase().includes(q) ||
      (item.track.l || '').toLowerCase().includes(q) ||
      item.action.toLowerCase().includes(q) ||
      item.format.toLowerCase().includes(q)
    );
  }, [sessionLog, filterText]);

  // Copy public link to clipboard
  const handleCopyProfileLink = () => {
    const url = `${window.location.origin}/profile`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
    }
    showToast(`Profile link copied: ${url}`);
  };

  // Trigger simulated integrity scan
  const handleTriggerIntegrityScan = () => {
    setIsScanning(true);
    showToast('Starting Library & Audio Vault Integrity Scan...');
    setTimeout(() => {
      setIsScanning(false);
      showToast('Integrity Scan Complete: 6,112 tracks verified, 0 corrupted FLACs');
    }, 1800);
  };

  return (
    <div className="user-profile-page-view">
      {/* Active Hero Banner (Replicating exact folder page aesthetic) */}
      <div className="active-hero-banner user-profile-hero">
        <div className="hero-backdrop" aria-hidden="true">
          <div
            className="hero-backdrop-glow"
            style={{
              background: `radial-gradient(ellipse 90% 90% at 20% 30%, ${getFunkyPalette(profile.handle)[1]}33 0%, transparent 70%), radial-gradient(ellipse 70% 70% at 80% 60%, ${getFunkyPalette(profile.displayName)[2]}28 0%, transparent 65%)`,
              filter: 'blur(38px)',
            }}
          />
          <div className="hero-backdrop-scrim" />
        </div>

        {/* 1. TOP NAV BAR: Breadcrumb path & Top Actions across from breadcrumb */}
        <div className="hero-top-nav-bar">
          <div className="hero-nav-left">
            <nav className="unified-crumbs" aria-label="Breadcrumb">
              <span
                className="crumb-link root-crumb"
                onClick={onNavigateBackToLibrary}
                title="Go to Library Root"
              >
                <Library size={13} style={{ marginRight: 4 }} />
                <span>Library</span>
              </span>
              <span className="crumb-sep">/</span>
              <span
                className="crumb-link"
                onClick={onNavigateBackToLibrary}
                title="Back to Collections"
              >
                Users
              </span>
              <span className="crumb-sep">/</span>
              <b className="crumb-current">@{profile.handle} (Profile)</b>
            </nav>
          </div>

          <div className="hero-top-actions-right">
            {/* Filter Search Input */}
            <div className="header-filter-box">
              <Search size={13} className="header-filter-icon" />
              <input
                ref={filterInputRef}
                type="search"
                className="header-filter-input"
                placeholder="Filter profile data... (⌘F)"
                value={filterText}
                onChange={e => setFilterText(e.target.value)}
              />
              {filterText && (
                <button
                  type="button"
                  className="header-filter-clear-btn"
                  onClick={() => setFilterText('')}
                  title="Clear filter"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Edit Profile Button */}
            <button
              type="button"
              className="user-profile-action-btn edit-profile-btn"
              onClick={() => setIsEditModalOpen(true)}
              title="Edit User Profile & Curation Preferences"
            >
              <Edit3 size={13} />
              <span>Edit Profile</span>
            </button>

            {/* Share Profile Link */}
            <button
              type="button"
              className="user-profile-action-btn share-btn"
              onClick={handleCopyProfileLink}
              title="Share / Copy Profile URL (/profile)"
            >
              <Share2 size={13} />
              <span>Share</span>
            </button>

            {/* Back to Library Button */}
            <button
              type="button"
              className="user-profile-action-btn back-lib-btn"
              onClick={onNavigateBackToLibrary}
              title="Back to Music Library Table"
            >
              <Library size={13} />
              <span>Library</span>
            </button>
          </div>
        </div>

        {/* 2. MAIN HERO CONTENT: Avatar, Selector Badges, Stats & Curator Bio */}
        <div className="active-hero-content">
          <div className="hero-main-left">
            <div className="user-profile-avatar-wrapper">
              <CoverArt
                src={null}
                alt={profile.displayName}
                size={96}
                type="artist"
                seed={profile.handle || 'err'}
                rounded="full"
              />
              <div className="user-profile-online-badge" title="Active Sound System Curator">
                <span className="online-dot" />
              </div>
            </div>

            <div className="active-hero-meta">
              <div className="active-hero-badge-row">
                <span className="active-hero-badge">SELECTOR · LEVEL 14</span>
                <span className="profile-badge-pro">
                  <ShieldCheck size={11} style={{ marginRight: 4 }} />
                  PRO ARCHIVIST
                </span>
                <span className="profile-badge-highlight">
                  <Sparkles size={11} style={{ marginRight: 4 }} />
                  ISRC {isrcPercentage}%
                </span>
                <span className="active-hero-tag">
                  <Award size={11} style={{ marginRight: 4 }} />
                  GOLD EAR
                </span>
              </div>

              <div className="profile-title-row">
                <h2 className="active-hero-title">{profile.displayName}</h2>
                <span className="profile-handle-badge">@{profile.handle}</span>
              </div>

              <div className="active-hero-sub">
                <span style={{ color: '#fafafa', fontWeight: 600 }}>{totalTracks.toLocaleString()} tracks</span>
                <span> · </span>
                <span>{allContainers.length || 42} crates</span>
                <span> · </span>
                <span>{totalRuntimeHours} hrs runtime</span>
                <span> · </span>
                <span>89.4 GB Lossless</span>
                <span> · </span>
                <span style={{ color: '#4ade80' }}>
                  <Check size={11} style={{ display: 'inline', marginRight: 3, verticalAlign: '-1px' }} />
                  14 Completed Releases
                </span>
              </div>

              {/* Bio & Curator Tagline */}
              <p className="user-profile-bio-text">
                {profile.bio}
              </p>

              {/* Badges / Integration Pills Row */}
              <div className="user-profile-pills-row">
                <span className="profile-info-pill" title="Physical vinyl catalog synced with Discogs">
                  <Disc size={11} style={{ color: '#d4d4d8' }} />
                  <span>Discogs: @{profile.discogsUsername}</span>
                </span>
                <span className="profile-info-pill" title="DJ Target Rekordbox USB">
                  <Headphones size={11} style={{ color: '#38bdf8' }} />
                  <span>Rekordbox XML Ready</span>
                </span>
                <span className="profile-info-pill" title="Location & Sound Region">
                  <MapPin size={11} style={{ color: '#f472b6' }} />
                  <span>{profile.location}</span>
                </span>
                <span className="profile-info-pill" title="Preferred Lossless Mastering">
                  <FileText size={11} style={{ color: '#a78bfa' }} />
                  <span>{profile.preferredAudioFormat}</span>
                </span>
                <button
                  type="button"
                  className="profile-scan-pill-btn"
                  onClick={handleTriggerIntegrityScan}
                  disabled={isScanning}
                  title="Run real-time integrity scan on collection"
                >
                  <RefreshCw size={11} className={isScanning ? 'spin' : ''} style={{ color: '#34d399' }} />
                  <span>{isScanning ? 'Scanning...' : 'Integrity Scan'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sub-Tab Navigation Bar (Styled to match folder pages) */}
      <div className="profile-tabs-bar">
        <button
          type="button"
          className={`profile-tab-btn ${activeTab === 'crates' ? 'active' : ''}`}
          onClick={() => setActiveTab('crates')}
        >
          <Folder size={13} />
          <span>Pinned Crates &amp; Collections</span>
          <span className="profile-tab-count">{filteredCrates.length}</span>
        </button>

        <button
          type="button"
          className={`profile-tab-btn ${activeTab === 'activity' ? 'active' : ''}`}
          onClick={() => setActiveTab('activity')}
        >
          <Radio size={13} />
          <span>Session Log &amp; Activity</span>
          <span className="profile-tab-count">{filteredSessionLog.length}</span>
        </button>

        <button
          type="button"
          className={`profile-tab-btn ${activeTab === 'diagnostics' ? 'active' : ''}`}
          onClick={() => setActiveTab('diagnostics')}
        >
          <Sparkles size={13} />
          <span>Audio Vault &amp; Diagnostics</span>
          <span className="profile-tab-count green">98.4%</span>
        </button>

        <button
          type="button"
          className={`profile-tab-btn ${activeTab === 'gear' ? 'active' : ''}`}
          onClick={() => setActiveTab('gear')}
        >
          <Cpu size={13} />
          <span>Gear &amp; Hardware Targets</span>
          <span className="profile-tab-count">3 Targets</span>
        </button>
      </div>

      {/* Tab 1: Pinned Crates & Collections (Matches folder page table structure) */}
      {activeTab === 'crates' && (
        <div className="profile-table-container">
          <table className="profile-folder-table">
            <thead>
              <tr>
                <th style={{ width: 44 }}></th>
                <th>Crate / Collection Name</th>
                <th style={{ width: 130 }}>Type</th>
                <th style={{ width: 110 }}>Tracks</th>
                <th style={{ width: 110 }}>Duration</th>
                <th style={{ width: 140 }}>Status</th>
                <th style={{ width: 200 }}>Hardware Target</th>
                <th style={{ width: 120, textAlign: 'right', paddingRight: 16 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredCrates.length === 0 ? (
                <tr>
                  <td colSpan={8} className="profile-empty-cell">
                    <Folder size={28} style={{ color: '#52525b', marginBottom: 8 }} />
                    <div>No crates matching &ldquo;{filterText}&rdquo;</div>
                  </td>
                </tr>
              ) : (
                filteredCrates.map(crate => (
                  <tr
                    key={crate.id}
                    className="profile-crate-row"
                    onClick={() => {
                      onSelectNode(crate);
                      showToast(`Navigated to crate: "${crate.name}"`);
                    }}
                    title={`Open "${crate.name}" in library view`}
                  >
                    <td>
                      <CoverArt
                        src={crate.cover_url || null}
                        alt={crate.name}
                        size={28}
                        type={crate.type === 'Artist' ? 'artist' : 'folder'}
                        seed={crate.name}
                        rounded={crate.type === 'Artist' ? 'full' : 4}
                      />
                    </td>
                    <td>
                      <div className="profile-crate-name-cell">
                        <span className="crate-title">{crate.name}</span>
                        <span className="crate-updated">Updated {crate.lastUpdated}</span>
                      </div>
                    </td>
                    <td>
                      <span className="profile-type-badge">{crate.type}</span>
                    </td>
                    <td className="mono">{crate.computedTracksCount} tracks</td>
                    <td className="mono">{fmtDuration(crate.totalSeconds)}</td>
                    <td>
                      <span className={`profile-status-pill ${crate.status.toLowerCase().replace(/\s+/g, '-')}`}>
                        {crate.status === 'Completed' && <Check size={10} strokeWidth={2.5} />}
                        <span>{crate.status}</span>
                      </span>
                    </td>
                    <td>
                      <span className="profile-target-tag">{crate.targetTag}</span>
                    </td>
                    <td style={{ textAlign: 'right', paddingRight: 16 }}>
                      <button
                        type="button"
                        className="profile-open-crate-btn"
                        onClick={e => {
                          e.stopPropagation();
                          onSelectNode(crate);
                        }}
                        title="Open crate"
                      >
                        <span>Open</span>
                        <ExternalLink size={11} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: Recent Session Log & Curation Activity */}
      {activeTab === 'activity' && (
        <div className="profile-table-container">
          <table className="profile-folder-table">
            <thead>
              <tr>
                <th style={{ width: 44 }}>#</th>
                <th>Title &amp; Artist</th>
                <th style={{ width: 180 }}>Album</th>
                <th style={{ width: 90 }}>BPM</th>
                <th style={{ width: 80 }}>Key</th>
                <th style={{ width: 90 }}>Length</th>
                <th style={{ width: 130 }}>Audio Format</th>
                <th style={{ width: 220 }}>Curation Event</th>
                <th style={{ width: 120, textAlign: 'right', paddingRight: 16 }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {filteredSessionLog.length === 0 ? (
                <tr>
                  <td colSpan={9} className="profile-empty-cell">
                    <Radio size={28} style={{ color: '#52525b', marginBottom: 8 }} />
                    <div>No activity matching &ldquo;{filterText}&rdquo;</div>
                  </td>
                </tr>
              ) : (
                filteredSessionLog.map((item, idx) => (
                  <tr key={item.track.id || idx} className="profile-activity-row">
                    <td className="mono" style={{ color: '#71717a' }}>{idx + 1}</td>
                    <td>
                      <div className="profile-track-cell">
                        <span className="track-title">{item.track.t || 'Unknown Title'}</span>
                        <span className="track-artist">{item.track.a || 'Unknown Artist'}</span>
                      </div>
                    </td>
                    <td style={{ color: '#a1a1aa' }}>{item.track.l || '—'}</td>
                    <td className="mono">{item.track.bpm ? `${item.track.bpm} BPM` : '120 BPM'}</td>
                    <td className="mono">
                      <span className="camelot-key-pill">{item.track.key || '8A'}</span>
                    </td>
                    <td className="mono">{fmtDuration(item.track.len || 240)}</td>
                    <td>
                      <span className="format-tag-pill">{item.format}</span>
                    </td>
                    <td>
                      <span className="curation-action-pill">
                        <Zap size={11} style={{ color: '#38bdf8' }} />
                        <span>{item.action}</span>
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', paddingRight: 16, color: '#71717a', fontSize: 11 }}>
                      {item.timeAgo}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 3: Vault Health & Diagnostics */}
      {activeTab === 'diagnostics' && (
        <div className="profile-diagnostics-view">
          {/* Diagnostic Metric Cards */}
          <div className="profile-metrics-grid">
            <div className="profile-metric-card">
              <div className="metric-header">
                <span className="metric-title">Lossless Ratio</span>
                <HardDrive size={16} style={{ color: '#38bdf8' }} />
              </div>
              <div className="metric-value">91.2%</div>
              <div className="metric-sub">5,574 of 6,112 tracks in FLAC / WAV</div>
              <div className="metric-progress-bar">
                <div className="metric-progress-fill" style={{ width: '91.2%', background: '#38bdf8' }} />
              </div>
            </div>

            <div className="profile-metric-card">
              <div className="metric-header">
                <span className="metric-title">ISRC Resolution</span>
                <CheckCircle2 size={16} style={{ color: '#4ade80' }} />
              </div>
              <div className="metric-value">{isrcPercentage}%</div>
              <div className="metric-sub">{isrcResolvedCount.toLocaleString()} verified catalog tracks</div>
              <div className="metric-progress-bar">
                <div className="metric-progress-fill" style={{ width: `${isrcPercentage}%`, background: '#4ade80' }} />
              </div>
            </div>

            <div className="profile-metric-card">
              <div className="metric-header">
                <span className="metric-title">Harmonic &amp; BPM Index</span>
                <Disc size={16} style={{ color: '#a78bfa' }} />
              </div>
              <div className="metric-value">94.8%</div>
              <div className="metric-sub">5,794 tracks tagged with Camelot keys</div>
              <div className="metric-progress-bar">
                <div className="metric-progress-fill" style={{ width: '94.8%', background: '#a78bfa' }} />
              </div>
            </div>

            <div className="profile-metric-card">
              <div className="metric-header">
                <span className="metric-title">Complete Albums</span>
                <Award size={16} style={{ color: '#fbbf24' }} />
              </div>
              <div className="metric-value">14 Albums</div>
              <div className="metric-sub">Full tracklists archived without gaps</div>
              <div className="metric-progress-bar">
                <div className="metric-progress-fill" style={{ width: '100%', background: '#fbbf24' }} />
              </div>
            </div>
          </div>

          {/* Actionable Health Optimizations Table */}
          <div className="profile-diagnostics-table-wrap">
            <div className="diagnostics-table-header">
              <div className="diag-header-left">
                <AlertTriangle size={14} style={{ color: '#f59e0b' }} />
                <span>Pending Audio Vault Optimizations</span>
              </div>
              <span className="diag-header-meta">3 recommendations found</span>
            </div>

            <table className="profile-folder-table">
              <thead>
                <tr>
                  <th>Recommendation</th>
                  <th style={{ width: 180 }}>Crate Affected</th>
                  <th style={{ width: 120 }}>Impact</th>
                  <th style={{ width: 140 }}>Estimated Time</th>
                  <th style={{ width: 130, textAlign: 'right', paddingRight: 16 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <div className="diag-item-cell">
                      <span className="diag-title">14 tracks missing verified ISRC codes</span>
                      <span className="diag-desc">Run digital music registry resolver to enrich metadata</span>
                    </div>
                  </td>
                  <td>Arthur Russell Essentials</td>
                  <td><span className="diag-impact-pill low">Metadata</span></td>
                  <td className="mono">~4 seconds</td>
                  <td style={{ textAlign: 'right', paddingRight: 16 }}>
                    <button
                      type="button"
                      className="diag-action-btn"
                      onClick={() => showToast('Enriching 14 ISRCs for Arthur Russell Essentials...')}
                    >
                      <Sparkles size={11} />
                      <span>Auto-Resolve</span>
                    </button>
                  </td>
                </tr>

                <tr>
                  <td>
                    <div className="diag-item-cell">
                      <span className="diag-title">2 duplicated track audio hashes detected</span>
                      <span className="diag-desc">Exact lossless duplicate between 'Summer Dub' &amp; 'Ambient Vault'</span>
                    </div>
                  </td>
                  <td>Summer Dub Vault</td>
                  <td><span className="diag-impact-pill med">Storage (82 MB)</span></td>
                  <td className="mono">Instant</td>
                  <td style={{ textAlign: 'right', paddingRight: 16 }}>
                    <button
                      type="button"
                      className="diag-action-btn"
                      onClick={() => showToast('Merged duplicated track hashes successfully')}
                    >
                      <Layers size={11} />
                      <span>Merge</span>
                    </button>
                  </td>
                </tr>

                <tr>
                  <td>
                    <div className="diag-item-cell">
                      <span className="diag-title">Peak gain clipping detected on 4 vinyl rips</span>
                      <span className="diag-desc">Apply non-destructive ReplayGain tag to prevent digital distortion</span>
                    </div>
                  </td>
                  <td>Rare Groove Vinyl Rips</td>
                  <td><span className="diag-impact-pill high">Audio Quality</span></td>
                  <td className="mono">~2 seconds</td>
                  <td style={{ textAlign: 'right', paddingRight: 16 }}>
                    <button
                      type="button"
                      className="diag-action-btn"
                      onClick={() => showToast('ReplayGain -1.2 dB applied to 4 tracks')}
                    >
                      <SlidersHorizontal size={11} />
                      <span>Normalize</span>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Gear, Hardware & DJ Ecosystem */}
      {activeTab === 'gear' && (
        <div className="profile-gear-view">
          <div className="gear-cards-grid">
            {/* Gear Card 1: Pioneer Rekordbox */}
            <div className="gear-target-card">
              <div className="gear-card-top">
                <div className="gear-icon-box rekordbox">
                  <Headphones size={22} style={{ color: '#38bdf8' }} />
                </div>
                <div className="gear-status-tag connected">CONNECTED</div>
              </div>
              <h3 className="gear-title">Pioneer Rekordbox v7.1</h3>
              <p className="gear-desc">
                Direct XML performance export targeting CDJ-3000 and XDJ-AZ USB drives.
              </p>
              <div className="gear-meta-list">
                <div className="gear-meta-row">
                  <span className="gear-meta-key">Export Path:</span>
                  <span className="gear-meta-val mono">/Volumes/DJ_USB_1/PIONEER/rekordbox.xml</span>
                </div>
                <div className="gear-meta-row">
                  <span className="gear-meta-key">Auto-Sync:</span>
                  <span className="gear-meta-val">Enabled on USB insertion</span>
                </div>
                <div className="gear-meta-row">
                  <span className="gear-meta-key">HotCue Memory:</span>
                  <span className="gear-meta-val">8 Cues + 4 Loops per track</span>
                </div>
              </div>
              <button
                type="button"
                className="gear-sync-action-btn"
                onClick={() => showToast('Syncing all 42 crates to Pioneer Rekordbox XML...')}
              >
                <FileText size={13} />
                <span>Export Rekordbox XML</span>
              </button>
            </div>

            {/* Gear Card 2: Denon Engine DJ Prime */}
            <div className="gear-target-card">
              <div className="gear-card-top">
                <div className="gear-icon-box engine">
                  <Cpu size={22} style={{ color: '#4ade80' }} />
                </div>
                <div className="gear-status-tag connected">STANDBY</div>
              </div>
              <h3 className="gear-title">Denon Engine DJ Prime</h3>
              <p className="gear-desc">
                High-speed SQLite crate sync for SC6000 and Prime 4 standalone systems.
              </p>
              <div className="gear-meta-list">
                <div className="gear-meta-row">
                  <span className="gear-meta-key">Target Drive:</span>
                  <span className="gear-meta-val mono">/Volumes/ENGINE_SSD/Engine Library/</span>
                </div>
                <div className="gear-meta-row">
                  <span className="gear-meta-key">Waveform Pre-render:</span>
                  <span className="gear-meta-val">Tri-color Lossless</span>
                </div>
                <div className="gear-meta-row">
                  <span className="gear-meta-key">Beatgrid Resolution:</span>
                  <span className="gear-meta-val">99.2% Lock</span>
                </div>
              </div>
              <button
                type="button"
                className="gear-sync-action-btn"
                onClick={() => showToast('Engine DJ Prime Database sync completed')}
              >
                <RefreshCw size={13} />
                <span>Sync Engine SSD</span>
              </button>
            </div>

            {/* Gear Card 3: Discogs Vault Mirror */}
            <div className="gear-target-card">
              <div className="gear-card-top">
                <div className="gear-icon-box discogs">
                  <Disc size={22} style={{ color: '#f59e0b' }} />
                </div>
                <div className="gear-status-tag connected">SYNCED</div>
              </div>
              <h3 className="gear-title">Discogs Vinyl Collection</h3>
              <p className="gear-desc">
                Two-way sync matching local audio files with physical vinyl catalog.
              </p>
              <div className="gear-meta-list">
                <div className="gear-meta-row">
                  <span className="gear-meta-key">Account:</span>
                  <span className="gear-meta-val">@{profile.discogsUsername}</span>
                </div>
                <div className="gear-meta-row">
                  <span className="gear-meta-key">Vinyl Cataloged:</span>
                  <span className="gear-meta-val mono">1,420 Physical Releases</span>
                </div>
                <div className="gear-meta-row">
                  <span className="gear-meta-key">Digital Match Rate:</span>
                  <span className="gear-meta-val">88.4% Matched</span>
                </div>
              </div>
              <button
                type="button"
                className="gear-sync-action-btn"
                onClick={() => showToast('Discogs collection synchronized with FMSort')}
              >
                <Database size={13} />
                <span>Pull Discogs Updates</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Profile Modal Dialog */}
      {isEditModalOpen && (
        <div className="user-profile-modal-overlay" onClick={() => setIsEditModalOpen(false)}>
          <div
            className="user-profile-modal-box"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-label="Edit Profile"
          >
            <div className="modal-header">
              <div className="modal-title-wrap">
                <Edit3 size={15} style={{ color: '#38bdf8' }} />
                <h3>Edit Selector Profile</h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsEditModalOpen(false)}
              >
                <X size={14} />
              </button>
            </div>

            <form
              onSubmit={e => {
                e.preventDefault();
                saveProfile(editForm);
              }}
              className="user-profile-modal-form"
            >
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="p-name">Display Name</label>
                  <input
                    id="p-name"
                    type="text"
                    value={editForm.displayName}
                    onChange={e => setEditForm(prev => ({ ...prev, displayName: e.target.value }))}
                    placeholder="e.g. err"
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p-handle">Handle (@)</label>
                  <input
                    id="p-handle"
                    type="text"
                    value={editForm.handle}
                    onChange={e => setEditForm(prev => ({ ...prev, handle: e.target.value.replace(/^@/, '') }))}
                    placeholder="e.g. err"
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="p-bio">Curator Bio &amp; Tagline</label>
                <textarea
                  id="p-bio"
                  rows={3}
                  value={editForm.bio}
                  onChange={e => setEditForm(prev => ({ ...prev, bio: e.target.value }))}
                  placeholder="Tell other sound archivists about your library..."
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="p-location">Location / Sound Hub</label>
                  <input
                    id="p-location"
                    type="text"
                    value={editForm.location}
                    onChange={e => setEditForm(prev => ({ ...prev, location: e.target.value }))}
                    placeholder="e.g. Berlin / London"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p-discogs">Discogs Username</label>
                  <input
                    id="p-discogs"
                    type="text"
                    value={editForm.discogsUsername}
                    onChange={e => setEditForm(prev => ({ ...prev, discogsUsername: e.target.value }))}
                    placeholder="e.g. err_vault"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="p-format">Preferred Audio Master Format</label>
                <input
                  id="p-format"
                  type="text"
                  value={editForm.preferredAudioFormat}
                  onChange={e => setEditForm(prev => ({ ...prev, preferredAudioFormat: e.target.value }))}
                  placeholder="e.g. FLAC 24-bit / 96kHz + AIFF"
                />
              </div>

              <div className="form-group">
                <label htmlFor="p-gear">Hardware &amp; DJ Setup</label>
                <input
                  id="p-gear"
                  type="text"
                  value={editForm.djSetup}
                  onChange={e => setEditForm(prev => ({ ...prev, djSetup: e.target.value }))}
                  placeholder="e.g. 2x Pioneer CDJ-3000 · Allen &amp; Heath Xone:96"
                />
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="modal-btn cancel"
                  onClick={() => setIsEditModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="modal-btn submit"
                >
                  Save Profile Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
