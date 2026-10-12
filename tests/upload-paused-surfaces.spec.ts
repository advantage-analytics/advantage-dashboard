import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  STEPPER_COPY,
  analysisStepsView,
  drawerAnalysisStepsView,
} from "@/components/dashboard/matches/match-detail/analysis-steps";
import type { MatchLineProps } from "@/components/dashboard/matches/match-line";
import type { ActivityItem } from "@/lib/data/activity-server";
import type { MatchAnalysis } from "@/lib/data/match-analysis";
import { createLoader, marker } from "./fixtures/vm-modules";

/**
 * "Upload paused" — what an upload that has gone quiet looks like, on the
 * three surfaces that used to keep saying "Uploading 27%" over a still bar:
 * the match page's analysis column, the activity tray and the Matches row.
 *
 * The job is still `uploading`; nothing has failed. So it is drawn as waiting
 * rather than as a failure, the bar is grey and still, and only the match page
 * — and only for the person who started it — offers to upload again.
 */

const NOW = Date.parse("2026-10-11T14:00:00Z");
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

function uploading(overrides: Partial<MatchAnalysis> = {}): MatchAnalysis {
  return {
    status: "uploading",
    uploadPercent: 27.6,
    progressPercent: 11,
    jobId: "job-1",
    updatedAt: ago(30),
    ...overrides,
  } as MatchAnalysis;
}

// ─── The view ──────────────────────────────────────────────────────────────

test("a quiet upload's view reads paused: waiting mark, floored percent, its own body", () => {
  const view = analysisStepsView(uploading(), NOW);
  expect(view.title).toBe("Upload paused");
  const video = view.steps.find((step) => step.key === "video")!;
  expect(video).toMatchObject({
    label: "Upload paused",
    state: "wait",
    value: "27%",
    body: { kind: "paused", percent: 27.6, since: ago(30) },
  });
  // Not a failure: nothing here carries a recovery class.
  expect(view.failure).toBeUndefined();
  expect(view.steps.map((step) => step.key)).toEqual([
    "saved",
    "video",
    "analysis",
    "stats",
  ]);
});

test("a moving upload, and any upload before the clock ticks, still reads uploading", () => {
  const moving = analysisStepsView(uploading({ updatedAt: ago(1) }), NOW);
  expect(moving.title).toBe("Uploading your video");
  expect(moving.steps[1]).toMatchObject({ state: "now" });
  expect(moving.steps[1].body).toMatchObject({ kind: "upload" });

  // Only a clock can say "quiet"; the first render has none.
  const unclocked = analysisStepsView(uploading(), null);
  expect(unclocked.title).toBe("Uploading your video");
});

test("the drawer says paused on the step and carries no body", () => {
  const view = drawerAnalysisStepsView(uploading(), NOW, true)!;
  const video = view.steps.find((step) => step.key === "video")!;
  expect(video).toEqual({
    key: "video",
    label: "Upload paused",
    state: "wait",
    value: "27%",
  });
  expect(view.failure).toBeUndefined();
});

// ─── The match page ────────────────────────────────────────────────────────

const MATCH: MatchLineProps = {
  player: "Maya Chen",
  opponent: "Sofia Alvarez",
  won: true,
  sets: [
    { player1: 6, player2: 4 },
    { player1: 6, player2: 3 },
  ],
};

function renderColumn(canAct: boolean): string {
  const loader = createLoader({
    stubs: {
      "next/link": ({ children }: { children: React.ReactNode }) =>
        React.createElement("a", null, children),
      "@/hooks/use-live-match-analysis": {
        useLiveMatchAnalysis: () => new Map(),
        withLiveAnalysis: (a: MatchAnalysis) => a,
      },
      "./retry-submission": { RetrySubmission: () => null },
      "./retry-analysis": { RetryAnalysis: () => null },
      "./restart-upload": { RestartUpload: marker("RestartUpload") },
    },
  });
  const { AnalysisSteps } = loader.load(
    "src/components/dashboard/matches/match-detail/analysis-steps-column.tsx",
  ) as { AnalysisSteps: React.ComponentType<Record<string, unknown>> };
  return renderToStaticMarkup(
    React.createElement(AnalysisSteps, {
      analysis: uploading(),
      matchId: "m1",
      match: MATCH,
      snapshotAt: NOW,
      canAct,
    }),
  );
}

test("the uploader sees the frozen bar, what to try first, and the way to start again", () => {
  const html = renderColumn(true);
  expect(html).toContain("Upload paused");
  expect(html).toContain(STEPPER_COPY.paused.note);
  // The tab first, a new upload second.
  const tab = STEPPER_COPY.paused.note.indexOf("go back to it");
  const again = STEPPER_COPY.paused.note.indexOf("upload the video again");
  expect(tab).toBeGreaterThan(-1);
  expect(again).toBeGreaterThan(tab);
  expect(html).toContain('data-component="RestartUpload"');

  // Grey, and not moving: no blue, no sheen.
  expect(html).toContain('aria-label="Upload paused"');
  expect(html).toContain("background-color:var(--ink-300)");
  expect(html).not.toContain("progress-fill-live");
  // The running upload's instruction would be wrong here: nothing is running.
  expect(html).not.toContain("Keep this tab open");
});

test("anyone else sees it is paused, and no way to restart someone else's upload", () => {
  const html = renderColumn(false);
  expect(html).toContain(STEPPER_COPY.paused.noteViewer);
  expect(html).not.toContain(STEPPER_COPY.paused.note);
  expect(html).not.toContain('data-component="RestartUpload"');
});

test("starting again ends the paused job first, keyed on the job and on its being live", () => {
  const src = readFileSync(
    resolve(
      process.cwd(),
      "src/components/dashboard/matches/match-detail/restart-upload.tsx",
    ),
    "utf8",
  );
  const write = src.slice(src.indexOf('.from("processing_jobs")'));
  expect(write.slice(0, 400)).toContain('status: "failed"');
  expect(write.slice(0, 400)).toContain('.eq("id", jobId)');
  expect(write.slice(0, 400)).toContain(
    '.in("status", ["pending", "uploading"])',
  );
  // And only while the row still says what the page read: a stale page must
  // not end an upload that has started moving again.
  expect(write.slice(0, 400)).toContain('.eq("updated_at", pausedSince)');
  const column = readFileSync(
    resolve(
      process.cwd(),
      "src/components/dashboard/matches/match-detail/analysis-steps-column.tsx",
    ),
    "utf8",
  );
  expect(column).toContain("pausedSince={body.since}");
  // Then the wizard for this match, by a full load.
  expect(src.indexOf("window.location.assign(href)")).toBeGreaterThan(
    src.indexOf('.eq("updated_at", pausedSince)'),
  );
  expect(src).toContain("const href = addVideoHref(matchId);");
});

// ─── The Matches row ───────────────────────────────────────────────────────

test("the Matches row says paused with a still grey bar, and uploading while it moves", () => {
  const loader = createLoader();
  const { RowLifecycle } = loader.load(
    "src/components/dashboard/matches/row-state.tsx",
  ) as { RowLifecycle: React.ComponentType<Record<string, unknown>> };
  const render = (updatedAt: string) =>
    renderToStaticMarkup(
      React.createElement(RowLifecycle, {
        analysis: uploading({ updatedAt }),
        label: "Maya Chen vs Sofia Alvarez",
      }),
    );

  // The row reads the real clock, so "quiet" is a date long past.
  const paused = render("2020-01-01T00:00:00Z");
  expect(paused).toContain("Upload paused");
  expect(paused).toContain("Waiting:");
  expect(paused).toContain("27%");
  expect(paused).toContain("background-color:var(--ink-300)");
  expect(paused).not.toContain("progress-fill-live");
  expect(paused).not.toContain("In progress:");

  const moving = render(new Date().toISOString());
  expect(moving).toContain("Uploading");
  expect(moving).not.toContain("Upload paused");
  expect(moving).toContain("In progress:");
  expect(moving).toContain("progress-fill-live");
});

// ─── The activity tray ─────────────────────────────────────────────────────

const passThrough = ({ children }: { children?: React.ReactNode }) =>
  React.createElement(React.Fragment, null, children);

function renderTray(updatedAt: string): string {
  const loader = createLoader({
    stubs: {
      "next/link": {
        __esModule: true,
        default: ({
          href,
          children,
        }: {
          href: string;
          children?: React.ReactNode;
        }) => React.createElement("a", { href }, children),
      },
      "next/navigation": { unstable_rethrow: () => {} },
      "@/components/ui/popover": {
        Popover: passThrough,
        PopoverTrigger: passThrough,
        PopoverContent: passThrough,
      },
      "@/components/dashboard/shared/chrome-tooltip": {
        ChromeTooltip: passThrough,
      },
      "@/components/dashboard/shared/workspace-scope-chip": {
        WorkspaceScopeChip: marker("WorkspaceScopeChip"),
      },
      "@/components/dashboard/workspace-provider": {
        useWorkspace: () => ({ viewer: { id: "viewer-1" } }),
      },
      "@/hooks/use-live-match-analysis": {
        useLiveMatchAnalysis: () => new Map(),
        withLiveAnalysis: (analysis: unknown) => analysis,
      },
      "@/lib/services/programs/join-links": { invitationHref: () => "/" },
      "@/lib/services/programs/join-actions": {
        acceptPendingInvite: async () => ({ ok: true }),
      },
      "@/lib/services/programs/join-role": { inviteSubtitle: () => "" },
      "@/lib/workspace/actions": { setActiveWorkspace: async () => {} },
    },
  });
  const { ActivityTray } = loader.load(
    "src/components/dashboard/activity/activity-tray.tsx",
  ) as { ActivityTray: React.ComponentType<Record<string, unknown>> };
  const item: ActivityItem = {
    matchId: "m1",
    title: "M. Reid vs J. Park",
    at: "2026-10-11T09:58:00Z",
    analysis: { status: "uploading", progressPercent: 11, updatedAt },
  };
  return renderToStaticMarkup(
    React.createElement(ActivityTray, {
      feed: { items: [item] },
      invites: [],
      approvedInviteIds: [],
      elsewhere: [],
      joins: [],
    }),
  );
}

test("the tray keeps a paused upload among the running rows, but not looking like progress", () => {
  const paused = renderTray("2020-01-01T00:00:00Z");
  expect(paused).toContain("Upload paused <b");
  expect(paused).toContain("Waiting:");
  expect(paused).toContain("background-color:var(--ink-300)");
  expect(paused).not.toContain("progress-fill-live");
  // Still one link, to the match page — where it can be started again.
  expect(paused).toContain('href="/dashboard/matches/m1"');
  expect(paused).not.toContain("Failed:");

  const moving = renderTray(new Date().toISOString());
  expect(moving).toContain("Uploading <b");
  expect(moving).toContain("In progress:");
  expect(moving).toContain("progress-fill-live");
});
