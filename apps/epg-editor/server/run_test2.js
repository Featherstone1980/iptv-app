const fs = require('fs');

let serverCode = fs.readFileSync('server.js', 'utf8');

serverCode = serverCode.replace(/const /g, 'var ').replace(/let /g, 'var ');

const startIdx = serverCode.indexOf('var cleanChannelName');
const endIdx = serverCode.indexOf('app.post(');
const evalCode = serverCode.substring(startIdx, endIdx);
eval(evalCode);

const data = JSON.parse(fs.readFileSync('diagnostic_data.json', 'utf8'));

var communityEpgCache = { channels: [], channelMap: {}, channelIdMap: {}, coreIdMap: {}, callsignMap: {} };

data.epgDb.forEach(epg => {
    const id = epg['@_id'];
    var displayNames = [];
    if (Array.isArray(epg['display-name'])) {
        displayNames = epg['display-name'].map(dn => typeof dn === 'object' ? dn['#text'] : dn);
    } else if (epg['display-name']) {
        displayNames = [typeof epg['display-name'] === 'object' ? epg['display-name']['#text'] : epg['display-name']];
    }
    
    communityEpgCache.channelIdMap[id.toLowerCase()] = id; // IMPORTANT
    
    displayNames.forEach(dn => {
        if (dn) {
            const cleaned = cleanChannelName(String(dn));
            if (!communityEpgCache.channelMap[cleaned]) communityEpgCache.channelMap[cleaned] = [];
            communityEpgCache.channelMap[cleaned].push(id);
        }
    });

    const callsign = getCallsignId(id);
    if (callsign && callsign.length >= 3) {
        communityEpgCache.callsignMap[callsign] = id;
    }
});

var mappings = {};
var ch = data.unmapped.find(c => c.name.includes('CHEK'));

if (ch) {
    var detectedCountry = ch.name.match(/^(USA?|UK|CA|CANADA|AU|AUSTRALIA|NZ|IE|ZA|MX|BR|IN|FR|DE|ES|IT|NL|PT|PL|RU|TR|AR|SA|AE|EG|PK)\b/i);
    detectedCountry = detectedCountry ? detectedCountry[1].toLowerCase() : null;
    if (detectedCountry === 'canada') detectedCountry = 'ca';

    const originalUpper = cleanChannelName(ch.name);
    const callsignMatch = ch.name.match(/\b([CKWX][A-Z0-9]{2,3})\b|\(([CKWX][A-Z0-9]{2,3})\)/i);
    
    if (callsignMatch) {
        const extractedCallsign = (callsignMatch[1] || callsignMatch[2]).toLowerCase();
        if (communityEpgCache.callsignMap[extractedCallsign]) {
            const targetId = communityEpgCache.callsignMap[extractedCallsign];
            mappings[ch.id] = targetId;
        }
    }
    
    console.log("CHEK initial map:", mappings[ch.id]);

    const targetId = mappings[ch.id];
    if (targetId && !communityEpgCache.channelIdMap[targetId.toLowerCase()]) {
        console.log("CHEK WAS DROPPED BECAUSE channelIdMap DOES NOT HAVE:", targetId.toLowerCase());
    } else {
        console.log("CHEK is successfully mapped in cache validation!");
    }
}
