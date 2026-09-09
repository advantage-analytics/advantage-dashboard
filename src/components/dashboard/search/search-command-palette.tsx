"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Kbd } from "@/components/ui/kbd";
import { ResultMark } from "@/components/dashboard/result-mark";
import { ScoreLine } from "@/components/dashboard/score-line";
import { WorkspaceScopeChip } from "@/components/dashboard/shared/workspace-scope-chip";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { scoreSetsFrom, type ScoreLineSet } from "@/lib/ui/score-format";
import { formatShortDate } from "@/lib/ui/date-format";
import { createClient } from "@/lib/supabase/client";
import { navLabel, settingsSection } from "@/lib/dashboard/nav";
import { matchOutcome, setTally } from "@/lib/data/match-utils";
import {
  rosterPlayerOptions,
  type RosterFullRow,
} from "@/lib/data/roster-shared";
import { scopeToWorkspace } from "@/lib/workspace/scope";
import {
  canUploadForProgram,
  isProgramStaff,
  type Workspace,
} from "@/lib/workspace/types";
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
 * The query is scoped to the active workspace by `scopeToWorkspace` — the
 * same rule the matches list and the activity feed apply. ⇧↵ drops the filter
 * and groups what comes back by workspace, matches only: an Opponents or
 * Events row aggregated across workspaces would land on a matches list that
 * is scoped to one of them, advertising matches it then could not show.
 *
 * ── Commands ───────────────────────────────────────────────────────────────
 * Only real destinations. Statistics, Ask and Opponents are still
 * `ComingSoonPage` stubs, and a command that opens a placeholder is worse than
 * no command. Program verbs are ABSENT in a personal workspace, never
 * disabled — a greyed-out "Invite a player" is a promise the workspace cannot
 * keep. Each command's hint is the route table's own label for its href, so a
 * rename in `nav.ts` reaches here without a second edit.
 */

// --- Types ---

type Mode = ">" | "@" | "#";

/**
 * Everything a mode changes, in one row per mode. Adding a fourth mode is
 * one entry here, not four ternaries across the file.
 */
const MODES: Record<
  Mode,
  {
    label: string;
    placeholder: string;
    /** Shown when the mode is set and nothing is typed. */
    hint: string | null;
    /** The columns the query is matched against. */
    columns: readonly string[];
  }
> = {
  ">": {
    label: "Command",
    placeholder: "Run a command",
    hint: null,
    columns: [],
  },
  "@": {
    label: "Player",
    placeholder: "Search players",
    hint: "Type a player's name",
    columns: ["player1_name", "player2_name"],
  },
  "#": {
    label: "Event",
    placeholder: "Search events",
    hint: "Type an event",
    columns: ["tournament_name", "round"],
  },
};

const ALL_COLUMNS = [
  "tournament_name",
  "player1_name",
  "player2_name",
  "round",
] as const;

interface MatchResult {
  id: string;
  opponentName: string;
  tournamentName: string;
  /** Sets, already turned the viewer's way round — not a formatted string. */
  score: ScoreLineSet[];
  date: string;
  /**
   * `matchOutcome`'s answer — won, lost, or null for level — and `hasScore`
   * beside it, because null also means "no score yet". An upload still
   * analysing is undecided, not level, and draws no mark at all; it used to
   * fall through to "lost".
   */
  outcome: boolean | null;
  hasScore: boolean;
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
  /** "No. 3", or null where the ladder has never been set. */
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
  /** Index of this section's first item in the flattened list. */
  start: number;
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

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]").slice(
      0,
      MAX_RECENT,
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
      MAX_RECENT,
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
 * One `ilike` term for PostgREST's `.or()` grammar.
 *
 * The value is double-quoted, which is what lets a query carry the characters
 * the logic tree otherwise reads as structure — a comma in "Smith, J.", the
 * parentheses in "Ojai (Boys 16s)", the dot in an initial. Inside the quotes
 * only `"` and `\` need escaping; `%` and `_` are escaped as well because they
 * are `ilike`'s own wildcards, and a typed underscore should match an
 * underscore.
 */
function ilikeTerm(column: string, query: string): string {
  const value = query
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
  return `${column}.ilike."%${value}%"`;
}

/**
 * The command set for a workspace. Built from the workspace's own facts —
 * `canUploadForProgram`, `isProgramStaff` — so a verb appears exactly where
 * the page it opens would let you act, and nowhere else. Labels are the
 * verbs; where each one leads is `hintFor`'s to say, from the route table.
 */
function actionsFor(active: Workspace): Action[] {
  const actions: Action[] = [];

  if (active.kind === "personal" || canUploadForProgram(active)) {
    actions.push({
      id: "upload",
      label: "Upload a match",
      href: "/dashboard/matches/new",
      icon: Upload,
    });
  }
  if (active.kind === "team" && isProgramStaff(active)) {
    actions.push(
      {
        id: "invite",
        label: "Invite a player",
        href: "/dashboard/team/roster",
        icon: UserPlus,
      },
      {
        id: "fixture",
        label: "Add a fixture",
        href: "/dashboard/team/schedule/new",
        icon: CalendarPlus,
      },
    );
  }
  actions.push(
    {
      id: "usage",
      label: "Usage & quota",
      href: "/dashboard/settings/usage",
      icon: Timer,
    },
    {
      id: "preferences",
      label: "Preferences",
      href: "/dashboard/settings/preferences",
      icon: SlidersHorizontal,
    },
    {
      id: "help",
      label: "Help",
      href: "/dashboard/help",
      icon: CircleHelp,
    },
  );
  return actions;
}

/**
 * Where a command leads, in the route table's words. A settings page names
 * "Settings"; everything else names its rail entry. The upload wizard and the
 * schedule create screens are steps inside a destination, so `navLabel`
 * resolves them to the destination — "Matches", "Schedule" — which is the
 * right thing for a hint to say.
 */
function hintFor(href: string): string {
  return settingsSection(href) ? "Settings" : (navLabel(href) ?? "");
}

// --- Small pieces ---

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="eyebrow px-2 pt-2.5 pb-1">{children}</p>;
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
  const listRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [mode, setMode] = useState<Mode | null>(null);
  const [allWorkspaces, setAllWorkspaces] = useState(false);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  // Primitives, so the search effect keys on what it reads rather than on
  // the context object's identity — which is fresh on every RSC render.
  const activeId = active.id;
  const activeKind = active.kind;
  const hasScope = available.length > 1;

  const actions = useMemo(() => actionsFor(active), [active]);

  // `program_id` → the workspace's name, for the eyebrows a wide search
  // groups under. A null program is the viewer's own play.
  const workspaceNames = useMemo(() => {
    const personal =
      available.find((w) => w.kind === "personal")?.name ?? "Personal";
    const teams = new Map(
      available.filter((w) => w.kind === "team").map((w) => [w.id, w.name]),
    );
    return (programId: string | null) =>
      programId === null
        ? personal
        : (teams.get(programId) ?? "Another program");
  }, [available]);

  // The viewer's own ids and the roster are per-open facts, not per-keystroke
  // ones. Fetched once when the palette opens (the roster only in a program)
  // and read from here by every search.
  const mineRef = useRef<Set<string> | null>(null);
  const rosterRef = useRef<{ programId: string; rows: RosterFullRow[] } | null>(
    null,
  );

  // Debounce query. Commands are local, so they do not wait.
  useEffect(() => {
    if (!query.trim() || mode === ">") {
      setDebouncedQuery("");
      setResults(null);
      return;
    }
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query, mode]);

  // Reset on open/close. The scope toggle resets too: widening is a thing you
  // do to one search, not a setting. `isLoading` resets as well — a fetch
  // abandoned mid-flight by a close used to leave the skeleton up forever.
  useEffect(() => {
    if (open) {
      setRecentSearches(loadRecent());
    } else {
      setQuery("");
      setDebouncedQuery("");
      setMode(null);
      setAllWorkspaces(false);
      setResults(null);
      setIsLoading(false);
      setHighlightIndex(0);
      mineRef.current = null;
      rosterRef.current = null;
    }
  }, [open]);

  // Fetch results
  useEffect(() => {
    if (!debouncedQuery) {
      // A cleared query is a resolved state, not a pending one. Without this
      // a fetch abandoned by clearing the field left `isLoading` true.
      setIsLoading(false);
      return;
    }

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

      const columns = mode ? MODES[mode].columns : ALL_COLUMNS;
      const needle = columns
        .map((column) => ilikeTerm(column, debouncedQuery))
        .join(",");

      // `@` in a program also asks the roster. Same RPC the Roster page calls,
      // through the same session, so it answers with exactly what that page
      // would show this viewer. Fetched once per open and filtered here.
      const wantsRoster = mode === "@" && activeKind === "team";
      const rosterPromise =
        wantsRoster && rosterRef.current?.programId !== activeId
          ? supabase.rpc("program_roster_full", { p_program_id: activeId })
          : Promise.resolve({ data: null });

      // Not just `user.id`. A match a coach recorded for this athlete before
      // they had an account carries their roster PROFILE's id, and
      // `player1_id` is what orients the score and picks the opponent's name.
      // Comparing against one id showed those the wrong way round.
      const minePromise = mineRef.current
        ? Promise.resolve({ data: null })
        : supabase.rpc("my_player_ids");

      // `count: "exact"` rides the main read so a scoped search knows how many
      // it found; the unscoped head request beside it is what says how many it
      // did NOT. Only when there is a second workspace to have missed anything
      // in.
      let scoped = supabase
        .from("matches")
        .select(
          "id, player1_id, player1_name, player2_name, tournament_name, round, date, score, program_id",
          { count: "exact" },
        )
        .or(needle)
        .order("date", { ascending: false })
        .limit(MAX_MATCHES);

      if (!allWorkspaces) {
        scoped = scopeToWorkspace(
          scoped,
          { id: activeId, kind: activeKind },
          user.id,
        );
      }

      const everywherePromise =
        hasScope && !allWorkspaces
          ? supabase
              .from("matches")
              .select("id", { count: "exact", head: true })
              .or(needle)
          : Promise.resolve({ count: null });

      const [
        { data, error, count: scopedCount },
        { count: everywhereCount },
        { data: rosterRows },
        { data: idRows },
      ] = await Promise.all([
        scoped,
        everywherePromise,
        rosterPromise,
        minePromise,
      ]);

      if (stale) return;

      if (error) {
        // A query the database refused is not "no results". Say nothing
        // rather than something false; the console has the reason.
        console.error("[search] query failed", { message: error.message });
        setResults(null);
        setIsLoading(false);
        return;
      }

      if (idRows) {
        mineRef.current = new Set<string>(
          [
            user.id,
            ...((idRows ?? []) as (string | { my_player_ids?: string })[]).map(
              (row) =>
                typeof row === "string" ? row : (row?.my_player_ids ?? ""),
            ),
          ].filter(Boolean),
        );
      }
      const mine = mineRef.current ?? new Set<string>([user.id]);
      const isMine = (id: string | null) => Boolean(id && mine.has(id));

      if (rosterRows) {
        rosterRef.current = {
          programId: activeId,
          rows: rosterRows as RosterFullRow[],
        };
      }
      // `rosterPlayerOptions` is the roster's own transform — players only,
      // the same name fallback the Roster page uses, ladder order — so what
      // the palette lists is what that page would select.
      const q = debouncedQuery.toLowerCase();
      const roster: RosterResult[] = wantsRoster
        ? rosterPlayerOptions(rosterRef.current?.rows)
            .filter((player) => player.name.toLowerCase().includes(q))
            .slice(0, MAX_PER_CATEGORY)
            .map((player) => ({
              playerId: player.playerId,
              name: player.name,
              spot:
                player.ladderPosition !== null
                  ? `No. ${player.ladderPosition}`
                  : null,
            }))
        : [];

      const elsewhereCount = Math.max(
        0,
        (everywhereCount ?? 0) - (scopedCount ?? 0),
      );

      const rows = data ?? [];

      const matches: MatchResult[] = rows
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
            outcome: matchOutcome(m.score, isP1),
            hasScore: setTally(m.score) !== null,
            workspaceName: workspaceNames(m.program_id),
          };
        });

      const oppCounts = new Map<string, number>();
      const eventCounts = new Map<string, number>();
      for (const m of rows) {
        const opp = isMine(m.player1_id) ? m.player2_name : m.player1_name;
        oppCounts.set(opp, (oppCounts.get(opp) ?? 0) + 1);
        const event = m.tournament_name ?? "Unknown event";
        eventCounts.set(event, (eventCounts.get(event) ?? 0) + 1);
      }
      const topCounts = (counts: Map<string, number>): GroupedResult[] =>
        Array.from(counts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, MAX_PER_CATEGORY)
          .map(([name, matchCount]) => ({ name, matchCount }));

      setResults({
        matches,
        opponents: topCounts(oppCounts),
        events: topCounts(eventCounts),
        roster,
        elsewhereCount,
      });
      setHighlightIndex(0);
      setIsLoading(false);
    }

    search();
    return () => {
      stale = true;
    };
  }, [
    debouncedQuery,
    mode,
    allWorkspaces,
    activeId,
    activeKind,
    hasScope,
    workspaceNames,
  ]);

  /**
   * What the list shows, in order, by mode — each section carrying the index
   * its first item has in the flattened list, so the render and the keyboard
   * agree by construction rather than by a counter that has to be walked in
   * the same order.
   *
   * Commands lead when they match, because a person who typed "upl" wants the
   * verb, not the three matches whose opponent has those letters. In `@` a
   * program's roster leads the opponents faced: your own players are the
   * likelier answer to a name typed inside a program.
   */
  const sections = useMemo<Section[]>(() => {
    const out: Section[] = [];
    let start = 0;
    const add = (title: string, items: FlatItem[]) => {
      if (items.length === 0) return;
      out.push({ title, items, start });
      start += items.length;
    };
    const q = query.trim().toLowerCase();

    if (mode === "@" || mode === "#") {
      if (!results) return out;
      if (mode === "@") {
        add(
          "Roster",
          results.roster.map((data) => ({ type: "roster", data })),
        );
        add(
          "Opponents",
          results.opponents.map((data) => ({ type: "opponent", data })),
        );
      } else {
        add(
          "Events",
          results.events.map((data) => ({ type: "event", data })),
        );
      }
      return out;
    }

    const actionItems: FlatItem[] = actions
      .filter((action) => q === "" || action.label.toLowerCase().includes(q))
      .map((data) => ({ type: "action", data }));

    if (mode === ">") {
      add("Commands", actionItems);
      return out;
    }

    // Nothing typed: the things people open this for, then what they last
    // looked for. It replaces a magnifier illustration that explained what a
    // search box is.
    if (!results) {
      if (q !== "") return out;
      add("Jump to", actionItems);
      add(
        "Recent",
        recentSearches.map((query) => ({ type: "recent", query })),
      );
      return out;
    }

    add("Actions", actionItems);

    if (allWorkspaces) {
      // Grouped by where the match lives, and matches ONLY — see the header
      // on scope. Insertion order follows the query's date order, so the
      // workspace with the most recent hit leads.
      const byWorkspace = new Map<string, FlatItem[]>();
      for (const data of results.matches) {
        const list = byWorkspace.get(data.workspaceName) ?? [];
        list.push({ type: "match", data });
        byWorkspace.set(data.workspaceName, list);
      }
      for (const [title, items] of byWorkspace) {
        add(title, items.slice(0, MAX_PER_CATEGORY));
      }
      return out;
    }

    add(
      "Matches",
      results.matches.map((data) => ({ type: "match", data })),
    );
    add(
      "Opponents",
      results.opponents.map((data) => ({ type: "opponent", data })),
    );
    add(
      "Events",
      results.events.map((data) => ({ type: "event", data })),
    );
    return out;
  }, [query, mode, actions, results, recentSearches, allWorkspaces]);

  const flatItems = useMemo(
    () => sections.flatMap((section) => section.items),
    [sections],
  );

  // The index the keyboard and the render both use. `highlightIndex` is
  // state; this is that state clamped to the list that exists NOW. The list
  // shrinks synchronously — typing in `>` mode filters commands locally,
  // ⇧↵ regroups — while the state only resets when a fetch lands, and Enter
  // on a stale index was a crash.
  const activeIndex =
    flatItems.length === 0
      ? 0
      : Math.min(Math.max(highlightIndex, 0), flatItems.length - 1);

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
            `/dashboard/team/roster?player=${encodeURIComponent(item.data.playerId)}`,
          );
          return;
        default:
          router.push(
            `/dashboard/matches?q=${encodeURIComponent(item.data.name)}`,
          );
      }
    },
    [query, onOpenChange, router],
  );

  /**
   * The prefix is consumed, never shown in the field. A typed `>` becomes the
   * chip and the field goes back to empty, so what you type next is the
   * query and only the query. Judged on the incoming value, not the old
   * state: after ⌘A the field's text is replaced in one change, and `query`
   * still holds what was there before.
   */
  const handleChange = (value: string) => {
    if (
      mode === null &&
      value.length > 0 &&
      isMode(value[0]) &&
      !query.startsWith(value[0])
    ) {
      setMode(value[0]);
      setQuery(value.slice(1));
      return;
    }
    setQuery(value);
  };

  // Keyboard handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // A CJK IME commits a candidate with Enter and edits it with Backspace.
      // Neither is ours while composition is open.
      if (e.nativeEvent.isComposing) return;

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
        setHighlightIndex(
          Math.min(activeIndex + 1, Math.max(flatItems.length - 1, 0)),
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIndex(Math.max(activeIndex - 1, 0));
      } else if (e.key === "Enter" && flatItems.length > 0) {
        e.preventDefault();
        navigateTo(flatItems[activeIndex]);
      }
    },
    [query, mode, hasScope, flatItems, activeIndex, navigateTo],
  );

  // Scroll highlighted into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  /**
   * Which one thing the results area shows. Four states that used to be four
   * overlapping booleans; one value, so they cannot both be true.
   */
  const hasQuery =
    debouncedQuery.length > 0 || (mode === ">" && query.trim() !== "");
  const modeHint = mode ? MODES[mode].hint : null;
  const pane: "loading" | "list" | "empty" | "hint" | null = isLoading
    ? "loading"
    : flatItems.length > 0
      ? "list"
      : hasQuery
        ? "empty"
        : modeHint
          ? "hint"
          : null;

  const placeholder = mode
    ? MODES[mode].placeholder
    : "Search, or > for commands";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 14px and the hairline are the popover primitive's own surface — the
          two menus this opens beside now draw the same one. The shadow is the
          token, not a copy of its value. */}
      <DialogContent
        className="overflow-hidden border border-[var(--border-hairline)] p-0 shadow-[var(--shadow-dropdown)] sm:top-[20%] sm:max-w-[480px] sm:translate-y-0 sm:rounded-[14px]"
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

          {/* Where you are. */}
          <WorkspaceScopeChip wide={allWorkspaces} />

          {/* What you are looking for. */}
          {mode && (
            <span className="flex h-5 shrink-0 items-center gap-1 rounded-[6px] bg-[var(--blue-soft)] px-[7px] text-[11px] font-medium text-[var(--blue)]">
              <span className="font-mono">{mode}</span>
              {MODES[mode].label}
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
            autoFocus
            data-focus-ring="none"
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            aria-label={mode ? `${MODES[mode].label} search` : "Search"}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-400)]"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="shrink-0 cursor-pointer rounded-[6px] p-1 transition-colors duration-150 hover:bg-[var(--surface-subtle)] focus-visible:bg-[var(--surface-subtle)] focus-visible:outline-none"
              aria-label="Clear search"
            >
              <X
                className="size-3.5 text-[var(--ink-400)]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </button>
          ) : (
            <Kbd size="xs" variant="flat">
              esc
            </Kbd>
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
            {pane === "loading" && (
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

            {pane === "hint" && (
              <motion.p
                key="hint"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: EASE_CURVE }}
                className="px-4 py-5 text-[12px] text-[var(--ink-500)]"
              >
                {modeHint}
              </motion.p>
            )}

            {pane === "empty" && (
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

            {pane === "list" && (
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
                    {section.items.map((item, i) => {
                      const idx = section.start + i;
                      const isActiveRow = activeIndex === idx;
                      return (
                        <button
                          key={`${item.type}-${idx}`}
                          type="button"
                          data-index={idx}
                          onClick={() => navigateTo(item)}
                          onMouseEnter={() => setHighlightIndex(idx)}
                          className={cn(
                            ROW_CLASS,
                            isActiveRow && "bg-[var(--surface-subtle)]",
                          )}
                          role="option"
                          aria-selected={isActiveRow}
                        >
                          <ResultRow item={item} />
                          {/* Enter has a target, and it is the row that says so. */}
                          {isActiveRow && (
                            <Kbd
                              size="xs"
                              variant="flat"
                              className="bg-[var(--surface-card)]"
                            >
                              ↵
                            </Kbd>
                          )}
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
                    className={cn(
                      ROW_CLASS,
                      "mt-1 cursor-pointer hover:bg-[var(--surface-subtle)]",
                    )}
                  >
                    <span className="w-[14px] shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1 text-[12px] text-[var(--ink-600)]">
                      {pluralize(results.elsewhereCount, "more result")} in your
                      other workspace{available.length > 2 ? "s" : ""}
                    </span>
                    <Kbd size="xs" variant="flat">
                      ⇧↵
                    </Kbd>
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer: both escapes. The kind on the left, the scope on the right. */}
        <div className="flex h-9 items-center gap-3 border-t border-[var(--border-hairline)] px-3.5">
          <FooterHint keycap=">" mono>
            commands
          </FooterHint>
          <FooterHint keycap="@" mono>
            players
          </FooterHint>
          <FooterHint keycap="#" mono>
            events
          </FooterHint>
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
      <Kbd size="xs" variant="flat" mono={mono}>
        {keycap}
      </Kbd>
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
            {hintFor(item.data.href)}
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
              {item.data.hasScore && (
                <ResultMark won={item.data.outcome} className="shrink-0" />
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
    case "event": {
      const Icon = item.type === "event" ? Trophy : Users;
      return (
        <>
          <Icon
            className="size-3.5 shrink-0 text-[var(--ink-500)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--ink-900)]">
            {item.data.name}
          </span>
          <span className="shrink-0 text-[12px] text-[var(--ink-500)] tabular-nums">
            {pluralize(item.data.matchCount, "match", "matches")}
          </span>
        </>
      );
    }
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
  }
}
