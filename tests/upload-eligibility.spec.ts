import { expect, test } from "@playwright/test";

import {
  canSubmitVideo,
  programStatusFor,
  type ClaimStatus,
} from "@/lib/services/programs/claim-state";
import {
  LINE_REQUIRES_STAFF_REFUSAL,
  PENDING_APPROVAL_NOTICE,
  ownRosterIdentity,
  uploadEligibility,
  type RosterIdentity,
  type UploadEligibility,
  type UploadIneligibilityReason,
} from "@/lib/workspace/upload-eligibility";
import {
  canUploadForProgram,
  explainVideoRefusal,
  NO_BILLING_WORKSPACE_REFUSAL,
  type ProgramRole,
  type UploadPolicy,
  type Workspace,
} from "@/lib/workspace/types";

/**
 * `uploadEligibility()` as a fixture table. Pure, so every arrangement the
 * plan names — claim_pending, an active objection window, suspended, an
 * owner with and without a player profile, the player switches, a scheduled
 * line — is one object literal and one expectation, with no database and no
 * browser. A wrong cell here is a coach refused their own program or a
 * pending program taking an upload it must not.
 */

const VIEWER = "u-viewer";

function team(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: "p-westfield",
    kind: "team",
    name: "Westfield University",
    team: "mens",
    orgType: "college",
    timeZone: "UTC",
    role: "coach",
    mark: "W",
    canSubmitVideo: true,
    programStatus: "active",
    playersCanUpload: true,
    uploadPolicy: "everyone",
    eventsPolicy: "staff",
    memberUploadEnabled: true,
    myPlayerId: null,
    ...overrides,
  };
}

function personal(): Workspace {
  return {
    id: VIEWER,
    kind: "personal",
    name: "Personal",
    team: null,
    orgType: null,
    timeZone: "UTC",
    role: "owner",
    mark: "V",
    canSubmitVideo: true,
    programStatus: null,
    playersCanUpload: false,
    uploadPolicy: "everyone",
    eventsPolicy: "staff",
    memberUploadEnabled: true,
    myPlayerId: null,
  };
}

/**
 * Three eras of roster row, as `rosterPlayerOptions()` shapes them: a claimed
 * profile (login bound), a coach-managed one (no login), and a player-role
 * member with no profile row, whose login id doubles as their player id
 * (arm 3 of `program_roster_full`). Staff are NOT rows — that function's
 * player arm filters them out, and so must any list handed to this decision.
 */
const AVA: RosterIdentity = { playerId: "pp-ava", userId: "u-ava" };
const BEN: RosterIdentity = { playerId: "pp-ben", userId: null };
const CAM: RosterIdentity = { playerId: "u-cam", userId: "u-cam" };
const ROSTER: readonly RosterIdentity[] = [AVA, BEN, CAM];

const pick = (playerId: string) => ({ kind: "roster" as const, playerId });

function refused(
  result: UploadEligibility | WizardEligibility,
): Extract<UploadEligibility, { ok: false }> {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("unreachable");
  return result;
}

function passed(
  result: UploadEligibility,
): Extract<UploadEligibility, { ok: true }> {
  expect(result.ok, result.ok ? "" : result.message).toBe(true);
  if (!result.ok) throw new Error("unreachable");
  return result;
}

// ─── 1. Each reason is one arrangement; nothing unknown passes ──────────────

test.describe("a reasoned result", () => {
  const cases: {
    name: string;
    input: Parameters<typeof uploadEligibility>[0];
    reason: UploadIneligibilityReason;
    retryable: boolean;
    message?: string | RegExp;
  }[] = [
    {
      name: "no such workspace for this viewer",
      input: {
        workspace: undefined,
        viewerId: VIEWER,
        athlete: pick("pp-ava"),
        roster: ROSTER,
      },
      reason: "workspace-unavailable",
      retryable: false,
      message: NO_BILLING_WORKSPACE_REFUSAL,
    },
    {
      name: "a status re-read that failed",
      input: {
        workspace: team(),
        approval: "unknown",
        viewerId: VIEWER,
        athlete: pick("pp-ava"),
        roster: ROSTER,
      },
      reason: "approval-unknown",
      retryable: true,
    },
    {
      name: "a team workspace that never resolved its status",
      input: {
        workspace: team({ programStatus: null }),
        viewerId: VIEWER,
        athlete: pick("pp-ava"),
        roster: ROSTER,
      },
      reason: "approval-unknown",
      retryable: true,
    },
    {
      name: "a program waiting on its claim",
      input: {
        workspace: team({ programStatus: "claim_pending" }),
        viewerId: VIEWER,
        athlete: pick("pp-ava"),
        roster: ROSTER,
      },
      reason: "pending-approval",
      retryable: false,
      message: PENDING_APPROVAL_NOTICE,
    },
    {
      name: "a suspended program",
      input: {
        workspace: team({ programStatus: "suspended" }),
        viewerId: VIEWER,
        athlete: pick("pp-ava"),
        roster: ROSTER,
      },
      reason: "workspace-unavailable",
      retryable: false,
      message: /suspended/,
    },
    {
      name: "an unclaimed program the viewer somehow still belongs to",
      input: {
        workspace: team({ programStatus: "unclaimed" }),
        viewerId: VIEWER,
        athlete: pick("pp-ava"),
        roster: ROSTER,
      },
      reason: "workspace-unavailable",
      retryable: false,
    },
    {
      name: "a coach under an owner-only policy",
      input: {
        workspace: team({ uploadPolicy: "owner" }),
        viewerId: VIEWER,
        athlete: pick("pp-ava"),
        roster: ROSTER,
      },
      reason: "role-restricted",
      retryable: false,
      message: /owner only/,
    },
    {
      name: "a player attaching a scheduled line",
      input: {
        workspace: team({ role: "player", myPlayerId: "pp-ava" }),
        viewerId: "u-ava",
        athlete: pick("pp-ava"),
        roster: ROSTER,
        attachesToLine: true,
      },
      reason: "line-requires-staff",
      retryable: false,
      message: LINE_REQUIRES_STAFF_REFUSAL,
    },
    {
      name: "a roster that has not loaded",
      input: {
        workspace: team(),
        viewerId: VIEWER,
        athlete: pick("pp-ava"),
        roster: null,
      },
      reason: "roster-unknown",
      retryable: true,
    },
    {
      name: "a team match with nobody chosen",
      input: {
        workspace: team(),
        viewerId: VIEWER,
        athlete: null,
        roster: ROSTER,
      },
      reason: "athlete-required",
      retryable: false,
    },
    {
      name: "a team match for someone off the roster",
      input: {
        workspace: team(),
        viewerId: VIEWER,
        athlete: pick("pp-stranger"),
        roster: ROSTER,
      },
      reason: "athlete-not-on-roster",
      retryable: false,
    },
    {
      name: "a roster athlete in a personal workspace",
      input: {
        workspace: personal(),
        viewerId: VIEWER,
        athlete: pick("pp-ava"),
        roster: ROSTER,
      },
      reason: "athlete-not-personal",
      retryable: false,
    },
  ];

  for (const c of cases) {
    test(`${c.name} → ${c.reason}${c.retryable ? " (retryable)" : ""}`, () => {
      const result = refused(uploadEligibility(c.input));
      expect(result.reason).toBe(c.reason);
      expect(result.retryable).toBe(c.retryable);
      expect(result.message.length).toBeGreaterThan(0);
      if (typeof c.message === "string") {
        expect(result.message).toBe(c.message);
      } else if (c.message) {
        expect(result.message).toMatch(c.message);
      }
    });
  }

  test("the table names every reason the contract can return", () => {
    const seen = new Set(cases.map((c) => c.reason));
    const all: UploadIneligibilityReason[] = [
      "workspace-unavailable",
      "approval-unknown",
      "pending-approval",
      "role-restricted",
      "line-requires-staff",
      "roster-unknown",
      "athlete-required",
      "athlete-not-on-roster",
      "athlete-not-personal",
    ];
    for (const reason of all) expect(seen.has(reason)).toBe(true);
  });

  test("only the two unknown states are retryable", () => {
    const retryable = new Set(
      cases.filter((c) => c.retryable).map((c) => c.reason),
    );
    expect([...retryable].sort()).toEqual([
      "approval-unknown",
      "roster-unknown",
    ]);
  });

  test("a fresher reading overrides the workspace's own, in both directions", () => {
    // A claim reopened since the page loaded: stale-active, fresh-pending.
    expect(
      refused(
        uploadEligibility({
          workspace: team({ programStatus: "active" }),
          approval: "claim_pending",
          viewerId: VIEWER,
          athlete: pick("pp-ava"),
          roster: ROSTER,
        }),
      ).reason,
    ).toBe("pending-approval");

    // Approved while the wizard sat open: stale-pending, fresh-active.
    passed(
      uploadEligibility({
        workspace: team({ programStatus: "claim_pending" }),
        approval: "active",
        viewerId: VIEWER,
        athlete: pick("pp-ava"),
        roster: ROSTER,
      }),
    );
  });
});

// ─── 2. Objection window is eligible; claim_pending is blocked ───────────────

test.describe("claim state, reused rather than recomputed", () => {
  test("programStatusFor() is the mapping this decision trusts", () => {
    // A recorded-contact claim goes straight to `objection_window` and is
    // usable at once; an unmatched one waits in `pending_review`. The claim
    // machine already says so — this asserts the reuse, not a second rule.
    const active: ClaimStatus[] = ["objection_window", "approved"];
    const pending: ClaimStatus[] = ["pending_email", "pending_review"];
    for (const claim of active) {
      expect(programStatusFor(claim)).toBe("active");
      expect(canSubmitVideo(claim)).toBe(true);
    }
    for (const claim of pending) {
      expect(programStatusFor(claim)).toBe("claim_pending");
      expect(canSubmitVideo(claim)).toBe(false);
    }
  });

  test("a coach of a program in its objection window may record a roster player's match", () => {
    const result = passed(
      uploadEligibility({
        workspace: team({
          programStatus: programStatusFor("objection_window"),
        }),
        viewerId: VIEWER,
        athlete: pick("pp-ava"),
        roster: ROSTER,
      }),
    );
    expect(result.athlete).toEqual({ kind: "roster", playerId: "pp-ava" });
  });

  test("…subject to existing policy: the ladder still applies in the window", () => {
    expect(
      refused(
        uploadEligibility({
          workspace: team({
            programStatus: programStatusFor("objection_window"),
            role: "staff",
            uploadPolicy: "owner_coaches",
          }),
          viewerId: VIEWER,
          athlete: pick("pp-ava"),
          roster: ROSTER,
        }),
      ).reason,
    ).toBe("role-restricted");
  });

  test("claim_pending blocks the owner too, before any other question is asked", () => {
    const result = refused(
      uploadEligibility({
        workspace: team({
          programStatus: programStatusFor("pending_review"),
          role: "owner",
        }),
        viewerId: VIEWER,
        // Everything else is wrong as well; approval must be what is named.
        athlete: null,
        roster: null,
        attachesToLine: true,
      }),
    );
    expect(result.reason).toBe("pending-approval");
    expect(result.message).toBe(PENDING_APPROVAL_NOTICE);
  });
});

// ─── 3. Ownership supplies no athlete; a real profile does ───────────────────

test.describe("an owner and the athlete", () => {
  const OWNER = "u-owner";
  const owner = () => team({ role: "owner", myPlayerId: null });

  test("without a player profile, cannot be the athlete", () => {
    expect(
      refused(
        uploadEligibility({
          workspace: owner(),
          viewerId: OWNER,
          athlete: { kind: "self" },
          roster: ROSTER,
        }),
      ).reason,
    ).toBe("athlete-required");

    // Nor by naming their own login as if it were a roster id.
    expect(
      refused(
        uploadEligibility({
          workspace: owner(),
          viewerId: OWNER,
          athlete: pick(OWNER),
          roster: ROSTER,
        }),
      ).reason,
    ).toBe("athlete-not-on-roster");

    // And there is no own row to offer them.
    expect(ownRosterIdentity(ROSTER, OWNER, null)).toBeNull();
  });

  test("with a genuine player profile on the roster, may select it explicitly", () => {
    const ownProfile: RosterIdentity = { playerId: "pp-owner", userId: OWNER };
    const roster = [...ROSTER, ownProfile];

    // The option exists because the profile is on the roster…
    expect(ownRosterIdentity(roster, OWNER, null)).toBe(ownProfile);

    // …and choosing it passes through the ordinary roster path.
    const result = passed(
      uploadEligibility({
        workspace: owner(),
        viewerId: OWNER,
        athlete: pick("pp-owner"),
        roster,
      }),
    );
    expect(result.athlete).toEqual({ kind: "roster", playerId: "pp-owner" });
  });

  test("still cannot record a teammate's match as their own login", () => {
    // Even holding a profile, `self` is not an athlete in a team workspace.
    const roster = [...ROSTER, { playerId: "pp-owner", userId: OWNER }];
    expect(
      refused(
        uploadEligibility({
          workspace: owner(),
          viewerId: OWNER,
          athlete: { kind: "self" },
          roster,
        }),
      ).reason,
    ).toBe("athlete-required");
  });

  test("a staff login never passes as an athlete, whatever the trigger accepts", () => {
    // `matches_block_client_regraft` admits any `program_members.user_id`
    // as `player1_id`, coaches included. This decision does not.
    expect(
      refused(
        uploadEligibility({
          workspace: team({ role: "coach" }),
          viewerId: "u-coach",
          athlete: pick("u-coach"),
          roster: ROSTER,
        }),
      ).reason,
    ).toBe("athlete-not-on-roster");
  });

  test("the result echoes the chosen player, never a substitute", () => {
    for (const row of ROSTER) {
      const result = passed(
        uploadEligibility({
          workspace: team(),
          viewerId: VIEWER,
          athlete: pick(row.playerId),
          roster: ROSTER,
        }),
      );
      expect(result.athlete).toEqual({
        kind: "roster",
        playerId: row.playerId,
      });
    }
  });

  test("a claimed player's login id resolves to their profile id; an unbound login does not", () => {
    // The older id era on the same person.
    expect(
      passed(
        uploadEligibility({
          workspace: team(),
          viewerId: VIEWER,
          athlete: pick("u-ava"),
          roster: ROSTER,
        }),
      ).athlete,
    ).toEqual({ kind: "roster", playerId: "pp-ava" });

    // Ben is coach-managed: no login is bound, so no login id names him.
    expect(
      refused(
        uploadEligibility({
          workspace: team(),
          viewerId: VIEWER,
          athlete: pick("u-ben"),
          roster: ROSTER,
        }),
      ).reason,
    ).toBe("athlete-not-on-roster");
  });
});

// ─── 4. Defined behaviours retained ──────────────────────────────────────────

test.describe("personal uploads", () => {
  test("the uploader is the athlete, chosen or not", () => {
    for (const athlete of [null, { kind: "self" as const }]) {
      const result = passed(
        uploadEligibility({
          workspace: personal(),
          viewerId: VIEWER,
          athlete,
          roster: null,
        }),
      );
      expect(result.athlete).toEqual({ kind: "self", userId: VIEWER });
    }
  });

  test("approval and roster are never consulted", () => {
    passed(
      uploadEligibility({
        workspace: personal(),
        approval: "unknown",
        viewerId: VIEWER,
        athlete: null,
        roster: undefined,
      }),
    );
  });

  test("a scheduled line is refused — lines belong to programs", () => {
    expect(
      refused(
        uploadEligibility({
          workspace: personal(),
          viewerId: VIEWER,
          athlete: null,
          roster: null,
          attachesToLine: true,
        }),
      ).reason,
    ).toBe("line-requires-staff");
  });
});

test.describe("player upload flags", () => {
  // A player recording their own match: the athlete is their own roster row.
  const player = (uploadPolicy: UploadPolicy, memberUploadEnabled: boolean) =>
    uploadEligibility({
      workspace: team({
        role: "player",
        uploadPolicy,
        memberUploadEnabled,
        playersCanUpload: uploadPolicy === "everyone",
        myPlayerId: "pp-ava",
      }),
      viewerId: "u-ava",
      athlete: pick("pp-ava"),
      roster: ROSTER,
    });

  test("both switches on: may record their own match", () => {
    expect(passed(player("everyone", true)).athlete).toEqual({
      kind: "roster",
      playerId: "pp-ava",
    });
  });

  test("own switch off: refused, and told which switch", () => {
    const result = refused(player("everyone", false));
    expect(result.reason).toBe("role-restricted");
    expect(result.message).toMatch(/Can send video/);
  });

  test("policy above players: refused, and told who can widen it", () => {
    const result = refused(player("staff", true));
    expect(result.reason).toBe("role-restricted");
    expect(result.message).toMatch(/all staff/);
    expect(result.message).toMatch(/A coach can record it/);
  });

  test("a player finds their own row to pick", () => {
    expect(ownRosterIdentity(ROSTER, "u-ava", "pp-ava")).toBe(AVA);
    // Arm 3: no profile row, so the workspace resolved their login as the id.
    expect(ownRosterIdentity(ROSTER, "u-cam", "u-cam")).toBe(CAM);
    expect(ownRosterIdentity(null, "u-ava", "pp-ava")).toBeNull();
  });

  test("the role half is canUploadForProgram(), cell for cell", () => {
    const roles: ProgramRole[] = ["owner", "coach", "staff", "player"];
    const policies: UploadPolicy[] = [
      "owner",
      "owner_coaches",
      "staff",
      "everyone",
    ];
    for (const role of roles) {
      for (const uploadPolicy of policies) {
        for (const memberUploadEnabled of [true, false]) {
          const workspace = team({ role, uploadPolicy, memberUploadEnabled });
          const result = uploadEligibility({
            workspace,
            viewerId: VIEWER,
            athlete: pick("pp-ava"),
            roster: ROSTER,
          });
          const admitted = canUploadForProgram(workspace);
          expect(
            result.ok,
            `${role} under ${uploadPolicy} (switch ${memberUploadEnabled})`,
          ).toBe(admitted);
          if (!result.ok) expect(result.reason).toBe("role-restricted");
        }
      }
    }
  });
});

test.describe("suspended states", () => {
  test("block everyone, the owner included, and are not 'awaiting approval'", () => {
    const result = refused(
      uploadEligibility({
        workspace: team({ programStatus: "suspended", role: "owner" }),
        viewerId: VIEWER,
        athlete: pick("pp-ava"),
        roster: ROSTER,
      }),
    );
    expect(result.reason).toBe("workspace-unavailable");
    expect(result.message).not.toBe(PENDING_APPROVAL_NOTICE);
    expect(result.retryable).toBe(false);
  });

  test("a suspension read fresh overrides a workspace resolved before it", () => {
    expect(
      refused(
        uploadEligibility({
          workspace: team({ programStatus: "active" }),
          approval: "suspended",
          viewerId: VIEWER,
          athlete: pick("pp-ava"),
          roster: ROSTER,
        }),
      ).reason,
    ).toBe("workspace-unavailable");
  });
});

test.describe("staff scheduled-line rules", () => {
  const line = (role: ProgramRole) =>
    uploadEligibility({
      workspace: team({ role }),
      viewerId: VIEWER,
      athlete: pick("pp-ava"),
      roster: ROSTER,
      attachesToLine: true,
    });

  test("staff attach lines", () => {
    for (const role of ["owner", "coach", "staff"] as const) {
      passed(line(role));
    }
  });

  test("a player does not, however the upload switches are set", () => {
    const result = refused(line("player"));
    expect(result.reason).toBe("line-requires-staff");
    expect(result.message).toBe(LINE_REQUIRES_STAFF_REFUSAL);
  });

  test("a line changes nothing about who the athlete must be", () => {
    // Staff on a line still need a roster player; the line is not one.
    expect(
      refused(
        uploadEligibility({
          workspace: team({ role: "coach" }),
          viewerId: VIEWER,
          athlete: null,
          roster: ROSTER,
          attachesToLine: true,
        }),
      ).reason,
    ).toBe("athlete-required");
  });
});

// ─── 5. Video spending policy is a separate question ─────────────────────────

test.describe("separate from the video spending policy", () => {
  test("a pending program is refused here whatever the video seam says", () => {
    // No provider is an input to this decision; a pending program blocks an
    // import exactly as it blocks a video.
    const workspace = team({
      programStatus: "claim_pending",
      canSubmitVideo: false,
    });
    const result = refused(
      uploadEligibility({
        workspace,
        viewerId: VIEWER,
        athlete: pick("pp-ava"),
        roster: ROSTER,
      }),
    );
    expect(result.reason).toBe("pending-approval");

    // The video seam refuses too — its own sentence, its own question. Two
    // layers, and neither is a copy of the other.
    const video = explainVideoRefusal(workspace);
    expect(video).not.toBeNull();
    expect(video).not.toBe(result.message);
  });

  test("this decision reads programs.status, never canSubmitVideo", () => {
    // Contradictory on purpose — the two fields come from one column and
    // cannot disagree in real data. Here they do, to show which one each
    // layer reads: this one passes on the status…
    passed(
      uploadEligibility({
        workspace: team({ programStatus: "active", canSubmitVideo: false }),
        viewerId: VIEWER,
        athlete: pick("pp-ava"),
        roster: ROSTER,
      }),
    );
    // …and the video seam refuses on the boolean, as it always has.
    expect(
      explainVideoRefusal(
        team({ programStatus: "active", canSubmitVideo: false }),
      ),
    ).not.toBeNull();
  });

  test("the video seam does not know about approval; that is this seam's job", () => {
    // The mirror image: a coach whose video flag is open but whose program
    // is pending. `explainVideoRefusal()` has nothing to say — it never was
    // the provider-independent gate — and this decision refuses.
    const workspace = team({
      programStatus: "claim_pending",
      canSubmitVideo: true,
    });
    expect(explainVideoRefusal(workspace)).toBeNull();
    expect(
      refused(
        uploadEligibility({
          workspace,
          viewerId: VIEWER,
          athlete: pick("pp-ava"),
          roster: ROSTER,
        }),
      ).reason,
    ).toBe("pending-approval");
  });

  test("an eligible result carries an attribution and nothing about minutes", () => {
    const result = passed(
      uploadEligibility({
        workspace: team(),
        viewerId: VIEWER,
        athlete: pick("pp-ava"),
        roster: ROSTER,
      }),
    );
    expect(Object.keys(result).sort()).toEqual(["athlete", "ok"]);
  });
});

// ─── 6. The wizard's wiring (T12) ─────────────────────────────────────────────
//
// `subject-eligibility.ts` is how `useUploadMatchWizard` puts its own state in
// front of this decision and reads the answer back. Pure, so the arrangements
// the task names — an owner's own profile, a pending team, a subject from the
// wrong workspace, an archived or merged profile, a stale preset, a resumed
// draft with no subject — are fixtures here rather than a browser session.
// The property every case below shares: no path resolves to the viewer's
// login in a team workspace, whatever is missing.

import {
  draftResumeStep,
  eligibleRosterOptions,
  identityAthleteFor,
  rosterSubjectOrNull,
  wizardAthleteChoice,
  wizardUploadEligibility,
  type MatchSubject,
  type WizardEligibility,
} from "@/components/dashboard/matches/new-match-wizard/subject-eligibility";
import { buildImportIdentityConfirmationKey } from "@/components/dashboard/matches/new-match-wizard/validation";
import type { EventPreset } from "@/components/dashboard/matches/new-match-wizard/types";
import type { RosterFullRow } from "@/lib/data/roster-shared";

const OWNER = "u-owner";
const OWN_PROFILE = {
  id: "pp-owner",
  program_id: "p-westfield",
  first_name: "Dana",
  last_name: "Owner",
  email: "dana@westfield.edu",
  class_year: null,
  lineup_spot: 2,
  claimed_by_user_id: OWNER,
};

/** `program_roster_full`'s player arm, as the wizard reads it. */
const RPC_ROWS: RosterFullRow[] = [
  {
    player_id: "pp-ava",
    user_id: "u-ava",
    display_name: "Ava Lin",
    email: null,
    role: "player",
    lineup_spot: 1,
    managed_by: "self",
  },
  {
    player_id: "pp-ben",
    user_id: null,
    display_name: "Ben Cho",
    email: null,
    role: "player",
    lineup_spot: null,
    managed_by: "coach",
  },
  // A staff seat — arm 2. Dropped by the shared filter, as it always was.
  {
    player_id: OWNER,
    user_id: OWNER,
    display_name: "Dana Owner",
    email: null,
    role: "owner",
    lineup_spot: null,
    managed_by: "self",
  },
];

const rosterPick = (playerId: string, name = playerId): MatchSubject => ({
  kind: "roster",
  playerId,
  name,
});

function preset(overrides: Partial<EventPreset> = {}): EventPreset {
  return {
    entryId: "entry-1",
    eventId: "event-1",
    eventName: "Westfield vs Meridian",
    matchId: null,
    round: "S1",
    playerName: "Ava Lin",
    playerUserId: "pp-ava",
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

test.describe("wizard: the eligible roster offers an owner's own profile", () => {
  test("folds in the viewer's claimed profile when the RPC left it out", () => {
    // The live `program_roster_full` drops a profile claimed by staff, and
    // `Workspace.myPlayerId` is null for staff. Without the direct read an
    // owner who plays has no row of their own to pick.
    const roster = eligibleRosterOptions(
      RPC_ROWS,
      OWN_PROFILE,
      "p-westfield",
      OWNER,
    );
    const own = roster.find((row) => row.playerId === "pp-owner");
    expect(own).toBeDefined();
    expect(own?.userId).toBe(OWNER);
    expect(own?.managedBy).toBe("self");
    expect(own?.name).toBe("Dana Owner");
    // Ladder order still holds: Ava (1), Dana (2), then the unranked Ben.
    expect(roster.map((row) => row.playerId)).toEqual([
      "pp-ava",
      "pp-owner",
      "pp-ben",
    ]);
    // …and the picked row passes as a ROSTER choice, resolved to its
    // profile id — not because the picker is the owner.
    const result = wizardUploadEligibility({
      workspace: team({ role: "owner", id: "p-westfield" }),
      viewerId: OWNER,
      subject: rosterPick("pp-owner", "Dana Owner"),
      roster,
    });
    expect(result).toEqual({ ok: true, attribution: "pp-owner" });
  });

  test("never lists a staff login, with or without a profile", () => {
    const withoutProfile = eligibleRosterOptions(
      RPC_ROWS,
      null,
      "p-westfield",
      OWNER,
    );
    expect(withoutProfile.map((row) => row.playerId)).toEqual([
      "pp-ava",
      "pp-ben",
    ]);
    expect(withoutProfile.some((row) => row.playerId === OWNER)).toBe(false);
  });

  test("does not add the own row twice, nor another program's, nor someone else's", () => {
    const alreadyThere = eligibleRosterOptions(
      [
        ...RPC_ROWS,
        {
          player_id: "pp-owner",
          user_id: OWNER,
          display_name: "Dana Owner",
          email: null,
          role: "player",
          lineup_spot: 2,
          managed_by: "self",
        },
      ],
      OWN_PROFILE,
      "p-westfield",
      OWNER,
    );
    expect(
      alreadyThere.filter((row) => row.playerId === "pp-owner"),
    ).toHaveLength(1);

    const otherProgram = eligibleRosterOptions(
      RPC_ROWS,
      { ...OWN_PROFILE, program_id: "p-elsewhere" },
      "p-westfield",
      OWNER,
    );
    expect(otherProgram.some((row) => row.playerId === "pp-owner")).toBe(false);

    const someoneElse = eligibleRosterOptions(
      RPC_ROWS,
      { ...OWN_PROFILE, claimed_by_user_id: "u-other" },
      "p-westfield",
      OWNER,
    );
    expect(someoneElse.some((row) => row.playerId === "pp-owner")).toBe(false);
  });

  test("has no 'myself' answer in a team workspace", () => {
    // Nothing chosen is nothing chosen — not the uploader.
    expect(
      wizardAthleteChoice({
        workspace: team(),
        subject: null,
      }),
    ).toBeNull();
    // And a `self` that somehow arrives is passed through to be refused,
    // never rewritten into an id.
    const result = wizardUploadEligibility({
      workspace: team({ role: "owner" }),
      viewerId: OWNER,
      subject: { kind: "self" },
      roster: ROSTER,
    });
    expect(refused(result).reason).toBe("athlete-required");
    expect("attribution" in result).toBe(false);
  });
});

test.describe("wizard: handlers cannot progress a pending team or an invalid subject", () => {
  test("a pending team is refused with the approval notice, athlete or not", () => {
    const result = refused(
      wizardUploadEligibility({
        workspace: team({ programStatus: "claim_pending" }),
        viewerId: VIEWER,
        subject: rosterPick("pp-ava"),
        roster: ROSTER,
      }),
    );
    expect(result.reason).toBe("pending-approval");
    expect(result.message).toBe(PENDING_APPROVAL_NOTICE);
    expect(result.retryable).toBe(false);
  });

  test("a subject the roster does not carry is refused", () => {
    const result = refused(
      wizardUploadEligibility({
        workspace: team(),
        viewerId: VIEWER,
        subject: rosterPick("pp-stranger"),
        roster: ROSTER,
      }),
    );
    expect(result.reason).toBe("athlete-not-on-roster");
    expect(result.retryable).toBe(false);
  });

  test("a roster still loading, or failed, decides nothing — and passes nobody", () => {
    for (const roster of [undefined, null] as const) {
      const result = refused(
        wizardUploadEligibility({
          workspace: team(),
          viewerId: VIEWER,
          subject: rosterPick("pp-ava"),
          roster,
        }),
      );
      expect(result.reason).toBe("roster-unknown");
      expect(result.retryable).toBe(true);
    }
  });

  test("a restricted role is refused before the athlete is even read", () => {
    const result = refused(
      wizardUploadEligibility({
        workspace: team({ role: "player", memberUploadEnabled: false }),
        viewerId: VIEWER,
        subject: rosterPick("pp-ava"),
        roster: ROSTER,
      }),
    );
    expect(result.reason).toBe("role-restricted");
  });
});

test.describe("wizard: stale subjects return to selection, never to the uploader", () => {
  test("wrong workspace — a roster pick carried into a personal workspace", () => {
    const result = refused(
      wizardUploadEligibility({
        workspace: personal(),
        viewerId: VIEWER,
        subject: rosterPick("pp-ava"),
        roster: undefined,
      }),
    );
    expect(result.reason).toBe("athlete-not-personal");
    expect("attribution" in result).toBe(false);
  });

  test("archived or merged — the reloaded roster no longer names them", () => {
    // Ava chosen; then her profile is archived (or merged into another) and
    // the roster reloads without her. The subject clears; nothing takes its
    // place.
    const before = ROSTER;
    const after = ROSTER.filter((row) => row.playerId !== "pp-ava");
    const chosen = rosterPick("pp-ava", "Ava Lin");
    expect(rosterSubjectOrNull(chosen, before)).toBe(chosen);
    expect(rosterSubjectOrNull(chosen, after)).toBeNull();
    // A roster not yet loaded decides nothing: the pick stands to be checked.
    expect(rosterSubjectOrNull(chosen, null)).toBe(chosen);
    // `self` is on no roster.
    expect(rosterSubjectOrNull({ kind: "self" }, before)).toBeNull();
    // Both id eras name the same person.
    expect(rosterSubjectOrNull(rosterPick("u-ava"), before)).not.toBeNull();

    const result = refused(
      wizardUploadEligibility({
        workspace: team(),
        viewerId: VIEWER,
        subject: chosen,
        roster: after,
      }),
    );
    expect(result.reason).toBe("athlete-not-on-roster");
  });

  test("stale preset — a line whose player has left the roster", () => {
    const result = refused(
      wizardUploadEligibility({
        workspace: team({ role: "coach" }),
        viewerId: VIEWER,
        preset: preset({ playerUserId: "pp-archived" }),
        subject: null,
        roster: ROSTER,
      }),
    );
    expect(result.reason).toBe("athlete-not-on-roster");
    expect("attribution" in result).toBe(false);
  });

  test("a singles line with nobody assigned is not filed under nobody", () => {
    // The fix is assigning the line on the event, which owns that fact.
    const result = refused(
      wizardUploadEligibility({
        workspace: team({ role: "coach" }),
        viewerId: VIEWER,
        preset: preset({ playerUserId: null, playerName: "" }),
        subject: null,
        roster: ROSTER,
      }),
    );
    expect(result.reason).toBe("athlete-required");
  });

  test("missing draft subject — a team draft resumes on the picker", () => {
    // The who-played answer is not persisted with a draft, so a resumed team
    // draft lands where it is asked, not past it.
    expect(draftResumeStep(true)).toBe("provider");
    expect(draftResumeStep(false)).toBe("file");
    // And with nothing chosen, nothing passes.
    const result = refused(
      wizardUploadEligibility({
        workspace: team(),
        viewerId: VIEWER,
        subject: null,
        roster: ROSTER,
      }),
    );
    expect(result.reason).toBe("athlete-required");
  });

  test("no refusal carries an attribution, and no pass carries the viewer in a team", () => {
    const arrangements: Parameters<typeof wizardUploadEligibility>[0][] = [
      { workspace: team(), viewerId: VIEWER, subject: null, roster: ROSTER },
      {
        workspace: team(),
        viewerId: VIEWER,
        subject: { kind: "self" },
        roster: ROSTER,
      },
      {
        workspace: team(),
        viewerId: VIEWER,
        subject: rosterPick("pp-gone"),
        roster: ROSTER,
      },
      {
        workspace: team(),
        viewerId: VIEWER,
        subject: rosterPick("pp-ava"),
        roster: null,
      },
      {
        workspace: team({ programStatus: "claim_pending" }),
        viewerId: VIEWER,
        subject: rosterPick("pp-ava"),
        roster: ROSTER,
      },
      {
        workspace: team(),
        viewerId: VIEWER,
        preset: preset({ playerUserId: null, playerName: "" }),
        subject: null,
        roster: ROSTER,
      },
    ];
    for (const input of arrangements) {
      const result = wizardUploadEligibility(input);
      if (result.ok) {
        expect(result.attribution).not.toBe(VIEWER);
      } else {
        expect("attribution" in result).toBe(false);
      }
    }
  });
});

test.describe("wizard: a subject change invalidates the import confirmation", () => {
  const scope = (athlete: { id: string | null; name: string }) =>
    buildImportIdentityConfirmationKey({
      workspaceId: "team:p-westfield",
      athleteId: athlete.id,
      importedAthleteId: null,
      athleteName: athlete.name,
      importedName: "Ava Lin",
      fileGenerationId: "swingvision:1",
    });

  test("the key follows the chosen athlete, and holds no login while unchosen", () => {
    const workspace = team();
    const viewer = { id: VIEWER, name: "Casey Coach" };
    const ava = identityAthleteFor({
      workspace,
      viewer,
      subject: rosterPick("pp-ava", "Ava Lin"),
    });
    const ben = identityAthleteFor({
      workspace,
      viewer,
      subject: rosterPick("pp-ben", "Ben Cho"),
    });
    const nobody = identityAthleteFor({ workspace, viewer, subject: null });

    expect(scope(ava)).not.toBe(scope(ben));
    expect(nobody).toEqual({ id: null, name: "" });
    expect(scope(nobody)).not.toContain(VIEWER);

    // A preset's identity is the line's; a personal one is the viewer's.
    expect(
      identityAthleteFor({
        workspace,
        viewer,
        preset: preset(),
        subject: null,
      }),
    ).toEqual({ id: "pp-ava", name: "Ava Lin" });
    expect(
      identityAthleteFor({ workspace: personal(), viewer, subject: null }),
    ).toEqual({ id: VIEWER, name: "Casey Coach" });
  });
});

test.describe("wizard: active, authorized paths still pass", () => {
  test("a personal upload is the viewer's own", () => {
    expect(
      wizardUploadEligibility({
        workspace: personal(),
        viewerId: VIEWER,
        subject: null,
        roster: undefined,
      }),
    ).toEqual({ ok: true, attribution: VIEWER });
  });

  test("a coach picking a roster player, by either id era", () => {
    expect(
      wizardUploadEligibility({
        workspace: team({ role: "coach" }),
        viewerId: VIEWER,
        subject: rosterPick("pp-ava"),
        roster: ROSTER,
      }),
    ).toEqual({ ok: true, attribution: "pp-ava" });
    // A login-era id resolves to the profile id new rows carry.
    expect(
      wizardUploadEligibility({
        workspace: team({ role: "coach" }),
        viewerId: VIEWER,
        subject: rosterPick("u-ava"),
        roster: ROSTER,
      }),
    ).toEqual({ ok: true, attribution: "pp-ava" });
  });

  test("a player under an open policy with their own switch on, picking themself", () => {
    expect(
      wizardUploadEligibility({
        workspace: team({ role: "player", myPlayerId: "pp-ava" }),
        viewerId: "u-ava",
        subject: rosterPick("pp-ava"),
        roster: ROSTER,
      }),
    ).toEqual({ ok: true, attribution: "pp-ava" });
  });

  test("a staff preset on a live singles line, new row or fill", () => {
    const workspace = team({ role: "coach" });
    expect(
      wizardUploadEligibility({
        workspace,
        viewerId: VIEWER,
        preset: preset(),
        subject: null,
        roster: ROSTER,
        attachesToLine: true,
      }),
    ).toEqual({ ok: true, attribution: "pp-ava" });
    // A player may NOT attach a new row to a line, as the trigger says.
    expect(
      refused(
        wizardUploadEligibility({
          workspace: team({ role: "player", memberUploadEnabled: true }),
          viewerId: "u-ava",
          preset: preset(),
          subject: null,
          roster: ROSTER,
          attachesToLine: true,
        }),
      ).message,
    ).toBe(LINE_REQUIRES_STAFF_REFUSAL);
  });

  test("a doubles line names no single player and is filed under none", () => {
    // The one carve-out: two athletes on our side, `player1_id` names
    // neither, exactly as the wizard wrote it before — and NOT the coach.
    expect(
      wizardUploadEligibility({
        workspace: team({ role: "coach" }),
        viewerId: VIEWER,
        preset: preset({
          playerUserId: null,
          playerName: "Ava Lin / Ben Cho",
          supportsVideo: false,
        }),
        subject: null,
        roster: ROSTER,
      }),
    ).toEqual({ ok: true, attribution: null });
  });
});

// ─── 7. The wizard's handlers, through the real hook ─────────────────────────
//
// `uploadWizardHarness` runs the hook's source with deterministic hook slots
// and mocked IO. These check the HANDLERS — that a refusal from section 6
// actually stops Continue and Save match, that the picker's list is what the
// eligible roster says, and that the id which reaches the write is the one
// the decision resolved.

import {
  parsedNames,
  rosterRow,
  uploadWizardHarness,
} from "./fixtures/upload-wizard-hook";
import { DEFAULT_FORM_DATA } from "@/components/dashboard/matches/new-match-wizard/types";

/** Everything Save match needs besides the athlete and the file. */
function completeDetails(h: ReturnType<typeof uploadWizardHarness>) {
  h.current.handleInputChange("playerHand", "right");
  h.current.handleInputChange("playerBackhand", "two-handed");
  h.current.handleInputChange("opponentHand", "left");
  h.current.handleInputChange("opponentBackhand", "one-handed");
  h.render();
}

test.describe("wizard handlers: a pending team cannot progress or create", () => {
  test("Continue and Save match both stop, with the approval notice", async () => {
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
    expect(h.current.whoPlayed.subject?.kind).toBe("roster");
    expect(h.current.eligibility).toMatchObject({
      ok: false,
      reason: "pending-approval",
      message: PENDING_APPROVAL_NOTICE,
    });

    h.current.handleProviderContinue();
    h.render();
    expect(h.current.step).toBe("provider");
    expect(h.current.error).toBe(PENDING_APPROVAL_NOTICE);

    // Even called directly, the write does not happen.
    const file = await h.pick("match.csv");
    file.resolve(parsedNames("Player athlete"));
    await h.flush();
    completeDetails(h);
    await h.current.handleCreateMatch();
    h.render();
    expect(h.writes).toEqual([]);
    expect(h.winnerCalls).toEqual([]);
  });
});

test.describe("wizard handlers: only eligible roster subjects are offered or installed", () => {
  test("'self' is not an answer in a team workspace", async () => {
    const h = uploadWizardHarness({ team: true });
    await h.flush();
    h.current.whoPlayed.choose({ kind: "self" });
    h.render();
    expect(h.current.whoPlayed.subject).toBeNull();
    expect(h.current.eligibility).toMatchObject({
      ok: false,
      reason: "athlete-required",
    });
    h.current.handleProviderContinue();
    h.render();
    expect(h.current.step).toBe("provider");
  });

  test("a pick the loaded roster does not carry is ignored", async () => {
    const h = uploadWizardHarness({ team: true });
    await h.flush();
    h.current.whoPlayed.choose({
      kind: "roster",
      playerId: "stranger",
      name: "Not Here",
    });
    h.render();
    expect(h.current.whoPlayed.subject).toBeNull();
  });

  test("a seeded subject the roster no longer names returns to selection", async () => {
    const h = uploadWizardHarness({
      team: true,
      props: {
        initialSubject: { kind: "roster", playerId: "gone", name: "Gone" },
      },
    });
    // Before the roster lands the seed stands; once it has, nothing does.
    expect(h.current.whoPlayed.subject?.kind).toBe("roster");
    await h.flush();
    expect(h.current.whoPlayed.subject).toBeNull();
    h.current.handleProviderContinue();
    h.render();
    expect(h.current.step).toBe("provider");
  });

  test("the picker lists an owner's own profile, and it passes as a roster choice", async () => {
    const h = uploadWizardHarness({
      team: true,
      workspace: { role: "owner" },
      ownProfile: {
        id: "pp-owner",
        program_id: "team-a",
        first_name: "Riley",
        last_name: "Player",
        email: null,
        class_year: null,
        lineup_spot: null,
        claimed_by_user_id: "user",
      },
    });
    await h.flush();
    const own = h.current.whoPlayed.roster?.find(
      (row) => row.playerId === "pp-owner",
    );
    expect(own).toMatchObject({ userId: "user", managedBy: "self" });
    // And no row anywhere carries the login id as a player id.
    expect(
      h.current.whoPlayed.roster?.some((row) => row.playerId === "user"),
    ).toBe(false);

    h.current.whoPlayed.choose({
      kind: "roster",
      playerId: "pp-owner",
      name: "Riley Player",
    });
    h.render();
    expect(h.current.eligibility).toEqual({
      ok: true,
      attribution: "pp-owner",
    });
    h.current.handleProviderContinue();
    h.render();
    expect(h.current.step).toBe("file");
  });

  test("an owner with no profile has no row of their own, and no fallback", async () => {
    const h = uploadWizardHarness({
      team: true,
      workspace: { role: "owner" },
      roster: [rosterRow("athlete")],
    });
    await h.flush();
    expect(h.current.whoPlayed.roster?.map((row) => row.playerId)).toEqual([
      "athlete",
    ]);
    expect(h.current.eligibility).toMatchObject({
      ok: false,
      reason: "athlete-required",
    });
  });

  test("a roster that failed to load refuses, retryably, and is flagged", async () => {
    const h = uploadWizardHarness({ team: true, rosterError: "boom" });
    await h.flush();
    expect(h.current.whoPlayed.roster).toBeNull();
    expect(h.current.whoPlayed.loadFailed).toBe(true);
    // A pick before the list exists is allowed to stand…
    h.current.whoPlayed.choose({
      kind: "roster",
      playerId: "athlete",
      name: "Player athlete",
    });
    h.render();
    expect(h.current.eligibility).toMatchObject({
      ok: false,
      reason: "roster-unknown",
      retryable: true,
    });
    // …and Continue waits rather than errors: nothing has been decided.
    h.current.handleProviderContinue();
    h.render();
    expect(h.current.step).toBe("provider");
    expect(h.current.error).toBeNull();
  });
});

test.describe("wizard handlers: what reaches the write", () => {
  test("a team match carries the picked profile, never the uploader", async () => {
    const h = uploadWizardHarness({ team: true });
    await h.flush();
    h.current.whoPlayed.choose({
      kind: "roster",
      playerId: "athlete",
      name: "Player athlete",
    });
    h.render();
    h.current.handleProviderContinue();
    h.render();
    const file = await h.pick("match.csv");
    file.resolve(parsedNames("Player athlete"));
    await h.flush();
    completeDetails(h);
    h.current.handleFileContinue();
    h.render();
    expect(h.current.step).toBe("match");
    await h.current.handleCreateMatch();
    h.render();
    expect(h.writes).toHaveLength(1);
    expect(h.winnerCalls[0]?.[3]).toBe("athlete");
  });

  test("a personal match is the viewer's own", async () => {
    const h = uploadWizardHarness();
    await h.flush();
    h.current.handleProviderContinue();
    h.render();
    const file = await h.pick("match.csv");
    file.resolve(parsedNames("Riley Player"));
    await h.flush();
    completeDetails(h);
    h.current.handleFileContinue();
    h.render();
    await h.current.handleCreateMatch();
    h.render();
    expect(h.writes).toHaveLength(1);
    expect(h.winnerCalls[0]?.[3]).toBe("user");
  });
});

test.describe("wizard handlers: drafts and confirmations", () => {
  test("a team draft resumes on the picker; a personal one on the file step", async () => {
    const draft = {
      id: "draft-1",
      step: "match" as const,
      stepCount: 3,
      stepIndex: 2,
      provider: "swing-vision",
      formData: { ...DEFAULT_FORM_DATA, opponentName: "Casey Opponent" },
      fileName: "old.csv",
      preset: null,
      attachedLine: null,
      updatedAt: "2026-09-10T00:00:00.000Z",
    };
    const teamDraft = uploadWizardHarness({ team: true, props: { draft } });
    await teamDraft.flush();
    expect(teamDraft.current.step).toBe("provider");
    expect(teamDraft.current.whoPlayed.subject).toBeNull();
    // The draft's answers are still there — only the step returned.
    expect(teamDraft.current.formData.opponentName).toBe("Casey Opponent");

    const personalDraft = uploadWizardHarness({ props: { draft } });
    await personalDraft.flush();
    expect(personalDraft.current.step).toBe("file");
  });

  test("changing the subject drops an import confirmation", async () => {
    const h = uploadWizardHarness({ team: true });
    await h.flush();
    h.current.whoPlayed.choose({
      kind: "roster",
      playerId: "first",
      name: "First Player",
    });
    h.render();
    h.current.handleProviderContinue();
    h.render();
    const file = await h.pick("match.csv");
    file.resolve(parsedNames("F. Player"));
    await h.flush();
    expect(h.current.importIdentity.blocked).toBe(true);
    h.current.importIdentity.confirm();
    h.render();
    expect(h.current.importIdentity.confirmed).toBe(true);
    expect(h.current.importIdentity.blocked).toBe(false);

    h.current.whoPlayed.choose({
      kind: "roster",
      playerId: "second",
      name: "Second Player",
    });
    h.render();
    expect(h.current.whoPlayed.subject).toMatchObject({ playerId: "second" });
    expect(h.current.importIdentity.confirmed).toBe(false);
    expect(h.current.importIdentity.blocked).toBe(true);
    expect(h.current.importIdentity.comparison?.athleteId).toBe("second");
  });
});
