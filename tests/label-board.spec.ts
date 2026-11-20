import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  toLabellerBoard,
  type LabelQueueEntry,
  type LabelQueueEntrySession,
  type LabellerBoard,
  type LabellerSessionRow,
  type LabellerTodoRow,
} from "@/lib/data/label-queue-server";
import { createLoader, marker } from "./fixtures/vm-modules";

/**
 * The labeller's board on `/label` (T27), rendered offline from fixtures. The
 * claim action, the router and `next/link` are stubbed: nothing here reaches
 * a server or the database, and Claim is never pressed.
 */

const NOW = Date.parse("2026-11-13T12:00:00Z");
const HOUR = 3_600_000;
const iso = (offsetHours: number) =>
  new Date(NOW + offsetHours * HOUR).toISOString();

const MY_SESSION = "33333333-3333-4333-8333-333333333333";
const VIEWER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

/** On the queue entries the board is projected from; never on its markup. */
const PLAYER_ONE = "Zephyrine Quillfeather";
const PLAYER_TWO = "Oswaldo Brackenridge";
const PROGRAM = "Ravenmoor Institute";
const OTHER_FULL_NAME = "Tobi Adlerstein";

function todoRow(
  n: number,
  overrides: Partial<LabellerTodoRow> = {},
): LabellerTodoRow {
  return {
    jobId: `0000000${n}-0000-4000-8000-000000000000`,
    videoSeconds: 3600 + n * 360,
    urgency: "standard",
    dueAt: iso(n * 4),
    claimable: false,
    flags: null,
    ...overrides,
  };
}

/** Five waiting matches, the first three claimable, the first one overdue. */
const TODO: LabellerTodoRow[] = [
  todoRow(1, { dueAt: iso(-1.5), claimable: true, urgency: "express" }),
  todoRow(2, { claimable: true }),
  todoRow(3, { claimable: true }),
  todoRow(4),
  todoRow(5),
];

function sessionRow(
  overrides: Partial<LabellerSessionRow> = {},
): LabellerSessionRow {
  return {
    mine: false,
    labellerFirstName: "Maya",
    labellerPhotoUrl: null,
    flags: { left: 4 },
    videoSeconds: 5400,
    urgency: "standard",
    dueAt: iso(10),
    submittedAt: null,
    publishedAt: null,
    sentBack: null,
    ...overrides,
  };
}

function board(overrides: Partial<LabellerBoard> = {}): LabellerBoard {
  return {
    todo: TODO,
    inProgress: [
      sessionRow({ labellerFirstName: "Tobi" }),
      sessionRow({
        mine: true,
        sessionId: MY_SESSION,
        labellerFirstName: "Sam",
        flags: { resolved: 31, total: 40 },
        dueAt: iso(6),
      }),
    ],
    published: [],
    submitted: [sessionRow({ submittedAt: iso(-3) })],
    holding: false,
    ...overrides,
  };
}

function render(b: LabellerBoard, canClaim = true): string {
  const loader = createLoader({
    stubs: {
      "next/link": ({
        href,
        children,
        ...rest
      }: {
        href: string;
        children: React.ReactNode;
      }) => React.createElement("a", { href, ...rest }, children),
      "next/navigation": {
        useRouter: () => ({ push: () => {}, refresh: () => {} }),
      },
      "lucide-react": { ChevronRight: marker("ChevronRight") },
      "@/app/label/actions": {
        claimLabelMatchAction: async () => {
          throw new Error("Claim must not be called while rendering");
        },
      },
      "@/components/admin/admin-cells": {
        AdminAvatar: ({ name }: { name: string }) =>
          React.createElement("span", {
            "data-component": "AdminAvatar",
            "data-name": name,
          }),
      },
    },
  });
  const { LabelBoard } = loader.load(
    "src/components/label/label-board.tsx",
  ) as {
    LabelBoard: React.ComponentType<{
      board: LabellerBoard;
      now: number;
      canClaim: boolean;
    }>;
  };
  return renderToStaticMarkup(
    React.createElement(LabelBoard, { board: b, now: NOW, canClaim }),
  );
}

const claimButtons = (html: string) =>
  html.match(/data-label-claim=""/g)?.length ?? 0;

test.describe("LabelBoard", () => {
  test("three lanes, each with its match count and hours", () => {
    const html = render(board());
    expect(html).toContain(">To do</span>");
    expect(html).toContain(">In progress</span>");
    expect(html).toContain(">Published</span>");
    // Old hand-ins still sit in Submitted, so the fourth lane shows.
    expect(html).toContain(">Submitted</span>");
    expect(html).toContain(
      "Publishing puts a match in front of the player straight away. It can still be sent back to you.",
    );
    // 1.10 + 1.20 + 1.30 + 1.40 + 1.50 h of video.
    expect(html).toContain("5 matches · 6.50 h");
    expect(html).toContain("2 matches · 3.00 h");
    expect(html).toContain("1 match · 1.50 h");
    expect(html).toContain("5 matches to label");
  });

  test("three Claim buttons on a five-row To do", () => {
    const html = render(board());
    expect(html.match(/data-label-todo-row=""/g)).toHaveLength(5);
    expect(claimButtons(html)).toBe(3);
  });

  test("no Claim button while holding a match", () => {
    const html = render(board({ holding: true }));
    expect(claimButtons(html)).toBe(0);
    expect(html).toContain("Publish yours to claim the next one.");
  });

  test("no Claim button for an admin who is not a labeler", () => {
    expect(claimButtons(render(board(), false))).toBe(0);
  });

  test("the overdue row reads 'Overdue by 1 h' in the overdue style", () => {
    const html = render(board());
    expect(html).toContain("Overdue by 1 h");
    expect(html).toMatch(/data-label-overdue="true"[^>]*>Overdue by 1 h</);
    expect(html.match(/data-label-overdue="true"/g)).toHaveLength(1);
    expect(html).toContain("1 overdue.");
    expect(html).toContain("Due in 8 h");
  });

  test("the viewer's card comes first, with the flags progressbar", () => {
    const html = render(board());
    const mine = html.indexOf("data-label-mine");
    const tobi = html.indexOf('data-name="Tobi"');
    expect(mine).toBeGreaterThan(-1);
    expect(mine).toBeLessThan(tobi);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="31"');
    expect(html).toContain('aria-valuemax="40"');
    expect(html).toContain("31 of 40</span> flags resolved");
    expect(html).toContain(`href="/label/${MY_SESSION}"`);
    expect(html).toContain("Continue labeling");
  });

  test("a card with no starting count reads 'N flags left' and no bar", () => {
    const html = render(
      board({
        inProgress: [
          sessionRow({
            mine: true,
            sessionId: MY_SESSION,
            flags: { left: 7 },
          }),
        ],
      }),
    );
    expect(html).toContain("7</span> flags left");
    expect(html).not.toContain('role="progressbar"');
  });

  test("other labelers' rows show a first name and an avatar", () => {
    const html = render(board());
    expect(html).toContain('data-name="Tobi"');
    expect(html).toContain('data-name="Maya"');
    expect(html).toContain(">Tobi</span>");
  });

  test("no player name anywhere in the markup", () => {
    const session = (
      id: string,
      status: string,
      assignedTo: string | null,
    ): LabelQueueEntrySession => ({
      id,
      status,
      assignedTo,
      assignee: assignedTo
        ? {
            id: assignedTo,
            firstName: assignedTo === VIEWER ? "Sam" : "Tobi",
            fullName: assignedTo === VIEWER ? "Sam Ortiz" : OTHER_FULL_NAME,
            photoUrl: null,
          }
        : null,
      assignedAt: iso(-5),
      claimedAt: null,
      submittedAt: status === "submitted" ? iso(-1) : null,
      publishedAt: null,
      sentBack: null,
      flags: { left: 2 },
      labellerId: assignedTo,
      lastBeatAt: null,
      minutesWorked: 0,
    });
    const entry = (
      n: number,
      s: LabelQueueEntrySession | null,
    ): LabelQueueEntry => ({
      id: `0000000${n}-0000-4000-8000-000000000000`,
      matchId: `9999999${n}-9999-4999-8999-999999999999`,
      completedAt: iso(n - 36),
      dueAt: iso(n),
      addedAt: null,
      videoSeconds: 3600,
      urgency: "standard",
      player1Name: PLAYER_ONE,
      player2Name: PLAYER_TWO,
      programName: PROGRAM,
      session: s,
    });
    const projected = toLabellerBoard(
      [
        entry(1, null),
        entry(2, null),
        entry(3, session(MY_SESSION, "labelling", VIEWER)),
        entry(
          4,
          session("44444444-4444-4444-8444-444444444444", "labelling", OTHER),
        ),
        entry(
          5,
          session("55555555-5555-4555-8555-555555555555", "submitted", OTHER),
        ),
      ],
      VIEWER,
      true,
    );
    const html = render(projected);
    for (const name of [PLAYER_ONE, PLAYER_TWO, PROGRAM, OTHER_FULL_NAME]) {
      expect(html).not.toContain(name);
    }
    expect(html).not.toContain("Quillfeather");
    expect(html).not.toContain("Brackenridge");
    expect(html).not.toContain("99999991");
    expect(html).not.toContain("/admin");
    // The viewer's own session is still the one link the board carries.
    expect(html).toContain(`href="/label/${MY_SESSION}"`);
    expect(html).not.toContain("44444444-");
  });

  test("Submitted shows only while it has rows", () => {
    const html = render(board({ submitted: [] }));
    expect(html).toContain(">Published</span>");
    expect(html).not.toContain(">Submitted</span>");
    expect(html).not.toContain('data-label-lane="label-board-submitted"');
  });

  test("published rows read '<first name or You> · <ago>' with the avatar", () => {
    const html = render(
      board({
        published: [
          sessionRow({
            labellerFirstName: "Maya",
            publishedAt: iso(-2),
          }),
          sessionRow({
            mine: true,
            sessionId: "66666666-6666-4666-8666-666666666666",
            labellerFirstName: "Sam",
            publishedAt: iso(-26),
          }),
        ],
      }),
    );
    expect(html.match(/data-label-published-row=""/g)).toHaveLength(2);
    expect(html).toContain(">Maya · 2 h ago</span>");
    expect(html).toContain(">You · 1 day ago</span>");
    expect(html).toContain('data-name="Maya"');
    expect(html).toContain('data-name="Sam"');
    // A published row is not a way into the session.
    expect(html).not.toContain('href="/label/66666666-');
  });

  test("a sent-back match leads In progress with the note and the link", () => {
    const NOTE =
      "Set 2, game 5 has two points merged into one. Split them and recheck the game score.";
    const html = render(
      board({
        inProgress: [
          sessionRow({ labellerFirstName: "Tobi" }),
          sessionRow({
            mine: true,
            sessionId: MY_SESSION,
            labellerFirstName: "Sam",
            publishedAt: null,
            sentBack: { at: iso(-2), note: NOTE },
          }),
        ],
        // `holding` is the loader's; the sent-back row alone must stop claims.
        holding: false,
      }),
    );
    const card = html.indexOf("data-label-sent-back");
    expect(card).toBeGreaterThan(-1);
    expect(card).toBeLessThan(html.indexOf('data-name="Tobi"'));
    expect(html).toContain("Sent back 2 h ago");
    expect(html).toContain(NOTE);
    expect(html).toContain(
      "Your first version is still published. Publishing again replaces it.",
    );
    expect(html).toMatch(
      new RegExp(`href="/label/${MY_SESSION}"[^>]*>Fix and publish again`),
    );
    expect(html).not.toContain("Continue labeling");
    expect(html).toContain(
      "A match was sent back to you. Fix and publish it again to claim the next one.",
    );
    expect(claimButtons(html)).toBe(0);
  });

  test("sent-back and published rows from the projection name no player", () => {
    const NOTE = "Recheck the tiebreak.";
    const projected = toLabellerBoard(
      [
        {
          id: "00000007-0000-4000-8000-000000000000",
          matchId: "99999997-9999-4999-8999-999999999999",
          completedAt: iso(-40),
          dueAt: iso(-4),
          addedAt: null,
          videoSeconds: 3600,
          urgency: "standard",
          player1Name: PLAYER_ONE,
          player2Name: PLAYER_TWO,
          programName: PROGRAM,
          session: {
            id: MY_SESSION,
            status: "labelling",
            assignedTo: VIEWER,
            sentBackAt: iso(-1),
            assignee: {
              id: VIEWER,
              firstName: "Sam",
              fullName: "Sam Ortiz",
              photoUrl: null,
            },
            assignedAt: iso(-30),
            claimedAt: iso(-30),
            submittedAt: null,
            publishedAt: null,
            sentBack: { at: iso(-1), note: NOTE },
            flags: null,
            labellerId: VIEWER,
            lastBeatAt: null,
            minutesWorked: 0,
          },
        },
        {
          id: "00000008-0000-4000-8000-000000000000",
          matchId: "99999998-9999-4999-8999-999999999999",
          completedAt: iso(-30),
          dueAt: iso(6),
          addedAt: null,
          videoSeconds: 4200,
          urgency: "standard",
          player1Name: PLAYER_ONE,
          player2Name: PLAYER_TWO,
          programName: PROGRAM,
          session: {
            id: "88888888-8888-4888-8888-888888888888",
            status: "complete",
            assignedTo: OTHER,
            assignee: {
              id: OTHER,
              firstName: "Tobi",
              fullName: OTHER_FULL_NAME,
              photoUrl: null,
            },
            assignedAt: iso(-20),
            claimedAt: iso(-20),
            submittedAt: null,
            publishedAt: iso(-3),
            sentBack: null,
            flags: null,
            labellerId: OTHER,
            lastBeatAt: null,
            minutesWorked: 0,
          },
        },
      ],
      VIEWER,
      true,
    );
    const html = render(projected);
    expect(html).toContain(NOTE);
    expect(html).toContain(">Tobi · 3 h ago</span>");
    for (const name of [PLAYER_ONE, PLAYER_TWO, PROGRAM, OTHER_FULL_NAME]) {
      expect(html).not.toContain(name);
    }
    expect(html).not.toContain("Sam Ortiz");
    expect(html).not.toContain("9999999");
    expect(html).not.toContain("88888888-");
    expect(html).toContain(`href="/label/${MY_SESSION}"`);
    expect(claimButtons(html)).toBe(0);
  });

  test("shows the first eight with 'Show N more'", () => {
    const many = Array.from({ length: 11 }, (_, i) => todoRow(i + 1));
    const html = render(board({ todo: many }));
    expect(html.match(/data-label-todo-row=""/g)).toHaveLength(8);
    expect(html).toContain("Show 3 more");
  });
});
