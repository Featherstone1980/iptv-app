const { Worker } = require('worker_threads');
const path = require('path');
const workerPath = path.join(process.cwd(), 'apps/web-pc/server/epgWorker.js');
console.log('Starting worker:', workerPath);
const worker = new Worker(workerPath, { workerData: { url: 'C:\\Users\\Shane\\Desktop\\StreamPro EPGs\\my_epg_2026-06-25T07-47-53-862Z.xml' } });
worker.on('message', m => { console.log('success', Object.keys(m)); process.exit(0); });
worker.on('error', console.error);
worker.on('exit', code => console.log('exit', code));
setInterval(() => console.log('still running...'), 1000);
