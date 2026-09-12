import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

import { expect, test } from "@playwright/test";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

import { providers } from "@/lib/providers";
import { providerKindOrNull } from "@/lib/services/upload";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/data/match-utils";
import {
  canUploadForProgram,
  explainVideoRefusal,
  type Workspace,
} from "@/lib/workspace/types";
import { noteStripCls } from "@/components/dashboard/matches/new-match-wizard/styles";

/**
 * Step 1's three selects — Workspace, For, Source — rendered for real.
 *
 * The step is the one place the wizard asks who played and what the match is
 * made from, so the things this file proves are the things a reader cannot
 * check by eye:
 *
 *   1. Advantage Intelligence is the first ELIGIBLE source on fresh entry, and
 *      a provider with no strategy is not offered at all.
 *   2. Reordering the display list moves no default: the wizard resolves its
 *      source by KIND, so an explicit choice, a resumed draft, a link that
 *      named a source and an import-only preset all still land where they did.
 *   3. Every chosen row — workspace, source, athlete — carries the ONE shared
 *      chosen-row treatment from `ui/float-menu.tsx`: a Signal Blue check in
 *      its own slot, no standing fill, no pointer-hover fill on the pick.
 *   4. Labels are still readable and focus is still visible.
 *
 * The component is transpiled into a VM rather than imported: Playwright's own
 * transform rewrites JSX to its fixture runtime, so a directly imported
 * component cannot be handed to `renderToStaticMarkup`. Same trick as
 * `tests/upload-identity.spec.ts`. No server, no database — this runs in the
 * keyless `npm test`.
 */

const WIZARD = "src/components/dashboard/matches/new-match-wizard";

// ─── Rendering the real step ───────────────────────────────────────────────

interface RosterOptionLike {
  playerId: string;
  userId: string | null;
  name: string;
  ladderPosition: number | null;
  classYear: string | null;
  email: string | null;
  managedBy: "coach" | "self";
  invitedEmail: string | null;
}

interface StepProps {
  selectedProvider: string | null;
  onProviderSelect: (id: string | null) => void;
  whoPlayed: {
    required: boolean;
    roster: RosterOptionLike[] | null;
    loadFailed: boolean;
    uploaderName: string | null;
    subject: { kind: "roster"; playerId: string; name: string } | null;
    choose: (subject: unknown) => void;
  };
}

interface WorkspaceContext {
  active: Workspace;
  available: Workspace[];
  viewer: { id: string; name: string; initials: string; email: string };
}

/** The context the render is standing in, swapped per test. */
let context: WorkspaceContext;

const stepModule = (() => {
  const exports: { SourceStepContent?: React.ComponentType<StepProps> } = {};
  const { outputText } = ts.transpileModule(
    readFileSync(resolve(`${WIZARD}/SourceStepContent.tsx`), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    },
  );

  // Icons render as a marked span so a Check is observable, and so are the
  // classes it was given — which is where `--blue` has to land.
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

  // The popover is a portal at runtime; here every menu renders inline and
  // tagged, so one static render carries all three selects.
  const popover = {
    Popover: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    PopoverTrigger: ({ children }: { children: React.ReactNode }) => children,
    PopoverContent: ({
      children,
      ...rest
    }: {
      children: React.ReactNode;
      "aria-label"?: string;
    }) =>
      React.createElement(
        React.Fragment,
        null,
        React.createElement(
          "div",
          { "data-menu": rest["aria-label"] ?? "Where this match is filed" },
          children,
        ),
        // The menu is a portal at runtime, so nothing that follows it in this
        // file's DOM is inside it. The marker is how the reader below knows.
        React.createElement("i", { "data-menu-end": "" }),
      ),
  };

  runInNewContext(outputText, {
    exports,
    require: (id: string) => {
      if (id === "react/jsx-runtime") return jsx;
      if (id === "react") return React;
      if (id === "lucide-react") return icons;
      if (id === "next/link")
        return {
          default: ({
            children,
            ...rest
          }: {
            children: React.ReactNode;
          } & Record<string, unknown>) =>
            React.createElement("a", rest, children),
        };
      if (id === "@/components/ui/popover") return popover;
      if (id === "@/components/ui/state-pill")
        return {
          StatePill: ({ children }: { children: React.ReactNode }) =>
            React.createElement("span", { "data-pill": "" }, children),
        };
      // A server action. Nothing in this file awaits it.
      if (id === "@/lib/workspace/actions")
        return { setActiveWorkspaceInPlace: async () => true };
      if (id === "@/components/dashboard/workspace-provider")
        return { useWorkspace: () => context };
      // Everything below is the REAL module: the ordering, the kind lookup and
      // the class composition are the things under test.
      if (id === "@/lib/utils") return { cn };
      if (id === "@/lib/data/match-utils") return { getInitials };
      if (id === "@/lib/providers") return { providers };
      if (id === "@/lib/services/upload") return { providerKindOrNull };
      if (id === "@/lib/workspace/types")
        return { canUploadForProgram, explainVideoRefusal };
      if (id === "./styles") return { noteStripCls };
      throw new Error(`unexpected import in the source step: ${id}`);
    },
  });
  return exports;
})();

// ─── Fixtures ──────────────────────────────────────────────────────────────

function team(over: Partial<Workspace> = {}): Workspace {
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
    ...over,
  } as Workspace;
}

function personal(): Workspace {
  return {
    ...team(),
    id: "u-viewer",
    kind: "personal",
    name: "You",
    role: "owner",
    mark: "R",
  } as Workspace;
}

const VIEWER = {
  id: "u-viewer",
  name: "Riley Reproduction",
  initials: "RR",
  email: "riley@example.com",
};

function player(over: Partial<RosterOptionLike> = {}): RosterOptionLike {
  return {
    playerId: "pp-marcus",
    userId: null,
    name: "Marcus Webb",
    ladderPosition: 2,
    classYear: "Junior",
    email: null,
    managedBy: "coach",
    invitedEmail: null,
    ...over,
  };
}

// ─── One row, as the browser would see it ──────────────────────────────────

interface Row {
  html: string;
  text: string;
  /** The classes on the row control itself. */
  cls: string;
  /** A Signal Blue check inside the row. */
  check: boolean;
  /** A grey capsule — the You / Coach-managed pill. */
  pill: string | null;
  /** Where the check sits relative to the pill, when both are present. */
  checkAfterPill: boolean;
}

function strip(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** The rows of one named menu, in the order the DOM puts them. */
function menu(html: string, label: string): Row[] {
  const marker = `data-menu="${label}"`;
  const start = html.indexOf(marker);
  expect(start, `menu "${label}" is rendered`).toBeGreaterThan(-1);
  const end = html.indexOf("data-menu-end", start + marker.length);
  expect(end, `menu "${label}" is closed`).toBeGreaterThan(-1);
  const slice = html.slice(start, end);

  return [...slice.matchAll(/<(button|a)\b([^>]*)>(.*?)<\/\1>/g)].map((m) => {
    const inner = m[3];
    const checkIdx = inner.indexOf('data-icon="Check"');
    const pillIdx = inner.indexOf("data-pill");
    const checkTag = /<span[^>]*data-icon="Check"[^>]*>/.exec(inner)?.[0] ?? "";
    return {
      html: m[0],
      text: strip(inner),
      cls: /class="([^"]*)"/.exec(m[2])?.[1] ?? "",
      check: checkIdx !== -1 && checkTag.includes("text-[var(--blue)]"),
      pill:
        pillIdx === -1
          ? null
          : strip(
              /<span[^>]*data-pill[^>]*>(.*?)<\/span>/.exec(inner)?.[1] ?? "",
            ),
      checkAfterPill: checkIdx !== -1 && pillIdx !== -1 && checkIdx > pillIdx,
    } satisfies Row;
  });
}

function render(
  props: Partial<StepProps> = {},
  ctx?: Partial<WorkspaceContext>,
) {
  context = {
    active: personal(),
    available: [personal(), team()],
    viewer: VIEWER,
    ...ctx,
  };
  const Step = stepModule.SourceStepContent!;
  return renderToStaticMarkup(
    React.createElement(Step, {
      selectedProvider: "splitstep",
      onProviderSelect: () => {},
      whoPlayed: {
        required: false,
        roster: null,
        loadFailed: false,
        uploaderName: VIEWER.name,
        subject: null,
        choose: () => {},
      },
      ...props,
    } as StepProps),
  );
}

const SOURCE_MENU = "What this match is made from";
const FOR_MENU = "Who played this match";
const WORKSPACE_MENU = "Where this match is filed";

// ─── 1. Advantage Intelligence first, among the eligible ───────────────────

test("the source menu opens on Advantage Intelligence, before the import source", () => {
  const rows = menu(render(), SOURCE_MENU);

  expect(rows).toHaveLength(2);
  expect(rows[0].text.startsWith("Advantage Intelligence")).toBe(true);
  expect(rows[1].text.startsWith("SwingVision export")).toBe(true);
  // Never the vendor's internal name.
  expect(rows.map((r) => r.text).join(" ")).not.toMatch(/splitstep/i);
});

test("a source with no strategy is not offered at all", () => {
  // ATP is `available: false` in the display list and has no registry entry.
  const atp = providers.find((p) => p.id === "atp-tour");
  expect(atp?.available).toBe(false);
  expect(providerKindOrNull("atp-tour")).toBeNull();
  expect(menu(render(), SOURCE_MENU).some((r) => /ATP/.test(r.text))).toBe(
    false,
  );
  expect(render()).not.toContain("ATP TOUR");
});

test("the eligible list is ordered, not merely filtered", () => {
  const eligible = providers.filter((p) => p.available !== false);
  expect(eligible.map((p) => p.id)).toEqual(["splitstep", "swing-vision"]);
  expect(providerKindOrNull("splitstep")).toBe("processing");
  expect(providerKindOrNull("swing-vision")).toBe("import");
});

// ─── 2. Ordering moves no default ──────────────────────────────────────────

test("every default source is resolved by kind, so the order cannot change one", () => {
  const hook = readFileSync(
    resolve(`${WIZARD}/useUploadMatchWizard.ts`),
    "utf8",
  );

  // The two defaults are found by kind — never by index, never by name.
  expect(hook).toMatch(
    /DEFAULT_PROVIDER_ID[^=]*=\s*providers\.find\(\s*\(p\) =>\s*p\.available !== false && providerKindOrNull\(p\.id\) === "processing",/,
  );
  expect(hook).toMatch(
    /DEFAULT_IMPORT_PROVIDER_ID[^=]*=\s*providers\.find\(\s*\(p\) =>\s*p\.available !== false && providerKindOrNull\(p\.id\) === "import",/,
  );
  expect(hook).not.toMatch(/providers\[\d+\]/);

  // What those two expressions resolve to, on the list as it is ordered now.
  const byKind = (kind: string) =>
    providers.find(
      (p) => p.available !== false && providerKindOrNull(p.id) === kind,
    )?.id ?? null;
  expect(byKind("processing")).toBe("splitstep");
  expect(byKind("import")).toBe("swing-vision");

  // An import-only preset is handed the IMPORT provider — whose step order
  // skips the video step, so the wizard never offers video for a line that
  // `job-request.ts` would refuse after the upload.
  expect(hook).toContain(
    "preset.supportsVideo\n        ? DEFAULT_PROVIDER_ID\n        : DEFAULT_IMPORT_PROVIDER_ID",
  );
  const order = readFileSync(resolve(`${WIZARD}/types.ts`), "utf8");
  const importOrder = /import:\s*\[([^\]]*)\]/.exec(order)?.[1] ?? "";
  expect(importOrder).not.toContain("video");

  // An explicit answer still outranks the default: a link that named a source,
  // a stored choice, and a resumed draft each set the provider themselves.
  expect(hook).toContain("setSelectedProvider(initialProvider);");
  expect(hook).toContain(
    "setSelectedProvider(existingProvider as ProviderId);",
  );
  expect(hook).toContain("setSelectedProvider(draftProvider);");
});

test("the step marks whatever source it was handed, not the first one", () => {
  const rows = menu(render({ selectedProvider: "swing-vision" }), SOURCE_MENU);
  expect(rows.map((r) => r.check)).toEqual([false, true]);
  expect(rows[1].html).toContain('aria-selected="true"');
  expect(rows[0].html).toContain('aria-selected="false"');
});

// ─── 3. The shared chosen-row treatment ────────────────────────────────────

/** What `ui/float-menu.tsx` settled: a blue check, and no fill on the pick. */
function expectSharedTreatment(rows: Row[], chosenIndex: number) {
  rows.forEach((row, i) => {
    const chosen = i === chosenIndex;
    expect(row.check, `row ${i} check`).toBe(chosen);
    // No standing fill, and no pointer-hover fill, on the chosen row.
    expect(row.cls.includes("hover:bg-[var(--surface-subtle)]")).toBe(!chosen);
    expect(row.cls).not.toMatch(/(^|\s)bg-\[var\(--surface-subtle\)\]/);
    // Keyboard focus stays visible on every row, chosen or not.
    expect(row.cls).toContain("focus-visible:bg-[var(--surface-subtle)]");
    expect(row.cls).toContain("focus-visible:outline-none");
  });
}

test("the chosen source row carries the blue check and no wash", () => {
  expectSharedTreatment(menu(render(), SOURCE_MENU), 0);
});

test("the chosen workspace row carries the blue check and no wash", () => {
  expectSharedTreatment(menu(render(), WORKSPACE_MENU), 0);

  const second = menu(
    render({}, { active: team(), available: [personal(), team()] }),
    WORKSPACE_MENU,
  );
  expectSharedTreatment(second, 1);
});

test("the chosen athlete row carries the blue check and no wash", () => {
  const roster = [
    player(),
    player({ playerId: "pp-ava", name: "Ava Stone", ladderPosition: 1 }),
  ];
  const html = render(
    {
      whoPlayed: {
        required: true,
        roster,
        loadFailed: false,
        uploaderName: VIEWER.name,
        subject: { kind: "roster", playerId: "pp-ava", name: "Ava Stone" },
        choose: () => {},
      },
    },
    { active: team(), available: [personal(), team()] },
  );

  // "Someone new" is a link, not an option, and is never the chosen row.
  const rows = menu(html, FOR_MENU);
  expect(rows[0].text).toContain("Someone new");
  expect(rows[0].check).toBe(false);

  const options = rows.filter((r) => r.html.includes('role="option"'));
  expect(options.map((r) => r.text.includes("Marcus Webb"))).toEqual([
    true,
    false,
  ]);
  expect(options[1].text).toContain("Ava Stone");
  expectSharedTreatment(options, 1);
});

// ─── 4. The check and T12's You pill are two facts, not one ────────────────

test("the viewer's own roster row shows both the You pill and the check", () => {
  const roster = [
    player({
      playerId: "pp-me",
      name: "Riley Reproduction",
      userId: VIEWER.id,
    }),
    player(),
  ];
  const options = menu(
    render(
      {
        whoPlayed: {
          required: true,
          roster,
          loadFailed: false,
          uploaderName: VIEWER.name,
          subject: {
            kind: "roster",
            playerId: "pp-me",
            name: "Riley Reproduction",
          },
          choose: () => {},
        },
      },
      { active: team(), available: [personal(), team()] },
    ),
    FOR_MENU,
  ).filter((r) => r.html.includes('role="option"'));

  const mine = options[0];
  expect(mine.pill).toBe("You");
  expect(mine.check).toBe(true);
  // Who this is, then what is picked — the pill first, the check last, each in
  // its own slot so neither is read as the other.
  expect(mine.checkAfterPill).toBe(true);
  expect(mine.text).toContain("Riley Reproduction");
  expect(mine.text).toContain("Your own match");

  // A coach-managed profile keeps its own pill and takes no check.
  expect(options[1].pill).toBe("Coach-managed");
  expect(options[1].check).toBe(false);

  // T12's rule still holds: no generic uploader row to misattribute to.
  expect(options.some((r) => r.text.includes("Myself"))).toBe(false);
});

test("an unchosen row keeps the check's slot, so labels stay on one grid", () => {
  const options = menu(
    render(
      {
        whoPlayed: {
          required: true,
          roster: [player(), player({ playerId: "pp-ava", name: "Ava Stone" })],
          loadFailed: false,
          uploaderName: VIEWER.name,
          subject: null,
          choose: () => {},
        },
      },
      { active: team(), available: [personal(), team()] },
    ),
    FOR_MENU,
  ).filter((r) => r.html.includes('role="option"'));

  for (const row of options) {
    expect(row.check).toBe(false);
    // The reserved 13px slot, so nothing shifts when a pick is made.
    expect(row.html).toContain('class="w-[13px] shrink-0"');
  }
});

// ─── 5. Labels readable, focus visible ─────────────────────────────────────

test("every option is named, and the check is decoration only", () => {
  const html = render(
    {
      whoPlayed: {
        required: true,
        roster: [player()],
        loadFailed: false,
        uploaderName: VIEWER.name,
        subject: { kind: "roster", playerId: "pp-marcus", name: "Marcus Webb" },
        choose: () => {},
      },
    },
    { active: team(), available: [personal(), team()] },
  );

  for (const label of [SOURCE_MENU, FOR_MENU, WORKSPACE_MENU]) {
    for (const row of menu(html, label)) {
      expect(row.text.length, `${label}: every row is named`).toBeGreaterThan(
        0,
      );
      expect(row.cls).toContain("focus-visible:");
    }
  }
  // The check is never the only thing saying a row is chosen.
  expect(html).toContain('data-icon="Check"');
  expect(html).toMatch(/aria-hidden="true"[^>]*data-icon="Check"/);
  expect(html).toContain('aria-selected="true"');

  // A long source label truncates rather than wrapping the row out of its
  // 38px rhythm, and the subline already did.
  const source = menu(html, SOURCE_MENU);
  expect(source[0].html).toContain(
    'class="truncate text-[13px] font-medium text-[var(--ink-900)]"',
  );
});

test("a roster that could not load says so instead of rendering rows", () => {
  const html = render(
    {
      whoPlayed: {
        required: true,
        roster: null,
        loadFailed: true,
        uploaderName: VIEWER.name,
        subject: null,
        choose: () => {},
      },
    },
    { active: team(), available: [personal(), team()] },
  );
  expect(strip(html)).toContain("The roster couldn't be loaded.");
  expect(
    menu(html, FOR_MENU).filter((r) => r.html.includes('role="option"')),
  ).toHaveLength(0);
});
