# ðŸš€ StreamPro IPTV Feature Roadmap

Welcome to the feature roadmap! This document will serve as our persistent to-do list. We can update this file as we complete features, design new ones, or shift priorities.

## âœ… Completed Features (Currently Live)

- âœ… **Advanced Multi-View Grid Engine** (Watch 4 Live TV channels simultaneously with dynamic audio routing)
- âœ… **Standalone EPG Editor Ripper** (Parses 6GB XMLs, Auto-maps 150,000 channels, exports Tiny XML)
- âœ… **Native Direct Play DVR** (Background FFmpeg recording engine for Live TV streams)
- âœ… **Auto-Tuning & Desktop Reminders** (Global daemon for scheduling upcoming broadcasts)
- âœ… **Virtual RAM Hardware Transcoder** (Intercepts AC3/HEVC codecs and buffers in RAM to save SSD wear)
- âœ… **TMDB Deep Integration** (Enriches generic provider metadata with 4K posters and 10-point IMDB ratings)
- âœ… **Glassmorphism Cinematic UI & Apple TV 3D Hover Physics** (Premium interface for Movies and Series)
- âœ… **Drag-and-Drop Library Manager** (Custom favorites sorting for Channels, Movies, and Shows)
- âœ… **Real-Time Audio Sync Latency Control** (Fix misaligned IPTV audio tracks on the fly)
- âœ… **Parental Controls & PIN Lock** (Global UI category and channel blocking)
- âœ… **Continue Watching & Progress Tracking** (Saves playback duration for instant VOD resumes)
- âœ… **Multi-Provider Auto-Fallback Engine** (Intelligently hot-swaps to a backup URL if a Live TV channel dies)
- âœ… **Advanced UI Configuration Settings** (Global EPG Time Offset slider, Interface Zoom, Hardware Acceleration toggle)
- âœ… **TiviMate-Style HUD History** (Quick-jumping between recent channels via a floating console)
- âœ… **Native Category Editor** (Hide/disable unwanted provider categories directly in the UI without M3U editors)
- âœ… **VOD Instant Resume** (Injects MP4 Fragment URIs to instantly resume playback without buffering the entire file)
- âœ… **Multi-User Profiles (Netflix-Style)** (Isolated 'Who is watching?' environments with separate favorites, history, and PINs)
- âœ… **Smart EPG Hiding Engine** (Automatically filters out dead channels while mathematically preserving 24/7, Sports, and PPV networks)

## ðŸŒŸ High Priority / Upcoming

- `[x]` **Native Catch-Up TV (Time-Travel)**
  - Add UI controls to the TV Guide to scroll *backward* in time.
  - Intercept the Xtream API to request `&timeshift=` streams.
  - Implement seamless playback of archived TV shows without manual DVR recording.

- `[ ]` **Offline VOD Downloads**
  - Add a "Download for Offline" action to Movie and Series overlays.
  - Leverage the existing Node.js FFmpeg engine to pipe `.mp4` and `.mkv` files directly to the local hard drive.
  - **External Hard Drive Support**: Add a UI setting to select custom download paths (e.g., `D:\` or `E:\` USB drives) to prevent filling up the primary OS SSD.
  - Build a "Downloads" tab in the UI to manage and natively play offline files, intelligently graying out missing files if the external drive is unplugged.

- `[ ]` **OS-Level Picture-in-Picture (PiP)**
  - Integrate Electron's native PiP/Always-on-Top API.
  - Add a "Pop Out" button to the Video Player HUD.
  - Enable borderless mini-player viewing while using other desktop applications.

## ðŸ“¡ Mid-Term Goals (Ecosystem)

- `[ ]` **Cloud Sync Architecture (Firebase/Supabase)**
  - Replace/Enhance the local SQLite state with a lightweight cloud database.
  - Sync "Continue Watching" durations, Custom Favorites, and Library organization.
  - Prepare the infrastructure for seamless handoff to the upcoming Android TV app.

- `[ ]` **Watch Party (Synchronized Playback)**
  - Generate a 4-digit room code for users to share with friends.
  - Implement WebSockets (Socket.io) to synchronize Play/Pause/Seek events across multiple clients in real-time.
  - Allow friends to watch the exact same Live TV stream or VOD movie together with synced latency.

## âš™ï¸ Standard Competitor Settings

- `[ ]` **Built-In Network Diagnostics / Provider Speed Test**
  - A "Diagnostics" tab in Settings that automatically pings the Xtream API and performs a raw 10MB chunk download to measure latency and bandwidth.

- `[ ]` **Custom EPG Management (In-App Uploads)**
  - Add a dedicated UI in Settings for users to upload their own `.xml` EPG files or paste external EPG URLs.
  - The Node backend will securely cache and persist these custom guides locally within the app's internal installation directory (`%APPDATA%`).

- `[ ]` **EPG Grid Density & Typography Scaling**
  - A specific "Grid Density" toggle (`Compact`, `Standard`, `Relaxed`) to allow massive text displaying 4 channels on screen, or tiny text cramming 15 channels onto the screen at once.

- `[ ]` **"Stealth Mode" (Deep Adult Content Wipe)**
  - Detects `XXX` or `Adult` tags and completely drops them from the M3U array *before* they even hit RAM or the database.

- `[ ]` **Multi-Playlist Merging**
  - UI to add multiple Xtream Codes credentials simultaneously.
  - Merge and deduplicate channels from 3+ providers into a single unified grid.

- `[ ]` **External Player Support**
  - Add a "Play With..." button to route difficult video streams out of our internal player and directly into VLC or MX Player.

- `[ ]` **Local Backup & Restore**
  - "Export Settings" button to generate a `.bak` file containing all custom favorites, sorting, and user preferences.

- âœ… **Custom User-Agent Spoofing**
  - A text input in Settings allowing users to change the app's User-Agent signature to bypass strict provider blocks.

- `[ ]` **Auto-Start on Boot**
  - A toggle to automatically launch the app and resume the last-viewed Live TV channel the second the device turns on.

## ðŸŽ¥ Enthusiast-Level Features

- `[ ]` **Multi-View "Grid Templates" (Picture-in-Picture Grids)**
  - Add specific layouts like "The Sports Bar" (1 massive main screen with 3 small docked screens) or "The News Room" (2x2 grid).

- âœ… **Theme / Accent Color Customization**
  - Allow the user to select their specific "Glow" or "Accent" color (e.g., Neon Blue, Cyberpunk Magenta, Minimalist White) via CSS variables.

- `[ ]` **"Are You Still Watching?" Idle Timeout**
  - A Netflix-style inactivity monitor that pauses playback and prompts the user after X hours of no remote/mouse interaction to save bandwidth.

- `[ ]` **Trakt.tv Integration (Scrobbling)**
  - Automatically log finished movies and series episodes directly to a connected Trakt.tv account.

- `[ ]` **Deep Subtitle & Audio Track Engine**
  - Global user preferences for default languages ("Always play English Audio/Subtitles") and robust styling options for subtitle font size, color, and drop-shadows.

- `[ ]` **Auto-Frame Rate Matching (AFR)**
  - Command the display hardware to physically switch refresh rates (e.g., to 24Hz) to match the cinematic framerate of movies, eliminating 3:2 pulldown judder.

- `[ ]` **Silent Background Playlist Syncs**
  - Automatically ping the provider API in the background every 12-24 hours to download new VOD diffs without requiring the user to manually click "Refresh".

- `[ ]` **Sleep Timer**
  - A simple button on the player HUD to automatically stop playback and exit the player after 30, 60, or 90 minutes.

- `[ ]` **Local Media Server Integration (Plex / Emby)**
  - Support for connecting local API keys to browse and play a user's local hard drive `.mkv` libraries within the cinematic UI.

- `[ ]` **Built-In VPN Kill-Switch**
  - A security monitor that instantly kills the video player and blocks buffering if the active Windows VPN interface drops, protecting the user's IP address.

- `[ ]` **Actor / Cast Deep-Dive (X-Ray)**
  - An Amazon Prime-style X-Ray feature that allows users to click on cast members from TMDB to instantly search the IPTV provider for all other movies starring that actor.

- `[ ]` **AI Video Upscaling (Real-Time)**
  - Integrate a local GPU shader to artificially upscale and sharpen heavily compressed 720p/1080p IPTV streams to 4K quality on the fly.

- `[ ]` **Audio Normalization (Night Mode)**
  - A real-time Dynamic Range Compressor (DRC) built into the audio engine to equalize volume across all channels, preventing loud commercial jump-scares.

- `[ ]` **Audio-Only / Radio Mode**
  - A toggle to kill video rendering entirely, allowing users to listen to News or Music channels in the background while saving 95% of bandwidth.

- `[ ]` **Discord Rich Presence Integration**
  - Automatically update the user's Discord status to display what Live TV channel or Movie they are currently watching.

- `[ ]` **Custom Voice Search Engine**
  - Bypass the notoriously broken native Android TV voice keyboards by building a custom, highly-accurate speech-to-text bridge directly into the app's Universal Search.
  - Implement Chromium's native `webkitSpeechRecognition` API for the PC Desktop app (free, fast, no external servers).
  - Use `@react-native-voice/voice` for the Android TV port to dictate text natively without triggering full-screen OS assistant popups.

## ðŸ”Œ Power-User / Developer Edge Cases

- `[ ]` **Hardware Acceleration Profiler (GPU Selection)**
  - Explicitly select `NVIDIA (CUDA)`, `Intel (QuickSync)`, or `AMD (AMF)` hardware acceleration for the background FFmpeg engine to drop CPU usage during Transcoding and DVR.

- `[ ]` **Adaptive Bitrate (ABR) Local Generator**
  - Dynamically output a multi-tier HLS master playlist (480p, 720p, 1080p) via the background FFmpeg engine to allow the player to automatically scale quality down instead of pausing to buffer.

- `[ ]` **Smart Home Webhooks (Home Assistant / IFTTT)**
  - Fire outbound HTTP webhooks when playback starts, pauses, or stops (e.g., to automatically dim the living room lights when a movie starts).

- `[ ]` **Video Player Image Adjustments (VLC Style)**
  - Native UI sliders for Brightness, Contrast, and Saturation within the player HUD to fix dark or washed-out provider streams without altering physical TV settings.

- `[ ]` **Auto-Skip Credits & Commercials**
  - **VODs & Series:** Detect end-credits rolling and instantly prompt to jump to the next episode.
  - **DVR & Catch-Up TV:** Utilize our background FFmpeg engine to scan for black frames and network logo disappearances to automatically skip commercials on recorded/time-shifted TV. *(Note: You cannot skip commercials on purely Live TV since you can't skip into the future!)*

- `[ ]` **Bandwidth Cap / Resolution Limiter**
  - Intercept the HLS stream chunks and discard 1080p/4K segments, forcibly clamping the stream to 720p or 480p to protect users on metered cellular data.

- `[ ]` **Local Network Casting (Chromecast / AirPlay)**
  - Beam the live video stream from the PC App directly to a local smart TV over the Wi-Fi network without requiring an app installation on the TV itself.

## ðŸ“± Ecosystem & Expansion

- `[ ]` **Android TV App Skeleton (`apps/tv-app`)**
  - Initialize the React Native / Expo workspace.
  - Implement native Android `ExoPlayer` for hardware decoding.
  - Build the Spatial Navigation (D-Pad) remote control engine.

## ðŸ† Killer Features (Market Disruptors)

- `[ ]` **Apple-Style "Continuity" Handoff**
  - Automatically detect active playback sessions via Firebase Cloud Sync.
  - Display a "Resume from PC?" prompt when opening the TV app to instantly jump to the exact timestamp.

- `[ ]` **Interactive Sports HUD (Real-Time)**
  - Detect live sports channels automatically.
  - Fetch real-time game data from a live sports API (e.g., SofaScore/ESPN).
  - Overlay a transparent, interactive scoreboard directly on the video player HUD.

- `[ ]` **Smart Commercial Skip for DVR**
  - Use our local Node.js FFmpeg engine to analyze DVR recordings for black frames and audio silences.
  - Automatically generate timestamp chapters for commercials.
  - Display a "Skip Commercial" button during playback (similar to Plex Pass).

- `[ ]` **AI "Live Right Now" Discovery Dashboard**
  - Replace static grids with an intelligent home screen.
  - Analyze the user's watch history locally to bubble up trending movies, massive live sporting events, and breaking news.

- âœ… **Universal Search Engine**
  - Build a unified fuzzy-search overlay.
  - Search across Live TV, Catch-Up, VOD Movies, and Series simultaneously with instant-as-you-type results.

## ðŸ› ï¸ Maintenance & Technical Debt

- `[ ]` Migrate any remaining React Context state to the `zustand` micro-store to protect the UI thread.
- `[ ]` Expand the automated testing coverage for the EPG matching engine (`server.js`).

---
> [!TIP]
> **How to use this list:** 
> I will automatically check off items with âœ… as we build them. If you ever want to review this list, just ask me to pull up the **Feature Roadmap**!


