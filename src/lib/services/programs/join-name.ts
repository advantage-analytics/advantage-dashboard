/**
 * The name a joining account needs, as pure rules.
 *
 * Apart from `join-state-server.ts` so an offline spec can pin them without
 * loading the Supabase server client that file reads the session with.
 */

/** A profile counts as named once it has a first name. One rule, two readers. */
export function hasProfileName(firstName: string | null | undefined): boolean {
  return (firstName ?? "").trim().length > 0;
}

/**
 * A roster row's display name, as the two fields the name step shows.
 *
 * The preview hands back one string. The last word is the last name and the
 * rest is the first — wrong for some names, which is why this only ever
 * PREFILLS a field the person can correct and is never written anywhere.
 */
export function splitRosterName(name: string | null | undefined): {
  firstName: string;
  lastName: string;
} {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { firstName: "", lastName: "" };
  if (words.length === 1) return { firstName: words[0], lastName: "" };
  return {
    firstName: words.slice(0, -1).join(" "),
    lastName: words[words.length - 1],
  };
}
