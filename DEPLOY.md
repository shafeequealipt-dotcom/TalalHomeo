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

## 3. One-time server setup

From your Mac, copy the setup script to the server and run it there:

```bash
scp -i /path/to/your-oracle-key.key deploy/setup-server.sh <user>@<SERVER_IP>:~
ssh -i /path/to/your-oracle-key.key <user>@<SERVER_IP>
```
Then, on the server:
```bash
mkdir -p alsharaf-deploy && cd alsharaf-deploy
# copy deploy/nginx.conf up too — the script needs it alongside itself:
```
Actually simplest: copy the whole `deploy/` folder up instead of just the script:
```bash
# from your Mac, in the alsharaf/ folder:
scp -i /path/to/your-oracle-key.key -r deploy <user>@<SERVER_IP>:~/alsharaf-deploy
ssh -i /path/to/your-oracle-key.key <user>@<SERVER_IP>
cd ~/alsharaf-deploy
chmod +x setup-server.sh
./setup-server.sh
```

This installs nginx, creates `/var/www/alsharaf`, installs the site config, and opens ports 80/443 in the instance's own firewall. It's safe to re-run.

Once `dig +short drtalalhomeo.in` shows your server's IP **and** step 2a is done, get HTTPS:
```bash
./setup-server.sh --ssl
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
- **HTTPS certificate step fails** → DNS (step 1) hasn't finished spreading yet, or port 443 isn't open yet (step 2). Wait and retry `./setup-server.sh --ssl`.
