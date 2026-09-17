#!/usr/bin/env bash
# Server setup for drtalalhomeo.in on the Oracle server.
#
# Run from the folder CONTAINING deploy/ (e.g. your home directory):
#   bash deploy/setup-server.sh           # nginx, headers, rate limit, fail2ban, firewall
#   bash deploy/setup-server.sh --ssl     # also get/renew the HTTPS certificate
#
# Safe to re-run. This server hosts other sites: everything here is scoped to
# drtalalhomeo.in's own files (alsharaf / alsharaf-* / clinic-*), and nginx is
# only reloaded after `nginx -t` passes.

set -euo pipefail

DOMAIN="drtalalhomeo.in"
WEB_ROOT="/var/www/alsharaf"
ACME_ROOT="/var/www/letsencrypt"
SITE_FILE="/etc/nginx/sites-available/alsharaf"
CERT_DIR="/etc/letsencrypt/live/$DOMAIN"

if [ ! -f deploy/nginx.conf ]; then
  echo "ERROR: run from the folder containing deploy/ (deploy/nginx.conf not found)." >&2
  exit 1
fi

install_site_config() {
  sudo mkdir -p /etc/nginx/snippets
  sudo cp deploy/security-headers.conf /etc/nginx/snippets/alsharaf-security-headers.conf
  sudo cp deploy/site-body.conf        /etc/nginx/snippets/alsharaf-site-body.conf
  sudo cp deploy/ratelimit.conf        /etc/nginx/conf.d/clinic-ratelimit.conf
  if sudo test -f "$CERT_DIR/fullchain.pem"; then
    echo "certificate found — installing HTTPS config"
    sudo cp deploy/nginx-ssl.conf "$SITE_FILE"
  else
    echo "no certificate yet — installing HTTP-only config"
    sudo cp deploy/nginx.conf "$SITE_FILE"
  fi
  sudo ln -sf "$SITE_FILE" /etc/nginx/sites-enabled/alsharaf
  sudo nginx -t
  sudo systemctl reload nginx
}

echo "== 1. Packages =="
command -v nginx >/dev/null || { sudo apt-get update -y && sudo apt-get install -y nginx; }

echo "== 2. Web roots =="
sudo mkdir -p "$WEB_ROOT" "$ACME_ROOT"
sudo chown -R "$USER":"$USER" "$WEB_ROOT"
[ -f "$WEB_ROOT/index.html" ] || echo "<h1>Deploying $DOMAIN…</h1>" > "$WEB_ROOT/index.html"

echo "== 3. nginx site config =="
install_site_config

echo "== 4. fail2ban (SSH brute-force protection) =="
if ! command -v fail2ban-client >/dev/null; then
  sudo apt-get install -y fail2ban
  sudo systemctl enable --now fail2ban
else
  echo "fail2ban already installed"
fi

echo "== 5. Instance firewall (iptables) =="
for port in 80 443; do
  if ! sudo iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null; then
    sudo iptables -I INPUT 6 -p tcp --dport "$port" -j ACCEPT
    echo "opened port $port"
  else
    echo "port $port already open"
  fi
done
command -v netfilter-persistent >/dev/null && sudo netfilter-persistent save

if [ "${1:-}" = "--ssl" ]; then
  echo "== 6. HTTPS certificate =="
  command -v certbot >/dev/null || sudo apt-get install -y certbot
  # certonly + webroot: certbot fetches the certificate but never edits nginx
  # files, so this repo's nginx-ssl.conf stays the single source of truth.
  sudo certbot certonly --webroot -w "$ACME_ROOT" \
    -d "$DOMAIN" -d "www.$DOMAIN" \
    --cert-name "$DOMAIN" \
    --non-interactive --keep-until-expiring \
    --deploy-hook "systemctl reload nginx"
  install_site_config
  echo "HTTPS live. certbot's systemd timer renews automatically and reloads nginx."
fi
