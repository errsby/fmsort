/**
 * Fast Artist Profile & Information Service
 * Combines Deezer (high-res photos, fan metrics, links) with
 * Wikipedia (biography extract, description, wiki links) and
 * MusicBrainz / streaming links.
 */

export interface ArtistSocialLink {
  platform: 'deezer' | 'spotify' | 'apple' | 'youtube' | 'discogs' | 'bandcamp' | 'soundcloud' | 'wikipedia' | 'official' | 'instagram' | 'twitter' | 'web';
  label: string;
  url: string;
}

export interface ArtistProfileData {
  name: string;
  bio?: string;
  description?: string;
  picture?: string;
  backdropUrl?: string;
  genres: string[];
  country?: string;
  yearsActive?: string;
  fanCount?: number;
  albumCount?: number;
  deezerId?: number;
  deezerUrl?: string;
  wikipediaUrl?: string;
  socials: ArtistSocialLink[];
}

const cache = new Map<string, { data: ArtistProfileData; timestamp: number }>();
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

export async function getArtistProfile(artistName: string): Promise<ArtistProfileData> {
  const cleanName = artistName.trim();
  if (!cleanName) {
    return {
      name: '',
      genres: [],
      socials: [],
    };
  }

  const cacheKey = cleanName.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  // 1. Deezer: Artist photos, fan count, album count, Deezer profile link
  const deezerPromise = (async () => {
    try {
      const url = `https://api.deezer.com/search/artist?q=${encodeURIComponent(cleanName)}&limit=1`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'FMSort/1.0.0 ( https://github.com/err/fmsort )',
          'Accept': 'application/json',
        },
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json?.data?.[0] || null;
    } catch {
      return null;
    }
  })();

  // 2. Wikipedia: Comprehensive biography and summary
  const wikiPromise = (async () => {
    try {
      // First attempt: direct summary title
      const directUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanName.replace(/ /g, '_'))}`;
      const res = await fetch(directUrl, {
        headers: {
          'User-Agent': 'FMSort/1.0.0 ( https://github.com/err/fmsort )',
          'Accept': 'application/json',
        },
      });
      if (res.ok) {
        const json = await res.json();
        const combined = `${json.description || ''} ${json.extract || ''}`;
        if (/music|band|duo|trio|singer|composer|producer|artist|electronic|dj|album|techno|house|rap|rock|metal|pop|hip hop|punk|indie|soundtrack/i.test(combined)) {
          return {
            extract: json.extract as string,
            description: json.description as string,
            url: json.content_urls?.desktop?.page as string,
            thumbnail: json.originalimage?.source || json.thumbnail?.source as string,
          };
        }
      }

      // Second attempt: search Wikipedia with "musician" keyword
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanName + ' musician')}&utf8=&format=json`;
      const sRes = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'FMSort/1.0.0 ( https://github.com/err/fmsort )',
          'Accept': 'application/json',
        },
      });
      if (!sRes.ok) return null;
      const sJson = await sRes.json();
      const firstTitle = sJson?.query?.search?.[0]?.title;
      if (!firstTitle) return null;

      const sumUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(firstTitle.replace(/ /g, '_'))}`;
      const sumRes = await fetch(sumUrl, {
        headers: {
          'User-Agent': 'FMSort/1.0.0 ( https://github.com/err/fmsort )',
          'Accept': 'application/json',
        },
      });
      if (!sumRes.ok) return null;
      const sumJson = await sumRes.json();
      return {
        extract: sumJson.extract as string,
        description: sumJson.description as string,
        url: sumJson.content_urls?.desktop?.page as string,
        thumbnail: sumJson.originalimage?.source || sumJson.thumbnail?.source as string,
      };
    } catch {
      return null;
    }
  })();

  // 3. MusicBrainz: Country, years active, genres/tags, and relations (with 1.8s timeout)
  const mbPromise = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1800);
    try {
      const url = `https://musicbrainz.org/ws/2/artist?query=artist:%22${encodeURIComponent(cleanName)}%22&fmt=json&limit=1`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'FMSort/1.0.0 ( err@fmsort.local )' },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) return null;
      const json = await res.json();
      const a = json?.artists?.[0];
      if (!a) return null;

      const country = a.country || a.area?.name || '';
      let yearsActive = '';
      if (a['life-span']) {
        const begin = a['life-span'].begin ? a['life-span'].begin.slice(0, 4) : '';
        const end = a['life-span'].end ? a['life-span'].end.slice(0, 4) : (a['life-span'].ended ? 'Ended' : 'Present');
        if (begin) yearsActive = `${begin} – ${end}`;
      }

      const tags = (a.tags || [])
        .sort((x: any, y: any) => (y.count || 0) - (x.count || 0))
        .slice(0, 8)
        .map((t: any) => t.name as string);

      // Fetch url-rels
      let mbUrls: { type: string; url: string }[] = [];
      try {
        const relController = new AbortController();
        const relTimer = setTimeout(() => relController.abort(), 1800);
        const relUrl = `https://musicbrainz.org/ws/2/artist/${a.id}?inc=url-rels&fmt=json`;
        const rRes = await fetch(relUrl, {
          headers: { 'User-Agent': 'FMSort/1.0.0 ( err@fmsort.local )' },
          signal: relController.signal,
        });
        clearTimeout(relTimer);
        if (rRes.ok) {
          const rJson = await rRes.json();
          mbUrls = (rJson.relations || [])
            .filter((r: any) => r.url?.resource)
            .map((r: any) => ({ type: r.type, url: r.url.resource }));
        }
      } catch {}

      return {
        country,
        yearsActive,
        tags,
        mbUrls,
      };
    } catch {
      clearTimeout(timer);
      return null;
    }
  })();

  const [deezer, wiki, mb] = await Promise.all([deezerPromise, wikiPromise, mbPromise]);

  const picture = deezer?.picture_xl || deezer?.picture_big || deezer?.picture_medium || wiki?.thumbnail || '';
  const backdropUrl = deezer?.picture_xl || deezer?.picture_big || wiki?.thumbnail || '';
  const fanCount = typeof deezer?.nb_fan === 'number' ? deezer.nb_fan : undefined;
  const albumCount = typeof deezer?.nb_album === 'number' ? deezer.nb_album : undefined;
  const deezerId = deezer?.id;
  const deezerUrl = deezer?.link || (deezerId ? `https://www.deezer.com/artist/${deezerId}` : undefined);
  const wikipediaUrl = wiki?.url;

  const genres: string[] = mb?.tags && mb.tags.length > 0 ? mb.tags : [];

  // Build high-value social links list
  const socialsMap = new Map<string, ArtistSocialLink>();

  // Deezer
  if (deezerUrl) {
    socialsMap.set('deezer', { platform: 'deezer', label: 'Deezer', url: deezerUrl });
  }

  // Spotify
  const mbSpotify = mb?.mbUrls.find(u => u.url.includes('spotify.com'));
  socialsMap.set('spotify', {
    platform: 'spotify',
    label: 'Spotify',
    url: mbSpotify ? mbSpotify.url : `https://open.spotify.com/search/${encodeURIComponent(cleanName)}`,
  });

  // Apple Music
  const mbApple = mb?.mbUrls.find(u => u.url.includes('apple.com'));
  if (mbApple) {
    socialsMap.set('apple', { platform: 'apple', label: 'Apple Music', url: mbApple.url });
  }

  // Bandcamp
  const mbBandcamp = mb?.mbUrls.find(u => u.url.includes('bandcamp.com'));
  socialsMap.set('bandcamp', {
    platform: 'bandcamp',
    label: 'Bandcamp',
    url: mbBandcamp ? mbBandcamp.url : `https://bandcamp.com/search?q=${encodeURIComponent(cleanName)}`,
  });

  // SoundCloud
  const mbSoundcloud = mb?.mbUrls.find(u => u.url.includes('soundcloud.com'));
  socialsMap.set('soundcloud', {
    platform: 'soundcloud',
    label: 'SoundCloud',
    url: mbSoundcloud ? mbSoundcloud.url : `https://soundcloud.com/search/people?q=${encodeURIComponent(cleanName)}`,
  });

  // Discogs
  const mbDiscogs = mb?.mbUrls.find(u => u.url.includes('discogs.com'));
  socialsMap.set('discogs', {
    platform: 'discogs',
    label: 'Discogs',
    url: mbDiscogs ? mbDiscogs.url : `https://www.discogs.com/search/?q=${encodeURIComponent(cleanName)}&type=artist`,
  });

  // YouTube / YouTube Music
  const mbYoutube = mb?.mbUrls.find(u => u.url.includes('youtube.com'));
  socialsMap.set('youtube', {
    platform: 'youtube',
    label: 'YouTube',
    url: mbYoutube ? mbYoutube.url : `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanName + ' official music')}`,
  });

  // Wikipedia
  if (wikipediaUrl) {
    socialsMap.set('wikipedia', { platform: 'wikipedia', label: 'Wikipedia', url: wikipediaUrl });
  }

  // Twitter / X
  const mbTwitter = mb?.mbUrls.find(u => /(?:^|https?:\/\/(?:www\.)?)(?:twitter\.com|x\.com)\//i.test(u.url));
  if (mbTwitter) {
    socialsMap.set('twitter', { platform: 'twitter', label: 'X / Twitter', url: mbTwitter.url });
  }

  // Instagram
  const mbInstagram = mb?.mbUrls.find(u => u.url.includes('instagram.com'));
  if (mbInstagram) {
    socialsMap.set('instagram', { platform: 'instagram', label: 'Instagram', url: mbInstagram.url });
  }

  // Official site
  const mbOfficial = mb?.mbUrls.find(u => u.type === 'official homepage');
  if (mbOfficial) {
    socialsMap.set('official', { platform: 'official', label: 'Official Site', url: mbOfficial.url });
  }

  const result: ArtistProfileData = {
    name: cleanName,
    bio: wiki?.extract || undefined,
    description: wiki?.description || undefined,
    picture: picture || undefined,
    backdropUrl: backdropUrl || undefined,
    genres,
    country: mb?.country || undefined,
    yearsActive: mb?.yearsActive || undefined,
    fanCount,
    albumCount,
    deezerId,
    deezerUrl,
    wikipediaUrl,
    socials: Array.from(socialsMap.values()),
  };

  cache.set(cacheKey, { data: result, timestamp: Date.now() });
  return result;
}
