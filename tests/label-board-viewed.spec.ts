import { expect, test } from "@playwright/test";

import type {
  LabellerBoard,
  LabellerSessionRow,
  LabellerTodoRow,
} from "@/lib/data/label-queue-server";
import { labelBoardViewedProperties } from "@/lib/services/labels/board-viewed";

/**
 * `label_board_viewed` says how many jobs `/label` offered, so a labeller
 * polling an empty queue can be told apart from one facing a full board they
 * did not act on. These pin the counts against the board the page draws, and
 * that nothing but numbers and flags leaves for PostHog.
 */

const NOW = Date.parse("2026-11-25T12:00:00Z");
const iso = (offsetHours: number) =>
  new Date(NOW + offsetHours * 3_600_000).toISOString();

function todo(overrides: Partial<LabellerTodoRow> = {}): LabellerTodoRow {
  return {
    jobId: "11111111-1111-4111-8111-111111111111",
    videoSeconds: 3600,
    urgency: "standard",
    dueAt: iso(10),
    claimable: true,
    flags: null,
    ...overrides,
  };
}

function session(
  overrides: Partial<LabellerSessionRow> = {},
): LabellerSessionRow {
  return {
    mine: false,
    labellerFirstName: "Sam",
    labellerPhotoUrl: null,
    flags: null,
    videoSeconds: 1800,
    urgency: "standard",
    dueAt: iso(5),
    submittedAt: null,
    publishedAt: null,
    sentBack: null,
    ...overrides,
  };
}

function board(overrides: Partial<LabellerBoard> = {}): LabellerBoard {
  return {
    todo: [],
    inProgress: [],
    published: [],
    submitted: [],
    holding: false,
    ...overrides,
  };
}

test("an empty queue reads as nothing available", () => {
  expect(labelBoardViewedProperties(board(), true, NOW)).toEqual({
    available_count: 0,
    claimable_count: 0,
    overdue_count: 0,
    in_progress_count: 0,
    in_progress_mine_count: 0,
    published_count: 0,
    submitted_count: 0,
    holding: false,
    sent_back: false,
    can_claim: true,
  });
});

test("counts each lane, the claimable rows and the overdue ones", () => {
  const props = labelBoardViewedProperties(
    board({
      todo: [
        todo({ dueAt: iso(-2) }),
        todo(),
        todo(),
        todo({ claimable: false }),
      ],
      inProgress: [
        session({ mine: true, sessionId: "s-1" }),
        session(),
        session(),
      ],
      published: [session({ publishedAt: iso(-1) })],
      submitted: [session({ submittedAt: iso(-3) }), session()],
    }),
    true,
    NOW,
  );
  expect(props).toMatchObject({
    available_count: 4,
    claimable_count: 3,
    overdue_count: 1,
    in_progress_count: 3,
    in_progress_mine_count: 1,
    published_count: 1,
    submitted_count: 2,
    holding: false,
    sent_back: false,
  });
});

test("nothing is claimable while the viewer holds a match or is not a labeller", () => {
  const rows = [todo(), todo()];
  expect(
    labelBoardViewedProperties(board({ todo: rows, holding: true }), true, NOW)
      .claimable_count,
  ).toBe(0);
  expect(
    labelBoardViewedProperties(board({ todo: rows }), false, NOW),
  ).toMatchObject({ claimable_count: 0, available_count: 2, can_claim: false });

  const sentBack = labelBoardViewedProperties(
    board({
      todo: rows,
      inProgress: [
        session({ mine: true, sentBack: { at: iso(-1), note: "Fix set 2" } }),
      ],
    }),
    true,
    NOW,
  );
  expect(sentBack).toMatchObject({
    claimable_count: 0,
    holding: true,
    sent_back: true,
  });
});

test("only numbers and booleans are sent — no id, name, note or time", () => {
  const props = labelBoardViewedProperties(
    board({
      todo: [todo()],
      inProgress: [
        session({
          mine: true,
          sessionId: "33333333-3333-4333-8333-333333333333",
          sentBack: { at: iso(-1), note: "Fix set 2" },
        }),
      ],
    }),
    true,
    NOW,
  );
  for (const value of Object.values(props)) {
    expect(["number", "boolean"]).toContain(typeof value);
  }
  const json = JSON.stringify(props);
  for (const leak of ["1111", "3333", "Sam", "Fix set", "2026-"]) {
    expect(json).not.toContain(leak);
  }
});
