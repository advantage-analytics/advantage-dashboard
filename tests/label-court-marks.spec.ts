import { expect, test } from "@playwright/test";

import {
  courtMarksAt,
  courtMarksKey,
  parseCourtMarksKey,
} from "@/components/admin/labels/label-court-marks";
import {
  BOUNCE_REVEAL_SECONDS,
  BOUNCE_REVEAL_SHARE,
  MARK_FADE_SECONDS,
  MARK_HOLD_SECONDS,
} from "@/components/dashboard/matches/match-detail/film/film-court";
import { REACHED_EPSILON_SECONDS } from "@/components/dashboard/matches/match-detail/film/film-timeline";
import type { LabelShot } from "@/lib/services/labels/session";

/**
 * The labelling court's marks as a function of film time
 * (`label-court-marks.ts`): the Video tab's hold-and-fade rule, applied to
 * label strokes on the analysis clock.
 */

function stroke(
  id: string,
  videoTime: number | null,
  fields: Partial<LabelShot> = {},
): LabelShot {
  return {
    id,
    labelPointId: "p-1",
    eventId: null,
    afterEventId: null,
    status: "kept",
    statusBeforeDelete: null,
    deleteReason: null,
    hitter: "p1",
    stroke: null,
    result: null,
    spin: null,
    contactX: 0,
    contactY: 0,
    landingX: 0,
    landingY: 0,
    videoTime,
    seed: null,
    ...fields,
  };
}

// A serve at 10 s and a return at 12 s: the serve's ball comes down 0.6 of the
// way between them, the return's — the last stroke — 0.75 s after it.
const SERVE = 10;
const RETURN = 12;
const RALLY = [stroke("a", SERVE), stroke("b", RETURN)];
const SERVE_LANDS = SERVE + (RETURN - SERVE) * BOUNCE_REVEAL_SHARE; // 11.2
const RETURN_LANDS = RETURN + BOUNCE_REVEAL_SECONDS; // 12.75
const GONE = MARK_HOLD_SECONDS + MARK_FADE_SECONDS; // 4.5

test("the constants this spec is written against", () => {
  expect(MARK_HOLD_SECONDS).toBe(2);
  expect(MARK_FADE_SECONDS).toBe(2.5);
  expect(BOUNCE_REVEAL_SHARE).toBe(0.6);
  expect(BOUNCE_REVEAL_SECONDS).toBe(0.75);
  expect(REACHED_EPSILON_SECONDS).toBe(0.1);
});

test("before a stroke's contact it is omitted; before the video moves, everything is", () => {
  expect(courtMarksAt(RALLY, SERVE - 0.5)).toEqual([]);
  expect(courtMarksAt(RALLY, null)).toEqual([]);
  expect(courtMarksAt(RALLY, Number.NaN)).toEqual([]);
  // Admitted a hair early, the same slack a seek gets.
  expect(courtMarksAt(RALLY, SERVE - REACHED_EPSILON_SECONDS / 2)).toEqual([
    { shotId: "a", contactOpacity: 1, landingOpacity: 0 },
  ]);
});

test("within the hold the contact is 1 — and the landing waits for the bounce, not the contact", () => {
  expect(courtMarksAt(RALLY, SERVE)).toEqual([
    { shotId: "a", contactOpacity: 1, landingOpacity: 0 },
  ]);
  expect(courtMarksAt(RALLY, SERVE + 1)).toEqual([
    { shotId: "a", contactOpacity: 1, landingOpacity: 0 },
  ]);
  expect(courtMarksAt(RALLY, SERVE_LANDS - 0.2)[0].landingOpacity).toBe(0);
  expect(courtMarksAt(RALLY, SERVE_LANDS)).toEqual([
    { shotId: "a", contactOpacity: 1, landingOpacity: 1 },
  ]);
  // The return's contact arrives while the serve is still fully on show.
  expect(courtMarksAt(RALLY, RETURN)).toEqual([
    { shotId: "a", contactOpacity: 1, landingOpacity: 1 },
    { shotId: "b", contactOpacity: 1, landingOpacity: 0 },
  ]);
});

test("past the hold a mark fades in steps; after hold + fade the stroke is omitted", () => {
  // 3 s after the serve: 1 s into its 2.5 s fade.
  const fading = courtMarksAt(RALLY, SERVE + MARK_HOLD_SECONDS + 1);
  expect(fading[0]).toEqual({
    shotId: "a",
    contactOpacity: 0.6,
    landingOpacity: 1,
  });
  // The contact is gone but the landing, 1.2 s younger, is still fading.
  const halfGone = courtMarksAt(RALLY, SERVE + GONE + 0.1);
  expect(halfGone[0].shotId).toBe("a");
  expect(halfGone[0].contactOpacity).toBe(0);
  expect(halfGone[0].landingOpacity).toBeGreaterThan(0);
  // Both ends gone: the serve is no longer listed at all, the return still is.
  const serveGone = courtMarksAt(RALLY, SERVE_LANDS + GONE + 0.1);
  expect(serveGone.map((m) => m.shotId)).toEqual(["b"]);
  expect(courtMarksAt(RALLY, RETURN_LANDS + GONE + 0.1)).toEqual([]);
});

test("the last stroke's ball lands BOUNCE_REVEAL_SECONDS after it", () => {
  const before = courtMarksAt(RALLY, RETURN_LANDS - 0.2);
  expect(before.find((m) => m.shotId === "b")?.landingOpacity).toBe(0);
  const landed = courtMarksAt(RALLY, RETURN_LANDS);
  expect(landed.find((m) => m.shotId === "b")?.landingOpacity).toBe(1);
});

test("tombstones and untimed strokes are invisible, and input order does not matter", () => {
  const shots = [
    stroke("late", RETURN),
    stroke("ghost", SERVE + 0.5, { status: "deleted" }),
    stroke("untimed", null),
    stroke("early", SERVE),
  ];
  expect(courtMarksAt(shots, RETURN).map((m) => m.shotId)).toEqual([
    "early",
    "late",
  ]);
  // The tombstone does not count as the serve's "next contact" either: the
  // serve's landing is 0.6 of the way to the live return.
  expect(courtMarksAt(shots, SERVE_LANDS - 0.2)[0].landingOpacity).toBe(0);
  expect(courtMarksAt(shots, SERVE_LANDS)[0].landingOpacity).toBe(1);
});

test("the key is a snapshot: equal for equal marks, and parses back", () => {
  const marks = courtMarksAt(RALLY, SERVE + MARK_HOLD_SECONDS + 1);
  expect(courtMarksKey(marks)).toBe(courtMarksKey([...marks]));
  expect(parseCourtMarksKey(courtMarksKey(marks))).toEqual(marks);
  expect(courtMarksKey([])).toBe("");
  expect(parseCourtMarksKey("")).toEqual([]);
  // A step in opacity is a different key; a tick within a step is not.
  expect(courtMarksKey(courtMarksAt(RALLY, SERVE + 2.1))).not.toBe(
    courtMarksKey(courtMarksAt(RALLY, SERVE + 2.6)),
  );
  expect(courtMarksKey(courtMarksAt(RALLY, SERVE + 0.3))).toBe(
    courtMarksKey(courtMarksAt(RALLY, SERVE + 0.7)),
  );
});
