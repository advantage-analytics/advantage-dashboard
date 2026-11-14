import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type {
  AdminLabelBoard,
  AdminLabelBoardRow,
} from "@/lib/data/label-queue-server";
import type { LabelJobRow } from "@/lib/data/labels-server";
import { createLoader, marker } from "./fixtures/vm-modules";

/**
 * The admin's Labels board on `/admin/labels` (T28), rendered offline from
 * fixtures. Every server action, `useStartLabelling`, the router and
 * `next/link` are stubbed: nothing here reaches a server or the database,
 * and no row is opened and no Assign is pressed.
 */

const NOW = Date.parse("2026-11-13T12:00:00Z");
const HOUR = 3_600_000;
const iso = (offsetHours: number) =>
  new Date(NOW + offsetHours * HOUR).toISOString();

const TEAM = "Ravenmoor Institute";

function row(
  n: number,
  overrides: Partial<AdminLabelBoardRow> = {},
): AdminLabelBoardRow {
  return {
    jobId: `job-${n}`,
    matchId: `match-${n}`,
    player1Name: `Player ${n}A`,
    player2Name: `Player ${n}B`,
    programName: "Personal",
    videoSeconds: 3600,
    urgency: "standard",
    dueAt: iso(10),
    claimable: false,
    sessionId: null,
    labellerId: null,
    labellerName: null,
    labellerPhotoUrl: null,
    assignedAt: null,
    claimedAt: null,
    submittedAt: null,
    publishedAt: null,
    sentBack: null,
    lastBeatAt: null,
    minutesWorked: 0,
    flags: null,
    ...overrides,
  };
}

function board(overrides: Partial<AdminLabelBoard> = {}): AdminLabelBoard {
  return {
    todo: [
      row(1, {
        player1Name: "Zephyrine Quillfeather",
        player2Name: "Oswaldo Brackenridge",
        programName: TEAM,
        dueAt: iso(-1.5),
        urgency: "express",
        claimable: true,
      }),
      row(2, { videoSeconds: 5400 }),
    ],
    inProgress: [
      row(3, {
        sessionId: "session-3",
        labellerId: "user-ines",
        labellerName: "Ines Okafor",
        flags: { resolved: 3, total: 10 },
        lastBeatAt: iso(-75),
      }),
      row(4, {
        sessionId: "session-4",
        labellerId: "user-tariq",
        labellerName: "Tariq Lindqvist",
        flags: { left: 4 },
        lastBeatAt: iso(-1),
      }),
    ],
    toCheck: [],
    submitted: [
      row(5, {
        sessionId: "session-5",
        labellerId: "user-maya",
        labellerName: "Maya Rao",
        submittedAt: iso(-3),
        flags: { resolved: 12, total: 12 },
      }),
    ],
    ...overrides,
  };
}

function loadBoard(started: string[]) {
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
      "lucide-react": {
        ChevronDown: marker("ChevronDown"),
        ChevronRight: marker("ChevronRight"),
      },
      "@/app/label/actions": {
        claimLabelMatchAction: async () => {
          throw new Error("Claim must not be called while rendering");
        },
      },
      "@/app/admin/labels/actions": {
        assignLabelSessionAction: async () => {
          throw new Error("Assign must not be called while rendering");
        },
      },
      "@/app/admin/seen-actions": {
        markAdminRowSeen: async () => {
          throw new Error("Seen must not be marked while rendering");
        },
      },
      "@/components/admin/labels/start-labelling-button": {
        useStartLabelling: (jobId: string) => {
          started.push(jobId);
          return {
            start: () => {
              throw new Error("No row is opened while rendering");
            },
            isPending: false,
            error: null,
          };
        },
      },
      "@/components/ui/float-menu": {
        FloatMenu: ({ trigger }: { trigger: React.ReactNode }) => trigger,
        FloatMenuItem: marker("FloatMenuItem"),
      },
      "@/components/ui/state-pill": {
        StatePill: ({ children }: { children: React.ReactNode }) =>
          React.createElement("span", null, children),
      },
      "@/components/ui/you-pill": { YouPill: marker("YouPill") },
      "@/components/admin/admin-cells": {
        AdminAvatar: marker("AdminAvatar"),
        AdminMatchCell: ({
          player,
          opponent,
        }: {
          player: string;
          opponent: string;
        }) => React.createElement("span", null, `${player} vs ${opponent}`),
        RowChevron: marker("RowChevron"),
        TwoLineDate: marker("TwoLineDate"),
        WorkspaceCell: marker("WorkspaceCell"),
      },
      "@/lib/ui/action-rejected": { actionRejected: () => ({ error: "x" }) },
    },
  });
  return loader.load("src/components/admin/labels/labels-board.tsx") as {
    LabelsBoard: React.ComponentType<{
      board: AdminLabelBoard;
      now: number;
    }>;
    RequestedReviews: React.ComponentType<{
      rows: readonly LabelJobRow[];
      owners: Record<string, never>;
    }>;
  };
}

function render(b: AdminLabelBoard, started: string[] = []): string {
  const { LabelsBoard } = loadBoard(started);
  return renderToStaticMarkup(
    React.createElement(LabelsBoard, { board: b, now: NOW }),
  );
}

/** The markup of one row, from its `data-labels-job` to the next row's. */
function rowHtml(html: string, jobId: string): string {
  const start = html.indexOf(`data-labels-job="${jobId}"`);
  expect(start).toBeGreaterThan(-1);
  const next = html.indexOf("data-labels-job=", start + 1);
  return html.slice(start, next === -1 ? undefined : next);
}

/** Text with the tags taken out, so split spans read as one sentence. */
const text = (html: string) => html.replace(/<[^>]+>/g, "");

test.describe("the admin's Labels board", () => {
  test("lanes in order: To do, In progress, Submitted, each with its count", () => {
    const html = render(board());
    const todo = html.indexOf(">To do</span>");
    const doing = html.indexOf(">In progress</span>");
    const submitted = html.indexOf(">Submitted</span>");
    expect(todo).toBeGreaterThan(-1);
    expect(doing).toBeGreaterThan(todo);
    expect(submitted).toBeGreaterThan(doing);
    // 1.00 + 1.50 h; 1.00 + 1.00 h; 1.00 h.
    expect(html).toContain("2 matches · 2.50 h");
    expect(html).toContain("2 matches · 2.00 h");
    expect(html).toContain("1 match · 1.00 h");
    // The lanes hold only the queue, and say where older matches went.
    expect(text(html)).toContain(
      "The board shows matches analysed from October 29, 2026. Label older ones from Matches.",
    );
    expect(html).toContain('href="/admin/matches"');
  });

  test("a row reads 'Player vs Player · Team', with hours, urgency and due text", () => {
    const html = rowHtml(render(board()), "job-1");
    expect(text(html)).toContain(
      `Zephyrine Quillfeather vs Oswaldo Brackenridge · ${TEAM}`,
    );
    expect(text(html)).toContain("1.00 h");
    expect(html).toContain("Express");
    expect(html).toMatch(/data-label-overdue="true"[^>]*>Overdue by 1 h</);
    // A personal match reads "· Personal".
    expect(text(rowHtml(render(board()), "job-2"))).toContain(
      "Player 2A vs Player 2B · Personal",
    );
  });

  test("an In progress row names its labeller and reads '3 of 10 flags resolved'", () => {
    const html = rowHtml(render(board()), "job-3");
    expect(text(html)).toContain("Ines Okafor");
    expect(text(html)).toContain("3 of 10 flags resolved");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="3"');
    expect(html).toContain('aria-valuemax="10"');
    // The holder's last beat was three days ago.
    expect(text(html)).toContain("no work in 3 days · 3 of 10 flags resolved");
  });

  test("a row with no starting count reads 'N flags left', with no bar", () => {
    const html = rowHtml(render(board()), "job-4");
    expect(text(html)).toContain("Tariq Lindqvist");
    expect(text(html)).toContain("4 flags left");
    expect(html).not.toContain('role="progressbar"');
    expect(text(html)).not.toContain("no work in");
  });

  test("a Submitted row names its labeller", () => {
    const html = rowHtml(render(board()), "job-5");
    expect(text(html)).toContain("Maya Rao");
    // Flags are an In progress fact only.
    expect(text(html)).not.toContain("flags resolved");
  });

  test("every row in every lane opens through useStartLabelling", () => {
    const started: string[] = [];
    const html = render(board(), started);
    expect([...started].sort()).toEqual([
      "job-1",
      "job-2",
      "job-3",
      "job-4",
      "job-5",
    ]);
    expect(html.match(/aria-label="Open [^"]+"/g)).toHaveLength(5);
  });

  test("rows with a session keep the Assign menu; rows without have none", () => {
    const html = render(board());
    for (const session of ["session-3", "session-4", "session-5"]) {
      expect(html).toContain(`data-labels-assign="${session}"`);
    }
    expect(rowHtml(html, "job-1")).not.toContain("data-labels-assign");
    expect(rowHtml(html, "job-2")).not.toContain("data-labels-assign");
  });

  test("an empty lane says so", () => {
    const html = render(board({ inProgress: [], submitted: [] }));
    expect(html).toContain("Nobody is labelling a match.");
    expect(html).toContain("Nothing has been submitted.");
    expect(html).toContain("0 matches · 0.00 h");
  });

  test("Requested reviews draws nothing with no report open", () => {
    const { RequestedReviews } = loadBoard([]);
    expect(
      renderToStaticMarkup(
        React.createElement(RequestedReviews, { rows: [], owners: {} }),
      ),
    ).toBe("");
  });
});
