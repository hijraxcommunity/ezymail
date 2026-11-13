// Static file server for /home/z/my-project/download
// Serves ONLY the three audit report files with Content-Disposition: attachment
// so a browser click = direct download. No directory listing, no traversal.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = '/home/z/my-project/download';
const PORT = process.env.PORT || 3000;

const ALLOWED = {
  '/EzyMail-Production-Audit-Report.pdf': 'EzyMail-Production-Audit-Report.pdf',
  '/EzyMail-Production-Audit-Report.docx': 'EzyMail-Production-Audit-Report.docx',
  '/EzyMail-Production-Audit-Report.zip': 'EzyMail-Production-Audit-Report.zip',
};

const TYPES = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.zip': 'application/zip',
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);

  if (urlPath === '/' || urlPath === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('EzyMail audit report files. Use the exact file URLs provided.\n');
    return;
  }

  const fileName = ALLOWED[urlPath];
  if (!fileName) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found\n');
    return;
  }

  const filePath = path.join(ROOT, fileName);
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found\n');
    return;
  }

  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(fileName)] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Content-Disposition': 'attachment; filename="' + fileName + '"',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') { res.end(); return; }
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('report server listening on ' + PORT);
});
