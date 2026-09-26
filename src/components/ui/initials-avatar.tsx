import { getInitials } from "@/lib/data/match-utils";
import { PersonAvatar } from "@/components/ui/person-avatar";

/**
 * The 26px initials mark that leads a person's name in a table row.
 *
 * Data Table law 1: the name at 13/500 ink-900 sits beside its 26px mark, and
 * every list opens its name column the same way — a player on the Roster, an
 * opponent on Matches, the program or tournament mark on Schedule
 * (`EventMark`, the non-person cousin of this one). It was private to the
 * roster table for a while, which is how Matches came to draw its opponent
 * bare and stopped looking like the other two lists.
 *
 * `photoUrl` swaps the initials for the person's photo at the same size, for
 * someone on the program who set one. An opponent never has one to pass.
 *
 * `aria-hidden` on purpose: the initials are a glyph for the name beside
 * them, not a second reading of it.
 */
export function InitialsAvatar({
  name,
  photoUrl,
}: {
  name: string;
  photoUrl?: string | null;
}) {
  return (
    <PersonAvatar
      initials={getInitials(name)}
      photoUrl={photoUrl}
      className="size-[26px] text-[9px]"
    />
  );
}
