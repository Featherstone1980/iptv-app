const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./diagnostic_data.json', 'utf8'));
const code = fs.readFileSync('server.js', 'utf8');

// Extract all helper functions up to the Express routes
const helpers = code.substring(code.indexOf('const cleanChannelName'), code.indexOf('app.post('));
eval(helpers);

let cache = { channelMap: {}, callsignMap: {} };

data.epgDb.forEach(epg => {
    const id = epg['@_id'];
    const dnArray = Array.isArray(epg['display-name']) ? epg['display-name'] : [epg['display-name']];
    dnArray.forEach(dn => {
        const text = typeof dn === 'object' ? dn['#text'] : dn;
        if (!text) return;
        const clean = cleanChannelName(text);
        if (!cache.channelMap[clean]) cache.channelMap[clean] = [];
        cache.channelMap[clean].push(id);
    });

    const cId = getCallsignId(id);
    if (cId && cId.length >= 3) cache.callsignMap[cId] = id;
});

console.log('EPG GLOBALBC targets:', cache.channelMap['GLOBALBC']);
console.log('EPG chek target:', cache.callsignMap['chek']);

const globalCh = data.unmapped.find(c => c.name.includes('Global News Vancouver'));
if (globalCh) {
    const originalUpper = cleanChannelName(globalCh.name);
    console.log('Global Original Cleaned:', originalUpper, 'Matched in Pass 1:', !!cache.channelMap[originalUpper]);
}

const chekCh = data.unmapped.find(c => c.name.includes('CHEK'));
if (chekCh) {
    const originalUpper = cleanChannelName(chekCh.name);
    const callsignMatch = chekCh.name.match(/\b([CKWX][A-Z0-9]{2,3})\b|\(([CKWX][A-Z0-9]{2,3})\)/i);
    const extractedCallsign = callsignMatch ? (callsignMatch[1] || callsignMatch[2]).toLowerCase() : null;
    console.log('CHEK Extracted Callsign:', extractedCallsign, 'Matched in Pass 1b:', !!cache.callsignMap[extractedCallsign]);
}
