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

var stillUnmapped = [];
data.unmapped.forEach(ch => {
    const cleanedTarget = cleanChannelName(ch.name);
    
    // Check Pass 1 Exact
    if(communityEpgCache.channelMap[cleanedTarget]) return;
    
    // Check Pass 1b Callsign
    const callsignRegex = /\b([CKWX][A-Z0-9]{2,3})\b|\(([CKWX][A-Z0-9]{2,3})\)/gi;
    const callsignMatch = [...ch.name.matchAll(callsignRegex)];
    if(callsignMatch.some(m => communityEpgCache.callsignMap[(m[1]||m[2]).toLowerCase()])) return;
    
    // Check Pass 1.5 Substring (basic simulation)
    let found = false;
    for (const [epgCleaned, ids] of Object.entries(communityEpgCache.channelMap)) {
        if (cleanedTarget.length >= 5 && epgCleaned.length >= 5 && (cleanedTarget.includes(epgCleaned) || epgCleaned.includes(cleanedTarget))) {
            found = true;
            break;
        }
    }
    if (found) return;

    stillUnmapped.push(ch.name);
});

console.log('Total Still Unmapped:', stillUnmapped.length);

const categories = {
    SPORTS: 0,
    NEWS: 0,
    LOCAL: 0,
    PPV: 0,
    INTERNATIONAL: 0,
    MUSIC: 0,
    OTHER: 0
};

const topList = [];

stillUnmapped.forEach(name => {
    let upper = name.toUpperCase();
    if (upper.includes('SPORT') || upper.includes('ESPN') || upper.includes('NFL') || upper.includes('NBA') || upper.includes('MLB') || upper.includes('NHL') || upper.includes('BEIN') || upper.includes('FIGHT') || upper.includes('GOLF') || upper.includes('TENNIS')) categories.SPORTS++;
    else if (upper.includes('NEWS') || upper.includes('CNN') || upper.includes('MSNBC') || upper.includes('FOX') || upper.includes('WEATHER')) categories.NEWS++;
    else if (upper.includes('LOCAL') || upper.match(/\b([KW][A-Z]{3})\b/) || upper.match(/\b([A-Z]{2}\s*\|\s*[A-Za-z]+)\b/)) categories.LOCAL++;
    else if (upper.includes('PPV') || upper.includes('TICKET') || upper.includes('PASS') || upper.includes('BOX OFFICE')) categories.PPV++;
    else if (upper.match(/^(UK|CA|AU|MX|ZA|IN|FR|IT|ES|DE|LATIN|SPANISH)\b/)) categories.INTERNATIONAL++;
    else if (upper.includes('MUSIC') || upper.includes('RADIO') || upper.includes('RAP ') || upper.includes('ROCK ')) categories.MUSIC++;
    else categories.OTHER++;
});

console.log(categories);
console.log('\nSample Unmapped Channels:');
console.log(stillUnmapped.slice(0, 100).join('\n'));
