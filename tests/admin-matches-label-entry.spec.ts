import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  labelJobIdFor,
  type LabelJobCandidate,
} from "@/lib/data/admin-match-progress";
import type { AdminMatchRow } from "@/lib/data/admin-matches-server";
import { createLoader, marker } from "./fixtures/vm-modules";

/**
 * Admin › Matches side panel — "Label this match" (T29), the way into
 * labelling for any analysed match, including the ones the label queue's
 * To do (`label_todo`) does not hold.
 *
 * The panel is rendered offline through `fixtures/vm-modules`: the drawer
 * frame, links and the Resubmit / Copy buttons are stubbed, and
 * `useStartLabelling` is a stub that records the job it was handed and never
 * seeds anything. No click is made and nothing reaches a database.
 */

const MATCH = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const JOB = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const OLDER_JOB = "ffffffff-ffff-4fff-8fff-ffffffffffff";

type DrawerProps = {
  row: AdminMatchRow;
  index: number;
  total: number;
  canPrev: boolean;
  canNext: boolean;
  closing: boolean;
  autoFocus: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onClosed: () => void;
};

function row(overrides: Partial<AdminMatchRow> = {}): AdminMatchRow {
  return {
    id: MATCH,
    player: "Ava Adams",
    opponent: "Riley Rival",
    won: true,
    sets: [],
    workspace: { kind: "personal" },
    event: null,
    uploadedAt: "2026-09-01T12:00:00Z",
    views: null,
    analysis: { status: "completed", jobId: JOB } as AdminMatchRow["analysis"],
    verification: null,
    bucket: "settled",
    fresh: false,
    labelHref: null,
    videoSeconds: 3600,
    failedJobId: null,
    labelJobId: null,
    sentForAnalysisAt: "2026-09-01T12:05:00Z",
    resultsLandedAt: "2026-09-01T13:00:00Z",
    labelState: null,
    labelPublishedAt: null,
    labelCheckedAt: null,
    verifiedAt: null,
    ...overrides,
  };
}

function render(
  props: Partial<AdminMatchRow>,
  labelling: { error: string | null } = { error: null },
) {
  const started: string[] = [];
  const loader = createLoader({
    stubs: {
      "next/link": {
        __esModule: true,
        default: ({
          href,
          children,
        }: {
          href: string;
          children: React.ReactNode;
        }) => React.createElement("a", { href }, children),
      },
      "@/components/dashboard/matches/match-drawer": {
        PeekDrawerFrame: ({
          children,
          footer,
        }: {
          children: React.ReactNode;
          footer: React.ReactNode;
        }) => React.createElement("div", null, children, footer),
      },
      "@/components/admin/matches/copy-button": {
        CopyButton: marker("CopyButton"),
      },
      "@/components/admin/matches/resubmit-button": {
        ResubmitButton: marker("ResubmitButton"),
      },
      "@/components/admin/admin-cells": {
        dayLabel: () => "Tue",
        timeLabel: () => "9:10 am",
        useIsClient: () => false,
      },
      "@/components/admin/labels/start-labelling-button": {
        useStartLabelling: (jobId: string) => {
          started.push(jobId);
          return {
            start: () => {
              throw new Error("Nothing is started while rendering");
            },
            isPending: false,
            error: labelling.error,
          };
        },
      },
    },
  });
  const { MatchPeekDrawer } = loader.load(
    "src/components/admin/matches/match-peek-drawer.tsx",
  ) as { MatchPeekDrawer: React.ComponentType<DrawerProps> };
  const noop = () => {};
  const html = renderToStaticMarkup(
    React.createElement(MatchPeekDrawer, {
      row: row(props),
      index: 0,
      total: 1,
      canPrev: false,
      canNext: false,
      closing: false,
      autoFocus: false,
      onPrev: noop,
      onNext: noop,
      onClose: noop,
      onClosed: noop,
    }),
  );
  return { html, started };
}

test("the panel offers Label this match when the row has a labelJobId", () => {
  const { html, started } = render({ labelJobId: JOB });
  expect(html).toContain("Label this match");
  expect(html).toContain(`data-label-match="${JOB}"`);
  expect(started).toEqual([JOB]);
});

test("the panel draws no Label this match without a labelJobId", () => {
  const { html, started } = render({ labelJobId: null });
  expect(html).not.toContain("Label this match");
  expect(html).not.toContain("data-label-match");
  expect(started).toEqual([]);
});

test("an old match, never added to To do, still gets the control", () => {
  const { html, started } = render({
    labelJobId: OLDER_JOB,
    resultsLandedAt: "2026-09-01T13:00:00Z",
  });
  expect(html).toContain("Label this match");
  expect(started).toEqual([OLDER_JOB]);
});

test("a refusal's sentence shows under the control", () => {
  const { html } = render(
    { labelJobId: JOB },
    { error: "Only an admin can start labeling." },
  );
  expect(html).toContain('role="alert"');
  expect(html).toContain("Only an admin can start labeling.");
});

// ── labelJobIdFor: which job the row carries ─────────────────────────────────

function job(overrides: Partial<LabelJobCandidate> = {}): LabelJobCandidate {
  return {
    id: JOB,
    provider: "splitstep",
    status: "completed",
    results_object_key: "results/job.json",
    completed_at: "2026-11-01T12:00:00Z",
    ...overrides,
  };
}

test("labelJobIdFor picks the newest completed job with a results file", () => {
  expect(
    labelJobIdFor([
      job({ id: OLDER_JOB, completed_at: "2026-10-01T12:00:00Z" }),
      job({ id: JOB, completed_at: "2026-11-01T12:00:00Z" }),
    ]),
  ).toBe(JOB);
  // A newer job that failed, has no results file or is another provider's
  // does not displace the older one that can be labelled.
  expect(
    labelJobIdFor([
      job({ id: OLDER_JOB, completed_at: "2026-10-01T12:00:00Z" }),
      job({ id: "a1", status: "failed", completed_at: "2026-11-02T00:00:00Z" }),
      job({ id: "a2", results_object_key: null }),
      job({ id: "a3", provider: "swingvision" }),
    ]),
  ).toBe(OLDER_JOB);
});

test("labelJobIdFor is null when no job can be labeled", () => {
  expect(labelJobIdFor([])).toBeNull();
  expect(
    labelJobIdFor([
      job({ status: "processing", results_object_key: null }),
      job({ id: OLDER_JOB, status: "failed" }),
    ]),
  ).toBeNull();
});

test("labelJobIdFor keeps a job completed before the queue's cut-off", () => {
  expect(
    labelJobIdFor([
      job({ id: OLDER_JOB, completed_at: "2026-09-01T13:00:00Z" }),
    ]),
  ).toBe(OLDER_JOB);
});

test("neither the control nor the loader reads the queue's cut-off", () => {
  for (const file of [
    "src/components/admin/matches/match-peek-drawer.tsx",
    "src/lib/data/admin-matches-server.ts",
  ]) {
    const source = readFileSync(resolve(process.cwd(), file), "utf8");
    expect(source, file).not.toContain("LABEL_QUEUE_FROM");
    expect(source, file).not.toContain("labels/queue");
    expect(source, file).not.toContain("2026-10-29");
  }
  const helper = readFileSync(
    resolve(process.cwd(), "src/lib/data/admin-match-progress.ts"),
    "utf8",
  );
  expect(helper).not.toContain('from "@/lib/services/labels/queue"');
  expect(helper).not.toContain("2026-10-29");
});
