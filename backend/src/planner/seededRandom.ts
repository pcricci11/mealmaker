/**
 * Mulberry32 PRNG — deterministic, fast, good distribution.
 * Same seed always produces the same sequence.
 */
export function createRng(seed: number): () => number {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Derive a deterministic seed from familyId + weekStart.
 * weekStart must be a Monday in YYYY-MM-DD format.
 */
export function deriveSeed(familyId: number, weekStart: string): number {
  let hash = familyId * 2654435761; // Knuth multiplicative hash
  for (let i = 0; i < weekStart.length; i++) {
    hash = ((hash << 5) - hash + weekStart.charCodeAt(i)) | 0;
  }
  return hash;
}

/** Seeded Fisher-Yates shuffle — does not mutate original. */
export function seededShuffle<T>(arr: T[], rng: () => number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Normalize any date to the Monday of its ISO week (YYYY-MM-DD).
 * If input is already a Monday, returns it unchanged.
 */
export function normalizeToMonday(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const dayOfWeek = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}
