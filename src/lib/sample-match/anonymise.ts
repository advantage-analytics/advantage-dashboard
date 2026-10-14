/**
 * Turn one real match into the sample match a first-run dashboard shows.
 *
 * Pure — no I/O, no Supabase — so the build script can run it over a live
 * read and the fixture guard spec can run it over a hand-written one. The
 * input is exactly what `getMatchDetailData` returns, so the fixture it
 * produces plugs into the same components with nothing re-shaped.
 *
 * `anonymiseMatchDetail` rewrites; `assertSampleClean` refuses. They are kept
 * separate on purpose: the build script runs both, so a name the rewriter
 * missed — a nickname in an insight, a school in a tournament name — fails the
 * build rather than landing in a committed JSON file. Both players' names
 * (read from the source itself, never written here) and every uuid are
 * replaced wholesale, and nothing else is trusted to be clean.
 */

import type { MatchDetailData } from "@/lib/data/match-detail-server";

export interface SampleNames {
  player1: string;
  player2: string;
}

export const SAMPLE_NAMES: SampleNames = {
  player1: "Jordan Avery",
  player2: "Sam Ellis",
};

/**
 * The shape the fixture carries: `getMatchDetailData`'s, with the viewer
 * pinned to seat one and no KPI history — a sample has no "other matches" to
 * draw a baseline from, and an empty history is what the tiles already treat
 * as "no baseline".
 */
export type SampleMatchData = Omit<MatchDetailData, "kpiHistory"> & {
  kpiHistory: [];
};

/** Every id the fixture may carry starts with this; the last 12 hex digits count. */
export const SAMPLE_ID_PREFIX = "00000000-0000-4000-8000-";

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * A 53-bit hash of one word, lower-cased (cyrb53). Pure and synchronous, so
 * the guard runs the same in the build script, the spec and a browser bundle.
 */
export function tokenHash(word: string): string {
  const text = word.toLowerCase();
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** One word at a time: letters and digits, any script. */
const WORD_RE = /[\p{L}\p{N}]+/gu;

/**
 * Words the committed fixture must never contain: every part of the source
 * match's two players' names, the short forms they go by, and the real
 * program and its key. Held as {@link tokenHash}es so this file does not
 * itself name the people the sample was made from. That keeps them out of
 * casual reading only — it is not a secret: a dictionary of names reverses a
 * hash like this. Rebuilding from a different match means adding its words'
 * hashes here (`tokenHash("name")` in a Node REPL).
 */
export const BANNED_WORD_HASHES: ReadonlySet<string> = new Set([
  "2f5v9ewkjai",
  "axkrpf17zh",
  "qndpdehw6n",
  "1wzx00smpzb",
  "14g5vrh16ps",
  "l3beyvtzxz",
  "9ukj2r5yv2",
]);

/**
 * The real program behind the source match, rewritten word by word: its name
 * becomes a made-up one, its key goes. Keyed by {@link tokenHash} for the same
 * reason as {@link BANNED_WORD_HASHES}.
 */
const PROGRAM_WORD_REWRITES: ReadonlyMap<string, string> = new Map([
  ["9ukj2r5yv2", ""],
  ["l3beyvtzxz", "Westbrook"],
]);

/**
 * The vendor's internal name, as it appears on screen. `splitstep` is internal
 * naming only (AGENTS.md); the product calls it Advantage Intelligence.
 */
const VENDOR_INTERNAL = "splitstep";
const VENDOR_RE = /splitstep/gi;
const VENDOR_NAME = "Advantage Intelligence";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The replacements for one player: their full name first, then each part on
 * its own so an insight that uses a first name alone is rewritten too. Parts shorter
 * than three characters are skipped — an initial would match inside ordinary
 * words.
 */
function nameRules(from: string, to: string): Array<[RegExp, string]> {
  const rules: Array<[RegExp, string]> = [
    [new RegExp(`\\b${escapeRegExp(from)}\\b`, "gi"), to],
  ];
  const fromParts = from.split(/\s+/).filter(Boolean);
  const toParts = to.split(/\s+/).filter(Boolean);
  fromParts.forEach((part, i) => {
    if (part.length < 3) return;
    const replacement = toParts[Math.min(i, toParts.length - 1)] ?? to;
    rules.push([new RegExp(`\\b${escapeRegExp(part)}\\b`, "gi"), replacement]);
  });
  return rules;
}

/** Deep-map every string in a JSON-shaped value, returning a new value. */
function mapStrings<T>(value: T, fn: (text: string) => string): T {
  if (typeof value === "string") return fn(value) as unknown as T;
  if (Array.isArray(value)) {
    return value.map((item) => mapStrings(item, fn)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as object)) {
      out[key] = mapStrings(item, fn);
    }
    return out as T;
  }
  return value;
}

/** Walk every string in a JSON-shaped value with its path. */
function forEachString(
  value: unknown,
  fn: (text: string, path: string) => void,
  path = "$",
): void {
  if (typeof value === "string") {
    fn(value, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => forEachString(item, fn, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value as object)) {
      forEachString(item, fn, `${path}.${key}`);
    }
  }
}

/**
 * A placeholder uuid per source id, handed out in order of first sight —
 * deterministic for one input, so a rebuilt fixture diffs cleanly.
 */
function placeholderIds(): (sourceId: string) => string {
  const seen = new Map<string, string>();
  return (sourceId) => {
    const key = sourceId.toLowerCase();
    let id = seen.get(key);
    if (!id) {
      id = SAMPLE_ID_PREFIX + String(seen.size + 1).padStart(12, "0");
      seen.set(key, id);
    }
    return id;
  };
}

/**
 * The match with both players renamed, every uuid replaced by a placeholder,
 * every tie to the real program, uploader and viewer dropped, and the vendor
 * named as the product names it. Returns a new object; the input is untouched.
 *
 * `foldUnreconciled` is carried through exactly as the loader produced it —
 * the fixture must say what the real derivation said (design note).
 */
export function anonymiseMatchDetail(
  data: MatchDetailData,
  names: SampleNames = SAMPLE_NAMES,
  /**
   * More `[from, to]` word rewrites, applied like the players' names — a
   * source whose program is not in `PROGRAM_WORD_REWRITES`, or a spec's
   * synthetic one.
   */
  extraRewrites: ReadonlyArray<readonly [string, string]> = [],
): SampleMatchData {
  const player1 = data.match.player1.name;
  const player2 = data.match.player2.name;
  const rules: Array<[RegExp, string]> = [
    ...nameRules(player1, names.player1),
    ...nameRules(player2, names.player2),
    ...extraRewrites.map(([from, to]): [RegExp, string] => [
      new RegExp(`\\b${escapeRegExp(from)}\\b`, "gi"),
      to,
    ]),
    [VENDOR_RE, VENDOR_NAME],
  ];
  const placeholder = placeholderIds();

  const rewrite = (text: string): string => {
    let out = text;
    for (const [pattern, replacement] of rules) {
      out = out.replace(pattern, replacement);
    }
    out = out.replace(
      WORD_RE,
      (word) => PROGRAM_WORD_REWRITES.get(tokenHash(word)) ?? word,
    );
    return out.replace(UUID_RE, (id) => placeholder(id));
  };

  const mapped = mapStrings(data, rewrite);

  // Keys the walk above cannot know are ties to real people rather than text.
  const match = { ...mapped.match };
  delete (match as { programId?: unknown }).programId;
  delete match.eventId;
  delete match.uploadedBy;
  match.player1 = { ...match.player1, name: names.player1 };
  match.player2 = { ...match.player2, name: names.player2 };
  // "You" is seat one, so the result follows the seat, not the old viewer.
  match.isUserPlayer1 = true;
  match.won = match.score.winner === "player1";

  // Bookmarks are a workspace's — who saved which point — not the match's.
  const points = mapped.points
    ? mapped.points.map((point) => ({ ...point, saved: false, savedBy: [] }))
    : mapped.points;

  const statsResult = mapped.statsResult
    ? {
        ...mapped.statsResult,
        player1Name: names.player1,
        player2Name: names.player2,
      }
    : mapped.statsResult;

  return {
    ...mapped,
    match,
    statsResult,
    points,
    kpiHistory: [],
  };
}

export interface SampleCleanOptions {
  /**
   * Plain words that must not appear either, matched case-insensitively
   * inside any string — the build script passes the source's own names, a
   * spec its synthetic ones.
   */
  banned?: readonly string[];
  /** The hashed word list checked word by word. Defaults to {@link BANNED_WORD_HASHES}. */
  bannedHashes?: ReadonlySet<string>;
}

/**
 * Throws, naming the first offender and where it sits, when the value carries
 * the vendor's internal name, a banned word (hashed or plain), or a uuid that
 * is not a placeholder. Takes any JSON-shaped value so the build script can
 * check the object it is about to write and the spec can check the file that
 * was written.
 */
export function assertSampleClean(
  json: unknown,
  { banned = [], bannedHashes = BANNED_WORD_HASHES }: SampleCleanOptions = {},
): void {
  forEachString(json, (text, path) => {
    const lower = text.toLowerCase();
    for (const word of [VENDOR_INTERNAL, ...banned]) {
      if (lower.includes(word.toLowerCase())) {
        throw new Error(
          `sample match is not clean: "${word}" found at ${path}`,
        );
      }
    }
    for (const word of text.match(WORD_RE) ?? []) {
      if (bannedHashes.has(tokenHash(word))) {
        throw new Error(
          `sample match is not clean: banned word "${word}" found at ${path}`,
        );
      }
    }
    for (const id of text.match(UUID_RE) ?? []) {
      if (!id.startsWith(SAMPLE_ID_PREFIX)) {
        throw new Error(
          `sample match is not clean: uuid ${id} at ${path} is not a placeholder`,
        );
      }
    }
  });
}

/** Whether a string is one of the fixture's placeholder ids. */
export function isSampleId(id: string): boolean {
  return (
    id.startsWith(SAMPLE_ID_PREFIX) &&
    id.length === SAMPLE_ID_PREFIX.length + 12
  );
}
