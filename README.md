# Dr. Talal's Alsharaf Homoeo Medical Centre — website

Static site built with [Astro](https://astro.build). No client-side JavaScript ships by default.

## Run locally

```bash
npm install
npm run dev      # http://localhost:4321
```

## Build

```bash
npm run build    # → dist/ , including a freshly generated sitemap.xml
npm run preview  # serve dist/ locally
```

## Where things live

| Path | What |
|---|---|
| `src/data/clinic.json` | **All clinic content** — address, hours, doctors, services, FAQs, links. Edit here, not in pages. |
| `src/content/blog/` | Blog posts as markdown. The blog agent writes here — see `BLOG-AGENT-SPEC.md`. |
| `src/content.config.ts` | Frontmatter schema. Invalid posts fail the build on purpose. |
| `scripts/generate-sitemap.mjs` | Regenerates `dist/sitemap.xml` after every build. |
| `.github/workflows/deploy.yml` | Build + rsync to the Oracle server on push, daily, or manually. |
| `nginx.conf.example` | Server-side config for the Oracle box. |

## Going live

See **[DEPLOY.md](DEPLOY.md)** for the full walkthrough — DNS, the Oracle server, GitHub Actions secrets, first deploy.

Before that, confirm every `_tbc` item listed at the top of `src/data/clinic.json`.
