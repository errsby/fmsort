import React, { useState } from 'react';
import { Disc, User, Music, ListMusic, Folder } from 'lucide-react';

interface CoverArtProps {
  src?: string | null;
  alt?: string;
  size?: number;
  rounded?: number | 'full';
  type?: 'album' | 'artist' | 'track' | 'playlist' | 'folder';
  seed?: string;
  className?: string;
  style?: React.CSSProperties;
}

const GRADIENTS = [
  'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)', // Deep Violet / Indigo
  'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)', // Fuchsia / Violet
  'linear-gradient(135deg, #06b6d4 0%, #2563eb 100%)', // Cyan / Blue
  'linear-gradient(135deg, #10b981 0%, #059669 100%)', // Emerald / Mint
  'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)', // Amber / Flame
  'linear-gradient(135deg, #6366f1 0%, #d946ef 100%)', // Electric Indigo / Magenta
  'linear-gradient(135deg, #f43f5e 0%, #be123c 100%)', // Rose / Crimson
  'linear-gradient(135deg, #14b8a6 0%, #0284c7 100%)', // Teal / Deep Sky
  'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)', // Purple / Hot Pink
  'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', // Sapphire Blue
  'linear-gradient(135deg, #84cc16 0%, #15803d 100%)', // Lime / Forest
  'linear-gradient(135deg, #d97706 0%, #b45309 100%)', // Warm Bronze
];

function getGradient(seed?: string): string {
  if (!seed) return GRADIENTS[0] || 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)';
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length] || GRADIENTS[0] || 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)';
}

function getInitials(text?: string): string {
  if (!text) return '';
  const words = text.trim().split(/\s+/).filter(Boolean);
  const w1 = words[0];
  const w2 = words[1];
  if (w1 && w2 && w1[0] && w2[0]) {
    return (w1[0] + w2[0]).toUpperCase();
  }
  return text.slice(0, 2).toUpperCase();
}

export const CoverArt: React.FC<CoverArtProps> = ({
  src,
  alt = 'Cover',
  size = 28,
  rounded = 4,
  type = 'album',
  seed,
  className = '',
  style,
}) => {
  const [loadFailed, setLoadFailed] = useState(false);

  const borderRadius = rounded === 'full' ? '50%' : `${rounded}px`;
  const bgGradient = getGradient(seed || alt || '');
  const hasValidImage = !!src && !loadFailed && src.trim() !== '' && src !== '—';

  const iconSize = Math.max(10, Math.round(size * 0.44));

  const renderFallbackIcon = () => {
    if (size >= 32 && seed && seed.trim()) {
      const initials = getInitials(seed);
      return (
        <span
          style={{
            fontSize: Math.max(10, Math.round(size * 0.36)),
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: 'rgba(255, 255, 255, 0.95)',
            textShadow: '0 1px 3px rgba(0,0,0,0.5)',
            lineHeight: 1,
            userSelect: 'none',
          }}
        >
          {initials}
        </span>
      );
    }

    const iconColor = 'rgba(255, 255, 255, 0.9)';
    if (type === 'artist') return <User size={iconSize} color={iconColor} />;
    if (type === 'playlist') return <ListMusic size={iconSize} color={iconColor} />;
    if (type === 'folder') return <Folder size={iconSize} color={iconColor} />;
    if (type === 'track') return <Music size={iconSize} color={iconColor} />;
    return <Disc size={iconSize} color={iconColor} />;
  };

  return (
    <div
      className={`cover-art-wrapper ${className}`}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        borderRadius,
        position: 'relative',
        overflow: 'hidden',
        background: bgGradient,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: size >= 40 ? '0 4px 14px rgba(0, 0, 0, 0.5)' : '0 1px 4px rgba(0, 0, 0, 0.25)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        flexShrink: 0,
        ...style,
      }}
    >
      {hasValidImage ? (
        <img
          src={src!}
          alt={alt}
          loading="lazy"
          onError={() => setLoadFailed(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            borderRadius,
          }}
        />
      ) : (
        renderFallbackIcon()
      )}
    </div>
  );
};
