/**
 * Pure formatting for the Admin › Conferences page — no I/O, no server
 * imports, so the drawer (a client component) and the pure specs can both
 * import it.
 */

/**
 * The stored form of a conference website: no scheme, no trailing slash,
 * host lower-cased (the path keeps its case — paths can be case-sensitive).
 * Empty or whitespace-only input, or something with no dotted host, is null.
 *
 * "https://IvyLeague.com/" → "ivyleague.com"
 */
export function normalizeWebsite(
  input: string | null | undefined,
): string | null {
  const trimmed = input?.trim() ?? "";
  if (!trimmed) return null;

  const withoutScheme = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const withoutSlash = withoutScheme.replace(/\/+$/, "");
  if (!withoutSlash) return null;

  const slash = withoutSlash.indexOf("/");
  const host = slash === -1 ? withoutSlash : withoutSlash.slice(0, slash);
  const rest = slash === -1 ? "" : withoutSlash.slice(slash);

  // A host is dotted labels with no whitespace — "not a url" is not one.
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?$/i.test(host)) return null;

  return `${host.toLowerCase()}${rest}`;
}

/** The link target for a stored website. Stored values carry no scheme. */
export function websiteHref(website: string): string {
  const value = website.trim();
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

const FILLER_WORDS = new Set(["conference", "the", "of", "and"]);

/**
 * What the square conference mark prints: the short name when it fits
 * (≤ 3 characters), otherwise the initials of the name — digits kept whole,
 * "Conference" and filler words skipped, capped at three characters — so
 * "Big 12" and "Big 12 Conference" → "B12", "Atlantic Coast Conference" → "AC".
 */
export function conferenceInitials(
  name: string,
  shortName: string | null,
): string {
  const short = shortName?.trim() ?? "";
  if (short.length > 0 && short.length <= 3) return short.toUpperCase();

  const words = name
    .trim()
    .split(/[\s\-–—/&]+/)
    .filter(Boolean);
  // "Conference" is on nearly every name and says nothing in a 3-character
  // mark; drop it (and filler words) unless that would leave nothing.
  const meaningful = words.filter(
    (word) => !FILLER_WORDS.has(word.toLowerCase()),
  );
  const initials = (meaningful.length > 0 ? meaningful : words)
    .map((word) => (/^\d+$/.test(word) ? word : word.charAt(0)))
    .join("")
    .toUpperCase()
    .slice(0, 3);

  return initials || short.slice(0, 3).toUpperCase();
}

/** The editable fields of a conference, as the drawer holds them. */
export interface ConferenceDraft {
  name: string | null;
  shortName: string | null;
  division: string | null;
  website: string | null;
}

function same(a: string | null | undefined, b: string | null | undefined) {
  return (a?.trim() ?? "") === (b?.trim() ?? "");
}

/**
 * Whether the drawer's draft differs from what is saved. null ↔ "" and
 * whitespace-only edits are not changes — the RPC trims and nullifs every
 * field, so saving them would write the same row.
 */
export function conferenceChanged(
  saved: ConferenceDraft,
  draft: ConferenceDraft,
): boolean {
  return (
    !same(saved.name, draft.name) ||
    !same(saved.shortName, draft.shortName) ||
    !same(saved.division, draft.division) ||
    !same(saved.website, draft.website)
  );
}
