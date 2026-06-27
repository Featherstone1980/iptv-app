const { workerData, parentPort } = require('worker_threads');
const fs = require('fs');
const sax = require('sax');
const zlib = require('zlib');
const path = require('path');
const axios = require('axios');

const url = workerData.url;
const CACHE_FILE = path.join(__dirname, 'epg_cache.json');

const channelMap = {};
const programsByChannel = {};

let totalPrograms = 0;
let newProgramsBatch = {};
let batchCounter = 0;

// Helper to clean names for fuzzy matching
const cleanName = (name) => name ? name.toLowerCase().replace(/[^a-z0-9]/g, '') : '';

const parseXmlTime = (str) => {
  if (!str) return 0;
  try {
    const parts = str.trim().split(' ');
    const dt = parts[0];
    let tz = parts[1] || '+0000';
    if (tz.length === 5) tz = tz.substring(0,3) + ':' + tz.substring(3,5); // +0000 -> +00:00
    if (dt.length >= 14) {
      const iso = `${dt.substring(0,4)}-${dt.substring(4,6)}-${dt.substring(6,8)}T${dt.substring(8,10)}:${dt.substring(10,12)}:${dt.substring(12,14)}${tz}`;
      return new Date(iso).getTime() || 0;
    }
  } catch(e) {}
  return 0;
};

const run = async () => {
  try {
    let stream;
    const isLocal = !url.startsWith('http');
    
    if (isLocal) {
      stream = fs.createReadStream(url);
    } else {
      const res = await axios({ method: 'get', url: url, responseType: 'stream' });
      stream = res.data;
    }

    if (url.endsWith('.gz')) {
      stream = stream.pipe(zlib.createGunzip());
    }

    const parser = sax.createStream(true, { trim: true });

    let currentTag = null;
    let currentChannel = null;
    let currentProgram = null;
    let textBuffer = '';

    parser.on('opentag', (node) => {
      currentTag = node.name;
      if (node.name === 'channel') {
        currentChannel = { id: node.attributes.id, names: [] };
      } else if (node.name === 'programme') {
        currentProgram = {
          '@_channel': node.attributes.channel,
          '@_start': node.attributes.start,
          '@_stop': node.attributes.stop,
          title: '',
          desc: ''
        };
      }
      textBuffer = '';
    });

    parser.on('text', (text) => {
      textBuffer += text;
    });
    
    parser.on('cdata', (text) => {
      textBuffer += text;
    });

    parser.on('closetag', (tagName) => {
      if (tagName === 'channel' && currentChannel) {
        currentChannel.names.forEach(name => {
          const cleaned = cleanName(name);
          if (cleaned) {
            if (!channelMap[cleaned]) channelMap[cleaned] = [];
            if (!channelMap[cleaned].includes(currentChannel.id)) {
              channelMap[cleaned].push(currentChannel.id);
            }
          }
        });
        currentChannel = null;
      } else if (tagName === 'display-name' && currentChannel) {
        currentChannel.names.push(textBuffer.trim());
      } else if (tagName === 'programme' && currentProgram) {
        const cid = currentProgram['@_channel'];
        if (!programsByChannel[cid]) programsByChannel[cid] = [];
        
        const progNode = {
          title: currentProgram.title,
          desc: currentProgram.desc,
          start_str: currentProgram['@_start'],
          stop_str: currentProgram['@_stop'],
          start_ts: parseXmlTime(currentProgram['@_start']),
          stop_ts: parseXmlTime(currentProgram['@_stop'])
        };
        
        programsByChannel[cid].push(progNode);
        
        if (!newProgramsBatch[cid]) newProgramsBatch[cid] = [];
        newProgramsBatch[cid].push(progNode);
        
        totalPrograms++;
        batchCounter++;
        
        // Push batch to parent thread every 10k programs
        if (batchCounter >= 10000) {
          parentPort.postMessage({
            type: 'batch',
            channelMap: channelMap, // Send the full map each time so the frontend can match early
            newPrograms: newProgramsBatch
          });
          newProgramsBatch = {};
          batchCounter = 0;
        }
        
        currentProgram = null;
      } else if (tagName === 'title' && currentProgram) {
        currentProgram.title = textBuffer.trim();
      } else if (tagName === 'desc' && currentProgram) {
        currentProgram.desc = textBuffer.trim();
      }
    });

    parser.on('end', () => {
      // Send final batch
      if (batchCounter > 0) {
         parentPort.postMessage({
            type: 'batch',
            channelMap: channelMap,
            newPrograms: newProgramsBatch
          });
      }
      
      // Save cache to disk
      try {
        fs.writeFileSync(CACHE_FILE, JSON.stringify({
          channelMap: channelMap,
          programsByChannel: programsByChannel,
          timestamp: Date.now()
        }));
      } catch(e) { }

      parentPort.postMessage({ type: 'done' });
    });

    parser.on('error', (err) => {
      parentPort.postMessage({ type: 'error', error: err.message });
    });

    stream.pipe(parser);

  } catch (err) {
    parentPort.postMessage({ type: 'error', error: err.message });
  }
};

run();
