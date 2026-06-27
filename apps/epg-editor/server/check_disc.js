const fs = require('fs');

let serverCode = fs.readFileSync('server.js', 'utf8');

serverCode = serverCode.replace(/const /g, 'var ').replace(/let /g, 'var ');

const startIdx = serverCode.indexOf('var cleanChannelName');
const endIdx = serverCode.indexOf('app.post(');
const evalCode = serverCode.substring(startIdx, endIdx);
eval(evalCode);

console.log(cleanChannelName('Discovery+'));
