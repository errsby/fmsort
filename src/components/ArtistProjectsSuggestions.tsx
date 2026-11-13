import React, { useState, useEffect } from 'react';
import type { LibraryNode } from '../types';
import { fetchArtistSuggestedProjects, type SuggestedProject } from '../api';
import { CoverArt } from './CoverArt';
import {
  Sparkles,
  Disc,
  Plus,
  RefreshCw,
  Search,
  Check,
  Loader2,
  Calendar,
  ListMusic,
  ExternalLink,
} from 'lucide-react';

interface ArtistProjectsSuggestionsProps {
  artistNode: LibraryNode;
  onImportProject: (project: SuggestedProject) => Promise<void>;
  onFinishImport?: () => void;
  onOpenSearchModal: () => void;
  onNewTrack: () => void;
}

type FilterTab = 'all' | 'album' | 'ep' | 'single';

export const ArtistProjectsSuggestions: React.FC<ArtistProjectsSuggestionsProps> = ({
  artistNode,
  onImportProject,
  onFinishImport,
  onOpenSearchModal,
  onNewTrack,
}) => {
  const [projects, setProjects] = useState<SuggestedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [query, setQuery] = useState('');
  const [importingIds, setImportingIds] = useState<Set<number | string>>(new Set());
  const [importedIds, setImportedIds] = useState<Set<number | string>>(new Set());

  const loadSuggestions = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchArtistSuggestedProjects(artistNode.name);
      setProjects(data);
    } catch (err: any) {
      console.warn('Failed to load artist suggestions:', err);
      setError('Could not load suggestions from online catalog');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuggestions();
  }, [artistNode.id, artistNode.name]);

  const handleImport = async (e: React.MouseEvent, project: SuggestedProject) => {
    e.stopPropagation();
    if (importingIds.has(project.id) || importedIds.has(project.id)) return;

    setImportingIds(prev => new Set(prev).add(project.id));
    try {
      await onImportProject(project);
      setImportedIds(prev => new Set(prev).add(project.id));
    } catch (err: any) {
      console.error('Import error:', err);
    } finally {
      setImportingIds(prev => {
        const next = new Set(prev);
        next.delete(project.id);
        return next;
      });
    }
  };

  // Filter projects by tab and local search text
  const albumCount = projects.filter(p => p.record_type === 'album').length;
  const epCount = projects.filter(p => p.record_type === 'ep').length;
  const singleCount = projects.filter(p => p.record_type === 'single').length;

  const filteredProjects = projects.filter(p => {
    if (filterTab === 'album' && p.record_type !== 'album') return false;
    if (filterTab === 'ep' && p.record_type !== 'ep') return false;
    if (filterTab === 'single' && p.record_type !== 'single') return false;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      return p.title.toLowerCase().includes(q) || (p.year && p.year.toString().includes(q));
    }
    return true;
  });

  const getRecordTypeBadge = (type: string) => {
    const t = type.toLowerCase();
    if (t === 'album') return { label: 'ALBUM', color: '#818cf8', bg: 'rgba(99, 102, 241, 0.14)' };
    if (t === 'ep') return { label: 'EP', color: '#2dd4bf', bg: 'rgba(20, 184, 166, 0.14)' };
    if (t === 'single') return { label: 'SINGLE', color: '#fbbf24', bg: 'rgba(245, 158, 11, 0.14)' };
    return { label: type.toUpperCase(), color: '#a1a1aa', bg: 'rgba(255, 255, 255, 0.08)' };
  };

  return (
    <div className="artist-suggestions-container">
      {/* Successfully Imported Alert Banner */}
      {importedIds.size > 0 && (
        <div className="artist-suggestions-imported-banner">
          <div className="imported-banner-left">
            <Check size={16} className="imported-banner-icon" />
            <span>
              <strong>{importedIds.size} {importedIds.size === 1 ? 'project' : 'projects'}</strong> added to {artistNode.name}!
            </span>
          </div>
          {onFinishImport && (
            <button
              type="button"
              className="artist-suggestions-view-btn"
              onClick={onFinishImport}
            >
              <span>View in Library</span>
              <span aria-hidden="true">→</span>
            </button>
          )}
        </div>
      )}

      {/* Functional Action & Filter Bar */}
      <div className="artist-suggestions-filter-bar">
        <div className="artist-suggestions-filter-left">
          {!loading && projects.length > 0 && (
            <div className="artist-suggestions-tabs">
              <button
                type="button"
                className={`artist-suggestions-tab ${filterTab === 'all' ? 'active' : ''}`}
                onClick={() => setFilterTab('all')}
              >
                All Releases <span className="tab-count">{projects.length}</span>
              </button>
              {albumCount > 0 && (
                <button
                  type="button"
                  className={`artist-suggestions-tab ${filterTab === 'album' ? 'active' : ''}`}
                  onClick={() => setFilterTab('album')}
                >
                  Albums <span className="tab-count">{albumCount}</span>
                </button>
              )}
              {epCount > 0 && (
                <button
                  type="button"
                  className={`artist-suggestions-tab ${filterTab === 'ep' ? 'active' : ''}`}
                  onClick={() => setFilterTab('ep')}
                >
                  EPs <span className="tab-count">{epCount}</span>
                </button>
              )}
              {singleCount > 0 && (
                <button
                  type="button"
                  className={`artist-suggestions-tab ${filterTab === 'single' ? 'active' : ''}`}
                  onClick={() => setFilterTab('single')}
                >
                  Singles <span className="tab-count">{singleCount}</span>
                </button>
              )}
            </div>
          )}

          {!loading && projects.length > 0 && (
            <div className="artist-suggestions-search-wrap">
              <Search size={13} className="search-icon" />
              <input
                type="text"
                placeholder="Filter releases..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="artist-suggestions-search-input"
              />
            </div>
          )}
        </div>

        <div className="artist-suggestions-actions">
          <button
            type="button"
            className="artist-suggestions-btn secondary"
            onClick={loadSuggestions}
            disabled={loading}
            title="Refresh suggestions"
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            className="artist-suggestions-btn secondary"
            onClick={onOpenSearchModal}
            title="Search Discogs, Deezer & MusicBrainz"
          >
            <Search size={13} />
            <span>Search Catalog</span>
          </button>
          <button
            type="button"
            className="artist-suggestions-btn secondary"
            onClick={onNewTrack}
            title="Add track manually"
          >
            <Plus size={13} />
            <span>Manual Track</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="artist-suggestions-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="artist-project-card skeleton">
              <div className="artist-project-art-wrap skeleton-art" />
              <div className="artist-project-info">
                <div className="skeleton-line" style={{ width: '75%', height: 14, marginBottom: 8 }} />
                <div className="skeleton-line" style={{ width: '45%', height: 11, marginBottom: 12 }} />
                <div className="skeleton-line" style={{ width: '100%', height: 26, borderRadius: 5 }} />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="artist-suggestions-empty">
          <Disc size={36} style={{ color: '#71717a', marginBottom: 12 }} />
          <div className="empty-title">Suggestions Unavailable</div>
          <div className="empty-actions">
            <button className="artist-suggestions-btn primary" onClick={onOpenSearchModal}>
              <Search size={13} />
              <span>Search Music Catalog</span>
            </button>
            <button className="artist-suggestions-btn secondary" onClick={onNewTrack}>
              <Plus size={13} />
              <span>Add Track Manually</span>
            </button>
          </div>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="artist-suggestions-empty">
          <Disc size={36} style={{ color: '#71717a', marginBottom: 12 }} />
          <div className="empty-title">
            {projects.length === 0 ? 'No releases found' : 'No matching releases'}
          </div>
          <div className="empty-actions">
            {projects.length > 0 && query ? (
              <button className="artist-suggestions-btn secondary" onClick={() => setQuery('')}>
                Clear Filter
              </button>
            ) : (
              <>
                <button className="artist-suggestions-btn primary" onClick={onOpenSearchModal}>
                  <Search size={13} />
                  <span>Search All Catalogs</span>
                </button>
                <button className="artist-suggestions-btn secondary" onClick={onNewTrack}>
                  <Plus size={13} />
                  <span>Add Manual Track</span>
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="artist-suggestions-grid">
          {filteredProjects.map(project => {
            const isImporting = importingIds.has(project.id);
            const isImported = importedIds.has(project.id);
            const badge = getRecordTypeBadge(project.record_type);

            return (
              <div
                key={`${project.source}-${project.id}`}
                className={`artist-project-card ${isImported ? 'imported' : ''}`}
              >
                {/* Artwork */}
                <div className="artist-project-art-wrap">
                  <CoverArt
                    src={project.cover_url || project.thumb}
                    alt={project.title}
                    size={180}
                    type="album"
                    seed={project.title}
                    rounded={6}
                    className="artist-project-art"
                  />
                  <div
                    className="artist-project-badge"
                    style={{ color: badge.color, backgroundColor: badge.bg }}
                  >
                    {badge.label}
                  </div>
                </div>

                {/* Details */}
                <div className="artist-project-info">
                  <div className="artist-project-title" title={project.title}>
                    {project.title}
                  </div>

                  <div className="artist-project-meta">
                    {project.year > 0 && (
                      <span className="artist-project-year">
                        <Calendar size={11} style={{ marginRight: 3, verticalAlign: -1 }} />
                        {project.year}
                      </span>
                    )}
                    {project.track_count ? (
                      <span className="artist-project-tracks">
                        <ListMusic size={11} style={{ marginRight: 3, verticalAlign: -1 }} />
                        {project.track_count} {project.track_count === 1 ? 'track' : 'tracks'}
                      </span>
                    ) : null}
                  </div>

                  {/* Actions */}
                  <div className="artist-project-actions">
                    <button
                      type="button"
                      className={`artist-project-import-btn ${isImported ? 'done' : ''}`}
                      disabled={isImporting || isImported}
                      onClick={e => handleImport(e, project)}
                    >
                      {isImporting ? (
                        <>
                          <Loader2 size={12} className="spin" />
                          <span>Importing...</span>
                        </>
                      ) : isImported ? (
                        <>
                          <Check size={12} />
                          <span>Added to Artist</span>
                        </>
                      ) : (
                        <>
                          <Plus size={12} />
                          <span>Import Project</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
