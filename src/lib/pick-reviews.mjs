/**
 * Monthly review rotation for the home page slider.
 *
 * The pool (src/data/reviews-pool.json) is refreshed monthly on the agent server
 * from Google. This module picks which reviews to show this month. It is pure
 * and stateless: the same pool and month always give the same picks, so every
 * build in a month shows the same set, and the set changes on the 1st through
 * the daily scheduled deploy, with no commit needed.
 *
 * How the picks avoid repeating month to month:
 *  - Every review sits at a fixed point on a circle, from a hash of its id.
 *    New reviews joining the pool slot in at their own point; nothing moves.
 *  - Each month starts reading the circle at month × golden ratio (mod 1).
 *    Those start points are spread evenly and never depend on the pool size,
 *    so a growing pool can't shift them. Consecutive months land 38% of the
 *    circle apart, so they share no reviews while 8 picks cover less than
 *    that: none at all from about 30 reviews in the pool, the odd one at 25.
 *  - At most `maxPerTopic` reviews per topic, so one condition can't fill a month.
 */

const GOLDEN = 0.6180339887498949;

/** "2026-11" for the given date, in India time (the 1st starts at IST midnight). */
export function monthKey(date = new Date()) {
  const ist = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** FNV-1a: a small, stable string hash — same input, same number, every build. */
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * @param {{id: string, topic: string}[]} pool  qualifying reviews (already 5-star)
 * @param {string} month                        "YYYY-MM"
 * @param {number} count                        how many to show
 * @param {number} maxPerTopic                  variety cap
 */
export function pickMonthly(pool, month, count = 8, maxPerTopic = 3) {
  if (pool.length <= count) return [...pool];

  const [y, m] = month.split('-').map(Number);
  const theta = ((y * 12 + (m - 1)) * GOLDEN) % 1;
  // Distance of each review's point ahead of this month's start, going round the circle.
  const ahead = (r) => (hash(r.id) / 2 ** 32 - theta + 1) % 1;
  const order = [...pool].sort((a, b) => ahead(a) - ahead(b) || a.id.localeCompare(b.id));

  const take = (cap) => {
    const picks = [];
    const perTopic = {};
    for (let i = 0; i < order.length && picks.length < count; i++) {
      const r = order[i];
      if ((perTopic[r.topic] || 0) >= cap) continue;
      perTopic[r.topic] = (perTopic[r.topic] || 0) + 1;
      picks.push(r);
    }
    return picks;
  };

  // If the pool is too lopsided to fill a month under the cap, relax it.
  let picks = take(maxPerTopic);
  for (let cap = maxPerTopic + 1; picks.length < count; cap++) picks = take(cap);
  return picks;
}
