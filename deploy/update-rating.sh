#!/usr/bin/env bash
# Monthly: refresh the Google rating, review count and review pool, and publish them.
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

# reviews-pool.json may be new (untracked), so stage before checking for changes.
# Only these two files: the blog agent shares this checkout, and anything it
# has staged must not end up in this commit.
FILES="src/data/clinic.json src/data/reviews-pool.json"
git add $FILES
if git diff --cached --quiet -- $FILES; then
  exit 0
fi

summary=$(python3 -c "import json;r=json.load(open('src/data/clinic.json'))['rating'];n=len(json.load(open('src/data/reviews-pool.json'))['reviews']);print(f\"{r['value']} from {r['count']} reviews, {n} in the rotation pool\")")
# Identity passed per-commit (as the blog agent does) rather than relying on
# server git config, which is unset.
git -c user.name="Talal Homeo Bot" -c user.email="bot@drtalalhomeo.in" \
  commit -q -m "Update Google rating and review pool: $summary" -- $FILES
git push -q origin main
echo "✓ pushed: $summary"
