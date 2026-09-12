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
  result: UploadEligibility,
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
