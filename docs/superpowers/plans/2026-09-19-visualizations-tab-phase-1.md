# Visualizations Tab — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the match report's Visualizations view (`?tab=shots`) with the handoff's wall → focused-court flow, URL-held filters, and workspace-scoped saved views — everything that renders inside the normal shell.

**Architecture:** The "you"-only `use-shot-filters.ts` hook is split into a pure per-subject model (`viz-model.ts`) and a pure URL layer (`viz-url.ts`); components read URL state and call the model once per court. Saved views are a new `saved_views` table keyed on `Workspace.id`, read by a server loader and written by server actions.

**Tech Stack:** Next.js 16 App Router, React client components, Tailwind v4 + v3 design tokens, Supabase (RLS), Playwright as the only test runner (pure-logic specs import from `@/…`).

**Spec:** `docs/superpowers/specs/2026-09-19-visualizations-tab-design.md` — read it first. Design source: Claude Design project `afde9116-328b-445c-aeff-8b3c2a702d6f`, `design_handoff_visualizations/README.md` (complete text) and `F4 - Handoff - Visualizations.dc.html` (frames; over DesignSync's 256 KiB cap — view rendered via the user's Chrome, **Present → New tab**).

## Global Constraints

- Branch and PR target **`splitstep-integration`**, never `main`.
- Before any UI work read `docs/ui-revamp-guardrails.md`, `.skills/advantage-analytics-design/SKILL.md`, and the relevant file in `node_modules/next/dist/docs/` (this Next has breaking changes).
- **Attribution (guardrails §4):** "you" is resolved exactly once, by `useMatchSides()` in `shots-tab.tsx`. Every file below it takes `subjectIsPlayer1: boolean`. No file below the tab reads `player1`/`player2` off the match.
- **Won/lost is relative to the subject** (the player whose court is drawn). On the opponent's row green = the opponent won.
- Tokens only (`var(--*)` from `src/styles/design-system/`). The only literals allowed: court `#86AC91` (out), `#6092CE` (court), `#FFFFFF` lines 1.5, point stroke `#000` 0.4, chip `rgba(13,13,13,.72)`.
- Points: `--viz-good` won · `--viz-bad` lost · `--ink-300` miss; r 2.5.
- DS type classes are unlayered and beat Tailwind colour utilities — override colour with inline `style`.
- Buttons `rounded-[6px]`; `rounded-full` only for pills/avatars/indicators. Primary buttons come from `advButton()` (`src/lib/ui/adv-button.ts`).
- Every dropdown is `ui/float-menu.tsx` (`FloatMenu`, `FloatMenuItem`, `FloatMenuNote`, `FloatMenuDivider`); no native `<select>`.
- Motion: 200ms `--ease-primary`; reduced motion keeps opacity, drops transforms.
- Not in Phase 1: fullscreen glyph/viewer, dark surface, Heat/Rally charts, depth/contact bands, Units preference.
- The widget-states commit hook gates `src/components/dashboard/**` edits: run the `widget-states` skill checklist on touched widgets, then `.claude/hooks/widget-states-gate.sh mark` as its **own** command before `git commit`.
- Each task's final check: `npm run typecheck && npm run lint && npx playwright test <its spec>`.
- Each UI task verifies its frame visually against the rendered Present frame using the unauthenticated preview harness (throwaway route outside `/dashboard` + fixtures; delete before `npm test`).

## File Structure

All under `src/components/dashboard/matches/match-detail/shots/` unless noted.

| File                                                                                | Responsibility                                                                        |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `viz-model.ts`                                                                      | Pure: cut/chart/filter vocabulary, predicate, dot + zone + count builders per subject |
| `viz-url.ts`                                                                        | Pure: URLSearchParams ⇄ `VizState`; filter carry-over on cut switch                   |
| `default-cuts.ts`                                                                   | Pure: the three default cuts and their labels/pills                                   |
| `court-art.tsx`                                                                     | The recoloured court SVG + dots for one cut                                           |
| `court-tile.tsx`                                                                    | Wall/band card (art, chip, name, pills, count) — a button                             |
| `viz-wall.tsx`                                                                      | P1a/P1b grid                                                                          |
| `use-viz-state.ts`                                                                  | Client hook: reads `useSearchParams`, writes via `router.replace`                     |
| `viz-toolbar.tsx`, `cut-menu.tsx`, `chart-menu.tsx`                                 | P1c bar, P1d, P1e                                                                     |
| `viz-focused.tsx`, `zone-card.tsx`                                                  | P1c/P1g body                                                                          |
| `filters-popover.tsx`, `applied-strip.tsx`                                          | P1f and the token strip                                                               |
| `saved-views-band.tsx`, `save-view-dialog.tsx`, `manage-tile-menu.tsx`              | 1D UI                                                                                 |
| `src/lib/data/saved-views-server.ts`                                                | Loader + `SavedView` type                                                             |
| `src/app/dashboard/matches/[matchId]/saved-views-actions.ts`                        | Server actions                                                                        |
| `supabase/migrations/<ts>_saved_views.sql`                                          | Table + RLS                                                                           |
| `tests/viz-model.spec.ts`, `tests/viz-url.spec.ts`, `tests/saved-views-rls.spec.ts` | Specs                                                                                 |

Removed in Task 5: `court-header.tsx`, `serve-zones-court.tsx`, `use-shot-filters.ts`, and `zone-table.tsx` if nothing else imports it.

---

# Slice 1A — model + wall

### Task 1: `viz-model.ts` — the pure per-subject model

**Files:**

- Create: `src/components/dashboard/matches/match-detail/shots/viz-model.ts`
- Test: `tests/viz-model.spec.ts`

**Interfaces:**

- Consumes: `MatchPoint` (`@/lib/data/match-points-server`); `pointToServeDot`, `computeZoneStats`, `ServeDot`, `ZoneKey`, `ZoneStats` (`@/lib/data/serve-zones`); from the current `use-shot-filters.ts`: `pointMatchesFilters`, `pointToReturnDots`, `toServeInput`, `isFirstServePoint`, `isReturnOnFirstServe`, `getPointSide`, `returnOutcome` — **move these bodies into `viz-model.ts` verbatim**, renaming the `youIsPlayer1` parameter to `subjectIsPlayer1` and `mode: ShotMode` to `frame: "serve" | "return"`. `use-shot-filters.ts` re-exports them from `viz-model.ts` until Task 5 deletes it, so the old tab keeps compiling.
- Produces:

```ts
export type Cut = "serve" | "returnPlacement" | "returnContact";
export type Chart = "scatter" | "zones";
export type PlayerFilter = "you" | "opponent";
export interface VizFilters extends ShotFilterState {
  player: PlayerFilter;
}
export const EMPTY_VIZ_FILTERS: VizFilters; // all "any", player "you"
export type Outcome = "won" | "lost" | "miss";
export interface VizDot {
  id: string;
  x: number;
  y: number;
  outcome: Outcome;
  shape: "circle" | "triangle";
}
export interface VizResult {
  dots: VizDot[];
  count: number; // points matching the filters
  total: number; // drawable points in the cut's pool
  noun: "serves" | "returns";
  zoneStats: Record<ZoneKey, ZoneStats> | null; // serve cut only
}
export function cutFrame(cut: Cut): "serve" | "return";
export function filterKeysFor(cut: Cut): (keyof VizFilters)[]; // "zone" only on serve
export function computeViz(
  points: MatchPoint[],
  cut: Cut,
  filters: VizFilters,
  subjectIsPlayer1: boolean,
): VizResult;
export function subjectFor(filters: VizFilters, youIsPlayer1: boolean): boolean;
// subjectFor: filters.player === "you" ? youIsPlayer1 : !youIsPlayer1
export function availableSets(points: MatchPoint[]): number[];
```

Coordinate frames: serve dots are `ServeDot.x/y` in the half-court frame (`COURT_W 447 × COURT_H 350`); return dots are `CourtDot.cx/cy` in `FullCourtSVG`'s frame. `VizDot` carries them through untouched; `court-art.tsx` picks the viewBox by cut. Serve outcome: `ServeDot.result` `"won" | "ace"` → `won`, `"lost"` → `lost`, `"doubleFault"` → `miss` (`ServeDot.result` is already server-relative, i.e. subject-relative). Return outcome: `returnOutcome()` `outnet` → `miss`. `returnPlacement` keeps `variant === "landing"` dots; `returnContact` keeps `variant === "contact"`. `count`/`total` count **points**, not dots.

- [ ] **Step 1: Write the failing test**

```ts
// tests/viz-model.spec.ts
import { expect, test } from "@playwright/test";
import type { MatchPoint } from "@/lib/data/match-points-server";
import {
  EMPTY_VIZ_FILTERS,
  computeViz,
  filterKeysFor,
  subjectFor,
} from "@/components/dashboard/matches/match-detail/shots/viz-model";

/** Pure and offline — same model as tests/report-view.spec.ts. */
function point(over: Partial<MatchPoint>): MatchPoint {
  return {
    id: crypto.randomUUID(),
    setNumber: 1,
    serverIsPlayer1: true,
    wonByPlayer1: true,
    pointScore: "0-0",
    gameScore: "0-0",
    rallyLength: 3,
    resultType: "Winner",
    firstShotType: "First Serve",
    firstShotResult: "In",
    firstShotLandingX: -1.0,
    firstShotLandingY: 8.0,
    isBreakPoint: false,
    isSetPoint: false,
    isMatchPoint: false,
    ...over,
  } as MatchPoint;
}

test.describe("computeViz — serve cut", () => {
  const pts = [
    point({ serverIsPlayer1: true, wonByPlayer1: true }),
    point({ serverIsPlayer1: true, wonByPlayer1: false }),
    point({ serverIsPlayer1: false, wonByPlayer1: false }),
  ];

  test("subject = player 1 draws only player 1's serves", () => {
    const r = computeViz(pts, "serve", EMPTY_VIZ_FILTERS, true);
    expect(r.total).toBe(2);
    expect(r.dots.map((d) => d.outcome).sort()).toEqual(["lost", "won"]);
    expect(r.noun).toBe("serves");
    expect(r.zoneStats).not.toBeNull();
  });

  test("subject = player 2: won means player 2 won", () => {
    const r = computeViz(pts, "serve", EMPTY_VIZ_FILTERS, false);
    expect(r.total).toBe(1);
    expect(r.dots[0].outcome).toBe("won"); // p2 served, p1 lost it
  });

  test("result filter is subject-relative", () => {
    const r = computeViz(
      pts,
      "serve",
      { ...EMPTY_VIZ_FILTERS, result: "won" },
      true,
    );
    expect(r.count).toBe(1);
    expect(r.total).toBe(2);
  });
});

test.describe("computeViz — return cuts", () => {
  const ret = point({
    serverIsPlayer1: false,
    wonByPlayer1: true,
    secondShotLandingX: 1.2,
    secondShotLandingY: 4.0,
    secondShotContactX: 0.5,
    secondShotContactY: 23.0,
    secondShotType: "Forehand",
  });

  test("placement keeps landing dots, contact keeps contact dots", () => {
    const place = computeViz([ret], "returnPlacement", EMPTY_VIZ_FILTERS, true);
    const contact = computeViz([ret], "returnContact", EMPTY_VIZ_FILTERS, true);
    expect(place.dots).toHaveLength(1);
    expect(contact.dots).toHaveLength(1);
    expect(place.dots[0].y).not.toBe(contact.dots[0].y);
    expect(place.zoneStats).toBeNull();
    expect(place.noun).toBe("returns");
  });

  test("a return without contact coords counts for placement only", () => {
    const noContact = {
      ...ret,
      secondShotContactX: null,
      secondShotContactY: null,
    } as MatchPoint;
    expect(
      computeViz([noContact], "returnPlacement", EMPTY_VIZ_FILTERS, true).total,
    ).toBe(1);
    expect(
      computeViz([noContact], "returnContact", EMPTY_VIZ_FILTERS, true).total,
    ).toBe(0);
  });
});

test("filterKeysFor: zone exists on serve only", () => {
  expect(filterKeysFor("serve")).toContain("zone");
  expect(filterKeysFor("returnPlacement")).not.toContain("zone");
});

test("subjectFor flips for the opponent and for a player-2 viewer", () => {
  expect(subjectFor({ ...EMPTY_VIZ_FILTERS, player: "you" }, true)).toBe(true);
  expect(subjectFor({ ...EMPTY_VIZ_FILTERS, player: "opponent" }, true)).toBe(
    false,
  );
  expect(subjectFor({ ...EMPTY_VIZ_FILTERS, player: "you" }, false)).toBe(
    false,
  );
});
```

If `MatchPoint` has required fields the `point()` factory misses, add them to the factory (read the interface in `src/lib/data/match-points-server.ts`) — do not loosen the cast further.

- [ ] **Step 2: Run to verify it fails** — `npx playwright test tests/viz-model.spec.ts` → FAIL, module not found.

- [ ] **Step 3: Implement.** Move the listed helpers verbatim, then add:

```ts
export function cutFrame(cut: Cut): "serve" | "return" {
  return cut === "serve" ? "serve" : "return";
}

const BASE_KEYS = [
  "player",
  "set",
  "game",
  "ball",
  "court",
  "pressure",
  "result",
  "rally",
] as const;
export function filterKeysFor(cut: Cut): (keyof VizFilters)[] {
  return cut === "serve" ? [...BASE_KEYS, "zone"] : [...BASE_KEYS];
}

export function subjectFor(
  filters: VizFilters,
  youIsPlayer1: boolean,
): boolean {
  return filters.player === "you" ? youIsPlayer1 : !youIsPlayer1;
}

function serveOutcome(r: ServeDot["result"]): Outcome {
  return r === "lost" ? "lost" : r === "doubleFault" ? "miss" : "won";
}

export function computeViz(
  points: MatchPoint[],
  cut: Cut,
  filters: VizFilters,
  subjectIsPlayer1: boolean,
): VizResult {
  const frame = cutFrame(cut);
  let total = 0;
  let count = 0;
  const dots: VizDot[] = [];
  const serveDots: ServeDot[] = [];

  for (const p of points) {
    if (frame === "serve") {
      if (p.serverIsPlayer1 !== subjectIsPlayer1) continue;
      const dot = pointToServeDot(toServeInput(p));
      if (!dot) continue;
      total++;
      if (!pointMatchesFilters(p, filters, "serve", subjectIsPlayer1)) continue;
      count++;
      serveDots.push(dot);
      dots.push({
        id: p.id,
        x: dot.x,
        y: dot.y,
        outcome: serveOutcome(dot.result),
        shape: "circle",
      });
    } else {
      if (p.serverIsPlayer1 === subjectIsPlayer1) continue;
      const want = cut === "returnPlacement" ? "landing" : "contact";
      const mine = pointToReturnDots(p, subjectIsPlayer1).filter(
        (d) => d.variant === want,
      );
      if (mine.length === 0) continue;
      total++;
      if (!pointMatchesFilters(p, filters, "return", subjectIsPlayer1))
        continue;
      count++;
      const o = returnOutcome(p, subjectIsPlayer1);
      for (const d of mine) {
        dots.push({
          id: String(d.id),
          x: d.cx,
          y: d.cy,
          outcome: o === "outnet" ? "miss" : o,
          shape: d.shape ?? "circle",
        });
      }
    }
  }

  return {
    dots,
    count,
    total,
    noun: frame === "serve" ? "serves" : "returns",
    zoneStats: cut === "serve" ? computeZoneStats(serveDots) : null,
  };
}
```

`pointMatchesFilters` ignores the `player` key (it is resolved by `subjectFor` before the call). In `use-shot-filters.ts` replace the moved bodies with `export { … } from "./viz-model"` and keep the hook working.

- [ ] **Step 4: Run to verify it passes** — `npx playwright test tests/viz-model.spec.ts && npm run typecheck`.
- [ ] **Step 5: Commit** — `feat(viz): pure per-subject visualization model`.

### Task 2: `viz-url.ts` + `default-cuts.ts`

**Files:**

- Create: `…/shots/viz-url.ts`, `…/shots/default-cuts.ts`
- Test: `tests/viz-url.spec.ts`

**Interfaces:**

- Consumes: `Cut`, `Chart`, `VizFilters`, `EMPTY_VIZ_FILTERS`, `filterKeysFor` from Task 1.
- Produces:

```ts
export interface VizState {
  cut: Cut | null;
  chart: Chart;
  filters: VizFilters;
  viewId: string | null;
}
// cut === null ⇒ the wall
export function parseVizState(params: URLSearchParams): VizState;
export function vizStateQuery(params: URLSearchParams, state: VizState): string; // never mutates params; keeps tab and unrelated keys
export function carryFilters(filters: VizFilters, nextCut: Cut): VizFilters;
export function activeFilterEntries(
  state: VizState,
): { key: keyof VizFilters; label: string }[];
// default-cuts.ts
export interface DefaultCut {
  cut: Cut;
  chart: Chart;
  name: string;
  filters: Partial<VizFilters>;
  pills: string[];
}
export const DEFAULT_CUTS: DefaultCut[];
```

URL keys: `cut` (`serve|returnPlacement|returnContact`), `chart` (`scatter` default → absent; `zones`), `player` (`you` default → absent), `set` (number), `game`, `ball`, `court`, `zone`, `pressure`, `result`, `rally`, `view`. Any unknown value parses as the default. `chart=zones` with a non-serve cut parses as `scatter`. `carryFilters` resets `zone` to `"any"` and `result: "ace"` to `"any"` when `nextCut` is not `serve` (the rule in today's `setMode`). `activeFilterEntries` labels are the option labels used in the Filters popover: ball `1st`/`2nd`; court `Deuce`/`Ad`; zone `T`/`Body`/`Wide`; pressure `Break points`/`Set & match points`; result `Won`/`Lost`/`Aces`; rally `1–4 shots`/`5–8 shots`/`9+ shots`; game `Serving`/`Returning`; set `Set N`; player `Opponent` (the `you` default emits no entry).

`DEFAULT_CUTS` (README P1a):

```ts
export const DEFAULT_CUTS: DefaultCut[] = [
  {
    cut: "serve",
    chart: "scatter",
    name: "First serves, every zone",
    filters: { ball: "first" },
    pills: ["1st", "All zones", "Deuce + Ad"],
  },
  {
    cut: "returnPlacement",
    chart: "scatter",
    name: "Return placement",
    filters: {},
    pills: ["All strokes", "Deuce + Ad"],
  },
  {
    cut: "returnContact",
    chart: "scatter",
    name: "Return contact",
    filters: { ball: "first" },
    pills: ["1st serve", "Deuce + Ad"],
  },
];
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/viz-url.spec.ts
import { expect, test } from "@playwright/test";
import { EMPTY_VIZ_FILTERS } from "@/components/dashboard/matches/match-detail/shots/viz-model";
import {
  activeFilterEntries,
  carryFilters,
  parseVizState,
  vizStateQuery,
} from "@/components/dashboard/matches/match-detail/shots/viz-url";

test("no cut param is the wall", () => {
  const s = parseVizState(new URLSearchParams("tab=shots"));
  expect(s.cut).toBeNull();
  expect(s.chart).toBe("scatter");
  expect(s.filters).toEqual(EMPTY_VIZ_FILTERS);
});

test("round trip keeps tab and drops defaults", () => {
  const params = new URLSearchParams("tab=shots&set=2");
  const q = vizStateQuery(params, {
    cut: "serve",
    chart: "zones",
    viewId: null,
    filters: { ...EMPTY_VIZ_FILTERS, ball: "first", zone: "t", set: 2 },
  });
  const back = new URLSearchParams(q);
  expect(back.get("tab")).toBe("shots");
  expect(back.get("player")).toBeNull();
  expect(parseVizState(back)).toEqual({
    cut: "serve",
    chart: "zones",
    viewId: null,
    filters: { ...EMPTY_VIZ_FILTERS, ball: "first", zone: "t", set: 2 },
  });
  expect(params.get("cut")).toBeNull(); // input not mutated
});

test("garbage values read as defaults; zones off serve reads as scatter", () => {
  const s = parseVizState(
    new URLSearchParams("cut=returnContact&chart=zones&ball=third&set=x"),
  );
  expect(s.chart).toBe("scatter");
  expect(s.filters.ball).toBe("any");
  expect(s.filters.set).toBe("any");
  expect(parseVizState(new URLSearchParams("cut=nope")).cut).toBeNull();
});

test("cut = null clears every viz key", () => {
  const q = vizStateQuery(
    new URLSearchParams("tab=shots&cut=serve&ball=first&view=abc"),
    {
      cut: null,
      chart: "scatter",
      viewId: null,
      filters: EMPTY_VIZ_FILTERS,
    },
  );
  expect(q).toBe("tab=shots");
});

test("carryFilters drops serve-only values off serve", () => {
  const f = carryFilters(
    { ...EMPTY_VIZ_FILTERS, zone: "t", result: "ace", ball: "first" },
    "returnPlacement",
  );
  expect(f.zone).toBe("any");
  expect(f.result).toBe("any");
  expect(f.ball).toBe("first");
});

test("activeFilterEntries uses option labels", () => {
  const e = activeFilterEntries({
    cut: "serve",
    chart: "scatter",
    viewId: null,
    filters: {
      ...EMPTY_VIZ_FILTERS,
      ball: "first",
      zone: "t",
      player: "opponent",
    },
  });
  expect(e.map((x) => x.label)).toEqual(["Opponent", "1st", "T"]);
});
```

- [ ] **Step 2: Run** — FAIL, module not found.
- [ ] **Step 3: Implement** with one table driving parse, serialize and labels:

```ts
const OPTIONS = {
  player: { opponent: "Opponent" },
  game: { serving: "Serving", returning: "Returning" },
  ball: { first: "1st", second: "2nd" },
  court: { deuce: "Deuce", ad: "Ad" },
  zone: { t: "T", body: "Body", wide: "Wide" },
  pressure: { break: "Break points", setMatch: "Set & match points" },
  result: { won: "Won", lost: "Lost", ace: "Aces" },
  rally: { short: "1–4 shots", medium: "5–8 shots", long: "9+ shots" },
} as const;
const ORDER = [
  "player",
  "ball",
  "court",
  "zone",
  "result",
  "pressure",
  "rally",
  "game",
] as const;
const VIZ_KEYS = ["cut", "chart", "view", "set", ...ORDER];
```

`parseVizState`: for each `ORDER` key accept the param only if it is a key of `OPTIONS[key]`, else the default (`"you"` for player, `"any"` otherwise); `set` via `Number.parseInt`, accept positive integers. `vizStateQuery`: clone params, delete all `VIZ_KEYS`, then if `state.cut` set `cut`, non-default `chart`, `view`, and each non-default filter **only if** the key is in `filterKeysFor(state.cut)`. `activeFilterEntries`: `ORDER` then `set` (`Set ${n}`), skipping defaults and keys not on the cut.

- [ ] **Step 4: Run** — `npx playwright test tests/viz-url.spec.ts && npm run typecheck`.
- [ ] **Step 5: Commit** — `feat(viz): URL state layer and default cuts`.

### Task 3: court art, tile, and the wall (P1a / P1b)

**Files:**

- Create: `…/shots/court-art.tsx`, `court-tile.tsx`, `viz-wall.tsx`, `use-viz-state.ts`
- Modify: `…/shots/shots-tab.tsx`

**Interfaces:**

- Consumes: Tasks 1–2; `useMatchData()`, `useMatchSides()` (`sides.you.isPlayer1`, `sides.you.name`, `sides.opponent.name` — confirm field names in `use-match-sides.ts`); geometry constants from `visuals/half-court-svg.tsx` (`COURT_W`, `COURT_H`, `DOUBLES_LEFT/RIGHT`, `SINGLES_LEFT/RIGHT`, `SERVICE_Y`, `BASELINE_Y`, `CENTER_X`, `FULL_SVG_*`).
- Produces:

```ts
// use-viz-state.ts
export function useVizState(): {
  state: VizState;
  setState: (next: VizState) => void;
  hrefFor: (next: VizState) => string;
};
// court-art.tsx
export function CourtArt(props: {
  cut: Cut;
  dots: VizDot[];
  className?: string;
}): JSX.Element;
// court-tile.tsx
export function CourtTile(props: {
  playerName: string;
  name: string;
  pills: string[];
  countLabel: string; // "63 of 96" | "55 returns"
  cut: Cut;
  dots: VizDot[];
  href: string;
  overlay?: React.ReactNode; // overlay = Manage ⋯ (Task 9)
}): JSX.Element;
// viz-wall.tsx
export function VizWall(props: {
  savedViewsBand?: React.ReactNode;
}): JSX.Element;
```

- [ ] **Step 1: `use-viz-state.ts`.** `useSearchParams()` → `parseVizState`; `setState` calls `router.replace(\`${pathname}?${vizStateQuery(params, next)}\`, { scroll: false })`; `hrefFor`returns the same string without navigating. Read`node_modules/next/dist/docs/`for`useSearchParams`/`useRouter` in this version first.

- [ ] **Step 2: `court-art.tsx`.** One `<svg>` per cut, `preserveAspectRatio="xMidYMid meet"`, `width="100%"`.
  - `serve`: `viewBox={\`0 0 ${COURT_W} ${COURT_H}\`}`. `<rect>`full viewBox`#86AC91`; court rect `DOUBLES_LEFT…DOUBLES_RIGHT × 0…BASELINE_Y` `#6092CE`; white 1.5 lines: doubles + singles sidelines, baseline at `BASELINE_Y`, service line at `SERVICE_Y`, centre line `CENTER_X`from 0 to`SERVICE_Y`, net at y=0 stroke 2.5.
  - return cuts: `FullCourtSVG`'s frame (`FULL_SVG_PAD_TOP` above the far baseline, `FULL_SVG_PAD_BOTTOM` below the near one). `returnPlacement` crops the viewBox to the far half (far baseline → net, plus pad); `returnContact` crops to the near half plus `FULL_SVG_PAD_BOTTOM` so contact behind the baseline lands on the apron, not on white.
  - Dots: `circle` r 2.5 or, for `shape === "triangle"`, a `polygon` of the same visual size; `fill` `var(--viz-good)` / `var(--viz-bad)` / `var(--ink-300)`; `stroke="#000" strokeWidth={0.4}`; `vectorEffect="non-scaling-stroke"`.
  - `role="img"` with `aria-label` summarising the count.

- [ ] **Step 3: `court-tile.tsx`.** A Next `<Link href={href}>` styled as the card: `surface-card`, `1px solid var(--border-hairline)`, `radius-card`, `shadow-card`; hover `border-medium` + `shadow-card-emphasis`, 200ms `--ease-primary`; visible focus ring per `.skills/…/reference/focus`. Art on top (`overflow:hidden`, top radii). Chip: absolute 10px/10px, height 20, padding `0 7px`, radius pill, `rgba(13,13,13,.72)`, 10/500 white. Label block padding `14px 16px 15px`: name 16/400 `letter-spacing:-0.2px`, single-line ellipsis; row of 10/500 pills (`surface-subtle`, hairline, radius 6, height 20, padding `0 7px`) with the mono tabular count right-aligned in `--ink-500`.

- [ ] **Step 4: `viz-wall.tsx`.** `const subjects = [{ isP1: you.isPlayer1, name: you.name }, { isP1: !you.isPlayer1, name: opponent.name }]`. For each subject × `DEFAULT_CUTS`: `computeViz(points, c.cut, { ...EMPTY_VIZ_FILTERS, ...c.filters }, s.isP1)` inside one `useMemo` keyed on `points` and `you.isPlayer1`. `countLabel`: serve → `` `${count} of ${total}` ``, returns → `` `${count} returns` ``. `href = hrefFor({ cut: c.cut, chart: c.chart, viewId: null, filters: { ...EMPTY_VIZ_FILTERS, ...c.filters, player: s === subjects[0] ? "you" : "opponent" } })`. Grid: `grid-template-columns: repeat(3, minmax(0,1fr)); gap:16px`. A subject whose three cuts all have `total === 0` renders the DS bar-shaped empty state for that row (see `reference/empty-and-loading`) — never an empty court. Render `savedViewsBand` beneath.

- [ ] **Step 5: `shots-tab.tsx`.** Keep the attribution doc comment, updated for "subject". Body: `const { state } = useVizState(); return state.cut === null ? <VizWall /> : <LegacyShots />;` where `LegacyShots` is today's body, kept until Task 5 so the branch is shippable between tasks.

- [ ] **Step 6: Verify.** Typecheck, lint, both specs. Preview harness at 1440: compare with frame **P1a** (six tiles, chips "Reid"/"Okafor" analogue, pills, counts) and **P1b** (no band). Check a match where the viewer is player 2: their row is first. Run the `widget-states` checklist; `pipeline-guardrails-reviewer` agent on the diff.
- [ ] **Step 7: Commit** — `feat(viz): wall of default cuts per player (P1a/P1b)`.

---

# Slice 1B — focused view + menus

### Task 4: toolbar, cut menu, chart menu (P1d / P1e)

**Files:**

- Create: `…/shots/viz-toolbar.tsx`, `cut-menu.tsx`, `chart-menu.tsx`

**Interfaces:**

- Consumes: `useVizState`, `carryFilters`, `FloatMenu`/`FloatMenuItem`/`FloatMenuNote`/`FloatMenuDivider` (props: `open`, `onOpenChange`, `trigger`, `align`, `sideOffset`, `width`, `label`; item: `label`, `description`, `chosen`, `disabled`, `onSelect`, `icon`).
- Produces:

```ts
export function CutMenu(props: {
  savedViews: SavedViewLite[];
  onSaveRequest?: () => void;
}): JSX.Element;
export function ChartMenu(): JSX.Element;
export function VizToolbar(props: {
  savedViews: SavedViewLite[];
  onSaveRequest?: () => void;
  filtersSlot?: React.ReactNode;
  stripSlot?: React.ReactNode;
}): JSX.Element;
export interface SavedViewLite {
  id: string;
  name: string;
  cut: Cut;
  chart: Chart;
  filters: VizFilters;
}
```

- [ ] **Step 1: Trigger style** (shared const in `viz-toolbar.tsx`): height 28, padding `0 8px`, gap 6, radius `var(--radius-element)`, `surface-subtle` → `surface-muted` on hover **and while open**, 13px Lucide glyph + 12/500 label + 12px chevron (`chevron-up` while open), `aria-expanded`.
- [ ] **Step 2: `cut-menu.tsx`.** `FloatMenu width={300} sideOffset={6} align="start" label="View"`. Sections: micro heading "Saved views" + one item per view (`description` = `` `${cutLabel} · ${chartLabel} · ${n} filters` ``) — section omitted when `savedViews` is empty; divider; "All views": Serve placement "Where the serve lands, by zone" · Return placement "Where the return lands" · Return contact "Where the return is struck" · Rally position "Fullscreen viewer" (`disabled`); divider; "Save this view…" (`bookmark-plus`, blue text, hidden when `onSaveRequest` is undefined); `FloatMenuNote`: "A view saves the cut, the chart and the filters. Depth bands are not part of it — they belong to the workspace." Selecting a cut: `setState({ ...state, cut, chart: cut === "serve" ? state.chart : "scatter", filters: carryFilters(state.filters, cut), viewId: null })`. Selecting a saved view replaces cut + chart + filters and sets `viewId`. Glyphs: `crosshair` (serve), `scatter-chart` (returns).
- [ ] **Step 3: `chart-menu.tsx`.** `width={272}`. Scatter "Every landing point, coloured by outcome" · Heat "Fullscreen viewer" (`disabled`, `flame`) · Zones "Count and points won per service box" (rendered only when `state.cut === "serve"`). Note: "Zones is available on Serve placement only. The legend follows the chart."
- [ ] **Step 4: `viz-toolbar.tsx`.** `display:flex; align-items:center; gap:12px`: `<CutMenu/>` `<ChartMenu/>`, then — only when `stripSlot` is non-null — a `1px × 16px` hairline and the strip, `flex:1` spacer, `filtersSlot`.
- [ ] **Step 5: Verify** keyboard: FloatMenu's own arrow/Enter/Esc handling works with the sections (it already uses `use-listbox-nav`; confirm by reading `float-menu.tsx`). Typecheck + lint.
- [ ] **Step 6: Commit** — `feat(viz): cut and chart menus`.

### Task 5: focused view + zone card; retire the old tab (P1c / P1g)

**Files:**

- Create: `…/shots/viz-focused.tsx`, `zone-card.tsx`
- Modify: `…/shots/shots-tab.tsx`
- Delete: `court-header.tsx`, `serve-zones-court.tsx`, `use-shot-filters.ts`; `zone-table.tsx` if `grep -rn "zone-table" src` shows no other importer.

**Interfaces:**

- Consumes: Tasks 1–4; `ZONES` from `@/lib/data/serve-zones`.
- Produces: `export function VizFocused(props: { savedViews: SavedViewLite[]; savedViewsBand?: React.ReactNode; onSaveRequest?: () => void; filtersSlot?: React.ReactNode; stripSlot?: React.ReactNode }): JSX.Element` and `export function ZoneCard(props: { zoneStats: Record<ZoneKey, ZoneStats>; count: number; noun: string }): JSX.Element`.

- [ ] **Step 1: `viz-focused.tsx`.** `const subject = subjectFor(state.filters, you.isPlayer1)`; `const result = useMemo(() => computeViz(points, state.cut, state.filters, subject), …)`. Layout: toolbar; row `display:flex; gap:16px; align-items:flex-start`:
  - Court card `flex:1 1 0; min-width:360px`, card shell as the tile. Header padding `14px 16px 12px`: micro eyebrow left (`` `${subjectName} · ${cutLabel}` ``), 11px blue "Back to wall" right → `setState({ cut:null, chart:"scatter", filters: EMPTY_VIZ_FILTERS, viewId:null })`. Art `max-height:400px`. When `state.chart === "zones"` overlay the six `ZONES` cells (x1→x2, `SERVICE_Y`→0… use the service-box span) filled `var(--viz-you)` with opacity scaled 0.12→0.26 by `zoneStats[key].pct`, and draw no dots. Legend row padding `10px 16px 14px`: 8px dots + micro labels Won · Lost · Miss left; micro right-aligned caption "Half court · landing point" (serve) / "Far half · landing point" (placement) / "Near half · contact point" (contact).
  - `<ZoneCard>` only when `state.cut === "serve"`.
  - `count === 0` with filters applied → DS quiet empty state inside the art area: "No serves match these filters" + blue "Clear" (never an empty court).
- [ ] **Step 2: `zone-card.tsx`.** Width 292, card shell, padding 16. Title 13px "Where the serve went", micro tabular `` `${count} ${noun}` ``. Six rows in `ZONES` order, labelled "Deuce wide/body/T", "Ad T/body/wide": 12px label · 16/300 tabular `winPct`% · 10px mono `count` · 4px bar `var(--viz-you)` width = `pct`%, track `surface-subtle`. Hairline, then an 11px claim→evidence sentence built from the top zone: `` `Most serves went ${label} — ${count} of ${total}, ${winPct}% won.` `` Omit the sentence when `count === 0`.
- [ ] **Step 3: `shots-tab.tsx`** becomes `state.cut === null ? <VizWall/> : <VizFocused savedViews={[]} />`; delete the legacy files; `grep -rn "use-shot-filters\|court-header\|serve-zones-court" src tests` must be empty.
- [ ] **Step 4: Verify.** Specs + typecheck + lint + `npm test` (MAP/design-drift specs). Harness vs frames **P1c** and **P1g**. Wall → tile → focused → Back to wall round-trips through the URL; reload keeps the view; switching Serve → Return placement keeps `ball`, drops `zone`. `widget-states` + `pipeline-guardrails-reviewer`.
- [ ] **Step 5: Commit** — `feat(viz): focused court view; retire the single-court tab`.

---

# Slice 1C — filters

### Task 6: Filters popover + applied strip (P1f)

**Files:**

- Create: `…/shots/filters-popover.tsx`, `applied-strip.tsx`
- Modify: `viz-focused.tsx` (pass the two slots)

**Interfaces:**

- Consumes: `useVizState`, `filterKeysFor`, `activeFilterEntries`, `availableSets`, `computeViz` result (`count`, `total`, `noun`).
- Produces: `FiltersPopover(props: { count: number; total: number; noun: string; sets: number[]; youName: string; opponentName: string })`, `AppliedStrip()` (returns `null` with no entries).

- [ ] **Step 1: `applied-strip.tsx`.** For each `activeFilterEntries(state)`: a 24px pill (`surface-subtle`, hairline, radius 6, 11px, padding `0 4px 0 8px`) with a 16px `x` button (`aria-label={\`Remove ${label}\`}`) that resets that key to its default and clears `viewId`. Then an 11px blue "Clear" → all filters to `EMPTY_VIZ_FILTERS`(including`player`), returning to P1g. Returns `null` when there are no entries so the toolbar drops the divider.
- [ ] **Step 2: `filters-popover.tsx`.** Trigger: toolbar trigger style, `sliders-horizontal` 13px + "Filters", no count badge. Panel on the FloatMenu surface (`surface-card`, `radius 12`, `shadow-dropdown`, hairline), width 400, right-aligned, 6px under the trigger, `role="dialog"` `aria-label="Filters"`, click-outside + Esc close, focus returns to the trigger. Header: 13/500 "Filters" + micro tabular `` `${n} applied · ${count} of ${total} ${noun}` `` + 28px `x`. Body: 2-col grid `gap:14px 20px`, one group per key in this order — Player (single: you / opponent names) · Ball · Court · Zone (only if in `filterKeysFor(cut)`) · Result (Aces only on serve) · Pressure · Rally · Set (`sets`). Each group: micro label + wrap of 26px pills (radius 6, 11px): idle `1px var(--border-hairline)` + `--ink-700`; active `1px var(--border-medium)` + `surface-subtle` + `--ink-900` 500; `aria-pressed`. Clicking the active pill returns the key to default. Every click calls `setState` immediately (live apply) and clears `viewId`. Footer: micro "Changes apply as you pick." + 11px blue "Clear all".
- [ ] **Step 3: Wire** both into `VizFocused` via `filtersSlot` / `stripSlot`.
- [ ] **Step 4: Verify.** Harness vs **P1f**; every key applies, shows as a token, survives reload; removing the last token returns to **P1g** (no strip, no divider). Keyboard: Tab through pills, Esc closes. `design:accessibility-review` pass on the popover.
- [ ] **Step 5: Commit** — `feat(viz): filters popover and applied strip`.

---

# Slice 1D — saved views

### Task 7: `saved_views` table + RLS

**Files:**

- Create: `supabase/migrations/<timestamp>_saved_views.sql` (never hand-format this folder)
- Test: `tests/saved-views-rls.spec.ts`

**Verified against the live DB (2026-09-19):** `Workspace.id` is the user id for a personal workspace and the program id for a team one (same convention as `processing_usage.account_id`). Helpers exist: `public.user_program_role(p_program_id uuid) returns text` (null for non-members) and `public.is_program_staff(p_program_id uuid) returns boolean`, both `SECURITY DEFINER`, `search_path ''`.

- [ ] **Step 1: Load the `supabase:supabase-postgres-best-practices` skill**, then write the migration:

```sql
create table public.saved_views (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null,              -- Workspace.id: auth uid (personal) or programs.id (team)
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  cut         text not null check (cut in ('serve','returnPlacement','returnContact')),
  chart       text not null check (chart in ('scatter','zones')),
  filters     jsonb not null default '{}'::jsonb,
  sort_order  integer not null default 0,
  shared      boolean not null default false, -- true = team-wide (staff-authored); false = private to created_by
  created_by  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- Names are unique within what one person can see as a list: the team's shared
-- views, and each person's own private views.
create unique index saved_views_shared_name_key
  on public.saved_views (account_id, lower(btrim(name))) where shared;
create unique index saved_views_private_name_key
  on public.saved_views (account_id, created_by, lower(btrim(name))) where not shared;
create index saved_views_account_order_idx on public.saved_views (account_id, sort_order);

alter table public.saved_views enable row level security;

-- Read: your personal views; a team's shared views if you are a member; your own private team views.
create policy saved_views_select on public.saved_views for select to authenticated
  using (
    account_id = (select auth.uid())
    or (public.user_program_role(account_id) is not null
        and (shared or created_by = (select auth.uid())))
  );

-- Create: personal (private); staff may create shared or private; any member may create private-to-self.
create policy saved_views_insert on public.saved_views for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      (account_id = (select auth.uid()) and not shared)
      or public.is_program_staff(account_id)
      or (public.user_program_role(account_id) is not null and not shared)
    )
  );

-- Edit / delete: your own rows; staff may also manage the team's shared rows.
-- The WITH CHECK stops a player promoting a private view to shared.
create policy saved_views_update on public.saved_views for update to authenticated
  using (
    (created_by = (select auth.uid())
      and (account_id = (select auth.uid()) or public.user_program_role(account_id) is not null))
    or (shared and public.is_program_staff(account_id))
  )
  with check (
    (not shared
      and created_by = (select auth.uid())
      and (account_id = (select auth.uid()) or public.user_program_role(account_id) is not null))
    or public.is_program_staff(account_id)
  );

create policy saved_views_delete on public.saved_views for delete to authenticated
  using (
    (created_by = (select auth.uid())
      and (account_id = (select auth.uid()) or public.user_program_role(account_id) is not null))
    or (shared and public.is_program_staff(account_id))
  );
```

Players in a team workspace read the coach's views but cannot write them. The column is `sort_order`, not `order` (reserved word); the TS type exposes it as `order`.

- [ ] **Step 2: Apply to live** with the Supabase MCP `apply_migration` (name `saved_views`) — **confirm with the user first**; then `get_advisors` (security) must report nothing new for `saved_views`.
- [ ] **Step 3: RLS spec** — follow the pattern of `tests/admin-conferences-rpcs.spec.ts` (throwaway users via service role, retrying sign-in fixture): user A inserts a personal view; user B selects → 0 rows; B inserts with `account_id = A` → rejected; duplicate name differing only by case → unique violation. Team cases against the ZZ Test Program pattern (throwaway program + members created and removed by the spec via service role): a player inserts `shared=false` → ok and invisible to a second player and to staff; a player inserts `shared=true` → rejected; a player updates their row to `shared=true` → rejected; staff inserts `shared=true` → visible to the player; the player cannot update or delete the staff row; two players may each own a private view with the same name. Clean up both users.
- [ ] **Step 4: `rls-boundary-reviewer` agent** on the migration. Commit — `feat(viz): saved_views table with workspace RLS`.

### Task 8: loader + server actions

**Files:**

- Create: `src/lib/data/saved-views-server.ts`, `src/app/dashboard/matches/[matchId]/saved-views-actions.ts`
- Modify: `src/app/dashboard/matches/[matchId]/page.tsx` (load + pass down), `match-report.tsx` / the `ShotsTab` call site (thread `savedViews` + `workspaceRole`)

**Interfaces:**

- Produces:

```ts
// saved-views-server.ts
export interface SavedView {
  id: string;
  name: string;
  cut: Cut;
  chart: Chart;
  filters: VizFilters;
  order: number;
}
export const getSavedViews: (accountId: string) => Promise<SavedView[]>; // React cache(); ordered by sort_order, created_at
// saved-views-actions.ts  ("use server")
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: "duplicate_name" | "forbidden" | "invalid" };
export async function createSavedView(input: {
  name: string;
  cut: Cut;
  chart: Chart;
  filters: VizFilters;
}): Promise<ActionResult<SavedView>>;
export async function renameSavedView(
  id: string,
  name: string,
): Promise<ActionResult>;
export async function duplicateSavedView(
  id: string,
): Promise<ActionResult<SavedView>>; // "<name> copy", then "copy 2"…
export async function deleteSavedView(
  id: string,
): Promise<ActionResult<SavedView>>; // returns the row for Undo
export async function restoreSavedView(view: SavedView): Promise<ActionResult>;
export async function reorderSavedViews(
  orderedIds: string[],
): Promise<ActionResult>;
```

- [ ] **Step 1:** Loader uses the **server** Supabase client (RLS-scoped, never `admin.ts`). `filters` jsonb is re-validated through `parseVizState`-style narrowing: build a `URLSearchParams` from the object and parse, so a stale row can never inject an unknown value.
- [ ] **Step 2:** Actions resolve `accountId` from `getWorkspaceContext()` — never from the client. Postgres `23505` → `duplicate_name`; RLS rejection → `forbidden`. New rows get `sort_order = max + 1`. Each action ends with `revalidatePath` for the match page (check the Next 16 docs for the current API).
- [ ] **Step 3:** Everyone can save. `createSavedView` sets `shared = workspace.kind === "team" && workspace.role !== "player"`. The loader returns `SavedView & { shared: boolean; mine: boolean }`; `canManage(view) = view.mine || (view.shared && workspace.role !== "player")` decides per tile whether the ⋯ menu shows. Reorder only reorders rows the caller may manage.
- [ ] **Step 4:** Typecheck; `rls-boundary-reviewer` on the diff. Commit — `feat(viz): saved views loader and actions`.

### Task 9: band, Save dialog, Manage (P1a band / P1h / P2f-on-light)

**Files:**

- Create: `…/shots/saved-views-band.tsx`, `save-view-dialog.tsx`, `manage-tile-menu.tsx`
- Modify: `shots-tab.tsx`, `viz-wall.tsx`, `viz-focused.tsx`, `cut-menu.tsx` call sites; `report-facts.tsx` call site for the "· n saved views" suffix.

- [ ] **Step 1: `saved-views-band.tsx`.** Returns `null` when `views.length === 0` (**P1b: the absence of the band, never an empty band**). Otherwise: `margin-top:8px; padding-top:24px; border-top:1px solid var(--border-hairline)`; heading 24/300 `-0.3px` "Saved views" + micro count; right: 11px blue "Manage views" (only if at least one view has `canManage(view)`; in Manage mode only manageable tiles get the ⋯ button and drag). Same 3-col grid of `CourtTile`s (dots via `computeViz` with the view's filters and `subjectFor`), chip = the subject's name; last cell a dashed "New view" tile (`min-height:220px; 1px dashed var(--border-medium)`, hover border `--blue`) that opens the focused view on the Serve cut with the Save dialog closed. On the focused page a tile click **loads the view into the card above** (`setState` with `viewId`) instead of navigating.
- [ ] **Step 2: `save-view-dialog.tsx`.** Light-surface version of P2f, 332px, anchored under the cut-menu trigger: 13/500 "Save this view"; micro "Name" + 32px boxed field (`1px var(--border-field)` → `--blue` focused); "Saves" well (`surface-subtle`, radius 8): definition line `` `${cutLabel} · ${chartLabel} · ${n} filters` `` in `--ink-700`, exclusion "Depth bands are not part of a view." in `--ink-500`; Cancel (text) · "Save view" (`advButton()`, 32px). Enter saves, Esc cancels. Duplicate name (checked case-insensitively on blur against the loaded list, and again from the action's `duplicate_name`): field border `var(--error)`, `aria-invalid`, `role="alert"` 11px error "A view with this name already exists.", Save at 45% opacity + `aria-disabled`. On success `setState({ …state, viewId: created.id })`.
- [ ] **Step 3: Manage mode.** Header swaps to micro "Drag a view to reorder · ⋯ to rename or delete" + 11px blue "Done". Each tile gets `overlay`: a 24px `more-horizontal` button top-right (`rgba(13,13,13,.72)`, white glyph). `manage-tile-menu.tsx`: `role="menu"`, 188px: Rename… (`pencil`) · Duplicate (`copy`) · divider · Delete view (`trash-2`, `var(--error)`, last). Rename = in-place underline field over the tile name (Enter commits, Esc reverts, duplicate rule as above). Delete = immediate, optimistic, with a `role="status"` line "View deleted · Undo" for 6s calling `restoreSavedView`; no confirm dialog. Reorder = pointer events (no HTML5 DnD): held tile gets `shadow-card-emphasis` + `2px solid var(--blue)` outline, siblings slide 200ms with no bounce, drop calls `reorderSavedViews`; keyboard alternative: focused tile + ⌥↑/⌥↓ moves it. Reduced motion: no slide.
- [ ] **Step 4: Title-row count.** Append `` ` · ${n} saved views` `` to the points/games fact when `n > 0`; nothing when 0.
- [ ] **Step 5: Verify.** Harness vs **P1a** band, **P1h**, and the dialog against **P2f/P2g** geometry. Manual: save → tile on wall and focused; rename / duplicate / delete-undo / reorder persist across reload; a team `player` sees the staff's shared views read-only, can save their own private views, and can manage only those. `widget-states`, `pipeline-guardrails-reviewer`, `rls-boundary-reviewer`.
- [ ] **Step 6: Commit** — `feat(viz): saved views band, save dialog and manage mode`.

### Task 10: end-to-end spec + wrap-up

- [ ] **Step 1:** `tests/viz-flow.spec.ts` on the live-DB fixture pattern (`tests/fixtures`, retrying sign-in): wall shows six tiles → click first → URL has `cut=serve&ball=first` → open Filters, pick Zone T → token "T" visible and URL has `zone=t` → reload keeps it → "Back to wall" clears viz keys.
- [ ] **Step 2:** `npm run format && npm run lint && npm run typecheck && npm test`. `npm run map` only if a route was added (none expected).
- [ ] **Step 3:** Update `docs/README.md` index with the spec + plan; note in the spec that Phase 1 landed. Commit and open the PR into `splitstep-integration`.

---

## Self-Review

- **Spec coverage:** wall P1a/P1b → T3; focused P1c/P1g → T5; menus P1d/P1e → T4; filters P1f → T6; saved views + Manage P1h + Save dialog → T7–T9; URL state → T2; attribution → T1 + constraints; removal of old files → T5; analysing state unchanged (page.tsx); copy flags → T9 step 4; Units/fullscreen explicitly excluded.
- **Types:** `Cut`, `Chart`, `VizFilters`, `VizState`, `VizDot`, `VizResult`, `SavedView`/`SavedViewLite` (`SavedView` is assignable to `SavedViewLite`) are defined once and used with the same names throughout. DB column `sort_order` ↔ TS `order` is mapped only in `saved-views-server.ts`.
- **Known judgement calls for the executor to confirm against the rendered frames, not to invent:** menu second-line copy for the two return cuts, the zone card's title string, and legend captions — read them off frames P1c/P1d before committing Tasks 4–5.
