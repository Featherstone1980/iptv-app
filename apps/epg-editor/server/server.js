const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const zlib = require('zlib');
const util = require('util');
const { XMLParser, XMLBuilder } = require('fast-xml-parser');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const overridesPath = path.join(__dirname, 'manual_overrides.json');
let manualOverrides = {};
try {
    if (fs.existsSync(overridesPath)) {
        manualOverrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
    }
} catch (e) {
    console.error('Error loading manual overrides:', e);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const upload = multer({ storage: multer.memoryStorage() });

let currentM3uChannels = [];
let communityEpgCache = { 
    channels: [], 
    channelMap: {},    // cleanedDisplayName → [epg_id, ...]
    channelIdMap: {},  // raw EPG channel id (e.g. "amc.us") → epg_id (Pass 0 direct lookup)
    coreIdMap: {},     // normalized EPG channel id (e.g. "amc") → epg_id (Pass 0d fuzzy lookup)
    callsignMap: {}    // Indexed by network callsign (e.g. khon)
};

const dbPath = path.join(__dirname, `epg_data_${Date.now()}.sqlite`);
try {
    // Robustly clean up any old SQLite files (including orphaned .wal and .shm)
    fs.readdirSync(__dirname).forEach(file => {
        if (file.includes('epg_data') && (file.includes('.sqlite') || file.includes('-wal') || file.includes('-shm'))) {
            try { fs.unlinkSync(path.join(__dirname, file)); } catch (e) {}
        }
    });
} catch (e) {
    console.warn('Could not clean old SQLite DBs on boot, continuing...');
}
const db = new sqlite3.Database(dbPath);
db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS programmes (channel_id TEXT, xml_data TEXT)");
    db.run("CREATE INDEX IF NOT EXISTS idx_channel_id ON programmes(channel_id)");
    db.run("PRAGMA synchronous = OFF");
    db.run("PRAGMA journal_mode = WAL");
});

// Clean channel name helper
const cleanChannelName = (name) => {
    if (!name) return '';
    
    // 0. Exact bypasses for channels that get destroyed by aggressive prefix stripping
    if (/^USA\s*(NETWORK|CHANNEL|TV)?$/i.test(name.trim())) return 'USANETWORK';
    if (/^UK\s*GOLD$/i.test(name.trim())) return 'UKGOLD';

    let cleaned = name.toUpperCase().replace(/\*/g, '');
    
    // 0. Strip leading IPTV country/region prefixes BEFORE the alphanumeric collapse.
    //    Providers prefix channels like "USA AMC", "UK | BBC One", "CA: CTV", etc.
    const prefixRegex1 = /^(USA?|UK|CA|CANADA|AU|AUSTRALIA|NZ|IE|ZA|MX|BR|IN|FR|DE|ES|IT|NL|PT|PL|RU|TR|AR|SA|AE|EG|PK|LATIN|SPANISH|BRITISH|AMERICAN)\s*[:|\-\/\|]\s*/i;
    const prefixRegex2 = /^(USA?|UK|CA|CANADA|AU|AUSTRALIA|NZ|IE|ZA|MX|BR|IN|FR|DE|ES|IT|NL|PT|PL|RU|TR|AR|SA|AE|EG|PK|LATIN|SPANISH|BRITISH|AMERICAN)\s+/i;
    
    cleaned = cleaned.replace(prefixRegex1, '').replace(prefixRegex2, '');
    // run it again to catch stacked prefixes like "USA LATIN"
    cleaned = cleaned.replace(prefixRegex1, '').replace(prefixRegex2, '');

    // 0.2 Strip trailing/middle country tags (e.g. "BET USA West" -> "BET West", "Sky Sports UK" -> "Sky Sports")
    cleaned = cleaned.replace(/\b(?:USA|UK|CA|AU)\b/gi, '');
    
    // 0.5 Convert ampersands to 'AND' so 'A&E' matches 'A and E', and 'Kids & Family' matches 'Kids and Family'
    cleaned = cleaned.replace(/&/g, ' AND ');

    // 0.6 Expand common network acronyms for fuzzy matching
    // Providers often use short acronyms while EPGs use full names.
    const acronymMap = {
        'HGTV': 'HOME AND GARDEN TELEVISION',
        'EPIX': 'MGM', // Epix rebranded to MGM+
        'SYFY': 'SCI FI', // Sometimes EPGs still use Sci-Fi
        'SNY': 'SPORTSNET NEW YORK',
        'DP CLASICO': 'DE PELICULA CLASICO',
        'FXM': 'FX MOVIE CHANNEL',
        'NESN': 'NEW ENGLAND SPORTS NETWORK',
        'MASN': 'MID ATLANTIC SPORTS NETWORK',
        'NBCSN': 'NBC SPORTS NETWORK',
        'CBSSN': 'CBS SPORTS NETWORK',
        'FS1': 'FOX SPORTS 1',
        'FS2': 'FOX SPORTS 2',
        'SEC': 'SEC NETWORK',
        'ACC': 'ACC NETWORK',
        'BTN': 'BIG TEN NETWORK',
        'OAN': 'ONE AMERICA NEWS',
        'OANN': 'ONE AMERICA NEWS NETWORK',
        'GLOBAL NEWS VANCOUVER': 'GLOBAL BC',
        'GLOBAL NEWS TORONTO': 'GLOBAL TORONTO',
        'GLOBAL NEWS CALGARY': 'GLOBAL CALGARY',
        'GLOBAL NEWS EDMONTON': 'GLOBAL EDMONTON',
        'GLOBAL NEWS BC': 'GLOBAL BC',
        'BSSO': 'BALLY SPORTS SOUTH',
        'BSSE': 'BALLY SPORTS SOUTHEAST',
        'BSSW': 'BALLY SPORTS SOUTHWEST',
        'BSMW': 'BALLY SPORTS MIDWEST',
        'BSN': 'BALLY SPORTS NORTH',
        'BSW': 'BALLY SPORTS WEST',
        'BSFL': 'BALLY SPORTS FLORIDA',
        'BSSUN': 'BALLY SPORTS SUN',
        'BSGL': 'BALLY SPORTS GREAT LAKES',
        'BSOH': 'BALLY SPORTS OHIO',
        'BSAZ': 'BALLY SPORTS ARIZONA',
        'BSSD': 'BALLY SPORTS SAN DIEGO',
        'BSDET': 'BALLY SPORTS DETROIT',
        'BSWI': 'BALLY SPORTS WISCONSIN',
        'BSNO': 'BALLY SPORTS NEW ORLEANS',
        'BSOK': 'BALLY SPORTS OKLAHOMA',
        'BSKC': 'BALLY SPORTS KANSAS CITY',
        'BSIN': 'BALLY SPORTS INDIANA',
        'DISCOVERY SCIENCE': 'SCIENCE',
        'SCI SCIENCE': 'SCIENCE',
        'TLC': 'THE LEARNING CHANNEL',
        'CMT': 'COUNTRY MUSIC TELEVISION',
        'AMC': 'AMERICAN MOVIE CLASSICS',
        'MTV': 'MUSIC TELEVISION',
        'TNT': 'TURNER NETWORK TELEVISION',
        'TBS': 'TURNER BROADCASTING SYSTEM',
        'BET': 'BLACK ENTERTAINMENT TELEVISION',
        'CBSN': 'CBS NEWS',
        'FOXNET': 'FOX NETWORK',
        'FOROTV': 'FORO',
        'GALA': 'GALAVISION',
        'TMC': 'THE MOVIE CHANNEL',
        'HBO': 'HOME BOX OFFICE',
        'ONE': '1',
        'TWO': '2',
        'THREE': '3',
        'FOUR': '4',
        'FIVE': '5',
        'SIX': '6',
        'SEVEN': '7',
        'EIGHT': '8',
        'NINE': '9',
        'CTV KITCHENER': 'CTV TORONTO',
        'GLOBAL KINGSTON': 'GLOBAL TORONTO',
        'GLOBAL PETERBOROUGH': 'GLOBAL TORONTO',
        'CTV LETHBRIDGE': 'CTV CALGARY',
        'NEWS 12 HUDSON VALLEY': 'NEWS 12',
        'NEWS 12 BROOKLYN': 'NEWS 12',
        'NEWS 12 WESTCHESTER': 'NEWS 12',
        'NEWS 12 CONNECTICUT': 'NEWS 12',
        'NEWS 12 LONG ISLAND': 'NEWS 12'
    };
    for (const [acronym, full] of Object.entries(acronymMap)) {
        const regex = new RegExp(`\\b${acronym}\\b`, 'gi');
        cleaned = cleaned.replace(regex, full);
    }

    // 1. Remove anything inside brackets/parentheses (usually junk)
    cleaned = cleaned.replace(/\[.*?\]|\(.*?\)|\{.*?\}/g, '');
    
    // 2. Strip standard Quality, Format, and IPTV tags
    cleaned = cleaned.replace(/\b(1080P|720P|4K|8K|FHD|UHD|LHD|HD|SD|HEVC|H265|60FPS|50FPS|VOD|CATCHUP|VIP|PREMIUM)\b/gi, '');
    
    // 2.5 Strip common broadcasting suffixes that ruin fuzzy match Jaccard scores
    cleaned = cleaned.replace(/\b(CHANNEL|NETWORK|NET|TV|BROADCASTING)\b/gi, '');
    
    // 3. Strip East/West entirely to ensure Pass 1 exact matches against core networks
    cleaned = cleaned.replace(/\b(?:EAST|WEST)\b/gi, '');
    
    // 4. Safely handle Timeshifts (+1, +2) so "ITV +1" doesn't become "ITV1"
    cleaned = cleaned.replace(/\+1\b/g, 'PLUS1').replace(/\+2\b/g, 'PLUS2');
    
    // 5. Nuke all non-alphanumeric characters (spaces, dashes, pipes, asterisks)
    cleaned = cleaned.replace(/[^A-Z0-9]/gi, '');
    
    // 6. Strip common prefixes like "THE" and "LOCAL"
    const prefixes = ['THE', 'LOCAL'];
    prefixes.forEach(prefix => {
        if (cleaned.startsWith(prefix) && cleaned.length > prefix.length + 2) {
            cleaned = cleaned.substring(prefix.length);
        }
        if (cleaned.endsWith(prefix) && cleaned.length > prefix.length + 2) {
            cleaned = cleaned.substring(0, cleaned.length - prefix.length);
        }
    });
    
    return cleaned;
};

const getCoreId = (tvgId) => {
    if (!tvgId) return null;
    let core = tvgId.toLowerCase().trim();
    
    // 1. Detect and normalize the country zone before stripping
    let country = '';
    if (/\.(us(?:[0-9]+|_locals[0-9]+|_sports[0-9]+)?)\b/.test(core)) country = 'us';
    else if (/\.(ca(?:[0-9]+|_locals[0-9]+|_sports[0-9]+)?)\b/.test(core)) country = 'ca';
    else if (/\.(uk(?:[0-9]+|_locals[0-9]+|_sports[0-9]+)?)\b/.test(core)) country = 'uk';
    else if (/\.(au(?:[0-9]+|_locals[0-9]+|_sports[0-9]+)?)\b/.test(core)) country = 'au';
    
    // 2. Strip extensions
    core = core.replace(/\.[a-z0-9_]+$/, '');
    
    // 3. Strip quality markers and suffixes before collapsing
    core = core.replace(/\b(hd|fhd|uhd|sd|4k|vod|tv|channel|network)\b/ig, '');
    
    // 4. Nuke all remaining non-alphanumeric characters
    core = core.replace(/[^a-z0-9]/g, '');
    
    // 5. Re-attach the normalized country zone
    if (country) {
        core = `${core}_${country}`;
    }
    
    return core;
};

// Callsign normalizer for Pass 0e (Local News)
const getCallsignId = (tvgId) => {
    if (!tvgId) return '';
    let s = tvgId.toLowerCase().trim();
    s = s.replace(/\.[a-z0-9_]+$/, ''); // strip extension
    s = s.replace(/[^a-z0-9]/g, ''); // strip non-alphanumeric
    
    // Strip transmission suffixes like -dt, -tv, -hd, -cd (Class A Digital), -ca (Class A), -lp (Low Power)
    s = s.replace(/(dt|tv|hd|ld|cd|ca|lp)$/g, '');
    
    // If it starts with a network name and has exactly 4 chars left, it's a callsign embedded with a network
    // e.g. "foxkhon" -> "khon", "abckitv" -> "kitv"
    s = s.replace(/^(fox|abc|cbs|nbc|cw|pbs|my|peachtree)[0-9]*/g, '');
    
    const callsign = s.trim();
    if (['west', 'east', 'kids', 'kino', 'plus', 'wild', 'korea'].includes(callsign)) return '';
    
    return callsign;
};

// Jaccard similarity for auto-matching
const getEpgCountry = (tvgId) => {
    if (!tvgId) return null;
    let core = tvgId.toLowerCase().trim();
    // Match any 2-letter country code optionally followed by numbers or _locals / _sports
    // e.g. .us2, .uk1, .in, .br, .sg, .us_locals1
    const match = core.match(/\.([a-z]{2})(?:[0-9]+|_locals[0-9]+|_sports[0-9]+)?$/i);
    if (match) return match[1];
    return null;
};

const getBigramsSet = (str) => {
    let bigrams = new Set();
    for (let i = 0; i < str.length - 1; i++) {
        bigrams.add(str.substring(i, i + 2));
    }
    return bigrams;
};

const getBigramsArray = (str) => {
    let bigrams = [];
    let seen = new Set();
    for (let i = 0; i < str.length - 1; i++) {
        let b = str.substring(i, i + 2);
        if (!seen.has(b)) {
            seen.add(b);
            bigrams.push(b);
        }
    }
    return bigrams;
};

const jaccardSim = (str1, str2) => {
    if (str1 === str2) return 1.0;
    if (str1.length < 2 || str2.length < 2) return 0;
    let bigrams1 = getBigramsSet(str1);
    let bigrams2 = getBigramsSet(str2);
    let intersection = 0;
    for (const x of bigrams1) {
        if (bigrams2.has(x)) intersection++;
    }
    let union = bigrams1.size + bigrams2.size - intersection;
    return intersection / union;
};

// Garbage-free Jaccard for O(n^2) inner loops
const jaccardSimPrecomputed = (str1, str2, bigrams1Array, bigrams2Set) => {
    if (str1 === str2) return 1.0;
    if (bigrams1Array.length === 0 || bigrams2Set.size === 0) return 0;
    let intersection = 0;
    for (let i = 0; i < bigrams1Array.length; i++) {
        if (bigrams2Set.has(bigrams1Array[i])) intersection++;
    }
    let union = bigrams1Array.length + bigrams2Set.size - intersection;
    return intersection / union;
};

// Keywords that identify VOD movies, series, and non-live content in group-title.
// Any entry whose group-title contains one of these is skipped.
const VOD_GROUP_KEYWORDS = [
    'movie', 'movies', 'film', 'films', 'cinema',
    'series', 'serie', 'tv show', 'tvshow', 'show',
    'episode', 'season',
    'vod', 'on demand',
    'anime', // usually VOD catalogues
    'xxx', 'adult', 'x-rated', // adult VOD
];

// VOD stream URLs end in a static file extension.
// Live streams are .m3u8, .ts, or Xtream-style numeric paths with no extension.
const VOD_URL_EXTENSIONS = /\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|divx|xvid|f4v)(\?.*)?$/i;

const isLiveTvEntry = (infoLine, streamUrl) => {
    // Check group-title attribute first (fastest signal)
    const groupMatch = infoLine.match(/group-title="([^"]*)"/i);
    if (groupMatch) {
        const group = groupMatch[1].toLowerCase();
        if (VOD_GROUP_KEYWORDS.some(kw => group.includes(kw))) return false;
    }
    // Check stream URL extension (catches VOD even with mislabelled groups)
    if (streamUrl && VOD_URL_EXTENSIONS.test(streamUrl.trim())) return false;
    return true;
};

// Parse M3U
app.post('/api/upload-m3u', upload.single('m3u'), (req, res) => {
    try {
        const fileContent = req.file.buffer.toString('utf8');
        const lines = fileContent.split(/\r?\n/);
        
        currentM3uChannels = [];
        let skippedVod = 0;
        
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('#EXTINF:')) {
                const infoLine = lines[i];
                // The stream URL is on the very next non-empty line
                let streamUrl = '';
                for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
                    if (lines[j] && !lines[j].startsWith('#')) {
                        streamUrl = lines[j];
                        break;
                    }
                }

                // Skip VOD/Series entries — only keep Live TV
                if (!isLiveTvEntry(infoLine, streamUrl)) {
                    skippedVod++;
                    continue;
                }

                // Extract channel name (everything after the last comma)
                const commaIndex = infoLine.lastIndexOf(',');
                const channelName = commaIndex !== -1 ? infoLine.substring(commaIndex + 1).trim() : 'Unknown';
                
                // Extract tvg-id and tvg-name
                const tvgIdMatch = infoLine.match(/tvg-id="([^"]*)"/);
                const tvgNameMatch = infoLine.match(/tvg-name="([^"]*)"/);
                
                let parsedTvgId = tvgIdMatch ? tvgIdMatch[1] : '';
                // QUICK FIX: Provider hardcoded bad tvg-ids for these specific channel groups. 
                // By clearing them, we force them to run through the AI fuzzy matching engine.
                const nameLower = channelName.toLowerCase();
                if (nameLower.includes('match centre') || nameLower.includes('bein sports 4')) {
                    parsedTvgId = '';
                }

                currentM3uChannels.push({
                    id: `channel_${i}`,
                    name: channelName,
                    tvgId: parsedTvgId,
                    tvgName: tvgNameMatch ? tvgNameMatch[1] : ''
                });
            }
        }
        console.log(`M3U parsed: ${currentM3uChannels.length} live channels kept, ${skippedVod} VOD/Series entries skipped.`);
        res.json({ success: true, channels: currentM3uChannels, skippedVod });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to parse M3U' });
    }
});

// Fetch via Xtream API
app.post('/api/fetch-xtream', async (req, res) => {
    try {
        const { url, username, password } = req.body;
        const apiUrl = `${url}/player_api.php?username=${username}&password=${password}&action=get_live_streams`;
        
        const response = await axios.get(apiUrl);
        const streams = response.data;
        
        if (!Array.isArray(streams)) {
            return res.status(400).json({ error: 'Invalid response from provider' });
        }
        
        // Filter out junk channels that don't need EPGs
        const JUNK_KEYWORDS = ['24/7', 'music choice', 'xxx', 'adult', 'x-rated', 'radio'];
        const isJunk = (name) => {
            if (!name) return false;
            const lower = name.toLowerCase();
            return JUNK_KEYWORDS.some(kw => lower.includes(kw));
        };

        const filteredStreams = streams.filter(stream => !isJunk(stream.name));
        
        currentM3uChannels = filteredStreams.map(stream => {
            const channelName = stream.name || 'Unknown';
            let parsedTvgId = stream.epg_channel_id || '';
            
            // QUICK FIX: Provider hardcoded bad tvg-ids for these specific channel groups. 
            const nameLower = channelName.toLowerCase();
            if (nameLower.includes('match centre') || nameLower.includes('bein sports 4')) {
                parsedTvgId = '';
            }
            
            return {
                id: `channel_${stream.stream_id}`,
                name: channelName,
                tvgId: parsedTvgId,
                tvgName: channelName
            };
        });
        
        console.log(`Xtream loaded: ${filteredStreams.length} channels kept, ${streams.length - filteredStreams.length} junk channels skipped.`);
        res.json({ success: true, channels: currentM3uChannels });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch from Xtream API' });
    }
});

// Discover available EPGs from epgshare01
app.get('/api/discover-epgs', async (req, res) => {
    try {
        const response = await axios.get('https://epgshare01.online/epgshare01/');
        const html = response.data;
        
        // Match all hrefs ending in .xml.gz
        const regex = /href="([^"]+\.xml\.gz)"/g;
        let match;
        const files = [];
        
        while ((match = regex.exec(html)) !== null) {
            const filename = match[1];
            // epgshare01 links are relative to the directory
            files.push({
                name: filename.replace('epg_ripper_', '').replace('.xml.gz', ''),
                url: `https://epgshare01.online/epgshare01/${filename}`
            });
        }
        
        res.json({ success: true, files });
    } catch (err) {
        console.error('Failed to discover EPGs:', err.message);
        res.status(500).json({ error: 'Failed to discover EPGs' });
    }
});

const stream = require('stream');
const pipeline = util.promisify(stream.pipeline);

// SSE Progress Tracking
let currentProgress = "Idle";
let progressClients = [];

app.get('/api/progress', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    progressClients.push(res);
    res.write(`data: ${JSON.stringify({ message: currentProgress })}\n\n`);

    req.on('close', () => {
        progressClients = progressClients.filter(c => c !== res);
    });
});

function broadcastProgress(msg) {
    currentProgress = msg;
    progressClients.forEach(c => c.write(`data: ${JSON.stringify({ message: msg })}\n\n`));
}

// Download and Parse Community XML
let isProcessingBulk = false;

app.post('/api/fetch-community-epg', (req, res) => {
    if (isProcessingBulk) {
        return res.status(429).json({ error: 'A background parsing job is already running. Please wait.' });
    }
    isProcessingBulk = true;
    try {
        const { urls } = req.body;
        if (!urls || !Array.isArray(urls)) {
            return res.status(400).json({ error: 'Expected an array of urls' });
        }
        
        // Respond immediately so Chrome doesn't kill the connection due to 5-minute timeout!
        res.json({ success: true, message: 'Background parsing started' });
        
        // Run the 8-minute process in the background
        (async () => {
            communityEpgCache.channels = [];
            communityEpgCache.channelMap = {};
            communityEpgCache.channelIdMap = {};
            communityEpgCache.coreIdMap = {};
            
            await new Promise((resolve) => {
                db.run("DELETE FROM programmes", [], () => resolve());
            });
            
            for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            const fileNum = i + 1;
            const totalFiles = urls.length;
            const filename = url.split('/').pop().split('.')[0];
            
            const rawFilePath = path.join(__dirname, `temp_raw_${filename}${url.endsWith('.gz') ? '.gz' : ''}`);
            
            broadcastProgress(`[${fileNum}/${totalFiles}] Downloading ${filename} (Resume Enabled)...`);
            console.log(`Downloading ${url} to local file...`);
            
            let downloadSuccess = false;
            let attempt = 1;
            const maxAttempts = 20; // Massive tolerance for VPN cycling
            
            while (!downloadSuccess && attempt <= maxAttempts) {
                try {
                    let downloadedBytes = 0;
                    if (fs.existsSync(rawFilePath)) {
                        downloadedBytes = fs.statSync(rawFilePath).size;
                    }

                    const headers = { 'User-Agent': 'Mozilla/5.0' };
                    if (downloadedBytes > 0) {
                        headers['Range'] = `bytes=${downloadedBytes}-`;
                        broadcastProgress(`[${fileNum}/${totalFiles}] Resuming download for ${filename} at ${Math.round(downloadedBytes / 1024 / 1024)}MB...`);
                    }

                    // DO NOT append ?t= to bypass Cloudflare. 
                    // Bypassing the cache for a 1GB file causes the origin server to time out and drop the connection.
                    const downloadUrl = url;

                    const response = await axios({
                        url: downloadUrl,
                        method: 'GET',
                        responseType: 'stream',
                        timeout: 0,
                        headers,
                        validateStatus: status => status === 200 || status === 206
                    });
                    
                    const isResume = response.status === 206;
                    if (!isResume && downloadedBytes > 0) {
                        // Server ignored Range header, restart download
                        downloadedBytes = 0;
                        fs.unlinkSync(rawFilePath);
                    }

                    const writeStream = fs.createWriteStream(rawFilePath, { flags: isResume ? 'a' : 'w' });
                    await pipeline(response.data, writeStream);
                    downloadSuccess = true;
                } catch (err) {
                    if (err.response && err.response.status === 416) {
                        console.log(`Received 416 Range Not Satisfiable. Assuming file ${filename} is fully downloaded.`);
                        downloadSuccess = true;
                        break;
                    }
                    if (attempt < maxAttempts) {
                        console.warn(`Connection dropped for ${url}, retrying (Attempt ${attempt}/${maxAttempts})... Error: ${err.message}`);
                        broadcastProgress(`[${fileNum}/${totalFiles}] Connection dropped for ${filename}, waiting 15s for VPN to cycle (${attempt}/${maxAttempts})...`);
                        await new Promise(r => setTimeout(r, 15000)); // 15 second delay gives the VPN time to connect
                        attempt++;
                    } else {
                        console.error(`Fatal: Failed to download ${filename} after ${maxAttempts} attempts.`);
                        broadcastProgress(`[${fileNum}/${totalFiles}] Failed to download ${filename}. Skipping this source...`);
                        break;
                    }
                }
            }
            
            if (!downloadSuccess) continue; // Skip SQLite parsing for this dropped file
            
            broadcastProgress(`[${fileNum}/${totalFiles}] Parsing ${filename} from disk straight to SQLite...`);
            console.log(`Reading and Parsing XML to SQLite for ${url}...`);

            const readline = require('readline');
            const fileStream = fs.createReadStream(rawFilePath);
            let rlStream = fileStream;
            if (url.endsWith('.gz')) {
                rlStream = fileStream.pipe(zlib.createGunzip());
            }

            const rl = readline.createInterface({
                input: rlStream,
                crlfDelay: Infinity
            });

            const parser = new XMLParser({
                ignoreAttributes: false,
                attributeNamePrefix: "@_",
                processEntities: false
            });

            const processChannelBlock = (xmlStr) => {
                const jsonObj = parser.parse('<tv>\n' + xmlStr + '\n</tv>');
                if (jsonObj.tv && jsonObj.tv.channel) {
                    let ch = Array.isArray(jsonObj.tv.channel) ? jsonObj.tv.channel[0] : jsonObj.tv.channel;
                    if (!ch) return;
                    
                    const id = ch['@_id'];
                    
                    let epgName = '';
                    if (ch['display-name']) {
                        epgName = Array.isArray(ch['display-name']) 
                            ? ch['display-name'].map(n => typeof n === 'object' ? n['#text'] : n).join(' ')
                            : (typeof ch['display-name'] === 'object' ? ch['display-name']['#text'] : ch['display-name']);
                        epgName = String(epgName).toLowerCase();
                    }
                    
                    // Filter Dummy Channels
                    if ((id && id.toLowerCase().includes('dummy')) || epgName.includes('dummy')) return;

                    // Prevent memory leak by deduplicating channels across multiple massive XML files
                    if (id && !communityEpgCache.channelIdMap[id.toLowerCase()]) {
                        communityEpgCache.channels.push(ch);
                    }

                    // Pass 0 map: direct EPG channel ID lookup (e.g. "amc.us" → "amc.us")
                    if (id) {
                        communityEpgCache.channelIdMap[id.toLowerCase()] = id;
                        
                        const coreId = getCoreId(id);
                        if (coreId) {
                            communityEpgCache.coreIdMap[coreId] = id;
                        }

                        const callsign = getCallsignId(id);
                        if (callsign && callsign.length >= 3) {
                            communityEpgCache.callsignMap[callsign] = id;
                        }
                    }

                    let displayNames = [];
                    if (Array.isArray(ch['display-name'])) {
                        displayNames = ch['display-name'].map(dn => typeof dn === 'object' ? dn['#text'] : dn);
                    } else if (ch['display-name']) {
                        displayNames = [typeof ch['display-name'] === 'object' ? ch['display-name']['#text'] : ch['display-name']];
                    }
                    displayNames.forEach(dn => {
                        if (dn) {
                            const cleaned = cleanChannelName(String(dn));
                            if (!communityEpgCache.channelMap[cleaned]) communityEpgCache.channelMap[cleaned] = [];
                            communityEpgCache.channelMap[cleaned].push(id);
                        }
                    });
                }
            };

            // Bug Fix: db.serialize() is NOT async-aware. Wrapping an async function inside
            // it causes resolve() to fire immediately (at the start of the async body),
            // not at the end. Instead, we manage the transaction manually with explicit
            // BEGIN/COMMIT calls, fully outside any db.serialize() context.
            await new Promise((resolve, reject) => {
                const insertStmt = db.prepare("INSERT INTO programmes (channel_id, xml_data) VALUES (?, ?)");

                db.run("BEGIN TRANSACTION", async (beginErr) => {
                    if (beginErr) return reject(beginErr);

                    let blockLines = [];
                    let blockType = null;
                    let currentChannelId = null;
                    let programmeCount = 0;
                    let lineCount = 0;

                    try {
                        for await (const line of rl) {
                            lineCount++;
                            if (lineCount % 10000 === 0) {
                                await new Promise(resolve => setImmediate(resolve));
                            }

                            if (line.includes('<channel ') || line.includes('<channel>')) {
                                blockType = 'channel';
                                blockLines = [line];
                                if (line.includes('</channel>')) {
                                    processChannelBlock(blockLines.join('\n'));
                                    blockType = null;
                                }
                            } else if (line.includes('<programme ')) {
                                blockType = 'programme';
                                blockLines = [line];
                                const match = line.match(/channel="([^"]+)"/);
                                currentChannelId = match ? match[1] : null;

                                if (line.includes('</programme>')) {
                                    if (currentChannelId) {
                                        programmeCount++;
                                        await new Promise((res, rej) => insertStmt.run(currentChannelId, blockLines.join('\n'), (err) => err ? rej(err) : res()));
                                        if (programmeCount % 50000 === 0) {
                                            // Checkpoint: commit current batch and start a new transaction
                                            await new Promise((res, rej) => {
                                                db.run("COMMIT", (err1) => {
                                                    if (err1) return rej(err1);
                                                    db.run("BEGIN TRANSACTION", (err2) => err2 ? rej(err2) : res());
                                                });
                                            });
                                            broadcastProgress(`[${fileNum}/${totalFiles}] Parsing ${filename} (Saved ${programmeCount} schedules)...`);
                                        }
                                    }
                                    blockType = null;
                                }
                            } else if (blockType === 'channel') {
                                // AUTO-RECOVERY: If we see a new opening tag while inside a block,
                                // the previous block was corrupted/missing its closing tag.
                                if ((line.includes('<channel ') || line.includes('<channel>')) && blockLines.length > 1) {
                                    blockLines = [line];
                                    continue;
                                }

                                blockLines.push(line);
                                if (blockLines.length > 10000) {
                                    blockType = null;
                                    blockLines = [];
                                    continue;
                                }
                                if (line.includes('</channel>')) {
                                    processChannelBlock(blockLines.join('\n'));
                                    blockType = null;
                                }
                            } else if (blockType === 'programme') {
                                // AUTO-RECOVERY: If we see a new opening tag while inside a block,
                                // the previous block was corrupted/missing its closing tag.
                                if (line.includes('<programme ') && blockLines.length > 1) {
                                    blockLines = [line];
                                    const match = line.match(/channel="([^"]+)"/);
                                    currentChannelId = match ? match[1] : null;
                                    continue;
                                }

                                blockLines.push(line);
                                if (blockLines.length > 10000) {
                                    blockType = null;
                                    blockLines = [];
                                    continue;
                                }
                                if (line.includes('</programme>')) {
                                    if (currentChannelId) {
                                        programmeCount++;
                                        await new Promise((res, rej) => insertStmt.run(currentChannelId, blockLines.join('\n'), (err) => err ? rej(err) : res()));
                                        if (programmeCount % 50000 === 0) {
                                            await new Promise((res, rej) => {
                                                db.run("COMMIT", (err1) => {
                                                    if (err1) return rej(err1);
                                                    db.run("BEGIN TRANSACTION", (err2) => err2 ? rej(err2) : res());
                                                });
                                            });
                                            broadcastProgress(`[${fileNum}/${totalFiles}] Parsing ${filename} (Saved ${programmeCount} schedules)...`);
                                        }
                                    }
                                    blockType = null;
                                }
                            }
                        }

                        // Final commit for remaining rows in the last batch
                        await new Promise(r => insertStmt.finalize(r));
                        await new Promise(r => db.run("COMMIT", r));
                        resolve();
                    } catch (loopErr) {
                        db.run("ROLLBACK");
                        reject(loopErr);
                    }
                });
            });

            try {
                rl.close();
                fileStream.destroy();
                // Brief pause to allow Windows to release the filesystem lock before unlinking
                await new Promise(r => setTimeout(r, 250));
                fs.unlinkSync(rawFilePath);
            } catch (e) {
                console.warn('Could not unlink temp file', rawFilePath);
            }
        }
        
        await new Promise((resolve) => {
            db.all("SELECT DISTINCT channel_id FROM programmes", [], (err, rows) => {
                if (rows) {
                    const validIds = new Set(rows.map(r => r.channel_id));
                    
                    communityEpgCache.channels = communityEpgCache.channels.filter(ch => validIds.has(ch['@_id']));
                    
                    const pruneMap = (map) => {
                        for (const key in map) {
                            if (Array.isArray(map[key])) {
                                map[key] = map[key].filter(id => validIds.has(id));
                                if (map[key].length === 0) delete map[key];
                            } else {
                                if (!validIds.has(map[key])) delete map[key];
                            }
                        }
                    };
                    
                    pruneMap(communityEpgCache.channelMap);
                    pruneMap(communityEpgCache.channelIdMap);
                    pruneMap(communityEpgCache.coreIdMap);
                    pruneMap(communityEpgCache.callsignMap);
                }
                
                db.get("SELECT COUNT(*) as count FROM programmes", [], (err, row) => {
                    broadcastProgress(`Master Library Built! Mapped ${communityEpgCache.channels.length} global channels.|DONE`);
                    resolve();
                });
            });
        });
        
        isProcessingBulk = false;
        })().catch(err => {
            console.error("Background parsing crashed:", err);
            broadcastProgress(`Error: Background parsing crashed - ${err.message}`);
            isProcessingBulk = false;
        });
    } catch (err) {
        console.error(err);
        isProcessingBulk = false;
        // Silently fail in background, client will notice via SSE
    }
});

// AI Override Endpoint
app.post('/api/override', (req, res) => {
    try {
        const { channelName, epgId } = req.body;
        if (!channelName || !epgId) return res.status(400).json({ error: 'Missing channelName or epgId' });
        
        const coreId = getCoreId(epgId) || epgId;
        manualOverrides[channelName] = coreId;
        
        fs.writeFileSync(overridesPath, JSON.stringify(manualOverrides, null, 2), 'utf8');
        res.json({ success: true, coreId });
    } catch (e) {
        console.error('Error saving override:', e);
        res.status(500).json({ error: 'Failed to save override' });
    }
});

// Auto-Map Channels
app.post('/api/auto-map', async (req, res) => {
    let mappings = {};
    let deadOverrides = [];
    let matchedCount = 0;
    let pass0Count = 0;
    let pass0dCount = 0;
    let pass1Count = 0;
    let pass1bCount = 0;
    let pass2Count = 0;
    const total = currentM3uChannels.length;

    broadcastProgress(`Initializing Matching Engine for ${total} channels...`);

    // Pre-compute normalized overrides to make Pass 0 immune to case/spacing differences
    const normalizedOverrides = {};
    for (const [key, val] of Object.entries(manualOverrides)) {
        normalizedOverrides[key] = val; // exact
        normalizedOverrides[key.toLowerCase().trim()] = val; // lower
        normalizedOverrides[cleanChannelName(key)] = val; // cleaned name
    }

    // Pre-compute bigrams for all EPG entries to prevent OOM in the inner loop
    const epgEntries = Object.entries(communityEpgCache.channelMap).map(([name, ids]) => ({ 
        name, 
        ids: ids.map(id => ({ id, country: getEpgCountry(id) })),
        bigrams: getBigramsSet(name)
    }));
    const channelIdMap = communityEpgCache.channelIdMap;

    for (let idx = 0; idx < total; idx++) {
        const ch = currentM3uChannels[idx];

        if (idx % 100 === 0 || idx === total - 1) {
            broadcastProgress(`Matching Channels (${idx + 1} / ${total})...`);
            await new Promise(resolve => setImmediate(resolve));
        }

        // --- PASS 0 (AI Override Map) ---
        const cleanedName = cleanChannelName(ch.name);
        let overrideCoreId = manualOverrides[ch.name] 
            || normalizedOverrides[ch.name.toLowerCase().trim()] 
            || normalizedOverrides[cleanedName];
            
        // Also allow manual_overrides.json to explicitly map tvg-ids (e.g. "fox34kjtv.us": "Fix")
        if (!overrideCoreId && ch.tvgId) {
            overrideCoreId = manualOverrides[ch.tvgId] || normalizedOverrides[ch.tvgId.toLowerCase().trim()];
        }

        if (overrideCoreId) {
            const overrideLower = overrideCoreId.toLowerCase().trim();
            if (communityEpgCache.coreIdMap[overrideLower]) {
                mappings[ch.id] = communityEpgCache.coreIdMap[overrideLower];
                matchedCount++;
                pass0Count++;
                continue;
            } else if (communityEpgCache.channelIdMap[overrideLower]) {
                mappings[ch.id] = communityEpgCache.channelIdMap[overrideLower];
                matchedCount++;
                pass0Count++;
                continue;
            } else {
                deadOverrides.push(ch.name);
            }
        }

        // --- PASS 0: Direct tvg-id lookup (O(1)) ---
        // The M3U channel has tvg-id="amc.us". The EPG XML has <channel id="amc.us">.
        // If these match, we skip all fuzzy logic entirely. This resolves the majority
        // of channels from well-configured providers with correct tvg-ids.
        if (ch.tvgId && ch.tvgId.trim()) {
            const directId = channelIdMap[ch.tvgId.toLowerCase().trim()];
            if (directId) {
                mappings[ch.id] = directId;
                matchedCount++;
                pass0Count++;
                continue;
            }
        }

        // --- PASS 0b: tvg-name direct lookup ---
        // Some providers set tvg-name to the EPG channel id (e.g. tvg-name="ESPN.us").
        if (ch.tvgName && ch.tvgName.trim()) {
            const directNameId = channelIdMap[ch.tvgName.toLowerCase().trim()];
            if (directNameId) {
                mappings[ch.id] = directNameId;
                matchedCount++;
                pass0Count++;
                continue;
            }
        }

        // --- PASS 0c: tvg-id + country suffix ---
        // Many providers use bare abbreviations: tvg-id="AMC" but EPG has "amc.us".
        // Try appending common country/region suffixes to find a match.
        if (ch.tvgId && ch.tvgId.trim() && !ch.tvgId.includes('.')) {
            const baseId = ch.tvgId.toLowerCase().trim();
            const suffixes = ['.us', '.uk', '.ca', '.au', '.nz', '.ie', '.za'];
            let suffixMatched = false;
            for (const suffix of suffixes) {
                const candidate = baseId + suffix;
                if (channelIdMap[candidate]) {
                    mappings[ch.id] = channelIdMap[candidate];
                    matchedCount++;
                    pass0Count++;
                    suffixMatched = true;
                    break;
                }
            }
            if (suffixMatched) continue;
        }

        // --- PASS 0d: Fuzzy core ID lookup ---
        // Strips file/quality suffixes (e.g. "Bravo.West.HD.us2" -> "bravowest", "bravowest.us" -> "bravowest")
        if (ch.tvgId && ch.tvgId.trim()) {
            const coreId = getCoreId(ch.tvgId);
            if (coreId && communityEpgCache.coreIdMap[coreId]) {
                mappings[ch.id] = communityEpgCache.coreIdMap[coreId];
                matchedCount++;
                pass0dCount++;
                continue;
            }
        }

        // --- PASS 0e: Callsign match for Local News ---
        // Isolates the 4-letter station callsign from M3U and matches it to EPG
        // (e.g. "foxkhon.us" -> "khon", "KHON-DT.us_locals1" -> "khon")
        if (ch.tvgId && ch.tvgId.trim()) {
            const callsign = getCallsignId(ch.tvgId);
            if (callsign && callsign.length >= 3 && communityEpgCache.callsignMap[callsign]) {
                const targetId = communityEpgCache.callsignMap[callsign];
                const targetCountry = getEpgCountry(targetId);
                let detectedCountryForCallsign = getEpgCountry(ch.tvgId);
                
                if (!detectedCountryForCallsign || !targetCountry || detectedCountryForCallsign === targetCountry) {
                    mappings[ch.id] = targetId;
                    matchedCount++;
                    pass0dCount++; // Just bundle under 0d for simplicity
                    continue;
                }
            }
        }

        const cleanedTarget = cleanChannelName(ch.name);
        if (!cleanedTarget || cleanedTarget.length < 2) continue;

        let detectedCountry = null;
        if (ch.tvgId) detectedCountry = getEpgCountry(ch.tvgId);
        if (!detectedCountry) {
            if (/^(USA?)\b/i.test(ch.name)) detectedCountry = 'us';
            else if (/^(UK)\b/i.test(ch.name)) detectedCountry = 'uk';
            else if (/^(CA)\b/i.test(ch.name)) detectedCountry = 'ca';
            else if (/^(AU)\b/i.test(ch.name)) detectedCountry = 'au';
        }

        // --- PASS 1: O(1) Exact display-name match ---
        if (communityEpgCache.channelMap[cleanedTarget]) {
            let pass1MatchId = null;
            const possibleIds = communityEpgCache.channelMap[cleanedTarget];
            
            for (const id of possibleIds) {
                const targetEpgCountry = getEpgCountry(id);
                // If the country matches perfectly, or we don't know the detected country, use it!
                if (!detectedCountry || !targetEpgCountry || detectedCountry === targetEpgCountry) {
                    pass1MatchId = id;
                    break;
                }
            }
            
            // If no country-matched ID was found, fallback to the first one ONLY if detectedCountry wasn't strictly mismatched
            if (!pass1MatchId && possibleIds.length > 0 && !detectedCountry) {
                pass1MatchId = possibleIds[0];
            }

            if (pass1MatchId) {
                mappings[ch.id] = pass1MatchId;
                matchedCount++;
                pass1Count++;
                continue;
            }
        }

        // --- PASS 1b: Name-based Callsign Extraction ---
        // Local channels often have no tvg-id but embed their callsign in the name
        // e.g. "USA FOX 11 KKFX SAN LUIS OBISPO" -> "KKFX", or "USA ABC (WXYZ)" -> "WXYZ"
        // Also captures Canadian (C) and Mexican (X) callsigns, and allows numbers (e.g. CP24)
        // We use matchAll with the global flag so if it falsely hits a network name like "CBS" first, it keeps scanning to find the true callsign like "KUTV"
        const callsignRegex = /\b([CKWX][A-Z0-9]{2,3})\b|\(([CKWX][A-Z0-9]{2,3})\)/gi;
        const callsignMatches = [...ch.name.matchAll(callsignRegex)];
        let pass1bMapped = false;
        
        for (const match of callsignMatches) {
            const extractedCallsign = (match[1] || match[2]).toLowerCase();
            if (['west', 'east', 'kids', 'kino', 'plus', 'wild', 'korea', 'city', 'star', 'cbs'].includes(extractedCallsign)) {
                continue; // Skip false positives
            }
            if (communityEpgCache.callsignMap[extractedCallsign]) {
                const targetId = communityEpgCache.callsignMap[extractedCallsign];
                // North American callsigns are globally unique. Drop the regional guard entirely.
                mappings[ch.id] = targetId;
                matchedCount++;
                pass1bCount++;
                pass1bMapped = true;
                break;
            }
        }
        
        if (pass1bMapped) continue;

        // --- PASS 1.5: Substring / Includes Match ---
        // Catch cases like "BUZZR" vs "BUZZRSTREAM", or "SCIENCE" vs "DISCOVERYSCIENCE"
        let substringMatchId = null;
        let bestSubstringOverlap = 0;
        for (let j = 0; j < epgEntries.length; j++) {
            const epgData = epgEntries[j];
            if (!epgData.name || epgData.name.length < 4) continue;
            
            let validId = null;
            for (let k = 0; k < epgData.ids.length; k++) {
                const epgIdObj = epgData.ids[k];
                if (!detectedCountry || !epgIdObj.country || detectedCountry === epgIdObj.country) {
                    validId = epgIdObj.id;
                    break;
                }
            }
            if (!validId) continue; // Regional mismatch!
            
            // If one string completely contains the other, and the shorter one is substantial (>= 4 chars)
            if (cleanedTarget.length >= 4 && epgData.name.length >= 4) {
                if (cleanedTarget.includes(epgData.name) || epgData.name.includes(cleanedTarget)) {
                    const overlap = Math.min(cleanedTarget.length, epgData.name.length);
                    const maxLen = Math.max(cleanedTarget.length, epgData.name.length);
                    
                    // Prioritize the longest overlap to prevent generic names (e.g. "VISION") from stealing "GALAVISION"
                    if (overlap / maxLen >= 0.75) {
                        if (overlap > bestSubstringOverlap) {
                            substringMatchId = validId;
                            bestSubstringOverlap = overlap;
                        }
                    }
                }
            }
        }

        if (substringMatchId) {
            mappings[ch.id] = substringMatchId;
            matchedCount++;
            pass1Count++; // bundle under pass1
            continue;
        }

        // --- PASS 2: Bigram Jaccard fuzzy match ---
        let bestScore = 0;
        let bestId = null;
        
        const targetBigramsArray = getBigramsArray(cleanedTarget);

        for (let j = 0; j < epgEntries.length; j++) {
            const epgData = epgEntries[j];
            if (!epgData.name || epgData.name.length < 3) continue;

            let validId = null;
            for (let k = 0; k < epgData.ids.length; k++) {
                const epgIdObj = epgData.ids[k];
                if (!detectedCountry || !epgIdObj.country || detectedCountry === epgIdObj.country) {
                    validId = epgIdObj.id;
                    break;
                }
            }
            if (!validId) continue; // Regional mismatch!

            // Looser length ratio (0.35) to allow "Hallmark Movies And Mysteries" (26) vs "Hallmark Mystery" (15)
            const lenRatio = Math.min(cleanedTarget.length, epgData.name.length) /
                             Math.max(cleanedTarget.length, epgData.name.length);
            if (lenRatio < 0.35) continue;

            const score = jaccardSimPrecomputed(cleanedTarget, epgData.name, targetBigramsArray, epgData.bigrams);
            
            // Quarantine "Match Centre" and Numbered Feeds
            let threshold = 0;
            const sharePrefix = cleanedTarget.substring(0, 4) === epgData.name.substring(0, 4);
            
            if (/\b(MATCH)\b/i.test(ch.name) || ch.name.includes('#')) {
                threshold = 0.95;
            } else {
                threshold = sharePrefix ? 0.45 : 0.60;
            }

            if (score > bestScore && score > threshold) {
                bestScore = score;
                bestId = validId;
            }
        }

        if (bestId) {
            mappings[ch.id] = bestId;
            matchedCount++;
            pass2Count++;
        }
    }

    // --- PASS 3: tvg-id propagation ---
    // For each unmatched channel, check if another channel with the SAME tvg-id
    // was already matched in Pass 0/1/2. If so, copy that EPG assignment.
    // This handles East/West/UHD/FHD/LHD duplicate variants automatically:
    // e.g. "USA Animal Planet East" (matched) → "USA Animal Planet East UHD" (copied)
    const tvgIdToEpgId = {};
    const baseNameToEpgId = {};
    
    // Custom basenamer that strips East/West entirely (since cleanChannelName converts EAST to E)
    const getBaseName = (name) => {
        let cleaned = cleanChannelName(name);
        // cleanChannelName converts \bEAST\b to E and \bWEST\b to W
        // If they end the string (or are followed by other things stripped), they might be just 'E' or 'W'
        // But cleanChannelName strips spaces, so "ANIMAL PLANET E" becomes "ANIMALPLANETE"
        // Let's strip trailing E or W if it came from East/West
        cleaned = cleaned.replace(/E$/, '').replace(/W$/, ''); 
        return cleaned;
    };

    for (const ch of currentM3uChannels) {
        if (mappings[ch.id]) {
            if (ch.tvgId) tvgIdToEpgId[ch.tvgId.toLowerCase()] = mappings[ch.id];
            
            const base = getBaseName(ch.name);
            if (base && base.length > 3) {
                baseNameToEpgId[base] = mappings[ch.id];
            }
        }
    }
    
    let pass3Count = 0;
    let pass3bCount = 0;
    
    for (const ch of currentM3uChannels) {
        if (!mappings[ch.id]) {
            if (ch.tvgId) {
                const propagated = tvgIdToEpgId[ch.tvgId.toLowerCase()];
                if (propagated) {
                    mappings[ch.id] = propagated;
                    matchedCount++;
                    pass3Count++;
                    continue;
                }
            }
            
            // Pass 3b: Base Name Propagation
            const base = getBaseName(ch.name);
            if (baseNameToEpgId[base]) {
                const targetId = baseNameToEpgId[base];
                const targetCountry = getEpgCountry(targetId);
                
                let detectedCountry = null;
                if (ch.tvgId) detectedCountry = getEpgCountry(ch.tvgId);
                if (!detectedCountry) {
                    if (/^(USA?)\b/i.test(ch.name)) detectedCountry = 'us';
                    else if (/^(UK)\b/i.test(ch.name)) detectedCountry = 'uk';
                    else if (/^(CA)\b/i.test(ch.name)) detectedCountry = 'ca';
                    else if (/^(AU)\b/i.test(ch.name)) detectedCountry = 'au';
                }
                
                if (!detectedCountry || !targetCountry || detectedCountry === targetCountry) {
                    mappings[ch.id] = targetId;
                    matchedCount++;
                    pass3bCount++;
                }
            }
        }
    }
    
    // --- PASS 4: Geography-Agnostic Fuzzy Match (Fallback) ---
    // For channels that completely failed to find a regional match, we relax the region check
    // but require a higher Jaccard threshold (0.75) to prevent mapping 'US Bravo' to 'UK Dave'
    let pass4Count = 0;
    for (const ch of currentM3uChannels) {
        if (!mappings[ch.id]) {
            const cleanedTarget = cleanChannelName(ch.name);
            if (!cleanedTarget || cleanedTarget.length < 2) continue;
            
            const targetBigramsArray = getBigramsArray(cleanedTarget);
            let bestScore = 0;
            let bestId = null;

            for (let j = 0; j < epgEntries.length; j++) {
                const epgData = epgEntries[j];
                if (!epgData.name || epgData.name.length < 3) continue;

                const lenRatio = Math.min(cleanedTarget.length, epgData.name.length) /
                                 Math.max(cleanedTarget.length, epgData.name.length);
                if (lenRatio < 0.40) continue;

                let score = jaccardSimPrecomputed(cleanedTarget, epgData.name, targetBigramsArray, epgData.bigrams);
                
                // Block the Short-Word Cross-Border Loophole
                if (/^(USA?|US |CA |CANADA)\b/i.test(ch.name)) {
                    const candidateId = epgData.ids[0].id;
                    const suffixMatch = candidateId.match(/\.([a-z0-9_]+)$/i);
                    if (suffixMatch) {
                        const suffix = suffixMatch[1].toLowerCase();
                        if (!['us', 'us2', 'ca', 'ca2', 'us_locals', 'us_locals1'].includes(suffix)) {
                            score -= 0.30;
                        }
                    }
                }
                
                // Quarantine "Match Centre" and Numbered Feeds
                let threshold = 0;
                const sharePrefix = cleanedTarget.substring(0, 4) === epgData.name.substring(0, 4);
                
                if (/\b(MATCH)\b/i.test(ch.name) || ch.name.includes('#')) {
                    threshold = 0.95;
                } else {
                    threshold = sharePrefix ? 0.80 : 0.85;
                }

                if (score > bestScore && score > threshold) {
                    bestScore = score;
                    // Take the first ID available regardless of country
                    bestId = epgData.ids[0].id; 
                }
            }

            if (bestId) {
                mappings[ch.id] = bestId;
                matchedCount++;
                pass4Count++;
            }
        }
    }

    // -------------------------------------------------------------
    // 👉 PASS 5: GENERIC FALLBACKS
    // Catch remaining unmapped channels and assign generic placeholders
    // -------------------------------------------------------------
    let pass5Count = 0;

    for (const ch of currentM3uChannels) {
        if (!mappings[ch.id]) {
            const nameLower = ch.name.toLowerCase();

            // 1. Live Sports / PPV / Ad-hoc Events
            if (
                nameLower.includes('mlb') || 
                nameLower.includes('nba') || 
                nameLower.includes('nfl') || 
                nameLower.includes('nhl') || 
                nameLower.includes('ppv') || 
                nameLower.includes('sports') || 
                nameLower.includes('espn') || 
                /\b(vs|at)\b/.test(nameLower) // e.g., "Everett AquaSox vs..."
            ) {
                mappings[ch.id] = 'generic.sports.us'; 
                matchedCount++;
                pass5Count++;
                continue;
            }

            // 2. 24/7 TV Series / Network Loops
            if (
                nameLower.includes('24/7') || 
                nameLower.includes('loop') || 
                nameLower.includes('series') || 
                nameLower.includes('binge')
            ) {
                mappings[ch.id] = 'generic.247tv.us';
                matchedCount++;
                pass5Count++;
                continue;
            }

            // 3. Adult / Studio Content
            if (
                nameLower.includes('xxx') || 
                nameLower.includes('adult') || 
                nameLower.includes('playboy') || 
                nameLower.includes('hustler')
            ) {
                mappings[ch.id] = 'generic.adult.us';
                matchedCount++;
                pass5Count++;
                continue;
            }
        }
    }

    broadcastProgress(`Mapping Complete! Linked ${matchedCount}/${total} channels. (Direct: ${pass0Count}, CoreID: ${pass0dCount}, Name: ${pass1Count}, Callsign: ${pass1bCount}, Fuzzy: ${pass2Count}, Propagated: ${pass3Count}, BaseName: ${pass3bCount}, Fallback: ${pass4Count}, Generic Fallback: ${pass5Count})`);
    res.json({ mappings, deadOverrides, matchedCount, pass0Count, pass0dCount, pass1Count, pass1bCount, pass2Count, pass3Count, pass3bCount, pass4Count, pass5Count });
});

// Get Community Channel List (for manual overrides)
app.get('/api/community-channels', (req, res) => {
    const list = communityEpgCache.channels.map(ch => {
        let name = 'Unknown';
        if (Array.isArray(ch['display-name'])) name = ch['display-name'][0]?.['#text'] || ch['display-name'][0] || name;
        else if (ch['display-name']) name = ch['display-name']?.['#text'] || ch['display-name'];
        return {
            id: ch['@_id'],
            name: name
        };
    });
    res.json(list);
});

app.get('/api/debug-epg', (req, res) => {
    res.json(communityEpgCache.channels);
});

app.post('/api/debug-unmapped', async (req, res) => {
    const { mappings } = req.body;
    const unmapped = currentM3uChannels.filter(ch => !mappings[ch.id]);
    res.json(unmapped);
});

app.get('/api/m3u-channels', (req, res) => {
    res.json(currentM3uChannels);
});

// Export XML
app.post('/api/export-xml', async (req, res) => {
    try {
        const { mappings, customIcons = {}, m3uChannels = [] } = req.body;
        
        // Transform the exported channels so they use the M3U channel ID
        // This ensures the IPTV player matches the EPG data to its own playlist
        const finalChannels = [];
        
        m3uChannels.forEach(ch => {
            const targetId = ch.tvgId || ch.id;
            const assignedEpgId = mappings[ch.id];
            const customIcon = customIcons[ch.id];
            
            if (assignedEpgId) {
                const targetCh = communityEpgCache.channels.find(c => c['@_id'] === assignedEpgId);
                if (targetCh) {
                    const cloned = JSON.parse(JSON.stringify(targetCh));
                    cloned['@_id'] = targetId; // Important: Swap to playlist ID
                    cloned['display-name'] = ch.name;
                    if (customIcon) cloned.icon = { '@_src': customIcon };
                    finalChannels.push(cloned);
                }
            } else if (customIcon) {
                // Unmapped but has custom icon
                finalChannels.push({
                    '@_id': targetId,
                    'display-name': ch.name,
                    'icon': { '@_src': customIcon }
                });
            }
        });
        
        const builder = new XMLBuilder({
            ignoreAttributes: false,
            attributeNamePrefix: "@_",
            format: true
        });
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const epgOutputDir = path.join(require('os').homedir(), 'Desktop', 'StreamPro EPGs');
        if (!fs.existsSync(epgOutputDir)) {
            fs.mkdirSync(epgOutputDir, { recursive: true });
        }
        const outputPath = path.join(epgOutputDir, `my_epg_${timestamp}.xml`);
        const writeStream = fs.createWriteStream(outputPath);
        
        writeStream.write(`<?xml version="1.0" encoding="UTF-8"?>\n<tv>\n`);
        
        const channelsXml = builder.build({ channel: finalChannels });
        if (channelsXml) writeStream.write(channelsXml + '\n');
        
        // Fetch programmes from SQLite and append sequentially
        const getProgrammes = (id) => new Promise((resolve, reject) => {
            db.all(`SELECT xml_data FROM programmes WHERE channel_id = ?`, [id], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        for (const ch of m3uChannels) {
            const assignedEpgId = mappings[ch.id];
            if (assignedEpgId) {
                const targetId = ch.tvgId || ch.id;
                const rows = await getProgrammes(assignedEpgId);
                for (const row of rows) {
                    // Overwrite the channel attribute with the target ID so the player maps it!
                    const modifiedXml = row.xml_data.replace(`channel="${assignedEpgId}"`, `channel="${targetId}"`);
                    writeStream.write(modifiedXml + '\n');
                }
            }
        }
        
        writeStream.write('</tv>');
        writeStream.end();
        
        writeStream.on('finish', () => {
            res.json({ success: true, path: outputPath });
        });
        writeStream.on('error', (err) => {
            console.error(err);
            res.status(500).json({ error: 'Failed to write XML' });
        });
        
    } catch (err) {
        console.error("Export Error:", err);
        res.status(500).json({ error: 'Failed to export XML' });
    }
});

const PORT = 3002;
// Export Diagnostic Report
app.post('/api/save-diagnostic-report', express.json(), (req, res) => {
    try {
        const report = req.body;
        if (!report) return res.status(400).json({ error: 'Invalid data' });
        
        const epgOutputDir = path.join(require('os').homedir(), 'Desktop', 'StreamPro EPGs');
        if (!fs.existsSync(epgOutputDir)) {
            fs.mkdirSync(epgOutputDir, { recursive: true });
        }
        const reportPath = path.join(epgOutputDir, 'diagnostic-report.json');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
        res.json({ success: true, path: reportPath });
    } catch (err) {
        console.error('Failed to save diagnostic report:', err);
        res.status(500).json({ error: 'Failed to write file' });
    }
});

app.listen(3002, () => {
    console.log(`EPG Editor Backend running on http://localhost:3002`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error('Port 3002 is already in use. A zombie process might be holding it.');
        process.exit(1);
    }
});

// Automatically kill server if parent (Electron) dies to prevent zombies
process.on('disconnect', () => {
    console.log('Parent process disconnected. Exiting to free port 3002...');
    process.exit(0);
});
