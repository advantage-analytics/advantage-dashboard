/**
 * Shared primitives for admin-console validation.
 *
 * The admin dual/tournament result forms and their server-side submission
 * validators each defined their own copy of these same checks. Every export
 * here is the exact logic those copies already agreed on — nothing is
 * tightened or loosened. A caller with a genuinely different requirement (for
 * example a looser date check) keeps its own local definition rather than
 * bending this one to fit; do not "fix" such a caller by pointing it here.
 */

/** Canonical RFC-4122-shaped UUID, case-insensitive. */
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A 32-character lowercase hex fingerprint/concurrency token. */
export const FINGERPRINT_RE = /^[a-f0-9]{32}$/;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function isFingerprint(value: unknown): value is string {
  return typeof value === "string" && FINGERPRINT_RE.test(value);
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

export function isNonEmptyText(value: unknown): value is string {
  return (
    typeof value === "string" && value.trim().length > 0 && value.length <= 200
  );
}

/** A YYYY-MM-DD string that is also a real calendar date (rejects e.g. Feb 30). */
export function isValidDateString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
