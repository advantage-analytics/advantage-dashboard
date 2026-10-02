import { expect, test } from "@playwright/test";

import { uploadQueueFrom } from "@/lib/data/schedule-server";
import { resolveUploadTarget } from "@/lib/schedule/upload-target";
import type {
  EntryMatch,
  EventEntry,
  ProgramEvent,
} from "@/lib/schedule/types";

/**
 * `resolveUploadTarget` — the `?entry=` / `?entry=&match=` branch of
 * `/dashboard/team/upload` (T4).
 *
 * That branch used to look the line up in the upload QUEUE, which drops every
 * match with video. The wizard `router.refresh()`es 300 ms after it writes the
 * match row and the processing job, so the line it was uploading to vanished
 * from the queue and the page redirected to the bare picker — unmounting the
 * success screen mid-upload. These pin that the resolver reads the whole
 * schedule: video on the line is never a reason to redirect, while every
 * refusal the page owes (another program's line, doubles, a `?match=` of a
 * different entry) still is.
 */

const DUAL: ProgramEvent = {
  id: "e-dual",
  programId: "p-1",
  kind: "dual",
  name: "Rival State",
  startsOn: "2026-03-21",
  endsOn: "2026-03-21",
  site: "home",
  surface: "hard",
  host: null,
  format: { bestOf: 3, adScoring: true },
};

const TOURNAMENT: ProgramEvent = {
  ...DUAL,
  id: "e-open",
  kind: "tournament",
  name: "Fall Open",
};

function match(id: string, hasVideo: boolean, round: string | null = null) {
  return {
    id,
    round,
    status: "imported",
    score: { player1: [6, 6], player2: [3, 4] },
    opponentLabels: ["Rival Player"],
    hasVideo,
  } satisfies EntryMatch;
}

function entry(overrides: Partial<EventEntry> & { id: string }): EventEntry {
  return {
    eventId: DUAL.id,
    discipline: "singles",
    slot: "S1",
    position: 0,
    draw: null,
    seed: null,
    playerUserIds: ["athlete"],
    playerLabels: ["Ana Vasquez"],
    opponentLabels: ["Rival Player"],
    opponentSchool: null,
    opponentProgramId: null,
    forfeit: null,
    matches: [],
    ...overrides,
  };
}

// S1 had no video; the wizard just created its job, so it now has video.
const S1_JUST_UPLOADED = entry({
  id: "s1",
  matches: [match("m-s1", true, "S1")],
});
const S2_WAITING = entry({
  id: "s2",
  slot: "S2",
  position: 1,
  matches: [match("m-s2", false, "S2")],
});
const D1 = entry({
  id: "d1",
  slot: "D1",
  position: 6,
  discipline: "doubles",
  playerUserIds: ["a", "b"],
  playerLabels: ["A", "B"],
  matches: [match("m-d1", false, "D1")],
});
// A tournament run: R32 has video, Q1 does not.
const RUN = entry({
  id: "run",
  eventId: TOURNAMENT.id,
  slot: null,
  matches: [match("m-r32", true, "R32"), match("m-q1", false, "Q1")],
});
// Every round of a run filmed.
const RUN_ALL_FILMED = entry({
  id: "run-filmed",
  eventId: TOURNAMENT.id,
  slot: null,
  position: 1,
  matches: [match("m-a", true, "R32"), match("m-b", true, "R16")],
});

const SCHEDULE = {
  events: [DUAL, TOURNAMENT],
  entriesByEvent: new Map<string, EventEntry[]>([
    [DUAL.id, [S1_JUST_UPLOADED, S2_WAITING, D1]],
    [TOURNAMENT.id, [RUN, RUN_ALL_FILMED]],
  ]),
};

test.describe("resolveUploadTarget · refusals", () => {
  test("an entry not in this program redirects", () => {
    expect(resolveUploadTarget(SCHEDULE, "someone-elses", null)).toEqual({
      kind: "redirect",
    });
    expect(resolveUploadTarget(SCHEDULE, "someone-elses", "m-s1").kind).toBe(
      "redirect",
    );
  });

  test("a doubles line redirects", () => {
    expect(resolveUploadTarget(SCHEDULE, "d1", null).kind).toBe("redirect");
    expect(resolveUploadTarget(SCHEDULE, "d1", "m-d1").kind).toBe("redirect");
  });

  test("?match= naming a match of another entry redirects", () => {
    // m-s2 is S2's; it must never land on S1.
    expect(resolveUploadTarget(SCHEDULE, "s1", "m-s2").kind).toBe("redirect");
    // Nor another round of a DIFFERENT run.
    expect(resolveUploadTarget(SCHEDULE, "run", "m-a").kind).toBe("redirect");
  });

  test("a forfeited line redirects", () => {
    const forfeited = entry({ id: "ff", forfeit: "ours" });
    const schedule = {
      events: [DUAL],
      entriesByEvent: new Map([[DUAL.id, [forfeited]]]),
    };
    expect(resolveUploadTarget(schedule, "ff", null).kind).toBe("redirect");
  });
});

test.describe("resolveUploadTarget · video is never a refusal", () => {
  test("?match= naming a match that already has video is a preset", () => {
    const target = resolveUploadTarget(SCHEDULE, "s1", "m-s1");
    expect(target).toMatchObject({
      kind: "preset",
      event: { id: DUAL.id },
      entry: { id: "s1" },
      match: { id: "m-s1" },
    });
    if (target.kind !== "preset") throw new Error("expected a preset");
    // The whole event, for the pinned bar's Change menu.
    expect(target.siblings.map((e) => e.id)).toEqual(["s1", "s2", "d1"]);
  });

  test("?match= keeps the clicked round even when it has video", () => {
    expect(resolveUploadTarget(SCHEDULE, "run", "m-r32")).toMatchObject({
      kind: "preset",
      match: { id: "m-r32" },
    });
  });

  test("?entry= alone where every match now has video is a preset", () => {
    expect(resolveUploadTarget(SCHEDULE, "s1", null)).toMatchObject({
      kind: "preset",
      entry: { id: "s1" },
      match: { id: "m-s1" },
    });
    expect(
      resolveUploadTarget(SCHEDULE, "run-filmed", undefined),
    ).toMatchObject({
      kind: "preset",
      event: { id: TOURNAMENT.id },
      match: { id: "m-a" },
    });
  });

  test("?entry= alone prefers the first round still waiting for video", () => {
    expect(resolveUploadTarget(SCHEDULE, "run", null)).toMatchObject({
      kind: "preset",
      match: { id: "m-q1" },
    });
  });

  test("a line with no match yet is a preset with no match", () => {
    const empty = entry({ id: "empty" });
    const schedule = {
      events: [DUAL],
      entriesByEvent: new Map([[DUAL.id, [empty]]]),
    };
    expect(resolveUploadTarget(schedule, "empty", null)).toMatchObject({
      kind: "preset",
      match: null,
    });
  });
});

test("the queue LIST still excludes matches with video", () => {
  // The resolver reads past the queue; the picker must not.
  const groups = uploadQueueFrom(SCHEDULE);
  const ids = groups.flatMap((group) =>
    group.entries.flatMap((e) => e.matches.map((m) => m.id)),
  );
  expect(ids).not.toContain("m-s1");
  expect(ids).not.toContain("m-r32");
  expect(ids).not.toContain("m-a");
  expect(ids).toContain("m-s2");
  expect(ids).toContain("m-q1");
});
