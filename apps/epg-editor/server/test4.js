const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('epg_data.sqlite');
db.all("SELECT DISTINCT channel_id FROM programmes WHERE channel_id LIKE '%mgm%' OR channel_id LIKE '%metv%';", (err, rows) => {
    if (err) console.error(err);
    console.table(rows);
    db.close();
});
