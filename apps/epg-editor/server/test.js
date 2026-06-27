const db = require('better-sqlite3')('epg_data.sqlite');
const rows = db.prepare(`SELECT channel_id, display_name FROM channels WHERE display_name LIKE '%E!%' OR display_name LIKE '%Entertainment%';`).all();
console.table(rows);
