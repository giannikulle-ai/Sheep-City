// Minimal static file server for The Garage tile. No dependencies.
// The Garage starts this via lab.yml and proxies the tile's URL to port 3000.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = process.cwd();
const PORT = Number(process.env.PORT || 3000);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.gif': 'image/gif',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
};
// Text assets worth gzipping (issue #108). PNGs and other already-compressed binary formats
// (fonts, images) are left alone -- gzip barely touches them and it costs a CPU pass for nothing.
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.webmanifest', '.txt', '.map']);

function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(body);
}

// gzip(-9) compressed bytes for a file, computed once and cached in memory. Re-computed if the
// file's mtime or size changes underneath us (it won't during one process's life on the tile,
// but a stale cache serving the wrong bytes would be an ugly bug, so key on both).
const gzipCache = new Map(); // absolute path -> { mtimeMs, size, buf }
function gzipFor(file, st) {
  const cached = gzipCache.get(file);
  if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) return cached.buf;
  const buf = zlib.gzipSync(fs.readFileSync(file), { level: 9 });
  gzipCache.set(file, { mtimeMs: st.mtimeMs, size: st.size, buf });
  return buf;
}

function acceptsGzip(req) {
  const ae = req.headers['accept-encoding'];
  return typeof ae === 'string' && /(^|,)\s*gzip\s*(;|,|$)/i.test(ae);
}

http.createServer((req, res) => {
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { return send(res, 400, 'bad request'); }
  if (urlPath === '/healthz') return send(res, 200, 'ok');
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  const file = path.normalize(path.join(ROOT, urlPath));
  if (!file.startsWith(ROOT + path.sep) && file !== ROOT) return send(res, 403, 'forbidden');
  const base = path.basename(file);
  if (base === 'server.js' || base === 'lab.yml' || base.startsWith('.')) return send(res, 404, 'not found');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'not found');
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const compressible = COMPRESSIBLE.has(path.extname(file).toLowerCase());
    // A response for a compressible type varies on Accept-Encoding whether or not this
    // particular request asked for gzip, so caches downstream (and the browser) know that.
    const headers = compressible ? { Vary: 'Accept-Encoding' } : {};
    if (compressible && acceptsGzip(req)) {
      let gz;
      try {
        gz = gzipFor(file, st);
      } catch {
        gz = null; // fall through to the plain file below
      }
      if (gz) {
        res.writeHead(200, { ...headers, 'Content-Type': type, 'Content-Encoding': 'gzip', 'Content-Length': gz.length, 'Cache-Control': 'no-cache' });
        return res.end(gz);
      }
    }
    res.writeHead(200, { ...headers, 'Content-Type': type, 'Content-Length': st.size, 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}).listen(PORT, '0.0.0.0', () => console.log(`sheep-city static server on :${PORT} serving ${ROOT}`));
