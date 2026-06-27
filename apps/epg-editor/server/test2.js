const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('epg_data.sqlite');
db.all("SELECT channel_id, display_name FROM channels WHERE display_name LIKE '%E!%' OR display_name LIKE '%Entertainment%';", [], (err, rows) => {
  if (err) throw err;
  console.table(rows);
  db.close();
});
