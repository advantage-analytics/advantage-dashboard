import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { expect, test } from "@playwright/test";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

import {
  buildImportIdentityConfirmationKey,
  evaluateImportedIdentityMatch,
  wizardContinueBlocked,
} from "@/components/dashboard/matches/new-match-wizard/validation";
import {
  identityAthleteFor,
  wizardUploadEligibility,
  type MatchSubject,
} from "@/components/dashboard/matches/new-match-wizard/subject-eligibility";
import type { IdentityMatchStatus } from "@/components/dashboard/matches/new-match-wizard/types";
import type { RosterIdentity } from "@/lib/workspace/upload-eligibility";
import type { Workspace } from "@/lib/workspace/types";

/**
 * The import-identity checkpoint, without a server.
 *
 * A SwingVision export writes every point from ITS player 1's side. Confirming
 * the wrong person files the opponent's numbers under our athlete with nothing
 * on screen looking broken — so this file proves, executably, the three things
 * a reader cannot check by eye:
 *
 *   1. The copy names the real people, in BOTH workspace kinds, and says so
 *      explicitly when a name is missing rather than printing a blank.
 *   2. Neither answer can move an athlete id: `matches.player1_id` comes from
 *      `wizardUploadEligibility()`, which never sees a name.
 *   3. Click and keyboard read ONE blocking value.
 *
 * The notice is rendered through `ts.transpileModule` in a VM rather than
 * imported: Playwright's own transform rewrites JSX to its fixture runtime, so
 * a directly imported component cannot be handed to `renderToStaticMarkup`.
 * The same trick as `tests/home-empty-loading.spec.ts`.
 */

const WIZARD = "src/components/dashboard/matches/new-match-wizard";

// ─── Rendering the real component ──────────────────────────────────────────

interface NoticeProps {
  comparison: IdentityMatchStatus;
  workspaceKind: "personal" | "team";
  rejected: boolean;
  onConfirm: () => void;
  onReject: () => void;
  onChangeFile: () => void;
  onChangePlayer?: () => void;
}

const noticeModule = (() => {
  const exports: {
    ImportIdentityNotice?: React.ComponentType<NoticeProps>;
  } = {};
  const { outputText } = ts.transpileModule(
    readFileSync(resolve(`${WIZARD}/ImportIdentityNotice.tsx`), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  );
  runInNewContext(outputText, {
    exports,
    require: (id: string) => {
      if (id === "react/jsx-runtime") return jsx;
      if (id === "react") return React;
      // Icons are decoration; the notice's meaning is its words and buttons.
      if (id === "lucide-react")
        return new Proxy(
          {},
          {
            get: (_t, name: string) =>
              function Icon(props: Record<string, unknown>) {
                // Props pass through, so `aria-hidden` is observable below.
                const { children: _children, ...rest } = props;
                void _children;
                return React.createElement("span", {
                  ...rest,
                  "data-icon": name,
                });
              },
          },
        );
      // The design system's button, as a marker: the assertions below care
      // which VARIANT each action asks for, not what Tailwind compiles it to.
      if (id === "@/lib/ui/adv-button")
        return { advButton: (variant: string) => `advbtn-${variant}` };
      throw new Error(`unexpected import in the notice: ${id}`);
    },
  });
  return exports;
})();

function comparisonOf(
  athleteName: string,
  importedName: string,
  athleteId: string | null = "pp-athlete",
): IdentityMatchStatus {
  // The REAL predicate (T5), not a hand-written literal: if the comparison
  // ever stops asking for confirmation on these pairs, this file fails rather
  // than testing copy for a branch the wizard no longer reaches.
  const comparison = evaluateImportedIdentityMatch({
    athleteId,
    importedAthleteId: null,
    athleteName,
    importedName,
  });
  expect(comparison.requiresConfirmation).toBe(true);
  return comparison;
}

interface Rendered {
  html: string;
  text: string;
  buttons: { label: string; variant: string }[];
}

function render(props: Partial<NoticeProps> & Pick<NoticeProps, "comparison">) {
  const Notice = noticeModule.ImportIdentityNotice!;
  const html = renderToStaticMarkup(
    React.createElement(Notice, {
      workspaceKind: "personal",
      rejected: false,
      onConfirm: () => {},
      onReject: () => {},
      onChangeFile: () => {},
      ...props,
    }),
  );
  const decode = (s: string) =>
    s
      .replaceAll("&#x27;", "'")
      .replaceAll("&quot;", '"')
      .replaceAll("&amp;", "&")
      .replaceAll("’", "'");
  const buttons = [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map(
    (m) => ({
      label: decode(m[1].replace(/<[^>]+>/g, "")).trim(),
      variant: /advbtn-([a-z-]+)/.exec(m[0])?.[1] ?? "",
    }),
  );
  const text = decode(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
  return { html, text, buttons } satisfies Rendered;
}

const CONFIRM = "Yes, this is player 1";
const REJECT = "No, they are not player 1";

// ─── 1. Copy, in both workspace kinds ──────────────────────────────────────

test("a personal mismatch names the export's player and the profile's", () => {
  const { text, buttons } = render({
    comparison: comparisonOf("Riley Reproduction", "Taylor Imported"),
    workspaceKind: "personal",
  });

  expect(text).toContain("Taylor Imported");
  expect(text).toContain("Riley Reproduction");
  expect(text).toContain("Are you player 1 in this export?");
  expect(buttons.map((b) => b.label)).toContain(CONFIRM);
});

test("a team mismatch asks about the chosen athlete by name", () => {
  const { text, buttons } = render({
    comparison: comparisonOf("Marcus Webb", "M. Webb Jr"),
    workspaceKind: "team",
    onChangePlayer: () => {},
  });

  // Both names, and the team question — not the personal one, which would tell
  // a coach that their own profile names the athlete.
  expect(text).toContain("This export names M. Webb Jr as player 1");
  expect(text).toContain("Is that Marcus Webb?");
  expect(text).not.toContain("your profile");
  expect(buttons.map((b) => b.label)).toEqual([
    CONFIRM,
    REJECT,
    "Choose another file",
    "Change player",
  ]);
});

test("only a team upload with a choice to make offers Change player", () => {
  // A personal workspace has exactly one athlete, and a preset already named
  // one: neither gets an action that leads nowhere.
  const { buttons } = render({
    comparison: comparisonOf("Riley Reproduction", "Taylor Imported"),
    workspaceKind: "personal",
  });
  expect(buttons.map((b) => b.label)).not.toContain("Change player");
});

// ─── 2. Missing names are said out loud, never rendered as a blank ─────────

test("an export with no player 1 says so, and still names the athlete", () => {
  const comparison = comparisonOf("Riley Reproduction", "   ");
  expect(comparison.reason).toBe("missing-name");

  const { text, buttons } = render({ comparison, workspaceKind: "personal" });

  expect(text).toContain("This export is missing a player name");
  expect(text).toContain("doesn't name a player 1");
  expect(text).toContain("Riley Reproduction");
  // No fabricated subject, and no empty gap where a name should be.
  expect(text).not.toMatch(/names\s+as player 1/);
  expect(text).not.toContain("undefined");
  expect(buttons.map((b) => b.label)).toContain(CONFIRM);
});

test("a team upload with no athlete chosen asks for the player, not a confirmation", () => {
  // `identityAthleteFor()` returns id null / name "" in a team workspace with
  // nothing picked — deliberately, so a coach's login is never the fallback.
  const chosen = identityAthleteFor({
    workspace: { kind: "team" },
    viewer: { id: "u-coach", name: "Dana Coach" },
    preset: null,
    subject: null,
  });
  expect(chosen).toEqual({ id: null, name: "" });

  const comparison = comparisonOf(chosen.name, "Taylor Imported", chosen.id);
  const { text, buttons } = render({
    comparison,
    workspaceKind: "team",
    onChangePlayer: () => {},
  });

  expect(text).toContain("No player is selected yet");
  expect(text).toContain("Taylor Imported");
  // The coach's own name is nowhere near this notice.
  expect(text).not.toContain("Dana Coach");
  // Confirming here is refused by the hook, so it is not offered.
  expect(buttons.map((b) => b.label)).toEqual([
    "Change player",
    "Choose another file",
  ]);
});

test("both names missing still reads as a sentence", () => {
  const { text } = render({
    comparison: comparisonOf("", ""),
    workspaceKind: "team",
    onChangePlayer: () => {},
  });
  expect(text).toContain("No player is selected yet");
  expect(text).toContain("doesn't name a player 1 either");
});

// ─── 3. A negative answer explains the export, and swaps nothing ───────────

test("No sends the person back for a correctly oriented export", () => {
  const { text, buttons } = render({
    comparison: comparisonOf("Marcus Webb", "Taylor Imported"),
    workspaceKind: "team",
    rejected: true,
    onChangePlayer: () => {},
  });

  expect(text).toContain("can't be used for Marcus Webb");
  expect(text).toContain("choose an export where Marcus Webb is player 1");
  expect(text).toContain(
    "Renaming the players here would leave the statistics on the other player",
  );
  // No offer to reinterpret the file from the other side — the parser has one
  // perspective and the wizard must not pretend otherwise.
  expect(text.toLowerCase()).not.toMatch(/swap|flip|use the other player/);
  expect(buttons.map((b) => b.label)).toEqual([
    "Choose another file",
    "Change player",
  ]);
});

// ─── 4. Announced, and one primary action ──────────────────────────────────

test("every state is a polite live region with a single primary action", () => {
  const states: Rendered[] = [
    render({
      comparison: comparisonOf("Riley Reproduction", "Taylor Imported"),
    }),
    render({
      comparison: comparisonOf("Marcus Webb", "M. Webb Jr"),
      workspaceKind: "team",
      onChangePlayer: () => {},
    }),
    render({ comparison: comparisonOf("Riley Reproduction", "") }),
    render({
      comparison: comparisonOf("", "Taylor Imported", null),
      workspaceKind: "team",
      onChangePlayer: () => {},
    }),
    render({
      comparison: comparisonOf("Marcus Webb", "Taylor Imported"),
      rejected: true,
    }),
  ];

  for (const { html, buttons } of states) {
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-hidden="true"'); // the glyph is not read out
    expect(
      buttons.filter((b) => b.variant === "advbtn-primary").length,
    ).toBeLessThanOrEqual(1);
    // Every action is reachable and named; none is an icon-only mystery.
    for (const b of buttons) expect(b.label.length).toBeGreaterThan(0);
  }
});

// ─── 5. One blocking value for click and keyboard ──────────────────────────

test("the file step is blocked by the same value the keyboard reads", () => {
  const base = {
    step: "file" as const,
    busy: false,
    missingMatchAnswers: false,
    importIdentityBlocked: false,
  };
  expect(wizardContinueBlocked(base)).toBe(false);
  expect(wizardContinueBlocked({ ...base, importIdentityBlocked: true })).toBe(
    true,
  );
  expect(wizardContinueBlocked({ ...base, busy: true })).toBe(true);
  // T12's match-step gate and this one compose rather than replace: an
  // unconfirmed import blocks step 2, unanswered requirements block step 4.
  expect(
    wizardContinueBlocked({
      ...base,
      step: "match",
      importIdentityBlocked: true,
    }),
  ).toBe(false);
  expect(
    wizardContinueBlocked({
      ...base,
      step: "match",
      missingMatchAnswers: true,
    }),
  ).toBe(true);
  expect(wizardContinueBlocked({ ...base, missingMatchAnswers: true })).toBe(
    false,
  );
});

test("the footer button and the Enter key are handed the same value", () => {
  // `useWizardKeys` refuses plain Enter on `continueDisabled`; `WizardShell`
  // disables the button with it. One variable, read twice — asserted here
  // because the alternative is two inline expressions that drift apart.
  const flow = readFileSync(resolve(`${WIZARD}/UploadMatchFlow.tsx`), "utf8");
  expect(flow).toContain("const continueDisabled = wizardContinueBlocked({");
  const keys = flow.slice(flow.indexOf("useWizardKeys({"));
  expect(keys.slice(0, keys.indexOf("});"))).toContain("continueDisabled,");
  expect(flow).toContain("continueDisabled={continueDisabled}");
  // The disable is scoped to the notice being on screen, so a disabled
  // Continue always has the explanation — and the two answers — beside it.
  // Every other reason the import can be blocked keeps the handler's sentence.
  expect(flow).toContain(
    "importIdentityBlocked: identityNoticeVisible && importIdentity.blocked,",
  );
  expect(flow).toMatch(
    /identityNoticeVisible =\s*step === "file" &&\s*!isProcessingProvider &&/,
  );
  // The notice is a sibling of the file step's content, never wrapped around
  // it: T17's video requirements and the drop zone's error strip stay visible.
  expect(flow).toMatch(/<\/FileStepContent>|\/>\s*\{identityNoticeVisible/);
  // And the handler re-checks the same fact at the write, so a stale render
  // cannot let Enter through.
  const hook = readFileSync(
    resolve(`${WIZARD}/useUploadMatchWizard.ts`),
    "utf8",
  );
  const fileContinue = hook.slice(hook.indexOf("const handleFileContinue"));
  expect(fileContinue.slice(0, fileContinue.indexOf("}, ["))).toContain(
    "importIdentityBlocked",
  );
});

// ─── 6. No answer here moves an athlete id ─────────────────────────────────

const ROSTER: readonly RosterIdentity[] = [
  { playerId: "pp-marcus", userId: "u-marcus" },
  { playerId: "pp-ava", userId: null },
];

function team(): Workspace {
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
  };
}

function personal(): Workspace {
  return { ...team(), id: "u-viewer", kind: "personal", role: "owner" };
}

test("attribution follows the chosen athlete, whatever the names say", () => {
  const subject: MatchSubject = {
    kind: "roster",
    playerId: "pp-marcus",
    name: "Marcus Webb",
  };
  const attribution = () =>
    wizardUploadEligibility({
      workspace: team(),
      viewerId: "u-coach",
      subject,
      roster: ROSTER,
    });

  const before = attribution();
  expect(before).toEqual({ ok: true, attribution: "pp-marcus" });

  // The things the notice CAN change — the export's name, the typed display
  // name, and the confirmation answer — are not inputs to this decision at
  // all. That is the invariant: `matches.player1_id` is decided by the pick.
  for (const importedName of ["Taylor Imported", "", "Marcus Webb"]) {
    evaluateImportedIdentityMatch({
      athleteId: "pp-marcus",
      importedAthleteId: null,
      athleteName: importedName,
      importedName,
    });
    expect(attribution()).toEqual(before);
  }

  // A personal upload is the viewer's own login, before and after any of it.
  expect(
    wizardUploadEligibility({
      workspace: personal(),
      viewerId: "u-viewer",
      subject: null,
      roster: null,
    }),
  ).toEqual({ ok: true, attribution: "u-viewer" });
});

test("a confirmation is keyed to one file and one athlete, and cannot carry", () => {
  const scope = (
    over: Partial<
      Parameters<typeof buildImportIdentityConfirmationKey>[0]
    > = {},
  ) =>
    buildImportIdentityConfirmationKey({
      athleteId: "pp-marcus",
      importedAthleteId: null,
      athleteName: "Marcus Webb",
      importedName: "Taylor Imported",
      workspaceId: "team:p-westfield",
      fileGenerationId: "swing-vision:1",
      ...over,
    });

  const original = scope();
  // Replacing the file is a new generation → the prior Yes no longer applies.
  expect(scope({ fileGenerationId: "swing-vision:2" })).not.toBe(original);
  // Switching the athlete (T12 feeds `identityAthleteFor()` in here) likewise.
  expect(scope({ athleteId: "pp-ava", athleteName: "Ava Stone" })).not.toBe(
    original,
  );
  expect(scope({ workspaceId: "personal:u-viewer" })).not.toBe(original);
  // Editing the display name's spacing/case is not a different person, and the
  // key is stable across it — but the id is what it is bound to.
  expect(scope({ athleteName: "  marcus   webb " })).toBe(original);
  expect(original).toContain("athlete:pp-marcus");
});
