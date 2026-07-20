// Servidor estático mínimo em Node puro (fallback quando npx serve trava).
// Uso: node static-server.js <raiz> <porta>
const http = require('http'), fs = require('fs'), path = require('path');
const root = process.argv[2] || '.';
const port = +(process.argv[3] || 3005);
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.json': 'application/json', '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};
http.createServer((req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    let f = path.join(root, p);
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    else if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f = f + '.html';
    else if (!fs.existsSync(f) && fs.existsSync(path.join(root, p, 'index.html'))) f = path.join(root, p, 'index.html');
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(f).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  } catch (e) { res.writeHead(500); res.end('error'); }
}).listen(port, () => console.log('static server on ' + port));
