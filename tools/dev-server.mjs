import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { root, buildGame } from './build.mjs';

const port = Number(process.env.GAMEJAM_PORT || 4173);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid GAMEJAM_PORT');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'PROJECT_MANIFEST.json'), 'utf8'));
const server = http.createServer(async (request, response) => {
  if (request.url === '/favicon.ico') { response.writeHead(204); response.end(); return; }
  if (request.url !== '/' && request.url !== '/index.html') { response.writeHead(404); response.end('Not found'); return; }
  try {
    await buildGame();
    const html = await fs.readFile(path.join(root, manifest.activeVersionPath, 'builds/preview.html'));
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(html);
  } catch (error) {
    console.error(error);
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(`Build failed: ${error instanceof Error ? error.message : error}`);
  }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`GameJam: http://127.0.0.1:${port} (refresh to rebuild; Ctrl+C to stop)`));
