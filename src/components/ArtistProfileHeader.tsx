import React, { useState } from 'react';
import type { ArtistProfileData } from '../api';
import {
  ExternalLink,
  Globe,
  Users,
  Calendar,
  MapPin,
  ChevronDown,
  ChevronUp,
  Disc,
  Sparkles,
} from 'lucide-react';

interface ArtistProfileHeaderProps {
  profile: ArtistProfileData | null;
  loading: boolean;
  artistName: string;
}

export const ArtistProfileHeader: React.FC<ArtistProfileHeaderProps> = ({
  profile,
  loading,
  artistName,
}) => {
  const [isBioExpanded, setIsBioExpanded] = useState(false);

  const formatFans = (num?: number): string => {
    if (!num) return '';
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toLocaleString();
  };

  const getPlatformStyle = (platform: string): { bg: string; color: string; border: string } => {
    switch (platform) {
      case 'deezer':
        return { bg: 'rgba(168, 85, 247, 0.12)', color: '#c084fc', border: 'rgba(168, 85, 247, 0.3)' };
      case 'spotify':
        return { bg: 'rgba(34, 197, 94, 0.12)', color: '#4ade80', border: 'rgba(34, 197, 94, 0.3)' };
      case 'apple':
        return { bg: 'rgba(239, 68, 68, 0.12)', color: '#f87171', border: 'rgba(239, 68, 68, 0.3)' };
      case 'bandcamp':
        return { bg: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8', border: 'rgba(56, 189, 248, 0.3)' };
      case 'soundcloud':
        return { bg: 'rgba(249, 115, 22, 0.12)', color: '#fb923c', border: 'rgba(249, 115, 22, 0.3)' };
      case 'discogs':
        return { bg: 'rgba(255, 255, 255, 0.08)', color: '#e4e4e7', border: 'rgba(255, 255, 255, 0.2)' };
      case 'youtube':
        return { bg: 'rgba(239, 68, 68, 0.12)', color: '#f87171', border: 'rgba(239, 68, 68, 0.3)' };
      case 'wikipedia':
        return { bg: 'rgba(255, 255, 255, 0.06)', color: '#d4d4d8', border: 'rgba(255, 255, 255, 0.16)' };
      case 'instagram':
        return { bg: 'rgba(236, 72, 153, 0.12)', color: '#f472b6', border: 'rgba(236, 72, 153, 0.3)' };
      case 'twitter':
        return { bg: 'rgba(14, 165, 233, 0.12)', color: '#38bdf8', border: 'rgba(14, 165, 233, 0.3)' };
      default:
        return { bg: 'rgba(255, 255, 255, 0.05)', color: '#a1a1aa', border: 'rgba(255, 255, 255, 0.12)' };
    }
  };

  if (loading && !profile) {
    return (
      <div className="artist-profile-box artist-profile-loading">
        <div className="artist-profile-loading-row">
          <Sparkles size={13} className="spin" style={{ color: '#38bdf8' }} />
          <span>Fetching artist bio &amp; streaming socials...</span>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  const bioText = profile.bio || profile.description || '';
  const isLongBio = bioText.length > 240;
  const displayedBio = isLongBio && !isBioExpanded ? `${bioText.slice(0, 235)}…` : bioText;

  return (
    <div className="artist-profile-box">
      {/* Metrics & Badges Bar */}
      <div className="artist-profile-tags-row">
        {profile.country && (
          <span className="artist-info-pill" title="Country / Origin">
            <MapPin size={11} />
            <span>{profile.country}</span>
          </span>
        )}
        {profile.yearsActive && (
          <span className="artist-info-pill" title="Years Active">
            <Calendar size={11} />
            <span>{profile.yearsActive}</span>
          </span>
        )}
        {typeof profile.fanCount === 'number' && profile.fanCount > 0 && (
          <span className="artist-info-pill" title="Deezer Followers">
            <Users size={11} />
            <span>{formatFans(profile.fanCount)} Fans</span>
          </span>
        )}
        {typeof profile.albumCount === 'number' && profile.albumCount > 0 && (
          <span className="artist-info-pill" title="Total Releases Cataloged">
            <Disc size={11} />
            <span>{profile.albumCount} Releases</span>
          </span>
        )}
      </div>

      {/* Genres / Tags */}
      {profile.genres && profile.genres.length > 0 && (
        <div className="artist-profile-genres">
          {profile.genres.map(g => (
            <span key={g} className="artist-genre-badge">
              {g}
            </span>
          ))}
        </div>
      )}

      {/* Biography Section */}
      {bioText && (
        <div className="artist-profile-bio-card">
          <p className="artist-profile-bio-text">
            {displayedBio}
          </p>
          {isLongBio && (
            <button
              type="button"
              className="artist-bio-expand-btn"
              onClick={() => setIsBioExpanded(!isBioExpanded)}
            >
              <span>{isBioExpanded ? 'Show less' : 'Read more'}</span>
              {isBioExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
          )}
        </div>
      )}

      {/* Socials & Streaming Links */}
      {profile.socials && profile.socials.length > 0 && (
        <div className="artist-profile-socials">
          <span className="artist-socials-label">Socials &amp; Streaming</span>
          <div className="artist-socials-list">
            {profile.socials.map(link => {
              const style = getPlatformStyle(link.platform);
              return (
                <a
                  key={`${link.platform}-${link.url}`}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="artist-social-pill"
                  style={{
                    backgroundColor: style.bg,
                    color: style.color,
                    borderColor: style.border,
                  }}
                  title={`Open ${link.label} for ${artistName}`}
                >
                  {link.platform === 'official' ? <Globe size={11} /> : null}
                  <span>{link.label}</span>
                  <ExternalLink size={10} style={{ opacity: 0.7 }} />
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
