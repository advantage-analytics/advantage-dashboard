"use client";

import { ChevronDown, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { FilterPills } from "./visuals/filter-pills";
import { cn } from "@/lib/utils";
import type { VideoFilters, FilterCategory } from "./video-filters";
import { DEFAULT_FILTERS, getActiveFilterCount, getTotalActiveFilterCount } from "./video-filters";

const EASE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

const POINT_SCORES = [
  "0-0", "15-0", "30-0", "40-0",
  "0-15", "15-15", "30-15", "40-15",
  "0-30", "15-30", "30-30", "40-30",
  "0-40", "15-40", "30-40", "40-40",
  "Ad-40", "40-Ad",
];

const CATEGORIES: { key: FilterCategory; label: string }[] = [
  { key: "score", label: "Score" },
  { key: "serve", label: "Serve" },
  { key: "return", label: "Return" },
  { key: "result", label: "Result" },
  { key: "custom", label: "Custom" },
];

interface VideoFilterBarProps {
  filters: VideoFilters;
  onFiltersChange: (filters: VideoFilters) => void;
  player1Name: string;
  player2Name: string;
}

/* ── Active filter tags (data-driven) ────────────────────────── */

// Each entry: [filterKey, idPrefix, labelFn]
// This replaces 21 identical for-loops with a single declarative list.
type TagDef = {
  key: keyof VideoFilters;
  prefix: string;
  label: (v: string, p1: string, p2: string) => string;
};

const TAG_DEFS: TagDef[] = [
  { key: "sets",             prefix: "set",   label: (v) => `Set ${v}` },
  { key: "scoreTypes",       prefix: "st",    label: (v) => v },
  { key: "pointScores",      prefix: "ps",    label: (v) => v },
  { key: "servePlayers",     prefix: "sp",    label: (v, p1, p2) => `Serve: ${v === "player1" ? p1 : p2}` },
  { key: "serveSides",       prefix: "ss",    label: (v) => `Serve: ${v}` },
  { key: "serveTypes",       prefix: "sty",   label: (v) => v },
  { key: "serveSpins",       prefix: "ssp",   label: (v) => `Serve: ${v}` },
  { key: "serveZones",       prefix: "sz",    label: (v) => `Serve: ${v}` },
  { key: "returnPlayers",    prefix: "rp",    label: (v, p1, p2) => `Return: ${v === "player1" ? p1 : p2}` },
  { key: "returnSides",      prefix: "rs",    label: (v) => `Return: ${v}` },
  { key: "returnTypes",      prefix: "rt",    label: (v) => `Return: ${v}` },
  { key: "returnSpins",      prefix: "rsp",   label: (v) => `Return: ${v}` },
  { key: "returnZones",      prefix: "rz",    label: (v) => `Return: ${v}` },
  { key: "returnContacts",   prefix: "rc",    label: (v) => `Contact: ${v}` },
  { key: "resultPlayers",    prefix: "rep",   label: (v, p1, p2) => `Result: ${v === "player1" ? p1 : p2}` },
  { key: "resultZones",      prefix: "rez",   label: (v) => `Result: ${v}` },
  { key: "resultOutcomes",   prefix: "reo",   label: (v) => v },
  { key: "customPlayers",    prefix: "cp",    label: (v, p1, p2) => `Custom: ${v === "player1" ? p1 : p2}` },
  { key: "customSides",      prefix: "cs",    label: (v) => `Custom: ${v}` },
  { key: "customDirections", prefix: "cd",    label: (v) => v },
  { key: "rallyShots",       prefix: "rally", label: (v) => `Rally ${v}` },
];

function getActiveTags(
  filters: VideoFilters,
  onChange: (f: VideoFilters) => void,
  p1: string,
  p2: string,
) {
  const tags: { id: string; label: string; onRemove: () => void }[] = [];

  for (const { key, prefix, label } of TAG_DEFS) {
    const arr = filters[key] as (string | number)[];
    for (const val of arr) {
      tags.push({
        id: `${prefix}-${val}`,
        label: label(String(val), p1, p2),
        onRemove: () =>
          onChange({ ...filters, [key]: arr.filter((x) => x !== val) }),
      });
    }
  }

  return tags;
}

/* ── Popover filter content (config-driven) ──────────────────── */

type PillsDef = {
  label: string;
  key: keyof VideoFilters;
  options: { value: string; label: string }[];
  pillClassName?: string;
};

function getCategoryPills(
  category: FilterCategory,
  playerOptions: { value: string; label: string }[],
): PillsDef[] {
  switch (category) {
    case "score":
      return [
        { label: "Sets", key: "sets", options: [{ value: "1", label: "Set 1" }, { value: "2", label: "Set 2" }, { value: "3", label: "Set 3" }] },
        { label: "Type", key: "scoreTypes", options: [{ value: "Pressure", label: "Pressure" }, { value: "Breakpoint", label: "Breakpoint" }, { value: "Set Point", label: "Set Point" }, { value: "Match Point", label: "Match Point" }] },
        { label: "Points", key: "pointScores", options: POINT_SCORES.map((s) => ({ value: s, label: s })), pillClassName: "w-[54px] text-center !px-0 truncate" },
      ];
    case "serve":
      return [
        { label: "Player", key: "servePlayers", options: playerOptions },
        { label: "Side", key: "serveSides", options: [{ value: "Deuce", label: "Deuce" }, { value: "Ad", label: "Ad" }] },
        { label: "Type", key: "serveTypes", options: [{ value: "First Serve", label: "First Serve" }, { value: "Second Serve", label: "Second Serve" }] },
        { label: "Spin", key: "serveSpins", options: [{ value: "Flat", label: "Flat" }, { value: "Slice", label: "Slice" }, { value: "Kick", label: "Kick" }] },
        { label: "Zone", key: "serveZones", options: [{ value: "Wide", label: "Wide" }, { value: "Body", label: "Body" }, { value: "T", label: "T" }] },
      ];
    case "return":
      return [
        { label: "Player", key: "returnPlayers", options: playerOptions },
        { label: "Side", key: "returnSides", options: [{ value: "Deuce", label: "Deuce" }, { value: "Ad", label: "Ad" }] },
        { label: "Type", key: "returnTypes", options: [{ value: "Forehand", label: "Forehand" }, { value: "Backhand", label: "Backhand" }] },
        { label: "Spin", key: "returnSpins", options: [{ value: "Topspin", label: "Topspin" }, { value: "Slice", label: "Slice" }] },
        { label: "Zone", key: "returnZones", options: [{ value: "Down the Line", label: "Down the Line" }, { value: "Middle", label: "Middle" }, { value: "Crosscourt", label: "Crosscourt" }] },
        { label: "Contact", key: "returnContacts", options: [{ value: "Inside", label: "Inside" }, { value: "Neutral", label: "Neutral" }, { value: "Deep", label: "Deep" }] },
      ];
    case "result":
      return [
        { label: "Player", key: "resultPlayers", options: playerOptions },
        { label: "Zone", key: "resultZones", options: [{ value: "Serve", label: "Serve" }, { value: "Return", label: "Return" }, { value: "Forehand", label: "Forehand" }, { value: "Backhand", label: "Backhand" }, { value: "Volley", label: "Volley" }, { value: "Overhead", label: "Overhead" }] },
        { label: "Outcome", key: "resultOutcomes", options: [{ value: "Won", label: "Won" }, { value: "Lost", label: "Lost" }, { value: "Winner", label: "Winner" }, { value: "Error", label: "Error" }] },
      ];
    case "custom":
      return [
        { label: "Player", key: "customPlayers", options: playerOptions },
        { label: "Side", key: "customSides", options: [{ value: "Deuce", label: "Deuce" }, { value: "Ad", label: "Ad" }] },
        { label: "Direction", key: "customDirections", options: [{ value: "Crosscourt", label: "Crosscourt" }, { value: "Down the Line", label: "Down the Line" }, { value: "Inside Out", label: "Inside Out" }, { value: "Inside In", label: "Inside In" }] },
        { label: "Rally Shot", key: "rallyShots", options: Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })) },
      ];
  }
}

// Number-valued filter keys that need string↔number conversion
const NUMBER_KEYS = new Set<keyof VideoFilters>(["sets", "rallyShots"]);

/* ── Main component ──────────────────────────────────────────── */

export function VideoFilterBar({ filters, onFiltersChange, player1Name, player2Name }: VideoFilterBarProps) {
  const totalActive = getTotalActiveFilterCount(filters);
  const playerOptions = [
    { value: "player1", label: player1Name },
    { value: "player2", label: player2Name },
  ];

  const activeTags = totalActive > 0 ? getActiveTags(filters, onFiltersChange, player1Name, player2Name) : [];

  return (
    <div className="flex flex-col gap-3">
      {/* Filter trigger bar */}
      <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] flex items-center gap-2 px-4 h-[52px]">
        <span className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2px] mr-1 shrink-0">
          Filters
        </span>

        {CATEGORIES.map((cat) => {
          const count = getActiveFilterCount(filters, cat.key);
          const pills = getCategoryPills(cat.key, playerOptions);
          return (
            <Popover key={cat.key}>
              <PopoverTrigger asChild>
                <button
                  className={cn(
                    "rounded-full h-8 px-3.5 text-[11px] font-medium whitespace-nowrap inline-flex items-center gap-1.5",
                    "transition-colors duration-200 active:scale-[0.97]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 focus-visible:ring-offset-1",
                    count > 0
                      ? "bg-[#EBF2FD] text-[#3B82F6] ring-1 ring-inset ring-[#3B82F6]"
                      : "ring-1 ring-inset ring-[#EAECF0] text-[#525252] bg-white hover:bg-[#EFF6FF] hover:ring-[#3B82F6]/30 hover:text-[#3B82F6]"
                  )}
                >
                  {cat.label}
                  {count > 0 && (
                    <span className="bg-[#3B82F6] text-white text-[9px] font-medium rounded-full w-4 h-4 inline-flex items-center justify-center">
                      {count}
                    </span>
                  )}
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="p-5 w-auto max-w-[480px]">
                <div className="flex flex-col gap-4 max-w-[440px]">
                  {pills.map((pill) => (
                    <FilterPills
                      key={pill.key}
                      label={pill.label}
                      options={pill.options}
                      selected={(filters[pill.key] as (string | number)[]).map(String)}
                      onChange={(sel) =>
                        onFiltersChange({
                          ...filters,
                          [pill.key]: NUMBER_KEYS.has(pill.key) ? sel.map(Number) : sel,
                        })
                      }
                      pillClassName={pill.pillClassName}
                    />
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          );
        })}

        <div className="flex-1" />

        {totalActive > 0 && (
          <button
            onClick={() => onFiltersChange(DEFAULT_FILTERS)}
            className="text-[11px] font-medium text-[#525252] hover:text-[#EF4444] transition-colors duration-200 whitespace-nowrap"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Active filter tags */}
      <AnimatePresence>
        {activeTags.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap gap-1.5">
              {activeTags.map((tag) => (
                <motion.button
                  key={tag.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.15, ease: EASE }}
                  onClick={tag.onRemove}
                  className="inline-flex items-center gap-1 rounded-full h-6 px-2.5 text-[10px] font-medium text-[#525252] bg-[#F5F5F5] hover:bg-[#FEF2F2] hover:text-[#EF4444] transition-colors duration-150 group"
                >
                  {tag.label}
                  <X className="h-2.5 w-2.5 opacity-40 group-hover:opacity-100 transition-opacity" />
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
