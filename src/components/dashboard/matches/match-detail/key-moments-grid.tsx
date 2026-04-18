"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

const EASE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

interface KeyMoment {
  moment: string;
  description: string;
}

interface KeyMomentsGridProps {
  moments: KeyMoment[];
  player1Name?: string;
}

type MomentTone = "positive" | "negative" | "neutral";

interface ParsedMoment {
  title: string;
  description: string;
  tone: MomentTone;
  setNumber: number | null;
  gameNumber: number | null;
  tag: string;
  context: string;
}

const POSITIVE_PATTERNS = [
  /break(s|ing)?\b/i,
  /convert(ed)?/i,
  /\bhold(s|ing)?\b/i,
  /clutch/i,
  /save(s|d)?/i,
  /winner/i,
  /momentum shift/i,
  /dominance/i,
];

const NEGATIVE_PATTERNS = [
  /dropped/i,
  /lost\b/i,
  /missed/i,
  /unforced/i,
  /double.fault/i,
  /broken/i,
];

function detectTone(text: string): MomentTone {
  if (POSITIVE_PATTERNS.some((r) => r.test(text))) return "positive";
  if (NEGATIVE_PATTERNS.some((r) => r.test(text))) return "negative";
  return "neutral";
}

function parseLocation(text: string): { set: number | null; game: number | null } {
  const setMatch = text.match(/set\s+(\d+)/i);
  const gameMatch = text.match(/game\s+(\d+)/i);
  return {
    set: setMatch ? Number(setMatch[1]) : null,
    game: gameMatch ? Number(gameMatch[1]) : null,
  };
}

function deriveTag(text: string): string {
  if (/break.*point|\bbp\b/i.test(text)) return "Break point";
  if (/break/i.test(text)) return "Break of serve";
  if (/save(s|d)?/i.test(text)) return "Clutch serving";
  if (/hold(s|ing)?/i.test(text)) return "Service hold";
  if (/rally|baseline/i.test(text)) return "Rally control";
  if (/momentum/i.test(text)) return "Momentum shift";
  if (/winner/i.test(text)) return "Winner";
  if (/unforced/i.test(text)) return "Unforced error";
  return "Key moment";
}

function parseMoment(m: KeyMoment): ParsedMoment {
  const combined = `${m.moment} ${m.description}`;
  const { set, game } = parseLocation(combined);
  return {
    title: m.moment,
    description: m.description,
    tone: detectTone(combined),
    setNumber: set,
    gameNumber: game,
    tag: deriveTag(combined),
    context: "",
  };
}

const TONE_STYLES: Record<MomentTone, { accent: string; tagColor: string }> = {
  positive: { accent: "bg-[#5DB955]", tagColor: "text-[#5DB955]" },
  negative: { accent: "bg-[#E51837]", tagColor: "text-[#E51837]" },
  neutral: { accent: "bg-[#3B82F6]", tagColor: "text-[#3B82F6]" },
};

export function KeyMomentsGrid({ moments }: KeyMomentsGridProps) {
  const prefersReduced = useReducedMotion();

  const parsed = useMemo(
    () => moments.slice(0, 6).map(parseMoment),
    [moments],
  );

  if (parsed.length === 0) return null;

  return (
    <section
      aria-labelledby="key-moments-heading"
      className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] p-5 flex flex-col gap-5"
    >
      <div className="flex items-baseline justify-between">
        <p
          id="key-moments-heading"
          className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px] leading-[15px]"
        >
          Key Moments
        </p>
        <p className="text-[10px] font-normal text-[#AAAAAA] tabular-nums leading-[15px]">
          {parsed.length} recorded
        </p>
      </div>

      <ol className="flex flex-col" role="list">
        {parsed.map((moment, i) => {
          const styles = TONE_STYLES[moment.tone];
          const index = String(i + 1).padStart(2, "0");
          const locationLabel = moment.setNumber
            ? `Set ${moment.setNumber}${moment.gameNumber ? ` · Game ${moment.gameNumber}` : ""}`
            : `Moment ${index}`;

          return (
            <motion.li
              key={`${moment.title}-${i}`}
              className={cn(
                "group relative grid grid-cols-[32px_minmax(0,1fr)_180px] items-center gap-6 py-5",
                i !== 0 && "border-t border-[#F3F3F3]",
              )}
              initial={prefersReduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.04, ease: EASE }}
            >
              <div className="flex items-center gap-3 self-stretch">
                <div
                  className={cn(
                    "w-px h-full rounded-full shrink-0 opacity-70 group-hover:opacity-100 transition-opacity duration-200",
                    styles.accent,
                  )}
                  aria-hidden="true"
                />
                <span className="text-[10px] font-medium text-[#AAAAAA] tabular-nums tracking-[1px] uppercase">
                  {index}
                </span>
              </div>

              <div className="flex flex-col gap-1 min-w-0">
                <p className="text-[13px] font-medium text-[#0D0D0D] leading-[20px] truncate">
                  {moment.title}
                </p>
                {moment.description && (
                  <p className="text-[11px] font-normal text-[#71717A] leading-[1.5] line-clamp-2">
                    {moment.description}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1 items-end text-right">
                <p className="text-[9px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px] leading-[15px] tabular-nums">
                  {locationLabel}
                </p>
                <p
                  className={cn(
                    "text-[12px] font-medium leading-[18px]",
                    styles.tagColor,
                  )}
                >
                  {moment.tag}
                </p>
              </div>
            </motion.li>
          );
        })}
      </ol>
    </section>
  );
}
