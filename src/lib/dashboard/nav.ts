import {
  Home,
  Calendar,
  GalleryHorizontalEnd,
  ChartLine,
  MessageSquare,
  UsersRound,
  Brain,
  Settings,
  HelpCircle,
} from "lucide-react";

/**
 * The dashboard's destinations, defined once.
 *
 * They were briefly defined three times — the sidebar's menus, the header's
 * breadcrumb `if` chain, and each page's own `title` prop — and had already
 * drifted on the first pass: the sidebar said "Help Center" where the
 * breadcrumb said "Help". Adding a route meant two or three synchronised edits,
 * and renaming one meant the breadcrumb silently kept the old word.
 *
 * Navigation is not a filtered view of one menu. A personal workspace and a
 * program are different products, so each gets its own list.
 */
export type NavLink = {
  name: string;
  href: string;
  icon: React.ComponentType<
    React.SVGProps<SVGSVGElement> & { strokeWidth?: number }
  >;
  /**
   * Marks a route whose page renders `ComingSoonPage` rather than the real
   * feature. The flag surfaces in the collapsed rail's tooltip and in the
   * row's `aria-label` — a collapsed rail has no room for a second cue — but
   * the expanded label stays clean text with no badge or suffix.
   */
  comingSoon?: true;
};

export const PERSONAL_NAV: readonly NavLink[] = [
  { name: "Home", href: "/dashboard", icon: Home },
  { name: "Matches", href: "/dashboard/matches", icon: GalleryHorizontalEnd },
  {
    name: "Statistics",
    href: "/dashboard/statistics",
    icon: ChartLine,
    comingSoon: true,
  },
  {
    name: "Ask",
    href: "/dashboard/ask",
    icon: MessageSquare,
    comingSoon: true,
  },
];

/**
 * A program plays a schedule and then owns the matches that come out of it.
 * Both entries are here because they answer different questions, and the two
 * branches that added them each arrived with only half the answer.
 *
 * `/dashboard/team/schedule` reads `program_events` — "what is this program
 * playing", including fixtures with no match row yet.
 *
 * `/dashboard/matches` reads matches — "what has this program played". It was
 * deliberately absent for a while, because the page filtered on
 * `created_by = auth.uid()` and would have shown a coach their own uploads
 * presented as the program's: the wrong-attribution failure
 * `docs/ui-revamp-guardrails.md` warns about, where nothing looks broken on
 * screen. The page resolves its own workspace scope now — personal reads
 * `created_by = me AND program_id IS NULL`, team reads `program_id = <program>`
 * and lets `visible_match_ids()` decide who sees which rows — so the entry is
 * back, and inside a program players have a route to a match list again.
 *
 * The two carry different icons because they are adjacent rows answering
 * different questions — the design's own pairing: `calendar` for Schedule,
 * `gallery-horizontal-end` for Matches. Matches keeps the same glyph
 * `PERSONAL_NAV` gives it, so one destination does not change shape when the
 * workspace switcher moves.
 *
 * Opponents took Compare's slot. Compare answered "which of my two players is
 * holding serve better" and nothing replaces it — that was weighed and
 * decided, and the roster's player profile is now the only place a single
 * player's rates are read. What Opponents kept from Compare is the slot, not
 * the icon: it now carries the design's own `brain`, not Compare's `Swords`.
 * Opponents sits outside `/dashboard/team` because most of what it shows is
 * not this program's: it reads the pooled public-record views across every
 * program, and only the private tier is scoped to the viewer.
 *
 * Statistics and Ask are `/dashboard/team/statistics` and `/dashboard/team/ask`
 * — separate routes from `PERSONAL_NAV`'s, not the same href reused. That is
 * the "different page against a different scope" `statistics/page.tsx`'s own
 * comment leaves as a placeholder for: the personal route intentionally shows
 * the viewer's own matches from inside a team workspace, so a program-wide
 * version needs a URL of its own rather than a branch inside that page. Both
 * are `ComingSoonPage` stubs today and need no guard of their own —
 * `team/layout.tsx` already redirects anyone here who is not in a team
 * workspace, which is what "only work inside a team workspace" means until
 * there is program data to scope.
 */
export const TEAM_NAV: readonly NavLink[] = [
  { name: "Team Home", href: "/dashboard/team", icon: Home },
  { name: "Schedule", href: "/dashboard/team/schedule", icon: Calendar },
  { name: "Matches", href: "/dashboard/matches", icon: GalleryHorizontalEnd },
  { name: "Roster", href: "/dashboard/team/roster", icon: UsersRound },
  {
    name: "Opponents",
    href: "/dashboard/opponents",
    icon: Brain,
    comingSoon: true,
  },
  {
    name: "Statistics",
    href: "/dashboard/team/statistics",
    icon: ChartLine,
    comingSoon: true,
  },
  {
    name: "Ask",
    href: "/dashboard/team/ask",
    icon: MessageSquare,
    comingSoon: true,
  },
];

export const PERSONAL_BOTTOM: readonly NavLink[] = [
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
  { name: "Help Center", href: "/dashboard/help", icon: HelpCircle },
];

/**
 * Same Settings entry as the personal menu, deliberately.
 *
 * It used to point at `/dashboard/team/settings`, a separate page — which meant
 * a coach in a team workspace had no route to their own profile or plan from
 * the rail, and the sidebar lit nothing at all when they got to one. Team is a
 * section *inside* Settings now, so one destination serves both and the
 * settings rail decides what is in it.
 */
export const TEAM_BOTTOM: readonly NavLink[] = [
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
  { name: "Help Center", href: "/dashboard/help", icon: HelpCircle },
];

/**
 * Destinations that are NOT rail items but still need naming.
 *
 * The header reads `navLabel(pathname)` for its crumb, and longest-match over
 * the rail alone put "Team Home" above the upload wizard — a crumb naming a
 * page you are not on. These carry a name without claiming a place in the rail.
 */
const UNLISTED: readonly NavLink[] = [
  { name: "Upload video", href: "/dashboard/team/upload", icon: Calendar },
];

/**
 * Every destination the rail can send you to.
 *
 * `team/upload` is deliberately absent: `UNLISTED` names it so the crumb can
 * say "Upload video", but it is a step inside a flow, not a place, so it
 * belongs on the trail rather than in this set.
 *
 * PERSONAL_BOTTOM and TEAM_BOTTOM are identical today, so this holds
 * duplicate hrefs. `some()` does not care, and de-duplicating would couple
 * the two lists that nav.ts keeps separate on purpose.
 */
const DESTINATIONS: readonly NavLink[] = [
  ...PERSONAL_NAV,
  ...TEAM_NAV,
  ...PERSONAL_BOTTOM,
  ...TEAM_BOTTOM,
];

/**
 * Everything nameable: the destinations plus the routes that carry a label
 * without claiming a rail row.
 *
 * Composed from `DESTINATIONS` rather than re-spreading the same four arrays,
 * so the two sets state their relationship — "everything" *is* "destinations
 * plus the unlisted" — instead of being two independent enumerations that a
 * fifth nav array could silently desynchronise.
 */
const ALL_LINKS: readonly NavLink[] = [...UNLISTED, ...DESTINATIONS];

/**
 * The sections of Settings, in rail order.
 *
 * Same reasoning as the destinations above: the rail renders this, the header's
 * breadcrumb reads it to name the sub-page, and the redirect at
 * `/dashboard/settings` points at its first entry. Three readers, one list.
 */
export type SettingsSection = {
  id: string;
  /** The rail's word. One word where one word will do. */
  label: string;
  href: string;
  /**
   * The page's own heading, where it differs from the rail's word — the rail
   * says "Usage" because six one-word rows scan in a glance, the page says
   * "Usage & quota" because that is what it is.
   */
  title?: string;
  /** The line under the heading. A node, because Plan's carries a link. */
  subtitle: string;
  /**
   * Teams lists every program the viewer belongs to, so it exists only for
   * someone who belongs to at least one — at any standing, including player.
   * What a player may *do* on a team is the detail page's question, re-asked
   * on the server; a hidden nav item is not authorization.
   */
  teamMemberOnly?: boolean;
};

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  {
    id: "profile",
    label: "Profile",
    href: "/dashboard/settings/profile",
    subtitle: "Who you are on a match card, a roster row, and a shared report.",
  },
  {
    id: "account",
    label: "Account",
    href: "/dashboard/settings/account",
    subtitle: "Sign-in, security, and the one irreversible thing.",
  },
  {
    id: "preferences",
    label: "Preferences",
    href: "/dashboard/settings/preferences",
    subtitle: "Notifications and defaults.",
  },
  {
    id: "usage",
    label: "Usage",
    href: "/dashboard/settings/usage",
    title: "Usage & quota",
    subtitle: "Advantage Intelligence analysis time — yours and the program's.",
  },
  {
    id: "plan",
    label: "Plan",
    href: "/dashboard/settings/plan",
    subtitle: "What your account is entitled to.",
  },
  {
    id: "teams",
    label: "Teams",
    href: "/dashboard/settings/teams",
    subtitle:
      "Programs you own, coach or play for. Open one for its hours, roster and settings.",
    teamMemberOnly: true,
  },
];

/** Where `/dashboard/settings` sends you. The rail's first row, by definition. */
export const SETTINGS_DEFAULT_HREF = SETTINGS_SECTIONS[0].href;

/** Which settings section a path is in, or null if it is not settings at all. */
export function settingsSection(pathname: string): SettingsSection | null {
  return (
    SETTINGS_SECTIONS.find(
      (section) =>
        pathname === section.href || pathname.startsWith(`${section.href}/`),
    ) ?? null
  );
}

/**
 * Leaf labels for the schedule subtree's four create screens. Here rather
 * than in the header for the same reason SETTINGS_SECTIONS is: route-label
 * data lives beside the routes it names, so a rename cannot silently leave
 * the crumb saying the old word. Every other path under the schedule — the
 * event pages at `[eventId]` and `single/[matchId]` — deliberately has no
 * entry: those pages carry their identity in the body's own `<h1>`, and the
 * header shows the linked Schedule crumb alone. The one exception is the
 * score-only flow beneath an event, which is a step inside a flow rather than
 * a page — `SCHEDULE_SCORE_PATH` below names it, and `SCHEDULE_EDIT_PATH` the
 * edit flow beside it.
 */
const SCHEDULE_LEAF_LABELS: Record<string, string> = {
  "/dashboard/team/schedule/new": "New event",
  "/dashboard/team/schedule/new/dual": "New dual",
  "/dashboard/team/schedule/new/tournament": "New tournament",
};

/**
 * The score-only flow under an event: `/dashboard/team/schedule/<id>/score`.
 *
 * A regex rather than a map entry because the path carries an event id, and
 * the crumb says the same word for every event. `[^/]+` deliberately matches
 * one segment: `/schedule/new/single` is not a scoring screen, and a deeper
 * path under `/score` would be a route that does not exist.
 */
const SCHEDULE_SCORE_PATH = /^\/dashboard\/team\/schedule\/[^/]+\/score$/;

/**
 * The edit flow under an event: `/dashboard/team/schedule/<id>/edit`.
 *
 * `SCHEDULE_SCORE_PATH`'s shape exactly, for its reasons — the path carries an
 * event id, the crumb says the same word for every event, and `[^/]+` matching
 * one segment keeps `/schedule/new/single` and any deeper path out. The word
 * is "Edit" rather than "Edit dual": the crumb sits under a header that
 * already names the event, and a tournament edit (T20) will land on this same
 * route.
 */
const SCHEDULE_EDIT_PATH = /^\/dashboard\/team\/schedule\/[^/]+\/edit$/;

/** The schedule create-screen leaf label for a path, or null. */
export function scheduleLeaf(pathname: string): string | null {
  const exact = SCHEDULE_LEAF_LABELS[pathname];
  if (exact) return exact;
  if (SCHEDULE_SCORE_PATH.test(pathname)) return "Add score";
  if (SCHEDULE_EDIT_PATH.test(pathname)) return "Edit";
  return null;
}

/**
 * The deepest link matching a path.
 *
 * Longest-match rather than "first prefix wins", because the team menu nests —
 * `/dashboard/team` is a prefix of `/dashboard/team/roster`, and a plain
 * `startsWith` would light up Team Home on every page beneath it. It also
 * replaces the header's ordered `if` chain, where `/dashboard/team/settings`
 * had to be tested before `/dashboard/settings` or the wrong crumb won.
 */
export function activeHref(
  pathname: string,
  links: readonly NavLink[] = ALL_LINKS,
): string | null {
  let best: string | null = null;
  for (const { href } of links) {
    const matches = pathname === href || pathname.startsWith(`${href}/`);
    if (matches && (best === null || href.length > best.length)) best = href;
  }
  return best;
}

/** What this path is called, wherever it is named. */
export function navLabel(pathname: string): string | null {
  const href = activeHref(pathname);
  return ALL_LINKS.find((link) => link.href === href)?.name ?? null;
}

/**
 * Is this path a rail destination itself, rather than somewhere inside one?
 *
 * Exact match, never prefix: `/dashboard/matches` is a destination,
 * `/dashboard/matches/[matchId]` is a position within it. That distinction is
 * the whole rule — the header names the workspace on a destination and traces
 * the path on a position within a flow.
 */
export function isDestination(pathname: string): boolean {
  return DESTINATIONS.some((link) => link.href === pathname);
}
