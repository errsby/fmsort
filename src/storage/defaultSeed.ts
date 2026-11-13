import type { LibraryNode, Track } from '../types';

export interface SeedData {
  nodes: {
    id: string;
    parent_id: string | null;
    type: string;
    name: string;
    sort_order: number;
    cover_url?: string;
  }[];
  tracks: {
    id: number;
    node_id: string;
    t: string;
    a: string;
    al: string;
    y: number;
    f: string;
    c: string;
    bc: string;
    mb: string;
    isrc: string;
    len: number;
    bpm: number;
    key: string;
    sort_order: number;
    cover_url?: string;
  }[];
}

export const DEFAULT_SEED_DATA: SeedData = {
  nodes: [
    // 1. Root Crates & Folders
    { id: 'f_kraut', parent_id: null, type: 'Folder', name: 'Krautrock & Adjacent', sort_order: 0 },
    { id: 'n_neu', parent_id: 'f_kraut', type: 'Artist', name: 'Neu!', sort_order: 0, cover_url: 'https://cdn-images.dzcdn.net/images/artist/9906d2a8fdcf4b476eb3fba975d4fa55/250x250-000000-80-0-0.jpg' },
    { id: 'n_neu75', parent_id: 'n_neu', type: 'Album', name: 'Neu! 75', sort_order: 0, cover_url: 'https://cdn-images.dzcdn.net/images/cover/e2e5057a66b268571408b04a6fccebb5/250x250-000000-80-0-0.jpg' },
    { id: 'n_cluster', parent_id: 'f_kraut', type: 'Artist', name: 'Cluster', sort_order: 1, cover_url: 'https://cdn-images.dzcdn.net/images/artist/5b5505e9754f9c3e986221c97a610cb4/250x250-000000-80-0-0.jpg' },
    { id: 'n_zuckerzeit', parent_id: 'n_cluster', type: 'Album', name: 'Zuckerzeit', sort_order: 0, cover_url: 'https://cdn-images.dzcdn.net/images/cover/0d8e87ad399990b79bcfc704797c2ae2/250x250-000000-80-0-0.jpg' },

    // 2. Playlists
    { id: 'p_night', parent_id: null, type: 'Playlist', name: 'Night Drives', sort_order: 1 },
    { id: 'n_era70', parent_id: 'p_night', type: 'Folder', name: '1970s Electronics', sort_order: 0 },
    { id: 'n_era80', parent_id: 'p_night', type: 'Folder', name: '1980s Post-Punk', sort_order: 1 },

    // 3. Dub & Reggae
    { id: 'f_dub', parent_id: null, type: 'Folder', name: 'Dub & Sound System', sort_order: 2 },
    { id: 'n_tubby', parent_id: 'f_dub', type: 'Artist', name: 'King Tubby', sort_order: 0, cover_url: 'https://cdn-images.dzcdn.net/images/artist/62b694bead865b45c26b52a5ca448b3b/250x250-000000-80-0-0.jpg' },
    { id: 'n_roots_dub', parent_id: 'n_tubby', type: 'Album', name: 'Dub From The Roots', sort_order: 0, cover_url: 'https://cdn-images.dzcdn.net/images/cover/7864831631525dbf758ba82bc194a287/250x250-000000-80-0-0.jpg' },

    // 4. Downtown NYC / Arthur Russell Special Collection
    { id: 'f_downtown', parent_id: null, type: 'Folder', name: 'Downtown NYC & Disco', sort_order: 3 },
    { id: 'n_arthur', parent_id: 'f_downtown', type: 'Artist', name: 'Arthur Russell', sort_order: 0, cover_url: 'https://cdn-images.dzcdn.net/images/artist/f1ba9a31a98075775f0a0c644efb794f/250x250-000000-80-0-0.jpg' },
    { id: 'n_world_of_echo', parent_id: 'n_arthur', type: 'Album', name: 'World of Echo', sort_order: 0, cover_url: 'https://cdn-images.dzcdn.net/images/cover/98bbd4c679a941f6057a7d512a83f98c/250x250-000000-80-0-0.jpg' },
    { id: 'n_first_thought', parent_id: 'n_arthur', type: 'Album', name: 'First Thought Best Thought', sort_order: 1, cover_url: 'https://cdn-images.dzcdn.net/images/cover/44146a86f91f7a4073f136696b5413ea/250x250-000000-80-0-0.jpg' },

    // 5. Electronic & IDM Favorites
    { id: 'f_idm', parent_id: null, type: 'Folder', name: 'IDM & Downtempo', sort_order: 4 },
    { id: 'n_casino', parent_id: 'f_idm', type: 'Artist', name: 'Casino Versus Japan', sort_order: 0, cover_url: 'https://cdn-images.dzcdn.net/images/artist/95a2e6f4a56a6ea4120ec6891ebdf98d/250x250-000000-80-0-0.jpg' },
    { id: 'n_whole_numbers', parent_id: 'n_casino', type: 'Album', name: 'Whole Numbers Play the Basics', sort_order: 0, cover_url: 'https://cdn-images.dzcdn.net/images/cover/a332af5979b15ec6b02109ef580b850e/250x250-000000-80-0-0.jpg' },
    { id: 'n_bogdan', parent_id: 'f_idm', type: 'Artist', name: 'Bogdan Raczynski', sort_order: 1, cover_url: 'https://cdn-images.dzcdn.net/images/artist/c181ee42cfd6ee2ba98fa4c3f5ea7c7c/250x250-000000-80-0-0.jpg' },
  ],
  tracks: [
    // Neu! 75
    { id: 101, node_id: 'n_neu75', t: 'Isi', a: 'Neu!', al: 'Neu! 75', y: 1975, f: 'Vinyl LP', c: '1K 062-32 271', bc: '4003099432712', mb: 'a3f1c2d8-4b5e-4a10-9c11-0d2e7f6b1a01', isrc: 'DEBR07500011', len: 595, bpm: 128, key: 'D', sort_order: 0, cover_url: 'https://cdn-images.dzcdn.net/images/cover/e2e5057a66b268571408b04a6fccebb5/250x250-000000-80-0-0.jpg' },
    { id: 102, node_id: 'n_neu75', t: 'Seeland', a: 'Neu!', al: 'Neu! 75', y: 1975, f: 'Vinyl LP', c: '1K 062-32 271', bc: '4003099432712', mb: 'a3f1c2d8-4b5e-4a10-9c11-0d2e7f6b1a01', isrc: 'DEBR07500012', len: 277, bpm: 96, key: 'A', sort_order: 1, cover_url: 'https://cdn-images.dzcdn.net/images/cover/e2e5057a66b268571408b04a6fccebb5/250x250-000000-80-0-0.jpg' },
    { id: 103, node_id: 'n_neu75', t: 'Leb’ wohl', a: 'Neu!', al: 'Neu! 75', y: 1975, f: 'Vinyl LP', c: '1K 062-32 271', bc: '4003099432712', mb: 'a3f1c2d8-4b5e-4a10-9c11-0d2e7f6b1a01', isrc: 'DEBR07500013', len: 345, bpm: 72, key: 'F', sort_order: 2, cover_url: 'https://cdn-images.dzcdn.net/images/cover/e2e5057a66b268571408b04a6fccebb5/250x250-000000-80-0-0.jpg' },

    // Cluster - Zuckerzeit
    { id: 104, node_id: 'n_zuckerzeit', t: 'Rosa', a: 'Cluster', al: 'Zuckerzeit', y: 1974, f: 'Vinyl LP', c: 'Brain 1077', bc: '4003099432774', mb: 'b7e24a90-1c3d-4f55-8a2e-5d91c0e3f702', isrc: 'DEBR07400021', len: 340, bpm: 110, key: 'C', sort_order: 0, cover_url: 'https://cdn-images.dzcdn.net/images/cover/0d8e87ad399990b79bcfc704797c2ae2/250x250-000000-80-0-0.jpg' },
    { id: 105, node_id: 'n_zuckerzeit', t: 'Hollywood', a: 'Cluster', al: 'Zuckerzeit', y: 1974, f: 'Vinyl LP', c: 'Brain 1077', bc: '4003099432774', mb: 'b7e24a90-1c3d-4f55-8a2e-5d91c0e3f702', isrc: 'DEBR07400022', len: 312, bpm: 104, key: 'G', sort_order: 1, cover_url: 'https://cdn-images.dzcdn.net/images/cover/0d8e87ad399990b79bcfc704797c2ae2/250x250-000000-80-0-0.jpg' },

    // Night Drives (1970s)
    { id: 106, node_id: 'n_era70', t: 'Autobahn', a: 'Kraftwerk', al: 'Autobahn', y: 1974, f: 'Vinyl LP', c: '6305 231', bc: '—', mb: 'd2e04f16-88b3-4cf9-84a5-73b9f2ea1d04', isrc: 'DEPH07400041', len: 1363, bpm: 120, key: 'D', sort_order: 0, cover_url: 'https://cdn-images.dzcdn.net/images/cover/5f58c7e2c9efd9510101b4c3aa412fc6/250x250-000000-80-0-0.jpg' },
    { id: 107, node_id: 'n_era70', t: 'Heroes', a: 'David Bowie', al: '"Heroes"', y: 1977, f: 'Vinyl LP', c: 'PL 12522', bc: '—', mb: 'e3f15a27-99c4-4da0-95b6-84cae3fb2e05', isrc: 'GBAYE7700051', len: 371, bpm: 112, key: 'E', sort_order: 1, cover_url: 'https://cdn-images.dzcdn.net/images/cover/e41e21b0b5aa9fbda6c13568779c4a5c/250x250-000000-80-0-0.jpg' },

    // Night Drives (1980s)
    { id: 108, node_id: 'n_era80', t: 'Atmosphere', a: 'Joy Division', al: 'Closer', y: 1980, f: 'Vinyl LP', c: 'FACT 25', bc: '5012093000253', mb: 'f4a26b38-aad5-4eb1-a6c7-95dbf40c3f06', isrc: 'GBAAA8000061', len: 251, bpm: 138, key: 'Am', sort_order: 0, cover_url: 'https://cdn-images.dzcdn.net/images/cover/9079555fc00fa44eb98471c696e987c9/250x250-000000-80-0-0.jpg' },
    { id: 109, node_id: 'n_era80', t: 'Blue Monday', a: 'New Order', al: 'Power, Corruption & Lies', y: 1983, f: '12" Single', c: 'FAC 73', bc: '—', mb: 'a5b37c49-bbe6-4fc2-b7d8-a6ec051d4a07', isrc: 'GBAAA8300071', len: 449, bpm: 130, key: 'F', sort_order: 1, cover_url: 'https://cdn-images.dzcdn.net/images/cover/a4347712395d9e5bca578b86d9a9cbba/250x250-000000-80-0-0.jpg' },

    // King Tubby
    { id: 110, node_id: 'n_roots_dub', t: 'Fat Man Dub', a: 'King Tubby', al: 'Dub From The Roots', y: 1974, f: 'Vinyl LP', c: 'SLP 001', bc: '—', mb: 'c1d93e05-77a2-4be8-b3f4-62a8e1d90c03', isrc: 'JMX017400031', len: 228, bpm: 0, key: '', sort_order: 0, cover_url: 'https://cdn-images.dzcdn.net/images/cover/7864831631525dbf758ba82bc194a287/250x250-000000-80-0-0.jpg' },
    { id: 111, node_id: 'n_roots_dub', t: 'Dub Organiser', a: 'King Tubby', al: 'Dub From The Roots', y: 1974, f: 'Vinyl LP', c: 'SLP 001', bc: '—', mb: 'c1d93e05-77a2-4be8-b3f4-62a8e1d90c03', isrc: 'JMX017400032', len: 242, bpm: 0, key: '', sort_order: 1, cover_url: 'https://cdn-images.dzcdn.net/images/cover/7864831631525dbf758ba82bc194a287/250x250-000000-80-0-0.jpg' },

    // Arthur Russell - Including verified Track 6112!
    { id: 6112, node_id: 'n_world_of_echo', t: 'Get Around To It', a: 'Arthur Russell', al: 'World of Echo', y: 1986, f: 'Vinyl LP', c: 'Upside 60002-1', bc: '021075101017', mb: 'b39e248a-aef2-4bc4-9d52-9b2f21ea6481', isrc: 'USAK20300009', len: 308, bpm: 118, key: 'A', sort_order: 0, cover_url: 'https://cdn-images.dzcdn.net/images/cover/98bbd4c679a941f6057a7d512a83f98c/250x250-000000-80-0-0.jpg' },
    { id: 6113, node_id: 'n_world_of_echo', t: 'Wax the Van', a: 'Arthur Russell', al: 'World of Echo', y: 1986, f: 'Vinyl LP', c: 'Upside 60002-1', bc: '021075101017', mb: 'b39e248a-aef2-4bc4-9d52-9b2f21ea6481', isrc: 'USAK20300010', len: 211, bpm: 115, key: 'D', sort_order: 1, cover_url: 'https://cdn-images.dzcdn.net/images/cover/98bbd4c679a941f6057a7d512a83f98c/250x250-000000-80-0-0.jpg' },
    { id: 6114, node_id: 'n_first_thought', t: 'This Is How We Walk on the Moon', a: 'Arthur Russell', al: 'First Thought Best Thought', y: 2004, f: 'CD', c: 'RTD 199.3900.2', bc: '5034202105021', mb: 'f1a92e31-5c8e-4a11-8e99-8d7a1c3e4b09', isrc: 'USAK20400018', len: 281, bpm: 108, key: 'G', sort_order: 0, cover_url: 'https://cdn-images.dzcdn.net/images/cover/44146a86f91f7a4073f136696b5413ea/250x250-000000-80-0-0.jpg' },

    // Casino Versus Japan
    { id: 701, node_id: 'n_whole_numbers', t: 'Single Word Becoming', a: 'Casino Versus Japan', al: 'Whole Numbers Play the Basics', y: 2002, f: 'CD', c: 'carpark 16', bc: '690978201620', mb: 'c1d93e05-77a2-4be8-b3f4-62a8e1d90c12', isrc: 'USCAR0201601', len: 184, bpm: 92, key: 'C', sort_order: 0, cover_url: 'https://cdn-images.dzcdn.net/images/cover/a332af5979b15ec6b02109ef580b850e/250x250-000000-80-0-0.jpg' },
    { id: 702, node_id: 'n_whole_numbers', t: 'Aquarium', a: 'Casino Versus Japan', al: 'Whole Numbers Play the Basics', y: 2002, f: 'CD', c: 'carpark 16', bc: '690978201620', mb: 'c1d93e05-77a2-4be8-b3f4-62a8e1d90c12', isrc: 'USCAR0201602', len: 268, bpm: 88, key: 'F', sort_order: 1, cover_url: 'https://cdn-images.dzcdn.net/images/cover/a332af5979b15ec6b02109ef580b850e/250x250-000000-80-0-0.jpg' },
  ],
};
