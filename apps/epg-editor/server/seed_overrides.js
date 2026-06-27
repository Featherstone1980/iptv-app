const fs = require('fs');
const data = JSON.parse(fs.readFileSync('diagnostic_data.json', 'utf8'));

const HV = ['SPORTS', 'ESPN', 'NFL', 'NBA', 'MLB', 'NHL', 'BEIN', 'FIGHT', 'GOLF', 'TENNIS', 'NEWS', 'CNN', 'MSNBC', 'FOX', 'WEATHER', 'LOCAL', 'CW', 'ABC', 'NBC', 'CBS', 'PBS'];

const isHighValue = (name) => {
    let upper = name.toUpperCase();
    return HV.some(kw => upper.includes(kw)) || upper.match(/\b([KW][A-Z]{3})\b/);
};

let manualOverrides = {};
if (fs.existsSync('manual_overrides.json')) {
    manualOverrides = JSON.parse(fs.readFileSync('manual_overrides.json', 'utf8'));
}

let seedCount = 0;

data.unmapped.forEach(ch => {
    if (isHighValue(ch.name) && !manualOverrides[ch.name]) {
        const words = ch.name.replace(/[^a-zA-Z0-9]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !['USA', 'UK', 'CA', 'AU', 'HD', 'FHD', 'NET', 'NETWORK', 'CHANNEL', 'THE'].includes(w.toUpperCase()));
        
        let bestMatch = null;
        let maxMatches = 0;
        
        data.epgDb.forEach(epg => {
            const id = epg['@_id'] || '';
            const epgLower = id.toLowerCase();
            
            let matches = 0;
            words.forEach(w => {
                if (epgLower.includes(w.toLowerCase())) matches++;
            });
            
            if (matches > 0 && matches > maxMatches) {
                if (matches >= 2 || (matches === 1 && words.some(wd => wd.length === 4 && wd.match(/^[KW][A-Z]{3}$/i)))) {
                    maxMatches = matches;
                    bestMatch = id;
                }
            }
        });
        
        if (bestMatch) {
            manualOverrides[ch.name] = bestMatch.split('.')[0];
            seedCount++;
        }
    }
});

fs.writeFileSync('manual_overrides.json', JSON.stringify(manualOverrides, null, 2));
console.log('Successfully seeded ' + seedCount + ' High-Value channels!');

