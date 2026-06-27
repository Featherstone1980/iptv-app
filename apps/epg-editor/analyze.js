const fs = require('fs');
const r = JSON.parse(fs.readFileSync('./diagnostic-report.json'));
let perfect = 0;
let probable = 0;
let suspicious = [];

const cleanStr = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

r.matched.forEach(m => {
  const source = m.name.toLowerCase()
    .replace(/\b(usa|uk|ca|au|nz|za|ie|hd|fhd|uhd|4k|1080p|720p|hevc|h265|vip|local|east|west|pacific|lhd|catchup|vod)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
  const target = m.mappedTo.toLowerCase().replace(/\.(us|uk|ca|au|nz|za|ie|us2|uk2|ca2|plex|pluto|samsung|xumo|roku)$/, '').replace(/[^a-z0-9]/g, '');
  
  if (source === target) {
    perfect++;
  } else if (source.includes(target) || target.includes(source)) {
    probable++;
  } else {
    // Check Jaccard similarity for words
    const sWords = new Set(m.name.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(w => w.length > 0));
    const tWords = new Set(m.mappedTo.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(w => w.length > 0));
    let intersection = 0;
    for(let w of sWords) { if(tWords.has(w)) intersection++; }
    if (intersection > 0 && intersection / Math.min(sWords.size, tWords.size) >= 0.5) {
      probable++;
    } else {
      suspicious.push(m);
    }
  }
});

console.log('Total Matched:', r.matched.length);
console.log('Perfect/High Confidence Matches:', perfect + probable);
console.log('Suspicious/Low Confidence Matches:', suspicious.length);
console.log('Calculated Strict Accuracy:', ((perfect + probable) / r.matched.length * 100).toFixed(2) + '%');
console.log('\nTop 15 Suspicious Matches (for manual review):');
suspicious.slice(0, 15).forEach(m => console.log(`Source: ${m.name.padEnd(40)} -> Mapped: ${m.mappedTo}`));
