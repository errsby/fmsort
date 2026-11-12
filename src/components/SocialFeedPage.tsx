import React, { useState } from 'react';
import type { LibraryNode } from '../types';
import { CoverArt } from './CoverArt';
import {
  Rss,
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  Sparkles,
  Disc,
  Send,
  Plus,
  Flame,
  TrendingUp,
  Users,
  Check,
  Music2,
  ExternalLink,
  Tag,
  Radio,
  SlidersHorizontal,
} from 'lucide-react';

interface SocialFeedPageProps {
  tree: LibraryNode[];
  onSwitchToLibrary: () => void;
  onImportRelease?: (title: string, artist: string, cover?: string) => Promise<void>;
  showToast: (msg: string) => void;
}

export interface SocialPost {
  id: string;
  author: {
    name: string;
    handle: string;
    avatar: string;
    badge?: string;
  };
  timestamp: string;
  tag: 'Listening Now' | 'Vinyl Haul' | 'Crate Dig' | 'Review' | 'Release Radar' | 'Discussion';
  content: string;
  attachedRelease?: {
    title: string;
    artist: string;
    year: number;
    format: string;
    cover_url: string;
    tracks_count?: number;
    genre?: string;
  };
  likes: number;
  commentsCount: number;
  shares: number;
  comments?: Array<{
    id: string;
    author: string;
    text: string;
    timestamp: string;
  }>;
}

const INITIAL_POSTS: SocialPost[] = [
  {
    id: 'post-1',
    author: {
      name: 'Marcus Chen',
      handle: '@marcus_analog',
      avatar: 'MC',
      badge: 'Vinyl Archivist',
    },
    timestamp: '28m ago',
    tag: 'Vinyl Haul',
    content:
      'Finally tracked down a pristine 1997 French original pressing of Daft Punk — Homework! The dynamic punch on "Rollin\' & Scratchin\'" and "Revolution 909" is unmatched on analog lacquer compared to modern digital remasters.',
    attachedRelease: {
      title: 'Homework',
      artist: 'Daft Punk',
      year: 1997,
      format: '2×LP, 33⅓ RPM, 180g Vinyl',
      cover_url: 'https://cdn-images.dzcdn.net/images/cover/b870579c8650cd59b1cce656dde2ef17/500x500-000000-80-0-0.jpg',
      tracks_count: 16,
      genre: 'French House / Techno',
    },
    likes: 47,
    commentsCount: 6,
    shares: 12,
    comments: [
      { id: 'c1', author: 'Elena Rostova', text: 'Incredible find! Did it include the original embossed sleeve?', timestamp: '15m ago' },
      { id: 'c2', author: 'Marcus Chen', text: 'Yes, original Virgin France inner sleeves in NM condition!', timestamp: '10m ago' },
    ],
  },
  {
    id: 'post-2',
    author: {
      name: 'Elena Rostova',
      handle: '@elena_hifi',
      avatar: 'ER',
      badge: 'FLAC Master',
    },
    timestamp: '2h ago',
    tag: 'Review',
    content:
      'Just cataloged Black Country, New Road — Live at Bush Hall in complete 24-bit/96kHz hi-res. The emotional vulnerability on "The Boy" and "Turbines/Pigs" is pure magic. One of the greatest contemporary live recordings of this decade.',
    attachedRelease: {
      title: 'Live at Bush Hall',
      artist: 'Black Country, New Road',
      year: 2023,
      format: 'Hi-Res Lossless 24-Bit / 96kHz',
      cover_url: 'https://cdn-images.dzcdn.net/images/cover/6abeccc2e62d2d2224062bb62994c305/500x500-000000-80-0-0.jpg',
      tracks_count: 9,
      genre: 'Post-Rock / Chamber Pop',
    },
    likes: 82,
    commentsCount: 14,
    shares: 21,
    comments: [
      { id: 'c3', author: 'Alex Rivera', text: 'Turbines/Pigs build-up gives me goosebumps every single time.', timestamp: '1h ago' },
    ],
  },
  {
    id: 'post-3',
    author: {
      name: 'Discogs Radar',
      handle: '@discogs_radar',
      avatar: 'DR',
      badge: 'Official Catalog',
    },
    timestamp: '4h ago',
    tag: 'Release Radar',
    content:
      'Record Store Day 2026 official pressings preview announced! Over 420 exclusive limited pressings, alternate takes, unreleased live sessions, and colored vinyl masterings hitting independent record shops this spring.',
    attachedRelease: {
      title: 'Random Access Memories (10th Anniversary)',
      artist: 'Daft Punk',
      year: 2023,
      format: '3×LP Box Set + 16p Book',
      cover_url: 'https://cdn-images.dzcdn.net/images/cover/d99e2c9df92886c5098af5973cb9298e/500x500-000000-80-0-0.jpg',
      tracks_count: 22,
      genre: 'Electronic / Disco',
    },
    likes: 194,
    commentsCount: 38,
    shares: 64,
  },
  {
    id: 'post-4',
    author: {
      name: 'Jay Kim',
      handle: '@jay_analog',
      avatar: 'JK',
    },
    timestamp: '7h ago',
    tag: 'Listening Now',
    content:
      'Late night listening session: Aphex Twin — Selected Ambient Works 85-92 through tube headphone amplifier. Nothing else creates this kind of ethereal, meditative sonic environment.',
    attachedRelease: {
      title: 'Selected Ambient Works 85-92',
      artist: 'Aphex Twin',
      year: 1992,
      format: 'Master FLAC / R&S Records',
      cover_url: 'https://cdn-images.dzcdn.net/images/cover/8b5cf698293d0bb7a40dc2ce0df458/500x500-000000-80-0-0.jpg',
      tracks_count: 13,
      genre: 'IDM / Ambient Techno',
    },
    likes: 63,
    commentsCount: 9,
    shares: 8,
  },
];

const TAG_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  'Listening Now': { bg: 'rgba(59, 130, 246, 0.12)', color: '#60a5fa', border: 'rgba(59, 130, 246, 0.28)' },
  'Vinyl Haul': { bg: 'rgba(245, 158, 11, 0.12)', color: '#fbbf24', border: 'rgba(245, 158, 11, 0.28)' },
  'Crate Dig': { bg: 'rgba(168, 85, 247, 0.12)', color: '#c084fc', border: 'rgba(168, 85, 247, 0.28)' },
  'Review': { bg: 'rgba(16, 185, 129, 0.12)', color: '#34d399', border: 'rgba(16, 185, 129, 0.28)' },
  'Release Radar': { bg: 'rgba(244, 63, 94, 0.12)', color: '#fb7185', border: 'rgba(244, 63, 94, 0.28)' },
  'Discussion': { bg: 'rgba(14, 165, 233, 0.12)', color: '#38bdf8', border: 'rgba(14, 165, 233, 0.28)' },
};

export const SocialFeedPage: React.FC<SocialFeedPageProps> = ({
  tree,
  onSwitchToLibrary,
  onImportRelease,
  showToast,
}) => {
  const [posts, setPosts] = useState<SocialPost[]>(INITIAL_POSTS);
  const [filterTab, setFilterTab] = useState<'all' | 'spins' | 'reviews' | 'radar'>('all');
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set(['post-1']));
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [openComments, setOpenComments] = useState<Set<string>>(new Set());
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [importingReleases, setImportingReleases] = useState<Set<string>>(new Set());

  // Composer State
  const [composerText, setComposerText] = useState('');
  const [composerTag, setComposerTag] = useState<SocialPost['tag']>('Listening Now');

  const handleToggleLike = (postId: string) => {
    const isLiked = likedPostIds.has(postId);
    setLikedPostIds(prev => {
      const next = new Set(prev);
      if (isLiked) next.delete(postId);
      else next.add(postId);
      return next;
    });

    setPosts(prev =>
      prev.map(p => {
        if (p.id === postId) {
          return { ...p, likes: isLiked ? p.likes - 1 : p.likes + 1 };
        }
        return p;
      })
    );
  };

  const handleToggleBookmark = (postId: string) => {
    const isSaved = bookmarkedIds.has(postId);
    setBookmarkedIds(prev => {
      const next = new Set(prev);
      if (isSaved) {
        next.delete(postId);
        showToast('Removed from saved items');
      } else {
        next.add(postId);
        showToast('Saved to your collection bookmarks');
      }
      return next;
    });
  };

  const handleToggleComments = (postId: string) => {
    setOpenComments(prev => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  };

  const handleAddComment = (postId: string) => {
    const text = (commentInputs[postId] || '').trim();
    if (!text) return;

    setPosts(prev =>
      prev.map(p => {
        if (p.id === postId) {
          const newComment = {
            id: `c-${Date.now()}`,
            author: 'Marcus Chen',
            text,
            timestamp: 'Just now',
          };
          return {
            ...p,
            commentsCount: p.commentsCount + 1,
            comments: [...(p.comments || []), newComment],
          };
        }
        return p;
      })
    );

    setCommentInputs(prev => ({ ...prev, [postId]: '' }));
    showToast('Comment posted');
  };

  const handlePublishPost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!composerText.trim()) return;

    const newPost: SocialPost = {
      id: `post-${Date.now()}`,
      author: {
        name: 'Marcus Chen',
        handle: '@marcus_collector',
        avatar: 'MC',
        badge: 'You',
      },
      timestamp: 'Just now',
      tag: composerTag,
      content: composerText.trim(),
      likes: 1,
      commentsCount: 0,
      shares: 0,
    };

    setPosts([newPost, ...posts]);
    setLikedPostIds(prev => new Set(prev).add(newPost.id));
    setComposerText('');
    showToast('Your update was shared to the community feed!');
  };

  const handleImportPostRelease = async (release: SocialPost['attachedRelease']) => {
    if (!release) return;
    const relKey = `${release.artist}-${release.title}`;
    if (importingReleases.has(relKey)) return;

    setImportingReleases(prev => new Set(prev).add(relKey));
    try {
      if (onImportRelease) {
        await onImportRelease(release.title, release.artist, release.cover_url);
      }
      showToast(`Added "${release.title}" by ${release.artist} to your library!`);
    } catch {
      showToast('Could not import release');
    } finally {
      setImportingReleases(prev => {
        const next = new Set(prev);
        next.delete(relKey);
        return next;
      });
    }
  };

  const filteredPosts = posts.filter(p => {
    if (filterTab === 'spins') return p.tag === 'Listening Now' || p.tag === 'Vinyl Haul';
    if (filterTab === 'reviews') return p.tag === 'Review' || p.tag === 'Discussion';
    if (filterTab === 'radar') return p.tag === 'Release Radar';
    return true;
  });

  return (
    <div className="social-feed-page">
      {/* Top Ambient Beacon Connecting to Active Navbar Tab */}
      <div className="feed-nav-beacon" aria-hidden="true">
        <div className="beacon-glow" />
        <div className="beacon-line" />
      </div>

      <div className="social-feed-layout">
        {/* Main Feed Column */}
        <div className="social-feed-main">
          {/* Feed Hero Banner */}
          <div className="feed-hero-banner">
            <div className="feed-hero-content">
              <div className="feed-hero-badge">
                <span className="live-pulse-dot" />
                <span>LIVE COMMUNITY FEED</span>
              </div>
              <h1 className="feed-hero-title">Music Collector Stream &amp; Cultural Pulse</h1>
              <p className="feed-hero-subtitle">
                Discover active vinyl spins, crate dig discoveries, lossless album masterings, and discussions from the collector network.
              </p>
            </div>
          </div>

          {/* Post Composer Card */}
          <div className="feed-composer-card">
            <div className="composer-header">
              <div className="composer-avatar">MC</div>
              <div className="composer-intro">
                <span className="composer-name">Marcus Chen</span>
                <span className="composer-hint">Share a vinyl discovery, spin, or thoughts</span>
              </div>
            </div>

            <form onSubmit={handlePublishPost}>
              <textarea
                className="composer-textarea"
                placeholder="What's spinning right now? Review an album, ask a pressing question, or log a discovery..."
                rows={3}
                value={composerText}
                onChange={e => setComposerText(e.target.value)}
              />

              <div className="composer-footer">
                <div className="composer-tag-selector">
                  <span className="tag-label">Category:</span>
                  {(['Listening Now', 'Vinyl Haul', 'Crate Dig', 'Review', 'Discussion'] as const).map(tag => (
                    <button
                      key={tag}
                      type="button"
                      className={`composer-tag-chip ${composerTag === tag ? 'active' : ''}`}
                      onClick={() => setComposerTag(tag)}
                    >
                      {tag}
                    </button>
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={!composerText.trim()}
                  className="composer-submit-btn"
                >
                  <Send size={13} />
                  <span>Post Update</span>
                </button>
              </div>
            </form>
          </div>

          {/* Feed Filter Bar */}
          <div className="feed-filter-bar">
            <div className="feed-tabs">
              <button
                type="button"
                className={`feed-tab ${filterTab === 'all' ? 'active' : ''}`}
                onClick={() => setFilterTab('all')}
              >
                <span>All Activity</span>
                <span className="feed-tab-count">{posts.length}</span>
              </button>
              <button
                type="button"
                className={`feed-tab ${filterTab === 'spins' ? 'active' : ''}`}
                onClick={() => setFilterTab('spins')}
              >
                <span>Vinyl &amp; Spins</span>
              </button>
              <button
                type="button"
                className={`feed-tab ${filterTab === 'reviews' ? 'active' : ''}`}
                onClick={() => setFilterTab('reviews')}
              >
                <span>Reviews &amp; Notes</span>
              </button>
              <button
                type="button"
                className={`feed-tab ${filterTab === 'radar' ? 'active' : ''}`}
                onClick={() => setFilterTab('radar')}
              >
                <span>Release Radar</span>
              </button>
            </div>
          </div>

          {/* Social Posts Stream */}
          <div className="feed-posts-stream">
            {filteredPosts.map(post => {
              const isLiked = likedPostIds.has(post.id);
              const isSaved = bookmarkedIds.has(post.id);
              const areCommentsOpen = openComments.has(post.id);
              const tagStyle = TAG_COLORS[post.tag] || {
                bg: 'rgba(255, 255, 255, 0.08)',
                color: '#e4e4e7',
                border: 'rgba(255, 255, 255, 0.15)',
              };

              return (
                <article key={post.id} className="feed-post-card">
                  {/* Post Header */}
                  <div className="post-header">
                    <div className="post-avatar">{post.author.avatar}</div>
                    <div className="post-author-meta">
                      <div className="post-author-row">
                        <span className="post-author-name">{post.author.name}</span>
                        <span className="post-author-handle">{post.author.handle}</span>
                        {post.author.badge && (
                          <span className="post-author-badge">{post.author.badge}</span>
                        )}
                      </div>
                      <span className="post-timestamp">{post.timestamp}</span>
                    </div>

                    <div
                      className="post-tag-badge"
                      style={{
                        backgroundColor: tagStyle.bg,
                        color: tagStyle.color,
                        borderColor: tagStyle.border,
                      }}
                    >
                      {post.tag}
                    </div>
                  </div>

                  {/* Post Body Text */}
                  <div className="post-content">
                    <p>{post.content}</p>
                  </div>

                  {/* Attached Music Release Card */}
                  {post.attachedRelease && (
                    <div className="post-release-card">
                      <div className="release-card-cover-wrap">
                        <CoverArt
                          src={post.attachedRelease.cover_url}
                          alt={post.attachedRelease.title}
                          size={76}
                          type="album"
                          seed={post.attachedRelease.title}
                          rounded={6}
                        />
                      </div>
                      <div className="release-card-info">
                        <div className="release-card-title">{post.attachedRelease.title}</div>
                        <div className="release-card-artist">{post.attachedRelease.artist}</div>
                        <div className="release-card-meta">
                          <span>{post.attachedRelease.year}</span>
                          <span>·</span>
                          <span>{post.attachedRelease.format}</span>
                          {post.attachedRelease.genre && (
                            <>
                              <span>·</span>
                              <span>{post.attachedRelease.genre}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="release-card-actions">
                        <button
                          type="button"
                          className="release-action-btn"
                          onClick={() => handleImportPostRelease(post.attachedRelease)}
                          disabled={importingReleases.has(
                            `${post.attachedRelease.artist}-${post.attachedRelease.title}`
                          )}
                          title="Import to your local library"
                        >
                          <Plus size={12} />
                          <span>Add to Library</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Post Interaction Actions Bar */}
                  <div className="post-actions-bar">
                    <button
                      type="button"
                      className={`post-action-btn like-btn ${isLiked ? 'active' : ''}`}
                      onClick={() => handleToggleLike(post.id)}
                      title={isLiked ? 'Unlike' : 'Like'}
                    >
                      <Heart size={14} className={isLiked ? 'fill-red' : ''} />
                      <span>{post.likes}</span>
                    </button>

                    <button
                      type="button"
                      className={`post-action-btn comment-btn ${areCommentsOpen ? 'active' : ''}`}
                      onClick={() => handleToggleComments(post.id)}
                      title="Comments"
                    >
                      <MessageCircle size={14} />
                      <span>{post.commentsCount}</span>
                    </button>

                    <button
                      type="button"
                      className="post-action-btn share-btn"
                      onClick={() => {
                        navigator.clipboard?.writeText(window.location.href);
                        showToast('Post link copied to clipboard!');
                      }}
                      title="Share post"
                    >
                      <Share2 size={14} />
                      <span>{post.shares}</span>
                    </button>

                    <button
                      type="button"
                      className={`post-action-btn bookmark-btn ${isSaved ? 'active' : ''}`}
                      onClick={() => handleToggleBookmark(post.id)}
                      title={isSaved ? 'Remove bookmark' : 'Bookmark release'}
                    >
                      <Bookmark size={14} className={isSaved ? 'fill-blue' : ''} />
                    </button>
                  </div>

                  {/* Expanded Comments Thread */}
                  {areCommentsOpen && (
                    <div className="post-comments-section">
                      {post.comments && post.comments.length > 0 && (
                        <div className="post-comments-list">
                          {post.comments.map(c => (
                            <div key={c.id} className="comment-item">
                              <span className="comment-author">{c.author}</span>
                              <span className="comment-text">{c.text}</span>
                              <span className="comment-time">{c.timestamp}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="comment-input-row">
                        <input
                          type="text"
                          placeholder="Write a reply..."
                          value={commentInputs[post.id] || ''}
                          onChange={e =>
                            setCommentInputs(prev => ({ ...prev, [post.id]: e.target.value }))
                          }
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddComment(post.id);
                            }
                          }}
                          className="comment-input"
                        />
                        <button
                          type="button"
                          className="comment-send-btn"
                          onClick={() => handleAddComment(post.id)}
                        >
                          Reply
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>

        {/* Right Rail / Social Pulse Sidebar */}
        <aside className="social-feed-sidebar">
          {/* Community Pulse Card */}
          <div className="feed-side-card">
            <div className="side-card-header">
              <Flame size={15} style={{ color: '#f59e0b' }} />
              <span>Community Pulse</span>
            </div>
            <div className="pulse-stats-grid">
              <div className="pulse-stat">
                <span className="pulse-num">1,842</span>
                <span className="pulse-lbl">Collectors Active</span>
              </div>
              <div className="pulse-stat">
                <span className="pulse-num">48.2k</span>
                <span className="pulse-lbl">Tracks Cataloged</span>
              </div>
              <div className="pulse-stat">
                <span className="pulse-num">320</span>
                <span className="pulse-lbl">New Pressings</span>
              </div>
              <div className="pulse-stat">
                <span className="pulse-num">99.8%</span>
                <span className="pulse-lbl">Lossless Rate</span>
              </div>
            </div>
          </div>

          {/* Quick Jump to Library Card */}
          <div className="feed-side-card library-jump-card">
            <div className="side-card-header">
              <Music2 size={15} style={{ color: '#3b82f6' }} />
              <span>Your Library Quick Access</span>
            </div>
            <p className="side-card-desc">
              Seamlessly switch back to organizing your local containers, artists, and lossless audio files.
            </p>
            <button
              type="button"
              className="side-action-btn primary"
              onClick={onSwitchToLibrary}
            >
              <span>Back to Library</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>

          {/* Trending Topics / Crate Digging */}
          <div className="feed-side-card">
            <div className="side-card-header">
              <TrendingUp size={15} style={{ color: '#10b981' }} />
              <span>Trending in Collecting</span>
            </div>
            <div className="trending-tags-list">
              <div className="trending-tag-item">
                <span className="tag-name">#DaftPunk</span>
                <span className="tag-count">2.4k spins</span>
              </div>
              <div className="trending-tag-item">
                <span className="tag-name">#RSD2026</span>
                <span className="tag-count">1.8k posts</span>
              </div>
              <div className="trending-tag-item">
                <span className="tag-name">#VinylCommunity</span>
                <span className="tag-count">1.2k collectors</span>
              </div>
              <div className="trending-tag-item">
                <span className="tag-name">#LosslessFLAC</span>
                <span className="tag-count">940 tracks</span>
              </div>
              <div className="trending-tag-item">
                <span className="tag-name">#PostRock</span>
                <span className="tag-count">620 discussions</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
