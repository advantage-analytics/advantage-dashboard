import { expect, test } from "@playwright/test";
import { uploadWizardHarness } from "./fixtures/upload-wizard-hook";
import type { AdminWizardMode } from "@/components/dashboard/matches/new-match-wizard/admin-mode";

function adminMode(): AdminWizardMode {
  return {
    operationId: "11111111-1111-4111-8111-111111111111",
    itemId: "22222222-2222-4222-8222-222222222222",
    exitHref: "/admin/uploads",
    successHref: "/admin/uploads",
    context: {
      source: "admin",
      actorId: "user",
      viewer: { id: "user", name: "Admin" },
      workspace: { id: "team-a", kind: "team", programStatus: "active" },
      roster: [
        {
          playerId: "athlete",
          userId: null,
          name: "Target athlete",
          ladderPosition: 1,
          classYear: null,
          email: null,
          managedBy: "coach",
        },
      ],
      videoAllowance: {
        accountId: "team-a",
        accountType: "program",
        billingMonth: "2026-09",
        usedSeconds: 100,
        capSeconds: 270000,
        remainingSeconds: 269900,
      },
    },
  } as AdminWizardMode;
}

test("console wizard consumes target roster and allowance without membership reads or draft writes", async () => {
  const mode = adminMode();
  const h = uploadWizardHarness({
    team: true,
    admin: mode,
    props: { initialProvider: "splitstep" },
  });
  await h.flush();
  expect(h.current.whoPlayed.roster?.map((row) => row.name)).toEqual([
    "Target athlete",
  ]);
  expect(h.current.remainingQuotaSeconds).toBe(269900);
  expect(h.rosterRpcCallCount).toBe(0);
  expect(await h.current.saveDraft()).toBe(false);
  expect(h.draftSaves).toEqual([]);
  h.current.whoPlayed.choose({
    kind: "roster",
    playerId: "athlete",
    name: "Target athlete",
  });
  await h.flush();
  h.current.handleProviderContinue();
  await h.flush();
  expect(h.current.stepOrder).toEqual(["provider", "file", "trim", "match"]);
  expect(h.programStatusCallCount).toBe(0);
  expect(h.writes).toEqual([]);
  expect(mode.operationId).toBe("11111111-1111-4111-8111-111111111111");
});

test("file admission retains exact operation IDs across queued retries and never inserts browser matches", async () => {
  const mode = adminMode();
  const requests: globalThis.FormData[] = [];
  const h = uploadWizardHarness({
    team: true,
    admin: mode,
    adminFetch: async (url, init) => {
      expect(url).toBe("/api/admin/uploads/file");
      requests.push(init.body as globalThis.FormData);
      if (requests.length === 2)
        return {
          ok: false,
          json: async () => ({
            ok: false,
            message: "The target changed. Administrator review is required.",
          }),
        };
      return {
        ok: true,
        json: async () => ({
          ok: true,
          matchId: "durable-match",
          state: requests.length === 1 ? "queued" : "failed",
          message:
            requests.length === 1
              ? "Retry with same file."
              : "Administrator review is required.",
        }),
      };
    },
  });
  h.current.whoPlayed.choose({
    kind: "roster",
    playerId: "athlete",
    name: "Target athlete",
  });
  await h.flush();
  const pending = await h.pick("target.xlsx");
  pending.resolve({
    success: true,
    warnings: [],
    data: {
      playerName: "Target athlete",
      opponentName: "Opponent",
      playerScores: [6],
      opponentScores: [4],
      bestOf: "1",
      adScoring: true,
    },
  });
  await h.flush();
  h.current.importIdentity.confirm();
  await h.flush();
  for (const field of [
    "playerHand",
    "playerBackhand",
    "opponentHand",
    "opponentBackhand",
  ] as const)
    h.current.handleInputChange(field, "Right");
  h.current.handleInputChange("date", "2026-09-16");
  h.current.handleInputChange("courtType", "Hard");
  await h.flush();
  await h.current.handleCreateMatch();
  await h.flush();
  expect(h.current.error).toBeNull();
  expect(h.current.adminFileResult?.state).toBe("queued");
  await h.current.handleCreateMatch();
  await h.flush();
  expect(h.current.adminFileResult?.state).toBe("queued");
  expect(h.current.error).toBe(
    "The target changed. Administrator review is required.",
  );
  await h.current.handleCreateMatch();
  await h.flush();
  expect(h.current.adminFileResult?.state).toBe("failed");
  expect(h.current.error).toBeNull();
  expect(requests).toHaveLength(3);
  for (const body of requests) {
    expect(body.get("operationId")).toBe(mode.operationId);
    expect(body.get("itemId")).toBe(mode.itemId);
    expect(body.get("programId")).toBe("team-a");
    expect(body.get("playerId")).toBe("athlete");
    expect(body.has("score")).toBe(false);
  }
  expect(h.writes).toEqual([]);
});

test("admin presentation refuses mixed preparation identity and projects only the target workspace", async () => {
  const fs = await import("node:fs");
  const vm = await import("node:vm");
  const ts = (await import("typescript")).default;
  const React = await import("react");
  const jsx = await import("react/jsx-runtime");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const presentationModule = {
    exports: {} as {
      AdminUploadMatchFlow: React.ComponentType<{ mode: AdminWizardMode }>;
    },
  };
  let projected: unknown;
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(
        "src/components/dashboard/matches/new-match-wizard/admin-mode.tsx",
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
      exports: presentationModule.exports,
      require: (name: string) =>
        name === "react"
          ? React
          : name === "react/jsx-runtime"
            ? jsx
            : name === "./UploadMatchFlow"
              ? {
                  UploadMatchFlow: () =>
                    React.createElement("p", null, "Shared upload wizard"),
                }
              : name === "@/components/dashboard/workspace-provider"
                ? {
                    WorkspaceProvider: ({
                      value,
                      children,
                    }: {
                      value: unknown;
                      children: React.ReactNode;
                    }) => {
                      projected = value;
                      return children;
                    },
                  }
                : (() => {
                    throw new Error(name);
                  })(),
    },
  );
  const mode = adminMode();
  expect(
    renderToStaticMarkup(
      React.createElement(presentationModule.exports.AdminUploadMatchFlow, {
        mode,
      }),
    ),
  ).toContain("Shared upload wizard");
  expect(projected).toEqual({
    active: mode.context.workspace,
    available: [mode.context.workspace],
    viewer: mode.context.viewer,
  });
  const mismatch = {
    ...mode,
    context: {
      ...mode.context,
      videoAllowance: {
        ...mode.context.videoAllowance,
        accountId: "another-team",
      },
    },
  };
  expect(
    renderToStaticMarkup(
      React.createElement(presentationModule.exports.AdminUploadMatchFlow, {
        mode: mismatch,
      }),
    ),
  ).toContain('role="alert"');
});

test("same-operation context rerenders preserve entered answers", async () => {
  const options = { team: true, admin: adminMode() };
  const h = uploadWizardHarness(options);
  h.current.handleInputChange("date", "2026-09-15");
  h.current.handleInputChange("opponentName", "Chosen opponent");
  await h.flush();
  options.admin = { ...options.admin, context: { ...options.admin.context } };
  h.render();
  await h.flush();
  expect(h.current.formData.date).toBe("2026-09-15");
  expect(h.current.formData.opponentName).toBe("Chosen opponent");
});

test("prepared partial video result reaches secure admission without inaccessible score or style questions", async () => {
  const mode = adminMode();
  const preset = {
    entryId: null,
    eventId: null,
    eventName: null,
    matchId: "recorded-match",
    round: null,
    playerName: "Target athlete",
    playerUserId: "athlete",
    opponentName: "Opponent",
    date: "2026-09-16",
    surface: "hard",
    bestOf: 3,
    adScoring: null,
    score: { player1: [2], player2: [1], winner: "player1" as const },
    ending: "retired" as const,
    supportsVideo: true,
    eventHref: "/admin/uploads",
    site: null,
    eventKind: null,
    opponentProgramKey: null,
    opponentSchool: null,
  };
  mode.attachment = {
    programId: "team-a",
    matchId: preset.matchId,
    fingerprint: "a".repeat(32),
    operationId: mode.operationId,
    itemId: mode.itemId,
    status: "prepared",
    preset,
  };
  const requests: Record<string, unknown>[] = [];
  const h = uploadWizardHarness({
    team: true,
    admin: mode,
    props: { preset },
    adminFetch: async (url, init) => {
      expect(url).toBe("/api/admin/uploads/video");
      requests.push(JSON.parse(init.body as string));
      return {
        ok: false,
        json: async () => ({
          ok: false,
          message: "Recorded ending is not eligible.",
        }),
      };
    },
  });
  const pending = await h.pick("local-fixture.xlsx");
  pending.resolve({
    success: true,
    warnings: [],
    data: {
      playerName: "Target athlete",
      opponentName: "Opponent",
      playerScores: [2],
      opponentScores: [1],
      bestOf: "3",
    },
  });
  await h.flush();
  h.current.importIdentity.confirm();
  await h.flush();
  h.props.initialProvider = "splitstep";
  h.render();
  await h.flush();
  h.current.handleInputChange("videoStartSeconds", 0);
  h.current.handleInputChange("videoEndSeconds", 60);
  h.current.handleInputChange("adScoring", false);
  h.current.handleInputChange("fixedCamera", false);
  h.current.handleInputChange("initialTopPlayerIsPlayer1", false);
  await h.flush();
  await h.current.handleCreateMatch();
  await h.flush();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({
    matchId: "recorded-match",
    fingerprint: "a".repeat(32),
    operationId: mode.operationId,
    itemId: mode.itemId,
    adScoring: false,
    fixedCamera: false,
    initialTopPlayerIsPlayer1: false,
  });
  expect(requests[0]).not.toHaveProperty("score");
  expect(requests[0]).not.toHaveProperty("playerId");
  expect(h.current.error).toBe("Recorded ending is not eligible.");
  expect(h.writes).toEqual([]);
});

test("queued file screen shows the latest retry refusal and disables pending retries", async () => {
  const fs = await import("node:fs");
  const vm = await import("node:vm");
  const ts = (await import("typescript")).default;
  const React = await import("react");
  const jsx = await import("react/jsx-runtime");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const statusModule = {
    exports: {} as {
      AdminFileSubmissionStatus: React.ComponentType<{
        result: { state: string; message: string };
        error: string | null;
        pending: boolean;
        onRetry: () => void;
        successHref: string;
      }>;
    },
  };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(
        "src/components/dashboard/matches/new-match-wizard/AdminFileSubmissionStatus.tsx",
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
      exports: statusModule.exports,
      require: (name: string) =>
        name === "react/jsx-runtime"
          ? jsx
          : name === "@/lib/ui/adv-button"
            ? { advButton: () => "button" }
            : (() => {
                throw new Error(name);
              })(),
    },
  );
  const props = {
    result: {
      state: "queued",
      message: "File saved. Retry with the same file.",
    },
    error: "The target changed. Administrator review is required.",
    pending: false,
    onRetry() {},
    successHref: "/admin/uploads",
  };
  const refusal = renderToStaticMarkup(
    React.createElement(statusModule.exports.AdminFileSubmissionStatus, props),
  );
  expect(refusal).toContain('role="alert"');
  expect(refusal).toContain(props.error);
  expect(refusal).toContain("File processing: queued");
  expect(refusal).toContain('href="/admin/uploads"');
  const pending = renderToStaticMarkup(
    React.createElement(statusModule.exports.AdminFileSubmissionStatus, {
      ...props,
      error: null,
      pending: true,
    }),
  );
  expect(pending).toContain('aria-busy="true"');
  expect(pending).toContain('disabled=""');
  expect(pending).toContain("Retrying with the same file…");
});
