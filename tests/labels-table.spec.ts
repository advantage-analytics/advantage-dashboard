import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { LabelJobRow } from "@/lib/data/labels-server";
import { createLoader } from "./fixtures/vm-modules";

/**
 * The Admin › Labels list, rendered offline (T18). Two jobs can cover the same
 * players, so the Job column — completion time + short job id — is the only
 * thing that tells their rows apart.
 */

function job(overrides: Partial<LabelJobRow>): LabelJobRow {
  return {
    jobId: "00000000-0000-4000-8000-000000000000",
    matchId: "match-1",
    player1Name: "Ace Revelli",
    player2Name: "Goodman Stepanov",
    pointCount: 87,
    completedAt: "2026-10-03T14:14:00Z",
    session: null,
    ...overrides,
  };
}

function render(rows: LabelJobRow[]): string {
  const { LabelsTable } = createLoader({
    stubs: {
      // A client component that reaches for the router and a server action;
      // a static render never clicks it.
      "@/components/admin/labels/start-labelling-button": {
        StartLabellingButton: ({ hasSession }: { hasSession: boolean }) =>
          React.createElement(
            "span",
            { "data-start-labelling": "" },
            hasSession ? "Continue" : "Start labelling",
          ),
      },
    },
  }).load("src/components/admin/labels/labels-table.tsx") as {
    LabelsTable: React.ComponentType<{ rows: readonly LabelJobRow[] }>;
  };
  return renderToStaticMarkup(React.createElement(LabelsTable, { rows }));
}

test.describe("LabelsTable Job column", () => {
  test("the header names the column", () => {
    expect(render([job({})])).toContain(">Job<");
  });

  test("two jobs for the same players are told apart by id and time", () => {
    const html = render([
      job({
        jobId: "aaaaaaaa-1111-4111-8111-111111111111",
        completedAt: "2026-10-03T14:14:00Z",
      }),
      job({
        jobId: "bbbbbbbb-2222-4222-8222-222222222222",
        completedAt: "2026-10-04T09:30:00Z",
      }),
    ]);
    expect(html).toContain("aaaaaaaa");
    expect(html).toContain("bbbbbbbb");
    // Only the first 8 characters, never the whole id.
    expect(html).not.toContain("aaaaaaaa-1111");
    expect(html).toContain("Oct 3, 2026, 2:14 PM UTC");
    expect(html).toContain("Oct 4, 2026, 9:30 AM UTC");
  });

  test("a null completedAt draws an EmptyMark, not Invalid Date", () => {
    const html = render([
      job({ jobId: "cccccccc-3333-4333-8333-333333333333", completedAt: null }),
    ]);
    expect(html).not.toContain("Invalid Date");
    expect(html).toContain("cccccccc");
    expect(html).toContain("No completion time");
    expect(html).toContain("—");
    expect(html).not.toContain("<time");
  });
});

test.describe("LabelsTable action", () => {
  const SESSION = "dddddddd-4444-4444-8444-444444444444";
  test("a complete session is a View link to it, never Continue — which would seed a new session", () => {
    const html = render([
      job({
        session: { id: SESSION, status: "complete", checked: 56, total: 56 },
      }),
    ]);
    expect(html).toContain("data-view-session");
    expect(html).toContain(`href="/admin/labels/${SESSION}"`);
    expect(html).toContain(">View<");
    expect(html).not.toContain("data-start-labelling");
  });

  test("an open session continues; no session starts", () => {
    const open = render([
      job({
        session: { id: SESSION, status: "labelling", checked: 3, total: 56 },
      }),
    ]);
    expect(open).toContain(">Continue<");
    expect(open).not.toContain("data-view-session");
    expect(render([job({})])).toContain(">Start labelling<");
  });
});
