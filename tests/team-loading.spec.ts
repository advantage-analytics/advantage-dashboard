import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { test, expect } from "@playwright/test";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";

const pending = new Promise<never>(() => {});
const emptyRoster = {
  members: [],
  invites: [],
  seats: { used: 0, seats: 10 },
  playersCanUpload: false,
  uploadPolicy: "staff",
};

function route(
  name: string,
  options: {
    kind?: string | null;
    role?: string;
    roster?: unknown;
    fail?: boolean;
    joinFail?: boolean;
    dayZero?: boolean;
  } = {},
) {
  const reads: string[] = [];
  const resources = {
    analytics: pending,
    usage: pending,
    roster: pending,
    schedule: Promise.resolve({
      weekendDual: null,
      courtRecord: { columns: [], dualsPlayed: 0 },
      dualHistory: [],
      dualForm: [],
      dualWins: 0,
      decidedDuals: [],
    }),
  };
  const exports: { default?: (props: unknown) => Promise<React.ReactElement> } =
    {};
  const component = (name: string) =>
    Object.assign(() => null, { displayName: name });
  runInNewContext(
    ts.transpileModule(
      readFileSync(
        resolve(`src/app/dashboard/team/${name ? name + "/" : ""}page.tsx`),
        "utf8",
      ),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    {
      exports,
      require: (id: string) => {
        if (id === "react") return React;
        if (id === "react/jsx-runtime") return jsx;
        if (id === "next/navigation")
          return {
            redirect: (url: string) => {
              throw new Error(`redirect:${url}`);
            },
          };
        if (id.includes("active-workspace-server"))
          return {
            getWorkspaceContext: async () =>
              options.kind === null
                ? null
                : {
                    viewer: { id: "viewer" },
                    active: {
                      id: "program",
                      kind: options.kind ?? "team",
                      role: options.role ?? "owner",
                      canSubmitVideo: true,
                      eventsPolicy: "staff",
                    },
                  },
          };
        if (id.includes("workspace/types"))
          return {
            isProgramStaff: (w: { role: string }) => w.role !== "player",
            canUploadForProgram: (w: { role: string }) => w.role !== "player",
            canManageTeamSchedule: (w: { role: string }) => w.role !== "player",
            teamLabel: () => "Men's tennis",
          };
        if (id.includes("team-home-server"))
          return {
            getTeamHomePresence: async () => {
              reads.push("presence");
              return options.dayZero
                ? {
                    hasMatches: false,
                    hasRoster: false,
                    hasSchedule: false,
                  }
                : {
                    hasMatches: true,
                    hasRoster: false,
                    hasSchedule: false,
                  };
            },
            getTeamHomeResources: () => {
              reads.push("resources");
              return resources;
            },
          };
        if (id.includes("team-roster-server"))
          return {
            getRosterData: async () => {
              reads.push("roster");
              if (options.fail) throw new Error("database failed");
              return options.roster ?? emptyRoster;
            },
          };
        if (id.includes("join-requests-server"))
          return {
            getPendingJoinRequests: async () => {
              reads.push("join requests");
              if (options.joinFail) throw new Error("join requests failed");
              return [];
            },
          };
        if (id.includes("schedule-server"))
          return {
            getProgramSchedule: () => {
              reads.push("schedule");
              return pending;
            },
          };
        if (id.includes("splitstep/config"))
          return { currentBillingMonth: () => "2026-09" };
        return new Proxy({}, { get: (_, key) => component(String(key)) });
      },
    },
  );
  return {
    render: () => exports.default!({ searchParams: Promise.resolve({}) }),
    reads,
  };
}

function find(
  node: unknown,
  name: string,
): React.ReactElement<Record<string, unknown>> | undefined {
  if (!React.isValidElement<Record<string, unknown>>(node)) return;
  const type = node.type as { name?: string; displayName?: string };
  if (type.name === name || type.displayName === name) return node;
  for (const value of Object.values(node.props)) {
    for (const child of Array.isArray(value) ? value : [value]) {
      const result = find(child, name);
      if (result) return result;
    }
  }
}
async function renderChild(node: React.ReactElement<Record<string, unknown>>) {
  return (
    node.type as (props: Record<string, unknown>) => Promise<React.ReactElement>
  )(node.props);
}

test("Team Home streams the schedule's confirmed empty cards while analytics, roster and usage remain pending", async () => {
  const home = route("");
  const frame = await home.render();
  expect(find(frame, "TeamHomeFrame")).toBeDefined();
  const dual = await renderChild(find(frame, "Dual")!);
  expect(find(dual, "DualSheetEmpty")?.props.canSchedule).toBe(true);
  const court = await renderChild(find(frame, "Court")!);
  expect(find(court, "CourtRecord")?.props.record).toEqual({
    columns: [],
    dualsPlayed: 0,
  });
  expect(home.reads).toEqual(["presence", "resources"]);
});

test("Team Home preserves the dedicated day-zero offer around streamed preview regions", async () => {
  const home = route("", { dayZero: true });
  const page = await home.render();
  expect(find(page, "TeamDayZeroHome")).toBeDefined();
  expect(find(page, "TeamHomeFrame")).toBeUndefined();
  expect(find(page, "TeamHomeRegions")).toBeDefined();
  expect(find(page, "Dual")?.props.isPreview).toBe(true);
  expect(find(page, "TopMoversFrame")?.props.isPreview).toBe(true);
  expect(home.reads).toEqual(["presence", "resources"]);
});

test("Team Home presence honors the roster membership fallback", () => {
  const source = readFileSync(
    resolve("src/lib/data/team-home-server.ts"),
    "utf8",
  );
  const presence = source.match(
    /getTeamHomePresence[\s\S]*?export function getTeamHomeResources/,
  )?.[0];
  expect(presence).toBeTruthy();
  expect(presence).toContain('.from("program_players")');
  expect(presence).toContain('.from("program_members")');
  expect(presence).toContain('.eq("role", "player")');
});

for (const page of ["", "roster", "schedule"]) {
  test(`${page || "Team Home"}: personal and signed-out requests stop before team reads`, async () => {
    for (const kind of ["personal", null]) {
      const target = route(page, { kind });
      await expect(target.render()).rejects.toThrow(
        kind ? "redirect:/dashboard" : "redirect:/login",
      );
      expect(target.reads).toEqual([]);
    }
  });
}

test("Roster and Schedule return their matching fallback before loading their data", async () => {
  for (const [page, skeleton] of [
    ["roster", "RosterPageSkeleton"],
    ["schedule", "SchedulePageSkeleton"],
  ]) {
    const target = route(page);
    expect(find(await target.render(), skeleton)).toBeDefined();
    expect(target.reads).toEqual([]);
  }
});

test("Confirmed empty roster shows day zero; an invitation keeps the roster view", async () => {
  for (const invited of [false, true]) {
    const target = route("roster", {
      roster: {
        ...emptyRoster,
        invites: invited ? [{ email: "pending@example.test" }] : [],
      },
    });
    const frame = await target.render();
    const content = await renderChild(find(frame, "RosterContent")!);
    expect(
      find(content, invited ? "RosterView" : "RosterDayZero"),
    ).toBeDefined();
    expect(find(content, "RosterPageSkeleton")).toBeUndefined();
  }
});

test("Roster failures do not become day zero", async () => {
  const target = route("roster", { fail: true });
  const frame = await target.render();
  await expect(renderChild(find(frame, "RosterContent")!)).rejects.toThrow(
    "database failed",
  );
});

test("Join-request failure is fatal only when it determines day zero", async () => {
  const empty = route("roster", { joinFail: true });
  const emptyFrame = await empty.render();
  await expect(renderChild(find(emptyFrame, "RosterContent")!)).rejects.toThrow(
    "join requests failed",
  );

  const populated = route("roster", {
    joinFail: true,
    roster: {
      ...emptyRoster,
      invites: [{ email: "pending@example.test" }],
    },
  });
  const populatedFrame = await populated.render();
  const content = await renderChild(find(populatedFrame, "RosterContent")!);
  expect(find(content, "RosterView")).toBeDefined();
});

test("Player view skips the staff join-request read and does not offer adding a dual", async () => {
  const roster = route("roster", { role: "player" });
  const content = await renderChild(
    find(await roster.render(), "RosterContent")!,
  );
  expect(find(content, "RosterDayZero")?.props.canManage).toBe(false);
  expect(roster.reads).toEqual(["roster"]);
  const home = route("", { role: "player" });
  const dual = await renderChild(find(await home.render(), "Dual")!);
  expect(find(dual, "DualSheetEmpty")?.props.canSchedule).toBe(false);
});
