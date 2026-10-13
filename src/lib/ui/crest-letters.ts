import { getInitials } from "@/lib/data/match-utils";

/**
 * The letters drawn in a program's crest tile when it has no uploaded image.
 *
 * The school's short code ("UCI") when it is 1-3 characters once trimmed,
 * uppercased; otherwise the initials of the name, cut to three characters.
 * A longer code ("STAN") is not a crest mark, so it falls through to the name.
 * Pure so a spec can import it without React.
 */
export function crestLetters(
  shortCode: string | null | undefined,
  name: string,
): string {
  const code = (shortCode ?? "").trim();
  if (code.length >= 1 && code.length <= 3) return code.toUpperCase();
  return getInitials(name).slice(0, 3);
}
