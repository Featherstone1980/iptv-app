const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('c:/Users/Shane/Desktop/Snarky Moose 2026/IPTV app/apps/epg-editor/server/epg_data_1782251662625.sqlite', sqlite3.OPEN_READONLY);
db.all("SELECT DISTINCT channel_id FROM programmes WHERE channel_id LIKE '%dummy%' COLLATE NOCASE OR channel_id LIKE '%distro%' COLLATE NOCASE", (err, rows) => {
    if(err) { console.error(err); return; }
    rows.forEach(r => console.log(r.channel_id));
});
