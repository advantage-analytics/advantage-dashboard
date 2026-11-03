import { expect, test } from "@playwright/test";

import {
  PROGRAM_STATUS_POLL_MS,
  holdsUploadFlow,
  watchProgramStatus,
} from "@/lib/workspace/program-status-watch";

/**
 * `ProgramStatusSync` refreshes the dashboard on this function's word. Wrong in
 * one direction, a coach reloads by hand after approval; wrong in the other, the
 * page refreshes under them on every tick or dropped request.
 */
function setup(
  answers: (string | null | Error | "hang")[],
  readTimeoutMs?: number,
) {
  let hidden = false;
  let tick = () => {};
  let back = () => {};
  let intervalMs = 0;
  let cleanups = 0;
  let reads = 0;
  let decided = 0;

  const stop = watchProgramStatus({
    current: "claim_pending",
    read: async () => {
      const answer = answers[Math.min(reads, answers.length - 1)];
      reads += 1;
      if (answer === "hang") return new Promise<null>(() => {});
      if (answer instanceof Error) throw answer;
      return answer;
    },
    readTimeoutMs,
    onDecided: () => {
      decided += 1;
    },
    surface: {
      isHidden: () => hidden,
      onReturn: (listener) => {
        back = listener;
        return () => {
          cleanups += 1;
        };
      },
      setInterval: (run, ms) => {
        tick = run;
        intervalMs = ms;
        return () => {
          cleanups += 1;
        };
      },
    },
  });

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  return {
    stop,
    settle,
    tick: () => tick(),
    back: () => back(),
    hide: (value: boolean) => {
      hidden = value;
    },
    state: () => ({ reads, decided, cleanups, intervalMs }),
  };
}

test("checks at once, then on the poll interval", async () => {
  const w = setup(["claim_pending"]);
  await w.settle();
  expect(w.state().reads).toBe(1);
  expect(w.state().intervalMs).toBe(PROGRAM_STATUS_POLL_MS);
  w.tick();
  await w.settle();
  expect(w.state().reads).toBe(2);
  expect(w.state().decided).toBe(0);
});

test("an approval is noticed on focus, once, and the watch stops", async () => {
  const w = setup(["claim_pending", "active"]);
  await w.settle();
  w.back();
  await w.settle();
  expect(w.state().decided).toBe(1);
  expect(w.state().cleanups).toBe(2);

  w.back();
  w.tick();
  await w.settle();
  expect(w.state().reads).toBe(2);
  expect(w.state().decided).toBe(1);
});

test("a rejection refreshes too, so the coach is not left in the workspace", async () => {
  const w = setup(["unclaimed"]);
  await w.settle();
  expect(w.state().decided).toBe(1);
});

test("a failed or empty read never refreshes, and the next one still can", async () => {
  const w = setup([null, new Error("network"), "active"]);
  await w.settle();
  expect(w.state().decided).toBe(0);
  w.tick();
  await w.settle();
  expect(w.state().decided).toBe(0);
  w.tick();
  await w.settle();
  expect(w.state().decided).toBe(1);
});

test("a hidden tab does not poll, and coming back checks", async () => {
  const w = setup(["claim_pending", "active"]);
  await w.settle();
  w.hide(true);
  w.tick();
  await w.settle();
  expect(w.state().reads).toBe(1);

  w.hide(false);
  w.back();
  await w.settle();
  expect(w.state().decided).toBe(1);
});

test("a read that never settles times out, so later checks still run", async () => {
  const w = setup(["hang", "active"], 20);
  await w.settle();
  w.tick();
  await w.settle();
  expect(w.state().reads).toBe(1);

  await new Promise((resolve) => setTimeout(resolve, 40));
  w.tick();
  await w.settle();
  expect(w.state().reads).toBe(2);
  expect(w.state().decided).toBe(1);
});

test("holds off on both pages that mount the upload flow, and nowhere else", () => {
  for (const path of [
    "/dashboard/matches/new",
    "/dashboard/matches/new/anything",
    "/dashboard/team/upload",
  ]) {
    expect(holdsUploadFlow(path)).toBe(true);
  }
  for (const path of [
    "/dashboard",
    "/dashboard/team",
    "/dashboard/matches",
    "/dashboard/matches/newer",
    "/dashboard/team/uploads",
  ]) {
    expect(holdsUploadFlow(path)).toBe(false);
  }
});

test("an answer arriving after cleanup is ignored", async () => {
  const w = setup(["active"]);
  w.stop();
  await w.settle();
  expect(w.state().decided).toBe(0);
});
