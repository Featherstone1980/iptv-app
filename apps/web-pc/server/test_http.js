const express = require('express');
const ffmpeg = require('ffmpeg-static');
const app = express();

app.use((req, res, next) => {
  console.log('RECEIVED HTTP REQUEST: ', req.method, req.url);
  if (req.method === 'POST') {
    res.status(200).send('OK');
  } else {
    res.status(200).send('OK');
  }
});

app.listen(3002, () => {
  console.log('Listening 3002');
  const cp = require('child_process');
  console.log('Running ffmpeg...', ffmpeg);
  try {
    cp.execSync('"' + ffmpeg + '" -f lavfi -i testsrc=duration=2:size=1280x720:rate=30 -c:v libx264 -f hls -hls_time 1 -hls_list_size 2 -hls_flags delete_segments+append_list -hls_segment_type mpegts -method PUT http://127.0.0.1:3002/stream.m3u8', { stdio: 'inherit' });
  } catch(e) {
    console.error('Error running ffmpeg', e.message);
  }
  process.exit(0);
});
