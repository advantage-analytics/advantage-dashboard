/**
 * Pure rules for the Video tab's point notes and tags — no Supabase, no React,
 * so the specs can pin them directly.
 *
 * The limits mirror the CHECKs in
 * `supabase/migrations/20261104021629_point_notes_and_tags.sql`: a client that
 * normalizes with these never sends a row the table would refuse.
 */

/** `point_notes.body`: 1–2000 characters once trimmed. */
export const NOTE_MAX_LENGTH = 2000;
/** `point_tags.name`: 1–40 characters once trimmed. */
export const TAG_MAX_LENGTH = 40;

/** The note as it would be stored, or null when there is nothing to send. */
export function normalizeNoteBody(raw: string): string | null {
  const body = raw.trim();
  if (body.length === 0 || body.length > NOTE_MAX_LENGTH) return null;
  return body;
}

/**
 * A tag name as stored: trimmed, inner runs of whitespace collapsed. Null when
 * empty or too long. Uniqueness is case-insensitive in the table, so two names
 * that differ only in case are the same tag — see {@link sameTagName}.
 */
export function normalizeTagName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length === 0 || name.length > TAG_MAX_LENGTH) return null;
  return name;
}

/** The table's uniqueness rule: `lower(btrim(name))`. */
export function sameTagName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * "just now", "5 min ago", "3 hours ago", "2 days ago", then a short date —
 * the age of a note in the thread. `now` is injectable for the specs.
 */
export function noteAge(createdAt: string, now: Date = new Date()): string {
  const then = new Date(createdAt);
  const seconds = Math.max(0, (now.getTime() - then.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return days === 1 ? "1 day ago" : `${days} days ago`;
  // A real moment (created_at), so the viewer's own calendar is right here —
  // unlike `matches.date`, which is a calendar day (match-day.ts).
  return then.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(then.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/**
 * Tags that match what the viewer typed in the picker, applied ones excluded,
 * and whether "Create '…'" should be offered (nothing matches exactly).
 */
export function tagSuggestions<T extends { id: string; name: string }>(
  vocabulary: T[],
  appliedIds: ReadonlySet<string>,
  query: string,
): { matches: T[]; canCreate: boolean } {
  const q = query.trim().toLowerCase();
  const available = vocabulary.filter((t) => !appliedIds.has(t.id));
  const matches = q
    ? available.filter((t) => t.name.toLowerCase().includes(q))
    : available;
  const canCreate =
    normalizeTagName(query) !== null &&
    !vocabulary.some((t) => sameTagName(t.name, query));
  return { matches, canCreate };
}
