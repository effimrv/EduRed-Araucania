// Servidor estático mínimo para probar la PWA en local: npm start → http://localhost:8080
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const tipos = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
};
const puerto = Number(process.env.PORT ?? 8080);

createServer(async (req, res) => {
  const ruta = new URL(req.url, 'http://x').pathname;
  const archivo = normalize(join(raiz, ruta === '/' ? 'index.html' : ruta));
  if (!archivo.startsWith(raiz)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const cuerpo = await readFile(archivo);
    res.writeHead(200, { 'Content-Type': tipos[extname(archivo)] ?? 'application/octet-stream' }).end(cuerpo);
  } catch {
    res.writeHead(404).end('No encontrado');
  }
}).listen(puerto, () => console.log(`EduRed en http://localhost:${puerto}`));
