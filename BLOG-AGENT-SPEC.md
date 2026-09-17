# Blog agent specification

The contract your blog agent must follow. Every rule here is enforced by
`src/content.config.ts` at build time — a post that breaks one **fails CI**, and
nothing is deployed until it's fixed. That's deliberate: a broken post stops at
the build rather than appearing on the live site.

---

## What the agent does

1. Write one markdown file into `src/content/blog/`
2. Commit and push to `main`
3. Stop

Everything after that is automatic:

```
agent pushes .md  →  GitHub Actions  →  npm run build  →  rsync to Oracle server
                                           │
                                           ├── generates /blog/<slug>/ page
                                           ├── adds card to /blog index
                                           └── rewrites sitemap.xml with the new URL
```

A daily scheduled run (07:00 IST) rebuilds regardless, so `sitemap.xml` stays
current even if a push event is ever missed.

---

## File location and name

```
src/content/blog/YYYY-MM-DD-short-slug.md
```

The filename **becomes the URL** — `2026-09-02-monsoon-allergic-rhinitis-kochi.md`
is published at `/blog/2026-09-02-monsoon-allergic-rhinitis-kochi`.

- lowercase, hyphens only, no spaces or underscores
- `.md` extension
- never rename a published file — the old URL 404s and loses its search ranking

---

## Frontmatter

```markdown
---
title: "Why Allergic Rhinitis Gets Worse Every Monsoon in Kochi"
description: "Sneezing fits every morning through the rains, a blocked nose that never fully clears — what drives seasonal allergic rhinitis on the Kerala coast."
pubDate: 2026-09-02
tags: ["Allergy", "Sinusitis", "Seasonal health"]
---
```

| Field | Required | Rule |
|---|---|---|
| `title` | **yes** | 10–120 characters |
| `description` | **yes** | 50–200 characters — this is the Google search snippet |
| `pubDate` | **yes** | `YYYY-MM-DD` |
| `tags` | **yes** | 1–6 tags, as an array |
| `updatedDate` | no | `YYYY-MM-DD` — set when revising a published post; drives `lastmod` in the sitemap |
| `author` | no | defaults to the clinic name |
| `image` | no | path under `public/images/` |
| `imageAlt` | no | required if `image` is set |
| `draft` | no | `true` keeps it out of the site *and* the sitemap |

Common failure: a `description` under 50 characters. Write a real sentence.

---

## Body rules

- Start at `##` — the `#` level is the page title, rendered from `title`
- Plain markdown: headings, lists, bold, links, blockquotes
- No raw HTML, no `<script>`
- 600–1200 words works well
- Write for patients, not clinicians

---

## Medical content rules (non-negotiable)

This is a healthcare site. Content that breaks these should never be published:

- **No cure claims.** "Many patients improve" — never "cures X"
- **No guarantees** about outcomes or timelines
- **Never tell readers to stop prescribed medication** or skip advised surgery
- **Always include a "when to seek care" note** for anything that can be serious
- **No fabricated statistics, studies or patient quotes**
- Real patient stories require written consent and must be anonymised

Every post automatically gets a medical disclaimer appended — that does not
license looser copy above it.

---

## Suggested topics

Drawn from what patients at this clinic actually ask about (per their Google reviews):

- Adenoids and children's sleep-disordered breathing
- Allergic rhinitis and sinusitis, especially monsoon-linked
- Migraine triggers and patterns
- Eczema, psoriasis, urticaria, hair fall
- Recurrent colds and tonsillitis in children
- Seasonal health specific to Kochi and coastal Kerala

---

## Checking a post before pushing

```bash
npm run build
```

Builds cleanly → safe to push. Errors → fix what it names; the error message
lists each field that failed and why.
