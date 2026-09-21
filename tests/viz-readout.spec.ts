import { expect, test } from "@playwright/test";
import { buildReadout } from "@/components/dashboard/matches/match-detail/shots/viz-readout";
import type { VizDotMeta } from "@/components/dashboard/matches/match-detail/shots/viz-model";

const NAMES = { subject: "Reid" };

function meta(overrides: Partial<VizDotMeta> = {}): VizDotMeta {
  return {
    setNumber: 3,
    pointScore: "40-15",
    wonBySubject: true,
    shotType: "First Serve",
    result: "In",
    isAce: false,
    speedMph: 118,
    ...overrides,
  };
}

/* ── Title: the SUBJECT's own won/lost, either side ──────────────────────── */

test("title names the subject and reads 'won the point' when they won it", () => {
  const r = buildReadout(meta({ wonBySubject: true }), NAMES, "serve");
  expect(r.title).toBe("Reid won the point");
});

test("title reads 'lost the point' when the subject lost it", () => {
  const r = buildReadout(meta({ wonBySubject: false }), NAMES, "serve");
  expect(r.title).toBe("Reid lost the point");
});

test("the subject's own name is used, not a fixed player-1 label", () => {
  // The same dot, viewed with the OPPONENT as the subject: `wonBySubject` is
  // already resolved for that side by `computeViz`, so the readout only has
  // to print it. A player-2 viewer must never be told they won a point they
  // lost (guardrails §4).
  const r = buildReadout(
    meta({ wonBySubject: false }),
    { subject: "Okafor" },
    "serve",
  );
  expect(r.title).toBe("Okafor lost the point");
});

/* ── Line 1: only what the data says ─────────────────────────────────────── */

test("an ace reads as 'Ace' and does not repeat the serve description", () => {
  const r = buildReadout(
    meta({ shotType: "First Serve", result: "Ace" }),
    NAMES,
    "serve",
  );
  expect(r.lines[0]).toBe("Ace");
});

// Fix round 1: the case real data actually produces. An ace's own shot row is
// called "In" — the ace lives on the POINT (`resultType`), which is why
// `VizDotMeta.isAce` exists and why it is tested first.
test("an ace whose shot result is 'In' still reads 'Ace'", () => {
  const r = buildReadout(
    meta({ shotType: "First Serve", result: "In", isAce: true }),
    NAMES,
    "serve",
  );
  expect(r.lines[0]).toBe("Ace");
});

test("isAce wins over the shot description, whatever the shot row says", () => {
  const r = buildReadout(
    meta({ shotType: "Second Serve", result: null, isAce: true }),
    NAMES,
    "serve",
  );
  expect(r.lines[0]).toBe("Ace");
});

test("a non-ace serve called 'In' never reads 'Ace'", () => {
  const r = buildReadout(
    meta({ shotType: "First Serve", result: "In", isAce: false }),
    NAMES,
    "serve",
  );
  expect(r.lines[0]).toBe("First serve");
});

test("an out serve names the serve and the call", () => {
  const r = buildReadout(
    meta({ shotType: "Second Serve", result: "Out" }),
    NAMES,
    "serve",
  );
  expect(r.lines[0]).toBe("Second serve, out");
});

test("a netted ball reads 'into the net', never the raw 'Net'", () => {
  const r = buildReadout(
    meta({ shotType: "Forehand", result: "Net" }),
    NAMES,
    "returnPlacement",
  );
  expect(r.lines[0]).toBe("Forehand return, into the net");
});

test("a return names the stroke and the cut", () => {
  const r = buildReadout(
    meta({ shotType: "Backhand", result: "In" }),
    NAMES,
    "returnContact",
  );
  expect(r.lines[0]).toBe("Backhand return");
});

test("a rally shot names the stroke alone — the cut is not a return", () => {
  const r = buildReadout(
    meta({ shotType: "Forehand Volley", result: "In" }),
    NAMES,
    "rallyPosition",
  );
  expect(r.lines[0]).toBe("Forehand volley");
});

test("'In' alone says nothing a serve dot does not already say — no shot line", () => {
  const r = buildReadout(
    meta({ shotType: null, result: "In", speedMph: null, pointScore: null }),
    NAMES,
    "serve",
  );
  expect(r.lines).toEqual(["Set 3"]);
});

/* ── Line 2: omitted parts, never invented ones ──────────────────────────── */

test("line 2 joins set, score and speed with the mid dot", () => {
  const r = buildReadout(meta(), NAMES, "serve");
  expect(r.lines[r.monoLine]).toBe("Set 3 · 40-15 · 118 mph");
});

test("a shot with no measured speed omits the speed part entirely", () => {
  const r = buildReadout(meta({ speedMph: null }), NAMES, "serve");
  expect(r.lines[r.monoLine]).toBe("Set 3 · 40-15");
});

test("speed 0 is unmeasured, not a reading — never '0 mph'", () => {
  const r = buildReadout(meta({ speedMph: 0 }), NAMES, "serve");
  expect(r.lines[r.monoLine]).toBe("Set 3 · 40-15");
});

/* ── Stage 2C: the fact line's speed follows the Units preference ───────── */

test("unit defaults to 'ft' when the caller omits it (no callers left that do, but the fallback must not read '0 km/h')", () => {
  const r = buildReadout(meta(), NAMES, "serve");
  expect(r.lines[r.monoLine]).toBe("Set 3 · 40-15 · 118 mph");
});

test("metres preference: the speed line reads km/h, not mph", () => {
  const r = buildReadout(meta(), NAMES, "serve", "m");
  // formatSpeed("m", 118) = round(118 * 1.609344) = 190
  expect(r.lines[r.monoLine]).toBe("Set 3 · 40-15 · 190 km/h");
});

test("metres preference, speed 0 is still unmeasured — never '0 km/h'", () => {
  const r = buildReadout(meta({ speedMph: 0 }), NAMES, "serve", "m");
  expect(r.lines[r.monoLine]).toBe("Set 3 · 40-15");
});

test("no point score omits that part, keeping the rest", () => {
  const r = buildReadout(meta({ pointScore: null }), NAMES, "serve");
  expect(r.lines[r.monoLine]).toBe("Set 3 · 118 mph");
});

test("a blank point score string is treated as missing", () => {
  const r = buildReadout(meta({ pointScore: "   " }), NAMES, "serve");
  expect(r.lines[r.monoLine]).toBe("Set 3 · 118 mph");
});

test("set 0 (unnumbered) omits the set part", () => {
  const r = buildReadout(meta({ setNumber: 0 }), NAMES, "serve");
  expect(r.lines[r.monoLine]).toBe("40-15 · 118 mph");
});

test("nothing measured at all leaves the fact line out and monoLine at -1", () => {
  const r = buildReadout(
    meta({
      setNumber: 0,
      pointScore: null,
      speedMph: null,
      shotType: null,
      result: null,
    }),
    NAMES,
    "serve",
  );
  expect(r.lines).toEqual([]);
  expect(r.monoLine).toBe(-1);
});

/* ── The global rule: no placeholder ever reaches the screen ─────────────── */

const HOLES: Partial<VizDotMeta>[] = [
  {},
  { shotType: null, result: null },
  { shotType: "", result: "" },
  { pointScore: null },
  { speedMph: null },
  { speedMph: 0 },
  { setNumber: 0, pointScore: null, speedMph: null, shotType: null },
  { wonBySubject: false, result: "Net", shotType: null },
  { isAce: true, result: "In", shotType: "First Serve" },
];

for (const [i, hole] of HOLES.entries()) {
  for (const cut of [
    "serve",
    "returnPlacement",
    "returnContact",
    "rallyPosition",
  ] as const) {
    test(`readout ${i} on ${cut} never prints undefined, null or a 0 reading`, () => {
      const r = buildReadout(meta(hole), NAMES, cut);
      const text = [r.title, ...r.lines].join(" | ");
      expect(text).not.toContain("undefined");
      expect(text).not.toContain("null");
      expect(text).not.toContain("NaN");
      expect(text).not.toContain("0 mph");
      expect(text).not.toContain("Set 0");
      // No empty or dangling-separator line ever renders.
      for (const line of r.lines) {
        expect(line.trim()).not.toBe("");
        expect(line).not.toMatch(/(^ ?·|· ?$|· ·)/);
      }
    });
  }
}
