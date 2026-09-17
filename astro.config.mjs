// @ts-check
import { defineConfig } from 'astro/config';

// NOTE: `site` must be the final production domain — the sitemap generator and
// every canonical/OG URL are derived from it. Update once the domain is confirmed.
export default defineConfig({
  site: 'https://drtalalhomeo.in',
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
  },
});
