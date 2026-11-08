import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { AdminClient } from "@/lib/supabase/admin";
import {
  requireLabelViewerOrNotFound,
  type LabelViewerDependencies,
} from "@/lib/services/programs/admin-guard";
import {
  listAssignedLabelSessions,
  type AssignedLabelSession,
} from "@/lib/data/label-assignments-server";
import { createLoader, marker } from "./fixtures/vm-modules";

/**
 * The `/label` area (T5): its gate over fake clients, the assigned-sessions
 * loader over a fake service-role client, and the list rendered offline. No
 * database, no server.
 */

const VIEWER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SESSION_A = "11111111-1111-4111-8111-111111111111";
const SESSION_B = "22222222-2222-4222-8222-222222222222";

class NotFound extends Error {}
class Redirect extends Error {
  constructor(readonly path: string) {
    super(path);
  }
}

type Flags = { is_admin: boolean; is_labeller: boolean } | null;

function viewerDeps(
  user: { id: string } | null,
  flags: Flags,
): LabelViewerDependencies & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user } }) },
    }),
    createAdminClient: () =>
      ({
        from: (table: string) => {
          calls.push(`from:${table}`);
          return {
            select: () => ({
              eq: (column: string, value: unknown) => ({
                maybeSingle: async () => ({
                  data: column === "id" && value === user?.id ? flags : null,
                  error: null,
                }),
              }),
            }),
          };
        },
      }) as unknown as AdminClient,
    loginRedirectPath: async (fallback) =>
      `/login?next=${encodeURIComponent(fallback)}`,
    redirect: (path) => {
      calls.push(`redirect:${path}`);
      throw new Redirect(path);
    },
    notFound: () => {
      calls.push("notFound");
      throw new NotFound();
    },
  };
}

test.describe("requireLabelViewerOrNotFound", () => {
  test("calls notFound for a signed-in user with neither flag", async () => {
    const deps = viewerDeps(
      { id: VIEWER },
      { is_admin: false, is_labeller: false },
    );
    await expect(requireLabelViewerOrNotFound(deps)).rejects.toBeInstanceOf(
      NotFound,
    );
    expect(deps.calls).toContain("notFound");
  });

  test("calls notFound when the user row is missing", async () => {
    const deps = viewerDeps({ id: VIEWER }, null);
    await expect(requireLabelViewerOrNotFound(deps)).rejects.toBeInstanceOf(
      NotFound,
    );
  });

  test("returns { id, kind: 'admin' } for an admin", async () => {
    const deps = viewerDeps(
      { id: VIEWER },
      { is_admin: true, is_labeller: false },
    );
    expect(await requireLabelViewerOrNotFound(deps)).toEqual({
      id: VIEWER,
      kind: "admin",
    });
    expect(deps.calls).not.toContain("notFound");
  });

  test("returns { id, kind: 'labeller' } for a labeller", async () => {
    const deps = viewerDeps(
      { id: VIEWER },
      { is_admin: false, is_labeller: true },
    );
    expect(await requireLabelViewerOrNotFound(deps)).toEqual({
      id: VIEWER,
      kind: "labeller",
    });
  });

  test("redirects a visitor with no session to login for /label", async () => {
    const deps = viewerDeps(null, null);
    await expect(requireLabelViewerOrNotFound(deps)).rejects.toBeInstanceOf(
      Redirect,
    );
    expect(deps.calls).toEqual([
      `redirect:/login?next=${encodeURIComponent("/label")}`,
    ]);
  });
});

test.describe("listAssignedLabelSessions", () => {
  test("filters by the gate's viewer and live statuses, and returns no match fields", async () => {
    const filters: Array<[string, string, unknown]> = [];
    let selected = "";
    const query = {
      select(columns: string) {
        selected = columns;
        return query;
      },
      eq(column: string, value: unknown) {
        filters.push(["eq", column, value]);
        return query;
      },
      in(column: string, values: unknown) {
        filters.push(["in", column, values]);
        return query;
      },
      order() {
        return query;
      },
      returns: async () => ({
        data: [
          {
            id: SESSION_A,
            status: "labelling",
            assigned_at: "2026-11-02T10:00:00Z",
            submitted_at: null,
            open_counts: { amber: 2, grey: 1 },
            match_id: "should-not-leak",
          },
          {
            id: SESSION_B,
            status: "submitted",
            assigned_at: "2026-10-30T10:00:00Z",
            submitted_at: "2026-11-01T10:00:00Z",
            open_counts: null,
          },
        ],
        error: null,
      }),
    };
    const rows = await listAssignedLabelSessions({
      requireViewer: async () => ({ id: VIEWER, kind: "labeller" }),
      createAdminClient: () =>
        ({ from: () => query }) as unknown as AdminClient,
      countProgress: async () =>
        new Map([[SESSION_A, { checked: 12, total: 87 }]]),
    });

    expect(filters).toContainEqual(["eq", "assigned_to", VIEWER]);
    expect(filters).toContainEqual([
      "in",
      "status",
      ["labelling", "submitted"],
    ]);
    expect(selected).not.toMatch(/match_id|job_id|player|program/);
    expect(rows).toEqual([
      {
        id: SESSION_A,
        status: "labelling",
        assignedAt: "2026-11-02T10:00:00Z",
        submittedAt: null,
        checked: 12,
        total: 87,
        openCounts: { amber: 2, grey: 1 },
        practice: false,
      },
      {
        id: SESSION_B,
        status: "submitted",
        assignedAt: "2026-10-30T10:00:00Z",
        submittedAt: "2026-11-01T10:00:00Z",
        checked: 0,
        total: 0,
        openCounts: null,
        practice: false,
      },
    ]);
  });
});

test.describe("AssignedSessionsList", () => {
  function render(sessions: AssignedLabelSession[]): string {
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
        "lucide-react": { ChevronRight: marker("ChevronRight") },
      },
    });
    const { AssignedSessionsList } = loader.load(
      "src/components/label/assigned-sessions-list.tsx",
    ) as {
      AssignedSessionsList: React.ComponentType<{
        sessions: AssignedLabelSession[];
      }>;
    };
    return renderToStaticMarkup(
      React.createElement(AssignedSessionsList, { sessions }),
    );
  }

  const SESSIONS: AssignedLabelSession[] = [
    {
      id: SESSION_A,
      status: "labelling",
      assignedAt: "2026-11-02T10:00:00Z",
      submittedAt: null,
      checked: 12,
      total: 87,
      openCounts: { amber: 2, grey: 1 },
    },
    {
      id: SESSION_B,
      status: "submitted",
      assignedAt: "2026-10-30T10:00:00Z",
      submittedAt: "2026-11-01T10:00:00Z",
      checked: 87,
      total: 87,
      openCounts: null,
    },
  ];

  test("draws an In progress row and a Submitted row linking to /label/[id]", () => {
    const html = render(SESSIONS);
    expect(html).toContain(`href="/label/${SESSION_A}"`);
    expect(html).toContain(`href="/label/${SESSION_B}"`);
    expect(html).toContain("In progress");
    expect(html).toContain("Submitted");
    expect(html).toContain("Assigned Nov 2");
    expect(html).toContain("Assigned Oct 30");
    expect(html).toContain("12 of 87");
    expect(html).not.toContain("No matches are assigned to you yet.");
    expect(html).not.toContain("/admin");
  });

  test("a practice copy reads 'Practice set' and nothing about the match", () => {
    const html = render([{ ...SESSIONS[0], practice: true }]);
    expect(html).toContain("Practice set · Assigned Nov 2");
    expect(html).not.toMatch(/Set \d/);
  });

  test("shows the empty state with no sessions", () => {
    const html = render([]);
    expect(html).toContain("No matches are assigned to you yet.");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("/admin");
  });
});
