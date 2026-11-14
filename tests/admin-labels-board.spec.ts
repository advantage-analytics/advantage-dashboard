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
 * The admin's Labels board on `/admin/labels` (T28, T35), rendered offline
 * from fixtures. Every server action, `useStartLabelling`, the router,
 * `next/link` and the confirm dialog are stubbed: nothing here reaches a
 * server or the database, and no row is opened and no Assign, Check or Send
 * back is pressed.
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
    toCheck: [
      row(6, {
        player1Name: "Hollis Varga",
        player2Name: "Tomasz Moreau",
        programName: TEAM,
        videoSeconds: 4500,
        dueAt: iso(-10),
        sessionId: "session-6",
        labellerId: "user-ines",
        labellerName: "Ines Okafor",
        publishedAt: iso(-2),
      }),
    ],
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
        checkLabelSessionAction: async () => {
          throw new Error("Check must not be called while rendering");
        },
        sendBackLabelSessionAction: async () => {
          throw new Error("Send back must not be called while rendering");
        },
      },
      // Radix portals draw nothing on the server, so the dialog is drawn
      // inline, open or not, with its confirm's held state.
      "@/components/ui/confirm-dialog": {
        ConfirmDialog: ({
          open,
          title,
          confirmLabel,
          confirmDisabled,
          children,
        }: {
          open: boolean;
          title: string;
          confirmLabel: string;
          confirmDisabled?: boolean;
          children?: React.ReactNode;
        }) =>
          open
            ? React.createElement(
                "div",
                { role: "alertdialog" },
                React.createElement("h2", null, title),
                children,
                React.createElement(
                  "button",
                  {
                    type: "button",
                    "data-confirm": "",
                    disabled: !!confirmDisabled,
                  },
                  confirmLabel,
                ),
              )
            : null,
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
  const dialog = loader.load(
    "src/components/admin/labels-board/send-back-dialog.tsx",
  ) as {
    SendBackDialog: React.ComponentType<{
      open: boolean;
      onOpenChange: (open: boolean) => void;
      players: string;
      labellerName: string | null;
      note: string;
      onNoteChange: (note: string) => void;
      pending: boolean;
      error: string | null;
      onConfirm: () => void;
    }>;
    canSendBack: (note: string) => boolean;
  };
  const board = loader.load("src/components/admin/labels/labels-board.tsx") as {
    LabelsBoard: React.ComponentType<{
      board: AdminLabelBoard;
      now: number;
    }>;
    RequestedReviews: React.ComponentType<{
      rows: readonly LabelJobRow[];
      owners: Record<string, never>;
    }>;
  };
  return { ...board, ...dialog };
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
  test("lanes in order: To do, In progress, Published, to check, then Submitted, each with its count", () => {
    const html = render(board());
    const todo = html.indexOf(">To do</span>");
    const doing = html.indexOf(">In progress</span>");
    const check = html.indexOf(">Published, to check</span>");
    const submitted = html.indexOf(">Submitted</span>");
    expect(todo).toBeGreaterThan(-1);
    expect(doing).toBeGreaterThan(todo);
    expect(check).toBeGreaterThan(doing);
    expect(submitted).toBeGreaterThan(check);
    // 1.00 + 1.50 h; 1.00 + 1.00 h; 1.25 h; 1.00 h.
    expect(html).toContain("2 matches · 2.50 h");
    expect(html).toContain("2 matches · 2.00 h");
    expect(html).toContain("1 match · 1.25 h");
    expect(html).toContain("1 match · 1.00 h");
    // The line under the to-check lane.
    expect(text(html)).toContain(
      "These are already live for the player. Matches you publish yourself skip this list.",
    );
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
      "job-6",
    ]);
    expect(html.match(/aria-label="Open [^"]+"/g)).toHaveLength(6);
  });

  test("rows with a session keep the Assign menu; rows without have none", () => {
    const html = render(board());
    for (const session of ["session-3", "session-4", "session-5"]) {
      expect(html).toContain(`data-labels-assign="${session}"`);
    }
    expect(rowHtml(html, "job-1")).not.toContain("data-labels-assign");
    expect(rowHtml(html, "job-2")).not.toContain("data-labels-assign");
  });

  test("an empty lane says so; an empty Submitted lane is not drawn", () => {
    const html = render(board({ inProgress: [], toCheck: [], submitted: [] }));
    expect(html).toContain("Nobody is labelling a match.");
    expect(html).toContain("Nothing published is waiting for a check.");
    expect(html).toContain("0 matches · 0.00 h");
    expect(html).not.toContain(">Submitted</span>");
    expect(html).not.toContain("Nothing has been submitted.");
    // The other three lanes still draw, in order.
    expect(html.indexOf(">Published, to check</span>")).toBeGreaterThan(
      html.indexOf(">In progress</span>"),
    );
  });

  test("a to-check row reads its labeller, when it was published, and how it kept time", () => {
    const html = rowHtml(render(board()), "job-6");
    expect(text(html)).toContain(`Hollis Varga vs Tomasz Moreau · ${TEAM}`);
    expect(text(html)).toContain("1.25 h");
    expect(text(html)).toContain("Ines Okafor · published 2 h ago");
    // Published 8 h after it was due.
    expect(html).toMatch(/data-label-published-late="true"[^>]*>8 h late</);
    // Published, it has no Assign menu.
    expect(html).not.toContain("data-labels-assign");
  });

  test("Check and Send back are on to-check rows and on no other row", () => {
    const html = render(board());
    const check = rowHtml(html, "job-6");
    expect(check).toContain('data-labels-check="session-6"');
    expect(check).toContain('data-labels-send-back="session-6"');
    expect(text(check)).toContain("Check");
    expect(text(check)).toContain("Send back");
    expect(html.match(/data-labels-check=/g)).toHaveLength(1);
    expect(html.match(/data-labels-send-back=/g)).toHaveLength(1);
    for (const job of ["job-1", "job-2", "job-3", "job-4", "job-5"]) {
      expect(rowHtml(html, job)).not.toContain("data-labels-check");
      expect(rowHtml(html, job)).not.toContain("data-labels-send-back");
    }
    // The dialog is closed until Send back is pressed.
    expect(html).not.toContain('role="alertdialog"');
  });

  test("Send back's confirm is held while the note is blank", () => {
    const { SendBackDialog, canSendBack } = loadBoard([]);
    const draw = (note: string) =>
      renderToStaticMarkup(
        React.createElement(SendBackDialog, {
          open: true,
          onOpenChange: () => {},
          players: "Hollis Varga vs Tomasz Moreau",
          labellerName: "Ines Okafor",
          note,
          onNoteChange: () => {},
          pending: false,
          error: null,
          onConfirm: () => {},
        }),
      );
    const confirm = (html: string) =>
      html.match(/<button[^>]*data-confirm=""[^>]*>Send back<\/button>/)?.[0];

    for (const blank of ["", "   \n  "]) {
      const html = draw(blank);
      expect(html).toContain("Send Hollis Varga vs Tomasz Moreau back?");
      expect(html).toMatch(/<textarea[^>]*required=""/);
      expect(confirm(html)).toContain('disabled=""');
      expect(canSendBack(blank)).toBe(false);
    }
    const written = draw("Set 2, game 5 has two points merged into one.");
    expect(confirm(written)).toBeDefined();
    expect(confirm(written)).not.toContain("disabled");
    expect(canSendBack(" Set 2 ")).toBe(true);
  });

  test("a sent-back In progress row reads 'Sent back', its labeller, when, and the note", () => {
    const html = rowHtml(
      render(
        board({
          inProgress: [
            row(7, {
              sessionId: "session-7",
              labellerId: "user-sam",
              labellerName: "Sam Ortiz",
              sentBack: {
                at: iso(-2),
                note: "Set 2, game 5 has two points merged into one.",
              },
            }),
          ],
        }),
      ),
      "job-7",
    );
    expect(text(html)).toContain("Sent back");
    expect(text(html)).toContain("Sam Ortiz");
    expect(text(html)).toContain("sent back 2 h ago");
    expect(text(html)).toContain(
      "Note: Set 2, game 5 has two points merged into one.",
    );
    // An open session: it keeps its Assign menu, and has no Check.
    expect(html).toContain('data-labels-assign="session-7"');
    expect(html).not.toContain("data-labels-check");
  });

  test("a row nobody sent back has no Sent back pill or note", () => {
    const html = rowHtml(render(board()), "job-3");
    expect(text(html)).not.toContain("Sent back");
    expect(html).not.toContain("data-admin-label-note");
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
