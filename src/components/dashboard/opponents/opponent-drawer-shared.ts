import type { NavLink } from "@/lib/dashboard/nav";
import { askOpponentKey } from "@/lib/data/ask-tags";
import { formatMatchDayCompact } from "@/lib/data/match-day";
import { UNKNOWN_OPPONENT_NAME } from "@/lib/data/personal-opponents";

/**
 * What the personal and the team opponent drawer both need and neither owns:
 * the recent row's date, who the footer addresses, where "all their matches"
 * lives, and the rule that keeps a drawer from linking to a coming-soon page.
 *
 * No JSX and no `"use client"`, so a spec can import it — and so the two
 * drawers cannot disagree about any of it. `opponent-drawer.tsx` held these
 * privately until the team drawer needed the same four answers.
 */

/** How many recent matches a drawer lists; its chart plots all of `recent`. */
export const RECENT_ROWS = 3;

/**
 * The recent row's date, cut to its 40px mono track: "Sep 14" this year,
 * "Sep ’25" once it is not. `formatShortDate`'s "Sep 14, 2025" is twice the
 * track and would run under the score; the match page carries the whole date.
 *
 * The match's day by the one rule (`match-day.ts`): the stored value's date
 * part, never the reader's zone — a match stored at `00:00Z` is that day in
 * Los Angeles too. `now` is a parameter only so a spec can hold the year
 * still; its UTC day is what "this year" is read off.
 */
export function rowDate(isoDate: string, now?: Date): string {
  return formatMatchDayCompact(isoDate, now);
}

/**
 * Whether a nav destination is a real page yet, not its stub. Read against
 * the workspace's own list — `PERSONAL_NAV` or `TEAM_NAV` — so a link returns
 * on its own the day its nav flag is lifted. A route the list does not name is
 * live: only a flagged entry is a stub.
 */
export function isLive(
  nav: readonly Pick<NavLink, "href" | "comingSoon">[],
  href: string,
): boolean {
  return !nav.find((link) => link.href === href)?.comingSoon;
}

/**
 * What the footer and the placeholder call the opponent. A group with no name
 * on any match has nobody to address ("Ask about Unknown" is not a sentence),
 * and a name typed surname-first ("Gimena, Cj") would put the comma on the
 * button.
 */
export function opponentFirstName(name: string): string {
  if (name === UNKNOWN_OPPONENT_NAME) return "this opponent";
  return name.split(" ")[0].replace(/[,;]+$/, "") || "this opponent";
}

/**
 * The Matches list filtered to this opponent by its own search box, so the
 * count in the personal drawer's "All N" is the count on the page it opens.
 */
export function opponentMatchesHref(name: string): string {
  return name === UNKNOWN_OPPONENT_NAME
    ? "/dashboard/matches"
    : `/dashboard/matches?q=${encodeURIComponent(name)}`;
}

export interface OpponentDrawerLink {
  href: string;
  label: string;
}

/**
 * The Ask page with this opponent already tagged: `askHref` plus
 * `?opponent=<askOpponentKey(name)>`, the key the page's own opponent tags
 * carry (`ask-tags.ts`). A group with no name keys nothing, so it opens the
 * page bare rather than with a tag that names nobody.
 */
export function askAboutOpponentHref(askHref: string, name: string): string {
  if (name === UNKNOWN_OPPONENT_NAME) return askHref;
  const key = askOpponentKey(name);
  return key === null
    ? askHref
    : `${askHref}?opponent=${encodeURIComponent(key)}`;
}

export interface OpponentDrawerFooter {
  /** "Ask about …" — present only while the Ask page is a real page. */
  ghost: OpponentDrawerLink | null;
  /** The one primary. Also where the name in the body leads. */
  primary: OpponentDrawerLink;
}

/**
 * The drawer's footer, for either workspace: nothing in it leads to a
 * coming-soon page. While Statistics is a stub the primary opens the Matches
 * list searched for this opponent, and while Ask is a stub its button is
 * absent — never present and refusing on arrival.
 */
export function opponentDrawerFooter({
  nav,
  statisticsHref,
  askHref,
  name,
}: {
  nav: readonly Pick<NavLink, "href" | "comingSoon">[];
  /** The workspace's Statistics route, as its nav list spells it. */
  statisticsHref: string;
  /** The workspace's Ask route, as its nav list spells it. */
  askHref: string;
  /** The opponent's name as the drawer prints it. */
  name: string;
}): OpponentDrawerFooter {
  const firstName = opponentFirstName(name);
  const statisticsLive = isLive(nav, statisticsHref);
  return {
    ghost: isLive(nav, askHref)
      ? { href: askHref, label: `Ask about ${firstName}` }
      : null,
    primary: statisticsLive
      ? { href: statisticsHref, label: `Open statistics vs. ${firstName}` }
      : {
          href: opponentMatchesHref(name),
          label: `View matches vs. ${firstName}`,
        },
  };
}
