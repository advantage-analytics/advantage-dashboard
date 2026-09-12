import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

import { expect, test } from "@playwright/test";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

import { cn } from "@/lib/utils";

/**
 * T10 — required, no-default hand/backhand controls on the upload wizard's
 * last step (`DetailsStepContent.tsx`, rendered from
 * `/dashboard/matches/new` via `UploadMatchFlow.tsx`).
 *
 * Two layers, like `tests/upload-identity.spec.ts` and
 * `tests/upload-source.spec.ts`:
 *
 *   1. `MenuSelect` (`ui/menu-select.tsx`) rendered FOR REAL, through
 *      `FloatMenu`/`FloatMenuItem` (`ui/float-menu.tsx`) — also real. Only
 *      `@/components/ui/popover` and `lucide-react` are stubbed, exactly as
 *      `upload-source.spec.ts` stubs them, so the popover's menu renders
 *      inline instead of into a portal. This proves the actual claim behind
 *      criterion 1: an unset `value` renders the placeholder in the
 *      empty-field ink with NO row marked chosen — never a guessed default,
 *      never the raw value printed, never an "Unknown" row.
 *   2. Source assertions on `DetailsStepContent.tsx`, `UploadMatchFlow.tsx`
 *      and `lib/wizard/actions.ts` for the wiring claims that a static render
 *      of one component can't observe on its own: which function gates Save,
 *      who sees the profile-save button, and that the profile write is
 *      scoped to the caller's own row.
 *
 * No server, no database — this runs in the keyless `npm test`.
 */

const UI = "src/components/ui";
const WIZARD = "src/components/dashboard/matches/new-match-wizard";

// ─── Rendering MenuSelect + FloatMenu for real ─────────────────────────────

const icons = new Proxy(
  {},
  {
    get: (_t, name: string) =>
      function Icon(props: Record<string, unknown>) {
        const { children: _children, ...rest } = props;
        void _children;
        return React.createElement("span", { ...rest, "data-icon": name });
      },
  },
);

// The popover is a portal at runtime; here the menu renders inline so one
// static pass carries the trigger AND every option row, exactly as
// `upload-source.spec.ts` does it.
const popover = {
  Popover: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => children,
  PopoverContent: ({
    children,
    style,
  }: {
    children: React.ReactNode;
    style?: React.CSSProperties;
  }) => React.createElement("div", { "data-menu": "", style }, children),
};

function transpile(path: string): string {
  return ts.transpileModule(readFileSync(resolve(path), "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}

function loadUiModule(file: string): Record<string, unknown> {
  const exports: Record<string, unknown> = {};
  runInNewContext(transpile(`${UI}/${file}`), {
    exports,
    require: (id: string) => {
      if (id === "react/jsx-runtime") return jsx;
      if (id === "react") return React;
      if (id === "lucide-react") return icons;
      if (id === "@/lib/utils") return { cn };
      if (id === "@/components/ui/popover") return popover;
      if (id === "@/components/ui/float-menu") return floatMenuModule;
      throw new Error(`unexpected import in ${file}: ${id}`);
    },
  });
  return exports;
}

// `float-menu.tsx` first — `menu-select.tsx` requires it.
const floatMenuModule = loadUiModule("float-menu.tsx");
const menuSelectModule = loadUiModule("menu-select.tsx");

interface Option {
  value: string;
  label: string;
}

function renderSelect(props: {
  label: string;
  value: string | undefined;
  options: readonly Option[];
  placeholder?: string;
  width?: number;
  disabled?: boolean;
}) {
  const MenuSelect = menuSelectModule.MenuSelect as React.ComponentType<
    Record<string, unknown>
  >;
  const html = renderToStaticMarkup(
    React.createElement(MenuSelect, {
      variant: "underline",
      onChange: () => {},
      ...props,
    }),
  );
  const strip = (s: string) =>
    s
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  // The trigger is everything before the (always-inline, per the popover
  // stub) menu content — the one part of the render that stands in for what
  // a viewer actually sees before opening the menu.
  const menuMarker = html.indexOf('data-menu=""');
  const menuStart =
    menuMarker === -1 ? -1 : html.lastIndexOf("<div", menuMarker);
  const triggerHtml = menuStart === -1 ? html : html.slice(0, menuStart);
  return { html, text: strip(html), triggerText: strip(triggerHtml) };
}

const HAND_OPTIONS = [
  { value: "right", label: "Right-handed" },
  { value: "left", label: "Left-handed" },
] as const;
const BACKHAND_OPTIONS = [
  { value: "two-handed", label: "Two-handed backhand" },
  { value: "one-handed", label: "One-handed backhand" },
] as const;

test("an unanswered required field shows the placeholder, never a guessed default or the raw value", () => {
  const { html, text, triggerText } = renderSelect({
    label: "Player hand",
    value: undefined,
    placeholder: "Hand",
    options: HAND_OPTIONS,
  });
  expect(triggerText).toBe("Hand");
  // No option reads as chosen: no data-icon="Check" anywhere in the render.
  expect(html).not.toContain('data-icon="Check"');
  // Never the literal value.
  expect(text).not.toContain("undefined");
  // Nothing reads as an "Unknown" choice — criterion 1 forbids that option.
  expect(text.toLowerCase()).not.toContain("unknown");
  // The empty-field ink, not the answered-field ink.
  expect(html).toContain("text-[var(--ink-400)]");
});

test("a real answer shows its label and marks exactly that row chosen", () => {
  const { html, text, triggerText } = renderSelect({
    label: "Player hand",
    value: "right",
    placeholder: "Hand",
    options: HAND_OPTIONS,
  });
  expect(triggerText).toBe("Right-handed");
  expect(text).toContain("Right-handed");
  // Exactly one chosen row (one Check icon rendered by FloatMenuItem).
  expect(html.match(/data-icon="Check"/g)?.length).toBe(1);
  // The chosen row is "right", not "left" — the check sits beside the right
  // label, not merely present anywhere in the menu. "Right-handed" also
  // appears once in the trigger itself, so this reads from the menu rows
  // (after the trigger) rather than from the first occurrence overall.
  const menuHtml = html.slice(html.indexOf('data-menu=""'));
  const rightRowIdx = menuHtml.indexOf("Right-handed");
  const leftRowIdx = menuHtml.indexOf("Left-handed");
  const checkIdx = menuHtml.indexOf('data-icon="Check"');
  expect(checkIdx).toBeGreaterThan(-1);
  expect(Math.abs(checkIdx - rightRowIdx)).toBeLessThan(
    Math.abs(checkIdx - leftRowIdx),
  );
});

test("disabled passes through to the trigger, for the opponent fields while naming is in progress", () => {
  const { html } = renderSelect({
    label: "Opponent hand",
    value: undefined,
    placeholder: "Hand",
    options: HAND_OPTIONS,
    disabled: true,
  });
  expect(html).toContain('disabled=""');
});

test("a short backhand label stays on one line, with room reserved for the check, at the width the wizard asks for", () => {
  const { html, text } = renderSelect({
    label: "Player backhand",
    value: "two-handed",
    placeholder: "Backhand",
    options: BACKHAND_OPTIONS,
    width: 220,
  });
  expect(text).toContain("Two-handed backhand");
  // The menu popover honours the explicit width the caller asked for, rather
  // than shrinking to a cramped trigger — this is what keeps the label from
  // wrapping onto a second line.
  expect(html).toContain("width:220px");
  // The check keeps its own reserved slot ahead of the label (FloatMenuItem's
  // `w-3` span) — nothing here reflows the row to make room for it.
  expect(html).toContain('class="mt-[3px] w-3 shrink-0 text-[var(--blue)]"');
});

// ─── DetailsStepContent.tsx wiring ──────────────────────────────────────────

const detailsSrc = readFileSync(`${WIZARD}/DetailsStepContent.tsx`, "utf8");

test("both players get required underline MenuSelect fields for hand and backhand, never a native select or a default", () => {
  // The real primitive, not a hand-rolled popover — imported once and reused
  // for all four fields.
  expect(detailsSrc).toContain(
    'import { MenuSelect } from "@/components/ui/menu-select";',
  );
  expect(detailsSrc).not.toContain("<select");

  for (const [who, hand, backhand] of [
    ["Player", "playerHand", "playerBackhand"],
    ["Opponent", "opponentHand", "opponentBackhand"],
  ] as const) {
    expect(detailsSrc).toContain(`label="${who} hand"`);
    expect(detailsSrc).toContain(`label="${who} backhand"`);
    expect(detailsSrc).toContain(`value={${hand}}`);
    expect(detailsSrc).toContain(`value={${backhand}}`);
    // No `?? "right"` / `?? "one-handed"` style fallback anywhere near the
    // value — an unanswered field must stay unanswered, not read as a
    // plausible guess.
    expect(detailsSrc).not.toContain(`${hand} ??`);
    expect(detailsSrc).not.toContain(`${backhand} ??`);
  }

  // Both fields are wrapped in the labelled, required `Cell` — the underline
  // vocabulary the rest of the Context grid already uses.
  expect(detailsSrc).toContain('<Cell label="Hand" required');
  expect(detailsSrc).toContain('<Cell label="Backhand" required');
  expect(detailsSrc.match(/<Cell label="Hand" required/g)?.length).toBe(2);
  expect(detailsSrc.match(/<Cell label="Backhand" required/g)?.length).toBe(2);

  // No "Unknown" row offered as an option, and the old optional framing is
  // gone. (The doc comment above legitimately names the forbidden pattern in
  // prose, so this checks for an actual option entry, not the bare word.)
  expect(detailsSrc).not.toMatch(/label:\s*"Unknown"/);
  expect(detailsSrc).not.toMatch(/value:\s*"unknown"/);
  expect(detailsSrc).not.toContain("if you know");

  // The Add/Change/Done toggle that used to hide these fields is gone —
  // `StyleWords` and `WordSelect` no longer exist in this file.
  expect(detailsSrc).not.toContain("function StyleWords");
  expect(detailsSrc).not.toContain("function WordSelect");
});

test("the backhand field reserves extra menu width so its longer labels don't wrap", () => {
  expect(detailsSrc.match(/width=\{220\}/g)?.length).toBe(2);
});

test("narrow layouts stack the name and the two style fields instead of wrapping option text", () => {
  // Both player rows switch from a stacked column to a row only at `sm:`,
  // rather than staying side-by-side (and cramped) at every width.
  expect(detailsSrc).toContain(
    'className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-6"',
  );
  expect(
    detailsSrc.match(
      /className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-6"/g,
    )?.length,
  ).toBe(2);
});

test("the opponent's editable name carries a visible edit affordance; the subject's locked name carries none", () => {
  // The opponent's closed-state name button now shows a pencil.
  const opponentButton = detailsSrc.slice(
    detailsSrc.indexOf('title="Change the opponent"'),
  );
  expect(opponentButton.slice(0, 400)).toContain("<Pencil");

  // The workspace's own player name is read back as plain text — no click
  // handler, no pencil — because it was settled on step 1 and is never
  // re-asked here (see the file's own header comment). Scoped to just the
  // name span, not the whole row: the row also carries the Save-to-profile
  // button's own onClick, which is unrelated to the name's editability.
  const subjectNameSpan = detailsSrc.slice(
    detailsSrc.indexOf("The workspace's own player"),
    detailsSrc.indexOf(
      '<div className="flex flex-1 flex-col gap-3 sm:flex-row sm:gap-4">',
    ),
  );
  expect(subjectNameSpan).not.toContain("<Pencil");
  expect(subjectNameSpan).not.toContain("onClick");
});

test("missing hand or backhand answers are collected by the one shared requirements function, not re-derived", () => {
  // `validation.ts` — not this file — owns the missing-answer list; this file
  // only supplies the controls (the doc comment above legitimately names the
  // function in prose, so this checks for an actual import, not the name).
  expect(detailsSrc).not.toMatch(
    /import\s*\{[^}]*collectMatchCompletionRequirements/,
  );

  const validationSrc = readFileSync(`${WIZARD}/validation.ts`, "utf8");
  expect(validationSrc).toContain(
    'if (!input.playerHand) labels.push("player hand");',
  );
  expect(validationSrc).toContain(
    'if (!input.playerBackhand) labels.push("player backhand");',
  );
  expect(validationSrc).toContain(
    'if (!input.opponentHand) labels.push("opponent hand");',
  );
  expect(validationSrc).toContain(
    'if (!input.opponentBackhand) labels.push("opponent backhand");',
  );
  // Unconditional — asked for BOTH import and processing providers, not only
  // the video path.
  const requirementsFn = validationSrc.slice(
    validationSrc.indexOf("export function collectMatchCompletionRequirements"),
  );
  const beforeProcessingGate = requirementsFn.slice(
    0,
    requirementsFn.indexOf("if (input.isProcessingProvider)"),
  );
  expect(beforeProcessingGate).toContain('labels.push("player hand")');
  expect(beforeProcessingGate).toContain('labels.push("opponent backhand")');
});

// ─── UploadMatchFlow.tsx: the visible gate consumes the same function ──────

const flowSrc = readFileSync(`${WIZARD}/UploadMatchFlow.tsx`, "utf8");

test("the footer's missing-answers counter and the write-time gate share one function, so a missing style blocks both", () => {
  expect(flowSrc).toContain(
    "collectMatchCompletionRequirements,\n  wizardContinueBlocked,",
  );
  const missingBlock = flowSrc.slice(
    flowSrc.indexOf("const missing = useMemo("),
    flowSrc.indexOf("// Work in progress, per step."),
  );
  expect(missingBlock).toContain("collectMatchCompletionRequirements({");
  expect(missingBlock).toContain("playerHand: formData.playerHand,");
  expect(missingBlock).toContain("playerBackhand: formData.playerBackhand,");
  expect(missingBlock).toContain("opponentHand: formData.opponentHand,");
  expect(missingBlock).toContain(
    "opponentBackhand: formData.opponentBackhand,",
  );
  // The old hand-rolled duplicate — which never checked hand/backhand at all
  // — is gone.
  expect(flowSrc).not.toContain("CAMERA_POSITION_LABEL");

  // The write-time recheck (`useUploadMatchWizard.ts`, T16) calls the exact
  // same function — one contract, not two that can drift.
  const hookSrc = readFileSync(`${WIZARD}/useUploadMatchWizard.ts`, "utf8");
  expect(hookSrc).toContain("collectMatchCompletionRequirements({");
});

// ─── Criterion 5: profile saving stays explicit and self-only ─────────────

test("the profile-save action is offered only to the subject who IS the uploader, never for the opponent", () => {
  // Only the player row ever renders a "Save to your profile" affordance —
  // there is exactly one call site, and it is gated on `subject.isSelf`.
  expect(detailsSrc.match(/Save to your profile/g)?.length).toBe(1);
  const saveBlock = detailsSrc.slice(
    detailsSrc.indexOf("subject.isSelf &&\n            (playerHand"),
  );
  expect(saveBlock.slice(0, 60)).toContain("subject.isSelf");

  // The opponent row has no equivalent action at all — a coach recording a
  // teammate's or opponent's hand/backhand for this match never sees an
  // affordance that could write it to anyone's profile.
  const opponentBlockStart = detailsSrc.indexOf("The opponent — named here");
  const opponentBlockEnd = detailsSrc.indexOf(
    "{inDual && namingOpponent",
    opponentBlockStart,
  );
  const opponentBlock = detailsSrc.slice(opponentBlockStart, opponentBlockEnd);
  expect(opponentBlock).not.toContain("saveProfile");
  expect(opponentBlock).not.toContain("Save to your profile");
});

test("saveMyStyle only ever writes the CALLER's own row — it takes no target id, so a teammate edit can't reach the uploader's profile or anyone's roster row", () => {
  const actionsSrc = readFileSync("src/lib/wizard/actions.ts", "utf8");
  const fn = actionsSrc.slice(
    actionsSrc.indexOf("export async function saveMyStyle"),
    actionsSrc.indexOf("/** Save (or replace) a draft."),
  );
  // No id parameter of any kind — the only identity involved is read from
  // the session inside the function.
  expect(fn).toMatch(/saveMyStyle\(input: \{\s*hand:/);
  expect(fn).not.toMatch(/userId|playerId|targetId|profileId/);
  // The write is scoped by the session's own id, read via `auth.getUser()`
  // and nothing else.
  expect(fn).toContain("await supabase.auth.getUser()");
  expect(fn).toContain('.from("users")');
  expect(fn).toContain('.eq("id", user.id)');
  // It never touches a roster/program_players table — a teammate's hand and
  // backhand are recorded on the match row only (`player_hand`/
  // `opponent_hand` in `MatchData`), never fed back into anyone's roster row.
  expect(fn).not.toContain("program_players");
});
