require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');
const zlib = require('zlib');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
const http = require('http');
const https = require('https');
const { injectTmdbRatings } = require('./tmdbCache');

// Configure ffmpeg to use the bundled static binary
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

const path = require('path');
const fs = require('fs');
const os = require('os');

const RECORDINGS_DIR = path.join(os.homedir(), 'Videos', 'IPTV_Recordings');
if (!fs.existsSync(RECORDINGS_DIR)) {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

// Map to track active ffmpeg recording processes
const activeRecordings = new Map();

// DVR Schedules Storage
const SCHEDULES_FILE = path.join(RECORDINGS_DIR, 'dvr_schedules.json');

const getSchedules = () => {
  if (!fs.existsSync(SCHEDULES_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(SCHEDULES_FILE, 'utf8'));
  } catch (err) {
    console.error('[DVR] Error reading schedules file:', err);
    return [];
  }
};

const saveSchedules = (schedules) => {
  try {
    fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(schedules, null, 2), 'utf8');
  } catch (err) {
    console.error('[DVR] Error writing schedules file:', err);
  }
};

/**
 * Reusable HTTP/HTTPS connection pools for all outbound proxy requests.
 *
 * WHY: Without keepAlive, every single HLS segment request opens a brand new
 * TCP connection to the IPTV provider's CDN, uses it once, then closes it.
 * A TCP handshake adds 50-150ms of overhead per request. Live streams deliver
 * a new segment every 2-6 seconds, so this compounds into constant buffering.
 * With keepAlive, connections are held open and reused across requests to the
 * same host, eliminating the handshake cost entirely after the first request.
 */
const httpAgent  = new http.Agent({  keepAlive: true, maxSockets: 32 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 32 });
const keepAliveAxios = axios.create({ httpAgent, httpsAgent });

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve static files from the compiled React app with strict NO-CACHE headers
// This ensures that when we re-compile the UI, the Electron app gets the latest bundle immediately.
app.use(express.static(path.join(__dirname, '../dist'), {
  etag: false,
  lastModified: false,
  setHeaders: (res, path) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

const XTREAM_URL = process.env.XTREAM_URL;
const USERNAME = process.env.XTREAM_USERNAME;
const PASSWORD = process.env.XTREAM_PASSWORD;

// Helper to construct API URL
const getApiUrl = (action, params = '', dynamicCreds = {}) => {
  const urlBase = dynamicCreds.x_url || XTREAM_URL;
  const user = dynamicCreds.x_user || USERNAME;
  const pass = dynamicCreds.x_pass || PASSWORD;
  
  let url = `${urlBase}/player_api.php?username=${user}&password=${pass}`;
  if (action) url += `&action=${action}`;
  if (params) url += `&${params}`;
  return url;
};

// 1. Proxy Xtream Codes JSON API
app.get('/api/xtream', async (req, res) => {
  try {
    const { action, x_url, x_user, x_pass, ...otherParams } = req.query;
    const paramsString = new URLSearchParams(otherParams).toString();
    const targetUrl = getApiUrl(action, paramsString, { x_url, x_user, x_pass });
    
    // Crucial: Add a timeout so native provider hangs don't freeze the EPG loop
    // Increased to 60000ms (60s) to survive event loop blocks when parsing massive XML payloads
    const headers = {};
    if (req.query.userAgent) headers['User-Agent'] = req.query.userAgent;
    const response = await axios.get(targetUrl, { timeout: 60000, headers });
    let finalData = response.data;
    
    if (action === 'get_vod_streams') {
      finalData = injectTmdbRatings(finalData, 'movie');
    } else if (action === 'get_series') {
      finalData = injectTmdbRatings(finalData, 'series');
    }

    res.json(finalData);
  } catch (error) {
    console.error('Error fetching from Xtream API:', error.message);
    res.status(500).json({ error: 'Failed to fetch from provider' });
  }
});

// 1b. Image Proxy — serves channel logos and stream icons through the server to bypass CORS
app.get('/proxy/image', async (req, res) => {
  try {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('Missing url parameter');
    const headers = {};
    if (req.query.userAgent) headers['User-Agent'] = req.query.userAgent;
    
    const response = await keepAliveAxios({
      method: 'get',
      url: targetUrl,
      responseType: 'stream',
      timeout: 5000,
      headers: headers,
      validateStatus: () => true
    });
    if (response.status !== 200) return res.status(response.status).send('Image not found');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache logos for 24h
    const contentType = response.headers['content-type'] || 'image/png';
    res.setHeader('Content-Type', contentType);
    response.data.pipe(res);
  } catch (error) {
    res.status(500).send('Image proxy error');
  }
});

// 2. Generic Raw URL Proxy (Bypasses CORS & handles Range headers)
app.get('/proxy/raw', async (req, res) => {
  try {
    let targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('Missing url parameter');

    const { x_url, x_user, x_pass } = req.query;
    if (x_user && x_pass && !targetUrl.includes('username=')) {
        targetUrl += `?username=${x_user}&password=${x_pass}`;
    }

    const headers = {};
    if (req.headers.range) {
      headers['Range'] = req.headers.range;
    }
    if (req.query.userAgent) {
      headers['User-Agent'] = req.query.userAgent;
    }

    const response = await axios({
      method: 'get',
      url: targetUrl,
      responseType: 'stream',
      headers: headers,
      validateStatus: () => true
    });

    const headersToProxy = ['content-type', 'content-length', 'accept-ranges', 'content-range'];
    headersToProxy.forEach(h => {
      if (response.headers[h]) {
        res.setHeader(h, response.headers[h]);
      }
    });
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(response.status);

    response.data.pipe(res);
  } catch (error) {
    console.error('Raw proxy error:', error.message);
    res.status(500).send('Error proxying media');
  }
});

// Helper to extract credentials
const getCreds = (req) => {
  return {
    xtreamUrl: req.query.x_url || req.query.serverUrl || XTREAM_URL,
    username: req.query.x_user || req.query.username || USERNAME,
    password: req.query.x_pass || req.query.password || PASSWORD,
    userAgent: req.query.userAgent
  };
};

// --- M3U8 Rewriter Helper ---
const proxyM3u8 = async (targetUrls, res, options = {}) => {
    const { transcode = false, full = false, userAgent } = options;
    try {
        const urlsToTry = Array.isArray(targetUrls) ? targetUrls : [targetUrls];
        let m3u8Res = null;
        let finalUrl = null;

        const fetchM3u8 = (url) => {
          const headers = {};
          if (userAgent) headers['User-Agent'] = userAgent;
          return keepAliveAxios.get(url, { validateStatus: () => true, timeout: 8000, headers });
        };

        if (urlsToTry.length === 1) {
            m3u8Res = await fetchM3u8(urlsToTry[0]);
            finalUrl = m3u8Res.request?.res?.responseUrl || urlsToTry[0];
        } else {
            try {
                m3u8Res = await Promise.any(
                    urlsToTry.map(async (url) => {
                        const res = await fetchM3u8(url);
                        if (res.status === 200) return res;
                        throw new Error(`Status ${res.status}`);
                    })
                );
                finalUrl = m3u8Res.request?.res?.responseUrl || m3u8Res.config.url;
            } catch (err) {
                // All parallel attempts failed
                m3u8Res = { status: 404 };
            }
        }

        if (!m3u8Res || m3u8Res.status !== 200) {
            return res.status(m3u8Res ? m3u8Res.status : 404).send('Error fetching m3u8 from all fallback URLs');
        }
        
        const lines = m3u8Res.data.split('\n');
        const urlObj = new URL(finalUrl);
        const rewritten = lines.map(line => {
           line = line.trim();
           if (!line || line.startsWith('#')) return line;
           
           try {
               // Safely resolve relative/absolute inner paths using the Edge Server's URL
               // If line starts with /, use the root origin, otherwise resolve against the base
               const absoluteUrl = line.startsWith('/') 
                 ? urlObj.origin + line 
                 : new URL(line, finalUrl).href;
               
               let rewrittenUrl = `/proxy/stream/absolute?url=${encodeURIComponent(absoluteUrl)}`;
               if (transcode) rewrittenUrl += '&transcode=true';
               if (full) rewrittenUrl += '&full=true';
               if (userAgent) rewrittenUrl += `&userAgent=${encodeURIComponent(userAgent)}`;
               return rewrittenUrl;
           } catch(e) {
               return line;
           }
        });
        
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-cache'); // M3U8 playlists must never be cached
        return res.send(rewritten.join('\n'));
    } catch (error) {
        console.error('M3U8 rewrite error:', error.message);
        res.status(500).send('Error processing m3u8 playlist');
    }
};

// 3. Smart Stream Proxy
app.get('/proxy/stream/:type/:streamId', async (req, res) => {
  console.log('Incoming proxy request:', req.originalUrl);
  try {
    const { type, streamId } = req.params;
    const extension = req.query.extension || (type === 'live' ? 'm3u8' : 'mp4');
    const { xtreamUrl, username, password, userAgent } = getCreds(req);
    const targetUrl = `${xtreamUrl}/${type}/${username}/${password}/${streamId}.${extension}`;
    
    if (extension === 'mp4' || extension === 'mkv' || type === 'movie' || type === 'series') {
      return res.redirect(302, targetUrl);
    }

    if (extension === 'm3u8') {
      // For Live TV, some providers don't use the /live/ folder in the path for m3u8.
      // We will pass the primary and fallback URLs to a modified proxyM3u8 function
      let urlsToTry = [targetUrl];
      if (type === 'live') {
         urlsToTry.push(`${xtreamUrl}/${username}/${password}/${streamId}.m3u8`);
      }
      return proxyM3u8(urlsToTry, res, { transcode: req.query.transcode === 'true', full: req.query.full === 'true', userAgent });
    }
    
    const headers = {};
    if (userAgent) headers['User-Agent'] = userAgent;
    const response = await axios({ method: 'get', url: targetUrl, responseType: 'stream', headers, validateStatus: () => true });
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(response.status);
    response.data.pipe(res);
  } catch (error) {
    console.error('Stream proxy error:', error.message);
    res.status(500).send('Error proxying stream');
  }
});

// 4. Proxy Timeshift (Catch-Up TV)
app.get('/proxy/timeshift', async (req, res) => {
  try {
    const { stream_id, start, duration } = req.query;
    if (!stream_id || !start || !duration) {
      return res.status(400).send('Missing required timeshift parameters');
    }
    const { xtreamUrl, username, password, userAgent } = getCreds(req);
    const targetUrl = `${xtreamUrl}/streaming/timeshift.php?username=${username}&password=${password}&stream=${stream_id}&start=${start}&duration=${duration}`;
    
    // Timeshift ALWAYS returns an m3u8 playlist, so we route it through our rewrite engine
    return proxyM3u8(targetUrl, res, { transcode: req.query.transcode === 'true', full: req.query.full === 'true', userAgent });
  } catch (error) {
    console.error('Timeshift proxy error:', error.message);
    res.status(500).send('Error proxying timeshift stream');
  }
});

// 5. Proxy Absolute Segments (Handles nested playlists AND raw chunks)
app.get('/proxy/stream/absolute', async (req, res) => {
  try {
    const targetUrl = req.query.url;
    
    // If it's a nested playlist, we MUST rewrite it too!
    const isTranscode = req.query.transcode === 'true';
    const isFull = req.query.full === 'true';
    const userAgent = req.query.userAgent;

    if (targetUrl.includes('.m3u8') || targetUrl.includes('extension=m3u8')) {
        return proxyM3u8(targetUrl, res, { transcode: isTranscode, full: isFull, userAgent });
    }
    
    if (isTranscode) {
       res.setHeader('Content-Type', 'video/mp2t');
       const chunkHeaders = {};
       if (userAgent) chunkHeaders['User-Agent'] = userAgent;

       const chunkResponse = await keepAliveAxios({
         method: 'get',
         url: targetUrl,
         headers: chunkHeaders,
         responseType: 'stream',
         validateStatus: () => true
       });
       
       if (chunkResponse.status !== 200) {
         return res.status(chunkResponse.status).send('Chunk fetch failed');
       }
       
       const command = ffmpeg(chunkResponse.data)
         .audioCodec('aac')
         .audioChannels(2)
         .videoCodec('copy')
         .outputOptions([
           '-copyts',
           '-muxdelay 0',
           '-avoid_negative_ts disabled',
           '-fflags +flush_packets'
         ])
         .format('mpegts')
         .on('stderr', (errLine) => {
           console.error('FFmpeg:', errLine);
         })
         .on('error', (err) => {
           console.error('Segment transcode error:', err.message);
         });
         
       if (isFull) {
         command.videoCodec('libx264').outputOptions(['-preset ultrafast', '-crf 28']);
       } else {
         command.videoCodec('copy');
       }
       
       command.pipe(res);
       
       req.on('close', () => {
          command.kill('SIGKILL');
          chunkResponse.data.destroy();
       });
       return;
    }
    
    const headers = {};
    if (userAgent) headers['User-Agent'] = userAgent;

    const response = await keepAliveAxios({
      method: 'get',
      url: targetUrl,
      headers: headers,
      responseType: 'stream',
      validateStatus: () => true
    });
    
    const headersToProxy = ['content-type', 'content-length', 'accept-ranges', 'content-range'];
    headersToProxy.forEach(h => {
      if (response.headers[h]) {
        res.setHeader(h, response.headers[h]);
      }
    });
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Accel-Buffering', 'no'); // Flush chunks immediately, don't buffer in Express
    res.status(response.status);
    response.data.pipe(res);
  } catch (error) {
    console.error('Absolute proxy error:', error.message);
    res.status(500).send('Error proxying segment');
  }
});

// 6. Transcode Audio to AAC (For AC3 codec issues) - outputs fragmented MP4 for browser compatibility
app.get('/proxy/transcode', (req, res) => {
  const targetUrl = req.query.url;
  const fullTranscode = req.query.full === 'true';
  if (!targetUrl) return res.status(400).send('Missing url');

  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  const command = ffmpeg(targetUrl);
  const inputOpts = [
    '-reconnect 1',
    '-reconnect_at_eof 1',
    '-reconnect_streamed 1',
    '-reconnect_delay_max 2',
    '-fflags +nobuffer+genpts' // Prevent input buffering
  ];
  if (req.query.userAgent) {
    inputOpts.push(`-user_agent "${req.query.userAgent}"`);
  }
  command.inputOptions(inputOpts);

  command.videoCodec(fullTranscode ? 'libx264' : 'copy')
    .audioCodec('aac')
    .format('mp4')
    .outputOptions([
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      '-max_muxing_queue_size', '1024'
    ]);
    
  if (fullTranscode) {
    command.outputOptions([
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-crf', '28'
    ]);
  }

  command.on('error', (err) => {
      console.error('FFmpeg transcoding error:', err.message);
      if (!res.headersSent) {
        res.status(500).send('Transcoding failed');
      }
    });

  // Pipe the transcoded stream to the client
  command.pipe(res, { end: true });

  // Kill FFmpeg process if the client disconnects/stops playing
  req.on('close', () => {
    command.kill('SIGKILL');
  });
});

// 7. Stream Probe - Accurately detects audio/video codecs for auto-transcoding
app.get('/proxy/probe', (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('Missing url');

  res.setHeader('Access-Control-Allow-Origin', '*');

  ffmpeg.ffprobe(targetUrl, (err, metadata) => {
    if (err) {
      console.error("FFprobe error:", err.message);
      return res.status(500).json({ error: err.message });
    }
    
    const streams = metadata?.streams || [];
    const audioStream = streams.find(s => s.codec_type === 'audio');
    const videoStream = streams.find(s => s.codec_type === 'video');
    
    res.json({
      audioCodec: audioStream?.codec_name || null,
      videoCodec: videoStream?.codec_name || null,
      audioChannels: audioStream?.channels || null
    });
  });
});

// 8. Virtual HLS Transcoder (In-Memory RAM Engine) - Solves MP4 latency and Segmented timestamp issues

const activeHlsSessions = {};

app.get('/proxy/hls/start', async (req, res) => {
  const targetUrl = req.query.url;
  const fullTranscode = req.query.full === 'true';
  const audioDelayMs = parseInt(req.query.audioDelayMs || '0', 10);
  
  if (!targetUrl) return res.status(400).json({ error: 'Missing url' });

  // Clean up any old session for this URL
  for (const [sid, session] of Object.entries(activeHlsSessions)) {
    if (session.url === targetUrl) {
      session.command.kill('SIGKILL');
      delete activeHlsSessions[sid];
    }
  }

  const sessionId = Date.now().toString() + Math.floor(Math.random() * 1000);

  const command = ffmpeg();

  const inputOpts = [
    '-reconnect 1',
    '-reconnect_streamed 1',
    '-reconnect_delay_max 2',
  ];

  if (req.query.userAgent) {
    inputOpts.push(`-user_agent "${req.query.userAgent}"`);
  }

  if (audioDelayMs > 0) {
    // Delay Audio (Audio is too early)
    command.input(targetUrl).inputOptions(inputOpts);
    command.input(targetUrl).inputOptions([`-itsoffset ${(audioDelayMs/1000).toFixed(3)}`, ...inputOpts]);
    command.outputOptions(['-map 0:v:0?', '-map 1:a:0?']);
  } else if (audioDelayMs < 0) {
    // Delay Video (Audio is too late)
    command.input(targetUrl).inputOptions([`-itsoffset ${Math.abs(audioDelayMs/1000).toFixed(3)}`, ...inputOpts]);
    command.input(targetUrl).inputOptions(inputOpts);
    command.outputOptions(['-map 0:v:0?', '-map 1:a:0?']);
  } else {
    // No Delay
    command.input(targetUrl).inputOptions(inputOpts);
  }

  command
    .videoCodec(fullTranscode ? 'libx264' : 'copy')
    .audioCodec('aac')
    .outputOptions([
      '-f', 'hls',
      '-hls_time', '4',
      '-hls_list_size', '5',
      '-hls_flags', 'delete_segments',
      '-hls_segment_type', 'mpegts',
      '-method', 'PUT'
    ]);

  if (fullTranscode) {
    command.outputOptions([
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-crf', '28'
    ]);
  }

  command.output(`http://127.0.0.1:${process.env.PORT || 3001}/proxy/hls/upload/${sessionId}/stream.m3u8`);

  command.on('start', (cmdLine) => {
    console.log(`[HLS Transcoder] Started Session ${sessionId} with command:`, cmdLine);
  });

  command.on('stderr', (stderrLine) => {
    console.log(`[HLS Transcoder ${sessionId}]`, stderrLine);
  });

  command.on('error', (err) => {
    if (err.message && err.message.includes('SIGKILL')) return; // Ignore intentional kills
    console.error(`[HLS Transcoder] Session ${sessionId} error:`, err.message);
  });

  command.run();

  activeHlsSessions[sessionId] = {
    command,
    files: {},
    url: targetUrl,
    lastAccessed: Date.now()
  };

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({ sessionId, playlistUrl: `http://localhost:3001/proxy/hls/${sessionId}/stream.m3u8` });
});

app.get('/proxy/hls/stop/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = activeHlsSessions[sessionId];
  
  if (session) {
    session.command.kill('SIGKILL');
    delete activeHlsSessions[sessionId];
  }
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.send('Stopped');
});

// FFmpeg HTTP Upload Endpoints (RAM Buffer)
app.all('/proxy/hls/upload/:sessionId/:file', (req, res) => {
  const { sessionId, file } = req.params;
  const session = activeHlsSessions[sessionId];

  if (req.method === 'PUT' || req.method === 'POST') {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      if (session) {
        session.files[file] = Buffer.concat(chunks);
        session.lastAccessed = Date.now();
        console.log(`[RAM WRITE] ${file} - ${session.files[file].length} bytes`);
      }
      res.send('OK');
    });
    req.on('error', err => res.status(500).send(err.message));
  } else if (req.method === 'DELETE') {
    if (session && session.files) {
      delete session.files[file];
    }
    res.send('OK');
  } else if (req.method === 'GET') {
    if (session && session.files[file]) {
      res.send(session.files[file]);
    } else {
      res.status(404).send('Not Found');
    }
  } else {
    res.send('OK');
  }
});

// Client GET Endpoint (Serves from RAM)
app.get('/proxy/hls/:sessionId/:file', (req, res) => {
  const { sessionId, file } = req.params;
  const session = activeHlsSessions[sessionId];
  
  if (!session) {
    return res.status(404).send('Session not found');
  }

  session.lastAccessed = Date.now();

  if (file === 'stream.m3u8') {
    let attempts = 0;
    const checkFile = () => {
      if (session.files[file]) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.send(session.files[file]);
      } else if (attempts < 60) {
        attempts++;
        setTimeout(checkFile, 500);
      } else {
        res.status(404).send('Playlist not ready');
      }
    };
    checkFile();
    return;
  }

  if (session.files[file]) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Content-Type', 'video/MP2T');
    res.send(session.files[file]);
  } else {
    res.status(404).send('File not found');
  }
});

// Periodic cleanup of orphaned HLS sessions (10 minutes inactive)
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of Object.entries(activeHlsSessions)) {
    if (now - session.lastAccessed > 10 * 60 * 1000) {
      console.log(`[HLS Transcoder] Cleaning up orphaned session ${sessionId}`);
      session.command.kill('SIGKILL');
      delete activeHlsSessions[sessionId];
    }
  }
}, 60000);

// 9. DVR / Recording Engine Endpoints

// DVR Schedules API
app.get('/proxy/dvr/schedules', (req, res) => {
  res.json(getSchedules());
});

app.post('/proxy/dvr/schedules', (req, res) => {
  const schedule = req.body;
  if (!schedule.id) schedule.id = Date.now().toString();
  const schedules = getSchedules();
  schedules.push(schedule);
  saveSchedules(schedules);
  res.json({ success: true, schedule });
});

app.delete('/proxy/dvr/schedules/:id', (req, res) => {
  const { id } = req.params;
  const schedules = getSchedules();
  const filtered = schedules.filter(s => s.id !== id);
  saveSchedules(filtered);
  res.json({ success: true });
});

// DVR Background Cron Engine
setInterval(() => {
  const now = Date.now();
  const schedules = getSchedules();
  let changed = false;

  const remaining = schedules.filter(schedule => {
    // If we have reached the start time, but haven't passed the end time
    if (now >= schedule.startTime && now < schedule.endTime) {
      const durationSecs = Math.floor((schedule.endTime - now) / 1000);
      console.log(`[DVR Cron] Starting scheduled recording: ${schedule.title} (Duration: ${durationSecs}s)`);
      
      axios.post(`http://127.0.0.1:${port}/api/record/start`, {
        url: schedule.url,
        title: schedule.title,
        duration: durationSecs
      }).catch(e => console.error('[DVR Cron] Failed to start scheduled recording:', e.message));

      changed = true;
      return false; // Remove from upcoming schedules
    } else if (now >= schedule.endTime) {
      // Expired schedule
      console.log(`[DVR Cron] Discarding expired schedule: ${schedule.title}`);
      changed = true;
      return false;
    }
    return true; // Keep in future
  });

  if (changed) {
    saveSchedules(remaining);
  }
}, 30000); // Check every 30 seconds
app.post('/api/record/start', (req, res) => {
  const { url, title, duration } = req.body;
  if (!url || !title) return res.status(400).json({ error: 'Missing url or title' });

  // Add credentials if needed
  let targetUrl = url;
  const { x_user, x_pass } = req.query;
  if (x_user && x_pass && !targetUrl.includes('username=')) {
    targetUrl += `?username=${x_user}&password=${x_pass}`;
  }

  const id = Date.now().toString();
  // Sanitize title for filename
  const safeTitle = title.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
  const filename = `${safeTitle}_${id}.mp4`;
  const filepath = path.join(RECORDINGS_DIR, filename);

  // Remux to mp4 and ensure audio is AAC for universal browser support
  const command = ffmpeg(targetUrl)
    .videoCodec('copy')
    .audioCodec('aac')
    .format('mp4')
    .outputOptions([
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      '-max_muxing_queue_size', '1024'
    ]);
    
  if (duration) {
    command.duration(duration); // e.g. '01:30:00' or seconds
  }

  command
    .on('start', () => {
      console.log(`[DVR] Started recording: ${title} -> ${filepath}`);
    })
    .on('end', () => {
      console.log(`[DVR] Finished recording: ${title}`);
      activeRecordings.delete(id);
      
      // Extract a thumbnail frame 2 seconds into the video
      const thumbPath = filepath.replace('.mp4', '.jpg');
      ffmpeg(filepath)
        .seekInput('00:00:02')
        .frames(1)
        .output(thumbPath)
        .on('end', () => console.log(`[DVR] Thumbnail generated for ${title}`))
        .on('error', (err) => console.error(`[DVR] Thumbnail generation failed for ${title}`, err.message))
        .run();
    })
    .on('error', (err) => {
      console.error(`[DVR] Error for ${title}:`, err.message);
      activeRecordings.delete(id);
    })
    .save(filepath);

  activeRecordings.set(id, {
    id,
    title,
    startTime: Date.now(),
    filepath,
    command
  });

  res.json({ success: true, id, message: 'Recording started' });
});

app.post('/api/record/stop', (req, res) => {
  const { id } = req.body;
  if (!id || !activeRecordings.has(id)) {
    return res.status(404).json({ error: 'Recording not found' });
  }

  const recording = activeRecordings.get(id);
  // On Windows, kill('SIGINT') acts like SIGKILL and instantly corrupts the MP4.
  // We must gracefully tell FFmpeg to quit via stdin.
  try {
    if (recording.command && recording.command.ffmpegProc) {
      recording.command.ffmpegProc.stdin.write('q\n');
    } else {
      recording.command.kill('SIGINT');
    }
  } catch (err) {
    console.error('Failed to quit ffmpeg gracefully', err);
    recording.command.kill('SIGKILL');
  }
  
  // We delete from activeRecordings here so the UI instantly updates to 'DVR' instead of getting stuck on 'REC'
  activeRecordings.delete(id);
  
  console.log(`[DVR] Stopping recording: ${recording.title}... waiting for finalization`);
  res.json({ success: true, message: 'Recording stopping...' });
});

app.get('/api/record/status', (req, res) => {
  const active = Array.from(activeRecordings.entries()).map(([id, data]) => ({
    id,
    title: data.title,
    startTime: data.startTime
  }));
  res.json({ recordings: active });
});

// --- RECORDINGS UI ENDPOINTS ---
app.get('/api/recordings/list', async (req, res) => {
  try {
    const files = fs.readdirSync(RECORDINGS_DIR);
    const recordings = [];
    for (const file of files) {
      if (file.endsWith('.mp4')) {
        const filePath = path.join(RECORDINGS_DIR, file);
        const stats = fs.statSync(filePath);
        
        // Check if thumbnail exists
        const thumbFile = file.replace('.mp4', '.jpg');
        const hasThumb = fs.existsSync(path.join(RECORDINGS_DIR, thumbFile));
        
        recordings.push({
          id: file,
          title: file.replace(/_[0-9]+\.mp4$/, '').replace(/_/g, ' '),
          path: filePath,
          size: stats.size,
          createdAt: stats.birthtime,
          url: `http://localhost:3001/recordings/${encodeURIComponent(file)}`,
          thumbnail: hasThumb ? `http://localhost:3001/recordings/${encodeURIComponent(thumbFile)}` : null
        });
      }
    }
    // Sort by newest first
    recordings.sort((a, b) => b.createdAt - a.createdAt);
    res.json({ recordings });
  } catch (err) {
    console.error('Failed to list recordings:', err.message);
    res.status(500).json({ error: 'Failed to list recordings' });
  }
});

app.post('/api/recordings/delete', async (req, res) => {
  try {
    const { fileId } = req.body;
    if (!fileId || !fileId.endsWith('.mp4')) return res.status(400).json({ error: 'Invalid file' });
    const filePath = path.join(RECORDINGS_DIR, fileId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  } catch (err) {
    console.error('Failed to delete recording:', err.message);
    res.status(500).json({ error: 'Failed to delete recording' });
  }
});

// Serve the recordings directory directly (supports byte-ranges natively)
app.use('/recordings', express.static(RECORDINGS_DIR));

// Endpoint to stream local videos bypassing CORS
app.get('/proxy/local-video', (req, res) => {
  try {
    const fileId = req.query.file;
    if (!fileId || !fileId.endsWith('.mp4')) return res.status(400).send('Invalid file');
    const filePath = path.join(RECORDINGS_DIR, fileId);
    
    if (!fs.existsSync(filePath)) return res.status(404).send('File not found');
    
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(filePath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
        'Access-Control-Allow-Origin': '*'
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
        'Access-Control-Allow-Origin': '*'
      };
      res.writeHead(200, head);
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    res.status(500).send('Error streaming local video');
  }
});

// ------------------------------------

// --- Custom EPG Engine ---
const EPG_CACHE_FILE = path.join(__dirname, 'epg_cache.json');
const EPG_MAPPINGS_FILE = path.join(__dirname, 'epg_mappings.json');
let fuzzyMatchCache = {};
try {
  if (fs.existsSync(EPG_MAPPINGS_FILE)) {
    fuzzyMatchCache = JSON.parse(fs.readFileSync(EPG_MAPPINGS_FILE, 'utf8'));
    console.log(`[EPG Mappings] Loaded ${Object.keys(fuzzyMatchCache).length} custom mappings.`);
  }
} catch (e) {
  console.log('[EPG Mappings] Failed to load local mappings:', e.message);
}
let cachedCustomEpg = null;
let customEpgLastFetch = 0;

// EPG source file — the SAX streaming worker will parse this.
// A 618MB XML file CANNOT be parsed in-memory without freezing Node.js.
// Instead we use a Worker thread with a SAX streaming parser.
const CUSTOM_EPG_URLS = [
  'C:\\Users\\Shane\\Desktop\\StreamPro EPGs\\my_epg_2026-06-25T07-47-53-862Z.xml'
];

// Try to load EPG cache from disk on boot (fast path — skip worker if cache is fresh)
try {
  if (fs.existsSync(EPG_CACHE_FILE)) {
    const raw = fs.readFileSync(EPG_CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    // Cache is valid if it has programsByChannel and was written within 12 hours
    if (parsed && parsed.channelMap && parsed.programsByChannel &&
        parsed.timestamp && (Date.now() - parsed.timestamp < 12 * 60 * 60 * 1000) &&
        Object.keys(parsed.channelMap).length > 0) {
      cachedCustomEpg = {
        channelMap: parsed.channelMap,
        programsByChannel: parsed.programsByChannel
      };
      customEpgLastFetch = parsed.timestamp;
      const channelCount = Object.keys(parsed.channelMap).length;
      const programCount = Object.values(parsed.programsByChannel).reduce((sum, arr) => sum + arr.length, 0);
      console.log(`[EPG Cache] Loaded ${channelCount} channels, ${programCount} programs from disk. Bypassing parse.`);
    } else {
      console.log('[EPG Cache] Cache is empty, stale, or old format — will re-parse EPG on boot.');
    }
  }
} catch (e) {
  console.log('[EPG Cache] Failed to load local cache:', e.message);
}

let epgFetchPromise = null;

// SSE client set — declared here so broadcastEpgUpdated (below) can reference it
// without a temporal dead zone error. The /api/epg/stream route adds clients later.
const epgSseClients = new Set();

/**
 * Broadcast an 'epg_updated' SSE event to all connected frontend clients.
 * Defined here (before spawnEpgWorker) so it can be called from inside the worker handler.
 */
const broadcastEpgUpdated = () => {
  const payload = `data: ${JSON.stringify({ event: 'epg_updated', timestamp: Date.now() })}\n\n`;
  for (const client of epgSseClients) {
    try { client.write(payload); } catch (e) { epgSseClients.delete(client); }
  }
  console.log(`[EPG SSE] Broadcasted epg_updated to ${epgSseClients.size} client(s).`);
};

/**
 * Spawn the SAX-streaming worker to parse the EPG XML in a background thread.
 * This is the ONLY safe way to parse a 600MB+ XML file without blocking the
 * Node.js event loop (which would freeze all API responses for 10+ seconds).
 */
const spawnEpgWorker = (url) => new Promise((resolve, reject) => {
  const { Worker } = require('worker_threads');
  const workerPath = path.join(__dirname, 'epgWorker.js');

  if (!fs.existsSync(workerPath)) {
    return reject(new Error(`epgWorker.js not found at ${workerPath}`));
  }

  // Initialize an empty cache so the bulk endpoint can serve partial results
  // even before the first batch arrives
  if (!cachedCustomEpg) {
    cachedCustomEpg = { channelMap: {}, programsByChannel: {} };
  }

  let firstBatchReceived = false;
  let totalMerged = 0;

  const worker = new Worker(workerPath, { workerData: { url } });

  worker.on('message', (msg) => {
    if (msg.type === 'batch') {
      // Merge channelMap (full map sent each batch)
      Object.assign(cachedCustomEpg.channelMap, msg.channelMap);

      // Merge new programs (delta only) into the in-memory cache
      for (const [cid, progs] of Object.entries(msg.newPrograms)) {
        if (!cachedCustomEpg.programsByChannel[cid]) {
          cachedCustomEpg.programsByChannel[cid] = [];
        }
        cachedCustomEpg.programsByChannel[cid].push(...progs);
        totalMerged += progs.length;
      }

      if (!firstBatchReceived) {
        firstBatchReceived = true;
        const chCount = Object.keys(cachedCustomEpg.channelMap).length;
        console.log(`[EPG] First batch ready — ${chCount} EPG channels mapped, ${totalMerged} programs. Broadcasting to clients...`);
        // Fire SSE immediately so the frontend starts populating right now
        broadcastEpgUpdated();
      }

    } else if (msg.type === 'done') {
      // Worker finished and wrote full cache to disk.
      // Reload from disk to get the canonical final state.
      try {
        if (fs.existsSync(EPG_CACHE_FILE)) {
          const raw = fs.readFileSync(EPG_CACHE_FILE, 'utf8');
          const parsed = JSON.parse(raw);
          if (parsed && parsed.channelMap && parsed.programsByChannel) {
            cachedCustomEpg = {
              channelMap: parsed.channelMap,
              programsByChannel: parsed.programsByChannel
            };
            customEpgLastFetch = parsed.timestamp || Date.now();
            const channelCount = Object.keys(parsed.channelMap).length;
            const programCount = Object.values(parsed.programsByChannel).reduce((s, a) => s + a.length, 0);
            console.log(`[EPG] Parse fully complete: ${channelCount} channels, ${programCount.toLocaleString()} programs. Broadcasting final update...`);
          }
        }
      } catch (e) {
        console.error('[EPG] Failed to reload final cache from disk:', e.message);
      }
      // Final broadcast — fills in any channels the frontend missed in the first batch
      broadcastEpgUpdated();
      resolve();

    } else if (msg.type === 'error') {
      reject(new Error(msg.error || 'epgWorker reported failure'));
    }
  });

  worker.on('error', reject);
  worker.on('exit', (code) => {
    if (code !== 0) reject(new Error(`epgWorker exited with code ${code}`));
  });
});


const fetchAndParseCustomEpg = async () => {
  try {
    const now = Date.now();
    // Return cached data if still fresh (12 hours)
    if (cachedCustomEpg && Object.keys(cachedCustomEpg.channelMap).length > 0 &&
        (now - customEpgLastFetch < 12 * 60 * 60 * 1000)) {
      return cachedCustomEpg;
    }

    // Deduplicate concurrent callers
    if (epgFetchPromise) return epgFetchPromise;

    epgFetchPromise = (async () => {
      for (const url of CUSTOM_EPG_URLS) {
        const isLocal = !url.startsWith('http');

        if (isLocal && !fs.existsSync(url)) {
          console.error(`[EPG] Source file not found: ${url}`);
          console.error('[EPG] Place a valid XMLTV .xml file at the path above, or update CUSTOM_EPG_URLS in server.js');
          continue;
        }

        console.log(`[EPG] Spawning SAX worker to parse: ${url} (this may take 1-3 minutes for large files)`);
        try {
          await spawnEpgWorker(url);
          // spawnEpgWorker's 'done' handler already reloaded the cache and broadcast SSE.
          break; // Successfully parsed the first working URL
        } catch (workerErr) {
          console.error(`[EPG] Worker failed for ${url}:`, workerErr.message);
        }
      }

      epgFetchPromise = null;
      return cachedCustomEpg;
    })();

    return epgFetchPromise;
  } catch (error) {
    epgFetchPromise = null;
    console.error('[EPG] Fatal error in fetchAndParseCustomEpg:', error.message);
    return null;
  }
};


// Delay the background fetch by 15 seconds on boot.
// This prevents the massive XML parsing from blocking the Node.js event loop
// NOTE: The background EPG fetch on boot is now handled by the SSE-aware setTimeout
// near app.listen at the bottom of this file. It fetches AND broadcasts epg_updated when done.

// Helper to clean channel names robustly
const cleanChannelName = (name) => {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/^(ca|usa|us|uk|gb)\s*/i, '')
    .replace(/(\s*(east|west|lhd|fhd|uhd|hd|sd|4k|raw))+$/i, '')
    .replace(/[^a-z0-9]/g, '');
};

/**
 * 2-gram Jaccard similarity between two strings (0 = no overlap, 1 = identical).
 *
 * WHY: The previous EPG fuzzy matcher used:
 *   Math.min(a.length, b.length) / Math.max(a.length, b.length)
 * This measures STRING LENGTH RATIO, not character similarity.
 * Two completely different strings of equal length (e.g. "fox" vs "cbs") score 1.0.
 * Jaccard checks actual character n-gram overlap — "espn" vs "espn2" share the
 * bigrams 'es','sp','pn' out of 5 total = 0.6, correctly identifying partial match.
 * "fox" vs "cbs" share 0 bigrams = 0.0, correctly rejecting the false match.
 */
const jaccardSim = (a, b) => {
  if (a === b) return 1;
  if (!a || !b || a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const bigrams = (s) => {
    const result = new Set();
    for (let i = 0; i < s.length - 1; i++) result.add(s.slice(i, i + 2));
    return result;
  };
  const biA = bigrams(a), biB = bigrams(b);
  let intersection = 0;
  for (const g of biA) { if (biB.has(g)) intersection++; }
  const union = biA.size + biB.size - intersection;
  return union === 0 ? 0 : intersection / union;
};
app.get('/api/custom-epg/keys', async (req, res) => {
  if (!cachedCustomEpg || !cachedCustomEpg.channelMap) {
    return res.json({ keys: [] });
  }
  res.json({ keys: Object.keys(cachedCustomEpg.channelMap) });
});

// 2. Proxy EPG (Bulk)
app.post('/api/custom-epg/bulk', express.json({ limit: '50mb' }), async (req, res) => {
  const channels = req.body.channels || [];
  if (!channels.length) return res.json({ epg_listings: {} });

  const isDownloading = !!epgFetchPromise;
  let epgData = cachedCustomEpg;

  if (!epgData || !epgData.channelMap) {
    if (isDownloading) {
      return res.json({ epg_listings: {}, status: 'downloading_in_background' });
    }
    epgData = await fetchAndParseCustomEpg();
    if (!epgData || !epgData.channelMap) {
      return res.json({ epg_listings: {} });
    }
  }

  const result = {};
  
  // XMLTV time parser
  const parseTime = (tStr) => {
    if (!tStr) return { str: '', ts: 0 };
    const match = tStr.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
    if (match) {
      const date = new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`);
      return {
        str: date.toISOString().replace('T', ' ').substring(0, 19),
        ts: Math.floor(date.getTime() / 1000)
      };
    }
    return { str: '', ts: 0 };
  };

  const extractText = (field) => {
    if (!field) return '';
    if (typeof field === 'string') return field;
    if (typeof field === 'number') return String(field);
    const item = Array.isArray(field) ? field[0] : field;
    if (typeof item === 'string') return item;
    if (typeof item === 'number') return String(item);
    if (typeof item === 'object') {
      return item['#text'] || item['text'] || Object.values(item).find(v => typeof v === 'string' && !v.startsWith('@_')) || '';
    }
    return '';
  };

  for (const c of channels) {
    const channelName = c.name;
    if (!channelName) continue;

    let matchedChannelId = null;

    // Tier 1: Check fuzzyMatchCache (manually curated mappings from EPG Editor)
    if (fuzzyMatchCache[channelName]) {
      matchedChannelId = fuzzyMatchCache[channelName];
    } else if (fuzzyMatchCache[channelName.trim()]) {
      matchedChannelId = fuzzyMatchCache[channelName.trim()];
    }

    // Tier 2: Direct epg_channel_id match (provider already told us the ID)
    if (!matchedChannelId && c.epg_channel_id) {
      if (epgData.programsByChannel && epgData.programsByChannel[c.epg_channel_id]) {
        matchedChannelId = c.epg_channel_id;
      }
    }

    // Tier 3: Fuzzy Jaccard match against channelMap keys
    if (!matchedChannelId) {
      const cleaned = cleanChannelName(channelName);
      if (cleaned.length >= 2) {
        let bestScore = 0;
        let bestId = null;
        for (const [key, ids] of Object.entries(epgData.channelMap)) {
          const score = jaccardSim(cleaned, key);
          if (score > bestScore) {
            bestScore = score;
            bestId = ids[0];
          }
        }
        if (bestScore >= 0.6 && bestId) {
          matchedChannelId = bestId;
        }
      }
    }

    if (matchedChannelId && epgData.programsByChannel && epgData.programsByChannel[matchedChannelId]) {
      const rawPrograms = epgData.programsByChannel[matchedChannelId];
      result[c.id] = rawPrograms.map(p => {
        // Programs from epgWorker are already pre-parsed:
        // { title, desc, start_str, stop_str, start_ts, stop_ts }
        const title = String(p.title || 'Unknown Program');
        const desc = String(p.desc || '');
        const startTs = p.start_ts || 0;
        const stopTs = p.stop_ts || 0;

        return {
          id: `custom_${c.id}_${startTs}`,  // include channel id to prevent Dexie key collisions
          epg_id: matchedChannelId,
          title: Buffer.from(title).toString('base64'),
          lang: "",
          start: p.start_str || '',
          end: p.stop_str || '',
          description: Buffer.from(desc).toString('base64'),
          channel_id: String(c.id),          // always use stream_id so Dexie lookup matches
          start_timestamp: startTs.toString(),
          stop_timestamp: stopTs.toString()
        };
      });
    } else {
      result[c.id] = [];
    }
  }

  res.json({ epg_listings: result, status: isDownloading ? 'downloading_in_background' : 'complete' });
});

// 3. Proxy EPG (Single)
app.get('/api/custom-epg', async (req, res) => {
  const channelName = req.query.name;
  const epgId = req.query.id;
  if (!channelName) return res.json({ epg_listings: [] });

  // Anti-Deadlock: If the proxy is currently downloading the massive XML files,
  // do NOT wait for it. Waiting holds the HTTP socket hostage, which exhausts 
  // Chromium's 6-connection pool and completely blocks the native EPG requests.
  if (epgFetchPromise) {
    return res.json({ epg_listings: [], status: 'downloading_in_background' });
  }

  const epgData = await fetchAndParseCustomEpg();
  if (!epgData || !epgData.channelMap) {
    return res.json({ epg_listings: [] });
  }

  let matchedChannelId = null;

  // Tier 1: fuzzyMatchCache (manually curated mappings)
  if (fuzzyMatchCache[channelName]) {
    matchedChannelId = fuzzyMatchCache[channelName];
  } else if (fuzzyMatchCache[channelName.trim()]) {
    matchedChannelId = fuzzyMatchCache[channelName.trim()];
  }

  // Tier 2: Direct epg_channel_id
  if (!matchedChannelId && epgId) {
    if (epgData.programsByChannel && epgData.programsByChannel[epgId]) {
      matchedChannelId = epgId;
    }
  }

  // Tier 3: Jaccard fuzzy match
  if (!matchedChannelId) {
    const cleaned = cleanChannelName(channelName);
    if (cleaned.length >= 2) {
      let bestScore = 0;
      let bestId = null;
      for (const [key, ids] of Object.entries(epgData.channelMap)) {
        const score = jaccardSim(cleaned, key);
        if (score > bestScore) { bestScore = score; bestId = ids[0]; }
      }
      if (bestScore >= 0.6 && bestId) matchedChannelId = bestId;
    }
  }

  if (!matchedChannelId) {
    return res.json({ epg_listings: [] });
  }

  // Extract programs from programsByChannel (keyed object)
  const rawListings = (epgData.programsByChannel && epgData.programsByChannel[matchedChannelId]) || [];
  const listings = rawListings.map(p => {
    // Programs from epgWorker are already pre-parsed:
    // { title, desc, start_str, stop_str, start_ts, stop_ts }
    const title = String(p.title || 'Unknown Program');
    const desc = String(p.desc || '');
    const startTs = p.start_ts || 0;
    const stopTs = p.stop_ts || 0;

    return {
      id: `custom_${startTs}`,
      epg_id: matchedChannelId,
      title: Buffer.from(title).toString('base64'),
      lang: "",
      start: p.start_str || '',
      end: p.stop_str || '',
      description: Buffer.from(desc).toString('base64'),
      channel_id: matchedChannelId,
      start_timestamp: startTs.toString(),
      stop_timestamp: stopTs.toString()
    };
  });

  res.json({ epg_listings: listings });
});
// --- End Custom EPG Engine ---

// --- SSE: EPG Hot-Reload Event Stream ---
// The frontend subscribes to this on startup. When the background EPG fetch finishes,
// we broadcast 'epg_updated' so clients can reload their EPG data without polling.
// Note: epgSseClients Set is declared above (near line 1000) to avoid hoisting issues.

app.get('/api/epg/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Send a heartbeat immediately so the client knows we're alive
  res.write('data: {"event":"connected"}\n\n');

  epgSseClients.add(res);

  // Heartbeat every 25s to prevent proxy/firewall timeout
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch (e) { /* ignore */ }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    epgSseClients.delete(res);
  });
});

// Clear-cache endpoint (called by the "Force EPG Update" button in Settings)
app.post('/api/custom-epg/clear-cache', (req, res) => {
  try {
    cachedCustomEpg = null;
    customEpgLastFetch = 0;
    if (fs.existsSync(EPG_CACHE_FILE)) {
      fs.unlinkSync(EPG_CACHE_FILE);
    }
    console.log('[EPG Cache] Cache cleared by user request.');
    res.json({ success: true, message: 'EPG cache cleared. Reload the app to re-fetch.' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Boot-time EPG fetch:
// If cache was already loaded from disk (fresh hit), broadcast immediately.
// Otherwise spawn the SAX worker in the background (non-blocking).
setTimeout(async () => {
  if (cachedCustomEpg && Object.keys(cachedCustomEpg.channelMap || {}).length > 0) {
    console.log('[EPG Boot] Fresh cache found on disk — broadcasting immediately.');
    broadcastEpgUpdated();
    return;
  }

  console.log('[EPG Boot] No fresh cache found. Starting background SAX parse (may take 1-3 min for 600MB+ files)...');
  try {
    await fetchAndParseCustomEpg();
    if (cachedCustomEpg && Object.keys(cachedCustomEpg.channelMap || {}).length > 0) {
      broadcastEpgUpdated();
    } else {
      console.error('[EPG Boot] Parse completed but cache is still empty. Check EPG source file path and format.');
    }
  } catch (e) {
    console.error('[EPG Boot] Background fetch error:', e.message);
  }
}, 5000); // Start after 5s instead of 15s — cache check is instant if fresh

app.listen(port, () => {
  console.log(`Backend proxy running on http://localhost:${port}`);
});
