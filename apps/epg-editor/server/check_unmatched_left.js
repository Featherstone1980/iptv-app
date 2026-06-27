const fs = require('fs');

const diagPath = 'c:/Users/Shane/Desktop/Snarky Moose 2026/IPTV app/apps/epg-editor/diagnostic-report.json';
const overridesPath = 'c:/Users/Shane/Desktop/Snarky Moose 2026/IPTV app/apps/epg-editor/server/manual_overrides.json';

const diagData = JSON.parse(fs.readFileSync(diagPath, 'utf8'));
const overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));

let newlyMatched = 0;
let stillUnmatched = 0;

diagData.unmatched.forEach(u => {
    const name = u.name.toLowerCase();
    const original = u.originalTvgId;
    
    // Server logic:
    const overrideCoreId = overrides[original] || overrides[u.name] || overrides[name] || overrides[original?.toLowerCase()];
    
    if (overrideCoreId) {
        newlyMatched++;
    } else {
        stillUnmatched++;
    }
});

console.log(`Newly matched by overrides: ${newlyMatched}`);
console.log(`Still unmatched: ${stillUnmatched}`);

// Sample 10 still unmatched to see what they are:
console.log('--- Sample still unmatched ---');
diagData.unmatched.filter(u => {
    const original = u.originalTvgId;
    const name = u.name.toLowerCase();
    const overrideCoreId = overrides[original] || overrides[u.name] || overrides[name] || overrides[original?.toLowerCase()];
    return !overrideCoreId;
}).slice(0, 20).forEach(u => console.log(u.name));
