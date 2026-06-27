const fs = require('fs');
const path = require('path');
const sax = require('sax');

// Configuration
const EPG_FILE = process.env.EPG_FILE || 'my_epg.xml';
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(__dirname, '..', 'public', 'epg_data');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log(`Processing ${EPG_FILE} into ${OUTPUT_DIR}...`);

const stream = fs.createReadStream(EPG_FILE, { encoding: 'utf8' });
const parser = sax.createStream(true, { trim: true });

let currentTag = null;
let currentProgram = null;
let currentChannelId = null;
const channelsEpg = {}; 
const displayNamesMap = {};

const encodeBase64 = (str) => {
  return Buffer.from(str || '').toString('base64');
};

const flushChannel = (channelId) => {
  if (channelsEpg[channelId]) {
    const file = path.join(OUTPUT_DIR, `${channelId}.json`);
    let existing = [];
    if (fs.existsSync(file)) {
      try {
        existing = JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch (e) {}
    }
    existing.push(...channelsEpg[channelId]);
    fs.writeFileSync(file, JSON.stringify(existing));
    delete channelsEpg[channelId];
  }
};

let programCount = 0;

parser.on('opentag', (node) => {
  currentTag = node.name;
  if (node.name === 'channel') {
    currentChannelId = node.attributes.id;
  } else if (node.name === 'programme') {
    currentProgram = {
      channel: node.attributes.channel,
      start: node.attributes.start,
      stop: node.attributes.stop,
      title: '',
      desc: '',
      icon: null
    };
  } else if (node.name === 'icon' && currentProgram) {
    currentProgram.icon = node.attributes.src;
  }
});

parser.on('closetag', (tagName) => {
  currentTag = null;
});

parser.on('text', (text) => {
  const trimmed = text.trim();
  if (currentTag === 'display-name' && currentChannelId && trimmed) {
    displayNamesMap[trimmed] = currentChannelId;
  }
  if (!currentProgram) return;
  if (currentTag === 'title') {
    currentProgram.title += text;
  } else if (currentTag === 'desc') {
    currentProgram.desc += text;
  }
});

parser.on('closetag', (tagName) => {
  if (tagName === 'programme' && currentProgram) {
    const channelId = currentProgram.channel;
    if (!channelsEpg[channelId]) {
      channelsEpg[channelId] = [];
    }
    
    // Convert XMLTV date (e.g. 20240321123000 +0000) to Unix Timestamp
    let startTs = 0;
    let stopTs = 0;
    
    const parseXmlTvDate = (dateStr) => {
      if (!dateStr) return 0;
      const match = dateStr.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
      if (match) {
        const d = new Date(Date.UTC(match[1], match[2]-1, match[3], match[4], match[5], match[6]));
        return d.getTime();
      }
      return 0;
    };
    
    startTs = parseXmlTvDate(currentProgram.start);
    stopTs = parseXmlTvDate(currentProgram.stop);

    channelsEpg[channelId].push({
      start_ts: startTs,
      stop_ts: stopTs,
      title: encodeBase64(currentProgram.title.trim()),
      description: encodeBase64(currentProgram.desc.trim())
    });

    programCount++;
    if (channelsEpg[channelId].length > 100) {
      flushChannel(channelId);
    }
    currentProgram = null;
  }
});

parser.on('end', () => {
  for (const channelId in channelsEpg) {
    flushChannel(channelId);
  }
  
  // Create an index file (optional but helpful)
  const files = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.json'));
  const channelNames = files.map(f => f.replace('.json', ''));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'index.json'), JSON.stringify(channelNames));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'display_names.json'), JSON.stringify(displayNamesMap));
  
  // Copy manual_overrides.json if it exists
  const overridesPath = path.join(__dirname, '../apps/epg-editor/server/manual_overrides.json');
  if (fs.existsSync(overridesPath)) {
    fs.copyFileSync(overridesPath, path.join(OUTPUT_DIR, 'manual_overrides.json'));
    console.log('Copied manual_overrides.json to output directory.');
  }

  console.log(`Successfully processed ${programCount} programs into ${files.length} channel files.`);
});

parser.on('error', (err) => {
  console.error('Error parsing XML:', err);
});

stream.pipe(parser);
