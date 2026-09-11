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

import {
  deferred,
  parsedNames,
  uploadWizardHarness,
} from "./fixtures/upload-wizard-hook";

test.describe("upload hook identity and submission", () => {
  for (const team of [false, true]) {
    test(`${team ? "team" : "personal"} mismatch blocks both handlers until confirmed`, async () => {
      const h = uploadWizardHarness({ team });
      await h.flush();
      if (team)
        h.current.whoPlayed.choose({
          kind: "roster",
          playerId: "athlete",
          name: "Riley Player",
        });
      h.render();
      h.current.handleProviderContinue();
      h.render();
      const file = await h.pick("mismatch.csv");
      file.resolve(parsedNames("R. Player"));
      await h.flush();
      h.current.handleInputChange("playerName", "R. Player");
      h.render();
      expect(h.current.importIdentity.parsedNames?.playerName).toBe(
        "R. Player",
      );
      expect(h.current.importIdentity.comparison?.athleteName).toBe(
        "Riley Player",
      );
      h.current.handleFileContinue();
      await h.current.handleCreateMatch();
      h.render();
      expect(h.current.step).toBe("file");
      expect(h.writes).toEqual([]);
      expect(h.current.importIdentity.blocked).toBe(true);
      h.current.importIdentity.confirm();
      h.render();
      expect(h.current.importIdentity.blocked).toBe(false);
      expect(h.current.importIdentity.comparison?.athleteId).toBe(
        team ? "athlete" : "user",
      );
      h.current.handleFileContinue();
      h.render();
      expect(h.current.step).toBe("match");
    });
  }

  test("late validation and parsing cannot replace a newer file or clear its pending state", async () => {
    const h = uploadWizardHarness();
    await h.flush();
    const slowCheck = deferred<{ success: boolean }>();
    h.checks.set("old-validation.csv", slowCheck);
    await h.pick("old-validation.csv");
    const oldParse = await h.pick("old-parse.csv");
    const newest = await h.pick("new.csv");
    slowCheck.resolve({ success: false });
    oldParse.resolve(parsedNames("Riley Player"));
    await h.flush();
    expect(h.current.uploadedFile?.name).toBe("new.csv");
    expect(h.current.uploadError).toBeNull();
    expect(h.current.parsingState.isParsing).toBe(true);
    expect(h.current.importIdentity.blocked).toBe(true);
    newest.resolve(parsedNames("Another Player"));
    await h.flush();
    expect(h.current.importIdentity.parsedNames?.playerName).toBe(
      "Another Player",
    );
    expect(h.current.importIdentity.blocked).toBe(true);
  });

  test("source, file removal, and workspace changes invalidate pending parses", async () => {
    for (const change of ["source", "remove", "workspace"] as const) {
      const h = uploadWizardHarness();
      await h.flush();
      const pending = await h.pick("old.csv");
      if (change === "source") h.current.handleProviderSelect("video");
      if (change === "remove") h.current.handleRemoveFile();
      if (change === "workspace") h.workspace.active.id = "other-workspace";
      h.render();
      pending.resolve(parsedNames("Riley Player"));
      await h.flush();
      expect(h.current.uploadedFile).toBeNull();
      expect(h.current.importIdentity.parsedNames).toBeNull();
      expect(h.current.parsingState.parseSuccess).toBe(false);
    }
  });

  test("athlete changes during parsing use the current subject and never revive confirmation", async () => {
    const h = uploadWizardHarness({ team: true });
    await h.flush();
    const first = {
      kind: "roster" as const,
      playerId: "first",
      name: "First Player",
    };
    h.current.whoPlayed.choose(first);
    h.render();
    const pending = await h.pick("match.csv");
    h.current.whoPlayed.choose({
      kind: "roster",
      playerId: "second",
      name: "Second Player",
    });
    h.render();
    pending.resolve(parsedNames("Riley Player"));
    await h.flush();
    expect(h.current.formData.playerName).toBe("Second Player");
    h.current.importIdentity.confirm();
    h.render();
    expect(h.current.importIdentity.confirmed).toBe(true);
    h.current.whoPlayed.choose(first);
    h.render();
    expect(h.current.importIdentity.confirmed).toBe(false);
    h.current.whoPlayed.choose({
      kind: "roster",
      playerId: "second",
      name: "Second Player",
    });
    h.render();
    expect(h.current.importIdentity.confirmed).toBe(false);
  });

  test("negative player-1 answer preserves parser perspective and allows correction", async () => {
    const h = uploadWizardHarness();
    await h.flush();
    h.current.handleProviderContinue();
    h.render();
    const pending = await h.pick("wrong.csv");
    pending.resolve(parsedNames("Another Player", "Riley Player"));
    await h.flush();
    h.current.importIdentity.reject();
    h.render();
    h.current.handleFileContinue();
    await h.current.handleCreateMatch();
    h.render();
    expect(h.current.step).toBe("file");
    expect(h.current.importIdentity.rejected).toBe(true);
    expect(h.current.formData.playerScores).toEqual([6]);
    expect(h.current.formData.opponentScores).toEqual([4]);
    expect(h.current.importIdentity.parsedNames).toEqual({
      playerName: "Another Player",
      opponentName: "Riley Player",
    });
    expect(h.writes).toEqual([]);
    const corrected = await h.pick("correct.csv");
    corrected.resolve(parsedNames("Riley Player"));
    await h.flush();
    expect(h.current.importIdentity.blocked).toBe(false);
    expect(h.current.importIdentity.rejected).toBe(false);
  });

  test("re-picking a draft file requires fresh identity confirmation", async () => {
    const h = uploadWizardHarness({
      props: {
        draft: {
          id: "draft",
          provider: "swing-vision",
          formData: {},
          attachedLine: null,
        } as never,
      },
    });
    await h.flush();
    expect(h.current.step).toBe("file");
    const initial = await h.pick("same.csv");
    initial.resolve(parsedNames("R. Player"));
    await h.flush();
    h.current.importIdentity.confirm();
    h.render();
    expect(h.current.importIdentity.confirmed).toBe(true);
    const repicked = await h.pick("same.csv");
    repicked.resolve(parsedNames("R. Player"));
    await h.flush();
    expect(h.current.importIdentity.confirmed).toBe(false);
    expect(h.current.importIdentity.blocked).toBe(true);
  });

  test("direct final invocation requires each style field after identity confirmation", async () => {
    const h = uploadWizardHarness();
    await h.flush();
    const pending = await h.pick("match.csv");
    pending.resolve(parsedNames("R. Player"));
    await h.flush();
    h.current.importIdentity.confirm();
    h.render();
    const styles = {
      playerHand: "right",
      playerBackhand: "two-handed",
      opponentHand: "left",
      opponentBackhand: "one-handed",
    } as const;
    for (const [field, value] of Object.entries(styles))
      h.current.handleInputChange(field as keyof typeof styles, value);
    h.current.handleInputChange("date", "2026-09-10");
    h.render();
    for (const [field, value] of Object.entries(styles)) {
      h.current.handleInputChange(field as keyof typeof styles, undefined);
      h.render();
      await h.current.handleCreateMatch();
      h.render();
      expect(h.writes).toEqual([]);
      expect(h.current.error).toContain(
        field.replace(/([A-Z])/g, " $1").toLowerCase(),
      );
      h.current.handleInputChange(field as keyof typeof styles, value);
      h.render();
    }
    await h.current.handleCreateMatch();
    h.render();
    expect(h.writes).toHaveLength(1);
  });

  test("event-owned names, scores, format, and scoring survive replacement files", async () => {
    const h = uploadWizardHarness({
      props: {
        preset: {
          entryId: "entry",
          playerName: "Event Player",
          playerUserId: "event-player",
          opponentName: "Event Opponent",
          date: "2026-09-10",
          bestOf: 1,
          adScoring: false,
          supportsVideo: false,
          score: { player1: [7], player2: [6] },
        } as never,
      },
    });
    await h.flush();
    for (const name of ["first.csv", "replacement.csv"]) {
      const pending = await h.pick(name);
      pending.resolve(parsedNames("File Player", "File Opponent"));
      await h.flush();
      expect(h.current.formData).toMatchObject({
        playerName: "Event Player",
        opponentName: "Event Opponent",
        bestOf: "1",
        adScoring: false,
        playerScores: [7],
        opponentScores: [6],
      });
      expect(h.current.importIdentity.parsedNames?.playerName).toBe(
        "File Player",
      );
      expect(h.current.importIdentity.blocked).toBe(true);
      h.current.importIdentity.confirm();
      h.render();
    }
  });
});

test("completed confirmation resets on file, source, and workspace changes", async () => {
  for (const change of ["file", "source", "workspace"] as const) {
    const h = uploadWizardHarness();
    await h.flush();
    const pending = await h.pick("match.csv");
    pending.resolve(parsedNames("R. Player"));
    await h.flush();
    h.current.importIdentity.confirm();
    h.render();
    expect(h.current.importIdentity.confirmed).toBe(true);
    if (change === "file") h.current.handleRemoveFile();
    if (change === "source") h.current.handleProviderSelect("video");
    if (change === "workspace") h.workspace.active.id = "other";
    h.render();
    expect(h.current.importIdentity.confirmed).toBe(false);
    if (change === "source") h.current.handleProviderSelect("swing-vision");
    if (change === "workspace") h.workspace.active.id = "user";
    h.render();
    expect(h.current.importIdentity.confirmed).toBe(false);
  }
});

test("correcting the selected athlete clears a negative answer without swapping parser sides", async () => {
  const h = uploadWizardHarness({ team: true });
  await h.flush();
  h.current.whoPlayed.choose({
    kind: "roster",
    playerId: "wrong",
    name: "Wrong Player",
  });
  h.render();
  const pending = await h.pick("match.csv");
  pending.resolve(parsedNames("Right Player"));
  await h.flush();
  h.current.importIdentity.reject();
  h.render();
  h.current.whoPlayed.choose({
    kind: "roster",
    playerId: "right",
    name: "Right Player",
  });
  h.render();
  expect(h.current.importIdentity.blocked).toBe(false);
  expect(h.current.importIdentity.comparison?.athleteId).toBe("right");
  expect(h.current.formData.playerScores).toEqual([6]);
  expect(h.current.formData.opponentScores).toEqual([4]);
});

test("an attached event retains its values when another import is picked", async () => {
  const h = uploadWizardHarness();
  await h.flush();
  h.current.attachLine({
    entryId: "attached",
    eventId: "event",
    opponentName: "Event Opponent",
    date: "2026-09-09",
    bestOf: 1,
    adScoring: false,
    eventName: "Event",
    eventKind: "dual",
  } as never);
  h.render();
  const pending = await h.pick("match.csv");
  pending.resolve(parsedNames("R. Player"));
  await h.flush();
  expect(h.current.formData).toMatchObject({
    opponentName: "Event Opponent",
    date: "2026-09-09",
    bestOf: "1",
    adScoring: false,
  });
  expect(h.current.attachedLine?.entryId).toBe("attached");
});

for (const source of ["preset", "attached"] as const) {
  for (const eventScoring of [null, false, true]) {
    test(`${source} event scoring ${eventScoring} preserves ownership across replacement files`, async () => {
      const event = {
        entryId: "entry",
        eventId: "event",
        playerName: "Event Player",
        playerUserId: "event-player",
        opponentName: "Event Opponent",
        date: "2026-09-09",
        bestOf: 1,
        adScoring: eventScoring,
        supportsVideo: false,
        eventName: "Event",
        eventKind: "dual" as const,
      };
      const h = uploadWizardHarness({
        props: source === "preset" ? { preset: event as never } : {},
      });
      await h.flush();
      if (source === "attached") {
        h.current.attachLine(event as never);
        h.render();
      }
      for (const fileScoring of [true, false]) {
        const pending = await h.pick(`scoring-${fileScoring}.csv`);
        const result = parsedNames("File Player", "File Opponent");
        result.data.adScoring = fileScoring;
        pending.resolve(result);
        await h.flush();
        expect(h.current.formData).toMatchObject({
          adScoring: eventScoring ?? fileScoring,
          opponentName: "Event Opponent",
          date: "2026-09-09",
          dateSource: "event",
          bestOf: "1",
        });
      }
    });
  }
}

test("a pending parse uses scoring ownership after attaching or detaching an event", async () => {
  for (const change of ["attach", "detach"]) {
    const h = uploadWizardHarness();
    await h.flush();
    const event = {
      entryId: "entry",
      opponentName: "Event Opponent",
      date: "2026-09-09",
      bestOf: 1,
      adScoring: false,
      eventKind: "dual",
    } as never;
    if (change === "detach") {
      h.current.attachLine(event);
      h.render();
    }
    const pending = await h.pick("pending.csv");
    if (change === "attach") h.current.attachLine(event);
    else h.current.detachLine();
    h.render();
    pending.resolve(parsedNames("File Player"));
    await h.flush();
    expect(h.current.formData.adScoring).toBe(change === "detach");
  }
});

test("direct video submission also requires styles and refuses unanswered null camera values", async () => {
  const h = uploadWizardHarness();
  await h.flush();
  h.current.handleProviderSelect("video");
  h.render();
  h.current.onVideoPick(
    new File(["video"], "video.mp4", { type: "video/mp4" }),
  );
  await h.flush();
  h.current.handleInputChange("date", "2026-09-10");
  h.current.handleInputChange("opponentName", "Opponent");
  h.current.handleScoreChange("player", 0, "6");
  h.current.handleInputChange("adScoring", true);
  h.current.handleInputChange("fixedCamera", true);
  h.current.handleInputChange("initialTopPlayerIsPlayer1", false);
  h.render();
  await h.current.handleCreateMatch();
  h.render();
  expect(h.writes).toEqual([]);
  expect(h.current.error).toContain("player hand");
  for (const field of ["playerHand", "opponentHand"] as const)
    h.current.handleInputChange(field, "right");
  for (const field of ["playerBackhand", "opponentBackhand"] as const)
    h.current.handleInputChange(field, "two-handed");
  h.current.handleInputChange("fixedCamera", null);
  h.render();
  await h.current.handleCreateMatch();
  h.render();
  expect(h.writes).toEqual([]);
  expect(h.current.error).toContain("camera");
});

test("a stale spreadsheet API check cannot clear the new file's validation state", async () => {
  const h = uploadWizardHarness();
  await h.flush();
  const oldCheck = deferred<{ success: boolean }>();
  const newCheck = deferred<{ success: boolean }>();
  h.apiChecks.set("old.xlsx", oldCheck);
  h.apiChecks.set("new.xlsx", newCheck);
  await h.pick("old.xlsx");
  const newest = await h.pick("new.xlsx");
  oldCheck.resolve({ success: false });
  await h.flush();
  expect(h.current.isUploading).toBe(true);
  expect(h.current.uploadError).toBeNull();
  expect(h.current.uploadedFile).toBeNull();
  newCheck.resolve({ success: true });
  await h.flush();
  newest.resolve(parsedNames("Riley Player"));
  await h.flush();
  expect(h.current.uploadedFile?.name).toBe("new.xlsx");
  expect(h.current.importIdentity.blocked).toBe(false);
});
