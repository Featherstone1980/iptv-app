# EPG Architecture & Exact Matching Blueprint

This document explains the custom EPG (Electronic Program Guide) architecture for the StreamPro IPTV App. It covers how we achieve instant load times on low-power devices, how the matching logic works without guessing, and how to automate EPG updates using GitHub Actions.

## The Architecture: Why We Chunk

Most IPTV EPGs are distributed as massive XML files (often 600MB+ containing millions of lines). If a low-power device like an Amazon Firestick or an Android TV box tried to download and parse a 600MB XML file, the app would freeze, overheat, and crash.

To solve this, StreamPro uses a **Pre-Compiled Chunking Architecture**:
1. A powerful PC or Cloud Server downloads the massive XML file.
2. A specialized Node.js script (`scripts/process_epg.js`) parses the XML and splits it into thousands of tiny, 5-Kilobyte JSON files (one file per TV channel).
3. These tiny JSON chunks are uploaded to GitHub Pages.
4. The IPTV App running on a Firestick simply requests the tiny 5KB chunks for the specific channels currently on-screen, loading instantly in milliseconds.

## How EPG Matching Works (Zero Guessing)

The application matches your IPTV Provider's channels to the EPG XML data using a strict, **case-insensitive**, 5-tier fallback system. It does **not** rely on fuzzy guessing, which ensures high accuracy.

The matching occurs in `apps/web-pc/src/services/api.js` in the following order:

1. **Manual Overrides (`manual_overrides.json`)**
   If you used the `epg-editor` tool to manually link a channel to a specific XML ID, it is checked here first. 
2. **Display Names (`display_names.json`)**
   The parsing script extracts `<display-name>` tags from the XML. If your provider names a channel "USA AMC", and the XML contains `<display-name>USA AMC</display-name>`, the app maps them perfectly.
3. **Exact EPG ID**
   The app checks if the exact `epg_channel_id` provided by your IPTV service matches an ID in the XML file.
4. **Generated Channel Prefix**
   Some custom XML generators prefix IDs (e.g., `channel_1034684`). The app checks if your provider's `stream_id` matches an XML file with the `channel_` prefix.
5. **Raw Stream ID**
   The ultimate fallback attempts to fetch the raw `stream_id`.

## Automation: Zero-Touch Cloud Updates

Because GitHub has a strict 100MB file limit, you cannot upload a 600MB XML file directly to the repository.

Instead, we use **GitHub Actions** to automate the heavy lifting in the cloud. You only need to configure this once, and your EPG will update every morning automatically.

### Setup Instructions

1. Go to your repository on GitHub.
2. Navigate to **Settings** > **Secrets and variables** > **Actions**.
3. Click **New repository secret**.
4. Set the Name to: `EPG_URL`
5. Set the Value to: `[The direct download link for your XML file from your IPTV provider]`
6. Click **Add secret**.

### How It Runs

- **Automated**: Every day at 8:00 AM UTC, GitHub Actions spins up a powerful cloud server, downloads the 600MB file using your `EPG_URL` secret, processes it into chunks, and publishes them.
- **Manual**: You can trigger it instantly at any time by going to the **Actions** tab on GitHub, selecting **Process and Publish EPG**, and clicking **Run workflow**.

By letting GitHub handle the heavy lifting, your PC is free, your Firestick remains incredibly fast, and your EPG is always up-to-date!
