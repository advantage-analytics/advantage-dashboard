import { expect, test } from "@playwright/test";

import { shouldApplyResult } from "@/components/dashboard/matches/match-detail/shots/viz-bands-context";

/**
 * `applyBands`'s request sequencing (Phase 2B Task 3, fix round 1).
 *
 * `shouldApplyResult` is one comparison, so testing it alone would prove
 * nothing. What these specs exercise is the PROTOCOL around it — claim a
 * generation before the await, re-check it after, apply nothing when it has
 * moved on — reproduced here over fake promises that resolve OUT OF ORDER,
 * which is the case that cannot be produced reliably against a real server
 * action.
 *
 * `applySave` below mirrors `applyBands`'s own body one-for-one (the bump,
 * the optimistic write, the await, the guard, then the success/failure
 * branches). If that body changes shape, this harness has to change with
 * it — which is the point: the ordering rule is what is being pinned, not
 * the helper's `===`.
 */

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

type SaveResult =
  { ok: true; data: string } | { ok: false; error: "forbidden" };

/** The state `applyBands` owns, as a plain object a test can read. */
interface Harness {
  seq: number;
  override: string | null;
  receipt: string | null;
}

function applySave(
  h: Harness,
  next: string,
  save: () => Promise<SaveResult>,
): Promise<void> {
  const seq = ++h.seq;
  h.override = next;
  return save().then((result) => {
    if (!shouldApplyResult(seq, h.seq)) return;
    if (result.ok) {
      h.override = result.data;
      h.receipt = "Bands saved";
      return;
    }
    h.override = null;
    h.receipt = "Bands not saved";
  });
}

function newHarness(): Harness {
  return { seq: 0, override: null, receipt: null };
}

test.describe("shouldApplyResult", () => {
  test("the newest save applies; an older one does not", () => {
    expect(shouldApplyResult(3, 3)).toBe(true);
    expect(shouldApplyResult(2, 3)).toBe(false);
    // A generation can never be ahead of the counter, but the rule is
    // "exactly the newest", not "at least the newest".
    expect(shouldApplyResult(4, 3)).toBe(false);
  });
});

test.describe("applyBands request sequencing", () => {
  test("a slow FIRST success resolving after a second pick does not overwrite it", async () => {
    const h = newHarness();
    const first = deferred<SaveResult>();
    const second = deferred<SaveResult>();

    const a = applySave(h, "thirds", () => first.promise);
    const b = applySave(h, "inside", () => second.promise);
    expect(h.override).toBe("inside");

    // Out of order: the SECOND save lands first, then the first.
    second.resolve({ ok: true, data: "inside" });
    await b;
    expect(h.override).toBe("inside");

    first.resolve({ ok: true, data: "thirds" });
    await a;
    expect(h.override).toBe("inside");
  });

  test("a FAILING first save does not revert the second pick's optimistic state", async () => {
    const h = newHarness();
    const first = deferred<SaveResult>();
    const second = deferred<SaveResult>();

    const a = applySave(h, "thirds", () => first.promise);
    const b = applySave(h, "inside", () => second.promise);

    first.resolve({ ok: false, error: "forbidden" });
    await a;
    // Neither the override nor the receipt may carry #1's refusal: the
    // state on screen belongs to #2, which has not answered yet.
    expect(h.override).toBe("inside");
    expect(h.receipt).toBeNull();

    second.resolve({ ok: true, data: "inside" });
    await b;
    expect(h.override).toBe("inside");
    expect(h.receipt).toBe("Bands saved");
  });

  test("the newest save still reverts and reports on its OWN failure", async () => {
    const h = newHarness();
    const first = deferred<SaveResult>();
    const second = deferred<SaveResult>();

    const a = applySave(h, "thirds", () => first.promise);
    const b = applySave(h, "inside", () => second.promise);

    first.resolve({ ok: true, data: "thirds" });
    await a;
    second.resolve({ ok: false, error: "forbidden" });
    await b;

    expect(h.override).toBeNull();
    expect(h.receipt).toBe("Bands not saved");
  });

  test("a single save is unaffected — it is always the newest", async () => {
    const h = newHarness();
    const only = deferred<SaveResult>();
    const p = applySave(h, "deepMidShort", () => only.promise);
    only.resolve({ ok: true, data: "deepMidShort" });
    await p;
    expect(h.override).toBe("deepMidShort");
    expect(h.receipt).toBe("Bands saved");
  });
});
