"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useReducedMotion } from "framer-motion";
import { Check, RotateCcw, Settings2 } from "lucide-react";
import { KpiTile, KpiTileStrip } from "./kpi-tile";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { KpiStripEmpty } from "@/components/dashboard/home/kpi-strip-empty";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  SEASON_KPI_BY_KEY,
  SEASON_KPI_DEFAULT_KEYS,
  SEASON_KPI_MAX,
  SEASON_KPI_MIN,
  SEASON_KPI_SPECS,
  type ProfileKpi,
  type SeasonKpiCategory,
} from "@/lib/data/player-profile";

/**
 * The season in four or five numbers — one strip for the personal Home and
 * for a team player's profile.
 *
 * The same tiles wherever a player's own season is read, and the same
 * choice: the picker's selection is stored per viewer, not per page, so a
 * player who claimed a college profile does not meet two strips reading two
 * ways one workspace switch apart. Twelve statistics are offered and four or
 * five shown; the default five are the frame's (Platform Audit `Te`).
 *
 * Every tile is interactive in the way the personal strip has always been:
 * the label carries a tooltip saying what the statistic counts, and hovering
 * a tile whose figure is a per-match rate opens the season's chart for it.
 * Record has no chart, deliberately — it is not a per-match rate, and the
 * hover would have nothing truthful to plot.
 *
 * Before any match has statistics the strip is still here, labelled and
 * empty (`KpiStripEmpty`), for the same reason Home keeps its own: the page
 * you learn on the first visit is the page you keep using. With one match
 * measured each tile holds its first value over the same grey curve the
 * empty strip draws (`ghostSparkline`), so the silhouette does not change
 * between zero, one and two matches — only what fills it.
 */

/**
 * One key, both pages. This is a reading preference — which statistics do I
 * want to see — not a fact about a page, so a coach who swaps Break points
 * saved in on their own Home reads it on a player's profile too.
 *
 * Deliberately NOT the retired `advantage.kpi.visible`: that key held keys
 * from a different, fourteen-statistic catalogue, and a stored pick from it
 * names statistics this strip does not offer. A new key lets an old one
 * expire instead of being half-honoured.
 */
const STORAGE_KEY = "advantage.season-kpi.visible";

const CATEGORY_ORDER: SeasonKpiCategory[] = ["Serve", "Return", "Other"];

// Module-scope, so the entrance stagger does not replay when a viewer
// navigates away and back inside one session.
let hasAnimatedOnce = false;

const DEFAULTS: string[] = [...SEASON_KPI_DEFAULT_KEYS];

function parseVisible(raw: string | null): string[] {
  if (!raw) return DEFAULTS;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULTS;
    // Filtered against the catalogue, so a key from a retired statistic list
    // cannot leave the strip a tile short.
    const valid = parsed.filter(
      (k): k is string => typeof k === "string" && SEASON_KPI_BY_KEY.has(k),
    );
    if (valid.length < SEASON_KPI_MIN) return DEFAULTS;
    return valid.slice(0, SEASON_KPI_MAX);
  } catch {
    return DEFAULTS;
  }
}

/**
 * The stored pick, read as an external store rather than copied into state.
 *
 * `useSyncExternalStore` is the shape this actually is: localStorage is
 * outside React, the server has no answer for it, and the hook's third
 * argument is exactly "what the server renders". Reading it in a mount
 * effect instead — which is what the retired strip did — sets state during
 * the first commit and renders twice on every visit.
 *
 * The parse is memoised on the raw string because `getSnapshot` must return
 * the SAME reference until the value really changes; a fresh array each call
 * is an infinite render loop.
 */
let cachedRaw: string | null = null;
let cachedKeys: string[] = DEFAULTS;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // `storage` fires in OTHER tabs only, which is precisely the case a local
  // emitter cannot cover — two tabs open on Home and the profile.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function getSnapshot(): string[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedKeys = parseVisible(raw);
  }
  return cachedKeys;
}

function getServerSnapshot(): string[] {
  return DEFAULTS;
}

export function SeasonKpiStrip({
  kpis,
  hasStats,
  matchesPlayed,
  awaitingReport,
  emptyHint,
  ariaLabel = "Season summary",
}: {
  /** Every tile in catalogue order; this component shows the chosen ones. */
  kpis: ProfileKpi[];
  hasStats: boolean;
  matchesPlayed: number;
  /**
   * A match is filed and nothing has come back yet — the empty strip's
   * "When the report lands".
   *
   * Stated by the page, not inferred from `matchesPlayed`, because that
   * number does not mean the same thing to both callers: the personal Home
   * counts every own match analyzed or not, while Team Home counts only the
   * analyzed dual matches its strip averages — which is zero in exactly the
   * state this names. Inferring it told a program with a match in the
   * pipeline "After your first match" while the title row said a report was
   * on its way.
   */
  awaitingReport?: boolean;
  /** Passed through to the empty strip — see `KpiStripEmpty`'s `hint`. */
  emptyHint?: string;
  /** Names the region — see `KpiTileStrip`. Team Home says "Program summary". */
  ariaLabel?: string;
}) {
  const shouldReduceMotion = useReducedMotion();
  const skipAnimation = shouldReduceMotion || hasAnimatedOnce;

  const visibleKeys = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  useEffect(() => {
    hasAnimatedOnce = true;
  }, []);

  const persist = useCallback((next: string[]) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private mode, or a full quota. Nothing is stored, and the strip
      // keeps whatever it had — a refusal to remember, not a broken toggle.
    }
    emit();
  }, []);

  const toggle = (key: string) => {
    if (visibleKeys.includes(key)) {
      if (visibleKeys.length <= SEASON_KPI_MIN) return;
      persist(visibleKeys.filter((k) => k !== key));
    } else {
      if (visibleKeys.length >= SEASON_KPI_MAX) return;
      // Re-ordered through the catalogue, so a swapped-in tile lands in the
      // reading order rather than at the end of the strip.
      persist(
        SEASON_KPI_SPECS.map((spec) => spec.key).filter(
          (k) => visibleKeys.includes(k) || k === key,
        ),
      );
    }
  };

  if (!hasStats) {
    // Labelled with this viewer's own pick, not the defaults: the empty
    // strip's whole job is to name the tiles that arrive with the first
    // report, and naming five they did not choose would break that promise.
    return (
      <KpiStripEmpty
        awaitingReport={awaitingReport ?? matchesPlayed > 0}
        hint={emptyHint}
        ariaLabel={ariaLabel}
        labels={visibleKeys.map(
          (key) => SEASON_KPI_BY_KEY.get(key)?.label ?? key,
        )}
      />
    );
  }

  const byKey = new Map(kpis.map((kpi) => [kpi.key, kpi]));
  const shown = visibleKeys
    .map((key) => byKey.get(key))
    .filter((kpi): kpi is ProfileKpi => kpi !== undefined);

  const atMax = visibleKeys.length >= SEASON_KPI_MAX;
  const atMin = visibleKeys.length <= SEASON_KPI_MIN;

  // Every category has specs in the catalogue, which is a module constant —
  // so there is no empty group to guard against.
  const grouped = CATEGORY_ORDER.map((category) => ({
    category,
    items: SEASON_KPI_SPECS.filter((spec) => spec.category === category),
  }));

  return (
    // `group`: the picker reveals on hover over the strip.
    <div className="group relative">
      {/* `collapse`: fewer tiles rather than narrower ones as the strip loses
          width — the rail takes 64px or 232px of the window, so the same
          monitor holds five tiles with one and four with the other. Without
          it "Break points saved" wraps and the whole strip grows a row. */}
      <KpiTileStrip collapse ariaLabel={ariaLabel}>
        {shown.map((kpi, index) => (
          <KpiTile
            key={kpi.key}
            index={index}
            skipAnimation={skipAnimation}
            label={kpi.label}
            value={kpi.value}
            sparkline={kpi.sparkline}
            trend={kpi.trend}
            subtext={kpi.subtext}
            hintText={kpi.hintText}
            description={kpi.description}
            detail={kpi.points}
            format={kpi.format}
            ghostSparkline
          />
        ))}
      </KpiTileStrip>

      <Popover>
        {/* Hover-revealed, the way v3 reveals a table row's icon actions: the
            frame draws the strip with nothing in its corner, and the 4–5 tile
            picker is still wanted. So it is there on hover, on focus and while
            open, and absent at rest. Named by a dark tooltip as every
            icon-only control must be. */}
        <ChromeTooltip label="Customize tiles" detail="Pick 4–5 to show">
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Customize season tiles"
              className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-lg text-[#8A8A8E] opacity-0 transition-[opacity,color,background-color] duration-200 group-hover:opacity-100 hover:bg-[#F5F5F5] hover:text-[#3C3C43] focus-visible:opacity-100 focus-visible:outline-none data-[state=open]:bg-[#F5F5F5] data-[state=open]:text-[#0D0D0D] data-[state=open]:opacity-100"
            >
              <Settings2 className="size-3.5" strokeWidth={1.5} />
            </button>
          </PopoverTrigger>
        </ChromeTooltip>
        <PopoverContent
          align="end"
          sideOffset={6}
          className="w-[280px] overflow-hidden rounded-xl border border-[#E5E5EA] p-0 shadow-[0_8px_30px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]"
        >
          <div className="px-4 pt-3.5 pb-3">
            <div className="flex items-baseline justify-between">
              <p className="text-[13px] leading-none font-medium text-[#1D1D1F]">
                Customize tiles
              </p>
              <p className="tabular text-[11px] leading-none text-[#AAAAAA]">
                <span className="font-medium text-[#0D0D0D]">
                  {visibleKeys.length}
                </span>
                <span className="mx-0.5">of</span>
                {SEASON_KPI_MAX}
              </p>
            </div>
            <div
              className="mt-2.5 flex items-center gap-1"
              role="presentation"
              aria-hidden="true"
            >
              {Array.from({ length: SEASON_KPI_MAX }).map((_, i) => (
                <span
                  key={i}
                  className={`h-[3px] flex-1 rounded-full transition-colors duration-200 ${
                    i < visibleKeys.length ? "bg-[#3B82F6]" : "bg-[#EBEBEB]"
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="mx-2 h-px bg-[#E5E5EA]" />

          <div className="flex max-h-[300px] flex-col overflow-y-auto p-1">
            {grouped.map((group, gi) => (
              <div key={group.category} className={gi > 0 ? "mt-1" : ""}>
                <div className="px-2.5 pt-2 pb-1.5">
                  <p className="text-[10px] font-medium tracking-[2.5px] text-[#AAAAAA] uppercase">
                    {group.category}
                  </p>
                </div>
                {group.items.map((spec) => {
                  const checked = visibleKeys.includes(spec.key);
                  const disabled = (checked && atMin) || (!checked && atMax);
                  return (
                    <button
                      key={spec.key}
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={checked}
                      aria-disabled={disabled}
                      disabled={disabled}
                      onClick={() => toggle(spec.key)}
                      title={
                        disabled
                          ? checked
                            ? `Keep at least ${SEASON_KPI_MIN} tiles visible`
                            : `Uncheck a tile to add ${spec.label}`
                          : undefined
                      }
                      className={`group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors duration-100 focus-visible:bg-[#F5F5F5] focus-visible:outline-none ${
                        disabled
                          ? "cursor-not-allowed opacity-40"
                          : "cursor-pointer hover:bg-[#F5F5F5] active:bg-[#EBEBEB]"
                      } ${checked && !disabled ? "text-[#0D0D0D]" : "text-[#525252]"}`}
                    >
                      <span
                        aria-hidden="true"
                        className="flex size-3.5 shrink-0 items-center justify-center"
                      >
                        {checked && (
                          <Check
                            className="size-3.5 text-[#3B82F6]"
                            strokeWidth={2.25}
                          />
                        )}
                      </span>
                      <span className="flex-1 truncate leading-none">
                        {spec.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="mx-2 h-px bg-[#E5E5EA]" />

          <div className="flex items-center justify-between gap-2 px-4 py-2.5">
            <p className="flex-1 text-[11px] leading-[1.45] text-[#888888]">
              {atMax
                ? "All slots full — uncheck to swap."
                : atMin
                  ? `Minimum ${SEASON_KPI_MIN} tiles.`
                  : `Pick ${SEASON_KPI_MIN}–${SEASON_KPI_MAX} to display.`}
            </p>
            <button
              type="button"
              onClick={() => persist([...SEASON_KPI_DEFAULT_KEYS])}
              className="inline-flex items-center gap-1 rounded-sm text-[11px] font-medium text-[#525252] transition-colors duration-200 hover:text-[#2563EB] focus-visible:text-[#2563EB] focus-visible:outline-none"
            >
              <RotateCcw className="size-3" strokeWidth={1.5} />
              Reset
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
