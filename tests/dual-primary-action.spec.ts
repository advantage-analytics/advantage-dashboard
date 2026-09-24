import { expect, test } from "@playwright/test";
import { dualPrimaryAction } from "@/lib/schedule/dual-primary-action";
import type { EntryMatch, EventEntry } from "@/lib/schedule/types";

/**
 * The dual page's header primary (`lib/schedule/dual-primary-action.ts`):
 * "Add result" while any line is unanswered, then "Add video" for the
 * videoless singles lines — preset on the one line when there is exactly one,
 * the bare upload route for several — and nothing when nothing is owed.
 */

const EVENT = "dual-1";

function match(id: string, slot: string, hasVideo: boolean): EntryMatch {
  return {
    id,
    // A dual match carries its line's slot as its round.
    round: slot,
    status: hasVideo ? "completed" : "manual",
    score: { player1: [6, 6], player2: [3, 3] },
    opponentLabels: ["Them"],
    hasVideo,
  };
}

function line(
  slot: string,
  matches: EntryMatch[] = [],
  overrides: Partial<EventEntry> = {},
): EventEntry {
  return {
    id: `entry-${slot.toLowerCase()}`,
    eventId: EVENT,
    discipline: slot.startsWith("D") ? "doubles" : "singles",
    slot,
    position: 0,
    draw: null,
    seed: null,
    playerUserIds: ["p"],
    playerLabels: ["Us"],
    opponentLabels: ["Them"],
    opponentSchool: null,
    forfeit: null,
    matches,
    outcomes: [],
    ...overrides,
  };
}

const scored = (slot: string, hasVideo: boolean) =>
  line(slot, [match(`m-${slot.toLowerCase()}`, slot, hasVideo)]);

test("an unanswered line asks for a result first", () => {
  expect(dualPrimaryAction([scored("S1", false), line("S2")], EVENT)).toEqual({
    label: "Add result",
    href: "/dashboard/team/schedule/dual-1/score",
  });
});

test("exactly one videoless singles line presets the upload on it", () => {
  expect(
    dualPrimaryAction(
      [scored("S1", true), scored("S2", false), scored("D1", true)],
      EVENT,
    ),
  ).toEqual({
    label: "Add video",
    href: "/dashboard/team/upload?entry=entry-s2&match=m-s2",
  });
});

test("two or more videoless singles lines open the bare upload route", () => {
  expect(
    dualPrimaryAction([scored("S1", false), scored("S2", false)], EVENT),
  ).toEqual({ label: "Add video", href: "/dashboard/team/upload" });
});

test("nothing owed is no primary at all", () => {
  expect(
    dualPrimaryAction([scored("S1", true), scored("S2", true)], EVENT),
  ).toBeNull();
});

test("a doubles line without video never counts", () => {
  // One singles line owes a video; the two doubles lines do not add to it,
  // so the upload stays preset on the singles line.
  expect(
    dualPrimaryAction(
      [scored("S1", false), scored("D1", false), scored("D2", false)],
      EVENT,
    ),
  ).toEqual({
    label: "Add video",
    href: "/dashboard/team/upload?entry=entry-s1&match=m-s1",
  });
  // And on their own they owe nothing.
  expect(
    dualPrimaryAction([scored("S1", true), scored("D1", false)], EVENT),
  ).toBeNull();
});

test("a forfeited singles line is decided, not videoless", () => {
  const forfeited = line("S1", [], { forfeit: "theirs" });
  expect(dualPrimaryAction([forfeited, scored("S2", true)], EVENT)).toBeNull();
});
