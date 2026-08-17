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
 * No "Matches" entry, deliberately.
 *
 * `/dashboard/matches` filters on `created_by = auth.uid()` — a personal-
 * workspace predicate written into the page. Pointing a team menu at it would
 * show a coach their own uploads presented as the program's, which is the
 * wrong-attribution failure `docs/ui-revamp-guardrails.md` warns about: nothing
 * looks broken on screen. It comes back the moment that page resolves its own
 * workspace scope rather than assuming one.
 */
export const TEAM_NAV: readonly NavLink[] = [
  { name: "Team Home", href: "/dashboard/team", icon: Home },
  { name: "Roster", href: "/dashboard/team/roster", icon: Users },
  { name: "Compare", href: "/dashboard/team/compare", icon: Swords },
];

export const PERSONAL_BOTTOM: readonly NavLink[] = [
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
  { name: "Help Center", href: "/dashboard/help", icon: HelpCircle },
];

export const TEAM_BOTTOM: readonly NavLink[] = [
  { name: "Team Settings", href: "/dashboard/team/settings", icon: Settings },
  { name: "Help Center", href: "/dashboard/help", icon: HelpCircle },
];

const ALL_LINKS: readonly NavLink[] = [
  ...PERSONAL_NAV,
  ...TEAM_NAV,
  ...PERSONAL_BOTTOM,
  ...TEAM_BOTTOM,
];

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
