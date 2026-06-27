const express = require('express');
const app = express();

app.use((req, res, next) => {
  console.log('REQUEST:', req.method, req.url);
  next();
});

app.put('*', express.raw({ type: '*/*', limit: '50mb' }), (req, res) => {
  console.log('PUT', req.url, req.body ? req.body.length : 0);
  res.send('OK');
});

app.delete('*', (req, res) => {
  console.log('DELETE', req.url);
  res.send('OK');
});

app.listen(3002, () => console.log('Listening 3002'));
