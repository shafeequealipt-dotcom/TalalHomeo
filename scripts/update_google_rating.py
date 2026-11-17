#!/usr/bin/env python3
"""
Refresh the clinic's Google rating and review count in src/data/clinic.json.

Runs monthly on the server that hosts the Talal blog agent (deploy/talal-rating.*),
using the agent's existing Google Business Profile sign-in. The Business Profile
API reports the clinic's own average rating and total review count, so no extra
API key is needed. Every page reads the numbers from clinic.json.

Reads from the environment (the agent's .env, loaded by systemd — never pass
these on the command line or write them to a file):
  TALAL_GBP_ClientID, TALAL_GBP_ClientSecret, TALAL_GBP_RefreshToken,
  TALAL_GBP_AccountID, TALAL_GBP_LocationID

  python3 scripts/update_google_rating.py            # update clinic.json if changed
  python3 scripts/update_google_rating.py --dry-run  # print only

Exit code 0 = fine (changed or not), 1 = refused or failed. Stdlib only.
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

CLINIC_JSON = Path(__file__).resolve().parent.parent / "src" / "data" / "clinic.json"

# Overridable only so the script can be tested against a local mock server.
TOKEN_URL = os.environ.get("GBP_TOKEN_URL", "https://oauth2.googleapis.com/token")
INFO_API = os.environ.get("GBP_INFO_API", "https://mybusinessbusinessinformation.googleapis.com/v1")
REVIEWS_API = os.environ.get("GBP_REVIEWS_API", "https://mybusiness.googleapis.com/v4")

# A listing whose title lacks this word is not the clinic — refuse to use it.
NAME_MUST_CONTAIN = "talal"


def max_drop(current: int) -> int:
    # Google removes spam reviews, so small drops are normal. A large one means
    # something is wrong; publishing it would show a wrong number on the site.
    return max(5, -(-current // 10))  # 10%, rounded up, at least 5


def fail(msg: str):
    print(f"✗ {msg}", file=sys.stderr)
    sys.exit(1)


def env(name: str) -> str:
    v = os.environ.get(name, "").strip()
    if not v:
        fail(f"{name} is not set. Run via the talal-rating service, which loads the agent's .env.")
    return v


def call(url: str, *, token: str | None = None, form: dict | None = None) -> dict:
    data = urllib.parse.urlencode(form).encode() if form else None
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    req = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        # Google's message names the real problem (revoked consent, API disabled).
        body = e.read().decode(errors="replace")
        try:
            err = json.loads(body)
            detail = err.get("error")
            if isinstance(detail, dict):  # API errors: {"error": {"message": ...}}
                detail = detail.get("message", detail)
            elif err.get("error_description"):  # OAuth errors: invalid_grant etc.
                detail = f"{detail} — {err['error_description']}"
        except ValueError:
            detail = body[:200]
        fail(f"{url.split('?')[0]} → HTTP {e.code}: {detail}")


def main():
    dry_run = "--dry-run" in sys.argv

    token = call(TOKEN_URL, form={
        "client_id": env("TALAL_GBP_ClientID"),
        "client_secret": env("TALAL_GBP_ClientSecret"),
        "refresh_token": env("TALAL_GBP_RefreshToken"),
        "grant_type": "refresh_token",
    }).get("access_token") or fail("Google returned no access token.")

    account, location = env("TALAL_GBP_AccountID"), env("TALAL_GBP_LocationID")

    title = call(f"{INFO_API}/locations/{location}?readMask=title", token=token).get("title", "")
    if NAME_MUST_CONTAIN not in title.lower():
        fail(f'Location {location} is "{title}", not the clinic. Check TALAL_GBP_LocationID.')

    reviews = call(f"{REVIEWS_API}/accounts/{account}/locations/{location}/reviews?pageSize=1", token=token)
    rating, count = reviews.get("averageRating"), reviews.get("totalReviewCount")
    if not isinstance(rating, (int, float)) or not 1 <= rating <= 5:
        fail(f"Unexpected average rating from Google: {rating!r}")
    if not isinstance(count, int) or count < 0:
        fail(f"Unexpected review count from Google: {count!r}")

    clinic = json.loads(CLINIC_JSON.read_text(encoding="utf-8"))
    before = clinic["rating"]
    if before["count"] - count > max_drop(before["count"]):
        fail(f"Review count fell from {before['count']} to {count} — larger than normal review "
             "removal. Nothing written; check the listing by hand.")

    value = f"{rating:.1f}"
    summary = f"{value} from {count} reviews"
    print(f"{title}: {summary}  (site had {before['value']} from {before['count']})")

    if value == before["value"] and count == before["count"]:
        print("No change.")
    elif dry_run:
        print("Dry run — nothing written.")
    else:
        clinic["rating"] = {**before, "value": value, "count": count}
        CLINIC_JSON.write_text(json.dumps(clinic, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"✓ clinic.json updated: {summary}")


if __name__ == "__main__":
    main()
