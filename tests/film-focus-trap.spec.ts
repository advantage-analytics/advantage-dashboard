import { expect, test } from "@playwright/test";

import {
  FOCUSABLE_SELECTOR,
  nextFocusTarget,
} from "@/components/dashboard/matches/match-detail/film/film-focus-trap";

// Plain ids stand in for elements: the trap's question is about order and
// wrapping, and `nextFocusTarget` is generic so the arithmetic can be pinned
// with no DOM at all.
const ring = ["play", "points", "exit"];

test("Tab walks forward and wraps past the last control", () => {
  expect(nextFocusTarget(ring, "play", false)).toBe("points");
  expect(nextFocusTarget(ring, "points", false)).toBe("exit");
  // The wrap is what keeps focus in the room: the last control leads back to
  // the first, never out to the page underneath.
  expect(nextFocusTarget(ring, "exit", false)).toBe("play");
});

test("Shift+Tab walks backward and wraps past the first control", () => {
  expect(nextFocusTarget(ring, "exit", true)).toBe("points");
  expect(nextFocusTarget(ring, "points", true)).toBe("play");
  expect(nextFocusTarget(ring, "play", true)).toBe("exit");
});

test("focus outside the ring is pulled back in at the near end", () => {
  // The room root holds focus on mount (tabIndex -1, so it is not in the
  // ring), and a control can be unmounted while focused — the chrome
  // collapsing, the drawer closing. Either way Tab enters at the top and
  // Shift+Tab at the bottom instead of escaping.
  expect(nextFocusTarget(ring, null, false)).toBe("play");
  expect(nextFocusTarget(ring, null, true)).toBe("exit");
  expect(nextFocusTarget(ring, "a-control-that-has-gone", false)).toBe("play");
});

test("an empty ring has nowhere to send focus", () => {
  // The caller reads null as "do not preventDefault" — with nothing to trap,
  // the browser's own Tab is better than swallowing the key.
  expect(nextFocusTarget([], null, false)).toBeNull();
  expect(nextFocusTarget([], "play", true)).toBeNull();
});

test("the selector never offers a disabled control or an explicit -1", () => {
  // "More" is `aria-disabled` and keeps its place, but a genuinely disabled
  // button (Advanced's Apply, before anything changes) is not a tab stop; nor
  // is the court's header glyph under a collapsed chrome, which is a button
  // carrying `tabindex="-1"`.
  expect(FOCUSABLE_SELECTOR).toContain("button:not([disabled])");
  expect(FOCUSABLE_SELECTOR).toContain('[tabindex]:not([tabindex="-1"])');
});
