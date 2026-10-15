/**
 * What an answer offers to do next: the action catalogue
 * (docs/ask-improvement-roadmap.md, 6.4).
 *
 * A short, server-defined list — never anything the model writes — built from
 * what the answer already holds: its sources, its figures, its visual block
 * and the question's tags. Each entry is drawn as a card with one button
 * (`ask-actions.tsx`), and nothing here executes anything: a link action
 * carries an `href`, a save or a pin is a request the page makes only on a
 * click and only through the app's own confirmation, and an export is a
 * file the browser is handed. The list is capped at `MAX_ASK_ACTIONS` in the
 * order below, which is the order of use: the film first, then keeping
 * something, then the places the answer came from.
 *
 *   watch         the Video tab of the one source match on the first
 *                 figure's points (`figure-video.ts`)
 *   pin           keep the visual block on Home (`ask_pins`): the personal
 *                 Home's, or the team Home's for a team answer
 *   visualize     the Visualizations tab of that match, cut to the figure's
 *                 measure, with the same filters
 *   save_view     the same cut and filters as a saved view (`saved_views`)
 *   export        the visual's rows as a CSV
 *   share         the match page, where Share makes the public link
 *   open_match    the one source match
 *   open_player   the roster player the question tagged (team scope)
 *   open_opponent the Matches list searched for the opponent asked about
 *
 * Pure: no React, no database, and nothing from `next/*`, so the page's
 * harness and `tests/ask-actions.spec.ts` can load it as it is.
 */

import {
  EMPTY_MATCH_FILTERS,
  serializeMatchFilters,
  type MatchFilters,
} from "@/components/dashboard/matches/match-detail/match-filters/model";
import {
  EMPTY_VIZ_FILTERS,
  type Cut,
  type VizFilters,
} from "@/components/dashboard/matches/match-detail/shots/viz-model";
import { VIZ_MATCH_FILTERS_PARAM } from "@/components/dashboard/matches/match-detail/shots/viz-url";
import { askOpponentKey } from "@/lib/data/ask-tags";
import type { AskSourceMatch, AskVisual } from "@/lib/services/ask/events";
import {
  figureMatchFilters,
  figureVideoHref,
} from "@/lib/services/ask/figure-video";
import { askMeasure } from "@/lib/services/ask/measures";
import type { AskScope } from "@/lib/services/ask/scope";
import type { AskSavedTag } from "@/lib/services/ask/tags";

/** An answer offers at most this many actions. */
export const MAX_ASK_ACTIONS = 5;

/** `saved_views.name`'s check (`SAVED_VIEW_NAME_MAX`), restated to stay pure. */
const VIEW_NAME_MAX = 60;

/** The Visualizations view's tab, as `report-view.ts` names it. */
const VISUALIZATIONS_TAB = "shots";

export type AskActionKind =
  | "watch"
  | "pin"
  | "visualize"
  | "save_view"
  | "export"
  | "share"
  | "open_match"
  | "open_player"
  | "open_opponent";

interface AskActionBase {
  kind: AskActionKind;
  /** The card's title: a verb and its object. */
  label: string;
  /** One quiet line under it saying what the button does. */
  detail: string;
}

/** A card whose one button is a link. Nothing runs; the page is where it goes. */
export interface AskLinkAction extends AskActionBase {
  kind:
    | "watch"
    | "visualize"
    | "share"
    | "open_match"
    | "open_player"
    | "open_opponent";
  href: string;
}

export interface AskSavedViewDraft {
  /** A suggested name; the dialog lets the player change it. */
  name: string;
  cut: Cut;
  chart: "scatter";
  filters: VizFilters;
}

/** A saved view, as `createSavedView()` takes one, waiting on a name and a click. */
export interface AskSaveViewAction extends AskActionBase {
  kind: "save_view";
  view: AskSavedViewDraft;
  /** The Visualizations tab the view would open, before it is saved. */
  href: string;
}

/** Pin the answer's visual block to Home: a request the page makes on a click. */
export interface AskPinAction extends AskActionBase {
  kind: "pin";
}

/** The visual's rows as a file the browser is handed. */
export interface AskExportAction extends AskActionBase {
  kind: "export";
  file: AskCsvFile;
}

export type AskAction =
  AskLinkAction | AskSaveViewAction | AskPinAction | AskExportAction;

export interface AskActionsInput {
  /** The matches the answer was computed from; null before the route said. */
  sources: readonly AskSourceMatch[] | null | undefined;
  /** The answer's figure tiles, with the column each was cited from when known. */
  figures: readonly { label: string; value: string; column?: string }[];
  visual: AskVisual | null | undefined;
  scope: AskScope;
  /** The question's tags, as saved with it. */
  tags?: readonly AskSavedTag[];
}

// ── Measures → the Visualizations tab ───────────────────────────────────────

interface VizCut {
  cut: Cut;
  pressure: VizFilters["pressure"];
  rally: VizFilters["rally"];
}

/**
 * Which court a measure is drawn on, by its bare key (`measures.ts`): serve
 * measures on the serve cut, return placement and contact on theirs, break
 * and set points on the serve cut under its pressure filter, rally bands on
 * the rally placement cut under its band. Null for a measure with no court —
 * a total, a winner count, a game.
 */
function vizCutFor(key: string): VizCut | null {
  const serve: VizCut = { cut: "serve", pressure: [], rally: [] };
  if (/^break_point/.test(key)) return { ...serve, pressure: ["break"] };
  if (/^set_point/.test(key)) return { ...serve, pressure: ["setMatch"] };
  if (/^return_contact_/.test(key)) return { ...serve, cut: "returnContact" };
  if (/^(first_return|second_return|return_)/.test(key)) {
    return { ...serve, cut: "returnPlacement" };
  }
  if (
    /^(first_serve|second_serve|serve_|aces|double_faults|service_)/.test(key)
  ) {
    return serve;
  }
  const band = /^(short|medium|long)_rally_/.exec(key);
  if (band) {
    return {
      ...serve,
      cut: "rallyPlacement",
      rally: [band[1] as "short" | "medium" | "long"],
    };
  }
  return null;
}

/** The cut and filters a figure's measure sets on the Visualizations tab, or null. */
export function figureVizFilters(
  column: string,
): { cut: Cut; filters: VizFilters } | null {
  const measure = askMeasure(column);
  if (!measure) return null;
  if (measure.qualifier !== "" && measure.qualifier !== "opponent") {
    return null;
  }
  const viz = vizCutFor(measure.key);
  if (!viz) return null;
  const match: MatchFilters = figureMatchFilters(column) ?? EMPTY_MATCH_FILTERS;
  return {
    cut: viz.cut,
    filters: {
      ...EMPTY_VIZ_FILTERS,
      player: measure.qualifier === "opponent" ? "opponent" : "you",
      pressure: viz.pressure,
      rally: viz.rally,
      match,
    },
  };
}

/** `/dashboard/matches/<id>?tab=shots&cut=…`, with the figure's filters. */
export function figureVisualizationsHref(
  matchId: string,
  cut: Cut,
  filters: VizFilters,
): string {
  const query = new URLSearchParams({ tab: VISUALIZATIONS_TAB, cut });
  if (filters.player !== "you") query.set("player", filters.player);
  for (const value of filters.pressure) query.append("pressure", value);
  for (const value of filters.rally) query.append("rally", value);
  const match = serializeMatchFilters(filters.match);
  if (match !== "") query.set(VIZ_MATCH_FILTERS_PARAM, match);
  return `/dashboard/matches/${encodeURIComponent(matchId)}?${query.toString()}`;
}

/** A view name from the figure's label, held to the column's limit. */
function viewNameFor(label: string): string {
  const name = label.replace(/\s+/g, " ").trim();
  return name.length > VIEW_NAME_MAX
    ? name.slice(0, VIEW_NAME_MAX).trim()
    : name;
}

/** "Ana Sokolov vs Marcus Hale", "vs Marcus Hale", or "the match". */
function matchName(match: AskSourceMatch): string {
  const opponent = match.opponentName ?? "the match";
  return match.playerName
    ? `${match.playerName} vs ${opponent}`
    : match.opponentName
      ? `vs ${opponent}`
      : "the match";
}

// ── The catalogue ───────────────────────────────────────────────────────────

/**
 * The actions an answer offers, in the order of use, at most
 * `MAX_ASK_ACTIONS` of them. Empty for an answer with nothing to act on.
 */
export function askActionsFor(input: AskActionsInput): AskAction[] {
  const { scope, visual } = input;
  const sources = input.sources ?? [];
  const tags = input.tags ?? [];
  const one = sources.length === 1 ? sources[0] : null;
  const out: AskAction[] = [];

  // The first figure with a column the film can be cut to.
  const watched = input.figures
    .map((figure) =>
      figure.column
        ? { figure, href: figureVideoHref(figure.column, sources) }
        : null,
    )
    .find((entry) => entry?.href);
  if (watched?.href && one) {
    out.push({
      kind: "watch",
      label: "Watch on video",
      detail: `${watched.figure.label} — the points behind it, in the film`,
      href: watched.href,
    });
  }

  if (visual) {
    out.push({
      kind: "pin",
      label: "Pin to Home",
      detail:
        scope.kind === "team"
          ? "Keep this chart on the team Home"
          : "Keep this chart on your Home page",
    });
  }

  // The first figure with a measure the Visualizations tab draws.
  const drawn = one
    ? input.figures
        .map((figure) =>
          figure.column
            ? { figure, viz: figureVizFilters(figure.column) }
            : null,
        )
        .find((entry) => entry?.viz)
    : null;
  if (drawn?.viz && one) {
    const href = figureVisualizationsHref(
      one.matchId,
      drawn.viz.cut,
      drawn.viz.filters,
    );
    out.push({
      kind: "visualize",
      label: "See it on the court",
      detail: `${drawn.figure.label} on the Visualizations tab`,
      href,
    });
    out.push({
      kind: "save_view",
      label: "Save as a view",
      detail: "The same court and filters, kept in Visualizations",
      href,
      view: {
        name: viewNameFor(drawn.figure.label),
        cut: drawn.viz.cut,
        chart: "scatter",
        filters: drawn.viz.filters,
      },
    });
  }

  if (visual) {
    out.push({
      kind: "export",
      label: "Download CSV",
      detail: "The chart's rows, as a file",
      file: askVisualCsv(visual),
    });
  }

  if (one) {
    const href = `/dashboard/matches/${encodeURIComponent(one.matchId)}`;
    out.push({
      kind: "share",
      label: "Share this match",
      detail: "Opens the match with Share ready; the link is made there",
      // `?share=1` opens the share popover on arrival (share-match-button.tsx).
      href: `${href}?share=1`,
    });
    out.push({
      kind: "open_match",
      label: "Open the match",
      detail: matchName(one),
      href,
    });
  }

  const player = tags.find((tag) => tag.kind === "player");
  if (player && scope.kind === "team") {
    out.push({
      kind: "open_player",
      label: `Open ${player.label}`,
      detail: "Their profile on the roster",
      href: `/dashboard/team/roster/${encodeURIComponent(player.id)}`,
    });
  }

  const first = sources[0];
  const opponent =
    tags.find((tag) => tag.kind === "opponent")?.label ??
    (first?.opponentName &&
    sources.every(
      (match) =>
        askOpponentKey(match.opponentName) ===
        askOpponentKey(first.opponentName),
    )
      ? first.opponentName
      : null);
  if (opponent && askOpponentKey(opponent) !== null) {
    out.push({
      kind: "open_opponent",
      label: `Matches vs. ${opponent}`,
      detail: "Every match against them, in the Matches list",
      href: `/dashboard/matches?q=${encodeURIComponent(opponent)}`,
    });
  }

  return out.slice(0, MAX_ASK_ACTIONS);
}

// ── CSV ─────────────────────────────────────────────────────────────────────

export interface AskCsvFile {
  /** `ask-<kind>.csv`. */
  filename: string;
  /** The rows, comma-separated, one per line; every cell the server's text. */
  text: string;
}

/** A figure as the server writes one: "-3", "+1.5", "41%", "-2 pts", "37,5 %". */
const NUMERIC_TEXT = /^[-+]?\d[\d.,]*\s?(?:%|[A-Za-z]+)?$/;

/**
 * A text cell a spreadsheet would run as a formula (CWE-1236) gets a leading
 * `'`, which shows it as text. A number is left alone, sign and all.
 */
function inert(text: string): string {
  return /^[=+\-@\t\r]/.test(text) && !NUMERIC_TEXT.test(text)
    ? `'${text}`
    : text;
}

function cell(value: string | number | null | undefined): string {
  const text =
    value === null || value === undefined
      ? ""
      : typeof value === "number"
        ? String(value)
        : inert(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function rows(table: (string | number | null | undefined)[][]): string {
  return table.map((row) => row.map(cell).join(",")).join("\n");
}

/**
 * The visual block as a CSV: one header row, then one row per bar, table
 * row, point, part, court or result. Numbers are the server's own text,
 * never reformatted here (the block's rule, `visuals/ask-visual.tsx`).
 */
export function askVisualCsv(visual: AskVisual): AskCsvFile {
  const filename = `ask-${visual.kind}.csv`;
  switch (visual.kind) {
    case "bars":
      return {
        filename,
        text: rows([
          ["", visual.subjectLabel, visual.baselineLabel],
          ...visual.rows.map((row) => [
            row.label,
            row.subject.text,
            row.baseline.text,
          ]),
        ]),
      };
    case "table":
      return {
        filename,
        text: rows([
          ["", ...visual.columns],
          ...visual.rows.map((row) => [row.label, ...row.cells]),
        ]),
      };
    case "trend": {
      const baseline = visual.baseline;
      return {
        filename,
        text: rows([
          ["", "Value", ...(baseline ? [baseline.label] : [])],
          ...visual.points.map((point, index) => [
            point.label,
            point.value.text,
            ...(baseline ? [baseline.values[index]?.text ?? ""] : []),
          ]),
        ]),
      };
    }
    case "split":
      return {
        filename,
        text: rows([
          ["Part", "Count"],
          ...visual.parts.map((part) => [part.label, part.count.text]),
        ]),
      };
    case "serve":
      return {
        filename,
        text: rows([
          ["Court", "T", "Body", "Wide"],
          ...visual.courts.map((court) => [
            court.label,
            court.t.text,
            court.body.text,
            court.wide.text,
          ]),
        ]),
      };
    case "form":
      return {
        filename,
        text: rows([
          ["Match", "Result"],
          ...visual.results.map((won, index) => [
            index + 1,
            won ? "Won" : "Lost",
          ]),
        ]),
      };
    case "momentum":
      return {
        filename,
        text: rows([
          ["Point", "Set", "Won", "Mark"],
          ...visual.points.map((point, index) => [
            index + 1,
            point.set ?? "",
            point.won ? "Yes" : "No",
            point.mark ?? "",
          ]),
        ]),
      };
    case "tree": {
      const part = visual.partLabel;
      return {
        filename,
        text: rows([
          [
            ...visual.levels,
            visual.countLabel,
            ...(part ? [part] : []),
            visual.shareLabel,
          ],
          ...visual.branches.map((branch) => [
            ...branch.steps,
            branch.count.text,
            ...(part ? [branch.part?.text ?? ""] : []),
            branch.share.text,
          ]),
        ]),
      };
    }
  }
}

/** A `data:` URL the export card's link can hand the browser, no script needed. */
export function askCsvDataUrl(file: AskCsvFile): string {
  return `data:text/csv;charset=utf-8,${encodeURIComponent(file.text)}`;
}
