"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Match } from "@/lib/data/types";

interface MatchDetailHeroProps {
  match: Match;
  previousMatchId?: string | null;
  nextMatchId?: string | null;
}

const MATCHES_HREF = "/dashboard/matches";

export function MatchDetailHero({
  match,
  previousMatchId,
  nextMatchId,
}: MatchDetailHeroProps) {
  const router = useRouter();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;

      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (target.isContentEditable) return;
      }
      // Skip if any Radix overlay (popover, menu, dialog, tooltip, combobox) is open —
      // Esc should close those first, and arrow keys should navigate within.
      if (document.querySelector('[role="dialog"], [data-state="open"]')) return;

      if (e.key === "Escape") {
        router.push(MATCHES_HREF);
      } else if (e.key === "ArrowLeft" && previousMatchId) {
        router.push(`/dashboard/matches/${previousMatchId}`);
      } else if (e.key === "ArrowRight" && nextMatchId) {
        router.push(`/dashboard/matches/${nextMatchId}`);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, previousMatchId, nextMatchId]);

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

      <div className="shrink-0 flex items-center gap-2">
        <div
          role="group"
          aria-label="Match navigation"
          className="inline-flex items-stretch h-11 sm:h-7 rounded border border-[var(--color-border-subtle)] overflow-hidden"
        >
          <NavSegment
            href={previousMatchId ? `/dashboard/matches/${previousMatchId}` : null}
            label="Previous match"
            title="Previous match (←)"
            shortcut="ArrowLeft"
            icon={<ChevronLeft className="size-3.5" strokeWidth={1.75} aria-hidden="true" />}
          />
          <span
            aria-hidden="true"
            className="w-px self-stretch bg-[var(--color-border-subtle)]"
          />
          <NavSegment
            href={nextMatchId ? `/dashboard/matches/${nextMatchId}` : null}
            label="Next match"
            title="Next match (→)"
            shortcut="ArrowRight"
            icon={<ChevronRight className="size-3.5" strokeWidth={1.75} aria-hidden="true" />}
          />
        </div>
        <span
          aria-hidden="true"
          className="hidden sm:inline-block text-[9px] font-medium text-[var(--color-text-dim)] tracking-[2.5px] tabular-nums"
        >
          ← →
        </span>
        <Link
          href={MATCHES_HREF}
          aria-label="Back to all matches"
          className="inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-0 sm:h-7 px-2 -mr-2 rounded text-[10px] font-medium uppercase tracking-[1.5px] text-[#525252] hover:text-[#0D0D0D] hover:bg-[#0D0D0D]/[0.05] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
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
    </div>
  );
}

function NavSegment({
  href,
  label,
  title,
  shortcut,
  icon,
}: {
  href: string | null;
  label: string;
  title: string;
  shortcut: string;
  icon: React.ReactNode;
}) {
  const baseClass =
    "inline-flex items-center justify-center w-11 sm:w-7 h-full text-[#525252] transition-colors duration-200 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#3B82F6]/40";
  if (!href) {
    return (
      <span
        aria-label={label}
        aria-disabled="true"
        role="button"
        className={cn(baseClass, "opacity-30 cursor-not-allowed")}
      >
        {icon}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      title={title}
      aria-keyshortcuts={shortcut}
      className={cn(baseClass, "hover:text-[#0D0D0D] hover:bg-[#0D0D0D]/[0.05]")}
    >
      {icon}
    </Link>
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
