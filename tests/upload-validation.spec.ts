import { expect, test } from "@playwright/test";

import {
  buildImportIdentityConfirmationKey,
  collectMatchCompletionRequirements,
  evaluateImportedIdentityMatch,
  identityNeedsConfirmation,
} from "@/components/dashboard/matches/new-match-wizard/validation";

test.describe("import identity comparison", () => {
  test("accepts case and whitespace as the same person", () => {
    const result = evaluateImportedIdentityMatch({
      athleteId: "athlete-1",
      importedAthleteId: null,
      athleteName: "Sam  Reid",
      importedName: "  sam reID  ",
    });

    expect(result.matchesByName).toBe(true);
    expect(result.requiresConfirmation).toBe(false);
    expect(result.reason).toBe("name-match");
    expect(result.athleteId).toBe("athlete-1");
    expect(result.importedAthleteId).toBeNull();
  });

  test("requires confirmation when either name is missing", () => {
    const emptyExpected = evaluateImportedIdentityMatch({
      athleteId: "athlete-1",
      importedAthleteId: "imported-1",
      athleteName: "",
      importedName: "Sam Reid",
    });
    expect(emptyExpected.matchesByName).toBe(false);
    expect(emptyExpected.requiresConfirmation).toBe(true);
    expect(emptyExpected.reason).toBe("missing-name");
    expect(emptyExpected.athleteId).toBe("athlete-1");
    expect(emptyExpected.importedAthleteId).toBe("imported-1");

    const emptyImported = evaluateImportedIdentityMatch({
      athleteId: "athlete-1",
      importedAthleteId: "imported-1",
      athleteName: "Sam Reid",
      importedName: "   ",
    });
    expect(emptyImported.matchesByName).toBe(false);
    expect(emptyImported.requiresConfirmation).toBe(true);
    expect(emptyImported.reason).toBe("missing-name");
    expect(emptyImported.athleteId).toBe("athlete-1");
    expect(emptyImported.importedAthleteId).toBe("imported-1");
    expect(identityNeedsConfirmation("Sam Reid", "   ")).toBe(true);
  });

  test("requires confirmation for initials, nicknames, punctuation, and different people", () => {
    const initialsMismatch = evaluateImportedIdentityMatch({
      athleteId: "athlete-1",
      importedAthleteId: "imported-1",
      athleteName: "Sam Reid",
      importedName: "S. Reid",
    });
    expect(initialsMismatch.requiresConfirmation).toBe(true);
    expect(initialsMismatch.athleteId).toBe("athlete-1");
    expect(initialsMismatch.importedAthleteId).toBe("imported-1");
    expect(
      evaluateImportedIdentityMatch({
        athleteId: "athlete-1",
        importedAthleteId: null,
        athleteName: "Sam Reid",
        importedName: "Sammy Reid",
      }).requiresConfirmation,
    ).toBe(true);
    expect(
      evaluateImportedIdentityMatch({
        athleteId: "athlete-1",
        importedAthleteId: null,
        athleteName: "O'Neil",
        importedName: "O Neil",
      }).requiresConfirmation,
    ).toBe(true);
    expect(
      evaluateImportedIdentityMatch({
        athleteId: "athlete-1",
        importedAthleteId: null,
        athleteName: "Sam Reid",
        importedName: "Sally Reid",
      }).requiresConfirmation,
    ).toBe(true);
  });
});

test.describe("import identity confirmation binding", () => {
  const base = {
    workspaceId: "workspace-1",
    athleteId: "athlete-1",
    importedAthleteId: "imported-1",
    athleteName: "Sam Reid",
    importedName: "sam   Reid",
    fileGenerationId: "generation-1",
  };

  test("reuses the same confirmation key when keys are stable", () => {
    const first = buildImportIdentityConfirmationKey(base);
    const second = buildImportIdentityConfirmationKey({
      ...base,
      importedName: "  SAM   REID ",
    });

    expect(first).toBe(second);
  });

  test("confirming a mismatch leaves both attribution ids unchanged", () => {
    const identity = evaluateImportedIdentityMatch({
      athleteId: base.athleteId,
      importedAthleteId: "imported-1",
      athleteName: base.athleteName,
      importedName: "S. Reid",
    });

    expect(identity.requiresConfirmation).toBe(true);
    expect(
      buildImportIdentityConfirmationKey({
        ...base,
        importedAthleteId: identity.importedAthleteId,
        athleteName: identity.athleteName,
        importedName: identity.importedName,
      }),
    ).toContain("file:generation-1");
    expect(identity.athleteId).toBe("athlete-1");
    expect(identity.importedAthleteId).toBe("imported-1");
  });

  test("invalidates confirmation when file, workspace, athlete, or imported identity changes", () => {
    const unchanged = buildImportIdentityConfirmationKey(base);
    const workspaceChanged = buildImportIdentityConfirmationKey({
      ...base,
      workspaceId: "workspace-2",
    });
    const athleteChanged = buildImportIdentityConfirmationKey({
      ...base,
      athleteId: "athlete-2",
    });
    const importedAthleteChanged = buildImportIdentityConfirmationKey({
      ...base,
      importedAthleteId: "imported-2",
    });
    const fileChanged = buildImportIdentityConfirmationKey({
      ...base,
      fileGenerationId: "generation-2",
    });
    const importNameChanged = buildImportIdentityConfirmationKey({
      ...base,
      importedName: "Sam R. Reid",
    });

    expect(workspaceChanged).not.toBe(unchanged);
    expect(athleteChanged).not.toBe(unchanged);
    expect(importedAthleteChanged).not.toBe(unchanged);
    expect(fileChanged).not.toBe(unchanged);
    expect(importNameChanged).not.toBe(unchanged);
  });
});

test.describe("match completion requirements", () => {
  test("requires both players' hand/backhand values before save", () => {
    const input = {
      isProcessingProvider: false,
      hasAnySetScore: true,
      playerSubjectIsRoster: false,
      opponentName: "Alex Garcia",
      date: "2026-09-01",
      playerName: "Chris Kim",
      playerHand: undefined,
      playerBackhand: undefined,
      opponentHand: undefined,
      opponentBackhand: undefined,
    };

    const req = collectMatchCompletionRequirements(input);
    expect(req.labels).toContain("player hand");
    expect(req.labels).toContain("player backhand");
    expect(req.labels).toContain("opponent hand");
    expect(req.labels).toContain("opponent backhand");
  });

  test("does not require guessing defaults for any hand/backhand field", () => {
    const req = collectMatchCompletionRequirements({
      isProcessingProvider: true,
      hasAnySetScore: true,
      playerSubjectIsRoster: true,
      opponentName: "Alex Garcia",
      date: "2026-09-01",
      playerName: "Chris Kim",
      playerHand: "right",
      playerBackhand: "one-handed",
      opponentHand: "left",
      opponentBackhand: "two-handed",
      adScoring: true,
      fixedCamera: true,
      initialTopPlayerIsPlayer1: true,
    });

    expect(req.labels).toHaveLength(0);
  });

  test("includes processing requirements in addition to hand/backhand values", () => {
    const req = collectMatchCompletionRequirements({
      isProcessingProvider: true,
      hasAnySetScore: true,
      playerSubjectIsRoster: true,
      opponentName: "Alex Garcia",
      date: "2026-09-01",
      playerName: "Chris Kim",
      playerHand: undefined,
      playerBackhand: undefined,
      opponentHand: "right",
      opponentBackhand: "two-handed",
      adScoring: undefined,
      fixedCamera: undefined,
      initialTopPlayerIsPlayer1: undefined,
    });

    expect(req.labels).toContain("player hand");
    expect(req.labels).toContain("player backhand");
    expect(req.labels).toContain("scoring");
    expect(req.labels).toContain("player1 side in video");
    expect(req.labels).toContain("camera");
    expect(req.labels).not.toContain("opponent backhand");
  });
});
