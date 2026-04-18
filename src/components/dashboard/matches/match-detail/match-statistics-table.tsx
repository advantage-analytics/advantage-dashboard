"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  PLAYER_COLORS,
  PLAYER_SOFT_COLORS,
  PLAYER_TEXT_COLORS,
} from "@/lib/data/match-utils";

const EASE_OUT_QUINT: [number, number, number, number] = [0.23, 1, 0.32, 1];

const CARD =
  "bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] p-5";
const LABEL =
  "text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px] leading-[15px]";

export interface StatRow {
  label: string;
  p1Display: string;
  p2Display: string;
  p1Fraction?: string;
  p2Fraction?: string;
}

type TabKey = "serve" | "return" | "other";

const TAB_LABELS: { key: TabKey; label: string }[] = [
  { key: "serve", label: "Serve" },
  { key: "return", label: "Return" },
  { key: "other", label: "Other" },
];

interface MatchStatisticsTableProps {
  serveRows: StatRow[];
  returnRows: StatRow[];
  otherRows: StatRow[];
  p1Name: string;
  p2Name: string;
}

function parseLeadingNumber(value: string): number | null {
  if (!value) return null;
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

type Leader = "p1" | "p2" | "tie" | "unknown";

function leaderOf(row: StatRow): Leader {
  const a = parseLeadingNumber(row.p1Display);
  const b = parseLeadingNumber(row.p2Display);
  if (a === null || b === null) return "unknown";
  if (a > b) return "p1";
  if (b > a) return "p2";
  return "tie";
}

export function MatchStatisticsTable({
  serveRows,
  returnRows,
  otherRows,
  p1Name,
  p2Name,
}: MatchStatisticsTableProps) {
  const [tab, setTab] = useState<TabKey>("serve");
  const tabRefs = useRef<Record<TabKey, HTMLButtonElement | null>>({
    serve: null,
    return: null,
    other: null,
  });
  const idBase = useId();
  const pillLayoutId = `${idBase}-active-pill`;
  const prefersReducedMotion = useReducedMotion();

  const rows =
    tab === "serve" ? serveRows : tab === "return" ? returnRows : otherRows;

  const handleTabKeyDown = (
    e: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (
      e.key !== "ArrowRight" &&
      e.key !== "ArrowLeft" &&
      e.key !== "Home" &&
      e.key !== "End"
    ) {
      return;
    }
    e.preventDefault();
    let next = index;
    if (e.key === "ArrowRight") next = (index + 1) % TAB_LABELS.length;
    if (e.key === "ArrowLeft")
      next = (index - 1 + TAB_LABELS.length) % TAB_LABELS.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = TAB_LABELS.length - 1;
    const nextKey = TAB_LABELS[next].key;
    setTab(nextKey);
    tabRefs.current[nextKey]?.focus();
  };

  const GRID_COLS = "grid-cols-[minmax(0,1fr)_140px_140px]";
  // Name headers normalized to eyebrow-secondary tracking (1px) so the
  // full (already 14-char-shortened) player name fits within the 140px
  // column without truncation. 10px size is kept for visual parity with
  // the "Statistic" LABEL header.
  const NAME_HEADER =
    "text-[10px] font-medium text-[#525252] uppercase tracking-[1px] leading-[15px] text-right truncate";

  return (
    <section className={cn(CARD, "flex flex-col")}>
      {/* Header cluster — title + tabs read as a single unit */}
      <header className="flex flex-col gap-3">
        <h2 className={LABEL}>Match Statistics</h2>
        <div
          role="tablist"
          aria-label="Match statistic categories"
          className="flex items-center gap-1.5"
        >
          {TAB_LABELS.map((t, i) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                ref={(el) => {
                  tabRefs.current[t.key] = el;
                }}
                role="tab"
                id={`${idBase}-tab-${t.key}`}
                aria-selected={active}
                aria-controls={`${idBase}-panel-${t.key}`}
                tabIndex={active ? 0 : -1}
                onClick={() => setTab(t.key)}
                onKeyDown={(e) => handleTabKeyDown(e, i)}
                className={cn(
                  "relative rounded-full px-3 py-1.5 text-[10px] font-medium uppercase tracking-[2.5px] border",
                  "transition-colors duration-200",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40",
                  active
                    ? "border-transparent text-white"
                    : "bg-white border-[#EAECF0] text-[#525252] hover:bg-[#F5F5F5]",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId={pillLayoutId}
                    aria-hidden="true"
                    className="absolute inset-0 bg-[#3B82F6] rounded-full"
                    transition={
                      prefersReducedMotion
                        ? { duration: 0 }
                        : { type: "spring", bounce: 0.15, visualDuration: 0.35 }
                    }
                  />
                ) : null}
                <span className="relative z-10">{t.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Stat panel — generous breathing room from header cluster */}
      <motion.div
        key={tab}
        role="tabpanel"
        id={`${idBase}-panel-${tab}`}
        aria-labelledby={`${idBase}-tab-${tab}`}
        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: prefersReducedMotion ? 0.12 : 0.22,
          ease: EASE_OUT_QUINT,
        }}
        className="mt-7 flex flex-col"
      >
        {/* Column headers — sit apart from data via pb-3.5 */}
        <div
          className={cn(
            "grid items-center pb-3.5 border-b border-[#F3F3F3]",
            GRID_COLS,
          )}
        >
          <span className={LABEL}>Statistic</span>
          <span className={NAME_HEADER} title={p1Name}>
            {p1Name}
          </span>
          <span className={NAME_HEADER} title={p2Name}>
            {p2Name}
          </span>
        </div>

        {/* Stat rows — py-3.5 creates a steadier beat than py-3 */}
        <ul className="flex flex-col">
          {rows.map((row, i) => {
            const leader = leaderOf(row);
            return (
              <li
                key={row.label}
                className={cn(
                  "grid items-center py-3.5",
                  GRID_COLS,
                  i < rows.length - 1 && "border-b border-[#F3F3F3]",
                )}
              >
                <span className="text-[11px] font-medium text-[#525252] leading-[1.4] pr-4 truncate">
                  {row.label}
                </span>

                <StatValue
                  display={row.p1Display}
                  fraction={row.p1Fraction}
                  accent={PLAYER_COLORS.player1}
                  textOnSoft={PLAYER_TEXT_COLORS.player1}
                  soft={PLAYER_SOFT_COLORS.player1}
                  highlighted={leader === "p1"}
                  dim={leader === "p2"}
                />
                <StatValue
                  display={row.p2Display}
                  fraction={row.p2Fraction}
                  accent={PLAYER_COLORS.player2}
                  textOnSoft={PLAYER_TEXT_COLORS.player2}
                  soft={PLAYER_SOFT_COLORS.player2}
                  highlighted={leader === "p2"}
                  dim={leader === "p1"}
                />
              </li>
            );
          })}
        </ul>

        {rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <p className="text-[11px] font-normal text-[#888888] leading-[1.6]">
              No statistics available for this category.
            </p>
          </div>
        )}
      </motion.div>
    </section>
  );
}

interface StatValueProps {
  display: string;
  fraction?: string;
  accent: string;
  textOnSoft: string;
  soft: string;
  highlighted: boolean;
  dim: boolean;
}

function StatValue({
  display,
  fraction,
  accent: _accent,
  textOnSoft,
  soft,
  highlighted,
  dim,
}: StatValueProps) {
  void _accent;
  // Numeric values use 12px (table-density exception, not on home scale).
  // Home's body-primary (11px) is reserved for prose; tabular data needs
  // slightly more emphasis to read cleanly against row labels.
  return (
    <div className="flex justify-end">
      {highlighted ? (
        <>
          <span className="sr-only">Leader: </span>
          <span
            className={cn(
              "inline-flex items-baseline gap-1 px-2 py-0.5 rounded-[6px]",
              "text-[12px] font-semibold tabular-nums leading-[1.1]",
              "transition-colors duration-200",
            )}
            style={{ color: textOnSoft, backgroundColor: soft }}
          >
            {display}
            {fraction ? (
              <span
                className="text-[10px] font-medium tabular-nums opacity-80"
                style={{ color: textOnSoft }}
              >
                {fraction}
              </span>
            ) : null}
          </span>
        </>
      ) : (
        <span
          className={cn(
            "inline-flex items-baseline gap-1 px-2 py-0.5",
            "text-[12px] font-normal tabular-nums leading-[1.1]",
          )}
          style={{ color: dim ? "#AAAAAA" : "#525252" }}
        >
          {display}
          {fraction ? (
            <span className="text-[10px] font-normal tabular-nums text-[#AAAAAA]">
              {fraction}
            </span>
          ) : null}
        </span>
      )}
    </div>
  );
}
