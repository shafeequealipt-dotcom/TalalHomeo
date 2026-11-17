#!/usr/bin/env bash
# Monthly: refresh the Google rating/review count and publish it.
# Run by talal-rating.service on the Talal agent server, in the agent's
# checkout of this repo. Pushing to main triggers the normal site deploy.
set -euo pipefail

REPO=/opt/talal-agent/TalalHomeo
cd "$REPO"

# Start from GitHub's latest. --ff-only refuses rather than merging if the
# checkout has somehow diverged; better to fail loudly than push a mess.
git fetch origin
git merge --ff-only origin/main

python3 scripts/update_google_rating.py

if git diff --quiet -- src/data/clinic.json; then
  exit 0
fi

summary=$(python3 -c "import json;r=json.load(open('src/data/clinic.json'))['rating'];print(f\"{r['value']} from {r['count']} reviews\")")
git add src/data/clinic.json
git commit -q -m "Update Google rating: $summary"
git push -q origin main
echo "✓ pushed: $summary"
