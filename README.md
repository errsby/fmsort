# FMSort - MusicBrainz Music Organizer

A high-density, dark-themed music library organizer and metadata manager powered by **MusicBrainz**, **Bun**, **SQLite**, and **Vite + React + TypeScript**.

## Highlights

- **⚡ Hybrid Multi-Source Search Engine**:
  - **Discogs Integration**: Access to the world's largest physical discography (17.5M+ releases), including out-of-print albums, vinyl variants, catalog numbers, labels, and barcodes.
  - **Deezer Instant Search**: Zero-wait, key-less search (<80ms) for commercial and digital releases with exact tracklists, durations, UPC barcodes, and ISRCs.
  - **MusicBrainz**: Available as an encyclopedic cross-reference source.
- **Local SQLite Database**: Zero-dependency persistence powered by `bun:sqlite` with WAL mode enabled.
- **Maximum User Control**:
  - Create and manage hierarchical containers (`Folder`, `Label`, `Artist`, `Album`, `Playlist`, `Genre`, `Section`, `Era`, or custom types).
  - Add manual tracks or import complete tracklists directly from MusicBrainz.
  - Full metadata inspection and editing drawer for all track fields (Title, Artist, Album, Year, Format, Cat#, Barcode, MBID, ISRC, Length, BPM, Musical Key).
  - Batch operations: select multiple tracks to delete or move them to another container.
  - Real-time in-view filtering and multi-column sorting (ascending/descending).
  - Column visibility preferences (persisted locally).
  - Command palette (`⌘K` or `Ctrl+K`) for instant container navigation.
  - Backup & restore: export or import your entire library as JSON.

## Quick Start

### 1. Install Dependencies
```bash
bun install
```

### 2. Build Frontend
```bash
bun run build
```

### 3. Start the Server
```bash
bun start
```
Open **[http://localhost:3001](http://localhost:3001)** in your browser.

### Development Mode (with Hot Reloading)
In terminal 1 (Bun backend):
```bash
bun run dev:server
```
In terminal 2 (Vite client with HMR on port 5173):
```bash
bun run dev:client
```
