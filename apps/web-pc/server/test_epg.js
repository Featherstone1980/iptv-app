const fetch = require('node-fetch');

(async () => {
  const payload = {
    channels: [
      { id: '1', name: 'USA Comedy Central', epg_channel_id: 'comedy_central' },
      { id: '2', name: 'USA E! Entertainment', epg_channel_id: 'e_entertainment' }
    ]
  };

  try {
    const res = await fetch('http://localhost:3001/api/custom-epg/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    
    console.log("Response:", JSON.stringify(data, null, 2));
    
  } catch(e) {
    console.error(e);
  }
})();
