import { AdminAvatar } from "@/components/admin/admin-cells";
import { ConferenceMark } from "@/components/admin/conference-mark";
import { ProgramCrest } from "@/components/dashboard/settings/teams/program-crest";
import type { AdminSearchHit } from "@/components/admin/search/types";

/**
 * A search row's mark, in a fixed 26px slot so every title starts on the
 * same line: a team's crest, a person's photo, a conference's crest, and for
 * a match the first player's initials — the way `AdminMatchCell` leads with
 * the player. Squares are things, circles are people.
 */
export function SearchMark({ hit }: { hit: AdminSearchHit }) {
  return (
    <span className="flex size-[26px] shrink-0 items-center justify-center">
      {hit.kind === "team" ? (
        <ProgramCrest
          name={hit.title}
          crestUrl={hit.markUrl}
          shortCode={hit.shortCode}
          size={26}
        />
      ) : hit.kind === "conference" ? (
        // 24 is ConferenceMark's smallest step; the slot keeps it aligned.
        <ConferenceMark
          name={hit.title}
          shortName={hit.shortCode}
          crestUrl={hit.markUrl}
          size={24}
        />
      ) : hit.kind === "person" ? (
        <AdminAvatar name={hit.title} photoUrl={hit.markUrl} size={26} />
      ) : (
        <AdminAvatar name={hit.title.split(" vs ")[0] ?? hit.title} size={26} />
      )}
    </span>
  );
}
