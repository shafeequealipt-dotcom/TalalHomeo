#!/usr/bin/env node
/**
 * Serves dist/ locally WITH the production security headers from
 * deploy/security-headers.conf applied.
 *
 * `astro dev` and `astro preview` send no Content-Security-Policy, so a change
 * that CSP breaks (an inlined script, a new third-party font or embed) looks
 * fine locally and only fails on the live server. Run this after
 * `npm run build` and check the browser console for CSP violations.
 *
 *   npm run build && npm run preview:secure   → http://127.0.0.1:4322
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 4322;

const conf = await readFile(join(ROOT, 'deploy', 'security-headers.conf'), 'utf8');
const headers = [...conf.matchAll(/^add_header\s+(\S+)\s+"([^"]*)"/gm)].map((m) => [m[1], m[2]]);

const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

async function resolve(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  const base = join(DIST, clean);
  for (const candidate of [base, join(base, 'index.html')]) {
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {}
  }
  return null;
}

createServer(async (req, res) => {
  for (const [k, v] of headers) res.setHeader(k, v);
  const file = await resolve(req.url);
  if (!file) {
    res.statusCode = 404;
    res.setHeader('Content-Type', types['.html']);
    res.end(await readFile(join(DIST, '404.html')).catch(() => 'Not found'));
    return;
  }
  res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
  res.end(await readFile(file));
}).listen(PORT, '127.0.0.1', () => {
  console.log(`dist/ with production headers (${headers.map(([k]) => k).join(', ')}) → http://127.0.0.1:${PORT}`);
});
