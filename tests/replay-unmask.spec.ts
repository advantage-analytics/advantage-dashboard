import { expect, test } from "@playwright/test";
import {
  maskReplayText,
  replayMask,
  replayUnmask,
  type ReplayTextElement,
} from "@/lib/ui/replay-unmask";

/**
 * Session replays mask every text node, and only text under a
 * `replayUnmask()` element reads through — the nearest mark winning. A tiny
 * fake tree stands in for the DOM: `closest` walks up the parents and matches
 * the two attribute selectors, `contains` walks up from the other node.
 */

class FakeNode implements ReplayTextElement {
  constructor(
    readonly attrs: Record<string, string> = {},
    readonly parent: FakeNode | null = null,
  ) {}

  child(attrs: Record<string, string> = {}): FakeNode {
    return new FakeNode(attrs, this);
  }

  closest(selector: string): FakeNode | null {
    const attr = selector.match(/^\[([\w-]+)\]$/)?.[1];
    if (!attr) throw new Error(`unsupported selector ${selector}`);
    for (let n: FakeNode | null = this; n; n = n.parent) {
      if (attr in n.attrs) return n;
    }
    return null;
  }

  contains(other: object | null): boolean {
    for (let n = other as FakeNode | null; n; n = n.parent) {
      if (n === this) return true;
    }
    return false;
  }
}

test("unmarked text is masked, its spaces kept", () => {
  const root = new FakeNode();
  expect(maskReplayText("Sam Rivera  won", root.child())).toBe(
    "*** ******  ***",
  );
});

test("text with no element is masked", () => {
  expect(maskReplayText("Step 2 of 4", null)).toBe("**** * ** *");
  expect(maskReplayText("Step 2 of 4")).toBe("**** * ** *");
});

test("text inside an unmask region reads through", () => {
  const button = new FakeNode().child(replayUnmask());
  expect(maskReplayText("Continue", button)).toBe("Continue");
  expect(maskReplayText("1 required left", button.child())).toBe(
    "1 required left",
  );
});

test("a replayMask() value inside an unmask region is masked", () => {
  const caption = new FakeNode().child(replayUnmask());
  const name = caption.child(replayMask());
  expect(maskReplayText("Sam ", name)).toBe("*** ");
  expect(maskReplayText("at the start", caption)).toBe("at the start");
});

test("an unmask region nested inside a mask region reads through", () => {
  const masked = new FakeNode().child(replayMask());
  const label = masked.child().child(replayUnmask());
  expect(maskReplayText("Back", label)).toBe("Back");
  expect(maskReplayText("Sam", masked.child())).toBe("***");
});

test("the marks are bare data attributes", () => {
  expect(replayUnmask()).toEqual({ "data-ph-unmask": "" });
  expect(replayMask()).toEqual({ "data-ph-mask": "" });
});
