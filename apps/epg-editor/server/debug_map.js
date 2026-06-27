const fs = require('fs');

const code = fs.readFileSync('server.js', 'utf8');

// We need to extract the functions: getCallsignId, cleanChannelName, getEpgCountry
const getEpgCountryRegex = /const getEpgCountry = \([^)]*\) => \{[\s\S]*?\n\};/m;
const getCallsignIdRegex = /const getCallsignId = \([^)]*\) => \{[\s\S]*?\n\};/m;
const cleanChannelNameRegex = /const cleanChannelName = \([^)]*\) => \{[\s\S]*?\n\};/m;

const getEpgCountryFunc = code.match(getEpgCountryRegex)[0];
const getCallsignIdFunc = code.match(getCallsignIdRegex)[0];
const cleanChannelNameFunc = code.match(cleanChannelNameRegex)[0];

eval(getEpgCountryFunc);
eval(getCallsignIdFunc);
eval(cleanChannelNameFunc);

console.log("Global BC CA test:", cleanChannelName('CA Global News Vancouver'));
console.log("Global BC test:", cleanChannelName('Global BC'));
console.log("USA Network test:", cleanChannelName('USA Network'));
console.log("UK Gold test:", cleanChannelName('UK Gold'));

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

console.log("Does channelMap have GLOBALBC?", !!channelMap['GLOBALBC']);
if (channelMap['GLOBALBC']) {
    console.log("GLOBALBC ids:", channelMap['GLOBALBC']);
}

const chekUnmapped = data.unmapped.find(c => c.name === 'CA CHEK News');
if (chekUnmapped) {
    const name = chekUnmapped.name;
    console.log("CHEK Unmapped found:", name);
    const callsignMatch = name.match(/\b([CKWX][A-Z0-9]{2,3})\b|\(([CKWX][A-Z0-9]{2,3})\)/i);
    if (callsignMatch) {
        const ext = (callsignMatch[1] || callsignMatch[2]).toLowerCase();
        console.log("Extracted callsign:", ext);
        console.log("Is callsign in callsignMap?", !!callsignMap[ext]);
        if (callsignMap[ext]) console.log("Target ID:", callsignMap[ext]);
    } else {
        console.log("Regex failed to match callsign on", name);
    }
}
