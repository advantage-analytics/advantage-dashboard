"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  X,
  Clock,
  Calendar,
  CalendarPlus,
  CircleHelp,
  SlidersHorizontal,
  Timer,
  Trophy,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ResultMark } from "@/components/dashboard/result-mark";
import { ScoreLine } from "@/components/dashboard/score-line";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { scoreSetsFrom, type ScoreLineSet } from "@/lib/ui/score-format";
import { createClient } from "@/lib/supabase/client";
import {
  canUploadForProgram,
  isProgramStaff,
  type Workspace,
} from "@/lib/workspace/types";
import type { RosterFullRow } from "@/lib/data/roster-shared";
import { cn } from "@/lib/utils";

/**
 * ⌘K. Finds things, and — since it is already the fastest surface in the
 * product — does things.
 *
 * Two chips can sit in the field, and they have different jobs:
 *
 * - The GREY chip is where you are: the active workspace. It is always there
 *   (for a viewer holding more than one), it is never typed, and Backspace
 *   cannot touch it. Losing the workspace to a keystroke meant for the query
 *   would silently change what is being searched.
 * - The BLUE chip is what you are looking for: a mode, typed with a prefix
 *   (`>` commands, `@` people, `#` events) and cleared with Backspace on an
 *   empty query.
 *
 * The two are independent axes. A prefix survives a workspace switch and a
 * workspace switch survives a prefix; neither resets the other. The footer
 * carries both escapes — change the kind, or widen the scope with ⇧↵.
 *
 * ── Scope ──────────────────────────────────────────────────────────────────
 * The query is scoped to the active workspace exactly as the matches list
 * scopes itself (`app/dashboard/matches/page.tsx`): a team on `program_id`, a
 * personal workspace on `created_by` plus a null `program_id`. RLS decides
 * what a viewer MAY see; this decides which workspace they are LOOKING at.
 * ⇧↵ drops the filter and groups what comes back by workspace, because a
 * result from a program you coach and one from your own play are not the
 * same kind of answer.
 *
 * ── Commands ───────────────────────────────────────────────────────────────
 * Only real destinations. Statistics, Ask and Opponents are still
 * `ComingSoonPage` stubs, and a command that opens a placeholder is worse than
 * no command. Program verbs are ABSENT in a personal workspace, never
 * disabled — a greyed-out "Invite a player" is a promise the workspace cannot
 * keep.
 */

// --- Types ---

type Mode = ">" | "@" | "#";

const MODE_LABEL: Record<Mode, string> = {
  ">": "Command",
  "@": "Player",
  "#": "Event",
};

interface MatchResult {
  id: string;
  opponentName: string;
  tournamentName: string;
  /** Sets, already turned the viewer's way round — not a formatted string. */
  score: ScoreLineSet[];
  date: string;
  /**
   * Null when the match has no score yet — an upload still analysing. That is
   * undecided, not level, so the row draws no outcome mark at all rather than
   * `ResultMark`'s null (a decided draw). It used to fall through to `false`
   * and mark every unscored match as lost.
   */
  isWin: boolean | null;
  /** Which workspace the match belongs to — the eyebrow when scope is wide. */
  workspaceName: string;
}

interface GroupedResult {
  name: string;
  matchCount: number;
}

interface RosterResult {
  playerId: string;
  name: string;
  /** "No. 3 singles", or null where the ladder has never been set. */
  spot: string | null;
}

interface SearchResults {
  matches: MatchResult[];
  opponents: GroupedResult[];
  events: GroupedResult[];
  roster: RosterResult[];
  /** Matches the query would find outside the active workspace. */
  elsewhereCount: number;
}

interface Action {
  id: string;
  label: string;
  /** Where it leads, in the words the sidebar uses. */
  hint: string;
  href: string;
  icon: typeof Upload;
}

type FlatItem =
  | { type: "action"; data: Action }
  | { type: "match"; data: MatchResult }
  | { type: "opponent"; data: GroupedResult }
  | { type: "event"; data: GroupedResult }
  | { type: "roster"; data: RosterResult }
  | { type: "recent"; query: string };

interface Section {
  title: string;
  items: FlatItem[];
}

// --- Helpers ---

const EASE_CURVE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];
const RECENT_KEY = "advantage-search-recent";
const MAX_RECENT = 5;
const MAX_PER_CATEGORY = 3;
const MAX_MATCHES = 20;

function isMode(value: string): value is Mode {
  return value === ">" || value === "@" || value === "#";
}

function formatShortDate(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return isoDate;
  }
}

function didUserWin(
  score: { player1: number[]; player2: number[] } | null,
  isUserPlayer1: boolean
): boolean {
  if (!score?.player1?.length || !score?.player2?.length) return false;
  let p1 = 0;
  let p2 = 0;
  score.player1.forEach((s, i) => {
    if (s > (score.player2[i] ?? 0)) p1++;
    else if ((score.player2[i] ?? 0) > s) p2++;
  });
  return isUserPlayer1 ? p1 > p2 : p2 > p1;
}

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]").slice(
      0,
      MAX_RECENT
    );
  } catch {
    return [];
  }
}

function saveRecent(query: string) {
  try {
    const existing = loadRecent();
    const updated = [query, ...existing.filter((q) => q !== query)].slice(
      0,
      MAX_RECENT
    );
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage errors
  }
}

function pluralize(count: number, noun: string, plural = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : plural}`;
}

/**
 * The command set for a workspace. Built from the workspace's own facts —
 * `canUploadForProgram`, `isProgramStaff` — so a verb appears exactly where
 * the page it opens would let you act, and nowhere else.
 */
function actionsFor(active: Workspace): Action[] {
  const actions: Action[] = [];

  if (active.kind === "personal" || canUploadForProgram(active)) {
    actions.push({
      id: "upload",
      label: "Upload a match",
      hint: "Matches",
      href: "/dashboard/matches/new",
      icon: Upload,
    });
  }
  if (active.kind === "team" && isProgramStaff(active)) {
    actions.push(
      {
        id: "invite",
        label: "Invite a player",
        hint: "Roster",
        href: "/dashboard/team/roster",
        icon: UserPlus,
      },
      {
        id: "fixture",
        label: "Add a fixture",
        hint: "Schedule",
        href: "/dashboard/team/schedule/new",
        icon: CalendarPlus,
      }
    );
  }
  actions.push(
    {
      id: "usage",
      label: "Usage & quota",
      hint: "Settings",
      href: "/dashboard/settings/plan",
      icon: Timer,
    },
    {
      id: "preferences",
      label: "Preferences",
      hint: "Settings",
      href: "/dashboard/settings/profile",
      icon: SlidersHorizontal,
    },
    {
      id: "help",
      label: "Help",
      hint: "Help Center",
      href: "/dashboard/help",
      icon: CircleHelp,
    }
  );
  return actions;
}

// --- Small pieces ---

/** The one keycap. Four styles of `<kbd>` used to share this file. */
function Keycap({
  children,
  className,
  mono,
}: {
  children: React.ReactNode;
  className?: string;
  /** Prefix glyphs are machine values; the DS sets those in mono. */
  mono?: boolean;
}) {
  return (
    <kbd
      className={cn(
        "flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-[5px] bg-[var(--surface-subtle)] px-[5px] text-[10px] font-medium leading-none text-[var(--ink-500)] shadow-[var(--shadow-keycap)]",
        mono && "font-mono",
        className
      )}
    >
      {children}
    </kbd>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 pb-1 pt-2.5 text-[10px] font-medium uppercase tracking-[2.5px] text-[var(--ink-400)]">
      {children}
    </p>
  );
}

const ROW_CLASS =
  "flex w-full items-center gap-3 rounded-[8px] px-2 py-[9px] text-left transition-colors duration-150";

// --- Component ---

interface SearchCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SearchCommandPalette({
  open,
  onOpenChange,
}: SearchCommandPaletteProps) {
  const router = useRouter();
  const { active, available } = useWorkspace();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [mode, setMode] = useState<Mode | null>(null);
  const [allWorkspaces, setAllWorkspaces] = useState(false);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  // One viewer holds one workspace far more often than not, and for them a
  // chip saying "Personal" distinguishes nothing.
  const hasScope = available.length > 1;

  const actions = useMemo(() => actionsFor(active), [active]);

  // Debounce query. Commands are local, so they do not wait.
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (!query.trim() || mode === ">") {
      setDebouncedQuery("");
      setResults(null);
      return;
    }
    timerRef.current = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timerRef.current);
  }, [query, mode]);

  // Reset on open/close. The scope toggle resets too: widening is a thing you
  // do to one search, not a setting.
  useEffect(() => {
    if (open) {
      setRecentSearches(loadRecent());
    } else {
      setQuery("");
      setDebouncedQuery("");
      setMode(null);
      setAllWorkspaces(false);
      setResults(null);
      setHighlightIndex(0);
    }
  }, [open]);

  // Fetch results
  useEffect(() => {
    if (!debouncedQuery) return;

    let stale = false;
    setIsLoading(true);

    async function search() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || stale) {
        setIsLoading(false);
        return;
      }

      const escaped = debouncedQuery
        .replace(/%/g, "\\%")
        .replace(/_/g, "\\_");
      // The mode narrows the columns, not just the sections. Without this,
      // `@va` returned M. Okafor as a person because their match was at Ojai
      // VAlley — the event leaking into the people answer.
      const needle =
        mode === "@"
          ? `player1_name.ilike.%${escaped}%,player2_name.ilike.%${escaped}%`
          : mode === "#"
            ? `tournament_name.ilike.%${escaped}%,round.ilike.%${escaped}%`
            : `tournament_name.ilike.%${escaped}%,player1_name.ilike.%${escaped}%,player2_name.ilike.%${escaped}%,round.ilike.%${escaped}%`;

      // `@` in a program also asks the roster. Same RPC the Roster page calls,
      // through the same session, so it answers with exactly what that page
      // would show this viewer — and nothing a stranger could not already
      // reach through `getRosterData`.
      const wantsRoster = mode === "@" && active.kind === "team";
      const rosterPromise = wantsRoster
        ? supabase.rpc("program_roster_full", { p_program_id: active.id })
        : Promise.resolve({ data: null });

      // `count: "exact"` rides the main read so a scoped search knows how many
      // it found; the unscoped head request beside it is what says how many it
      // did NOT. Two round trips, not three, and only when there is a second
      // workspace to have missed anything in.
      let scoped = supabase
        .from("matches")
        .select(
          "id, player1_id, player1_name, player2_name, tournament_name, round, date, score, program_id",
          { count: "exact" }
        )
        .or(needle)
        .order("date", { ascending: false })
        .limit(MAX_MATCHES);

      if (!allWorkspaces) {
        scoped =
          active.kind === "team"
            ? scoped.eq("program_id", active.id)
            : scoped.eq("created_by", user.id).is("program_id", null);
      }

      const everywherePromise =
        hasScope && !allWorkspaces
          ? supabase
              .from("matches")
              .select("id", { count: "exact", head: true })
              .or(needle)
          : Promise.resolve({ count: null });

      const [
        { data, count: scopedCount },
        { count: everywhereCount },
        { data: rosterRows },
      ] = await Promise.all([scoped, everywherePromise, rosterPromise]);

      if (stale) return;

      const elsewhereCount = Math.max(
        0,
        (everywhereCount ?? 0) - (scopedCount ?? 0)
      );

      const roster: RosterResult[] = ((rosterRows ?? []) as RosterFullRow[])
        .filter((row) =>
          (row.display_name ?? "")
            .toLowerCase()
            .includes(debouncedQuery.toLowerCase())
        )
        .slice(0, MAX_PER_CATEGORY)
        .map((row) => ({
          playerId: row.player_id,
          name: row.display_name ?? "Unnamed player",
          spot: row.lineup_spot !== null ? `No. ${row.lineup_spot}` : null,
        }));

      if (!data || data.length === 0) {
        setResults({
          matches: [],
          opponents: [],
          events: [],
          roster,
          elsewhereCount,
        });
        setHighlightIndex(0);
        setIsLoading(false);
        return;
      }

      // Not just `user.id`. A match a coach recorded for this athlete before
      // they had an account carries their roster PROFILE's id, and `player1_id`
      // is what orients the score and picks the opponent's name. Comparing
      // against one id showed those the wrong way round.
      const { data: idRows } = await supabase.rpc("my_player_ids");
      const mine = new Set<string>(
        [
          user.id,
          ...((idRows ?? []) as (string | { my_player_ids?: string })[]).map(
            (row) => (typeof row === "string" ? row : (row?.my_player_ids ?? ""))
          ),
        ].filter(Boolean)
      );
      const isMine = (id: string | null) => Boolean(id && mine.has(id));

      // `program_id` → the workspace's name, for the eyebrows a wide search
      // groups under. A null program is the viewer's own play.
      const personalName =
        available.find((w) => w.kind === "personal")?.name ?? "Personal";
      const teamNames = new Map(
        available
          .filter((w) => w.kind === "team")
          .map((w) => [w.id, w.name] as const)
      );
      const workspaceNameFor = (programId: string | null) =>
        programId === null
          ? personalName
          : (teamNames.get(programId) ?? "Another program");

      const matches: MatchResult[] = data
        .slice(0, allWorkspaces ? MAX_MATCHES : MAX_PER_CATEGORY)
        .map((m) => {
          const isP1 = isMine(m.player1_id);
          return {
            id: m.id,
            opponentName: isP1 ? m.player2_name : m.player1_name,
            tournamentName: m.tournament_name ?? "Unknown event",
            // `swap` when the viewer is stored as player2, so the row reads
            // from their side — game counts and tiebreaks flipped together.
            score: scoreSetsFrom(m.score, { swap: !isP1 }),
            date: formatShortDate(m.date),
            isWin: m.score ? didUserWin(m.score, isP1) : null,
            workspaceName: workspaceNameFor(m.program_id),
          };
        });

      const oppCounts = new Map<string, number>();
      for (const m of data) {
        const opp = isMine(m.player1_id) ? m.player2_name : m.player1_name;
        oppCounts.set(opp, (oppCounts.get(opp) ?? 0) + 1);
      }
      const opponents: GroupedResult[] = Array.from(oppCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_PER_CATEGORY)
        .map(([name, matchCount]) => ({ name, matchCount }));

      const eventCounts = new Map<string, number>();
      for (const m of data) {
        const name = m.tournament_name ?? "Unknown event";
        eventCounts.set(name, (eventCounts.get(name) ?? 0) + 1);
      }
      const events: GroupedResult[] = Array.from(eventCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_PER_CATEGORY)
        .map(([name, matchCount]) => ({ name, matchCount }));

      setResults({ matches, opponents, events, roster, elsewhereCount });
      setHighlightIndex(0);
      setIsLoading(false);
    }

    search();
    return () => {
      stale = true;
    };
  }, [debouncedQuery, mode, allWorkspaces, active, available, hasScope]);

  /**
   * What the list shows, in order, by mode.
   *
   * Commands lead when they match, because a person who typed "upl" wants the
   * verb, not the three matches whose opponent has those letters. In `@` a
   * program's roster leads the opponents faced: your own players are the
   * likelier answer to a name typed inside a program.
   */
  const sections = useMemo<Section[]>(() => {
    const q = query.trim().toLowerCase();
    const matchingActions = actions.filter(
      (action) => q === "" || action.label.toLowerCase().includes(q)
    );
    const actionItems: FlatItem[] = matchingActions.map((data) => ({
      type: "action",
      data,
    }));

    if (mode === ">") {
      return actionItems.length > 0 ? [{ title: "Commands", items: actionItems }] : [];
    }

    // Nothing typed: the four things people open this for, then what they
    // last looked for. It replaces a magnifier illustration that explained
    // what a search box is.
    if (!results) {
      if (q !== "" || mode !== null) return [];
      const out: Section[] = [{ title: "Jump to", items: actionItems }];
      if (recentSearches.length > 0) {
        out.push({
          title: "Recent",
          items: recentSearches.map((query) => ({ type: "recent", query })),
        });
      }
      return out;
    }

    const out: Section[] = [];

    if (mode === "@") {
      if (results.roster.length > 0) {
        out.push({
          title: "Roster",
          items: results.roster.map((data) => ({ type: "roster", data })),
        });
      }
      if (results.opponents.length > 0) {
        out.push({
          title: "Opponents",
          items: results.opponents.map((data) => ({ type: "opponent", data })),
        });
      }
      return out;
    }

    if (mode === "#") {
      if (results.events.length > 0) {
        out.push({
          title: "Events",
          items: results.events.map((data) => ({ type: "event", data })),
        });
      }
      return out;
    }

    if (actionItems.length > 0) {
      out.push({ title: "Actions", items: actionItems });
    }

    if (allWorkspaces) {
      // Grouped by where the match lives. Insertion order follows the query's
      // date order, so the workspace with the most recent hit leads.
      const byWorkspace = new Map<string, FlatItem[]>();
      for (const data of results.matches) {
        const list = byWorkspace.get(data.workspaceName) ?? [];
        list.push({ type: "match", data });
        byWorkspace.set(data.workspaceName, list);
      }
      for (const [title, items] of byWorkspace) {
        out.push({ title, items: items.slice(0, MAX_PER_CATEGORY) });
      }
    } else if (results.matches.length > 0) {
      out.push({
        title: "Matches",
        items: results.matches.map((data) => ({ type: "match", data })),
      });
    }

    if (results.opponents.length > 0) {
      out.push({
        title: "Opponents",
        items: results.opponents.map((data) => ({ type: "opponent", data })),
      });
    }
    if (results.events.length > 0) {
      out.push({
        title: "Events",
        items: results.events.map((data) => ({ type: "event", data })),
      });
    }
    return out;
  }, [query, mode, actions, results, recentSearches, allWorkspaces]);

  const flatItems = useMemo(
    () => sections.flatMap((section) => section.items),
    [sections]
  );

  // Navigate to result
  const navigateTo = useCallback(
    (item: FlatItem) => {
      if (item.type === "recent") {
        setQuery(item.query);
        return;
      }
      if (query.trim() && item.type !== "action") saveRecent(query.trim());
      onOpenChange(false);
      switch (item.type) {
        case "action":
          router.push(item.data.href);
          return;
        case "match":
          router.push(`/dashboard/matches/${item.data.id}`);
          return;
        case "roster":
          // The Roster page opens the drawer for a `?player` it is handed.
          router.push(
            `/dashboard/team/roster?player=${encodeURIComponent(item.data.playerId)}`
          );
          return;
        default:
          router.push(
            `/dashboard/matches?q=${encodeURIComponent(item.data.name)}`
          );
      }
    },
    [query, onOpenChange, router]
  );

  /**
   * The prefix is consumed, never shown in the field. A typed `>` becomes the
   * chip and the field goes back to empty, so what you type next is the
   * query and only the query. Pasting ">upl" works the same way.
   */
  const handleChange = (value: string) => {
    if (mode === null && query === "" && value.length > 0 && isMode(value[0])) {
      setMode(value[0]);
      setQuery(value.slice(1));
      return;
    }
    setQuery(value);
  };

  // Keyboard handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Backspace" && query === "" && mode !== null) {
        // Backspace clears the BLUE chip only. The grey one is scope, not a
        // token — see the header comment.
        e.preventDefault();
        setMode(null);
        return;
      }
      if (e.key === "Enter" && e.shiftKey && hasScope) {
        e.preventDefault();
        setAllWorkspaces((wide) => !wide);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIndex((i) => Math.min(i + 1, flatItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && flatItems.length > 0) {
        e.preventDefault();
        navigateTo(flatItems[highlightIndex]);
      }
    },
    [query, mode, hasScope, flatItems, highlightIndex, navigateTo]
  );

  // Scroll highlighted into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${highlightIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex]);

  const hasQuery = debouncedQuery.length > 0 || (mode === ">" && query.trim() !== "");
  const noResults = !isLoading && hasQuery && flatItems.length === 0;
  const modeHint =
    mode === "@" ? "Type a player's name" : mode === "#" ? "Type an event" : null;
  const showModeHint = !isLoading && !hasQuery && flatItems.length === 0 && modeHint;

  const placeholder =
    mode === ">"
      ? "Run a command"
      : mode === "@"
        ? "Search players"
        : mode === "#"
          ? "Search events"
          : "Search, or > for commands";

  // Track flat index for rendering
  let flatIdx = 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* `outline-none` on all three: Radix focuses the content on open, and
          the browser drew its ring around the whole panel before the input
          took over. The caret is the only focus a search box needs.

          14px and the hairline are the popover primitive's own surface — the
          two menus this opens beside now draw the same one. The shadow is the
          token, not a copy of its value. */}
      <DialogContent
        className="sm:max-w-[480px] sm:rounded-[14px] p-0 overflow-hidden sm:top-[20%] sm:translate-y-0 border border-[var(--border-hairline)] shadow-[var(--shadow-dropdown)] outline-none focus:outline-none focus-visible:outline-none"
        hideCloseButton
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">
          Search across matches, players and events, or run a command
        </DialogDescription>

        {/* The field */}
        <div className="flex h-11 items-center gap-2 border-b border-[var(--border-hairline)] px-3.5">
          <Search
            className="size-3.5 shrink-0 text-[var(--ink-500)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />

          {/* Where you are. Grey at rest; blue when widened, because a widened
              scope is a transient thing you did, like a mode. Not a button:
              the profile menu switches workspaces, and this palette should not
              be a second, hidden place that does. */}
          {hasScope && (
            <span
              className={cn(
                "flex h-5 shrink-0 items-center rounded-[6px] px-[7px] text-[11px]",
                allWorkspaces
                  ? "bg-[var(--blue-soft)] font-medium text-[var(--blue)]"
                  : "bg-[var(--surface-subtle)] text-[var(--ink-700)]"
              )}
            >
              {allWorkspaces ? "All workspaces" : active.name}
            </span>
          )}

          {/* What you are looking for. */}
          {mode && (
            <span className="flex h-5 shrink-0 items-center gap-1 rounded-[6px] bg-[var(--blue-soft)] px-[7px] text-[11px] font-medium text-[var(--blue)]">
              <span className="font-mono">{mode}</span>
              {MODE_LABEL[mode]}
            </span>
          )}

          {/* `data-focus-ring="none"` is the DS's own opt-out for a composite
              field (`focus.css`): the 44px row with the magnifier and the
              chips is the field, and the input is a control inside it. This
              was the "focus outline" the palette drew on open — the
              `outline-none` utility never applied, because focus.css sits
              outside Tailwind's layers and wins before specificity is read.
              Focus stays visible: the caret lands in the one field the modal
              has, and the modal opening is itself the change on screen. */}
          <input
            ref={inputRef}
            autoFocus
            data-focus-ring="none"
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            aria-label={mode ? `${MODE_LABEL[mode]} search` : "Search"}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-400)]"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="shrink-0 rounded-[6px] p-1 transition-colors duration-150 hover:bg-[var(--surface-subtle)] focus-visible:outline-none focus-visible:bg-[var(--surface-subtle)] cursor-pointer"
              aria-label="Clear search"
            >
              <X className="size-3.5 text-[var(--ink-400)]" strokeWidth={1.5} aria-hidden="true" />
            </button>
          ) : (
            <Keycap>esc</Keycap>
          )}
        </div>

        {/* Results area */}
        <div
          ref={listRef}
          className="max-h-[360px] overflow-y-auto"
          role="listbox"
          aria-label="Search results"
        >
          <AnimatePresence mode="wait">
            {isLoading && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: EASE_CURVE }}
                className="flex flex-col gap-3 p-4"
              >
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="size-3 shrink-0 animate-pulse rounded bg-[var(--surface-skeleton)]" />
                    <div className="flex flex-1 flex-col gap-1.5">
                      <div className="h-3 w-40 animate-pulse rounded bg-[var(--surface-skeleton)]" />
                      <div className="h-2.5 w-28 animate-pulse rounded bg-[var(--surface-skeleton)]" />
                    </div>
                  </div>
                ))}
              </motion.div>
            )}

            {showModeHint && (
              <motion.p
                key="mode-hint"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: EASE_CURVE }}
                className="px-4 py-5 text-[12px] text-[var(--ink-500)]"
              >
                {modeHint}
              </motion.p>
            )}

            {noResults && (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: EASE_CURVE }}
                className="flex flex-col gap-1 px-4 py-5"
              >
                <p className="text-[13px] font-medium text-[var(--ink-900)]">
                  No results for &ldquo;{query.trim()}&rdquo;
                  {hasScope && !allWorkspaces && mode !== ">" && (
                    <span className="font-normal text-[var(--ink-500)]">
                      {" "}
                      in {active.name}
                    </span>
                  )}
                </p>
                <p className="text-[12px] leading-[1.6] text-[var(--ink-500)]">
                  {mode === ">"
                    ? "No command by that name"
                    : "Try a different opponent, tournament or round"}
                </p>
              </motion.div>
            )}

            {!isLoading && flatItems.length > 0 && (
              <motion.div
                key={`${mode ?? "all"}-${allWorkspaces}-${results ? "results" : "home"}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: EASE_CURVE }}
                className="p-1.5"
              >
                {sections.map((section) => (
                  <div key={section.title}>
                    <Eyebrow>{section.title}</Eyebrow>
                    {section.items.map((item) => {
                      const idx = flatIdx++;
                      const isActiveRow = highlightIndex === idx;
                      return (
                        <button
                          key={`${item.type}-${idx}`}
                          type="button"
                          data-index={idx}
                          onClick={() => navigateTo(item)}
                          onMouseEnter={() => setHighlightIndex(idx)}
                          className={cn(
                            ROW_CLASS,
                            isActiveRow && "bg-[var(--surface-subtle)]"
                          )}
                          role="option"
                          aria-selected={isActiveRow}
                        >
                          <ResultRow item={item} />
                          {/* Enter has a target, and it is the row that says so. */}
                          {isActiveRow && <Keycap className="bg-white">↵</Keycap>}
                        </button>
                      );
                    })}
                  </div>
                ))}

                {/* Scoped, and the query would find more outside this
                    workspace. A count and a keycap; widening is one keystroke. */}
                {results && results.elsewhereCount > 0 && !allWorkspaces && (
                  <button
                    type="button"
                    onClick={() => setAllWorkspaces(true)}
                    className={cn(ROW_CLASS, "mt-1 hover:bg-[var(--surface-subtle)] cursor-pointer")}
                  >
                    <span className="w-[14px] shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1 text-[12px] text-[var(--ink-600)]">
                      {pluralize(results.elsewhereCount, "more result")} in your
                      other workspace{available.length > 2 ? "s" : ""}
                    </span>
                    <Keycap>⇧↵</Keycap>
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer: both escapes. The kind on the left, the scope on the right. */}
        <div className="flex h-9 items-center gap-3 border-t border-[var(--border-hairline)] px-3.5">
          <FooterHint keycap=">" mono>commands</FooterHint>
          <FooterHint keycap="@" mono>players</FooterHint>
          <FooterHint keycap="#" mono>events</FooterHint>
          {hasScope && (
            <span className="ml-auto">
              <FooterHint keycap="⇧↵">
                {allWorkspaces ? "this workspace" : "all workspaces"}
              </FooterHint>
            </span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FooterHint({
  keycap,
  mono,
  children,
}: {
  keycap: string;
  mono?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] text-[var(--ink-400)]">
      <Keycap mono={mono}>{keycap}</Keycap>
      {children}
    </span>
  );
}

/** One row's body. The button around it owns the wash and the keycap. */
function ResultRow({ item }: { item: FlatItem }) {
  switch (item.type) {
    case "action": {
      const Icon = item.data.icon;
      return (
        <>
          <span className="flex size-[26px] shrink-0 items-center justify-center rounded-[7px] bg-[var(--surface-subtle)] text-[var(--ink-700)]">
            <Icon className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--ink-900)]">
            {item.data.label}
          </span>
          <span className="shrink-0 text-[11px] text-[var(--ink-400)]">
            {item.data.hint}
          </span>
        </>
      );
    }
    case "match":
      return (
        <>
          <Calendar
            className="size-3.5 shrink-0 text-[var(--ink-500)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-[13px] text-[var(--ink-900)]">
                vs. {item.data.opponentName}
              </span>
              {/* The one outcome register — see `ResultMark`. Nothing for an
                  unscored match: undecided is not a result. */}
              {item.data.isWin !== null && (
                <ResultMark won={item.data.isWin} className="shrink-0" />
              )}
            </span>
            <span className="text-[12px] text-[var(--ink-500)]">
              {item.data.tournamentName}
              <span className="mx-1 text-[var(--ink-300)]">&middot;</span>
              <ScoreLine sets={item.data.score} />
              <span className="mx-1 text-[var(--ink-300)]">&middot;</span>
              {item.data.date}
            </span>
          </span>
        </>
      );
    case "roster":
      return (
        <>
          <Users
            className="size-3.5 shrink-0 text-[var(--ink-500)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--ink-900)]">
            {item.data.name}
          </span>
          <span className="shrink-0 text-[12px] text-[var(--ink-500)]">
            {item.data.spot ? `Roster · ${item.data.spot}` : "Roster"}
          </span>
        </>
      );
    case "opponent":
      return (
        <>
          <Users
            className="size-3.5 shrink-0 text-[var(--ink-500)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--ink-900)]">
            {item.data.name}
          </span>
          <span className="shrink-0 text-[12px] tabular-nums text-[var(--ink-500)]">
            {pluralize(item.data.matchCount, "match", "matches")}
          </span>
        </>
      );
    case "event":
      return (
        <>
          <Trophy
            className="size-3.5 shrink-0 text-[var(--ink-500)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--ink-900)]">
            {item.data.name}
          </span>
          <span className="shrink-0 text-[12px] tabular-nums text-[var(--ink-500)]">
            {pluralize(item.data.matchCount, "match", "matches")}
          </span>
        </>
      );
    case "recent":
      return (
        <>
          <Clock
            className="size-3.5 shrink-0 text-[var(--ink-500)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--ink-900)]">
            {item.query}
          </span>
        </>
      );
    default:
      return null;
  }
}
