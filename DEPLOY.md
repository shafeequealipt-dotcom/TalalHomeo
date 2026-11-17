# Going live: drtalalhomeo.in on Oracle Cloud

Everything the site needs is already in this repo. This is the order to do it in.

## 0. What you need before starting

- Your Oracle Cloud instance's **public IP address**
- The **SSH key** for that instance (the `.key` / `.key.pub` pair Oracle gave you when you created it)
- The **username** for that instance — `ubuntu` for an Ubuntu image, `opc` for Oracle Linux
- Access to the **GoDaddy DNS settings** for `drtalalhomeo.in`
- A **GitHub account** to hold the repo (public or private both work)

## 1. Point the domain at the server

In GoDaddy → `drtalalhomeo.in` → DNS → add these records (remove any placeholder "parked" records first):

| Type | Name | Value |
|---|---|---|
| A | @ | your server's public IP |
| A | www | your server's public IP |

DNS can take a few minutes to a few hours to spread. Check with:
```bash
dig +short drtalalhomeo.in
```
Once that prints your server's IP, move on.

## 2. Open the firewall (two separate firewalls — both need doing)

**a) Oracle Cloud console** (this one a script cannot reach for you):
Your instance's VCN → Security Lists → the list attached to its subnet → Add Ingress Rules:
- Source CIDR `0.0.0.0/0`, TCP, destination port **80**
- Source CIDR `0.0.0.0/0`, TCP, destination port **443**

**b) The instance's own firewall (iptables)** — handled by the setup script in step 3.

## 3. Server setup

From your Mac, in the `alsharaf/` folder, copy the `deploy/` folder up and run the script from the folder that contains it:

```bash
scp -i /path/to/your-oracle-key.key -r deploy ubuntu@<SERVER_IP>:~/deploy
ssh -i /path/to/your-oracle-key.key ubuntu@<SERVER_IP> 'cd ~ && bash deploy/setup-server.sh'
```

This installs nginx, the site config, security headers, rate limiting and fail2ban, and opens ports 80/443 in the instance firewall. It only touches this site's own files, so other sites on the same server are unaffected. Safe to re-run.

Once `dig +short drtalalhomeo.in` returns **only** your server's IP (no GoDaddy parking addresses) and step 2a is done, get HTTPS:

```bash
ssh -i /path/to/your-oracle-key.key ubuntu@<SERVER_IP> 'cd ~ && bash deploy/setup-server.sh --ssl'
```

The script then switches to `deploy/nginx-ssl.conf` automatically. Certificates renew on their own.

### Config files in `deploy/`

| File | Purpose |
|---|---|
| `nginx.conf` | HTTP-only site config, used until a certificate exists |
| `nginx-ssl.conf` | HTTPS config: redirects HTTP → HTTPS and `www` → bare domain |
| `site-body.conf` | Everything the site serves, shared by both configs |
| `security-headers.conf` | CSP, HSTS, clickjacking and other browser security headers |
| `ratelimit.conf` | Per-IP request rate limit |

Changing a security header? Test locally first, since `npm run dev` doesn't send them:
```bash
npm run build && npm run preview:secure   # http://127.0.0.1:4322 — check the browser console
```

## 4. Push the code to GitHub

From your Mac, in the `alsharaf/` folder:
```bash
git init -b main
git add .
git commit -m "Initial site"
gh repo create drtalalhomeo-website --private --source=. --remote=origin --push
```
(No `gh` CLI? Create an empty repo at github.com/new instead, then:)
```bash
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

## 5. Give GitHub Actions the deploy key

The workflow in `.github/workflows/deploy.yml` builds the site and `rsync`s it to the server on every push. It needs four secrets.

**a) Put the deploy key's public half on the server**, if it isn't there already:
```bash
cat /path/to/your-oracle-key.key.pub | ssh -i /path/to/your-oracle-key.key <user>@<SERVER_IP> "cat >> ~/.ssh/authorized_keys"
```

**b) Add the secrets** — on GitHub: your repo → Settings → Secrets and variables → Actions → New repository secret:

| Secret | Value |
|---|---|
| `SSH_PRIVATE_KEY` | the full contents of `your-oracle-key.key` (the private key — paste the whole file, `-----BEGIN...` to `-----END...`) |
| `SSH_HOST` | your server's public IP |
| `SSH_USER` | `ubuntu` (or `opc`) |
| `DEPLOY_PATH` | `/var/www/alsharaf` |

## 6. First deploy

Push already triggered one in step 4. Watch it: your repo → **Actions** tab. Green check = live.

Or trigger by hand: Actions tab → "Build & deploy to Oracle server" → **Run workflow**.

## 7. Check it

```bash
curl -I https://drtalalhomeo.in
curl -s https://drtalalhomeo.in/sitemap.xml | head -20
```

Then submit `https://drtalalhomeo.in/sitemap.xml` once in [Google Search Console](https://search.google.com/search-console).

## 8. Monthly Google rating update

On the 1st of every month, `.github/workflows/update-rating.yml` asks Google for the clinic's current rating and review count, updates `src/data/clinic.json`, commits it, and redeploys. Every number on the site — the hero badge, the stats strip, the reviews link, the search-result description, and the rating Google reads — comes from that one file.

It needs one secret: a Google Places API key.

**a) Create the key** (Google Cloud Console, one time):
1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a project (or use an existing one).
2. **APIs & Services → Library** → search **"Places API (New)"** → **Enable**. (Not the older "Places API".)
3. **Billing** must be linked to the project. Google requires it even though a monthly check costs nothing — it stays far inside the free allowance.
4. **APIs & Services → Credentials → Create credentials → API key**.
5. Click the new key → **API restrictions → Restrict key** → tick only **Places API (New)** → Save. A leaked key restricted this way can't be used for anything else.

**b) Give it to GitHub:** repo → Settings → Secrets and variables → Actions → New repository secret:

| Secret | Value |
|---|---|
| `GOOGLE_PLACES_API_KEY` | the key from step a |

**c) Run it once now:** Actions tab → **Update Google rating** → **Run workflow**. The first run looks the clinic up by name and saves its Google Place ID into `clinic.json`, so later runs go straight to it.

**To run locally**, put `export GOOGLE_PLACES_API_KEY="..."` in `~/.zshrc`, open a new terminal, then:
```bash
npm run update:rating -- --dry-run   # show the numbers, change nothing
npm run update:rating                # update clinic.json
```

**It refuses to write, and the run shows red, when:**
- the Google listing it finds isn't named like the clinic
- the review count drops by more than 10% (or 5 reviews) in a month. Small drops are normal, since Google removes spam reviews; a big one usually means the wrong listing
- Google returns an error (key wrong, API not enabled, billing off). The error message says which

GitHub emails the repo owner when a scheduled run fails.

## After this, publishing a blog post is just:

```bash
git add src/content/blog/my-new-post.md
git commit -m "New post"
git push
```
CI rebuilds, `sitemap.xml` updates, the server gets the new page — no server login needed.

---

### If something doesn't load

- **Site unreachable at all** → almost always the Oracle VCN Security List (step 2a) — the most commonly missed step.
- **"Connection refused" specifically** → nginx isn't running: `sudo systemctl status nginx` on the server.
- **GitHub Action fails at "Deploy to Oracle server"** → check the 4 secrets are exactly right, and that the public key is in `~/.ssh/authorized_keys` on the server for that exact user.
- **HTTPS certificate step fails with an IP that isn't your server** → GoDaddy's default parking records are still on the domain. Delete every A record for `@` except your server's IP, wait for `dig` to show only that IP, then retry. Let's Encrypt allows 5 failed attempts per hour.
- **`https://drtalalhomeo.in` shows a different site** → no certificate for this domain yet, so nginx hands HTTPS requests to another site on the server. Fixed by getting the certificate.
