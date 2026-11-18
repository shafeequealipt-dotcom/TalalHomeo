#!/usr/bin/env python3
"""
Refresh the clinic's Google rating, review count and review pool.

  1. Rating + count  -> src/data/clinic.json  ("rating")
  2. Review pool     -> src/data/reviews-pool.json: every 5-star review with a
     real explanation, which the site rotates through monthly (src/lib/pick-reviews.mjs)

Runs monthly on the server that hosts the Talal blog agent (deploy/talal-rating.*),
using the agent's existing Google Business Profile sign-in. The Business Profile
API reports the clinic's own average rating and total review count, so no extra
API key is needed. Every page reads the numbers from clinic.json.

Reads from the environment (the agent's .env, loaded by systemd — never pass
these on the command line or write them to a file):
  TALAL_GBP_ClientID, TALAL_GBP_ClientSecret, TALAL_GBP_RefreshToken,
  TALAL_GBP_AccountID, TALAL_GBP_LocationID

  python3 scripts/update_google_rating.py            # update both files if changed
  python3 scripts/update_google_rating.py --dry-run  # print only, incl. every pool review

Exit code 0 = fine (changed or not), 1 = refused or failed. Stdlib only.
"""

import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "src" / "data"
CLINIC_JSON = DATA / "clinic.json"
POOL_JSON = DATA / "reviews-pool.json"

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


# ---------------------------------------------------------------- review pool
#
# "Good explanation" = enough words to say what happened, in English, without
# wording a health site shouldn't publish as a patient claim.

MIN_WORDS = 25
MAX_CHARS = 420  # longer reviews are cut at a sentence end, marked with "…"

# Patient testimonials are advertising. Claims of a cure or guaranteed outcome,
# and serious diagnoses, stay off the site even when the review is 5-star.
BLOCKED = re.compile(
    r"\b(cure[ds]?|curing|miracle|guarantee[ds]?|permanent(ly)?|cancer|tumou?r)\b"
    r"|https?://|www\.|\d{8,}",  # links and phone numbers
    re.I,
)

# Short common words: a review written in English uses plenty of them, while
# Malayalam written in Latin letters ("nalla oru consultation…") uses almost none.
ENGLISH = set("""the and was is to my for with very of a i we it in this he she her his
our me after that but have had has so they were be are on at good doctor treatment""".split())

# First match wins, so the more specific complaints come first.
TOPICS = [
    ("Adenoids", r"adenoid"),
    ("Piles", r"\bpiles\b|fissure|fistula|ha?emorrhoid"),
    ("Migraine", r"migraine|headache"),
    ("Carpal tunnel", r"carpal|\bcts\b|wrist"),
    ("Allergy", r"allerg|sneez|rhinitis|sinus|asthma|wheez"),
    ("Skin", r"eczema|psoria|\bskin\b|rash|itch|acne|urticaria"),
    ("Hair", r"\bhair\b|dandruff|alopecia"),
    ("Cough & cold", r"cough|\bcold\b|fever|tonsil"),
    ("Digestion", r"acidity|gastric|stomach|\bibs\b|constipation|digest"),
    ("Thyroid", r"thyroid"),
    ("Joint pain", r"joint|knee|arthritis|back pain"),
]
EMOJI = re.compile("[\U0001F000-\U0001FFFF☀-➿️‍]")


def short_name(display: str) -> str:
    """'SUMAYYA NOUFAL' -> 'Sumayya N.'  (first name + last initial only)."""
    parts = display.split()
    first = parts[0] if parts[0][:1].isupper() and not parts[0].isupper() else parts[0].capitalize()
    return f"{first} {parts[-1][0].upper()}." if len(parts) > 1 else first


def trim(text: str) -> str:
    if len(text) <= MAX_CHARS:
        return text
    cut = text[:MAX_CHARS]
    end = max(cut.rfind(". "), cut.rfind("! "), cut.rfind("? "))
    return (cut[: end + 1] if end > MAX_CHARS // 2 else cut.rsplit(" ", 1)[0]) + " …"


def judge(review: dict, exclude: list[str]) -> tuple[str | None, dict | None]:
    """Return (reason it was left out, None) or (None, pool entry)."""
    if review.get("starRating") != "FIVE":
        return "not 5-star", None
    reviewer = review.get("reviewer") or {}
    display = (reviewer.get("displayName") or "").strip()
    if reviewer.get("isAnonymous") or not display:
        return "anonymous", None
    if any(x in display.lower() for x in exclude):
        return "excluded reviewer", None
    text = " ".join(EMOJI.sub("", review.get("comment") or "").split())
    if "(Translated by Google)" in text or "(Original)" in text:
        return "not English", None
    words = re.findall(r"[A-Za-z']+", text.lower())
    if len(words) < MIN_WORDS:
        return "too short", None
    if sum(w in ENGLISH for w in words) / len(words) < 0.15:
        return "not English", None
    if BLOCKED.search(text):
        return "claim/link wording", None
    topic = next((name for name, pat in TOPICS if re.search(pat, text, re.I)), "General care")
    return None, {
        # Hash, not Google's id, so nothing ties back to the reviewer's account.
        "id": hashlib.sha1(review["reviewId"].encode()).hexdigest()[:12],
        "name": short_name(display),
        "rating": 5,
        "topic": topic,
        "text": trim(text),
        "month": (review.get("createTime") or "")[:7],
    }


def update_pool(token: str, account: str, location: str, total: int, exclude: list[str], dry_run: bool):
    fetched, page = [], ""
    for _ in range(40):  # 50 per page; 40 pages is far beyond this listing's size
        q = "pageSize=50&orderBy=updateTime%20desc" + (f"&pageToken={page}" if page else "")
        data = call(f"{REVIEWS_API}/accounts/{account}/locations/{location}/reviews?{q}", token=token)
        fetched += data.get("reviews", [])
        page = data.get("nextPageToken")
        if not page:
            break
    if total and not fetched:
        fail(f"Google reports {total} reviews but returned none. Pool left unchanged.")

    reasons, pool = {}, []
    for r in fetched:
        why, entry = judge(r, exclude)
        if why:
            reasons[why] = reasons.get(why, 0) + 1
        else:
            pool.append(entry)
    pool.sort(key=lambda e: e["id"])

    topics = {}
    for e in pool:
        topics[e["topic"]] = topics.get(e["topic"], 0) + 1
    print(f"Review pool: {len(pool)} of {len(fetched)} reviews qualify. Left out: {reasons or 'none'}")
    print(f"  topics: {dict(sorted(topics.items(), key=lambda kv: -kv[1]))}")

    if dry_run:
        for e in pool:
            print(f"  [{e['topic']}] {e['name']}: {e['text'][:110]}")
        print("Dry run — pool not written.")
        return

    new = json.dumps({
        "_about": "Generated monthly by scripts/update_google_rating.py from the clinic's Google "
                  "Business Profile. 5-star reviews with a real explanation only. Do not edit by hand.",
        "reviews": pool,
    }, ensure_ascii=False, indent=2) + "\n"
    if POOL_JSON.exists() and POOL_JSON.read_text(encoding="utf-8") == new:
        print("Pool unchanged.")
    else:
        POOL_JSON.write_text(new, encoding="utf-8")
        print(f"✓ reviews-pool.json updated: {len(pool)} reviews")


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

    update_pool(token, account, location, count,
                [x.lower() for x in clinic.get("reviewExclude", [])], dry_run)


if __name__ == "__main__":
    main()
