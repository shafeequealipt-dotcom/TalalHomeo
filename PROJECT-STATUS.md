# Dr. Talal's Alsharaf Homoeo Medical Centre — project status

**Live site:** https://drtalalhomeo.in
**Code:** https://github.com/shafeequealipt-dotcom/TalalHomeo
**Last updated:** 26 September 2026

---

## 1. Where things stand

| | Status |
|---|---|
| Website | **Live** at https://drtalalhomeo.in |
| HTTPS | **On.** Certificate valid to 16 Dec 2026, renews itself |
| Hosting | Oracle Cloud server (Ubuntu 22.04), shared with your other sites |
| Code | On GitHub, 5 commits |
| Automatic publishing | **Not finished** — needs 4 GitHub secrets (see §7) |
| Google indexing | **Not done** — sitemap needs submitting (see §7) |

Until the GitHub secrets are added, changes are put live by hand. After that, `git push` publishes automatically.

---

## 2. What was built

A 13-page website, built with [Astro](https://astro.build). Pages are plain HTML files — no database, no server-side code — so the site is fast and there is very little that can be attacked or break.

### Pages

| Page | Address |
|---|---|
| Home | `/` |
| About the centre | `/about` |
| Treatments (index) | `/services` |
| Allergy & Sinusitis | `/services/allergy-sinusitis` |
| Pediatric Care & Adenoids | `/services/pediatric-care` |
| Migraine & Headaches | `/services/migraine-headaches` |
| Skin & Hair | `/services/skin-hair` |
| General & Lifestyle | `/services/general-lifestyle` |
| Health notes (blog index) | `/blog` |
| Blog posts | `/blog/<post-name>` (2 so far) |
| Visit us | `/contact` |
| Page not found | shown for any wrong address |

### What's on the site

- **Doctors panel** — photos, qualifications and designations for Dr. Talal M, Dr. Tariq M and Dr. Safna M.S, on the home page and the About page
- **Consulting hours** — Mon–Sat 10:00 am–1:00 pm and 5:00 pm–9:00 pm; Sun 11:00 am–1:00 pm
- **Review slider** — 8 real 5-star Google reviews that scroll automatically, covering adenoids, allergies, children's cough and general care. Only 5-star reviews can ever appear
- **Contact everywhere** — Call and Book on WhatsApp in the header; a fixed bar on phones with Call, WhatsApp, Directions, Instagram, Facebook
- **Map** — Google Maps embed with a Get directions link
- **FAQs** — 6 common questions
- **Consultation fee** — ₹250, shown on three pages
- **Works on phones** — designed mobile-first, since most patients arrive from a phone
- **Dark mode** — follows the visitor's phone or computer setting
- **Accessibility** — readable contrast, large tap targets, keyboard navigation, screen-reader labels

### Found on Google and put into the site

Everything came from the clinic's Google Business Profile and its public listings — see `discovery-brief.md` in the parent folder for the full research. The Google reviews in the slider are real patients' words, only shortened.

---

## 3. Blog publishing

Your blog agent writes a Markdown file into `src/content/blog/` and pushes it to GitHub. Everything after that is automatic:

```
agent pushes a post  →  GitHub builds the site  →  new page created
                                                →  sitemap.xml updated
                                                →  server updated
```

- **Rules for posts:** `BLOG-AGENT-SPEC.md` — give this file to the blog agent
- **Bad posts can't go live:** if a post is missing a title, description, date or tags, the build stops and the broken post never reaches the site. Tested and confirmed
- **Sitemap:** rebuilt on every publish, plus daily at 7:00 am IST as a safety net. Each post's date comes from the post itself

---

## 4. Search engine setup (SEO)

- **sitemap.xml** — lists all 12 pages, updates itself
- **robots.txt** — tells search engines they may index the site, and where the sitemap is
- **Clinic details for Google** — name, address, phone, hours, ₹250 fee, 5.0 rating and 163 reviews are embedded in a format Google reads, which feeds the panel that appears beside search results
- **Page titles and descriptions** — written per page around what patients search for ("homoeopathy clinic in Kochi", "adenoids treatment")
- **One address per page** — every page has a single agreed web address, so Google never sees duplicates

---

## 5. Security

**On the server**
- HTTPS with automatic renewal; visitors on `http://` or `www.` are sent to the secure address
- Browser protections that stop injected code, block the site being framed by others, and keep HTTPS sticky
- Rate limiting against scraping and basic flooding
- Hidden files (like `.git`) can't be served; the nginx version is hidden
- `fail2ban` blocks repeated failed SSH logins
- Password logins to the server are off (keys only); security updates install themselves

**In the code**
- A gap was fixed where text in a blog title or review could have injected code into the page
- Build tooling kept patched automatically by Dependabot
- The publishing job has read-only access to the code

**Deliberately checked:** the site loads no third-party scripts, and it has no forms or logins — so there's no payment or password data to protect, and very little attack surface.

---

## 6. Project files

| File / folder | What it's for |
|---|---|
| `src/data/clinic.json` | **All clinic content in one file** — address, hours, doctors, treatments, reviews, FAQs, links. Edit here, not in the pages |
| `src/pages/` | The pages |
| `src/components/` | Reusable parts (header, footer, doctor photos, review slider) |
| `src/content/blog/` | Blog posts |
| `src/styles/global.css` | All design: colours, fonts, spacing |
| `deploy/` | Server setup: nginx configs, security headers, rate limit, setup script |
| `.github/workflows/deploy.yml` | Publishes the site on every push |
| `DEPLOY.md` | Full hosting walkthrough |
| `BLOG-AGENT-SPEC.md` | Rules for the blog agent |
| `README.md` | Quick start for developers |

**Common jobs**

```bash
npm run dev             # work on the site locally (http://localhost:4321)
npm run build           # build the site + sitemap
npm run preview:secure  # check the site with live security settings applied
```

---

## 7. Still to do

**Yours**

1. **Add 4 GitHub secrets** so pushes publish automatically — steps in `DEPLOY.md` §5. Until then, changes go live by hand
2. **Submit the sitemap** in Google Search Console: add `drtalalhomeo.in` as a Domain property, then submit `sitemap.xml`
3. **Add the website to your Google Business Profile** — it's currently blank there, and that link matters for local search
4. **Confirm the unverified details** listed below
5. **Reboot the server** at a quiet time — a kernel update is waiting. It also runs your trading bots and doctor-engine, so pick the moment yourself

**Details still unconfirmed** (also listed at the top of `clinic.json`)

- **Sunday hours** — 11:00 am–1:00 pm, taken from Google, never confirmed by the clinic
- **Address** — Lybrate and Justdial show a Fort Kochi address instead of Kappalandimukku
- **Doctor bios and registration numbers** — currently written from public information
- **Malayalam clinic name** — should be checked by a Malayalam speaker
- **Patient reviews** — worth confirming the clinic is comfortable naming these patients

**Known, not urgent**

- `sharp` and `esbuild` have published vulnerabilities. Both only run while building the site, never on the live server, and only handle your own images. Fixing means a two-version Astro upgrade; Dependabot will raise it as a reviewable change

---

## 8. Reference

| | |
|---|---|
| Domain | drtalalhomeo.in (GoDaddy) |
| Server | Oracle Cloud, Ubuntu 22.04, user `ubuntu` |
| Web folder on server | `/var/www/alsharaf` |
| Certificate | Let's Encrypt, renews automatically |
| Repository | github.com/shafeequealipt-dotcom/TalalHomeo |
| Clinic phone | 089217 11721 |
| Instagram | @drtalal_alsharaf |

Server address and keys are deliberately **not** written in this repo.
