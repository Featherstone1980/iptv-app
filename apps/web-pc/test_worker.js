const { Worker } = require('worker_threads');
const path = require('path');

console.log("Starting EPG Worker Test...");
console.log("This will parse the XML file and write to epg_cache.json without blocking the main thread.");

const workerPath = path.join(__dirname, 'server', 'epgWorker.js');
const xmlPath = path.join(__dirname, '..', '..', 'my_epg.xml'); // adjust if needed

const worker = new Worker(workerPath, {
  workerData: { url: xmlPath }
});

const startTime = Date.now();

worker.on('message', (msg) => {
  if (msg.success) {
    const elapsed = (Date.now() - startTime) / 1000;
    console.log(`\nSUCCESS: ${msg.message}`);
    console.log(`Parsed and cached in ${elapsed} seconds.`);
  } else {
    console.error(`\nFAILED:`, msg.error);
  }
});

worker.on('error', (err) => {
  console.error('\nWorker threw an error:', err);
});

worker.on('exit', (code) => {
  if (code !== 0) {
    console.error(`\nWorker stopped with exit code ${code}`);
  }
});

// Just to prove the main thread is totally free while parsing a 600MB file!
setInterval(() => {
  process.stdout.write('.');
}, 500);
