import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

import {
  COPIED,
  COPY_FAILED,
  COPY_FEEDBACK_MS,
  copyFeedback,
  copyText,
  type CopyResult,
} from "@/components/admin/matches/admin-report-copy";

/**
 * The admin report strip's "Copied" / "Copy failed" line beside the ⋯ menu
 * (admin-report-strip.tsx): what a copy answers, and how long it is shown.
 */

test.describe("copyText", () => {
  test("a written clipboard answers Copied with the value", async () => {
    const written: string[] = [];
    const clipboard = {
      writeText: async (value: string) => {
        written.push(value);
      },
    };
    expect(await copyText(clipboard, "match-id")).toBe(COPIED);
    expect(written).toEqual(["match-id"]);
  });

  test("a refused write answers Copy failed and never rejects", async () => {
    const clipboard = {
      writeText: async () => {
        throw new Error("NotAllowedError");
      },
    };
    expect(await copyText(clipboard, "match-id")).toBe(COPY_FAILED);
  });

  test("no clipboard (an insecure context) answers Copy failed", async () => {
    expect(await copyText(undefined, "match-id")).toBe(COPY_FAILED);
  });
});

/** Timers run by hand: `fire()` runs whatever is still pending. */
function fakeTimers() {
  const pending = new Map<number, { run: () => void; ms: number }>();
  let next = 0;
  return {
    pending,
    timers: {
      set: (run: () => void, ms: number) => {
        pending.set(++next, { run, ms });
        return next;
      },
      clear: (handle: unknown) => {
        pending.delete(handle as number);
      },
    },
    fire() {
      for (const [id, { run }] of [...pending]) {
        pending.delete(id);
        run();
      }
    },
  };
}

test.describe("copyFeedback", () => {
  test("shows the result, then clears it after COPY_FEEDBACK_MS", () => {
    const shown: (CopyResult | null)[] = [];
    const clock = fakeTimers();
    const feedback = copyFeedback((r) => shown.push(r), clock.timers);
    feedback.say(COPIED);
    expect(shown).toEqual([COPIED]);
    expect([...clock.pending.values()].map((t) => t.ms)).toEqual([
      COPY_FEEDBACK_MS,
    ]);
    clock.fire();
    expect(shown).toEqual([COPIED, null]);
  });

  test("a second copy restarts the clock: one clear, after the last", () => {
    const shown: (CopyResult | null)[] = [];
    const clock = fakeTimers();
    const feedback = copyFeedback((r) => shown.push(r), clock.timers);
    feedback.say(COPIED);
    feedback.say(COPY_FAILED);
    expect(clock.pending.size).toBe(1);
    clock.fire();
    expect(shown).toEqual([COPIED, COPY_FAILED, null]);
  });

  test("dispose cancels a pending clear", () => {
    const shown: (CopyResult | null)[] = [];
    const clock = fakeTimers();
    const feedback = copyFeedback((r) => shown.push(r), clock.timers);
    feedback.say(COPIED);
    feedback.dispose();
    expect(clock.pending.size).toBe(0);
    expect(shown).toEqual([COPIED]);
  });
});

test("the strip announces the result in a polite status region", () => {
  const source = readFileSync(
    "src/components/admin/matches/admin-report-strip.tsx",
    "utf8",
  );
  expect(source).toMatch(
    /role="status"\s+aria-live="polite"[\s\S]{0,200}\{copied\}/,
  );
  expect(source).toContain(
    "copyText(navigator.clipboard, value).then(feedback.say)",
  );
});
