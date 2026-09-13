import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

import {
  draftBelongsToWorkspace,
  draftWorkspaceRefusal,
} from "@/components/dashboard/matches/new-match-wizard/subject-eligibility";
import { uploadWizardHarness } from "./fixtures/upload-wizard-hook";

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
    const flow = source(`${WIZARD}/UploadMatchFlow.tsx`);
    const body = flow.slice(
      flow.indexOf("const handleSaveDraft"),
      flow.indexOf("const onDragOver"),
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
    const flow = source(`${WIZARD}/UploadMatchFlow.tsx`);
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
    // The preset is seeded from `draft?.preset` before the hook ever runs, so
    // a half-refused draft would still pin a line bar from the wrong program.
    // `draftRefusal` is a sentence only — it can carry no draft state.
    expect(flow).toContain("draftRefusal?: string | null;");
    expect(flow).toContain("draftRefusal: string | null;");
    expect(flow).toContain("<FlowNotice>{draftRefusal}</FlowNotice>");
  });
});
