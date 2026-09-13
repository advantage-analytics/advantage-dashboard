"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import type { SelectableMatch } from "@/lib/data/statistics-server";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;
const INITIAL_ROWS = 5;

interface OpponentRow {
  name: string;
  wins: number;
  losses: number;
  total: number;
  winRate: number;
  avgRating: number;
}

interface Props {
  matches: SelectableMatch[];
}

export function OpponentLedger({ matches }: Props) {
  const shouldReduceMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);

  const rows = useMemo(() => {
    const map = new Map<string, { wins: number; losses: number; ratings: number[] }>();

    for (const m of matches) {
      const name = m.player2Name;
      const entry = map.get(name) ?? { wins: 0, losses: 0, ratings: [] };
      if (m.isWin) entry.wins++;
      else entry.losses++;
      const r = ((m.serveRating ?? 0) + (m.returnRating ?? 0)) / 2;
      if (r > 0) entry.ratings.push(r);
      map.set(name, entry);
    }

    const result: OpponentRow[] = [];
    let othersW = 0;
    let othersL = 0;
    let othersRatings: number[] = [];

    for (const [name, data] of map.entries()) {
      const total = data.wins + data.losses;
      if (total >= 2) {
        const avg = data.ratings.length > 0
          ? Math.round(data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length)
          : 0;
        result.push({
          name,
          wins: data.wins,
          losses: data.losses,
          total,
          winRate: Math.round((data.wins / total) * 100),
          avgRating: avg,
        });
      } else {
        othersW += data.wins;
        othersL += data.losses;
        othersRatings = othersRatings.concat(data.ratings);
      }
    }

    result.sort((a, b) => b.total - a.total);

    if (othersW + othersL > 0) {
      const total = othersW + othersL;
      const avg = othersRatings.length > 0
        ? Math.round(othersRatings.reduce((a, b) => a + b, 0) / othersRatings.length)
        : 0;
      result.push({
        name: "Others",
        wins: othersW,
        losses: othersL,
        total,
        winRate: Math.round((othersW / total) * 100),
        avgRating: avg,
      });
    }

    return result;
  }, [matches]);

  const visibleRows = expanded ? rows : rows.slice(0, INITIAL_ROWS);
  const hasMore = rows.length > INITIAL_ROWS;

  return (
    <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] p-5 overflow-hidden">
      <div className="mb-4">
        <h2 className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA]">
          Opponent Ledger
        </h2>
        <p className="text-[12px] font-normal text-[#71717A] mt-1">
          {rows.length > 0 ? "Head-to-head records" : "Not enough repeat matchups yet"}
        </p>
      </div>

      {rows.length > 0 && (
        <>
          {/* Header row */}
          <div className="flex items-center gap-3 pb-2 mb-1 border-b border-[#F0F0F0]">
            <span className="flex-1 text-[9px] font-medium text-[#AAAAAA] uppercase tracking-[1.5px]">
              Opponent
            </span>
            <span className="w-[56px] text-[9px] font-medium text-[#AAAAAA] uppercase tracking-[1.5px] text-right">
              Record
            </span>
            <span className="w-[72px] text-[9px] font-medium text-[#AAAAAA] uppercase tracking-[1.5px]">
              Win %
            </span>
          </div>

          <div className="flex flex-col">
            <AnimatePresence initial={false}>
              {visibleRows.map((row, i) => (
                <motion.div
                  key={row.name}
                  initial={shouldReduceMotion ? false : { opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2, delay: i * 0.03, ease: EASE_CURVE }}
                  className="overflow-hidden"
                >
                  <div className="flex items-center gap-3 py-2.5 border-b border-[#F0F0F0] last:border-b-0">
                    <span className={`flex-1 text-[12px] truncate ${row.name === "Others" ? "text-[#888888] italic" : "font-medium text-[#0D0D0D]"}`}>
                      {row.name}
                    </span>
                    <span className="w-[56px] text-[12px] tabular-nums text-[#525252] text-right">
                      {row.wins}W-{row.losses}L
                    </span>
                    <div className="w-[72px] flex items-center gap-2">
                      <div className="flex-1 h-[4px] rounded-full bg-[#F0F0F0] overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${row.winRate}%`,
                            backgroundColor: row.winRate >= 50 ? "#5DB955" : "#E51837",
                            opacity: 0.7,
                          }}
                        />
                      </div>
                      <span className="text-[10px] font-light tabular-nums text-[#888888] w-[28px] text-right">
                        {row.winRate}%
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-2 text-[9px] font-medium uppercase tracking-[1.5px] text-[#3B82F6] hover:text-[#2563EB] transition-colors duration-200"
            >
              {expanded ? "Show less" : `Show all (${rows.length})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
