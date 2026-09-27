import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type {
  AdminUploadHistoryItem,
  AdminUploadHistoryResult,
  AdminUploadHistoryRow,
} from "@/lib/admin/uploads/history";
import { createLoader } from "./fixtures/vm-modules";

/**
 * Admin › Uploads — the history controls (T28).
 *
 * `AdminUploadHistory` rendered offline through `fixtures/vm-modules`, with
 * `next/link`, `next/navigation` and the server actions stubbed by recording
 * fakes. Radix's portal renders nothing server-side, so the one confirm's
 * copy is asserted through the constant the island exports.
 */

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

type Call = { action: string; fields: Record<string, string> };

function load() {
  const calls: Call[] = [];
  const record =
    (action: string) =>
    async (formData: FormData): Promise<{ ok: true }> => {
      calls.push({
        action,
        fields: Object.fromEntries(
          [...formData.entries()].map(([k, v]) => [k, String(v)]),
        ),
      });
      return { ok: true };
    };
  const loader = createLoader({
    stubs: {
      "next/link": {
        __esModule: true,
        default: ({
          href,
          children,
          ...rest
        }: {
          href: string;
          children?: React.ReactNode;
        }) => React.createElement("a", { href, ...rest }, children),
      },
      "next/navigation": {
        useRouter: () => ({ push() {}, replace() {}, refresh() {} }),
        usePathname: () => "/admin/uploads",
      },
      "@/app/admin/uploads/history-actions": {
        reconcileAdminSubmissionAction: record("reconcile"),
        resumeAdminResultsAction: record("resume"),
        abandonAdminResultsAction: record("abandonResults"),
      },
    },
  });
  const history = loader.load(
    "src/components/admin/admin-upload-history.tsx",
  ) as {
    AdminUploadHistory: React.ComponentType<{
      result?: AdminUploadHistoryResult;
    }>;
  };
  const island = loader.load(
    "src/components/admin/history-action-button.tsx",
  ) as {
    ABANDON_MATCH_CONFIRM: {
      title: string;
      description: { before: string; after: string };
      confirmLabel: string;
      pendingLabel: string;
      tone: string;
    };
  };
  return { ...history, ...island, calls };
}

function item(
  n: number,
  overrides: Partial<AdminUploadHistoryItem> = {},
): AdminUploadHistoryItem {
  return {
    itemId: id(n),
    kind: "match",
    saveStatus: "succeeded",
    state: "pending",
    error: null,
    what: `Item ${n}`,
    matchId: null,
    outcomeId: null,
    outcome: null,
    matchHref: null,
    reconcile: { abandon: false, complete: false },
    ...overrides,
  };
}

function row(
  n: number,
  overrides: Partial<AdminUploadHistoryRow> = {},
): AdminUploadHistoryRow {
  return {
    operationId: id(n),
    date: "2026-09-20T12:00:00Z",
    team: { id: id(900), name: "Test University", side: "mens" },
    kind: "video",
    what: `Row ${n}`,
    addedBy: { id: id(901), name: "Admin Member" },
    eventId: null,
    state: "pending",
    counts: { saved: 0, failed: 0, pending: 1, unknown: 0 },
    pendingActions: { resume: false, abandon: false },
    items: [],
    ...overrides,
  };
}

const RESULT: AdminUploadHistoryResult = {
  ok: true,
  nextCursor: null,
  rows: [
    row(1, {
      kind: "video",
      items: [
        item(11, {
          kind: "match",
          what: "Lin vs. Park",
          reconcile: { abandon: true, complete: false },
        }),
      ],
    }),
    row(2, {
      kind: "analysis_attachment",
      items: [
        item(21, {
          kind: "analysis_attachment",
          reconcile: { abandon: true, complete: false },
        }),
      ],
    }),
    row(3, {
      kind: "file",
      items: [item(31, { reconcile: { abandon: false, complete: true } })],
    }),
    row(4, {
      kind: "dual",
      pendingActions: { resume: true, abandon: true },
      items: [item(41, { kind: "outcome", error: "abandoned" })],
    }),
  ],
};

function render() {
  const loaded = load();
  const html = renderToStaticMarkup(
    React.createElement(loaded.AdminUploadHistory, { result: RESULT }),
  );
  return { html, ...loaded };
}

function buttonLabels(html: string): string[] {
  return [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) =>
    m[1].replace(/<[^>]+>/g, "").trim(),
  );
}

test("renders each of the five history controls as a button", () => {
  const { html } = render();
  const labels = buttonLabels(html);
  for (const label of [
    "Abandon and delete match",
    "Abandon",
    "Mark complete",
    "Resume",
    "Abandon pending",
  ])
    expect(labels).toContain(label);
  expect(html).toContain("Abandoned by an administrator");
});

test("the controls are buttons, not forms, and nothing is refused at rest", () => {
  const { html, calls } = render();
  expect(html).not.toContain("<form");
  expect(html).not.toContain('role="alert"');
  expect(calls).toHaveLength(0);
});

test("the delete confirm is a danger question naming its action", () => {
  const { ABANDON_MATCH_CONFIRM } = load();
  expect(ABANDON_MATCH_CONFIRM.tone).toBe("danger");
  expect(ABANDON_MATCH_CONFIRM.title.endsWith("?")).toBe(true);
  expect(ABANDON_MATCH_CONFIRM.confirmLabel).toBe("Abandon and delete match");
  expect(ABANDON_MATCH_CONFIRM.pendingLabel).toBe("Deleting…");
  expect(
    ABANDON_MATCH_CONFIRM.description.before +
      ABANDON_MATCH_CONFIRM.description.after,
  ).toContain("no undo");
});
