const fs = require('fs');

let serverCode = fs.readFileSync('server.js', 'utf8');

// Extract getEpgCountry, getCoreId, getCallsignId, cleanChannelName
const startIdx = serverCode.indexOf('const getEpgCountry');
const endIdx = serverCode.indexOf('const parser = new XMLParser');
const evalCode = serverCode.substring(startIdx, endIdx);
eval(evalCode);

const data = JSON.parse(fs.readFileSync('diagnostic_data.json', 'utf8'));

let channelMap = {};
let callsignMap = {};

data.epgDb.forEach(epg => {
    const id = epg['@_id'];
    let displayNames = [];
    if (Array.isArray(epg['display-name'])) {
        displayNames = epg['display-name'].map(dn => typeof dn === 'object' ? dn['#text'] : dn);
    } else if (epg['display-name']) {
        displayNames = [typeof epg['display-name'] === 'object' ? epg['display-name']['#text'] : epg['display-name']];
    }
    
    displayNames.forEach(dn => {
        if (dn) {
            const cleaned = cleanChannelName(String(dn));
            if (!channelMap[cleaned]) channelMap[cleaned] = [];
            channelMap[cleaned].push(id);
        }
    });

    const callsign = getCallsignId(id);
    if (callsign && callsign.length >= 3) {
        callsignMap[callsign] = id;
    }
});

console.log('EPG GLOBALBC targets:', channelMap['GLOBALBC']);
console.log('EPG chek target:', callsignMap['chek']);

const globalCh = data.unmapped.find(c => c.name.includes('Global News Vancouver'));
if (globalCh) {
    const originalUpper = cleanChannelName(globalCh.name);
    console.log('Global Original Cleaned:', originalUpper, 'Matched in Pass 1:', !!channelMap[originalUpper]);
}

const chekCh = data.unmapped.find(c => c.name.includes('CHEK'));
if (chekCh) {
    console.log('CHEK ch.name:', chekCh.name);
    const callsignMatch = chekCh.name.match(/\b([CKWX][A-Z0-9]{2,3})\b|\(([CKWX][A-Z0-9]{2,3})\)/i);
    const extractedCallsign = callsignMatch ? (callsignMatch[1] || callsignMatch[2]).toLowerCase() : null;
    console.log('CHEK Extracted Callsign:', extractedCallsign, 'Matched in Pass 1b:', !!callsignMap[extractedCallsign]);
}
