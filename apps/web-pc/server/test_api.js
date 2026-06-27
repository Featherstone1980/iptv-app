const axios = require('axios');
require('dotenv').config();

async function testApi() {
  const url = `${process.env.XTREAM_URL}/player_api.php?username=${process.env.XTREAM_USERNAME}&password=${process.env.XTREAM_PASSWORD}`;
  console.log('Testing url:', url);
  try {
    const res = await axios.get(url);
    console.log('User info:', res.data.user_info);
    
    const catUrl = `${url}&action=get_live_categories`;
    const catRes = await axios.get(catUrl);
    console.log('Live categories length:', catRes.data.length);
  } catch (e) {
    console.error('API Error:', e.message);
  }
}

testApi();
