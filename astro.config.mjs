// @ts-check
import { defineConfig } from 'astro/config';

// NOTE: `site` must be the final production domain — the sitemap generator and
// every canonical/OG URL are derived from it.
export default defineConfig({
  site: 'https://drtalalhomeo.in',
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
  },
  vite: {
    build: {
      // Never inline small scripts into the HTML. The server's
      // Content-Security-Policy is `script-src 'self'`, which blocks inline
      // <script> — an inlined script (e.g. the review slider) silently stops
      // working in production while looking fine on `npm run dev`.
      assetsInlineLimit: 0,
    },
  },
});
