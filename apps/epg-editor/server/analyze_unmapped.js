const fs = require('fs');

const data = JSON.parse(fs.readFileSync('diagnostic_data.json', 'utf8'));
const { unmapped, epgDb } = data;

console.log('Total Unmapped:', unmapped.length);

const categories = {
    SPORTS: 0,
    NEWS: 0,
    LOCAL: 0,
    PPV: 0,
    INTERNATIONAL: 0,
    OTHER: 0
};

const prefixCounts = {};
const unmappedSamples = {};

unmapped.forEach(ch => {
    let name = ch.name.toUpperCase();
    
    // Check categories
    if (name.includes('SPORT') || name.includes('ESPN') || name.includes('NFL') || name.includes('NBA')) categories.SPORTS++;
    else if (name.includes('NEWS') || name.includes('CNN') || name.includes('MSNBC') || name.includes('FOX')) categories.NEWS++;
    else if (name.includes('LOCAL') || name.match(/\b([KW][A-Z]{3})\b/)) categories.LOCAL++;
    else if (name.includes('PPV') || name.includes('TICKET') || name.includes('PASS')) categories.PPV++;
    else if (name.match(/^(UK|CA|AU|MX|ZA|IN|FR)\b/)) categories.INTERNATIONAL++;
    else categories.OTHER++;

    // Count prefixes (first word)
    const firstWord = name.split(/[\s:|-]+/)[0];
    if (firstWord && firstWord.length > 1) {
        prefixCounts[firstWord] = (prefixCounts[firstWord] || 0) + 1;
    }
});

console.log('\n--- Category Breakdown ---');
console.table(categories);

console.log('\n--- Top Prefixes in Unmapped Channels ---');
const sortedPrefixes = Object.entries(prefixCounts).sort((a,b) => b[1] - a[1]).slice(0, 15);
console.table(sortedPrefixes);

// Cross-reference a few Canadian and News channels against the EPG database to see WHY they failed.
console.log('\n--- Diagnosing Sample Failures ---');

const getEpgName = (ch) => {
    if (!ch) return null;
    let name = 'Unknown';
    if (Array.isArray(ch['display-name'])) name = ch['display-name'][0]?.['#text'] || ch['display-name'][0] || name;
    else if (ch['display-name']) name = ch['display-name']?.['#text'] || ch['display-name'];
    return typeof name === 'string' ? name.toUpperCase() : null;
};
const epgNames = epgDb.map(getEpgName).filter(Boolean);

const diagnose = (keyword) => {
    const targets = unmapped.filter(ch => ch.name.toUpperCase().includes(keyword)).slice(0, 3);
    targets.forEach(t => {
        console.log(`\nAnalyzing: "${t.name}"`);
        // Find EPG entries containing similar words
        const words = t.name.toUpperCase().split(/[\s:|-]+/).filter(w => w.length > 3);
        const matches = epgNames.filter(epg => words.some(w => epg.includes(w)));
        if (matches.length > 0) {
            console.log(`  -> Found ${matches.length} partial matches in EPG database.`);
            console.log(`  -> Top 3 EPG candidates:`, matches.slice(0,3));
        } else {
            console.log(`  -> NO MATCHES found in EPG database for any words in "${t.name}". Provider likely has no data.`);
        }
    });
};

diagnose('CANADA');
diagnose('NEWS');
diagnose('HGTV');
