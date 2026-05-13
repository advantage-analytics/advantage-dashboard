"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { MatchMetadataRow } from "@/components/dashboard/matches/match-metadata-row";
import { ShareMatchButton } from "@/components/dashboard/matches/match-detail/share-match-button";
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

  const hasTournament = Boolean(match.tournamentName?.trim());
  const heroTitle = hasTournament
    ? match.tournamentName
    : buildFallbackTitle(match.date);

  return (
    <div className="flex items-end justify-between gap-4 min-w-0">
      <div className="flex flex-col gap-4 min-w-0">
        <div className="flex flex-col gap-3 min-w-0">
          <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
            Match
          </p>
          <h1
            title={heroTitle}
            className="font-light text-[30px] text-[#0D0D0D] tracking-[-0.6px] leading-[36px] truncate"
          >
            {heroTitle}
          </h1>
        </div>
        {(match.date || match.matchType || match.courtType) && (
          <div className="flex items-center gap-4">
            {match.date && (
              <div className="flex items-center gap-1">
                <Calendar
                  className="size-3.5 text-[var(--color-text-muted)]"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <span className="text-[10px] leading-4 text-[var(--color-text-muted)]">
                  {match.date}
                </span>
              </div>
            )}
            {(match.matchType || match.courtType) && (
              <MatchMetadataRow
                matchType={match.matchType}
                courtType={match.courtType}
                showVerification={false}
              />
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 flex flex-col items-end gap-3">
        <ShareMatchButton match={match} />
        <nav
          aria-label="Match navigation"
          className="flex items-center gap-3.5"
        >
          <NavLink
            href={previousMatchId ? `/dashboard/matches/${previousMatchId}` : null}
            label="Prev"
            ariaLabel="Previous match"
            title="Previous match (←)"
            shortcut="ArrowLeft"
            icon={
              <span aria-hidden className="text-[14px] font-normal leading-none">
                ‹
              </span>
            }
            position="left"
          />
          <NavLink
            href={nextMatchId ? `/dashboard/matches/${nextMatchId}` : null}
            label="Next"
            ariaLabel="Next match"
            title="Next match (→)"
            shortcut="ArrowRight"
            icon={
              <span aria-hidden className="text-[14px] font-normal leading-none">
                ›
              </span>
            }
            position="right"
          />
        </nav>
      </div>
    </div>
  );
}

function NavLink({
  href,
  label,
  ariaLabel,
  title,
  shortcut,
  icon,
  position,
}: {
  href: string | null;
  label: string;
  ariaLabel: string;
  title: string;
  shortcut: string;
  icon: React.ReactNode;
  position: "left" | "right";
}) {
  const content = (
    <>
      {position === "left" && icon}
      <span className="text-[10px] font-medium uppercase tracking-[1.5px] leading-[15px]">
        {label}
      </span>
      {position === "right" && icon}
    </>
  );

  const baseClass =
    "inline-flex items-center gap-1 py-2 -my-2 text-[var(--color-text-muted)] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue-ring)] rounded-sm";

  if (!href) {
    return (
      <span
        aria-label={ariaLabel}
        aria-disabled="true"
        className={cn(baseClass, "opacity-30 cursor-not-allowed")}
      >
        {content}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      title={title}
      aria-keyshortcuts={shortcut}
      className={cn(baseClass, "hover:text-[var(--color-text-primary)]")}
    >
      {content}
    </Link>
  );
}

function buildFallbackTitle(date: string | undefined): string {
  if (!date) return "Match";
  return `Match · ${date}`;
}
