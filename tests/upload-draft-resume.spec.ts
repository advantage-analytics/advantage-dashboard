import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

import {
  draftBelongsToWorkspace,
  draftWorkspaceRefusal,
} from "@/components/dashboard/matches/new-match-wizard/subject-eligibility";
import type {
  EventPreset,
  LineOffer,
  MatchDraft,
} from "@/components/dashboard/matches/new-match-wizard/types";
import { presetFor } from "@/lib/schedule/line-choices";
import type { EventEntry, ProgramEvent } from "@/lib/schedule/types";
import { draftTargetMatchId, foldDrafts } from "@/lib/wizard/draft-target";
import { createLoader } from "./fixtures/vm-modules";
import {
  parsedNames,
  uploadWizardHarness,
} from "./fixtures/upload-wizard-hook";

/**
 * The two draft defects T19 documented and deliberately left standing:
 *
 *   1. A refused `saveMatchDraft` navigated away anyway, so a person who
 *      clicked Save draft and landed on the Matches table had been told their
 *      work was safe when no row existed.
 *   2. `loadMatchDraft` never read `program_id`, so a draft saved under one
 *      workspace resumed into whichever one happened to be active, carrying
 *      its attached line and answers into a program they never belonged to.
 *
 * Keyless: the rule half runs the real pure functions, the hook half runs the
 * real hook through `uploadWizardHarness` (a VM, no DOM, no network), and the
 * wiring half reads source. Nothing here touches a database or a browser
 * session.
 */

const WIZARD = "src/components/dashboard/matches/new-match-wizard";

function source(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

// ─── Bug 1: a failed save must not read as a successful one ────────────────

test.describe("save draft failure", () => {
  test("a refused write answers false and says why", async () => {
    const h = uploadWizardHarness({ draftSave: "refused" });
    await h.flush();

    expect(h.current.draftSaveError).toBeNull();
    const before = { step: h.current.step, formData: h.current.formData };
    const saved = await h.current.saveDraft();
    h.render();

    expect(saved).toBe(false);
    expect(h.draftSaves).toHaveLength(1);
    expect(h.current.draftSaveError).toContain("couldn't save your draft");
    // The answers are the point: a failure that also dropped them would be
    // the worse bug. The step and the form are untouched, and the button is
    // clickable again.
    expect(h.current.step).toBe(before.step);
    expect(h.current.formData).toEqual(before.formData);
    expect(h.current.draftSaving).toBe(false);
  });

  test("a successful write answers true and clears the failure", async () => {
    const h = uploadWizardHarness({ draftSave: "refused" });
    await h.flush();
    expect(await h.current.saveDraft()).toBe(false);
    h.render();
    expect(h.current.draftSaveError).not.toBeNull();

    // Same wizard, the next attempt succeeds: the notice must not outlive it.
    const ok = uploadWizardHarness({ draftSave: "saved" });
    await ok.flush();
    expect(await ok.current.saveDraft()).toBe(true);
    ok.render();
    expect(ok.current.draftSaveError).toBeNull();
    expect(ok.draftSaves).toHaveLength(1);
  });

  test("the footer leaves only on a save that worked", () => {
    // `handleSaveDraft` lives in `useDraftSaving`, the page's draft hook; the
    // footer button (`UploadWizardFooter.tsx`) only calls what it returns.
    const flow = source(`${WIZARD}/useDraftSaving.ts`);
    const body = flow.slice(
      flow.indexOf("const handleSaveDraft"),
      flow.indexOf("return handleSaveDraft;"),
    );
    expect(body).toContain("const saved = await saveDraft();");
    // The guard, and the guard BEFORE the navigation — the whole defect was
    // one `await` whose answer nothing read.
    expect(body.indexOf("if (!saved) return;")).toBeGreaterThan(-1);
    expect(body.indexOf("if (!saved) return;")).toBeLessThan(
      body.indexOf("router.push(exitHref)"),
    );
    expect(body).not.toContain("await saveDraft();\n    router.push");
  });

  test("the header never claims a draft that was refused", () => {
    const flow = source(`${WIZARD}/useDraftSaving.ts`);
    const status = flow.slice(
      flow.indexOf("usePublishHeaderStatus("),
      flow.indexOf("const handleSaveDraft"),
    );
    expect(status).toContain("draftSaveError");
    expect(status).toContain("Draft not saved");
  });
});

// ─── Bug 2: a draft resumes into its own workspace, or not at all ──────────

const personal = { kind: "personal" as const, id: "user-1" };
const teamA = { kind: "team" as const, id: "program-a" };
const teamB = { kind: "team" as const, id: "program-b" };

test.describe("draft workspace binding", () => {
  test("a draft belongs to the workspace it was saved in, and only that one", () => {
    expect(draftBelongsToWorkspace("program-a", teamA)).toBe(true);
    expect(draftBelongsToWorkspace("program-a", teamB)).toBe(false);
    // A personal draft is `program_id IS NULL` — and the personal workspace's
    // own id is the USER's, never a program's, so the null is the comparison.
    expect(draftBelongsToWorkspace(null, personal)).toBe(true);
    expect(draftBelongsToWorkspace(null, teamA)).toBe(false);
    expect(draftBelongsToWorkspace("program-a", personal)).toBe(false);
  });

  test("the refusal names the workspace when it can, and invents none when it cannot", () => {
    const named = draftWorkspaceRefusal("Westfield Men's");
    expect(named).toContain("Westfield Men's");
    expect(named.toLowerCase()).toContain("switch to");

    // The author may have left the program since saving — `match_drafts` is
    // RLS-scoped to `user_id` alone, so the row still reads back. The sentence
    // must not name a workspace nobody can offer.
    const anonymous = draftWorkspaceRefusal(null);
    expect(anonymous).toContain("another workspace");
    expect(anonymous).not.toContain("null");
    expect(anonymous).not.toContain("undefined");
  });

  test("loadMatchDraft reads program_id off the row, not the payload", () => {
    const actions = source("src/lib/wizard/actions.ts");
    const loader = actions.slice(
      actions.indexOf("export async function loadMatchDraft"),
      actions.indexOf("export interface DraftRow"),
    );
    expect(loader).toContain('"payload, updated_at, program_id"');
    // Spread first, `programId` last: a payload that ever carried the field
    // must not be able to answer this question in the row's place.
    expect(loader.indexOf("...row.payload")).toBeLessThan(
      loader.indexOf("programId: row.program_id"),
    );
  });

  test("the route refuses a foreign draft instead of handing it to the wizard", () => {
    const page = source("src/app/dashboard/matches/new/page.tsx");
    expect(page).toContain("draftBelongsToWorkspace(");
    expect(page).toContain("draftWorkspaceRefusal(");
    // The wizard is handed the CHECKED value, never the loaded one.
    expect(page).toContain("const draft = resumable ? loadedDraft : null;");
    expect(page).toContain("draft={draft}");
    expect(page).not.toContain("draft={loadedDraft}");
    // The workspace has to be resolved for a `?draft=` visit, or the check
    // has nothing to compare against.
    expect(page).toContain("player || draftId ? getWorkspaceContext() : null");
  });

  test("the team upload route refuses one too — both resume entries, one rule", () => {
    const page = source("src/app/dashboard/team/upload/page.tsx");
    // Two routes load a draft by id. A check on only one of them is the same
    // bug with a longer URL.
    expect(page).toContain(
      "draftBelongsToWorkspace(loadedDraft.programId, active)",
    );
    expect(page).toContain("draftWorkspaceRefusal(");
    // The refusing branch hands the wizard a sentence and no draft: exactly
    // one of the two `<UploadMatchFlow>` returns carries the loaded draft.
    expect(page.match(/draft=\{loadedDraft\}/g) ?? []).toHaveLength(1);
  });

  test("a refused draft reaches the wizard as nothing at all", () => {
    const flow = source(`${WIZARD}/UploadMatchFlow.tsx`);
    const provider = source(`${WIZARD}/UploadWizardProvider.tsx`);
    const steps = source(`${WIZARD}/UploadWizardSteps.tsx`);
    // The preset is seeded from `draft?.preset` before the hook ever runs, so
    // a half-refused draft would still pin a line bar from the wrong program.
    // `draftRefusal` is a sentence only — it can carry no draft state, at the
    // page's prop, through the provider, to the notice that renders it.
    expect(flow).toContain("draftRefusal?: string | null;");
    expect(provider).toContain("draftRefusal: string | null;");
    expect(steps).toContain("<FlowNotice>{draftRefusal}</FlowNotice>");
  });
});

// ─── T20: a draft knows the match it fills, and folds onto it ──────────────
//
// "Add video" on a scored line opens `/dashboard/team/upload?entry=E&match=M`.
// A draft saved from there is more work on match M — submitting it updates
// that row — but the Matches table listed it beside M as a second row, so one
// court showed twice. These pin the rule, the list's `matchId`, the fold, and
// that no second match is ever minted along the way.

const EVENT: ProgramEvent = {
  id: "event-e",
  programId: "program-1",
  kind: "dual",
  name: "Rival State",
  startsOn: "2026-03-21",
  endsOn: "2026-03-21",
  site: "home",
  surface: "hard",
  host: null,
  format: { bestOf: 3, adScoring: true },
};

const ENTRY: EventEntry = {
  id: "E",
  eventId: EVENT.id,
  position: 0,
  discipline: "singles",
  slot: "S1",
  draw: null,
  seed: null,
  playerUserIds: ["athlete"],
  playerLabels: ["Player athlete"],
  opponentLabels: ["Rival Player"],
  opponentSchool: null,
  opponentProgramId: null,
  forfeit: null,
  matches: [
    {
      id: "M",
      round: null,
      status: "imported",
      score: { player1: [6, 6], player2: [3, 4] },
      opponentLabels: ["Rival Player"],
      hasVideo: false,
    },
  ],
};

/** The preset `team/upload/page.tsx` builds for `?entry=E&match=M`. */
function linePreset(): EventPreset {
  const match = ENTRY.matches.find((m) => m.id === "M") ?? null;
  return presetFor(EVENT, ENTRY, match, new Map());
}

function lineOffer(matchId: string | null): LineOffer {
  return {
    entryId: "E2",
    matchId,
    eventId: EVENT.id,
    eventName: EVENT.name,
    eventKind: "dual",
    slot: "S2",
    playerName: "Player athlete",
    opponentName: "Rival Player",
    opponentProgramKey: null,
    opponentSchool: null,
    date: "2026-03-21",
    site: "home",
    surface: "hard",
    bestOf: 3,
    adScoring: true,
  };
}

function draftOf(overrides: Partial<MatchDraft> = {}): MatchDraft {
  return {
    id: "draft-1",
    step: "file",
    stepCount: 3,
    stepIndex: 1,
    provider: "swing-vision",
    formData: {} as MatchDraft["formData"],
    fileName: "match.csv",
    preset: null,
    attachedLine: null,
    updatedAt: "2026-09-20T00:00:00.000Z",
    ...overrides,
  };
}

test.describe("draftTargetMatchId (T20)", () => {
  test("the preset names the match", () => {
    expect(
      draftTargetMatchId({ preset: linePreset(), attachedLine: null }),
    ).toBe("M");
  });

  test("an accepted line offer names it when the preset does not", () => {
    expect(
      draftTargetMatchId({ preset: null, attachedLine: lineOffer("M2") }),
    ).toBe("M2");
    // A preset on an UNSCORED line names no match, so it does not mask one.
    expect(
      draftTargetMatchId({
        preset: { ...linePreset(), matchId: null },
        attachedLine: lineOffer("M2"),
      }),
    ).toBe("M2");
  });

  test("neither names one: the draft will create a match", () => {
    expect(draftTargetMatchId({ preset: null, attachedLine: null })).toBeNull();
    expect(draftTargetMatchId({})).toBeNull();
    expect(
      draftTargetMatchId({
        preset: { ...linePreset(), matchId: null },
        attachedLine: lineOffer(null),
      }),
    ).toBeNull();
  });

  test("the wizard asks it in both places, not its own copy of the rule", () => {
    const hook = source(`${WIZARD}/useUploadMatchWizard.ts`);
    expect(hook).toContain(
      "const existingMatchId = draftTargetMatchId({ preset, attachedLine });",
    );
    const create = hook.slice(hook.indexOf("const handleCreateMatch"));
    expect(create).toContain(
      "const existingTarget = draftTargetMatchId({ preset, attachedLine });",
    );
    expect(create).toContain(
      "const matchId = existingTarget ?? crypto.randomUUID();",
    );
    expect(hook).not.toContain("(preset ?? attachedLine)?.matchId");
  });
});

/**
 * An in-memory `match_drafts` behind a mocked server client: `upsert` stores
 * the row, `select` projects it — including PostgREST's `alias:col->a->>b`
 * JSON paths, so the list's select string is what is actually exercised.
 */
function draftsDatabase() {
  const rows = new Map<string, Record<string, unknown>>();
  const tables: string[] = [];
  const selects: string[] = [];

  function project(row: Record<string, unknown>, columns: string) {
    const out: Record<string, unknown> = {};
    for (const raw of columns.split(",").map((c) => c.trim())) {
      const [alias, expr] = raw.includes(":") ? raw.split(":") : [raw, raw];
      const parts = expr.split(/->>?/);
      let value: unknown = row[parts[0]];
      for (const key of parts.slice(1))
        value =
          value && typeof value === "object"
            ? (value as Record<string, unknown>)[key]
            : undefined;
      // `->>` answers text or SQL null, never undefined.
      out[alias] = expr.includes("->>")
        ? value == null
          ? null
          : String(value)
        : (value ?? null);
    }
    return out;
  }

  function builder(table: string) {
    let columns = "*";
    let upserted: Record<string, unknown> | null = null;
    const filters: [string, unknown][] = [];
    const result = () => {
      const matched = [...rows.values()].filter((row) =>
        filters.every(([col, v]) => row[col] === v),
      );
      return matched.map((row) => project(row, columns));
    };
    const chain: Record<string, unknown> = {
      upsert(row: Record<string, unknown>) {
        upserted = { ...row };
        rows.set(String(row.id), upserted);
        return chain;
      },
      select(cols: string) {
        columns = cols;
        selects.push(cols);
        return chain;
      },
      eq(col: string, v: unknown) {
        filters.push([col, v]);
        return chain;
      },
      is(col: string, v: unknown) {
        filters.push([col, v]);
        return chain;
      },
      order: () => chain,
      maybeSingle: async () => ({
        data: upserted ? project(upserted, columns) : (result()[0] ?? null),
        error: null,
      }),
      then: (resolve: (value: unknown) => void) =>
        resolve({ data: result(), error: null }),
    };
    void table;
    return chain;
  }

  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "user" } } }) },
    from(table: string) {
      tables.push(table);
      return builder(table);
    },
  };
  return { client, rows, tables, selects };
}

function loadActions(db: ReturnType<typeof draftsDatabase>) {
  return createLoader({
    stubs: {
      "@/lib/supabase/server": { createClient: async () => db.client },
      "@/lib/workspace/active-workspace-server": {
        getWorkspaceContext: async () => ({
          active: { kind: "team", id: "program-1" },
        }),
      },
      // Only other actions in the module read these.
      "@/lib/workspace/types": {},
      "@/lib/data/schedule-server": {},
      "@/lib/data/opponents-server": {},
      "@/lib/data/person-name": {},
      "@/lib/schedule/entry-state": {},
      "@/lib/schedule/attach-line-state": {},
      "@/lib/data/roster-ids": {},
    },
  }).load("src/lib/wizard/actions.ts") as {
    saveMatchDraft: (
      draft: Omit<MatchDraft, "updatedAt">,
    ) => Promise<{ id: string } | null>;
    listMatchDrafts: (scope: {
      programId: string | null;
    }) => Promise<{ id: string; matchId: string | null }[]>;
  };
}

test.describe("listMatchDrafts carries the draft's match (T20)", () => {
  test("a draft saved from ?entry=E&match=M lists with matchId M", async () => {
    const db = draftsDatabase();
    const actions = loadActions(db);
    const { updatedAt: _omit, ...draft } = draftOf({
      id: "draft-m",
      preset: linePreset(),
    });
    void _omit;
    expect(await actions.saveMatchDraft(draft)).toMatchObject({
      id: "draft-m",
    });
    const { updatedAt: _o2, ...plain } = draftOf({ id: "draft-new" });
    void _o2;
    await actions.saveMatchDraft(plain);

    const listed = await actions.listMatchDrafts({ programId: "program-1" });
    expect(listed.find((d) => d.id === "draft-m")?.matchId).toBe("M");
    expect(listed.find((d) => d.id === "draft-new")?.matchId).toBeNull();
  });

  test("the list reads two JSON paths, never the whole payload", async () => {
    const db = draftsDatabase();
    await loadActions(db).listMatchDrafts({ programId: "program-1" });
    const [select] = db.selects;
    expect(select).toContain("payload->preset->>matchId");
    expect(select).toContain("payload->attachedLine->>matchId");
    expect(select.split(",").map((c) => c.trim())).not.toContain("payload");
  });

  test("an attached line's match lists too", async () => {
    const db = draftsDatabase();
    const actions = loadActions(db);
    const { updatedAt: _omit, ...draft } = draftOf({
      id: "draft-line",
      attachedLine: lineOffer("M2"),
    });
    void _omit;
    await actions.saveMatchDraft(draft);
    const [row] = await actions.listMatchDrafts({ programId: "program-1" });
    expect(row.matchId).toBe("M2");
  });
});

test.describe("foldDrafts (T20)", () => {
  const row = (id: string, matchId: string | null, updatedAt: string) => ({
    id,
    matchId,
    updatedAt,
  });

  test("a listed match's draft folds onto it", () => {
    const d = row("d1", "M", "2026-09-20T00:00:00Z");
    const { standalone, byMatchId } = foldDrafts([d], ["M"]);
    expect(standalone).toEqual([]);
    expect(byMatchId.get("M")).toBe(d);
  });

  test("a draft whose match is not listed stays standalone", () => {
    const d = row("d1", "M-elsewhere", "2026-09-20T00:00:00Z");
    const { standalone, byMatchId } = foldDrafts([d], ["M"]);
    expect(standalone).toEqual([d]);
    expect(byMatchId.size).toBe(0);
  });

  test("a draft with no match stays standalone", () => {
    const d = row("d1", null, "2026-09-20T00:00:00Z");
    const { standalone, byMatchId } = foldDrafts([d], ["M"]);
    expect(standalone).toEqual([d]);
    expect(byMatchId.size).toBe(0);
  });

  test("only the newest folds; an older one for the same match stays standalone", () => {
    const older = row("old", "M", "2026-09-19T00:00:00+00:00");
    const newer = row("new", "M", "2026-09-20T00:00:00Z");
    // Either input order: the fold picks by time, not by position.
    for (const input of [
      [older, newer],
      [newer, older],
    ]) {
      const { standalone, byMatchId } = foldDrafts(input, new Set(["M"]));
      expect(byMatchId.get("M")).toBe(newer);
      expect(standalone).toEqual([older]);
    }
  });
});

test.describe("no duplicate match (T20)", () => {
  test("saveMatchDraft writes to match_drafts and nothing else", async () => {
    const db = draftsDatabase();
    const { updatedAt: _omit, ...draft } = draftOf({ preset: linePreset() });
    void _omit;
    await loadActions(db).saveMatchDraft(draft);
    expect(db.tables).toEqual(["match_drafts"]);
    expect(db.rows.size).toBe(1);
  });

  test("a resumed preset draft updates the draft's match, and inserts none", async () => {
    const preset = linePreset();
    const draft = draftOf({ id: "draft-m", preset });
    // `UploadMatchFlow` seeds its preset from `draft.preset` on resume.
    const h = uploadWizardHarness({ team: true, props: { draft, preset } });
    await h.flush();
    // A preset opens on the file step: the line already answers step 1.
    expect(h.current.step).toBe("file");
    const file = await h.pick("match.csv");
    file.resolve(parsedNames("Player athlete"));
    await h.flush();
    h.current.handleInputChange("playerHand", "right");
    h.current.handleInputChange("playerBackhand", "two-handed");
    h.current.handleInputChange("opponentHand", "left");
    h.current.handleInputChange("opponentBackhand", "one-handed");
    // A line's upload is video; the camera answers the trim step asks for.
    h.current.handleInputChange("fixedCamera", true);
    h.current.handleInputChange("initialTopPlayerIsPlayer1", true);
    h.render();
    h.current.handleFileContinue();
    h.render();
    await h.current.handleCreateMatch();
    h.render();
    // The harness stubs no video submission, so the processing-job step after
    // the match write logs and stops — the match write is what is pinned.

    const methods = h.queryCalls.map((c) => c.method);
    expect(methods).not.toContain("insert");
    const update = methods.indexOf("update");
    expect(update).toBeGreaterThan(-1);
    expect(h.queryCalls[update - 1]).toEqual({
      method: "from",
      args: ["matches"],
    });
    expect(h.queryCalls[update + 1]).toEqual({
      method: "eq",
      args: ["id", "M"],
    });
    // The draft is spent once its match carries the work.
    expect(h.draftDeletes).toContain("draft-m");
  });
});
