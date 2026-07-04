#!/usr/bin/env node
/**
 * Minimaler, abhängigkeitsfreier Static-File-Server für den Tauri-Dev-Loop.
 *
 * Der Webviewer nutzt keinen Bundler (reine <script>-Tags) — daher genügt
 * es, den rohen `viewer/`-Ordner unverändert per HTTP auszuliefern, damit
 * Tauris `devUrl` (siehe src-tauri/tauri.conf.json) etwas zum Laden hat.
 * Live-Änderungen an viewer/js/*.js sind damit ohne Rebuild sofort sichtbar
 * (Browser-Reload bzw. Tauri-WebView-Reload reicht).
 *
 * Bewusst ohne externe npm-Abhängigkeit (kein `serve`/`http-server`), um die
 * Anzahl der Toolchain-Voraussetzungen klein zu halten — Node ist für Tauri
 * ohnehin Pflicht.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', 'viewer');
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.mdl':  'text/plain; charset=utf-8',
};

if (!fs.existsSync(ROOT)) {
  console.error(`[dev-server] viewer/ nicht gefunden unter ${ROOT}`);
  console.error(`[dev-server] Bitte zuerst "npm run setup" ausführen.`);
  process.exit(1);
}

const server = http.createServer((req, res) => {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/') reqPath = '/index.html';

  // Path-Traversal verhindern
  const filePath = path.normalize(path.join(ROOT, reqPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found: ' + reqPath);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      // Kein Caching im Dev-Loop — sonst sieht man Änderungen nicht sofort.
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`[dev-server] Serviere ${ROOT}`);
  console.log(`[dev-server] http://localhost:${PORT}`);
});
