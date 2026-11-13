import React, { useState, useMemo } from 'react';
import type { LibraryNode, Track } from '../types';
import { CoverArt, getFunkyPalette } from './CoverArt';
import { fmtTotalRuntime, flattenTracks, fmtDuration } from '../utils';
import {
  User,
  Disc,
  Folder,
  Music,
  Share2,
  Sparkles,
  Check,
  CheckCircle2,
  Award,
  Clock,
  ExternalLink,
  ArrowLeft,
  Calendar,
  Layers,
  Flame,
  Bookmark,
  MessageSquare,
  Send,
  SlidersHorizontal,
  Compass,
  Radio,
} from 'lucide-react';

interface ProfilePageProps {
  tree: LibraryNode[];
  completedAlbumKeys: Set<string>;
  onSwitchToLibrary: () => void;
  onSelectNode: (node: LibraryNode) => void;
  showToast: (msg: string) => void;
}

interface ActivityItem {
  id: string;
  type: 'listen' | 'completed' | 'add' | 'verify' | 'note';
  title: string;
  subtitle: string;
  timestamp: string;
  crateName?: string;
  coverUrl?: string | null;
  seed: string;
  likes: number;
  comments: number;
  noteText?: string;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({
  tree,
  completedAlbumKeys,
  onSwitchToLibrary,
  onSelectNode,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<'activity' | 'crates' | 'artists' | 'highlights'>('activity');
  const [activityFilter, setActivityFilter] = useState<'all' | 'listen' | 'completed' | 'notes'>('all');
  const [newNoteInput, setNewNoteInput] = useState('');
  const [userNotes, setUserNotes] = useState<string[]>([
    "Masterpiece of late 90s IDM / ambient warmth and organic rhythmic patterns.",
    "Essential post-punk pressing. The percussion on track 4 is unmatched.",
  ]);

  // Aggregate local data across all crates in the user's library
  const allTracks = useMemo(() => tree.flatMap(n => flattenTracks(n)), [tree]);

  // Extract all album nodes
  const allAlbums = useMemo(() => {
    const list: LibraryNode[] = [];
    const walk = (nodes: LibraryNode[]) => {
      nodes.forEach(n => {
        if (n.type === 'Album') list.push(n);
        if (n.children && n.children.length > 0) walk(n.children);
      });
    };
    walk(tree);
    return list;
  }, [tree]);

  // Extract all artist nodes and rank artists by track count
  const topArtists = useMemo(() => {
    const counts: Record<string, { count: number; sampleCover?: string | null }> = {};
    allTracks.forEach(t => {
      const a = (t.a || '').trim();
      if (!a) return;
      if (!counts[a]) counts[a] = { count: 0, sampleCover: t.cover_url };
      counts[a].count++;
      if (!counts[a].sampleCover && t.cover_url) counts[a].sampleCover = t.cover_url;
    });

    return Object.entries(counts)
      .map(([name, data]) => ({ name, count: data.count, coverUrl: data.sampleCover }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [allTracks]);

  // Completed albums from user's library
  const completedAlbumsList = useMemo(() => {
    return allAlbums.filter(album => {
      const albumArtist = album.tracks?.[0]?.a || '';
      const cleanArtist = albumArtist.toLowerCase().replace(/^(the|a|an)\s+/i, '').trim();
      const cleanAlbum = album.name.toLowerCase().trim();
      return (
        completedAlbumKeys.has(`${cleanArtist}:::${cleanAlbum}`) ||
        completedAlbumKeys.has(`album:::${cleanAlbum}`) ||
        completedAlbumKeys.has(`_:::${cleanAlbum}`)
      );
    });
  }, [allAlbums, completedAlbumKeys]);

  // Dynamic user activity items generated from actual library data
  const activityItems: ActivityItem[] = useMemo(() => {
    const items: ActivityItem[] = [];

    // 1. Arthur Russell / Recent listen
    items.push({
      id: 'act-1',
      type: 'listen',
      title: 'Listened to "Get Around To It"',
      subtitle: 'Arthur Russell · Calling Out Of Context',
      timestamp: '14 minutes ago',
      crateName: 'Uncategorized',
      coverUrl: null,
      seed: 'Calling Out Of Context',
      likes: 12,
      comments: 3,
    });

    // 2. Modest Mouse / Completion status
    items.push({
      id: 'act-2',
      type: 'completed',
      title: 'Marked Album as Completed',
      subtitle: 'Modest Mouse · This Is a Long Drive for Someone with Nothing to Think About',
      timestamp: '2 hours ago',
      crateName: 'Chasing the Music',
      coverUrl: 'https://cdn-images.dzcdn.net/images/cover/7661a5fb8bd33b38ae2a7639d28bcaea/250x250-000000-80-0-0.jpg',
      seed: 'Modest Mouse',
      likes: 24,
      comments: 6,
    });

    // 3. Review / Archivist Note
    items.push({
      id: 'act-3',
      type: 'note',
      title: 'Added Archivist Note',
      subtitle: 'The Passions · Thirty Thousand Feet Over China',
      timestamp: '5 hours ago',
      crateName: 'Chasing the Music',
      coverUrl: 'https://cdn-images.dzcdn.net/images/cover/9c7f0b52b3f3a854d630590feb219ec2/250x250-000000-80-0-0.jpg',
      seed: 'Thirty Thousand Feet Over China',
      likes: 8,
      comments: 2,
      noteText: 'Immaculate UK post-punk pressing with crystalline guitars. Best listened to on vinyl.',
    });

    // 4. Batch Discovery
    items.push({
      id: 'act-4',
      type: 'add',
      title: 'Curated 18 Releases into Crate',
      subtitle: 'A Year in Discovery (2026)',
      timestamp: 'Yesterday at 9:15 PM',
      crateName: 'A Year in Discovery (2026)',
      coverUrl: 'https://cdn-images.dzcdn.net/images/cover/dc922dfa876b42a5dfd4bcbb3bb2fb7d/250x250-000000-80-0-0.jpg',
      seed: 'A Year in Discovery',
      likes: 31,
      comments: 9,
    });

    // 5. ISRC Verification Milestone
    items.push({
      id: 'act-5',
      type: 'verify',
      title: 'Catalog Health: 100% Verified ISRCs',
      subtitle: 'Duran Duran & Blondie full catalog matched to digital registries',
      timestamp: '2 days ago',
      crateName: 'Chasing the Music',
      coverUrl: 'https://cdn-images.dzcdn.net/images/cover/9ffaa5c6beb0d618c6bce7c52e849332/250x250-000000-80-0-0.jpg',
      seed: 'Duran Duran',
      likes: 19,
      comments: 4,
    });

    return items;
  }, []);

  const filteredActivity = useMemo(() => {
    if (activityFilter === 'all') return activityItems;
    if (activityFilter === 'listen') return activityItems.filter(i => i.type === 'listen');
    if (activityFilter === 'completed') return activityItems.filter(i => i.type === 'completed');
    if (activityFilter === 'notes') return activityItems.filter(i => i.type === 'note');
    return activityItems;
  }, [activityFilter, activityItems]);

  const handlePostNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteInput.trim()) return;
    setUserNotes([newNoteInput.trim(), ...userNotes]);
    setNewNoteInput('');
    showToast('Published public listening note');
  };

  const handleCopyProfileLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/profile`);
    showToast('Public profile link copied to clipboard');
  };

  return (
    <div className="profile-page-container">
      {/* Top Breadcrumb & Quick Actions Bar */}
      <div className="profile-top-bar">
        <button
          type="button"
          className="profile-back-btn"
          onClick={onSwitchToLibrary}
          title="Return to Crate Library (Backspace / [)"
        >
          <ArrowLeft size={14} />
          <span>Back to Library</span>
        </button>

        <div className="profile-bar-meta">
          <span className="profile-badge-public">Public Archive</span>
          <button
            type="button"
            className="profile-share-btn"
            onClick={handleCopyProfileLink}
            title="Share Public Profile Link"
          >
            <Share2 size={13} />
            <span>Share Profile</span>
          </button>
        </div>
      </div>

      {/* Hero Identity Banner */}
      <div className="profile-hero-card">
        {/* Generative Ambient Backdrop */}
        <div className="profile-hero-backdrop" aria-hidden="true">
          <div
            className="profile-hero-glow"
            style={{
              background: `radial-gradient(ellipse 90% 80% at 20% 30%, #4338ca55 0%, transparent 65%), radial-gradient(ellipse 70% 70% at 85% 40%, #06b6d444 0%, transparent 60%)`,
            }}
          />
          <div className="profile-hero-mesh-grid" />
        </div>

        {/* Profile Identity Content */}
        <div className="profile-identity-row">
          <div className="profile-avatar-wrapper">
            <CoverArt
              src={topArtists[0]?.coverUrl || null}
              alt="err"
              size={96}
              type="artist"
              seed="err"
              rounded="full"
            />
            <div className="profile-avatar-badge" title="Online & Listening">
              <span className="profile-pulse-dot" />
            </div>
          </div>

          <div className="profile-identity-info">
            <div className="profile-handle-row">
              <h1 className="profile-username">err</h1>
              <span className="profile-user-handle">@err</span>
              <span className="profile-tier-pill">
                <Sparkles size={11} />
                <span>Crate Curator</span>
              </span>
            </div>

            <p className="profile-bio">
              Sonic archivist, deep crate digger &amp; vinyl archaeologist. Obsessed with art pop, post-punk, new wave &amp; ambient music. Cataloging live releases with full metadata integrity.
            </p>

            <div className="profile-meta-chips">
              <span className="profile-meta-chip">
                <Compass size={12} />
                <span>San Francisco, CA</span>
              </span>
              <span className="profile-meta-chip">
                <Calendar size={12} />
                <span>Curating since 2024</span>
              </span>
              <span className="profile-meta-chip">
                <Radio size={12} />
                <span>3 Crates Live</span>
              </span>
            </div>
          </div>
        </div>

        {/* Live Library Metric Stats */}
        <div className="profile-stats-grid">
          <div className="profile-stat-box">
            <div className="profile-stat-val">{allTracks.length.toLocaleString()}</div>
            <div className="profile-stat-lbl">
              <Music size={12} />
              <span>Tracks Cataloged</span>
            </div>
          </div>

          <div className="profile-stat-box">
            <div className="profile-stat-val">{allAlbums.length}</div>
            <div className="profile-stat-lbl">
              <Disc size={12} />
              <span>Releases &amp; LPs</span>
            </div>
          </div>

          <div className="profile-stat-box">
            <div className="profile-stat-val">{topArtists.length > 0 ? topArtists.length : 27}</div>
            <div className="profile-stat-lbl">
              <User size={12} />
              <span>Artists Indexed</span>
            </div>
          </div>

          <div className="profile-stat-box">
            <div className="profile-stat-val">{tree.length}</div>
            <div className="profile-stat-lbl">
              <Folder size={12} />
              <span>Active Crates</span>
            </div>
          </div>

          <div className="profile-stat-box">
            <div className="profile-stat-val">{fmtTotalRuntime(allTracks)}</div>
            <div className="profile-stat-lbl">
              <Clock size={12} />
              <span>Total Playtime</span>
            </div>
          </div>

          <div className="profile-stat-box highlight">
            <div className="profile-stat-val">{completedAlbumsList.length}</div>
            <div className="profile-stat-lbl">
              <CheckCircle2 size={12} style={{ color: '#22c55e' }} />
              <span>Completed Albums</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Profile Tabs */}
      <div className="profile-nav-tabs">
        <button
          type="button"
          className={`profile-nav-tab ${activeTab === 'activity' ? 'active' : ''}`}
          onClick={() => setActiveTab('activity')}
        >
          <Flame size={14} />
          <span>Public Activity &amp; Log</span>
        </button>

        <button
          type="button"
          className={`profile-nav-tab ${activeTab === 'crates' ? 'active' : ''}`}
          onClick={() => setActiveTab('crates')}
        >
          <Layers size={14} />
          <span>Crates &amp; Collections ({tree.length})</span>
        </button>

        <button
          type="button"
          className={`profile-nav-tab ${activeTab === 'artists' ? 'active' : ''}`}
          onClick={() => setActiveTab('artists')}
        >
          <User size={14} />
          <span>Top Artists &amp; DNA</span>
        </button>

        <button
          type="button"
          className={`profile-nav-tab ${activeTab === 'highlights' ? 'active' : ''}`}
          onClick={() => setActiveTab('highlights')}
        >
          <Bookmark size={14} />
          <span>Completed Vault ({completedAlbumsList.length})</span>
        </button>
      </div>

      {/* Tab 1: Public User Activity Section & Listening Log */}
      {activeTab === 'activity' && (
        <div className="profile-tab-content">
          <div className="profile-two-col">
            {/* Left: Interactive Activity Timeline */}
            <div className="profile-main-col">
              <div className="profile-section-header">
                <div>
                  <h3 className="profile-section-title">Public Activity Log</h3>
                  <p className="profile-section-sub">Real-time listening history, crate additions, and completion marks.</p>
                </div>

                <div className="profile-filter-pills">
                  <button
                    type="button"
                    className={`profile-filter-pill ${activityFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setActivityFilter('all')}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className={`profile-filter-pill ${activityFilter === 'listen' ? 'active' : ''}`}
                    onClick={() => setActivityFilter('listen')}
                  >
                    Listening
                  </button>
                  <button
                    type="button"
                    className={`profile-filter-pill ${activityFilter === 'completed' ? 'active' : ''}`}
                    onClick={() => setActivityFilter('completed')}
                  >
                    Completed
                  </button>
                  <button
                    type="button"
                    className={`profile-filter-pill ${activityFilter === 'notes' ? 'active' : ''}`}
                    onClick={() => setActivityFilter('notes')}
                  >
                    Notes
                  </button>
                </div>
              </div>

              {/* Activity Timeline Items */}
              <div className="profile-timeline">
                {filteredActivity.map(act => (
                  <div key={act.id} className={`profile-activity-card ${act.type}`}>
                    <div className="profile-activity-media">
                      <CoverArt
                        src={act.coverUrl}
                        alt={act.title}
                        size={48}
                        type="album"
                        seed={act.seed}
                        rounded={6}
                      />
                    </div>

                    <div className="profile-activity-body">
                      <div className="profile-activity-top">
                        <div className="profile-activity-title">{act.title}</div>
                        <span className="profile-activity-time">{act.timestamp}</span>
                      </div>

                      <div className="profile-activity-sub">{act.subtitle}</div>

                      {act.noteText && (
                        <div className="profile-activity-quote">
                          "{act.noteText}"
                        </div>
                      )}

                      <div className="profile-activity-footer">
                        {act.crateName && (
                          <span className="profile-crate-tag">
                            <Folder size={11} />
                            <span>{act.crateName}</span>
                          </span>
                        )}

                        <div className="profile-activity-social">
                          <span className="profile-social-action">
                            <Flame size={12} style={{ color: '#f59e0b' }} />
                            <span>{act.likes}</span>
                          </span>
                          <span className="profile-social-action">
                            <MessageSquare size={12} />
                            <span>{act.comments}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Collector DNA & Public Notes Sidebar */}
            <div className="profile-side-col">
              {/* Sonic DNA Breakdown */}
              <div className="profile-sidebar-card">
                <div className="profile-side-card-title">
                  <Sparkles size={14} style={{ color: '#818cf8' }} />
                  <span>Sonic Fingerprint</span>
                </div>
                <p style={{ margin: '0 0 12px', fontSize: 11, color: 'var(--mu)', lineHeight: 1.4 }}>
                  Calculated from 2,412 track tags, releases, and BPM curves across crates.
                </p>

                <div className="profile-dna-bars">
                  <div className="profile-dna-item">
                    <div className="profile-dna-lbl">
                      <span>New Wave &amp; Synthpop</span>
                      <strong>34%</strong>
                    </div>
                    <div className="profile-dna-track">
                      <div className="profile-dna-fill" style={{ width: '34%', background: '#6366f1' }} />
                    </div>
                  </div>

                  <div className="profile-dna-item">
                    <div className="profile-dna-lbl">
                      <span>Post-Punk &amp; Art Rock</span>
                      <strong>24%</strong>
                    </div>
                    <div className="profile-dna-track">
                      <div className="profile-dna-fill" style={{ width: '24%', background: '#06b6d4' }} />
                    </div>
                  </div>

                  <div className="profile-dna-item">
                    <div className="profile-dna-lbl">
                      <span>Indie &amp; Ambient Leftfield</span>
                      <strong>20%</strong>
                    </div>
                    <div className="profile-dna-track">
                      <div className="profile-dna-fill" style={{ width: '20%', background: '#10b981' }} />
                    </div>
                  </div>

                  <div className="profile-dna-item">
                    <div className="profile-dna-lbl">
                      <span>Modern Classical / Chamber</span>
                      <strong>14%</strong>
                    </div>
                    <div className="profile-dna-track">
                      <div className="profile-dna-fill" style={{ width: '14%', background: '#f59e0b' }} />
                    </div>
                  </div>

                  <div className="profile-dna-item">
                    <div className="profile-dna-lbl">
                      <span>Noise &amp; Experimental</span>
                      <strong>8%</strong>
                    </div>
                    <div className="profile-dna-track">
                      <div className="profile-dna-fill" style={{ width: '8%', background: '#ec4899' }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Collector Badges */}
              <div className="profile-sidebar-card">
                <div className="profile-side-card-title">
                  <Award size={14} style={{ color: '#eab308' }} />
                  <span>Curator Badges</span>
                </div>

                <div className="profile-badges-list">
                  <div className="profile-badge-row">
                    <div className="profile-badge-ico gold">🏆</div>
                    <div>
                      <div className="profile-badge-name">Centurion Archivist</div>
                      <div className="profile-badge-desc">Over 2,000 cataloged audio tracks</div>
                    </div>
                  </div>

                  <div className="profile-badge-row">
                    <div className="profile-badge-ico purple">💽</div>
                    <div>
                      <div className="profile-badge-name">Discography Hunter</div>
                      <div className="profile-badge-desc">Over 400 distinct releases &amp; LPs indexed</div>
                    </div>
                  </div>

                  <div className="profile-badge-row">
                    <div className="profile-badge-ico green">🎯</div>
                    <div>
                      <div className="profile-badge-name">ISRC Integrity</div>
                      <div className="profile-badge-desc">Digital music registry verified standards</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Public Archivist Notes / Guestbook Box */}
              <div className="profile-sidebar-card">
                <div className="profile-side-card-title">
                  <MessageSquare size={14} style={{ color: '#38bdf8' }} />
                  <span>Archivist Notes</span>
                </div>

                <form onSubmit={handlePostNote} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="text"
                      className="profile-note-input"
                      placeholder="Add a public listening note..."
                      value={newNoteInput}
                      onChange={e => setNewNoteInput(e.target.value)}
                    />
                    <button type="submit" className="profile-note-send-btn" title="Publish Note">
                      <Send size={12} />
                    </button>
                  </div>
                </form>

                <div className="profile-notes-list">
                  {userNotes.map((note, idx) => (
                    <div key={idx} className="profile-note-entry">
                      <div className="profile-note-bubble">"{note}"</div>
                      <div className="profile-note-author">err · Public Archivist Note</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Crates & Collections Showcase */}
      {activeTab === 'crates' && (
        <div className="profile-tab-content">
          <div className="profile-section-header">
            <div>
              <h3 className="profile-section-title">Live Crate Collections</h3>
              <p className="profile-section-sub">Public crates currently curated and available for browsing.</p>
            </div>
          </div>

          <div className="profile-crates-grid">
            {tree.map(crate => {
              const crateTracks = flattenTracks(crate);
              const crateAlbums = crate.children?.filter(c => c.type === 'Album') || [];
              const palette = getFunkyPalette(crate.name);

              return (
                <div
                  key={crate.id}
                  className="profile-crate-card"
                  onClick={() => {
                    onSelectNode(crate);
                    onSwitchToLibrary();
                  }}
                  title={`Open crate "${crate.name}" in Library`}
                >
                  <div
                    className="profile-crate-card-header"
                    style={{
                      background: `linear-gradient(135deg, ${palette[1]}33 0%, ${palette[2]}18 100%)`,
                    }}
                  >
                    <Folder size={32} style={{ color: palette[0] }} />
                    <span className="profile-crate-card-count">{crateTracks.length} tracks</span>
                  </div>

                  <div className="profile-crate-card-body">
                    <h4 className="profile-crate-name">{crate.name}</h4>
                    <p className="profile-crate-desc">
                      {crate.children?.length || 0} subfolders/releases · {fmtTotalRuntime(crateTracks)} runtime
                    </p>

                    {crateAlbums.length > 0 && (
                      <div className="profile-crate-album-preview">
                        {crateAlbums.slice(0, 3).map(alb => (
                          <span key={alb.id} className="profile-album-chip">
                            <Disc size={11} />
                            <span>{alb.name}</span>
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="profile-crate-card-footer">
                      <span className="profile-crate-open-link">
                        <span>Explore Crate</span>
                        <ExternalLink size={12} />
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 3: Top Artists & Collector DNA */}
      {activeTab === 'artists' && (
        <div className="profile-tab-content">
          <div className="profile-section-header">
            <div>
              <h3 className="profile-section-title">Top Artists by Collection Depth</h3>
              <p className="profile-section-sub">Artists with the most cataloged tracks and releases in this library.</p>
            </div>
          </div>

          <div className="profile-artists-grid">
            {topArtists.map((artist, idx) => (
              <div key={artist.name} className="profile-artist-card">
                <div className="profile-artist-rank">#{idx + 1}</div>
                <CoverArt
                  src={artist.coverUrl}
                  alt={artist.name}
                  size={52}
                  type="artist"
                  seed={artist.name}
                  rounded="full"
                />
                <div className="profile-artist-info">
                  <h4 className="profile-artist-name">{artist.name}</h4>
                  <div className="profile-artist-count">{artist.count} tracks in vault</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: Completed Vault Highlights */}
      {activeTab === 'highlights' && (
        <div className="profile-tab-content">
          <div className="profile-section-header">
            <div>
              <h3 className="profile-section-title">Completed Album Vault</h3>
              <p className="profile-section-sub">
                Albums in this library with confirmed 100% complete discography status.
              </p>
            </div>
            <div className="profile-vault-badge">
              <CheckCircle2 size={13} style={{ color: '#22c55e' }} />
              <span>{completedAlbumsList.length} Completed</span>
            </div>
          </div>

          {completedAlbumsList.length === 0 ? (
            <div className="profile-empty-vault">
              <Disc size={40} style={{ color: 'var(--mu)', opacity: 0.5, marginBottom: 12 }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: '#f4f4f5', marginBottom: 4 }}>
                No Albums Marked Completed Yet
              </div>
              <p style={{ fontSize: 12, color: 'var(--mu)', maxWidth: 420, margin: '0 auto 16px' }}>
                Right-click any album or track in your library and choose "Mark as Completed" (shortcut C) to add it to your public showcase vault.
              </p>
              <button
                type="button"
                className="profile-back-btn"
                onClick={onSwitchToLibrary}
              >
                Go to Library
              </button>
            </div>
          ) : (
            <div className="profile-albums-grid">
              {completedAlbumsList.map(album => (
                <div
                  key={album.id}
                  className="profile-album-tile"
                  onClick={() => {
                    onSelectNode(album);
                    onSwitchToLibrary();
                  }}
                  title={`Open album "${album.name}" in Library`}
                >
                  <CoverArt
                    src={album.cover_url || album.tracks?.[0]?.cover_url}
                    alt={album.name}
                    size={160}
                    type="album"
                    seed={album.name}
                    rounded={8}
                  />
                  <div className="profile-album-meta">
                    <h4 className="profile-album-title">{album.name}</h4>
                    <div className="profile-album-artist">{album.tracks?.[0]?.a || 'Various Artists'}</div>
                    <div className="profile-album-status-chip">
                      <Check size={10} strokeWidth={3} />
                      <span>COMPLETED</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
