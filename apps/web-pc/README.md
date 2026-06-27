# StreamPro IPTV App

A sleek, premium IPTV application built with React and Vite. Designed to provide a modern, cinematic viewing experience for Live TV, Movies, and Series, mimicking top-tier streaming services like Netflix, Hulu, or Max.

## Core Features

- **Cinematic UI**: Premium design aesthetics featuring glassmorphism, dynamic animations, edge-to-edge Hero Banners, and clean grid layouts.
- **Lightning-Fast Smart Search**: A powerful "Google-like" search engine with **relevance scoring**—exact title matches float to the top, followed by Actor/Cast, Director, Genre, or Plot matches. The entire catalog is **pre-fetched and cached in the background** with a 6-hour auto-expiry, ensuring instant search results without server delay.
- **Advanced Networking & Spoofing:** Dedicated Express proxy (`server.js`) intercepts all frontend API calls. Injects Custom User-Agents and HTTP Keep-Alive connections to instantly bypass strict provider blocks and handle aggressive timeouts seamlessly.
- **Premium Customizable UI:** Fully responsive Settings architecture with multi-profile support. Toggle startup behaviors, time formats, caching multipliers, and aesthetic themes on the fly.
- **Dynamic HLS Caching:** User-configurable buffer sizes scale HLS.js caching limits dynamically to stop buffering on slow connections.
- **VOD Library**: Browse Movies and Series with infinite scrolling, category filtering, and sorting capabilities (Most Popular, New Releases).
- **Interactive Series Overlay**: Beautiful series detail screens with season selectors, episode lists, thumbnail previews, and automatic episode tracking.
- **Live TV EPG Grid**: Fully functional Electronic Program Guide with a beautifully styled timeline, automated gap-filling for missing schedule data, and seamless channel listing.

## Premium Additions

- **Native Desktop Application**: Packaged as a standalone Windows `.exe` using Electron. The app automatically spawns a multithreaded Node.js background process via `child_process.fork`, completely isolating heavy data processing from the smooth 144hz React UI renderer.
- **Smart Direct Stream Routing**: Automatically detects the running environment. In the browser development environment, it securely proxies all `.m3u8` playlists through Node to avoid CORS. Inside the native `.exe`, it intelligently bypasses the proxy and connects *directly* to the provider's edge servers for flawless, stutter-free 4K playback.
- **Real-Time AC3 Audio Transcoding**: Bypasses Chromium's lack of proprietary Dolby Digital (AC3) decoders. Features a built-in "Fix Audio" button that intercepts silent live streams and utilizes a bundled FFmpeg instance to transcode AC3 audio to universal AAC in real-time, piping it back to the player with zero video lag.
- **Live TV DVR Recording**: Built-in digital video recorder that gracefully intercepts live stream data and saves it directly to your hard drive as MP4. Features a background engine to automatically generate thumbnails, preserve `.moov` metadata atoms, and provide instantaneous UI feedback for play/delete commands.
- **Progressive Background EPG Engine**: Rewritten to handle massive 10,000+ channel lists flawlessly. The main UI thread loads the virtualized grid instantly, while an asynchronous background loop progressively fetches and populates the EPG guide data in 50-channel chunks without throwing "Not Responding" errors.
- **Multi-Source Custom EPG**: Features a custom-built backend that aggregates and fuzzy-matches high-quality EPG XML data from third-party sources (e.g., CA and US guide data) to populate missing TV guides natively. The matching algorithm is robust enough to prioritize regional variations (e.g., US vs CA vs UK).
- **Sleek Floating Live TV HUD**: A custom-designed, non-intrusive Live TV Player HUD. Move your mouse to reveal a beautifully integrated gradient control bar featuring a floating "Recent Channels" quick-zapper, a Favorite toggle, and current program metadata.
- **Instant Global Search**: Press `Ctrl+K` or `/` from anywhere in the app to open a sleek, full-screen blur overlay and search across Movies and Series instantly.
- **Dynamic Theming**: Open the Settings Modal to choose from 8 premium color palettes (e.g., Neon Pink, Emerald Green) that instantly update the app's accents and glows across the UI.
- **Cinematic Player**: Custom React video player with native HLS and MP4 fallback, handling embedded VTT/SRT subtitles and multi-track audio. Includes options for Auto-Play Next Episode for TV Series, an "Are You Still Watching?" idle timeout (Configurable in Settings), and a customizable Sleep Timer.
- **TMDB Metadata Enrichment & Image Proxy**: Automatically fetches high-resolution posters from TMDB for missing IPTV media. If TMDB fails, it forces the IPTV provider's original image through a local Node.js proxy (injecting a `VLC` User-Agent) to bypass strict 403 Forbidden hotlink blocks.
- **Procedural Dynamic Posters**: When a title is too obscure to exist on TMDB or the IPTV provider, the app dynamically generates a premium, moody cinematic gradient poster driven by a string-hash of the movie's title, ensuring the UI never breaks immersion with "blank" missing images.
- **Stealth Mode (Adult Filter)**: Global API interceptor that aggressively filters out and drops categories and streams containing "XXX" or "Adult" keywords (Configurable via PIN-locked Parental Controls).
- **Auto-Start on Boot**: Deep OS integration via Electron to automatically launch the application in the background when the PC boots up (Configurable in Advanced Settings).
- **Resilient Video Player Engine**: An advanced streaming playback engine that monitors HLS errors and dead sockets. If a user pauses an IPTV stream for too long, the player performs a silent "Hard Reload" to instantly rebuild the connection and seek back to the exact paused frame without throwing errors.
- **Expandable Volume Slider**: A sleek, space-saving volume control that smoothly expands into a scrubber bar when hovered, keeping the player HUD uncluttered.
- **Mini-Player (Picture-in-Picture)**: Shrink the video player to the corner of the screen so you can continue browsing your library while watching Live TV or VODs. The UI seamlessly escapes full-screen mode and hides all playback controls to provide a clean, unobstructed view of the stream.
- **Up Next Auto-Play (Binge Mode)**: When watching a TV series, the player will automatically skip to the next episode when you reach the final 10 seconds.
- **Slim Glass Pillar Sidebar**: A highly optimized navigation sidebar that rests as an elegant 80px glass pillar, expanding only when hovered to reveal full text labels. Maximizes horizontal screen real estate for cinematic library browsing.
- **Catch-Up TV (Timeshifting)**: Watch past broadcasts seamlessly natively inside the EPG Grid. Features a 72-hour backward-scrollable infinite timeline, visual "Replay" indicators on supported past programs, and an intelligent backend proxy to securely stream archived `.m3u8` playlists with full pause/rewind capabilities. Includes a user toggle in Settings to disable it and save bandwidth.
- **Lightning-Fast App Startup**: Employs lazy-loading state architecture and background chunking to prevent main-thread freezing. The massive Live TV channels and VOD databases are dynamically loaded *only* when viewing their respective tabs, and background caching is deferred via timeouts to keep initial app load completely frictionless.
- **Custom Zero-Dependency Virtualized EPG Grid**: A highly optimized, bespoke split-pane Electronic Program Guide. It supports infinite scrolling of thousands of channels simultaneously at 60fps using a custom scroll-throttled virtualization engine, completely removing the need for heavy third-party libraries. Features an embedded category filter, flawless date-math boundary clipping, sequential premium channel badges (`001`, `002`), and user-configurable UI elements like a global "NOW" playhead line and Live Program Progress Fill.
- **Smart "Continue Watching" & Dashboards**: A fully personalized Home Dashboard that pins your "Continue Watching" row (strictly for VOD) and "New Episodes" row front and center, completely stripping away generic content.
- **Dedicated Live TV History**: A specialized "Recent Channels" history bar exclusively for the Live TV tab, keeping your VOD and Live TV watch histories cleanly separated.
- **New Episode Badges**: Glowing red "NEW EPISODES" badges automatically appear on series in your library when your provider uploads new content.
- **Smart Image Fallbacks**: Automatically fetches a TMDB poster if the IPTV provider's image link is broken. If TMDB fails, generates a cinematic CSS gradient background with centered text.
- **Multi-User Profiles**: Support for multiple family members under a single provider login. Each profile maintains its own custom Name, Emoji Avatar, personalized "Continue Watching" history, and Favorites list.
- **Dynamic Login Architecture**: Fully dynamic credential handling allowing for client-side Xtream Code login, decoupling the app from hardcoded backend `.env` variables for safe distribution.

## Technology Stack

- **Frontend**: React.js, Vite, hls.js
- **Styling**: Vanilla CSS (CSS Variables, Flexbox/Grid, Animations)
- **Icons**: Lucide React
- **TV Navigation**: Norigin Spatial Navigation
- **Backend / Proxy API**: Node.js, Express, Axios, fast-xml-parser

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- NPM or Yarn

### Installation

1. **Clone or Download the Repository**
2. **Install Frontend Dependencies:**
   ```bash
   npm install
   ```
3. **Install Backend Dependencies:**
   ```bash
   cd server
   npm install
   ```

### Running the App Locally

Start both the backend proxy and the Vite development server.

1. **Start the Proxy Server:**
   ```bash
   cd server
   npm start
   ```
   *(The server runs on `http://localhost:3001` by default)*

2. **Start the React Frontend:**
   Open a new terminal window at the project root and run:
   ```bash
   npm run dev
   ```
   *(The Vite app runs on `http://localhost:5174` by default)*

## Storage Architecture

### Why `localStorage`?
The app uses `localStorage` (via the `useUserData` hook) to persist user profiles, credentials, favorites, and watch history. This was chosen for simplicity during early development when the app was browser-first — `localStorage` requires zero dependencies and syncs automatically with React state.

### The `slimItem()` Pattern — Why We Strip TMDB Data Before Saving
When a user opens a Movie or Series overlay, the app fetches rich metadata from TMDB (cast arrays, full plot summaries, backdrop image URLs, genre arrays, vote counts, etc.). Early versions stored this entire enriched object directly into `favorites` and `continueWatching`.

**The problem:** `localStorage` has a hard **5MB limit** per origin. A single TMDB-enriched item can be 2–4 KB. With multiple profiles and hundreds of favorites/watched items, this caused a `QuotaExceededError` that silently failed to save new data.

**The fix (`slimItem()` in `useUserData.js`):** Before writing any item to localStorage, we strip it down to only the fields that are actually *rendered by card UI components* (poster, title, id, rating, progress, episode label). This reduces each stored item by ~90% (from ~3,500 bytes to ~350 bytes).

**Nothing visible is lost:** Full TMDB metadata is already re-fetched on-demand whenever a user opens a Movie/Series overlay — so the cards look identical, and the overlays load the same rich data. Only the redundant localStorage copy is trimmed.

### Future: IndexedDB Migration
When the `shared-core` package is built for the Android TV port, the storage layer should be migrated from `localStorage` to **IndexedDB** (via [Dexie.js](https://dexie.org/)). This is how professional IPTV apps like TiviMate (SQLite) and Stremio (IndexedDB) handle persistence — effectively unlimited storage with no quota errors, and faster reads/writes for large datasets.

---

## Live TV Performance Architecture

Live TV playback has two distinct bottlenecks that don't exist for VOD: the proxy overhead on every segment, and the HLS.js buffer defaults that were designed for on-demand content.

### Bottleneck 1 — The Proxy TCP Handshake (Server)

Every live HLS stream delivers a new video segment every 2–6 seconds. In browser/dev mode, each segment passes through the Node.js proxy (`/proxy/stream/absolute`) before reaching hls.js. Without connection reuse, Node opens a **fresh TCP connection** to the IPTV provider's CDN for every single segment — and a TCP handshake costs 50–150ms on its own. That overhead compounds into constant micro-buffering.

**The fix (`keepAliveAxios` in `server.js`):** A shared pool of persistent HTTP/HTTPS connections (`http.Agent` / `https.Agent` with `keepAlive: true`) is created once at startup and reused for all outbound proxy requests. After the first segment, subsequent ones skip the handshake entirely — the connection is already open and waiting.

```
Without Keep-Alive:  each segment = handshake (100ms) + transfer (varies)
With Keep-Alive:     each segment = transfer only (handshake paid once)
```

`X-Accel-Buffering: no` is also set on segment responses so Express flushes data to hls.js as it arrives instead of accumulating it in an internal buffer first.

### Bottleneck 2 — HLS.js Was Tuned for VOD, Not Live (Client)

hls.js defaults assume on-demand content where the user might seek backwards and network conditions vary widely. For live TV those assumptions are wrong:

| Setting | VOD default | Live TV value | Reason |
|---|---|---|---|
| `maxBufferLength` | 30s | **8s** | Start playing sooner — no need to buffer 30s before the first frame |
| `maxMaxBufferLength` | 60s | **20s** | Live TV can't be rewound; capping saves memory and reduces GC pauses that cause stalls |
| `backBufferLength` | 30s | **5s** | Back-buffer exists for seeking backwards — not applicable to live streams |
| `liveMaxLatencyDurationCount` | 4 | **3** | Catches up to the live edge sooner (3 × segment duration vs 4) |
| `fragLoadingTimeOut` | 20s | **8s** | Fail fast and retry a dead segment rather than freezing for 20s |
| `nudgeMaxRetry` | — | **6** | Auto-nudges the playhead out of micro-stalls without a full reload |

The VOD playback path keeps its own separate profile with the larger defaults, so movies and series are unaffected.

### Why Electron Mode Avoids the Proxy Entirely

In the packaged `.exe`, `getLiveStreamUrl()` detects `navigator.userAgent` contains `Electron` and returns a **direct** provider URL instead of routing through `localhost:3001`. hls.js connects straight to the IPTV CDN with no Node proxy in between. This means Keep-Alive still applies (hls.js uses the browser's own connection pool natively) but the Node overhead disappears entirely — giving the best possible latency in the shipped product.

---

## Real-Time Transcoding Engine (FFmpeg Pipe)

Chromium-based browsers (including Electron) do not ship with proprietary decoders for AC3 (Dolby Digital) audio or HEVC (H.265) video due to licensing restrictions. This causes some IPTV channels to play with no sound or show a black screen.

To fix this, the app includes an on-demand **Real-Time Transcoder** using a bundled FFmpeg binary.

### The Headphone Button (Audio/Video Fix)
When the user encounters a silent or black channel, clicking the "Headphone" icon on the HUD toggles `transcodeMode`. This appends `&transcode=true` to the `.m3u8` request.
1. The Node proxy intercepts the `.m3u8` and dynamically rewrites every `.ts` chunk URL to include `&transcode=true`.
2. When `hls.js` requests the chunk, the proxy spawns a lightweight `fluent-ffmpeg` process.
3. The chunk is downloaded from the provider via `keepAliveAxios` and streamed directly into FFmpeg (`pipe:0`).
4. FFmpeg copies the H.264 video track unmodified (`-vcodec copy`) and transcodes the AC3 audio to AAC (`-acodec aac`), streaming the fixed chunk back to the browser (`pipe:1`).

This in-memory pipe ensures the transcoded chunk arrives with near-zero latency, avoiding the need to download the entire file to disk before converting it.

### The Socket Timeout Bug
During development, we discovered a critical bug where standard (non-transcoded) live channels would infinitely buffer (loading skeleton). The root cause was traced to the `http.Agent` configuration:
```javascript
const httpAgent = new http.Agent({ keepAlive: true, timeout: 10000 });
```
The Node.js `timeout` option imposes a hard lifespan limit on the socket. Because live IPTV chunks are typically 10-12 seconds long and stream in real-time, the chunk download took exactly 10-12 seconds. The Agent was ruthlessly murdering the socket exactly at the 10.0-second mark, truncating the final milliseconds of every chunk. This caused `hls.js` to fail decoding the corrupted segment.
Removing the `timeout` from the agent while keeping `keepAlive: true` completely resolved the issue, allowing flawless native playback.

---

## UI Rendering Performance (Scroll Choppiness)

Scrolling through the Movies, Series, and Home rows felt choppy due to five overlapping problems in `CategoryRow.jsx` and `CategoryRow.css`. Each was independently fixable:

### Root Cause 1 — All 100+ images downloaded at once (no `loading="lazy"`)
The `<img>` tags rendered without `loading="lazy"`, so the browser downloaded every poster image for every card the moment the page rendered — even cards 3000px below the fold. 100 simultaneous image downloads compete with the paint thread. Every failed image also fired a TMDB API call → React state update → re-render, compounding the issue.

**Fix:** Added `loading="lazy"` to the card `<img>` tag. Combined with `decoding="async"` (already present), images now load only as they scroll into view.

### Root Cause 2 — Two `useEffect` hooks ran on ALL cards at mount
Each `MediaCard` ran a TMDB poster-fallback fetch effect and a 500ms image-timeout probe effect on every mount, regardless of whether the card was visible. With 100 cards, this was potentially 200 simultaneous effects, 100 network requests, and 100 re-renders all happening at initial load while the user was trying to scroll.

**Fix:** Added an `IntersectionObserver` (with a 150px `rootMargin` lookahead) that sets `isVisible = true` when a card scrolls into the viewport. Both expensive effects are now gated on `isVisible` — they don't run until the card is actually near the screen.

### Root Cause 3 — `transform-style: preserve-3d` on all 100 cards at rest
The CSS applied `transform-style: preserve-3d` to `.media-card` in its default (non-hovered) state. This forces each card into its own GPU compositing layer. The compositor then has to merge all 100 layers on every scroll frame, which is extremely expensive.

**Fix:** Removed `transform-style: preserve-3d` from the default card rule. It's now only applied on `:hover` and `.focused` states, so at rest the browser doesn't allocate 100 unnecessary GPU layers.

### Root Cause 4 — No CSS `contain` — one card could relayout all others
Without `contain: layout style` on `.media-card`, a height change in any card (e.g., a poster loading) could trigger a layout recalculation across all sibling cards. `contain: layout style` isolates each card's internal layout so changes stay inside.

**Note:** `contain: paint` was intentionally NOT used — it would clip the `scale(1.08)` hover overflow.

### Root Cause 5 — mousemove tilt recalc ran at ~125Hz, forcing reflows
`handleMouseMove` called `getBoundingClientRect()` and two `style.setProperty()` calls on every mouse event. At high mouse speeds (~125 events/sec), this forced repeated synchronous layout reads during scroll.

**Fix:** Throttled the handler with `requestAnimationFrame`. Events between frames are discarded (the `tiltRafRef` guard prevents queuing more than one frame), so the tilt calculation only runs once per frame (~60Hz max).

### Root Cause 6 — Off-screen rows still laid out and painted by the browser
Added `content-visibility: auto` with `contain-intrinsic-block-size: 420px` to `.category-row-container`. The browser now skips layout and paint for rows below the fold entirely. `contain-intrinsic-block-size` provides a height estimate so the scrollbar thumb stays proportionate.

---

## EPG Grid Virtualization & Scroll Performance

The Live TV Electronic Program Guide (EPG) renders a massive grid. A standard 7-day timeline (3 days past, 4 days future) across 10,000 channels results in millions of potential DOM nodes. Rendering this natively crashes any browser.

We implemented a custom, highly aggressive dual-axis virtualization engine to ensure 60fps scrolling:

### 1. Dual-Axis Culling & React 18 Concurrent Rendering
The grid utilizes both vertical (`scrollTop`) and horizontal (`scrollLeft`) viewport tracking to aggressively cull off-screen `Row` and `ProgramCell` DOM nodes. 
Because dragging the grid updates React state rapidly, we integrated **React 18 Concurrent Rendering (`startTransition`)**. This offloads the heavy React layout reconciliation to a background thread, preventing the main browser thread from blocking and completely eliminating scroll stutter/jank.

### 2. Native GPU Header Synchronization
A common approach to sticky headers is using a Javascript `onScroll` event listener on the body grid to synchronously update `header.scrollLeft`. This causes a 1-frame visual lag where the header "trails" behind the grid during fast scrolls.
**The Fix:** We completely restructured the DOM hierarchy to place the horizontal header natively *inside* the main vertical/horizontal scroll container using CSS `position: sticky; top: 0`. The browser's GPU compositor now naturally scrolls both the header and the grid horizontally in perfect lockstep with zero JavaScript intervention.

### 3. Chromium Sub-Pixel Rendering & Blur Fixes
Chromium browsers on Windows struggle to render `position: sticky` text cleanly during smooth scrolling (e.g., trackpads). Because scroll coordinates often land on fractional pixels, the Windows ClearType RGB sub-pixel engine fails to interpolate the font, resulting in shimmering or blurry text while panning.
**The Fix:** Instead of enforcing heavy 3D hardware acceleration (`translateZ(0)`) which caused severe GPU layer-explosion memory leaks, we attacked the layout engine:
1. Applied `contain: paint layout` to the parent cells to restrict layout invalidation boundaries.
2. Enforced `text-rendering: geometricPrecision` combined with a microscopic (`0.05` opacity) text drop-shadow. This microscopic shadow forces the Chromium graphics pipeline to use a more robust, anti-aliased rendering path that perfectly snaps the text geometries during fractional scrolling.

---

## EPG Channel Matching Architecture

Live TV EPG info often shows the wrong program title. Two separate bugs caused this:

### Bug 1 — Fuzzy match scored STRING LENGTH, not character similarity
The original fuzzy match fallback in `/api/custom-epg` used:
```javascript
score = Math.min(a.length, b.length) / Math.max(a.length, b.length)
```
This is a **length ratio**, not similarity. Two completely different strings of the same length (e.g., `"fox"` vs `"cbs"` — both 3 chars) would score **1.0** if one happened to contain the other as a substring. This caused channels like "HBO" to match "HBOMAX" and pull the wrong schedule.

**Fix:** Replaced with **2-gram Jaccard similarity** (`jaccardSim()` in `server.js`). Jaccard computes the ratio of shared character bigrams to total bigrams. `"espn"` vs `"espn2"` share `es, sp, pn` = 0.6. `"fox"` vs `"cbs"` share 0 bigrams = 0.0. This catches real partial matches while rejecting coincidental false ones.

### Bug 2 — Short 3-letter channel codes matched anything containing them
The substring guard `epgName.includes(cleanedTarget)` allowed a cleaned name like `"nbc"` to match `"nbcsn"`, `"nbcu"`, or `"nbcwashington"` — all of which appear in EPG feeds. The original code had no minimum length before allowing substring matching.

**Fix:** Added a `minLen >= 4` guard. If either string is fewer than 4 characters after cleaning, substring matching is skipped. The Jaccard threshold was also raised from `0.6` to `0.70`.

### Why EPG Can Still Be Wrong (Provider-Side)
Even with perfect matching, some channels will show incorrect program info. IPTV providers often:
- Map channels to the wrong EPG feed in their Xtream configuration
- Have EPG data that's days old or in the wrong timezone
- Serve channels with no EPG ID at all

The custom EPG fallback (loaded from external XMLTV feeds at boot) exists specifically to compensate for providers with poor built-in EPG. The `cleanChannelName()` stripping + exact/fuzzy match chain is the best we can do client-side without a separate channel→EPG mapping database.

---

## Video Player Seeking & Scrubbing Architecture

Fast-forwarding through long content (especially 2-hour movies or timeshift streams) required extensive clicking due to the default 10-second skip buttons. We implemented a multi-tiered approach to seeking:

### 1. Interactive HUD Scrubber (Click & Drag)
The HUD progress bar was previously disconnected from its CSS classes (`premium-scrubber-container` vs `.progress-container`), rendering it invisible. We re-linked the CSS and added proper Pointer Events (`pointerdown`, `pointermove`, `pointerup`) to support click-and-drag scrubbing. Windows users and touch users can now smoothly slide the playhead to any timestamp instantly.

### 2. Live TV vs. VOD Scrubber Visibility
HLS.js live streams operate on a "sliding window" buffer. If a live stream has a 42-second buffer window, the browser's `<video>` element reports `duration = 42.5`. 
Previously, this caused the scrubber to appear on standard Live TV broadcasts, violently jumping around as the buffer shifted. The visibility logic is now strictly gated to `(!isLiveChannel || item?.isTimeshift)`, ensuring the scrubber and timecodes only appear for actual VOD content or Catchup/Timeshift streams.

### 3. Accelerated Keyboard / Remote Seeking
Standard TV remotes rely heavily on the D-Pad (Arrow keys). Pressing "Right" to skip 10 seconds meant clicking 360 times to skip an hour. 
- The `ArrowRight` and `ArrowLeft` keyboard shortcuts were updated to jump by **60 seconds (1 minute)** at a time.
- Dedicated `+1m` and `-1m` buttons were added to the HUD for mouse users.
- Holding the Arrow key on a remote now rapidly fires the 60s skip, allowing users to blaze through an hour of content in seconds without needing a mouse to drag the scrubber.

---

## Roadmap / Future Enhancements

- [x] **Electron Windows App Integration:** Wrap the current React codebase into an Electron application to bypass browser CORS restrictions and allow the app to be installed as a standalone `.exe`.
- [x] **Individual User Logins:** Build a Login Screen so users can input their own Xtream credentials directly into the client.
- [x] **Multiple User Profiles support**
- [x] **Universal Stream Proxying**: Bypass browser CORS constraints by safely tunneling HLS fragments via the Node backend.
- [ ] Advanced Video Player controls (Subtitles, Audio Tracks, Playback Speed)

---
*Built with 💙 and designed for a premium viewing experience.*
