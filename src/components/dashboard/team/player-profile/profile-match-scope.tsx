"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp, GalleryHorizontalEnd } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { floatMenuToneClasses } from "@/components/ui/float-menu";
import {
  countedMatches,
  draftFrom,
  MatchesDraftFilters,
  MatchesDraftFooter,
  MatchesDraftList,
  MatchesDraftStatus,
  useMatchesDraft,
} from "@/components/dashboard/matches/match-detail/shots/lightbox-matches-sheet";
import type { SeasonSheetMatch } from "@/components/dashboard/matches/match-detail/shots/lightbox-filters";
import {
  matchScopeQuery,
  parseMatchScope,
  type SeasonFilters,
} from "@/components/dashboard/matches/match-detail/shots/viz-url";
import { cn } from "@/lib/utils";

/** The page counts matches, so every row adds one to "Show N matches". */
const MATCH_NOUN = { one: "match", many: "matches" };

/**
 * Writes the page's match scope (`?sres=` / `?sopp=` / `?ssurf=` / `?sm=`,
 * `matchScopeQuery`) and keeps every other parameter. Through the router,
 * not native history: both bodies are computed on the server under the
 * scope (`page.tsx`, "The match scope"), so a scope change is a render.
 * `undefined` clears it — the bare URL is the whole season.
 */
function useWriteMatchScope() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (scope: SeasonFilters | undefined) => {
    const query = matchScopeQuery(
      new URLSearchParams(searchParams.toString()),
      scope,
    );
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  };
}

/**
 * The title row's "N of M matches" (plan §9, decision C4, boards Final-01 and
 * Final-12): which of the season's analyzed matches BOTH the Statistics and
 * the Visualizations bodies are about. N is what the URL's scope keeps, M
 * every analyzed match — "24 of 24 matches" is the whole season.
 *
 * It opens a popover under itself (the `FloatMenu` surface) holding the
 * lightbox Matches sheet's own draft and parts (`useMatchesDraft`,
 * `lightbox-matches-sheet.tsx`): Won · Opponent plays · Surface menus, "Search
 * opponents", the matches as checkboxes by month, then Clear all, the counts
 * and Show. Show writes the scope to the URL and closes; Esc and a click
 * outside throw the draft away. The draft starts from the URL each opening.
 *
 * `matches` is built on the server from the season (`seasonMatchOptions`,
 * every `count` 1). The page renders none of this for a season with no
 * analyzed match: there would be nothing to pick.
 */
export function ProfileMatchScope({
  matches,
}: {
  /** Every analyzed match, newest first. */
  matches: readonly SeasonSheetMatch[];
}) {
  const searchParams = useSearchParams();
  const scope = parseMatchScope(new URLSearchParams(searchParams.toString()));
  const [open, setOpen] = useState(false);
  const shown = countedMatches(draftFrom(scope), matches).length;
  const scoped = shown !== matches.length;
  const Chevron = open ? ChevronUp : ChevronDown;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          data-match-scope-trigger=""
          className={cn(
            "inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--radius-button)] px-2.5 text-[12px] whitespace-nowrap tabular-nums transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
            open && "bg-[var(--surface-subtle)]",
            scoped || open
              ? "font-medium text-[var(--ink-900)]"
              : "text-[var(--ink-600)]",
          )}
        >
          <GalleryHorizontalEnd
            className="size-3.5 shrink-0"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          {shown} of {matches.length}{" "}
          {matches.length === 1 ? "match" : "matches"}
          <Chevron className="size-3" strokeWidth={1.5} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={4}
        aria-label="Which matches"
        className={cn(
          floatMenuToneClasses(),
          "flex w-[360px] flex-col overflow-hidden p-0",
          "max-h-[min(560px,var(--radix-popover-content-available-height))]",
        )}
      >
        {/* Mounted only while open, so each opening drafts from the URL. */}
        <MatchScopeDraft
          matches={matches}
          scope={scope}
          onShow={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

function MatchScopeDraft({
  matches,
  scope,
  onShow,
}: {
  matches: readonly SeasonSheetMatch[];
  scope: SeasonFilters | undefined;
  onShow: () => void;
}) {
  const d = useMatchesDraft(matches, scope);
  const writeScope = useWriteMatchScope();
  return (
    <>
      <div className="shrink-0 px-5 pt-3.5">
        <h2 className="m-0 text-[13px] font-medium text-[var(--ink-900)]">
          Matches
        </h2>
        <p className="m-0 mt-0.5 text-[11px] text-[var(--ink-500)]">
          For Statistics and Visualizations
        </p>
      </div>
      <MatchesDraftFilters d={d} />
      <MatchesDraftStatus d={d} />
      <MatchesDraftList d={d} />
      <MatchesDraftFooter
        d={d}
        noun={MATCH_NOUN}
        onShow={(applied) => {
          writeScope(applied);
          onShow();
        }}
      />
    </>
  );
}

/** The facts line's "Show all": clears the page's match scope. */
export function MatchScopeShowAll() {
  const writeScope = useWriteMatchScope();
  return (
    <button
      type="button"
      onClick={() => writeScope(undefined)}
      className="ml-1.5 cursor-pointer font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
    >
      Show all
    </button>
  );
}
