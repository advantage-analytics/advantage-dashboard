import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createLoader, marker } from "./fixtures/vm-modules";
import type { ActivityItem } from "@/lib/data/activity-server";

/**
 * T33: the activity tray's rows, rendered offline from the real
 * `activity-tray.tsx` through `createLoader()` — the whole `ActivityTray`,
 * not an exported row, so the `isTrayFailure` partition, the trigger's dot
 * and `trayDetail`'s count are all exercised on the same render.
 *
 * Everything with a runtime the vm cannot host is stubbed: `next/link` (a
 * plain `<a>`), `next/navigation`, the Radix popover (pass-through, so the
 * closed panel's rows still render), the workspace and live-analysis hooks,
 * and the server actions. Row markup, `StepMark`, `tray-failure.ts` and
 * `match-analysis.ts` are the real files.
 */

const passThrough = ({ children }: { children?: React.ReactNode }) =>
  React.createElement(React.Fragment, null, children);

function LinkStub({
  href,
  children,
  ...rest
}: {
  href: string;
  children?: React.ReactNode;
  onClick?: unknown;
  className?: string;
}) {
  delete (rest as { onClick?: unknown }).onClick;
  return React.createElement("a", { href, ...rest }, children);
}

const loader = createLoader({
  stubs: {
    "next/link": { __esModule: true, default: LinkStub },
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
    "@/components/dashboard/matches/analysis-progress-track": {
      AnalysisProgressTrack: marker("AnalysisProgressTrack"),
    },
    "@/components/dashboard/workspace-provider": {
      useWorkspace: () => ({ viewer: { id: "viewer-1" } }),
    },
    "@/hooks/use-live-match-analysis": {
      useLiveMatchAnalysis: () => new Map(),
      withLiveAnalysis: (analysis: unknown) => analysis,
    },
    "@/lib/services/programs/join-links": {
      invitationHref: (id: string) => `/invite/${id}`,
    },
    "@/lib/services/programs/join-actions": {
      acceptPendingInvite: async () => ({ ok: true }),
    },
    "@/lib/services/programs/join-role": {
      inviteSubtitle: () => "as a player",
    },
    "@/lib/workspace/actions": { setActiveWorkspace: async () => {} },
  },
});

const { ActivityTray } = loader.load(
  "src/components/dashboard/activity/activity-tray.tsx",
) as { ActivityTray: React.ComponentType<Record<string, unknown>> };

const UPLOAD_ID = "11111111-1111-4111-8111-111111111111";
const RETRY_ID = "22222222-2222-4222-8222-222222222222";
const STATS_ID = "33333333-3333-4333-8333-333333333333";
const RUNNING_ID = "44444444-4444-4444-8444-444444444444";

function item(
  matchId: string,
  title: string,
  analysis: ActivityItem["analysis"],
): ActivityItem {
  return { matchId, title, analysis, at: "2026-09-28T12:00:00Z" };
}

function render(items: ActivityItem[]) {
  return renderToStaticMarkup(
    React.createElement(ActivityTray, {
      feed: { items },
      invites: [],
      approvedInviteIds: [],
      elsewhere: [],
      joins: [],
    }),
  );
}

/** Every `<a>` in the markup, as its href and its text content. */
function links(html: string) {
  return [...html.matchAll(/<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map(
    ([, href, inner]) => ({
      href: href.replace(/&amp;/g, "&"),
      text: inner
        .replace(/<[^>]+>/g, " ")
        .replace(/&#x27;/g, "'")
        .replace(/\s+/g, " ")
        .trim(),
      inner,
    }),
  );
}

test("an upload_again row links to Add video for this match", () => {
  const html = render([
    item(UPLOAD_ID, "M. Reid vs J. Park", {
      status: "failed",
      recovery: "upload_again",
    }),
  ]);
  const row = links(html).find((l) => l.text.includes("M. Reid vs J. Park"));
  expect(row).toBeDefined();
  expect(row!.href).toBe(`/dashboard/matches/new?match=${UPLOAD_ID}`);
  expect(row!.text).toContain("Add video");
  expect(row!.text).toContain("Upload didn't finish");
  // One link per row: the title, reason and action word are all inside it.
  expect(row!.inner).not.toContain("<a ");
  expect(row!.inner).toContain("Failed:");
  expect(row!.text).not.toContain("Analysis failed —");
});

test("a retry row links to the match page and reads Open", () => {
  const html = render([
    item(RETRY_ID, "A. Lee vs B. Cruz", {
      status: "failed",
      recovery: "retry",
    }),
  ]);
  const row = links(html).find((l) => l.text.includes("A. Lee vs B. Cruz"));
  expect(row).toBeDefined();
  expect(row!.href).toBe(`/dashboard/matches/${RETRY_ID}`);
  expect(row!.text).toMatch(/\bOpen\b/);
});

test("a stats_unavailable item renders no failed row and lights nothing", () => {
  const html = render([
    item(STATS_ID, "C. Diaz vs D. Moss", {
      status: "derivation_failed",
      recovery: "stats_unavailable",
    }),
  ]);
  expect(html).not.toContain("C. Diaz vs D. Moss");
  expect(html).not.toContain("Failed:");
  expect(html).not.toContain(`/dashboard/matches/${STATS_ID}`);
  // Not counted: the trigger reads the empty sentence and carries no dot.
  expect(html).toContain('aria-label="Activity, Nothing in flight"');
  expect(html).toContain("Nothing running here.");
});

test("in-flight rows lead with the compact spinner, not the blue dot", () => {
  const html = render([
    item(RUNNING_ID, "E. Fox vs F. Gray", {
      status: "processing",
      progressPercent: 40,
    }),
  ]);
  const row = links(html).find((l) => l.text.includes("E. Fox vs F. Gray"));
  expect(row).toBeDefined();
  expect(row!.inner).toContain("size-[14px] animate-spin");
  expect(row!.inner).toContain("motion-reduce:animate-none");
  expect(row!.inner).not.toContain("bg-[var(--blue)]");
});

test("failed rows carry no blue and no bordered button", () => {
  const html = render([
    item(UPLOAD_ID, "M. Reid vs J. Park", {
      status: "failed",
      recovery: "upload_again",
    }),
    item(RETRY_ID, "A. Lee vs B. Cruz", {
      status: "failed",
      recovery: "retry",
    }),
  ]);
  for (const row of links(html).filter((l) => l.inner.includes("Failed:"))) {
    expect(row.inner).not.toContain("--blue");
    expect(row.inner).not.toContain("border-[var(--border-medium)]");
  }
  expect(html).toContain('aria-label="Activity, 2 failed"');
});
