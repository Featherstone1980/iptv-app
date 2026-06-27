const fs = require('fs');
let serverCode = fs.readFileSync('server.js', 'utf8');
serverCode = serverCode.replace(/const /g, 'var ').replace(/let /g, 'var ');
const evalCode = serverCode.substring(serverCode.indexOf('var cleanChannelName'), serverCode.indexOf('app.post('));
eval(evalCode);

const data = JSON.parse(fs.readFileSync('diagnostic_data.json', 'utf8'));
var communityEpgCache = { channels: [], channelMap: {}, channelIdMap: {}, coreIdMap: {}, callsignMap: {} };

data.epgDb.forEach(epg => {
    const id = epg['@_id'];
    var displayNames = [];
    if (Array.isArray(epg['display-name'])) displayNames = epg['display-name'].map(dn => typeof dn === 'object' ? dn['#text'] : dn);
    else if (epg['display-name']) displayNames = [typeof epg['display-name'] === 'object' ? epg['display-name']['#text'] : epg['display-name']];
    
    communityEpgCache.channelIdMap[id.toLowerCase()] = id;
    
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

var newlyMatched = [];
data.unmapped.forEach(ch => {
    const cleanedTarget = cleanChannelName(ch.name);
    
    let matchedId = null;
    let matchType = null;
    
    // Check Pass 1 Exact
    if(communityEpgCache.channelMap[cleanedTarget]) {
        matchedId = communityEpgCache.channelMap[cleanedTarget][0];
        matchType = 'Pass 1 Exact';
    } else {
        // Check Pass 1b Callsign
        const callsignRegex = /\b([CKWX][A-Z0-9]{2,3})\b|\(([CKWX][A-Z0-9]{2,3})\)/gi;
        const callsignMatch = [...ch.name.matchAll(callsignRegex)];
        for (const m of callsignMatch) {
            const cs = (m[1]||m[2]).toLowerCase();
            if (communityEpgCache.callsignMap[cs]) {
                matchedId = communityEpgCache.callsignMap[cs];
                matchType = 'Pass 1b Callsign';
                break;
            }
        }
        
        if (!matchedId) {
            // Check Pass 1.5 Substring (basic simulation)
            let bestOverlap = 0;
            for (const [epgCleaned, ids] of Object.entries(communityEpgCache.channelMap)) {
                if (cleanedTarget.length >= 5 && epgCleaned.length >= 5 && (cleanedTarget.includes(epgCleaned) || epgCleaned.includes(cleanedTarget))) {
                    const overlap = Math.min(cleanedTarget.length, epgCleaned.length);
                    if (overlap > bestOverlap) {
                        bestOverlap = overlap;
                        matchedId = ids[0];
                        matchType = 'Pass 1.5 Substring';
                    }
                }
            }
        }
    }

    if (matchedId) {
        newlyMatched.push({ name: ch.name, matchedId, matchType });
    }
});

console.log('Total newly mapped:', newlyMatched.length);
console.log(JSON.stringify(newlyMatched, null, 2));

