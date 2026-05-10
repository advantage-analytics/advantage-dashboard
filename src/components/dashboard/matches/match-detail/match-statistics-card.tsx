"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Info } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { shortName } from "@/lib/data/match-utils";
import {
  PLAYER_1,
  PLAYER_1_BAR_TINT,
  PLAYER_2,
  PLAYER_2_BAR_TINT,
} from "@/lib/design/player-colors";

export interface StatRow {
  label: string;
  p1Display: string;
  p2Display: string;
  p1Fraction?: string;
  p2Fraction?: string;
}

export interface StatSection {
  title: string;
  rows: StatRow[];
}

interface MatchStatisticsCardProps {
  sections: StatSection[];
  p1Name: string;
  p2Name: string;
}

const P1_COLOR = PLAYER_1;
const P2_COLOR = PLAYER_2;
const P1_TINT = PLAYER_1_BAR_TINT;
const P2_TINT = PLAYER_2_BAR_TINT;
const NEUTRAL_COLOR = "var(--color-text-secondary)";

const EASE_CURVE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

interface BarShares {
  p1: number;
  p2: number;
}

const STAT_DESCRIPTIONS: Record<string, string> = {
  "aces": "Serves the returner doesn't touch.",
  "double faults": "Two missed serves on the same point.",
  "break points saved": "Break points denied while serving.",
  "break points converted": "Break points won while returning.",
  "service breaks": "Games won while returning the opponent's serve.",
  "winners": "Point-ending shots the opponent doesn't touch.",
  "unforced errors": "Mistakes not forced by opponent pressure.",
  "net approaches": "Points where the player came to the net.",
  "net points won %": "Share of approach points the player won at net.",
  "service games won": "Games held while serving.",
  "short rallies (1–4)": "Points decided in 1–4 shots.",
  "medium rallies (5–8)": "Points decided in 5–8 shots.",
  "long rallies (9+)": "Points lasting nine shots or more.",
};

function getStatDescription(label: string): string | undefined {
  return STAT_DESCRIPTIONS[label.toLowerCase()];
}

// Expands invisible click/tap target to ≥44px without disturbing layout (WCAG 2.5.5).
const touchTargetExpanderClass =
  "relative after:absolute after:content-[''] after:inset-y-[-13px] after:inset-x-[-8px]";

function getShares(p1Display: string, p2Display: string): BarShares | null {
  if (isMissingValue(p1Display) || isMissingValue(p2Display)) return null;
  const p1 = parseValue(p1Display);
  const p2 = parseValue(p2Display);
  if (p1 === null || p2 === null) return null;
  const total = p1.value + p2.value;
  if (!Number.isFinite(total) || total <= 0) return null;
  return { p1: p1.value / total, p2: p2.value / total };
}

export function MatchStatisticsCard({
  sections,
  p1Name,
  p2Name,
}: MatchStatisticsCardProps) {
  const prefersReduced = useReducedMotion();
  const visibleSections = sections.filter((s) => s.rows.length > 0);
  const p1Short = shortName(p1Name, 18);
  const p2Short = shortName(p2Name, 18);

  if (visibleSections.length === 0) {
    return (
      <section
        aria-labelledby="match-stats-heading-empty"
        className="surface-card flex flex-col"
      >
        <div className="flex items-center h-14 px-5">
          <h2
            id="match-stats-heading-empty"
            className="text-[10px] font-medium text-[var(--color-text-dim)] uppercase tracking-[2.5px] leading-[15px]"
          >
            Statistics
          </h2>
        </div>
        <div className="px-5 pb-5">
          <p className="text-[13px] font-light text-[var(--color-text-dim)] text-left">
            No statistics available for this match.
          </p>
        </div>
      </section>
    );
  }

  // Flatten so the row stagger reads as one continuous reveal across sections.
  let runningIdx = 0;
  const renderableSections = visibleSections.map((section) => ({
    title: section.title,
    rows: section.rows.map((row) => ({ row, idx: runningIdx++ })),
  }));

  return (
    <section
      id="match-statistics"
      aria-labelledby="match-stats-heading"
      className="surface-card scroll-mt-6 relative flex flex-col"
    >
      <a
        href="#match-stats-end"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-20 focus:bg-white focus:px-3 focus:py-1.5 focus:rounded-[6px] focus:text-[12px] focus:text-[var(--color-accent-blue)] focus:shadow-card focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-blue-ring)]"
      >
        Skip past statistics
      </a>

      <div className="flex items-center justify-between gap-3 h-14 px-5">
        <div className="flex items-center gap-1.5 min-w-0">
          <h2
            id="match-stats-heading"
            className="text-[10px] font-medium text-[var(--color-text-dim)] uppercase tracking-[2.5px] leading-[15px]"
          >
            Statistics
          </h2>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="How to read these statistics"
                aria-haspopup="dialog"
                className="relative inline-flex items-center justify-center size-5 -m-1 text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue-ring)] rounded-full"
              >
                <Info className="size-3" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="start"
              sideOffset={8}
              collisionPadding={16}
              role="dialog"
              aria-label="How to read these statistics"
              className="!bg-white !text-[var(--color-text-primary)] !rounded-xl !p-0 !border !border-[var(--color-border-card)] !shadow-[0px_4px_16px_0px_rgba(0,0,0,0.08)] !w-auto"
            >
              <div className="w-[260px] py-4 px-4 flex flex-col gap-3">
                <span className="text-[9px] font-medium text-[var(--color-text-dim)] uppercase tracking-[2.5px] leading-[13px]">
                  Reading the bars
                </span>
                <p className="text-[11px] font-normal text-[var(--color-text-body)] leading-[16px]">
                  The bar under each stat shows how it split between players.
                  The leader's color stays fully saturated; the trailing player
                  fades to a tint.
                </p>
                <div className="h-px bg-[var(--color-border-card)] -mx-4" />
                <ul className="flex flex-col gap-1.5">
                  <LegendRow color={P1_COLOR} name={p1Name} />
                  <LegendRow color={P2_COLOR} name={p2Name} />
                </ul>
                <div className="h-px bg-[var(--color-border-card)] -mx-4" />
                <p className="text-[10px] font-normal text-[var(--color-text-dim)] leading-[14px]">
                  <span className="text-[var(--color-text-muted)] italic">—</span>{" "}
                  indicates no data was recorded for that side.
                </p>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 shrink-0">
          <LegendSwatch color={P1_COLOR} label={p1Short} />
          <LegendSwatch color={P2_COLOR} label={p2Short} />
        </div>
      </div>

      <div className="flex flex-col gap-5 px-5 pb-5">
        {renderableSections.map((section) => (
          <div key={section.title} className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <h3 className="text-[10px] font-medium uppercase tracking-[2.5px] leading-[15px] text-[var(--color-text-dim)] shrink-0">
                {section.title}
              </h3>
              <div
                aria-hidden="true"
                className="h-px flex-1 bg-[var(--color-border-card)]"
              />
            </div>
            <ul role="list" className="flex flex-col gap-3">
              {section.rows.map(({ row, idx }) => {
                const diff = compareDisplay(row.p1Display, row.p2Display, row.label);
                const p1Leader = diff !== null && diff > 0;
                const p2Leader = diff !== null && diff < 0;
                const description = getStatDescription(row.label);
                const p1Missing = isMissingValue(row.p1Display);
                const p2Missing = isMissingValue(row.p2Display);
                const shares = getShares(row.p1Display, row.p2Display);
                const rowDelay = idx * 0.035;
                const barDelay = rowDelay + 0.18;
                return (
                  <motion.li
                    key={row.label}
                    className="flex items-center gap-2 sm:gap-3"
                    initial={prefersReduced ? false : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: rowDelay, ease: EASE_CURVE }}
                  >
                    <span className="flex-1 min-w-0 text-[12px] font-light text-[var(--color-text-secondary)] leading-[18px] truncate">
                      {description ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              tabIndex={0}
                              className={`inline cursor-help rounded-sm underline decoration-dotted decoration-[var(--color-text-faint)] underline-offset-[3px] decoration-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue-ring)] ${touchTargetExpanderClass}`}
                            >
                              {row.label}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent
                            sideOffset={8}
                            collisionPadding={12}
                            className="max-w-[280px] px-3 py-2 text-left leading-[16px]"
                          >
                            {description}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        row.label
                      )}
                    </span>
                    <div className="w-[56px] sm:w-[64px] flex justify-end shrink-0">
                      <ValueText
                        display={row.p1Display}
                        fraction={row.p1Fraction}
                        color={p1Leader ? P1_COLOR : NEUTRAL_COLOR}
                        isLeader={p1Leader}
                        isMissing={p1Missing}
                        align="right"
                      />
                    </div>
                    <div className="w-[100px] sm:w-[140px] shrink-0">
                      <ComparisonBar
                        shares={shares}
                        p1Leader={p1Leader}
                        p2Leader={p2Leader}
                        delay={barDelay}
                        reduced={prefersReduced ?? false}
                      />
                    </div>
                    <div className="w-[56px] sm:w-[64px] flex justify-start shrink-0">
                      <ValueText
                        display={row.p2Display}
                        fraction={row.p2Fraction}
                        color={p2Leader ? P2_COLOR : NEUTRAL_COLOR}
                        isLeader={p2Leader}
                        isMissing={p2Missing}
                        align="left"
                      />
                    </div>
                  </motion.li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <span id="match-stats-end" tabIndex={-1} className="sr-only">
        End of statistics
      </span>
    </section>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span
        aria-hidden="true"
        className="size-2 rounded-[2px]"
        style={{ backgroundColor: color }}
      />
      <span className="text-[10px] font-light text-[var(--color-text-secondary)] leading-[16px]">
        {label}
      </span>
    </div>
  );
}

function LegendRow({ color, name }: { color: string; name: string }) {
  return (
    <li className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="size-2 rounded-[2px] shrink-0"
        style={{ backgroundColor: color }}
      />
      <span className="text-[11px] font-normal text-[var(--color-text-body)] leading-[16px] truncate">
        {name}
      </span>
    </li>
  );
}

function ComparisonBar({
  shares,
  p1Leader,
  p2Leader,
  delay,
  reduced,
}: {
  shares: BarShares | null;
  p1Leader: boolean;
  p2Leader: boolean;
  delay: number;
  reduced: boolean;
}) {
  // Reserve vertical space even when no bar so the row rhythm is stable.
  if (!shares) {
    return (
      <div
        aria-hidden="true"
        className="h-1 w-full rounded-full bg-[var(--color-border-card)] opacity-40"
      />
    );
  }
  const p1Color = p1Leader ? P1_COLOR : P1_TINT;
  const p2Color = p2Leader ? P2_COLOR : P2_TINT;
  const p1Pct = shares.p1 * 100;
  const p2Pct = shares.p2 * 100;
  return (
    <div
      aria-hidden="true"
      className="relative h-1 w-full rounded-full overflow-hidden bg-[var(--color-border-card)]"
    >
      <motion.span
        className="absolute left-0 top-0 bottom-0"
        initial={reduced ? { width: `${p1Pct}%` } : { width: 0 }}
        animate={{ width: `${p1Pct}%` }}
        transition={{ duration: 0.55, delay, ease: EASE_CURVE }}
        style={{ backgroundColor: p1Color }}
      />
      <motion.span
        className="absolute right-0 top-0 bottom-0"
        initial={reduced ? { width: `${p2Pct}%` } : { width: 0 }}
        animate={{ width: `${p2Pct}%` }}
        transition={{ duration: 0.55, delay, ease: EASE_CURVE }}
        style={{ backgroundColor: p2Color }}
      />
    </div>
  );
}

function ValueText({
  display,
  fraction,
  color,
  isLeader,
  isMissing,
  align,
}: {
  display: string;
  fraction?: string;
  color: string;
  isLeader: boolean;
  isMissing: boolean;
  align: "left" | "right";
}) {
  if (isMissing) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            aria-label="No data recorded for this stat"
            className={`inline-block whitespace-nowrap text-[var(--color-text-muted)] italic cursor-help focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue-ring)] rounded-sm text-[13px] leading-[18px] font-light tabular-nums ${touchTargetExpanderClass}`}
          >
            —
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={6}
          className="px-2.5 py-1.5 text-[11px] leading-[14px]"
        >
          No data
        </TooltipContent>
      </Tooltip>
    );
  }
  // Match the home page recent-matches widget's font-light stat aesthetic;
  // leader gains a subtle weight bump (light → normal) plus its color.
  const numberWeight = isLeader ? "font-normal" : "font-light";
  // Keep the primary number closest to the bar: fraction sits on the outside.
  const flexDir = align === "right" ? "flex-row-reverse" : "flex-row";
  return (
    <span
      className={`inline-flex items-baseline gap-1.5 whitespace-nowrap ${flexDir}`}
      style={{ color }}
    >
      <span className={`text-[13px] leading-[18px] tabular-nums ${numberWeight}`}>
        {display}
      </span>
      {fraction && (
        <span className="text-[10px] font-light leading-[14px] text-[var(--color-text-dim)] tabular-nums">
          {fraction}
        </span>
      )}
    </span>
  );
}

const warnedValues = new Set<string>();

function compareDisplay(a: string, b: string, label?: string): number | null {
  const av = parseDisplay(a);
  const bv = parseDisplay(b);
  if (av === null || bv === null) {
    if (process.env.NODE_ENV !== "production") {
      const unparseable = [av === null ? a : null, bv === null ? b : null]
        .filter((v): v is string => v !== null && v.trim() !== "");
      for (const value of unparseable) {
        const key = `${label ?? ""}::${value}`;
        if (warnedValues.has(key)) continue;
        warnedValues.add(key);
        console.warn(
          `[MatchStatisticsCard] unparseable stat value${label ? ` (${label})` : ""}:`,
          value,
        );
      }
    }
    return null;
  }
  return av - bv;
}

function parseDisplay(s: string): number | null {
  return parseValue(s)?.value ?? null;
}

function parseValue(s: string): { value: number; isPercent: boolean } | null {
  const raw = s.trim();
  const isPercent = raw.endsWith("%");
  const trimmed = isPercent ? raw.slice(0, -1).trim() : raw;
  if (trimmed.includes("/")) {
    const [num, denom] = trimmed.split("/").map((p) => Number(p));
    if (Number.isFinite(num) && Number.isFinite(denom) && denom > 0) {
      return { value: num / denom, isPercent };
    }
    return Number.isFinite(num) ? { value: num, isPercent } : null;
  }
  const n = Number(trimmed);
  return Number.isFinite(n) ? { value: n, isPercent } : null;
}

function isMissingValue(s: string): boolean {
  const trimmed = s.trim();
  if (trimmed === "") return true;
  if (trimmed === "—" || trimmed === "-" || trimmed === "–") return true;
  if (/^n\/?a$/i.test(trimmed)) return true;
  return false;
}

export function MatchStatisticsCardSkeleton() {
  const sections = [6, 8, 6];
  return (
    <section
      role="status"
      aria-busy
      aria-live="polite"
      aria-label="Loading statistics"
      className="surface-card flex flex-col"
    >
      <div className="flex items-center justify-between gap-3 h-14 px-5">
        <div className="h-[10px] w-[60px] rounded bg-[var(--color-surface-muted)] motion-safe:animate-pulse" />
        <div className="flex gap-3">
          <div className="h-[10px] w-[60px] rounded bg-[var(--color-surface-muted)] motion-safe:animate-pulse" />
          <div className="h-[10px] w-[60px] rounded bg-[var(--color-surface-muted)] motion-safe:animate-pulse" />
        </div>
      </div>
      <div className="flex flex-col gap-5 px-5 pb-5">
        {sections.map((rowCount, sectionIdx) => (
          <div key={sectionIdx} className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="h-[10px] w-[56px] rounded bg-[var(--color-surface-muted)] motion-safe:animate-pulse" />
              <div className="h-px flex-1 bg-[var(--color-border-card)]" />
            </div>
            <div className="flex flex-col gap-3">
              {Array.from({ length: rowCount }).map((_, rowIdx) => (
                <div key={rowIdx} className="flex items-center gap-2 sm:gap-3">
                  <div
                    className="h-[10px] flex-1 max-w-[180px] rounded bg-[var(--color-surface-muted)] motion-safe:animate-pulse"
                    style={{ width: `${110 + ((rowIdx * 23) % 70)}px` }}
                  />
                  <div className="ml-auto h-[12px] w-[36px] rounded bg-[var(--color-surface-muted)] motion-safe:animate-pulse" />
                  <div className="h-1 w-[100px] sm:w-[140px] rounded-full bg-[var(--color-border-card)] motion-safe:animate-pulse" />
                  <div className="h-[12px] w-[36px] rounded bg-[var(--color-surface-muted)] motion-safe:animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
