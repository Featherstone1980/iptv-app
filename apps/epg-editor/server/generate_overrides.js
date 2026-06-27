const fs = require('fs');
const path = require('path');

const diagPath = 'c:/Users/Shane/Desktop/Snarky Moose 2026/IPTV app/apps/epg-editor/diagnostic-report.json';
const overridesPath = 'c:/Users/Shane/Desktop/Snarky Moose 2026/IPTV app/apps/epg-editor/server/manual_overrides.json';

let diagData;
try {
    diagData = JSON.parse(fs.readFileSync(diagPath, 'utf8'));
} catch(e) {
    console.error('Failed to read diagnostic data:', e);
    process.exit(1);
}

let overrides = {};
try {
    overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
} catch(e) {}

let newOverridesAdded = 0;

const addOverride = (tvgId, name, mappedTo) => {
    const key = tvgId || name;
    if (!key) return; 
    if (!overrides[key]) {
        overrides[key] = mappedTo;
        newOverridesAdded++;
        console.log(`Mapping ${name} (${key}) -> ${mappedTo}`);
    }
};

        // 1. Fix Suspicious matches
        diagData.matched.forEach(m => {
            const name = m.name.toLowerCase();
            const original = m.originalTvgId;
            if (!original) return;
            
            if (name.includes('weather channel') && m.mappedTo.toLowerCase().includes('dummy')) {
                addOverride(original, m.name, "WEATHER.dummy.us");
            }
            if (name.includes('mav.tv') || name.includes('mav tv') || name.includes('mavtv')) {
                addOverride(original, m.name, "Sports.Dummy.us");
            }
            if (name.includes('metv')) {
                addOverride(original, m.name, "MeTV.us2");
            }
            if (name.includes('ewtn') && m.mappedTo.toLowerCase().includes('español')) {
                addOverride(original, m.name, "EWTN.us2"); // EWTN english
            }
        });

        // 2. Fix Unmatched
        diagData.unmatched.forEach(u => {
            const name = u.name.toLowerCase();
            const original = u.originalTvgId;

            if (name.match(/\bmlb\b/)) addOverride(original, u.name, "MLB.Baseball.Dummy.us");
            else if (name.match(/\bnba\b/)) addOverride(original, u.name, "NBA.Basketball.Dummy.us");
            else if (name.match(/\bnhl\b/)) addOverride(original, u.name, "NHL.Hockey.Dummy.us");
            else if (name.match(/\bnfl\b/)) addOverride(original, u.name, "NFL.Dummy.us");
            else if (name.match(/\bncaaf\b/)) addOverride(original, u.name, "NCAA.Football.Dummy.us");
            else if (name.match(/\bppv\b|\boxx\b|\badult\b/)) addOverride(original, u.name, "PPV.EVENTS.Dummy.us");
            else if (name.includes('soccer') || name.includes('fifa')) addOverride(original, u.name, "Soccer.Dummy.us");
            else if (name.includes('tennis')) addOverride(original, u.name, "Tennis.Dummy.us");
            else if (name.match(/\bbasketball\b/)) addOverride(original, u.name, "Basketball.Dummy.us");
            else if (name.match(/\bbaseball\b/)) addOverride(original, u.name, "Baseball.Dummy.us");
            else if (name.match(/\bfootball\b/)) addOverride(original, u.name, "Football.Dummy.us");
            else if (name.match(/\bnews\b/)) addOverride(original, u.name, "NEWS.dummy.us");
            else if (name.includes('espn+')) addOverride(original, u.name, "ESPN+.Dummy.us");
            else if (name.includes('sportsnet')) addOverride(original, u.name, "Sportsnet+.Dummy.us");
            else if (name.includes('redbull')) addOverride(original, u.name, "Redbull.Dummy.us");
        });

        fs.writeFileSync(overridesPath, JSON.stringify(overrides, null, 2));
        console.log(`Added ${newOverridesAdded} new overrides.`);

