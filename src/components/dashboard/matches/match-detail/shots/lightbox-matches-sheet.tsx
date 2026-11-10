"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, ChevronUp, Search, X } from "lucide-react";

import { CheckboxMark } from "@/components/ui/checkbox";
import { FloatMenu, FloatMenuItem } from "@/components/ui/float-menu";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { ResultMark } from "@/components/dashboard/result-mark";
import { formatMatchDayMonth, formatMatchDayShort } from "@/lib/data/match-day";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";

import {
  FILTER_SHEET_CLASS,
  FILTER_SHEET_PANEL_CLASS,
  FILTER_SHEET_SCRIM_CLASS,
  filterSheetWidthClass,
  wrapTabInSheet,
} from "../match-filters/filter-sheet";
import type { CountNoun } from "../match-filters/panel-draft";
import type { FilterRailPhase } from "../match-filters/rail-state";
import type {
  LightboxSeasonFilters,
  SeasonSheetMatch,
} from "./lightbox-filters";
import { prefersReducedMotion } from "./use-reduced-motion";
import {
  normalizeSeasonFilters,
  seasonMatchKept,
  type OpponentHandFilter,
  type SeasonFilters,
  type SeasonResultFilter,
  type SeasonSurface,
} from "./viz-url";

/** The sheet's id — the specs find it by this. */
const LIGHTBOX_MATCHES_SHEET_ID = "viz-matches-sheet";

/* ── The draft ─────────────────────────────────────────────────────────── */

/** What the sheet edits before Show applies it. */
export interface MatchesDraft {
  result: SeasonResultFilter | null;
  hand: OpponentHandFilter | null;
  surface: SeasonSurface | null;
  ticked: string[];
}

export function draftFrom(value: SeasonFilters | undefined): MatchesDraft {
  return {
    result: value?.result ?? null,
    hand: value?.opponentHand ?? null,
    surface: value?.surface ?? null,
    ticked: value?.matches ?? [],
  };
}

function keeps(
  draft: Pick<MatchesDraft, "result" | "hand" | "surface">,
  m: SeasonSheetMatch,
): boolean {
  return seasonMatchKept(m, {
    result: draft.result,
    opponentHand: draft.hand,
    surface: draft.surface,
  });
}

/** The draft as the URL keeps it: ticks the menus have since dropped are
 *  let go, so a Show never applies a match the reader can no longer see. */
export function seasonFiltersFrom(
  draft: MatchesDraft,
  matches: readonly SeasonSheetMatch[],
): SeasonFilters | undefined {
  const kept = new Set(matches.filter((m) => keeps(draft, m)).map((m) => m.id));
  return normalizeSeasonFilters({
    opponentHand: draft.hand,
    result: draft.result,
    surface: draft.surface,
    matches: draft.ticked.filter((id) => kept.has(id)),
  });
}

/** The matches the draft counts: the ticked ones the menus keep, or every
 *  match the menus keep when none is ticked. */
export function countedMatches(
  draft: MatchesDraft,
  matches: readonly SeasonSheetMatch[],
): SeasonSheetMatch[] {
  const kept = matches.filter((m) => keeps(draft, m));
  const ticked = kept.filter((m) => draft.ticked.includes(m.id));
  return ticked.length > 0 ? ticked : kept;
}

/* ── The menus ─────────────────────────────────────────────────────────── */

export type MatchesMenuKey = "result" | "hand" | "surface";

interface MenuSpec<V extends string> {
  key: MatchesMenuKey;
  /** The trigger's name while nothing is chosen. */
  label: string;
  /** The "nothing chosen" row. */
  any: string;
  options: { value: V; label: string }[];
  /** The value as a match carries it. */
  of: (m: SeasonSheetMatch) => V | null;
}

const RESULT_MENU: MenuSpec<SeasonResultFilter> = {
  key: "result",
  label: "Result",
  any: "Any result",
  options: [
    { value: "won", label: "Won" },
    { value: "lost", label: "Lost" },
  ],
  of: (m) => (m.won === true ? "won" : m.won === false ? "lost" : null),
};

const HAND_MENU: MenuSpec<OpponentHandFilter> = {
  key: "hand",
  label: "Opponent",
  any: "Any opponent",
  options: [
    { value: "right", label: "Right-handed" },
    { value: "left", label: "Left-handed" },
    { value: "unknown", label: "Hand unknown" },
  ],
  of: (m) => m.hand,
};

const SURFACE_MENU: MenuSpec<SeasonSurface> = {
  key: "surface",
  label: "Surface",
  any: "Any surface",
  options: [
    { value: "hard", label: "Hard" },
    { value: "clay", label: "Clay" },
    { value: "grass", label: "Grass" },
    { value: "unknown", label: "Surface unknown" },
  ],
  of: (m) => m.surface,
};

const MENU_SPECS: readonly MenuSpec<string>[] = [
  RESULT_MENU,
  HAND_MENU,
  SURFACE_MENU,
];

/** The draft's field for a menu. */
function chosenOf(draft: MatchesDraft, key: MatchesMenuKey): string | null {
  return key === "result"
    ? draft.result
    : key === "hand"
      ? draft.hand
      : draft.surface;
}

/** A chosen value in the words its menu uses ("Left-handed") — the trigger
 *  and the Filters panel's Matches row both say it this way. */
export function matchesMenuValueLabel(
  key: MatchesMenuKey,
  value: string,
): string {
  const menu = MENU_SPECS.find((m) => m.key === key);
  return menu?.options.find((o) => o.value === value)?.label ?? value;
}

function MatchesMenu<V extends string>({
  menu,
  draft,
  matches,
  onChoose,
}: {
  menu: MenuSpec<V>;
  draft: MatchesDraft;
  matches: readonly SeasonSheetMatch[];
  onChoose: (value: V | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const chosen = chosenOf(draft, menu.key) as V | null;
  // Each option's count is the matches it would leave, the other two menus
  // held as they are.
  const others = { ...draft, [menu.key]: null };
  const pool = matches.filter((m) => keeps(others, m));
  const count = (value: V | null) =>
    value === null
      ? pool.length
      : pool.filter((m) => menu.of(m) === value).length;
  // A choice nothing in the season carries is not offered — unless it is the
  // one already chosen (a link can name it).
  const options = menu.options.filter(
    (o) => o.value === chosen || matches.some((m) => menu.of(m) === o.value),
  );
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <FloatMenu
      open={open}
      onOpenChange={setOpen}
      align="start"
      width={200}
      sideOffset={4}
      label={menu.label}
      trigger={
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="menu"
          className={cn(
            "inline-flex h-7 cursor-pointer items-center gap-1 rounded-[var(--radius-element)] px-2 text-[12px] whitespace-nowrap transition-colors duration-200 hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
            open && "bg-[var(--surface-subtle)]",
            chosen !== null || open
              ? "font-medium text-[var(--ink-900)]"
              : "text-[var(--ink-600)]",
          )}
        >
          {chosen !== null
            ? matchesMenuValueLabel(menu.key, chosen)
            : menu.label}
          <Chevron className="size-3" strokeWidth={1.5} aria-hidden="true" />
        </button>
      }
    >
      <FloatMenuItem
        label={menu.any}
        chosen={chosen === null}
        meta={count(null)}
        onSelect={() => {
          onChoose(null);
          setOpen(false);
        }}
      />
      {options.map((o) => (
        <FloatMenuItem
          key={o.value}
          label={o.label}
          chosen={chosen === o.value}
          meta={count(o.value)}
          onSelect={() => {
            onChoose(o.value);
            setOpen(false);
          }}
        />
      ))}
    </FloatMenu>
  );
}

/* ── The sheet ─────────────────────────────────────────────────────────── */

/**
 * The lightbox's Matches sheet — which of a season's matches the court is
 * drawn over. Opened from the Filters panel's "Matches" row, in the frame
 * the Advanced filters sheet uses (`lightbox-advanced-drawer.tsx`): 340px on
 * the window's right edge, the window dimmed behind it, Tab wrapping inside.
 *
 * It edits a draft. Result, Opponent and Surface (each a `FloatMenu`, each
 * option with the matches it would leave) narrow the list, and every match
 * the list keeps counts; ticking matches narrows further, "Use all shown"
 * lets the ticks go. Search only finds a row — it never changes what
 * counts. Show applies the draft and closes; X, Esc and the dimmed window
 * throw it away. Every number is the server's (`SeasonSheetMatch.count`),
 * summed here — this sheet never sees a point.
 */
export function LightboxMatchesSheet({
  phase,
  onClose,
  onFinish,
  season,
  noun,
}: {
  phase: FilterRailPhase;
  /** The X, Esc, Show and the dimmed window: start closing. */
  onClose: () => void;
  /** The out animation ended — the sheet leaves the DOM. */
  onFinish: () => void;
  season: LightboxSeasonFilters;
  noun: CountNoun;
}) {
  const closing = phase === "closing";
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const { matches } = season;
  const [draft, setDraft] = useState<MatchesDraft>(() =>
    draftFrom(season.value),
  );
  const [query, setQuery] = useState("");

  // Focus in on open, a frame late: the Filters popover that opened it is
  // closing in the same commit (as the Advanced filters sheet does).
  useEffect(() => {
    if (phase !== "open") return;
    const frame = requestAnimationFrame(() =>
      panelRef.current?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  // `motion-reduce:animate-none` means no `animationend`: finish at once.
  useEffect(() => {
    if (closing && prefersReducedMotion()) onFinish();
  }, [closing, onFinish]);

  const kept = useMemo(
    () => matches.filter((m) => keeps(draft, m)),
    [matches, draft],
  );
  const q = query.trim().toLowerCase();
  const shown =
    q === ""
      ? kept
      : kept.filter((m) => m.opponentName.toLowerCase().includes(q));
  const tickedKept = kept.filter((m) => draft.ticked.includes(m.id));
  const counting = countedMatches(draft, matches);
  const sum = counting.reduce((n, m) => n + m.count, 0);
  const total = matches.reduce((n, m) => n + m.count, 0);
  const applied = seasonFiltersFrom(draft, matches);
  const unchanged =
    JSON.stringify(applied ?? null) ===
    JSON.stringify(normalizeSeasonFilters(season.value) ?? null);
  const narrowed =
    draft.result !== null ||
    draft.hand !== null ||
    draft.surface !== null ||
    draft.ticked.length > 0;

  // A month heading carries its year only when the season spans more than
  // one; within one year the month alone reads cleaner.
  const years = new Set(matches.map((m) => m.date?.slice(0, 4) ?? ""));
  const monthOf = (date: string | null) => {
    if (!date) return "Undated";
    const label = formatMatchDayMonth(date);
    return years.size > 1 ? label : label.replace(/\s\d{4}$/, "");
  };

  const toggle = (id: string) =>
    setDraft((d) => ({
      ...d,
      ticked: d.ticked.includes(id)
        ? d.ticked.filter((x) => x !== id)
        : [...d.ticked, id],
    }));

  const statusLine =
    tickedKept.length > 0
      ? `${tickedKept.length} of ${kept.length} picked`
      : kept.length === matches.length
        ? `All ${matches.length} ${matches.length === 1 ? "match" : "matches"}`
        : `${kept.length} of ${matches.length} matches`;

  const rows = shown.map((m, i) => ({
    match: m,
    month: monthOf(m.date),
    heading: i === 0 || monthOf(shown[i - 1].date) !== monthOf(m.date),
  }));

  return (
    <>
      <button
        type="button"
        aria-label="Close matches"
        tabIndex={-1}
        data-lightbox-drawer-scrim=""
        onClick={onClose}
        className={cn(
          FILTER_SHEET_SCRIM_CLASS,
          closing && "pointer-events-none opacity-0",
        )}
      />
      <aside
        id={LIGHTBOX_MATCHES_SHEET_ID}
        aria-labelledby={titleId}
        inert={closing}
        onKeyDown={(event) => wrapTabInSheet(event, panelRef.current)}
        onAnimationEnd={(event) => {
          if (event.animationName === "roster-drawer-out") onFinish();
        }}
        className={cn(FILTER_SHEET_CLASS, filterSheetWidthClass(closing))}
      >
        <div ref={panelRef} tabIndex={-1} className={FILTER_SHEET_PANEL_CLASS}>
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--border-hairline)] pr-2.5 pl-5">
            <h2
              id={titleId}
              className="flex min-w-0 flex-1 items-center gap-1.5 text-[12px] font-medium text-[var(--ink-900)]"
            >
              <CalendarDays
                className="size-[13px] shrink-0"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              Matches
            </h2>
            <ChromeTooltip
              label="Close"
              shortcut="Esc"
              onEscapeKeyDown={onClose}
            >
              <button
                type="button"
                aria-label="Close matches"
                onClick={onClose}
                className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-600)] transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none touch:hit-area"
              >
                <X className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
              </button>
            </ChromeTooltip>
          </div>

          <div className="flex shrink-0 flex-col gap-2 px-5 pt-3">
            <label className="relative block">
              <span className="sr-only">Search opponents</span>
              <Search
                className="pointer-events-none absolute top-1/2 left-[11px] size-[13px] -translate-y-1/2 text-[var(--ink-400)]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search opponents"
                className="h-8 w-full rounded-[var(--radius-button)] border border-[var(--border-field)] bg-[var(--surface-card)] pr-3 pl-[31px] text-[12px] text-[var(--ink-900)] placeholder:text-[var(--ink-400)]"
              />
            </label>
            <div className="-mx-2 flex items-center gap-0.5">
              <MatchesMenu
                menu={RESULT_MENU}
                draft={draft}
                matches={matches}
                onChoose={(v) => setDraft((d) => ({ ...d, result: v }))}
              />
              <MatchesMenu
                menu={HAND_MENU}
                draft={draft}
                matches={matches}
                onChoose={(v) => setDraft((d) => ({ ...d, hand: v }))}
              />
              <MatchesMenu
                menu={SURFACE_MENU}
                draft={draft}
                matches={matches}
                onChoose={(v) => setDraft((d) => ({ ...d, surface: v }))}
              />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border-hairline)] px-5 pt-1.5 pb-2">
            <span
              aria-live="polite"
              className="text-[11px] text-[var(--ink-600)] tabular-nums"
            >
              {statusLine}
            </span>
            <span className="flex-1" />
            {tickedKept.length > 0 && (
              <button
                type="button"
                onClick={() => setDraft((d) => ({ ...d, ticked: [] }))}
                className="cursor-pointer text-[11px] font-medium text-[var(--blue)] transition-colors duration-200 hover:text-[var(--blue-hover)]"
              >
                Use all shown
              </button>
            )}
          </div>

          <div
            role="group"
            aria-label="Matches, newest first"
            className="min-h-0 flex-1 overflow-y-auto px-3 pt-1 pb-2"
          >
            {rows.length === 0 ? (
              <p className="m-0 px-2 py-4 text-[12px] text-[var(--ink-600)]">
                {kept.length === 0
                  ? "No match fits these filters."
                  : `No opponent matches “${query.trim()}”.`}
              </p>
            ) : (
              rows.map(({ match: m, month, heading }) => {
                const checked = draft.ticked.includes(m.id);
                return (
                  <div key={m.id}>
                    {heading && (
                      <p className="m-0 px-2 pt-3.5 pb-1 text-[11px] text-[var(--ink-400)]">
                        {month}
                      </p>
                    )}
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      onClick={() => toggle(m.id)}
                      className="grid h-9 w-full cursor-pointer grid-cols-[14px_minmax(0,1fr)_104px_44px] items-center gap-x-2.5 rounded-[var(--radius-element)] px-2 text-left transition-colors duration-150 hover:bg-[var(--surface-subtle)]"
                    >
                      <CheckboxMark checked={checked} />
                      <span className="truncate text-[12px] text-[var(--ink-900)]">
                        vs {m.opponentName}
                      </span>
                      <span className="flex min-w-0 items-center gap-1.5">
                        {m.won !== null && <ResultMark won={m.won} />}
                        <span className="truncate text-[11px] text-[var(--ink-600)] tabular-nums">
                          {m.score ?? "—"}
                        </span>
                      </span>
                      <span className="text-right text-[11px] whitespace-nowrap text-[var(--ink-500)] tabular-nums">
                        {m.date ? formatMatchDayShort(m.date) : "—"}
                      </span>
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex h-[60px] shrink-0 items-center gap-3 border-t border-[var(--border-hairline)] pr-4 pl-5">
            <button
              type="button"
              onClick={() =>
                setDraft({
                  result: null,
                  hand: null,
                  surface: null,
                  ticked: [],
                })
              }
              disabled={!narrowed}
              className="shrink-0 cursor-pointer text-[12px] font-medium whitespace-nowrap text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)] disabled:cursor-default disabled:text-[var(--ink-300)]"
            >
              Clear all
            </button>
            <span
              aria-live="polite"
              className="min-w-0 flex-1 text-right text-[11px] whitespace-nowrap text-[var(--ink-500)] tabular-nums"
            >
              {sum} of {total} {total === 1 ? noun.one : noun.many}
            </span>
            <button
              type="button"
              disabled={unchanged || counting.length === 0}
              onClick={() => {
                season.onChange(applied);
                onClose();
              }}
              className={cn(advButton("primary", "sm"), "whitespace-nowrap")}
            >
              Show {sum} {sum === 1 ? noun.one : noun.many}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
