import { expect, test } from "@playwright/test";

import {
  followScrollTarget,
  followTargetSelector,
  REFOLLOW_JUMP_INSET_PX,
  SCROLL_KEYS,
  scrollKeyHolds,
  type FollowBox,
} from "@/components/dashboard/matches/match-detail/film/use-follow-scroll";

/**
 * The pure half of `useFollowScroll` — the hook the Film tab's point list
 * (a list element) and the labelling console's points table (the page) both
 * follow the video with. The DOM reads differ per scroller; what the hook
 * does with them is these three functions, so they are fed the same inputs a
 * list box and a viewport box would produce and must agree.
 */

/** The report column's scroller: a 500px list, 120px down the page. */
const LIST_BOX: FollowBox = {
  top: 120,
  bottom: 620,
  scrollTop: 300,
  maxScrollTop: 2000,
};

/** The console's scroller: the viewport, no insets. */
const PAGE_BOX: FollowBox = {
  top: 0,
  bottom: 900,
  scrollTop: 300,
  maxScrollTop: 5000,
};

/** A 52px row whose top is `offset` below the box's top edge. */
function rowIn(box: FollowBox, offset: number) {
  return { top: box.top + offset, bottom: box.top + offset + 52 };
}

test.describe("what the follow effect scrolls to", () => {
  test("a jump targets the playing point's row, never the shot", () => {
    expect(followTargetSelector(true, "p1", "s9", true)).toBe(
      '[data-point-id="p1"]',
    );
    expect(followTargetSelector(true, null, "s9", true)).toBeNull();
  });

  test("keep-in-view follows the playing shot while its well is open", () => {
    expect(followTargetSelector(false, "p1", "s9", true)).toBe(
      '[data-shot-id="s9"]',
    );
    // No well (the report column), or a well with no lit shot: the row.
    expect(followTargetSelector(false, "p1", "s9", false)).toBe(
      '[data-point-id="p1"]',
    );
    expect(followTargetSelector(false, "p1", null, true)).toBe(
      '[data-point-id="p1"]',
    );
    expect(followTargetSelector(false, null, null, false)).toBeNull();
    expect(followTargetSelector(false, "", null, false)).toBeNull();
  });
});

test.describe("the re-follow jump", () => {
  test("puts the row 8px under the box's top, for a list and for the page alike", () => {
    expect(REFOLLOW_JUMP_INSET_PX).toBe(8);
    for (const box of [LIST_BOX, PAGE_BOX]) {
      // The row is 200px into the box; the scroller moves 192px on.
      expect(followScrollTarget("jump", rowIn(box, 200), box)).toBe(
        300 + 200 - 8,
      );
      // A row above the box scrolls back for it.
      expect(followScrollTarget("jump", rowIn(box, -150), box)).toBe(
        300 - 150 - 8,
      );
      // Already in view is no reason not to: the jump aligns regardless.
      expect(followScrollTarget("jump", rowIn(box, 40), box)).toBe(
        300 + 40 - 8,
      );
    }
  });

  test("is clamped to the scroller's range", () => {
    expect(followScrollTarget("jump", rowIn(LIST_BOX, -400), LIST_BOX)).toBe(0);
    expect(followScrollTarget("jump", rowIn(LIST_BOX, 3000), LIST_BOX)).toBe(
      LIST_BOX.maxScrollTop,
    );
    expect(followScrollTarget("jump", rowIn(PAGE_BOX, 9000), PAGE_BOX)).toBe(
      PAGE_BOX.maxScrollTop,
    );
  });

  test("does nothing when the row is already where the jump would put it", () => {
    for (const box of [LIST_BOX, PAGE_BOX]) {
      expect(followScrollTarget("jump", rowIn(box, 8), box)).toBeNull();
      // Within a pixel counts as there.
      expect(followScrollTarget("jump", rowIn(box, 8.5), box)).toBeNull();
      expect(followScrollTarget("jump", rowIn(box, 9), box)).toBe(301);
    }
  });

  test("takes the inset it is given", () => {
    expect(followScrollTarget("jump", rowIn(PAGE_BOX, 200), PAGE_BOX, 56)).toBe(
      300 + 200 - 56,
    );
  });
});

test.describe("continuous keep-in-view", () => {
  test("moves nothing while the row is wholly inside the box", () => {
    for (const box of [LIST_BOX, PAGE_BOX]) {
      expect(followScrollTarget("keep", rowIn(box, 0), box)).toBeNull();
      expect(followScrollTarget("keep", rowIn(box, 200), box)).toBeNull();
      const height = box.bottom - box.top;
      expect(
        followScrollTarget("keep", rowIn(box, height - 52), box),
      ).toBeNull();
    }
  });

  test("brings a row below the box up by the least it can — the same travel in both boxes", () => {
    for (const box of [LIST_BOX, PAGE_BOX]) {
      const height = box.bottom - box.top;
      // The row's bottom is 30px past the box's bottom.
      const row = rowIn(box, height - 52 + 30);
      expect(followScrollTarget("keep", row, box)).toBe(300 + 30);
      // Straddling the bottom edge is enough to move.
      expect(followScrollTarget("keep", rowIn(box, height - 51), box)).toBe(
        301,
      );
    }
  });

  test("brings a row above the box down by the least it can", () => {
    for (const box of [LIST_BOX, PAGE_BOX]) {
      expect(followScrollTarget("keep", rowIn(box, -70), box)).toBe(300 - 70);
      expect(followScrollTarget("keep", rowIn(box, -1), box)).toBe(299);
    }
  });

  test("a page box with fixed chrome is just a smaller box", () => {
    // 56px of chrome over the viewport's top: the hook reads the box as
    // starting under it, and the arithmetic is unchanged.
    const inset = { ...PAGE_BOX, top: 56 };
    expect(followScrollTarget("keep", { top: 30, bottom: 82 }, inset)).toBe(
      300 + 30 - 56,
    );
    expect(
      followScrollTarget("keep", { top: 56, bottom: 108 }, inset),
    ).toBeNull();
  });
});

test.describe("which keys hold", () => {
  /** A target whose `closest` matches when the selector names `tag`. */
  function inside(tag: string): EventTarget {
    return {
      closest: (selector: string) => (selector.includes(tag) ? {} : null),
    } as unknown as EventTarget;
  }
  const key = (
    key: string,
    target: EventTarget | null = null,
    defaultPrevented = false,
  ) => ({ key, target, defaultPrevented });

  test("the scrolling keys, on the scroller itself", () => {
    expect([...SCROLL_KEYS].sort()).toEqual(
      [" ", "ArrowDown", "ArrowUp", "End", "Home", "PageDown", "PageUp"].sort(),
    );
    for (const k of SCROLL_KEYS) expect(scrollKeyHolds(key(k)), k).toBe(true);
    for (const k of ["ArrowLeft", "ArrowRight", "Enter", "Escape", "a"]) {
      expect(scrollKeyHolds(key(k)), k).toBe(false);
    }
  });

  test("not once something else has handled the key", () => {
    // The console's Space plays and pauses, with `preventDefault`; the film
    // room's Space does the same. Neither is a scroll.
    expect(scrollKeyHolds(key(" ", null, true))).toBe(false);
    expect(scrollKeyHolds(key("PageDown", null, true))).toBe(false);
  });

  test("Space on a button or a row acting as one is its activation", () => {
    expect(scrollKeyHolds(key(" ", inside("button")))).toBe(false);
    expect(scrollKeyHolds(key(" ", inside("[role=button]")))).toBe(false);
    // Any other key on a button still scrolls the list behind it.
    expect(scrollKeyHolds(key("ArrowDown", inside("button")))).toBe(true);
    expect(scrollKeyHolds(key(" ", inside("div")))).toBe(true);
  });

  test("inside a form control the keys edit, never scroll", () => {
    for (const control of ["input", "select", "textarea", "contenteditable"]) {
      expect(scrollKeyHolds(key("ArrowDown", inside(control))), control).toBe(
        false,
      );
      expect(scrollKeyHolds(key(" ", inside(control))), control).toBe(false);
      expect(scrollKeyHolds(key("Home", inside(control))), control).toBe(false);
    }
  });
});
