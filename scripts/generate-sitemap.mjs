#!/usr/bin/env node
/**
 * Generates dist/sitemap.xml after every `astro build`.
 *
 * WHY THIS EXISTS
 * The blog agent commits markdown into src/content/blog/ and pushes. CI rebuilds
 * the site, which creates a page for each post — and this script then rewrites
 * sitemap.xml so the new URLs are listed immediately. It also runs on a daily
 * schedule (see .github/workflows/deploy.yml) as a safety net.
 *
 * Deliberately hand-rolled rather than @astrojs/sitemap: that integration emits
 * a sitemap-index.xml + sitemap-0.xml pair, and we want exactly /sitemap.xml,
 * with lastmod driven by each post's own frontmatter.
 *
 * Run: node scripts/generate-sitemap.mjs
 */

import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const BLOG_SRC = join(ROOT, 'src', 'content', 'blog');

// Keep in sync with `site` in astro.config.mjs.
const SITE = 'https://drtalalhomeo.in';

/** Pages that should never appear in the sitemap. */
const EXCLUDE = [/^404$/, /^_/];

/** changefreq + priority per section. Blog churns; service pages don't. */
function rank(route) {
  if (route === '/') return { changefreq: 'weekly', priority: '1.0' };
  if (route === '/blog') return { changefreq: 'daily', priority: '0.9' };
  if (route.startsWith('/blog/')) return { changefreq: 'monthly', priority: '0.7' };
  if (route.startsWith('/services')) return { changefreq: 'monthly', priority: '0.8' };
  return { changefreq: 'monthly', priority: '0.6' };
}

/** Recursively collect every index.html under dist/. */
async function collectRoutes(dir, acc = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectRoutes(full, acc);
    } else if (entry.name.endsWith('.html')) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * Reads pubDate / updatedDate straight out of the markdown frontmatter so a
 * post's lastmod reflects when it was actually written, not when CI happened
 * to run. Frontmatter is parsed with a narrow regex — no YAML dependency.
 */
async function blogDates() {
  const dates = new Map();
  let files = [];
  try {
    files = (await readdir(BLOG_SRC)).filter((f) => f.endsWith('.md'));
  } catch {
    return dates; // no blog folder yet — fine
  }

  for (const file of files) {
    const raw = await readFile(join(BLOG_SRC, file), 'utf8');
    const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fm) continue;

    const get = (key) => {
      const m = fm[1].match(new RegExp(`^${key}:\\s*["']?([^"'\\n]+)["']?\\s*$`, 'm'));
      return m ? m[1].trim() : null;
    };

    if (get('draft') === 'true') continue;

    const when = get('updatedDate') || get('pubDate');
    const slug = file.replace(/\.md$/, '');
    if (when && !Number.isNaN(Date.parse(when))) {
      dates.set(`/blog/${slug}`, new Date(when).toISOString().slice(0, 10));
    }
  }
  return dates;
}

function toRoute(htmlPath) {
  let route =
    '/' +
    relative(DIST, htmlPath)
      .split(sep)
      .join('/')
      .replace(/index\.html$/, '')
      .replace(/\.html$/, '')
      .replace(/\/$/, '');
  if (route === '') route = '/';
  return route;
}

const escapeXml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function main() {
  const htmlFiles = await collectRoutes(DIST);
  const postDates = await blogDates();
  const today = new Date().toISOString().slice(0, 10);

  const routes = [...new Set(htmlFiles.map(toRoute))]
    .filter((r) => !EXCLUDE.some((re) => re.test(r.replace(/^\//, ''))))
    .sort((a, b) => (a === '/' ? -1 : b === '/' ? 1 : a.localeCompare(b)));

  const entries = await Promise.all(
    routes.map(async (route) => {
      const { changefreq, priority } = rank(route);
      let lastmod = postDates.get(route);

      if (!lastmod) {
        // Fall back to the built file's mtime, so static pages only claim a new
        // lastmod when their output actually changed.
        const file = htmlFiles.find((f) => toRoute(f) === route);
        try {
          lastmod = (await stat(file)).mtime.toISOString().slice(0, 10);
        } catch {
          lastmod = today;
        }
      }

      return `  <url>
    <loc>${escapeXml(SITE + (route === '/' ? '/' : route))}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
    })
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>
`;

  await writeFile(join(DIST, 'sitemap.xml'), xml, 'utf8');

  const postCount = routes.filter((r) => r.startsWith('/blog/')).length;
  console.log(
    `sitemap.xml written — ${routes.length} URLs (${postCount} blog post${postCount === 1 ? '' : 's'})`
  );
}

main().catch((err) => {
  console.error('sitemap generation failed:', err);
  process.exit(1);
});
