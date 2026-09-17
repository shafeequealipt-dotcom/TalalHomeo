#!/usr/bin/env bash
# One-time setup for drtalalhomeo.in on the Oracle server.
#
# Run this ONCE, logged into the server itself (not from your Mac):
#   scp -i /path/to/oracle-key.key deploy/setup-server.sh ubuntu@<SERVER_IP>:~
#   ssh -i /path/to/oracle-key.key ubuntu@<SERVER_IP>
#   chmod +x setup-server.sh && ./setup-server.sh
#
# Safe to re-run — every step below only acts if it hasn't already.
#
# What it does:
#   1. Installs nginx (and certbot, once DNS is pointed here — see --ssl below)
#   2. Creates /var/www/alsharaf, owned by you, so `rsync` (no sudo) can write to it
#   3. Installs the site's nginx config from deploy/nginx.conf
#   4. Opens ports 80 and 443 in the instance's own firewall (iptables) —
#      the VCN Security List in the Oracle Cloud console is a SEPARATE
#      firewall and must be opened by hand in the console; this script
#      cannot reach it.
#
# Run again later with --ssl once:
#   - DNS for drtalalhomeo.in points at this server (dig +short drtalalhomeo.in)
#   - the VCN Security List allows inbound 443
#   to get and auto-install the HTTPS certificate.

set -euo pipefail

DOMAIN="drtalalhomeo.in"
WEB_ROOT="/var/www/alsharaf"
NGINX_SITE="/etc/nginx/sites-available/alsharaf"

echo "== 1. Packages =="
if ! command -v nginx >/dev/null; then
  sudo apt-get update -y
  sudo apt-get install -y nginx
else
  echo "nginx already installed"
fi

echo "== 2. Web root =="
sudo mkdir -p "$WEB_ROOT"
sudo chown -R "$USER":"$USER" "$WEB_ROOT"
# Placeholder so nginx has something to serve before the first deploy lands.
if [ ! -f "$WEB_ROOT/index.html" ]; then
  echo "<h1>Deploying $DOMAIN…</h1>" > "$WEB_ROOT/index.html"
fi

echo "== 3. nginx site config =="
if [ ! -f deploy/nginx.conf ]; then
  echo "ERROR: run this from the project root (deploy/nginx.conf not found)." >&2
  exit 1
fi
sudo cp deploy/nginx.conf "$NGINX_SITE"
sudo ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/alsharaf
sudo rm -f /etc/nginx/sites-enabled/default   # avoid the stock "Welcome to nginx" default winning ties
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl reload nginx || sudo systemctl start nginx

echo "== 4. Instance firewall (iptables) =="
for port in 80 443; do
  if ! sudo iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null; then
    sudo iptables -I INPUT 6 -p tcp --dport "$port" -j ACCEPT
    echo "opened port $port"
  else
    echo "port $port already open"
  fi
done
if command -v netfilter-persistent >/dev/null; then
  sudo netfilter-persistent save
else
  echo "NOTE: netfilter-persistent not found — iptables rules above won't survive a reboot."
  echo "      Install it: sudo apt-get install -y iptables-persistent"
fi

echo
echo "Done. http://$DOMAIN should now reach nginx, once:"
echo "  - the VCN Security List (Oracle Cloud console) allows inbound TCP 80/443"
echo "  - drtalalhomeo.in's DNS A record points at this server's public IP"
echo
echo "Once both are true, get the HTTPS certificate:"
echo "  $0 --ssl"

if [ "${1:-}" = "--ssl" ]; then
  echo
  echo "== 5. HTTPS (certbot) =="
  if ! command -v certbot >/dev/null; then
    sudo apt-get install -y certbot python3-certbot-nginx
  fi
  sudo certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN"
  echo "Certbot also installs its own renewal timer — nothing else to schedule."
fi
