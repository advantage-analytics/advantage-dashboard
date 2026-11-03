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
    "next/navigation": {
      unstable_rethrow: () => {},
      usePathname: () => "/dashboard",
      useRouter: () => ({ replace: () => {}, refresh: () => {} }),
    },
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
      // Props out as attributes, so a row's bar can be read back: where it
      // sits, whether it is moving, and what colour it was asked for.
      AnalysisProgressTrack: (props: {
        percent: number;
        live?: boolean;
        tone?: string;
        label?: string;
      }) =>
        React.createElement("span", {
          "data-component": "AnalysisProgressTrack",
          "data-percent": props.percent,
          "data-live": props.live ? "true" : "false",
          "data-tone": props.tone ?? "default",
          "aria-label": props.label,
        }),
    },
    "@/components/dashboard/onboarding/hint-runner": {
      HintRunner: marker("HintRunner"),
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
    // The real `messagesHref` would drag in the dialog and its server actions;
    // the row only calls it on click, which a static render never does.
    "@/components/dashboard/support/support-dialog-mount": {
      messagesHref: () => "/dashboard?messages=open",
    },
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

function render(
  items: ActivityItem[],
  setup: unknown[] = [],
  support?: unknown,
) {
  return renderToStaticMarkup(
    React.createElement(ActivityTray, {
      feed: { items },
      invites: [],
      approvedInviteIds: [],
      elsewhere: [],
      joins: [],
      setup,
      ...(support ? { support } : {}),
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

test("an upload_again row with a stopped percent keeps the upload row's shape", () => {
  const html = render([
    item(UPLOAD_ID, "M. Reid vs J. Park", {
      status: "failed",
      recovery: "upload_again",
      stoppedUploadPercent: 27,
    }),
  ]);
  const row = links(html).find((l) => l.text.includes("M. Reid vs J. Park"));
  expect(row).toBeDefined();
  // Still one link, to the same place the ordinary failed row goes.
  expect(row!.href).toBe(`/dashboard/matches/new?match=${UPLOAD_ID}`);
  expect(row!.inner).not.toContain("<a ");
  expect(row!.inner).toContain("Failed:");

  // Title, then the bar, then where it stopped beside the action.
  const title = row!.text.indexOf("M. Reid vs J. Park");
  const reason = row!.text.indexOf("Upload stopped at 27%");
  const action = row!.text.indexOf("Add video");
  expect(title).toBeGreaterThan(-1);
  expect(reason).toBeGreaterThan(title);
  expect(action).toBeGreaterThan(reason);
  const bar = row!.inner.indexOf('data-component="AnalysisProgressTrack"');
  expect(bar).toBeGreaterThan(row!.inner.indexOf("M. Reid vs J. Park"));
  expect(bar).toBeLessThan(row!.inner.indexOf("Upload stopped at 27%"));
  // The title is the row's medium line, as on every failed row.
  expect(row!.inner).toMatch(
    /<span class="[^"]*font-medium[^"]*">M\. Reid vs J\. Park<\/span>/,
  );

  // Frozen where it stopped: grey, and not moving.
  expect(row!.inner).toContain('data-percent="27"');
  expect(row!.inner).toContain('data-live="false"');
  expect(row!.inner).toContain('data-tone="var(--ink-300)"');

  // The short reason is replaced, not repeated.
  expect(row!.text).not.toContain("Upload didn't finish");
});

test("an upload_again row with no stopped percent keeps the ordinary failed row", () => {
  const html = render([
    item(UPLOAD_ID, "M. Reid vs J. Park", {
      status: "failed",
      recovery: "upload_again",
    }),
  ]);
  const row = links(html).find((l) => l.text.includes("M. Reid vs J. Park"));
  expect(row!.text).toContain("Upload didn't finish");
  expect(row!.text).not.toContain("Upload stopped at");
  expect(row!.inner).not.toContain("AnalysisProgressTrack");
});

test("any other failure ignores a stopped percent and keeps the ordinary failed row", () => {
  // The server never sets a reading on such a row; the tray ignores one anyway.
  const html = render([
    item(RETRY_ID, "A. Lee vs B. Cruz", {
      status: "failed",
      recovery: "retry",
      stoppedUploadPercent: 100,
    }),
  ]);
  const row = links(html).find((l) => l.text.includes("A. Lee vs B. Cruz"));
  expect(row!.href).toBe(`/dashboard/matches/${RETRY_ID}`);
  expect(row!.text).toContain("Open");
  expect(row!.text).not.toContain("Upload stopped at");
  expect(row!.inner).not.toContain("AnalysisProgressTrack");
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

const ROSTER_DONE = {
  key: "roster",
  label: "Add players to the roster",
  done: true,
  href: "/dashboard/team/roster",
  action: "Roster",
};
const MATCH_OPEN = {
  key: "match",
  label: "Send a first match",
  done: false,
  href: "/dashboard/matches/new",
  action: "New match",
};

test("an open setup step is a link; a done one is a ticked line", () => {
  const html = render([], [ROSTER_DONE, MATCH_OPEN]);
  expect(html).toContain("Getting set up");
  expect(html).toContain("1 of 2");

  const open = links(html).find((l) => l.text.includes("Send a first match"));
  expect(open).toBeDefined();
  expect(open!.href).toBe("/dashboard/matches/new");
  expect(open!.text).toContain("New match");

  expect(html).toContain("Add players to the roster");
  expect(
    links(html).some((l) => l.text.includes("Add players to the roster")),
  ).toBe(false);
});

test("setup never lights the dot or enters the tooltip's count", () => {
  const html = render([], [ROSTER_DONE, MATCH_OPEN]);
  expect(html).toContain('aria-label="Activity, Nothing in flight"');
  expect(html).not.toContain("top-[3px] right-[3px]");
  // The feed's own empty state still prints under the section.
  expect(html).toContain("Nothing running here.");
});

test("a finished setup renders no section at all", () => {
  const html = render([], [ROSTER_DONE, { ...MATCH_OPEN, done: true }]);
  expect(html).not.toContain("Getting set up");
});

const MATCH_NOTE_ID = "55555555-5555-4555-8555-555555555555";

function note(
  unreadStaff: boolean,
  latest: {
    authorName?: string;
    preview?: string;
    matchId?: string | null;
  } = {},
) {
  return {
    hasThread: true,
    unreadStaff,
    latestStaff: {
      authorName: latest.authorName ?? "Cj",
      preview: latest.preview ?? "Your serve numbers look off — checking now.",
      createdAt: "2026-11-03T12:00:00Z",
      matchId: latest.matchId === undefined ? MATCH_NOTE_ID : latest.matchId,
    },
  };
}

/** The note row's markup, from its opening div through its Read and reply. */
function noteRow(html: string) {
  const start = html.indexOf('data-row="support-note"');
  expect(start).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf("</button>", start));
}

test("an unread staff note is a washed row with the blue dot, Read and reply and Open match", () => {
  const html = render([], [], note(true));
  const row = noteRow(html);
  expect(row).toContain("bg-[var(--surface-subtle)]");
  expect(row).toContain('Note from <b class="font-medium">Cj at Advantage</b>');
  expect(row).toContain("Your serve numbers look off");
  expect(row).toContain("mt-[5px] size-1.5 rounded-full bg-[var(--blue)]");
  expect(html).toMatch(/<button[^>]*>Read and reply<\/button>/);
  const open = links(html).find((l) => l.text === "Open match");
  expect(open?.href).toBe(`/dashboard/matches/${MATCH_NOTE_ID}`);

  // Counted: the trigger's solid dot and the tooltip's sentence.
  expect(html).toContain('aria-label="Activity, 1 new message"');
  expect(html).toContain("top-[3px] right-[3px]");
  // The feed's empty line is about the feed, not this row: nothing to say
  // "nothing" over while something here is waiting on the reader.
  expect(html).toContain("Nothing running here.");
});

test("a read staff note keeps its row but loses both dots and the count", () => {
  const html = render([], [], note(false));
  const row = noteRow(html);
  expect(row).toContain("Read and reply");
  expect(row).not.toContain("bg-[var(--blue)]");
  expect(html).toContain('aria-label="Activity, Nothing in flight"');
  expect(html).not.toContain("top-[3px] right-[3px]");
});

test("a note with no match carries no Open match link", () => {
  const html = render([], [], note(true, { matchId: null }));
  expect(links(html).some((l) => l.text === "Open match")).toBe(false);
  expect(html).toContain("Read and reply");
});

test("a note sent under the fallback name reads from Advantage, once", () => {
  const html = render([], [], note(true, { authorName: "Advantage" }));
  expect(html).toContain('Note from <b class="font-medium">Advantage</b>');
  expect(html).not.toContain("Advantage at Advantage");
});

test("the note sits above invitations and leads the tooltip", () => {
  const html = renderToStaticMarkup(
    React.createElement(ActivityTray, {
      feed: { items: [] },
      invites: [
        {
          id: "invite-1",
          programName: "UCSD Tennis",
          role: "player",
        },
      ],
      approvedInviteIds: [],
      elsewhere: [],
      joins: [],
      support: note(true),
    }),
  );
  expect(html.indexOf("Note from")).toBeGreaterThan(-1);
  expect(html.indexOf("Note from")).toBeLessThan(html.indexOf("Invitation to"));
  expect(html).toContain('aria-label="Activity, 1 new message · 1 invitation"');
});

test("no thread renders no note row", () => {
  const html = render([]);
  expect(html).not.toContain('data-row="support-note"');
  expect(html).not.toContain("Read and reply");
});
