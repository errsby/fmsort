import React, { useState, useEffect } from 'react';
import { Disc, User, Music, ListMusic } from 'lucide-react';
import Avatar from 'boring-avatars';

export type FunkyVariant = 'bauhaus' | 'ring' | 'sunset' | 'pixel' | 'marble' | 'beam';
export const FUNKY_VARIANTS: readonly FunkyVariant[] = ['bauhaus', 'ring', 'sunset', 'pixel', 'marble'];

export const FUNKY_PALETTES: string[][] = [
  // 1. Synthwave Neon / Cyberpunk
  ['#0a0017', '#ff007f', '#00f0ff', '#ffe600', '#7928ca'],
  // 2. 80s Memphis Boogie / Disco
  ['#180b2a', '#ff0055', '#ff5400', '#ffbd00', '#00f5d4'],
  // 3. Acid House / Electric Rave
  ['#050505', '#39ff14', '#00f5d4', '#d000ff', '#ff007f'],
  // 4. Velvet Soul / Deep Funk
  ['#20002c', '#cbb4d4', '#e06b9f', '#ff7b54', '#ffd56b'],
  // 5. Tokyo Vaporwave / City Pop
  ['#09090e', '#f72585', '#7209b7', '#3a0ca3', '#4cc9f0'],
  // 6. Bauhaus Constructivist
  ['#141416', '#e63946', '#f1faee', '#a8dadc', '#e76f51'],
  // 7. Tropical Afrobeat / Sunshine
  ['#0c1b1a', '#ffb703', '#fb8500', '#02c39a', '#e71d36'],
  // 8. Detroit Techno / Minimal Gold
  ['#0d0e12', '#d4af37', '#64748b', '#06b6d4', '#f59e0b'],
  // 9. Cosmic Vinyl / Purple Haze
  ['#10002b', '#3c096c', '#7b2cbf', '#c77dff', '#e0aaff'],
  // 10. Dub Bass / Reggae Sound System
  ['#061d12', '#2a9d8f', '#e9c46a', '#f4a261', '#e76f51'],
  // 11. Glitch Hyperpop / Candy
  ['#0f051d', '#ff1493', '#00e5ff', '#fff01f', '#bf00ff'],
  // 12. French Touch / Filter Disco
  ['#190b28', '#ff3366', '#ff9933', '#33ccff', '#cc33ff'],
];

export function hashSeed(seed: string): number {
  if (!seed) return 0;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getFunkyPalette(seed: string): string[] {
  const hash = hashSeed(seed || 'Crate');
  return FUNKY_PALETTES[hash % FUNKY_PALETTES.length];
}

export function getFunkyVariant(seed: string): FunkyVariant {
  const hash = hashSeed(seed || 'Crate');
  const variantHash = Math.floor(hash / FUNKY_PALETTES.length);
  return FUNKY_VARIANTS[variantHash % FUNKY_VARIANTS.length];
}

export function getDiceBearUrl(
  seed: string,
  style: 'shapes' | 'rings' | 'glass' | 'identicon' = 'shapes'
): string {
  const clean = encodeURIComponent((seed || 'Crate').trim());
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${clean}&backgroundColor=09090b,18181b,1e1b4b,2e0854,022c22,450a0a,172554,0f172a`;
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

export interface CoverArtProps {
  src?: string | null;
  alt?: string;
  size?: number;
  rounded?: number | 'full';
  type?: 'album' | 'artist' | 'track' | 'playlist' | 'folder' | string;
  seed?: string;
  className?: string;
  style?: React.CSSProperties;
  variant?: FunkyVariant | 'auto';
  funky?: boolean;
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
  variant = 'auto',
  funky,
}) => {
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setLoadFailed(false);
  }, [src]);

  const isFolder = type === 'folder' || type === 'Folder';
  const isFunky = funky !== undefined ? funky : isFolder;
  const effectiveSeed = (seed?.trim() || alt?.trim() || (isFolder ? 'Crate' : ''));
  const borderRadius = rounded === 'full' ? '50%' : `${rounded}px`;
  // Folders always prioritize text-generated thumbnails (never taken over by child album or track covers)
  const hasValidImage = isFolder ? false : (!!src && !loadFailed && src.trim() !== '' && src !== '—');

  // If this is a folder (or explicitly funky), render funky text-generated thumbnail
  if (isFolder || (isFunky && !hasValidImage)) {
    const palette = getFunkyPalette(effectiveSeed);
    const chosenVariant = variant && variant !== 'auto' ? variant : getFunkyVariant(effectiveSeed);

    return (
      <div
        className={`cover-art-wrapper funky-thumbnail ${className}`}
        title={effectiveSeed || 'Crate'}
        style={{
          width: size,
          height: size,
          minWidth: size,
          minHeight: size,
          borderRadius,
          position: 'relative',
          overflow: 'hidden',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: size >= 40 ? '0 4px 14px rgba(0, 0, 0, 0.5)' : '0 1px 4px rgba(0, 0, 0, 0.25)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          flexShrink: 0,
          background: palette[0] || '#18181b',
          ...style,
        }}
      >
        <Avatar
          size={size}
          name={effectiveSeed}
          variant={chosenVariant}
          colors={palette}
          square={rounded !== 'full'}
        />
        {/* Subtle glass gloss sheen */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(135deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,0.3) 100%)',
            pointerEvents: 'none',
            borderRadius,
          }}
        />
      </div>
    );
  }

  // Standard album/artist/playlist fallback or image render
  const bgGradient = getGradient(seed || alt || '');
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
    if (type === 'artist' || type === 'Artist') return <User size={iconSize} color={iconColor} />;
    if (type === 'playlist' || type === 'Playlist') return <ListMusic size={iconSize} color={iconColor} />;
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
