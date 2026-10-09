'use strict';

// Static server for the e2e fixture pages. Usage: node e2e/fixtures-server.js [port]
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, 'fixtures');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const port = Number(process.argv[2] || process.env.PORT || 4319);

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (urlPath === '/health') return res.end('ok');
  const file = path.join(ROOT, path.normalize(urlPath === '/' ? '/india-kyc.html' : urlPath));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`fixtures on http://127.0.0.1:${port}`));
