/**
 * 支持 Range 请求的静态文件服务器（视频/MP4 播放必需）
 * 放在 /workspace 目录下启动，默认端口 8000
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.json': 'application/json',
  '.txt':  'text/plain; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.ico':  'image/x-icon',
};

function sendFile(req, res, filePath) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.statusCode = 404;
      res.end('404 Not Found: ' + path.basename(filePath));
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';
    const total = stat.size;
    const range = req.headers['range'];

    if (range) {
      // Range: bytes=start-end
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!m) {
        res.statusCode = 416;
        res.end('Requested Range Not Satisfiable');
        return;
      }
      let start = m[1] === '' ? null : parseInt(m[1], 10);
      let end   = m[2] === '' ? null : parseInt(m[2], 10);
      const CHUNK = 1024 * 1024; // 默认 1MB 块

      if (start === null && end === null) {
        res.statusCode = 416; res.end(); return;
      }
      if (start === null) { // suffix-range: last N bytes
        start = Math.max(0, total - end);
        end = total - 1;
      } else if (end === null) {
        end = Math.min(start + CHUNK - 1, total - 1);
      }
      if (isNaN(start) || isNaN(end) || start > end || start >= total) {
        res.statusCode = 416;
        res.setHeader('Content-Range', `bytes */${total}`);
        res.end();
        return;
      }

      res.statusCode = 206;
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Length', (end - start + 1).toString());
      res.setHeader('Cache-Control', 'no-cache');

      const stream = fs.createReadStream(filePath, { start, end });
      stream.on('error', () => { try { res.destroy(); } catch(e){} });
      stream.pipe(res);
      return;
    }

    // 无 Range：完整文件
    res.statusCode = 200;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', total.toString());
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'no-cache');

    const stream = fs.createReadStream(filePath);
    stream.on('error', () => { try { res.destroy(); } catch(e){} });
    stream.pipe(res);
  });
}

const server = http.createServer((req, res) => {
  let pathname = decodeURIComponent(url.parse(req.url).pathname);
  if (pathname === '/') pathname = '/baozheng.html'; // 默认首页

  // 目录穿越防护
  const safe = path.normalize(path.join(ROOT, pathname));
  if (!safe.startsWith(ROOT)) {
    res.statusCode = 403; res.end('Forbidden'); return;
  }

  // 如果请求是目录但没加斜杠，不处理
  sendFile(req, res, safe);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ 视频预览服务器已启动: http://127.0.0.1:${PORT}/baozheng.html`);
  console.log(`   根目录: ${ROOT}`);
});
