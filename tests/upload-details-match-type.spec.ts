import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createLoader } from "./fixtures/vm-modules";

/**
 * Match type on the upload wizard's Details step (`/dashboard/matches/new`,
 * `DetailsStepContent.tsx` via `UploadWizardSteps.tsx`) — T2 of the practice
 * sessions queue.
 *
 * Two layers, like `upload-details-video-section.spec.ts`:
 *   1. `MatchTypeField.tsx` rendered for real — the cell through the real
 *      `MenuSelect`/`FloatMenu`, with only the popover stubbed inline so the
 *      menu rows render in one static pass — plus its pure helpers.
 *   2. Source assertions on `DetailsStepContent.tsx` for the wiring a static
 *      render of the whole step can't observe cheaply: the cell's position,
 *      the Doubles gate, the event pick and where the notice sits.
 */

const WIZARD = "src/components/dashboard/matches/new-match-wizard";
const read = (file: string) =>
  readFileSync(resolve(process.cwd(), file), "utf8");

const popover = {
  Popover: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => children,
  PopoverAnchor: ({ children }: { children: React.ReactNode }) => children,
  PopoverContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { "data-menu": "" }, children),
};

const loader = createLoader({ stubs: { "@/components/ui/popover": popover } });
const mod = loader.load(`${WIZARD}/MatchTypeField.tsx`) as {
  MatchTypeCell: React.ComponentType<Record<string, unknown>>;
  PracticeNotice: React.ComponentType<Record<string, unknown>>;
  matchTypeFieldValue: (raw: string | null | undefined) => string | undefined;
  showsMatchTypeField: (raw: string | null | undefined) => boolean;
  matchTypeForEventKind: (
    kind: string | undefined,
    current: string | null | undefined,
  ) => string;
};

const strip = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

function renderCell(value: string | undefined) {
  const html = renderToStaticMarkup(
    React.createElement(mod.MatchTypeCell, { value, onChange: () => {} }),
  );
  const menuMarker = html.indexOf('data-menu=""');
  const menuStart =
    menuMarker === -1 ? -1 : html.lastIndexOf("<div", menuMarker);
  const trigger = menuStart === -1 ? html : html.slice(0, menuStart);
  const menu = menuStart === -1 ? "" : html.slice(menuStart);
  return { html, trigger: strip(trigger), menu: strip(menu) };
}

// ─── The cell ──────────────────────────────────────────────────────────────

test("the cell is an optional 'Match type' caption over an underline MenuSelect", () => {
  const { html, trigger } = renderCell(undefined);
  expect(trigger.startsWith("Match type")).toBe(true);
  expect(html).not.toContain('aria-label="Required"');
  expect(html).toContain('aria-label="Match type"');
  expect(html).toContain("h-[34px]");
  expect(html).toContain("border-b");
});

test("the menu offers exactly Tournament, Dual Match and Practice, with no descriptions", () => {
  const { menu } = renderCell(undefined);
  expect(menu).toBe("Tournament Dual Match Practice");
});

test("'Not set' when empty or holding a value outside the options", () => {
  for (const raw of [undefined, "", "Singles", "practice match"]) {
    const { trigger, html } = renderCell(raw);
    expect(trigger, String(raw)).toBe("Match type Not set");
    expect(html).not.toContain("Singles");
  }
  expect(mod.matchTypeFieldValue("Singles")).toBeUndefined();
  expect(mod.matchTypeFieldValue("")).toBeUndefined();
});

test("a stored option reads back as itself", () => {
  for (const raw of ["Tournament", "Dual Match", "Practice"]) {
    expect(renderCell(raw).trigger).toBe(`Match type ${raw}`);
    expect(mod.matchTypeFieldValue(raw)).toBe(raw);
  }
});

test("Doubles hides the field; every other value shows it", () => {
  expect(mod.showsMatchTypeField("Doubles")).toBe(false);
  for (const raw of [undefined, "", "Singles", "Practice", "Tournament"])
    expect(mod.showsMatchTypeField(raw)).toBe(true);
});

// ─── The event pick ────────────────────────────────────────────────────────

test("a tournament or dual event sets the type; any other event keeps it", () => {
  expect(mod.matchTypeForEventKind("tournament", "")).toBe("Tournament");
  expect(mod.matchTypeForEventKind("tournament", "Practice")).toBe(
    "Tournament",
  );
  expect(mod.matchTypeForEventKind("dual", "Singles")).toBe("Dual Match");
  expect(mod.matchTypeForEventKind("other", "Practice")).toBe("Practice");
  expect(mod.matchTypeForEventKind(undefined, "Singles")).toBe("Singles");
  expect(mod.matchTypeForEventKind(undefined, undefined)).toBe("");
});

test("the field shows what an event pick writes", () => {
  expect(renderCell(mod.matchTypeForEventKind("tournament", "")).trigger).toBe(
    "Match type Tournament",
  );
  expect(renderCell(mod.matchTypeForEventKind("dual", "")).trigger).toBe(
    "Match type Dual Match",
  );
});

// ─── The notice ────────────────────────────────────────────────────────────

const PRACTICE_COPY =
  "Practice. Shows on Ace's profile under Practice. Win–loss, the season record, head-to-head and season statistics all leave it out.";

test("Practice brings the grey notice naming the player", () => {
  const html = renderToStaticMarkup(
    React.createElement(mod.PracticeNotice, {
      matchType: "Practice",
      profiles: [{ name: "Ace" }],
    }),
  );
  expect(strip(html)).toBe(PRACTICE_COPY);
  expect(html).toContain('<b class="font-medium">Practice.</b>');
  expect(html).toContain('role="status"');
  expect(html).toContain("bg-[var(--surface-subtle)]");
  expect(html).not.toContain("--warning-bg");
});

test("the teammate seam names both players once two are passed", () => {
  const html = renderToStaticMarkup(
    React.createElement(mod.PracticeNotice, {
      matchType: "Practice",
      profiles: [{ name: "Ace" }, { name: "Ben" }],
    }),
  );
  expect(strip(html)).toContain("Shows on Ace's and Ben's profiles under");
});

test("no notice for any other value", () => {
  for (const matchType of [
    undefined,
    "",
    "Tournament",
    "Dual Match",
    "Singles",
    "Doubles",
  ]) {
    const html = renderToStaticMarkup(
      React.createElement(mod.PracticeNotice, {
        matchType,
        profiles: [{ name: "Ace" }],
      }),
    );
    expect(html, String(matchType)).toBe("");
  }
});

// ─── The wiring in DetailsStepContent ──────────────────────────────────────

const details = read(`${WIZARD}/DetailsStepContent.tsx`);
const contextStart = details.indexOf('<SectionHead label="Context"');
const grid = details.indexOf(
  '<div className="grid grid-cols-3 gap-x-6 gap-y-5">',
  contextStart,
);
const videoStart = details.indexOf("{isProcessingProvider && video && (");

test("Match type is the Context grid's first cell, before Event, behind the admin and Doubles gates", () => {
  expect(contextStart).toBeGreaterThan(-1);
  expect(grid).toBeGreaterThan(contextStart);
  const cell = details.indexOf("<MatchTypeCell", grid);
  const gate = details.indexOf(
    // Not in the admin console: its upload routes store Singles or Doubles
    // whatever is picked, so a Practice answer there would be lost.
    "!admin && showsMatchTypeField(formData.matchType) && (",
    grid,
  );
  const firstEvent = details.indexOf('label="Event"', grid);
  expect(gate).toBeGreaterThan(grid);
  expect(cell).toBeGreaterThan(gate);
  expect(cell).toBeLessThan(firstEvent);
  // Nothing but the comment between the grid's opening tag and the gate.
  const between = details
    .slice(grid, gate)
    .replace('<div className="grid grid-cols-3 gap-x-6 gap-y-5">', "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .trim();
  expect(between).toBe("{");
  expect(details.slice(cell, cell + 200)).toContain(
    'onChange={(v) => onInputChange("matchType", v)}',
  );
});

test("the event pick writes matchType through matchTypeForEventKind", () => {
  const eventCell = details.indexOf("<EventCell", grid);
  const pick = details.slice(eventCell, eventCell + 1200);
  expect(pick).toContain(
    'onInputChange(\n                  "matchType",\n                  matchTypeForEventKind(kind, formData.matchType),',
  );
});

test("the notice sits directly under the Context grid, inside Context, before Video", () => {
  const notice = details.indexOf("<PracticeNotice", grid);
  expect(notice).toBeGreaterThan(grid);
  expect(notice).toBeLessThan(videoStart);
  // The grid's closing tag comes right before it (comments aside).
  const before = details
    .slice(details.lastIndexOf("</div>", notice), notice)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .trim();
  expect(before).toBe("</div>");
  expect(details.slice(notice, notice + 200)).toContain(
    "matchType={formData.matchType}",
  );
});

test("the gates, validation and score state never learn about Practice", () => {
  for (const file of ["validation.ts", "useWizardGates.ts", "score-state.ts"]) {
    const src = read(`${WIZARD}/${file}`);
    expect(src, file).not.toMatch(/practice/i);
    expect(src, file).not.toContain("MatchTypeField");
  }
});
