import {
  Home,
  Calendar,
  BarChart3,
  MessageSquare,
  Users,
  Swords,
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
};

export const PERSONAL_NAV: readonly NavLink[] = [
  { name: "Home", href: "/dashboard", icon: Home },
  { name: "Matches", href: "/dashboard/matches", icon: Calendar },
  { name: "Statistics", href: "/dashboard/statistics", icon: BarChart3 },
  { name: "Ask", href: "/dashboard/ask", icon: MessageSquare },
];

/**
 * "Matches" is back, because the page it points at now scopes itself.
 *
 * It was absent for a real reason: `/dashboard/matches` filtered on
 * `created_by = auth.uid()` and nothing else, so a team menu pointing at it
 * would have shown a coach their own uploads presented as the program's —
 * the wrong-attribution failure `docs/ui-revamp-guardrails.md` warns about,
 * where nothing looks broken on screen. That note said the entry returns the
 * moment the page resolves its own workspace scope. It does now: personal
 * reads `created_by = me AND program_id IS NULL`, team reads
 * `program_id = <program>` and lets `visible_match_ids()` decide who sees
 * which rows.
 *
 * The cost of leaving it out had grown past the risk of putting it back —
 * inside a program NOBODY had a route to a match list, players included.
 */
export const TEAM_NAV: readonly NavLink[] = [
  { name: "Team Home", href: "/dashboard/team", icon: Home },
  { name: "Matches", href: "/dashboard/matches", icon: Calendar },
  { name: "Roster", href: "/dashboard/team/roster", icon: Users },
  { name: "Compare", href: "/dashboard/team/compare", icon: Swords },
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

const ALL_LINKS: readonly NavLink[] = [
  ...PERSONAL_NAV,
  ...TEAM_NAV,
  ...PERSONAL_BOTTOM,
  ...TEAM_BOTTOM,
];

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
   * Team only exists inside a program, and only for the people who run it. A
   * player switching into their team workspace never sees the item — the page
   * itself re-checks, because a hidden nav item is not authorization.
   */
  teamStaffOnly?: boolean;
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
    id: "team",
    label: "Team",
    href: "/dashboard/settings/team",
    subtitle: "Members, invites, and how the roster shares.",
    teamStaffOnly: true,
  },
];

/** Where `/dashboard/settings` sends you. The rail's first row, by definition. */
export const SETTINGS_DEFAULT_HREF = SETTINGS_SECTIONS[0].href;

/** Which settings section a path is in, or null if it is not settings at all. */
export function settingsSection(pathname: string): SettingsSection | null {
  return (
    SETTINGS_SECTIONS.find(
      (section) =>
        pathname === section.href || pathname.startsWith(`${section.href}/`)
    ) ?? null
  );
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
  links: readonly NavLink[] = ALL_LINKS
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
