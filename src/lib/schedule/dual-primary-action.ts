import { entryState, resolveEntryResult } from "@/lib/schedule/entry-state";
import type { EventEntry } from "@/lib/schedule/types";

export interface DualPrimaryAction {
  label: "Add result" | "Add video";
  href: string;
}

/**
 * The one thing a dual's event page asks a coach to do next — its header's
 * primary button, or nothing.
 *
 * 1. A line nobody has answered yet: "Add result", into the event's score
 *    flow. A result outranks a video — a dual is not over until every line
 *    has one, and a video cannot be filed against a line with no match.
 * 2. Otherwise the singles lines played and scored with no video sent. One of
 *    them: "Add video", with the wizard preset on that line and its match —
 *    the match id rides along exactly as the old row action's did. Two or
 *    more: the bare upload route, because `/dashboard/team/upload` takes one
 *    `entry`/`match` pair and has no event-scoped picker.
 * 3. Nothing owed: null — the header shows no primary at all rather than a
 *    button that leads nowhere.
 *
 * Doubles never count toward (2): a doubles line records a score only, and
 * the vendor refuses a doubles match outright (`supportsVideo`). A line whose
 * outcome (forfeit, default, withdrawal) overrides a match underneath it is
 * not "played" either — `resolveEntryResult` puts the outcome first, as every
 * other reader does.
 */
export function dualPrimaryAction(
  entries: EventEntry[],
  eventId: string,
): DualPrimaryAction | null {
  const needsResult = entries.some(
    (entry) => entry.forfeit === null && entryState(entry) === "empty",
  );
  if (needsResult) {
    return {
      label: "Add result",
      href: `/dashboard/team/schedule/${eventId}/score`,
    };
  }

  const videoless = entries.flatMap((entry) => {
    if (entry.discipline !== "singles") return [];
    const result = resolveEntryResult(entry, null);
    if (result.kind !== "played" || result.match.hasVideo) return [];
    return [{ entryId: entry.id, matchId: result.match.id }];
  });

  if (videoless.length === 0) return null;
  if (videoless.length === 1) {
    const [only] = videoless;
    return {
      label: "Add video",
      href: `/dashboard/team/upload?entry=${only.entryId}&match=${only.matchId}`,
    };
  }
  return { label: "Add video", href: "/dashboard/team/upload" };
}
