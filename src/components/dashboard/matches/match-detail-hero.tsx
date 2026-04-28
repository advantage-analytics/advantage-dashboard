"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { Match } from "@/lib/data/types";

interface MatchDetailHeroProps {
  match: Match;
}

const MATCHES_HREF = "/dashboard/matches";

export function MatchDetailHero({ match }: MatchDetailHeroProps) {
  const router = useRouter();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;

      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (target.isContentEditable) return;
      }
      // Skip if any Radix overlay (popover, menu, dialog, tooltip, combobox) is open —
      // Radix sets data-state="open" on triggers; Esc should close those first.
      if (document.querySelector('[role="dialog"], [data-state="open"]')) return;

      router.push(MATCHES_HREF);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  const dateLabel = match.date ? formatHeroDate(match.date) : null;
  const hasTournament = Boolean(match.tournamentName?.trim());
  const heroTitle = hasTournament
    ? match.tournamentName
    : buildFallbackTitle(match.date);
  // When the title itself is date-derived, suppress the date in the eyebrow to avoid duplication.
  const eyebrowDate = hasTournament ? dateLabel : null;
  const eyebrowParts = [match.matchContext, eyebrowDate].filter(Boolean) as string[];

  return (
    <div className="flex items-end justify-between gap-4 min-w-0">
      <div className="flex flex-col gap-3 min-w-0">
        {eyebrowParts.length > 0 && (
          <p className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA] truncate tabular-nums">
            {eyebrowParts.map((part, i) => (
              <span key={i}>
                {i > 0 && <span aria-hidden="true" className="mx-2 opacity-50">·</span>}
                {part}
              </span>
            ))}
          </p>
        )}
        <h1 className="font-light text-[30px] text-[#0D0D0D] tracking-[-0.6px] leading-[36px] truncate">
          {heroTitle}
        </h1>
      </div>

      <Link
        href={MATCHES_HREF}
        aria-label="Back to all matches"
        className="shrink-0 inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-0 sm:h-7 px-2 -mr-2 rounded text-[10px] font-medium uppercase tracking-[1.5px] text-[#525252] hover:text-[#0D0D0D] hover:bg-[#0D0D0D]/[0.05] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
      >
        <ArrowLeft className="size-3" strokeWidth={1.75} aria-hidden="true" />
        Back
        <kbd
          aria-hidden="true"
          className="hidden sm:inline-flex items-center justify-center ml-0.5 text-[10px] font-medium leading-none tracking-normal normal-case pl-1 pr-[3px] py-0.5 rounded text-[#AEAEB2] bg-[#F0F0F0]"
        >
          ESC
        </kbd>
      </Link>
    </div>
  );
}

function formatHeroDate(date: string): string {
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return date;
    return d
      .toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
      .toUpperCase();
  } catch {
    return date;
  }
}

function buildFallbackTitle(date: string | undefined): string {
  if (!date) return "Match";
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return "Match";
    const sameYear = d.getFullYear() === new Date().getFullYear();
    const formatted = d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      ...(sameYear ? {} : { year: "numeric" }),
    });
    return `Match \u00b7 ${formatted}`;
  } catch {
    return "Match";
  }
}
