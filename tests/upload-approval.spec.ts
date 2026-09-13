import { expect, test } from "@playwright/test";

import { wizardContinueBlocked } from "@/components/dashboard/matches/new-match-wizard/validation";
import { PENDING_APPROVAL_NOTICE } from "@/lib/workspace/upload-eligibility";
import type { EventPreset } from "@/components/dashboard/matches/new-match-wizard/types";
import { uploadWizardHarness } from "./fixtures/upload-wizard-hook";

/**
 * T13 — the pending-approval notice at every entry, and the eligibility
 * re-checks around it.
 *
 * `uploadEligibility()` (T11) and `wizardUploadEligibility()` (T12) already
 * decide the rule; this file proves the WIZARD surfaces it the same way from
 * three different code paths (fresh Source, a preset opening on the file
 * step, and a resumed draft doing the same), that Continue is disabled by
 * the identical value the footer button and the keyboard both read
 * (`wizardContinueBlocked`), and that the two re-reads T13 adds — a live
 * `programs.status` fetch on submit, and a manual Retry for a lookup that
 * failed — behave as `subject-eligibility.ts` documents: retryable refusals
 * ask again without unlocking anything, and a decided refusal does not
 * change because the button was pressed again.
 *
 * Runs entirely through `uploadWizardHarness` (`tests/fixtures/upload-wizard-
 * hook.ts`), which executes the real hook's source in a small VM with no
 * DOM and no network — this whole file is keyless `npm test`.
 */

function preset(overrides: Partial<EventPreset> = {}): EventPreset {
  return {
    entryId: "entry-1",
    eventId: "event-1",
    eventName: "Westfield vs Meridian",
    matchId: null,
    round: "S1",
    playerName: "Player athlete",
    playerUserId: "athlete",
    opponentName: "Kim Park",
    date: "2026-09-10",
    surface: "hard",
    bestOf: 3,
    adScoring: true,
    score: null,
    supportsVideo: true,
    eventHref: "/dashboard/team/schedule/event-1",
    site: "home",
    eventKind: "dual",
    opponentProgramKey: null,
    opponentSchool: null,
    ...overrides,
  };
}

/**
 * The footer's own composition (`UploadMatchFlow.tsx`'s
 * `eligibilityNoticeVisible`/`continueDisabled`), rebuilt here from the
 * hook's `eligibility` so a hook-level test can assert the SAME thing the
 * component renders, without mounting it.
 */
function continueBlockedFor(
  step: "provider" | "file",
  eligibility: { ok: boolean; reason?: string },
): boolean {
  const eligibilityBlocked =
    !eligibility.ok && eligibility.reason !== "athlete-required";
  return wizardContinueBlocked({
    step,
    busy: false,
    missingMatchAnswers: false,
    importIdentityBlocked: false,
    eligibilityBlocked,
  });
}

test.describe("T13 — pending approval at every entry", () => {
  test("fresh Source: the provider step refuses, Continue is blocked, and the click handler no-ops", async () => {
    const h = uploadWizardHarness({
      team: true,
      workspace: { programStatus: "claim_pending" },
    });
    await h.flush();
    h.current.whoPlayed.choose({
      kind: "roster",
      playerId: "athlete",
      name: "Player athlete",
    });
    h.render();

    expect(h.current.step).toBe("provider");
    expect(h.current.eligibility).toMatchObject({
      ok: false,
      reason: "pending-approval",
      message: PENDING_APPROVAL_NOTICE,
      retryable: false,
    });
    expect(continueBlockedFor("provider", h.current.eligibility)).toBe(true);

    h.current.handleProviderContinue();
    h.render();
    expect(h.current.step).toBe("provider");
    expect(h.current.error).toBe(PENDING_APPROVAL_NOTICE);
  });

  test("preset File: a line opens straight on step 2, already refused", async () => {
    const h = uploadWizardHarness({
      team: true,
      workspace: { programStatus: "claim_pending" },
      props: { preset: preset() },
    });
    await h.flush();

    expect(h.current.step).toBe("file");
    expect(h.current.eligibility).toMatchObject({
      ok: false,
      reason: "pending-approval",
      message: PENDING_APPROVAL_NOTICE,
    });
    expect(continueBlockedFor("file", h.current.eligibility)).toBe(true);

    h.current.handleFileContinue();
    h.render();
    expect(h.current.step).toBe("file");
  });

  test("resumed File: a draft carrying a preset also opens on step 2, already refused", async () => {
    // `UploadMatchFlow` (the component, not the hook) resolves its `preset`
    // state as `initialPreset ?? draft?.preset ?? null` and hands THAT to the
    // hook alongside `draft` — so a resumed line arrives at the hook as both
    // props at once, never `draft.preset` alone. Mirrored here rather than
    // asserted against the hook in isolation, so this test fails if that
    // resolution ever moves.
    const linePreset = preset();
    const h = uploadWizardHarness({
      team: true,
      workspace: { programStatus: "claim_pending" },
      props: {
        preset: linePreset,
        draft: {
          id: "draft-1",
          provider: "swing-vision",
          formData: {},
          attachedLine: null,
          preset: linePreset,
        } as never,
      },
    });
    await h.flush();

    expect(h.current.step).toBe("file");
    expect(h.current.eligibility).toMatchObject({
      ok: false,
      reason: "pending-approval",
      message: PENDING_APPROVAL_NOTICE,
    });
    expect(continueBlockedFor("file", h.current.eligibility)).toBe(true);
  });

  test("an athlete simply not chosen yet is not the eligibility notice's job", () => {
    // Step 1's own picker is the explanation for `athlete-required` — the
    // eligibility banner would just repeat it. This is the one refusal
    // `eligibilityNoticeVisible` excludes on purpose.
    const eligibility = { ok: false as const, reason: "athlete-required" };
    const eligibilityBlocked =
      !eligibility.ok && eligibility.reason !== "athlete-required";
    expect(eligibilityBlocked).toBe(false);
  });
});

test.describe("T13 — Continue disabled shares one value with the keyboard", () => {
  test("the same eligibilityBlocked composes with T7's and T10's gates rather than replacing them", () => {
    const base = {
      step: "file" as const,
      busy: false,
      missingMatchAnswers: false,
      importIdentityBlocked: false,
      eligibilityBlocked: false,
    };
    expect(wizardContinueBlocked(base)).toBe(false);
    // Eligibility alone blocks.
    expect(wizardContinueBlocked({ ...base, eligibilityBlocked: true })).toBe(
      true,
    );
    // Blocked for two reasons at once is still just blocked — one boolean,
    // not two competing ones a caller has to reconcile.
    expect(
      wizardContinueBlocked({
        ...base,
        eligibilityBlocked: true,
        importIdentityBlocked: true,
      }),
    ).toBe(true);
    // Busy still wins regardless (T7's own precedent).
    expect(
      wizardContinueBlocked({ ...base, busy: true, eligibilityBlocked: false }),
    ).toBe(true);
    // The match step's own gate (T12) is untouched by this one.
    expect(
      wizardContinueBlocked({
        ...base,
        step: "match",
        missingMatchAnswers: true,
        eligibilityBlocked: false,
      }),
    ).toBe(true);
  });
});

test.describe("T13 — retry and submit both re-read, without unlocking a decided refusal", () => {
  test("a roster load failure is retryable; retrying re-fetches without unlocking Continue on its own", async () => {
    const h = uploadWizardHarness({ team: true, rosterError: "boom" });
    await h.flush();
    h.current.whoPlayed.choose({
      kind: "roster",
      playerId: "athlete",
      name: "Player athlete",
    });
    h.render();

    expect(h.current.whoPlayed.loadFailed).toBe(true);
    expect(h.current.eligibility).toMatchObject({
      ok: false,
      reason: "roster-unknown",
      retryable: true,
    });
    expect(continueBlockedFor("provider", h.current.eligibility)).toBe(true);
    const attemptsBefore = h.rosterRpcCallCount;

    // Retry re-asks the roster (`reloadRoster()`) rather than just flipping a
    // flag: the fixture's `program_roster_full` always fails here (it has no
    // notion of "the second call succeeds"), so the honest assertion is that
    // a fresh fetch actually happened — not that failure magically clears.
    // Nothing about pressing Retry unlocks Continue by itself; only a roster
    // that comes back and carries the pick would.
    h.current.retryEligibility();
    await h.flush();
    expect(h.rosterRpcCallCount).toBe(attemptsBefore + 1);
    expect(h.current.whoPlayed.loadFailed).toBe(true);
    expect(h.current.eligibility).toMatchObject({
      ok: false,
      reason: "roster-unknown",
      retryable: true,
    });
    expect(continueBlockedFor("provider", h.current.eligibility)).toBe(true);
  });

  test("a decided pending-approval refusal is not retryable, and retrying it is a no-op", async () => {
    const h = uploadWizardHarness({
      team: true,
      workspace: { programStatus: "claim_pending" },
    });
    await h.flush();
    h.current.whoPlayed.choose({
      kind: "roster",
      playerId: "athlete",
      name: "Player athlete",
    });
    h.render();
    expect(h.current.eligibility).toMatchObject({
      ok: false,
      reason: "pending-approval",
      retryable: false,
    });

    const callsBefore = h.programStatusCallCount;
    h.current.retryEligibility();
    h.render();
    // Not retryable, so `retryEligibility()` never re-reads the approval —
    // asking again would not change a decided "no".
    expect(h.programStatusCallCount).toBe(callsBefore);
    expect(h.current.eligibility).toMatchObject({
      ok: false,
      reason: "pending-approval",
    });
  });

  test("submitting re-reads approval fresh: an approval granted while the tab sat open unblocks the write", async () => {
    const h = uploadWizardHarness({
      team: true,
      workspace: { programStatus: "claim_pending" },
      // The workspace's own reading is stale ("claim_pending"); the live
      // re-read on submit says the claim has since settled.
      programStatusReads: ["active"],
    });
    await h.flush();
    h.current.whoPlayed.choose({
      kind: "roster",
      playerId: "athlete",
      name: "Player athlete",
    });
    h.render();
    // The memo still trusts the workspace's own stale reading until
    // something re-reads it.
    expect(h.current.eligibility).toMatchObject({
      ok: false,
      reason: "pending-approval",
    });

    const file = await h.pick("match.csv");
    file.resolve({
      success: true,
      warnings: [],
      data: {
        playerName: "Player athlete",
        opponentName: "Casey Opponent",
        playerScores: [6],
        opponentScores: [4],
        bestOf: "3",
        adScoring: true,
      },
    });
    await h.flush();
    h.current.handleInputChange("playerHand", "right");
    h.current.handleInputChange("playerBackhand", "two-handed");
    h.current.handleInputChange("opponentHand", "left");
    h.current.handleInputChange("opponentBackhand", "one-handed");
    h.render();

    await h.current.handleCreateMatch();
    h.render();
    // The write went through: the fresh read, not the stale memo, decided it.
    expect(h.writes.length).toBeGreaterThan(0);
  });

  test("submitting re-reads approval fresh: a suspension since page load stops the write, with the same sentence", async () => {
    const h = uploadWizardHarness({
      team: true,
      workspace: { programStatus: "active" },
      programStatusReads: ["suspended"],
    });
    await h.flush();
    h.current.whoPlayed.choose({
      kind: "roster",
      playerId: "athlete",
      name: "Player athlete",
    });
    h.render();
    // Nothing stale-looking yet: the memo still trusts the workspace's own
    // "active" reading, so Continue would not be disabled by eligibility.
    expect(h.current.eligibility.ok).toBe(true);

    const file = await h.pick("match.csv");
    file.resolve({
      success: true,
      warnings: [],
      data: {
        playerName: "Player athlete",
        opponentName: "Casey Opponent",
        playerScores: [6],
        opponentScores: [4],
        bestOf: "3",
        adScoring: true,
      },
    });
    await h.flush();
    h.current.handleInputChange("playerHand", "right");
    h.current.handleInputChange("playerBackhand", "two-handed");
    h.current.handleInputChange("opponentHand", "left");
    h.current.handleInputChange("opponentBackhand", "one-handed");
    h.render();

    await h.current.handleCreateMatch();
    h.render();
    expect(h.writes).toEqual([]);
  });
});

test.describe("T13 — an existing match's eligibility stays with its own workspace", () => {
  test("switching the active workspace mid-flow does not re-decide a reused match against it", async () => {
    // A preset naming an existing match (`matchId` set) is the "reuse a
    // scored line" case T15/T16 fixed server-side with
    // `billingWorkspaceFor(match.program_id)`. Team A is active; the preset
    // belongs to it.
    const linePreset = preset({ matchId: "existing-match-1" });
    const h = uploadWizardHarness({
      team: true,
      workspace: { id: "team-a", name: "Team A", programStatus: "active" },
      props: { preset: linePreset },
    });
    await h.flush();
    expect(h.current.eligibility.ok).toBe(true);
    const rosterCallsBefore = h.rosterRpcCallCount;

    // The workspace switcher (`setActiveWorkspaceInPlace`) changes
    // `activeWorkspace` on this same mounted page without navigating away.
    // Team B is pending — if eligibility read the live switcher instead of
    // the pinned match workspace, it would flip to a refusal immediately.
    h.workspace.active = {
      ...h.workspace.active,
      id: "team-b",
      name: "Team B",
      programStatus: "claim_pending",
    };
    h.render();
    await h.flush();

    expect(h.current.eligibility.ok).toBe(true);
    // The roster stayed pinned to team A's too — it was never re-fetched for
    // team B, which would otherwise check the preset's athlete against the
    // wrong program's roster.
    expect(h.rosterRpcCallCount).toBe(rosterCallsBefore);
  });

  test("once the existing match is no longer in play, eligibility follows the live workspace again", async () => {
    const linePreset = preset({ matchId: "existing-match-1" });
    const h = uploadWizardHarness({
      team: true,
      workspace: { id: "team-a", name: "Team A", programStatus: "active" },
      props: { preset: linePreset },
    });
    await h.flush();
    expect(h.current.eligibility.ok).toBe(true);

    // A fresh preset — no `matchId` — pins nothing: this is a NEW row, not
    // a reused one, so it may as well be recorded under whichever workspace
    // is live when it is finally created.
    h.props.preset = preset({ matchId: null });
    h.workspace.active = {
      ...h.workspace.active,
      id: "team-b",
      name: "Team B",
      programStatus: "claim_pending",
    };
    h.render();
    await h.flush();

    expect(h.current.eligibility).toMatchObject({
      ok: false,
      reason: "pending-approval",
    });
  });

  test("a second Continue during the fresh approval read cannot file the match twice", async () => {
    // Regression guard. `handleCreateMatch` awaits a fresh `programs.status`
    // read before it reaches `setIsCreating(true)`, so for the length of that
    // round trip the button is still enabled and gives no feedback. Without a
    // synchronous in-flight ref, a double-click re-enters the handler and —
    // both eligibility rechecks passing — writes two `matches` rows for the
    // same file and athlete. `isCreating` is state and cannot close this.
    const h = uploadWizardHarness({
      team: true,
      workspace: { programStatus: "active" },
      programStatusReads: ["active", "active"],
    });
    await h.flush();
    h.current.whoPlayed.choose({
      kind: "roster",
      playerId: "athlete",
      name: "Player athlete",
    });
    h.render();

    const file = await h.pick("match.csv");
    file.resolve({
      success: true,
      warnings: [],
      data: {
        playerName: "Player athlete",
        opponentName: "Casey Opponent",
        playerScores: [6],
        opponentScores: [4],
        bestOf: "3",
        adScoring: true,
      },
    });
    await h.flush();
    h.current.handleInputChange("playerHand", "right");
    h.current.handleInputChange("playerBackhand", "two-handed");
    h.current.handleInputChange("opponentHand", "left");
    h.current.handleInputChange("opponentBackhand", "one-handed");
    h.render();

    // Both clicks land before either settles — the shape of a double-click,
    // not two sequential submissions.
    const first = h.current.handleCreateMatch();
    const second = h.current.handleCreateMatch();
    await Promise.all([first, second]);
    h.render();

    expect(h.writes.length).toBe(1);
  });
});
