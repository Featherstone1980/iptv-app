const fs = require('fs');
const code = fs.readFileSync('server.js', 'utf8');
const cleanChannelNameStr = code.substring(code.indexOf('const cleanChannelName'), code.indexOf('const getCoreId'));
eval(cleanChannelNameStr.replace('const cleanChannelName', 'var cleanChannelName'));

console.log('USA Latin FOROTV ->', cleanChannelName('USA Latin FOROTV'));
console.log('UK MTV Base ->', cleanChannelName('UK MTV Base'));
console.log('USA PAC-12 Mountain ->', cleanChannelName('USA PAC-12 Mountain'));
console.log('CA CTV News ->', cleanChannelName('CA CTV News'));
