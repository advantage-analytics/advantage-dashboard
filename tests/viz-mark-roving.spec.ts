import { expect, test } from "@playwright/test";
import {
  isMarkRovingKey,
  nextMarkIndex,
} from "@/components/dashboard/matches/match-detail/shots/viz-mark-roving";

/* ── Which keys the mark group owns ──────────────────────────────────────── */

test("the six roving keys are recognised and nothing else is", () => {
  for (const key of [
    "ArrowRight",
    "ArrowDown",
    "ArrowLeft",
    "ArrowUp",
    "Home",
    "End",
  ]) {
    expect(isMarkRovingKey(key)).toBe(true);
  }
  // The viewer's own window shortcuts must keep working while a mark has
  // focus — none of them is a roving key.
  for (const key of ["Escape", "0", "+", "=", "-", "Tab", "Enter", " ", "f"]) {
    expect(isMarkRovingKey(key)).toBe(false);
  }
});

/* ── Movement ────────────────────────────────────────────────────────────── */

test("ArrowRight and ArrowDown both move forward one", () => {
  expect(nextMarkIndex(0, 5, "ArrowRight")).toBe(1);
  expect(nextMarkIndex(0, 5, "ArrowDown")).toBe(1);
  expect(nextMarkIndex(3, 5, "ArrowRight")).toBe(4);
});

test("ArrowLeft and ArrowUp both move back one", () => {
  expect(nextMarkIndex(4, 5, "ArrowLeft")).toBe(3);
  expect(nextMarkIndex(4, 5, "ArrowUp")).toBe(3);
});

test("Home goes to the first mark and End to the last", () => {
  expect(nextMarkIndex(3, 5, "Home")).toBe(0);
  expect(nextMarkIndex(1, 5, "End")).toBe(4);
});

/* ── The ends clamp, and a no-op move reports itself as one ─────────────── */

test("the last mark does not wrap forward", () => {
  expect(nextMarkIndex(4, 5, "ArrowRight")).toBeNull();
  expect(nextMarkIndex(4, 5, "ArrowDown")).toBeNull();
});

test("the first mark does not wrap backward", () => {
  expect(nextMarkIndex(0, 5, "ArrowLeft")).toBeNull();
  expect(nextMarkIndex(0, 5, "ArrowUp")).toBeNull();
});

test("Home on the first mark and End on the last are no-ops, not re-focuses", () => {
  expect(nextMarkIndex(0, 5, "Home")).toBeNull();
  expect(nextMarkIndex(4, 5, "End")).toBeNull();
});

/* ── Degenerate inputs never produce an index to focus ───────────────────── */

test("no marks at all: every key returns null", () => {
  for (const key of ["ArrowRight", "ArrowLeft", "Home", "End"]) {
    expect(nextMarkIndex(0, 0, key)).toBeNull();
  }
});

test("a single mark has nowhere to go", () => {
  for (const key of ["ArrowRight", "ArrowLeft", "ArrowUp", "Home", "End"]) {
    expect(nextMarkIndex(0, 1, key)).toBeNull();
  }
});

test("an out-of-range or non-integer current index returns null", () => {
  expect(nextMarkIndex(-1, 5, "ArrowRight")).toBeNull();
  expect(nextMarkIndex(5, 5, "ArrowRight")).toBeNull();
  expect(nextMarkIndex(1.5, 5, "ArrowRight")).toBeNull();
  expect(nextMarkIndex(Number.NaN, 5, "Home")).toBeNull();
});

test("a key the group does not own returns null, whatever the position", () => {
  for (const key of ["Escape", "0", "-", "PageDown", "a"]) {
    expect(nextMarkIndex(2, 5, key)).toBeNull();
  }
});

/* ── The invariant the caller relies on ──────────────────────────────────── */

test("any index it returns is a real mark, and never the current one", () => {
  const count = 7;
  for (let current = 0; current < count; current++) {
    for (const key of [
      "ArrowRight",
      "ArrowDown",
      "ArrowLeft",
      "ArrowUp",
      "Home",
      "End",
    ]) {
      const next = nextMarkIndex(current, count, key);
      if (next === null) continue;
      expect(Number.isInteger(next)).toBe(true);
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeLessThan(count);
      expect(next).not.toBe(current);
    }
  }
});
