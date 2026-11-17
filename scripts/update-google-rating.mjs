#!/usr/bin/env node
/**
 * Refreshes the clinic's Google rating and review count in src/data/clinic.json.
 *
 * Runs monthly from .github/workflows/update-rating.yml, which commits the
 * change and redeploys. Every page reads the numbers from clinic.json, so this
 * one file is all that needs to change.
 *
 * Uses Google's official Places API (New) rather than scraping Google Maps:
 * Maps serves signed-out visitors a "limited view" and changes its markup
 * without notice, so a scraper would silently break or start reading the
 * wrong numbers.
 *
 * Needs GOOGLE_PLACES_API_KEY in the environment — a GitHub Actions secret in
 * CI, an `export` line in ~/.zshrc for local runs. Never put the key in a file.
 *
 *   npm run update:rating               # fetch and write clinic.json
 *   npm run update:rating -- --dry-run  # fetch and print, write nothing
 *
 * The first run looks the clinic up by name and saves its Google Place ID into
 * clinic.json (`googlePlaceId`), so later runs fetch it directly.
 */

import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const CLINIC_JSON = fileURLToPath(new URL('../src/data/clinic.json', import.meta.url));
// Overridable only so the script can be tested against a local mock server.
const API = process.env.PLACES_API_BASE || 'https://places.googleapis.com/v1';

// A listing whose name lacks this word is not the clinic — refuse to use it.
const NAME_MUST_CONTAIN = 'talal';

// Google does remove reviews (spam filtering, deleted accounts), so a small
// drop is normal. A large one almost always means the wrong place was matched,
// and writing it would publish a wrong number — stop and ask a human instead.
const MAX_DROP = (current) => Math.max(5, Math.ceil(current * 0.1));

const dryRun = process.argv.includes('--dry-run');

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

async function places(path, { method = 'GET', fieldMask, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY,
      'X-Goog-FieldMask': fieldMask,
      ...(body && { 'Content-Type': 'application/json' }),
    },
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Google's error message names the real problem (API not enabled, key
    // restricted, billing off) — surface it rather than a bare status code.
    fail(`Places API ${res.status}: ${data.error?.message || res.statusText}`);
  }
  return data;
}

const nameOk = (place) => place?.displayName?.text?.toLowerCase().includes(NAME_MUST_CONTAIN);

async function findPlaceId(clinic) {
  const textQuery = `${clinic.name} ${clinic.address.line2} ${clinic.address.city}`;
  console.log(`No googlePlaceId yet — searching Google for "${textQuery}"`);
  const { places: results = [] } = await places('/places:searchText', {
    method: 'POST',
    fieldMask: 'places.id,places.displayName,places.formattedAddress',
    body: { textQuery },
  });
  const match = results.find(nameOk);
  if (!match) {
    fail(
      `No result named like the clinic. Got: ${results.map((p) => p.displayName?.text).join(' | ') || 'nothing'}. ` +
        'Set "googlePlaceId" in clinic.json by hand.'
    );
  }
  console.log(`Found: ${match.displayName.text} — ${match.formattedAddress} (${match.id})`);
  return match.id;
}

async function main() {
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    fail(
      'GOOGLE_PLACES_API_KEY is not set. In CI, add it as a repository secret; ' +
        'locally, export it from ~/.zshrc and launch from a terminal.'
    );
  }

  const raw = await readFile(CLINIC_JSON, 'utf8');
  const clinic = JSON.parse(raw);
  const before = clinic.rating;

  const placeId = clinic.googlePlaceId || (await findPlaceId(clinic));

  const place = await places(`/places/${encodeURIComponent(placeId)}`, {
    fieldMask: 'displayName,rating,userRatingCount',
  });

  if (!nameOk(place)) {
    fail(`Place ${placeId} is "${place.displayName?.text}", not the clinic. Check googlePlaceId in clinic.json.`);
  }
  const { rating, userRatingCount: count } = place;
  if (typeof rating !== 'number' || rating < 1 || rating > 5) fail(`Unexpected rating from Google: ${rating}`);
  if (!Number.isInteger(count) || count < 0) fail(`Unexpected review count from Google: ${count}`);

  const drop = before.count - count;
  if (drop > MAX_DROP(before.count)) {
    fail(
      `Review count fell from ${before.count} to ${count}. That's larger than normal review removal ` +
        '— likely the wrong listing. Nothing written; check by hand.'
    );
  }

  const value = rating.toFixed(1);
  const changed = value !== before.value || count !== before.count || placeId !== clinic.googlePlaceId;
  const summary = `${value} from ${count} reviews`;

  console.log(`Google now: ${summary}  (was ${before.value} from ${before.count})`);

  if (changed && !dryRun) {
    clinic.rating = { ...before, value, count };
    clinic.googlePlaceId = placeId;
    // Keep the file's existing 2-space formatting and trailing newline.
    await writeFile(CLINIC_JSON, JSON.stringify(clinic, null, 2) + '\n');
    console.log('✓ clinic.json updated');
  } else {
    console.log(dryRun ? 'Dry run — nothing written.' : 'No change.');
  }

  // Hand the result to the GitHub Actions workflow for its commit message.
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `changed=${changed && !dryRun}\nsummary=${summary}\n`);
  }
}

main().catch((err) => fail(err.message));
