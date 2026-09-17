import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import {
  adminUploadHref,
  adminUploadSelection,
} from "@/components/admin/admin-upload-selection";

const nodeRequire = createRequire(`${process.cwd()}/package.json`);
const TEAM = "11111111-1111-4111-8111-111111111111";
const context = {
  workspace: {
    id: TEAM,
    name: "Westfield",
    mark: "W",
    team: "mens",
    programStatus: "active",
  },
  videoAllowance: { remainingSeconds: 3600 },
};
type Element = { type: unknown; props: Record<string, unknown> };
function load(path: string, mocks: Record<string, unknown>) {
  const code = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const compiled = { exports: {} as Record<string, (...args: any[]) => any> };
  new Function("require", "module", "exports", code)(
    (id: string) => {
      if (id in mocks) return mocks[id];
      return nodeRequire(id);
    },
    compiled,
    compiled.exports,
  );
  return compiled.exports;
}
function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const e = value as Element;
  return [e, ...elements(e.props.children)];
}
function routeHarness({
  allowed = true,
  refusal = false,
  searchFails = false,
  dualEventsFail = false,
} = {}) {
  const reads: string[] = [];
  const mocks = {
    "@/components/admin/admin-upload-entry": { AdminUploadEntry: "entry" },
    "@/components/admin/admin-dual-result-form": {
      AdminDualResultForm: "dual-form",
    },
    "./dual-actions": {
      loadAdminDualAction: async () => {},
      submitAdminDualAction: async () => {},
    },
    "@/lib/supabase/admin": {
      createAdminClient: () => {
        reads.push("admin-client");
        const query = {
          select: () => query,
          eq: (column: string, value: string) => {
            reads.push(`events:${column}:${value}`);
            return query;
          },
          order: () => query,
          limit: async () => ({
            data: [{ id: TEAM, name: "Stanford", starts_on: "2026-09-16" }],
            error: dualEventsFail ? new Error("read failure") : null,
          }),
        };
        return {
          from: (table: string) => {
            reads.push(`table:${table}`);
            return query;
          },
        };
      },
    },
    "@/components/admin/admin-upload-selection": {
      adminUploadHref,
      adminUploadSelection,
    },
    "@/lib/services/programs/admin-guard": {
      requireAdminOrNotFound: async () => {
        reads.push("guard");
        if (!allowed) throw new Error("not found");
      },
    },
    "@/lib/data/admin-upload-server": {
      getAdminUploadContext: async (id: string) => {
        reads.push(`context:${id}`);
        return refusal
          ? { ok: false, message: "Program unavailable" }
          : { ok: true, context };
      },
    },
    "@/lib/data/admin-teams-server": {
      listAdminTeams: async (query: unknown) => {
        reads.push("directory");
        if (searchFails) throw new Error("read failure");
        return {
          rows: [{ id: TEAM, name: "Westfield" }],
          nextCursor: null,
          query,
        };
      },
    },
    "@/lib/ui/adv-button": { advButton: () => "button" },
    "@/lib/ui/adv-field": { advField: () => "field" },
    "next/link": { __esModule: true, default: "a" },
  };
  return {
    reads,
    page: load("src/app/admin/uploads/new/page.tsx", mocks).default,
  };
}

test("scope URLs round-trip all kinds and reject ambiguous inputs", () => {
  for (const kind of ["file", "video", "dual", "tournament"] as const) {
    const url = new URL(adminUploadHref(TEAM, kind), "https://local.test");
    expect(adminUploadSelection(Object.fromEntries(url.searchParams))).toEqual({
      team: TEAM,
      kind,
      invalidTeam: false,
      invalidKind: false,
    });
    expect(adminUploadHref(null, kind)).toBe(`/admin/uploads/new?kind=${kind}`);
  }
  expect(
    adminUploadSelection({ team: [TEAM, "other"], kind: ["file", "video"] }),
  ).toMatchObject({
    team: null,
    kind: null,
    invalidTeam: true,
    invalidKind: true,
  });
});

test("route guard runs before target and directory reads", async () => {
  const h = routeHarness({ allowed: false });
  await expect(
    h.page({
      searchParams: Promise.resolve({ team: TEAM, kind: "video", q: "West" }),
    }),
  ).rejects.toThrow("not found");
  expect(h.reads).toEqual(["guard"]);
});

test("resolved target reaches entry without using active workspace", async () => {
  const h = routeHarness();
  const result = await h.page({
    searchParams: Promise.resolve({ team: TEAM, kind: "file" }),
  });
  expect(result.props.context).toBe(context);
  expect(result.props.kind).toBe("file");
  expect(h.reads).toEqual(["guard", `context:${TEAM}`]);
});

test("dual event reads require authorization and valid target context", async () => {
  const denied = routeHarness({ allowed: false });
  await expect(
    denied.page({
      searchParams: Promise.resolve({ team: TEAM, kind: "dual" }),
    }),
  ).rejects.toThrow("not found");
  expect(denied.reads).toEqual(["guard"]);

  const refused = routeHarness({ refusal: true });
  await refused.page({
    searchParams: Promise.resolve({ team: TEAM, kind: "dual" }),
  });
  expect(refused.reads).toEqual(["guard", `context:${TEAM}`]);

  const malformed = routeHarness();
  await malformed.page({
    searchParams: Promise.resolve({ team: "bad", kind: "dual" }),
  });
  expect(malformed.reads).toEqual(["guard"]);

  const resolved = routeHarness();
  const result = await resolved.page({
    searchParams: Promise.resolve({ team: TEAM, kind: "dual" }),
  });
  expect(resolved.reads).toEqual([
    "guard",
    `context:${TEAM}`,
    "admin-client",
    "table:program_events",
    `events:program_id:${TEAM}`,
    "events:kind:dual",
  ]);
  expect(result.props.dualResult.type).toBe("dual-form");
  expect(result.props.dualResult.props.events).toEqual([
    { id: TEAM, label: "Stanford · 2026-09-16" },
  ]);
});

test("other upload kinds skip privileged event reads and dual failures retain form", async () => {
  for (const kind of ["file", "video", "tournament"]) {
    const h = routeHarness();
    await h.page({ searchParams: Promise.resolve({ team: TEAM, kind }) });
    expect(h.reads).toEqual(["guard", `context:${TEAM}`]);
  }
  const h = routeHarness({ dualEventsFail: true });
  const result = await h.page({
    searchParams: Promise.resolve({ team: TEAM, kind: "dual" }),
  });
  expect(result.props.context).toBe(context);
  expect(result.props.dualResult.props.events).toEqual([]);
  expect(result.props.dualResult.props.eventsError).toContain(
    "couldn’t load existing duals",
  );
});

test("bad scope refuses wizard and search results preserve valid kind", async () => {
  const h = routeHarness();
  const result = await h.page({
    searchParams: Promise.resolve({ team: "bad", kind: "video", q: "West" }),
  });
  expect(result.props.context).toBeNull();
  expect(result.props.error).toBe("Choose a valid team.");
  expect(h.reads).toEqual(["guard", "directory"]);
  const links = elements(result.props.picker).filter((e) => e.type === "a");
  expect(links[0].props.href).toBe(adminUploadHref(TEAM, "video"));
});

test("context and directory failures keep a recoverable shell", async () => {
  const h = routeHarness({ refusal: true });
  const result = await h.page({
    searchParams: Promise.resolve({ team: TEAM, kind: "dual" }),
  });
  expect(result.props.context).toBeNull();
  expect(result.props.error).toBe("Program unavailable");
  const failedSearch = routeHarness({ searchFails: true });
  const search = await failedSearch.page({
    searchParams: Promise.resolve({ q: "West", kind: "file" }),
  });
  expect(search.props.error).toContain("couldn’t search teams");
  expect(elements(search.props.picker).some((e) => e.type === "form")).toBe(
    true,
  );
});

test("file/video mount shared wizard with target and stable retry identifiers; result kinds use slots", () => {
  const state: unknown[] = [];
  let cursor = 0;
  const pushes: string[] = [];
  const entry = load("src/components/admin/admin-upload-entry.tsx", {
    react: {
      useState: (init: () => unknown) => {
        const index = cursor++;
        state[index] ??= init();
        return [state[index], () => {}];
      },
    },
    "next/navigation": {
      useRouter: () => ({
        push: (url: string) => pushes.push(url),
        refresh: () => {},
      }),
    },
    "next/link": { __esModule: true, default: "a" },
    "@/components/dashboard/matches/new-match-wizard/admin-mode": {
      AdminUploadMatchFlow: "wizard",
    },
    "@/components/admin/admin-upload-selection": { adminUploadHref },
    "./admin-upload-selection": { adminUploadHref },
  }).AdminUploadEntry;
  for (const kind of ["file", "video"] as const) {
    const tree = entry({ context, kind, picker: null });
    const boundary = elements(tree).find((e) => typeof e.type === "function");
    expect(boundary).toBeDefined();
    cursor = 0;
    const wizard = (boundary!.type as (props: unknown) => Element)(
      boundary!.props,
    );
    expect(wizard.type).toBe("wizard");
    expect(wizard.props.initialProvider).toBe(
      kind === "file" ? "swing-vision" : "splitstep",
    );
    const mode = wizard.props.mode as Record<string, unknown>;
    expect(mode.context).toBe(context);
    expect(mode.exitHref).toBe(adminUploadHref(TEAM, null));
    expect(mode.successHref).toBe("/admin/uploads");
    cursor = 0;
    expect(
      (boundary!.type as (props: unknown) => Element)(boundary!.props).props
        .mode,
    ).toEqual(mode);
    const radio = elements(tree).find(
      (e) => e.type === "input" && e.props.value === "tournament",
    )!;
    (radio.props.onChange as () => void)();
    expect(pushes.at(-1)).toBe(adminUploadHref(TEAM, "tournament"));
  }
  for (const kind of ["dual", "tournament"]) {
    const tree = entry({
      context,
      kind,
      picker: null,
      dualResult: "dual slot",
      tournamentResult: "tournament slot",
    });
    expect(elements(tree).some((e) => typeof e.type === "function")).toBe(
      false,
    );
    expect(
      elements(tree).find((e) => e.type === "section")?.props.children,
    ).toBe(`${kind} slot`);
  }
  const recovery = entry({
    context: null,
    kind: "file",
    picker: "picker",
    error: "Read failed",
  });
  expect(elements(recovery).some((e) => e.props.role === "alert")).toBe(true);
  expect(
    elements(recovery).some(
      (e) => e.type === "a" && e.props.href === "/admin/uploads/new?kind=file",
    ),
  ).toBe(true);
});
