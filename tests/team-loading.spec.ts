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
    /** Presence's `hasSchedule` on a day-zero program. */
    hasEvents?: boolean;
    /**
     * `SCHEDULE_ENABLED`. Stubbed explicitly: the catch-all proxy below would
     * hand back a component — truthy — and silently test the enabled path.
     * Defaults on, since the schedule's implementation is kept behind it;
     * the flag-off tests at the bottom pass `false`.
     */
    scheduleEnabled?: boolean;
    /** What Team Home's one match read (`getHomeFeed`) resolves to. */
    feed?: unknown;
    /** The viewer's own roster row (`active.myPlayerId`); none by default. */
    myPlayerId?: string;
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
        resolve(
          `src/app/dashboard/team/${name ? name + "/(list)/" : "(home)/"}page.tsx`,
        ),
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
        if (id === "@/lib/auth/request-path")
          return {
            loginRedirectPath: async (fallback: string) =>
              `/login?next=${encodeURIComponent(fallback)}`,
          };
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
                      myPlayerId: options.myPlayerId ?? null,
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
                    hasSchedule: options.hasEvents ?? false,
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
        if (id.includes("home-feed-server"))
          return {
            getHomeFeed: () => {
              reads.push("feed");
              return options.feed ? Promise.resolve(options.feed) : pending;
            },
          };
        if (id.includes("home-player-numbers-server"))
          return {
            getPlayerHomeKpis: () => {
              reads.push("numbers");
              return pending;
            },
          };
        if (id.includes("usage-server"))
          return {
            getProgramUsage: () => {
              reads.push("usage");
              return pending;
            },
          };
        if (id.includes("ask-server"))
          return {
            getAskPins: () => {
              reads.push("pins");
              return Promise.resolve([]);
            },
          };
        if (id.includes("team-roster-server"))
          return {
            getRosterData: async () => {
              reads.push("roster");
              if (options.fail) throw new Error("database failed");
              return options.roster ?? emptyRoster;
            },
            getFormerPlayers: async () => [],
            getRosterJoinLink: async () => null,
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
        if (id === "@/lib/schedule/availability") {
          const enabled = options.scheduleEnabled ?? true;
          return {
            SCHEDULE_ENABLED: enabled,
            scheduleSlot: (node: unknown) => (enabled ? node : null),
            scheduleHref: (schedulePath: string, fallback: string) =>
              enabled ? schedulePath : fallback,
          };
        }
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

const cardTitles = (lead: unknown) =>
  (find(lead, "StartCards")?.props.cards as { title: string }[]).map(
    (card) => card.title,
  );
test("Team Home returns its frame while every read is still pending", async () => {
  const home = route("");
  const frame = await Promise.race([
    home.render(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("page waited for its data")), 1000),
    ),
  ]);
  expect(find(frame, "HomeFeedFrame")).toBeDefined();
  // One read each, started together; nothing asks whether the program is
  // new first — a new program draws this same page.
  expect(home.reads).toEqual(["feed", "usage", "roster", "pins"]);
});

test("Team Home's action cards hold the lead slot at every stage, with no read behind them", async () => {
  const home = route("");
  expect(cardTitles(await home.render())).toEqual([
    "New match",
    "Invite players",
    "Ask about the team",
  ]);
  const source = readFileSync(
    resolve("src/app/dashboard/team/(home)/page.tsx"),
    "utf8",
  );
  expect(source).not.toContain("lead-card");
});

test("A player with a roster row gets Team Home turned to them", async () => {
  const feed = {
    latest: [],
    analyzing: 0,
    analyzed: 0,
    lastFive: { wins: 0, losses: 0, played: 0 },
    matchCount: 0,
    player: {
      own: [{ id: "mine" }],
      team: [{ id: "theirs" }],
      summary: {
        analyzing: 0,
        analyzed: 1,
        lastFive: { wins: 1, losses: 0, played: 1 },
        matchCount: 1,
      },
    },
  };
  const home = route("", { role: "player", myPlayerId: "p1", feed });
  const frame = await home.render();
  // Their numbers are read in place of the roster, which the page never lists.
  expect(home.reads).toEqual(["feed", "usage", "numbers", "pins"]);
  // No upload for a player here, so the third card is the team's matches.
  expect(cardTitles(frame)).toEqual([
    "Your profile",
    "Ask about your game",
    "Team matches",
  ]);
  expect(find(frame, "Players")).toBeUndefined();
  expect(find(frame, "PlayerNumbers")).toBeDefined();

  const lists = await renderChild(find(frame, "PlayerMatches")!);
  const drawn: Record<string, unknown>[] = [];
  const collect = (node: unknown) => {
    if (!React.isValidElement<Record<string, unknown>>(node)) return;
    const type = node.type as { displayName?: string };
    if (type.displayName === "LatestMatches") drawn.push(node.props);
    for (const value of Object.values(node.props))
      for (const child of Array.isArray(value) ? value : [value])
        collect(child);
  };
  collect(lists);
  expect(drawn.map((list) => [list.title, list.scope])).toEqual([
    ["Your matches", "personal"],
    ["Latest from the team", "team"],
  ]);
  expect(drawn[0].matches).toEqual(feed.player.own);
  expect(drawn[1].matches).toEqual(feed.player.team);

  // The title counts their matches, not the program's.
  const title = await renderChild(find(frame, "Title")!);
  expect(find(title, "HomeTitle")?.props.feed).toEqual(feed.player.summary);
  expect(find(title, "HomeTitle")?.props.yours).toBe(true);
});

test("Staff who also play keep the program's Team Home", async () => {
  const home = route("", { role: "coach", myPlayerId: "p1" });
  const frame = await home.render();
  expect(home.reads).toEqual(["feed", "usage", "roster", "pins"]);
  expect(find(frame, "PlayerMatches")).toBeUndefined();
  expect(find(frame, "Players")).toBeDefined();
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
      find(content, invited ? "RosterView" : "RosterDayZeroPage"),
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
  expect(find(content, "RosterDayZeroPage")?.props.canManage).toBe(false);
  expect(roster.reads).toEqual(["roster"]);
  // A player can neither upload for the program nor manage its roster, so
  // Team Home offers them only the card they can act on.
  const home = route("", { role: "player" });
  expect(cardTitles(await home.render())).toEqual(["Ask about the team"]);
});

// ── While the Schedule is a coming-soon page (`lib/schedule/availability.ts`)

test("Schedule off: the page is the coming-soon stub and reads nothing", async () => {
  for (const kind of ["team", "personal", null]) {
    const schedule = route("schedule", { kind, scheduleEnabled: false });
    const page = await schedule.render();
    expect(find(page, "ComingSoonPage")?.props).toMatchObject({
      title: "Schedule",
    });
    expect(find(page, "StaticSchedule")).toBeUndefined();
    expect(schedule.reads).toEqual([]);
  }
});

test("Team Home reads nothing from the schedule", () => {
  // The dual sheet, court record and dual history left the page with the
  // redesign, so the Schedule being closed has nothing here to gate.
  const source = readFileSync(
    resolve("src/app/dashboard/team/(home)/page.tsx"),
    "utf8",
  );
  expect(source).not.toMatch(/schedule/i);
});
