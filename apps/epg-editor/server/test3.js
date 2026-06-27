const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('epg_data.sqlite');
db.each("SELECT channel_id, xml_data FROM programmes WHERE xml_data LIKE '%E!%' LIMIT 10", (err, row) => {
  if (err) console.error(err);
  console.log(row.channel_id, row.xml_data.substring(0, 100));
});
