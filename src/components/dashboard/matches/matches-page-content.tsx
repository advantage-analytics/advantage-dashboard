"use client";
import { SortTrigger } from "@/components/dashboard/shared/list-toolbar-trigger";
import { FloatMenu, FloatMenuItem } from "@/components/ui/float-menu";

import {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { useSearchParams, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Filter as FilterIcon, GalleryHorizontalEnd } from "lucide-react";
import { EmptyMatches } from "./empty-matches";
import { TableEmptyBody } from "@/components/dashboard/shared/table-empty-body";
import type { DisplayMatch } from "@/lib/data/matches-list-types";
import type { DraftRowData } from "./draft-row";
import {
  isAnalysisFailed,
  isAnalysisReady,
  isInFlight,
  isLiveUpdating,
} from "@/lib/data/match-analysis";
import {
  useLiveMatchAnalysis,
  withLiveAnalysis,
} from "@/hooks/use-live-match-analysis";
import { matchesFilterGroups } from "@/lib/data/match-filters";
import { normalizedPersonName } from "@/lib/data/person-name";
import { providers } from "@/lib/providers";
import { useUnseenReportIds } from "@/lib/ui/seen-reports";
import { MatchesGrid, type SortField, type SortDir } from "./matches-grid";
import { DRAWER_ATTR, MatchDrawer } from "./match-drawer";
import { DraftDrawer } from "./draft-drawer";
import { matchRowId } from "./match-card-list";
import { MATCH_DRAWER_SLOT_ID } from "./match-drawer-slot";
import type { MatchAnalysis } from "@/lib/data/match-analysis";
import {
  MatchesFilterPanel,
  type FilterOption,
  type FilterPanelSection,
} from "./matches-filter-panel";
import { LifecycleChips, type LifecycleValue } from "./lifecycle-chips";
import { MATCHES_PAGE_SIZE, matchesListShape } from "./match-list-layout";
import { rememberMatchesShape } from "./matches-shape-memory";
import { useWorkspace } from "@/components/dashboard/workspace-provider";

function providerName(id: string): string {
  return providers.find((p) => p.id === id)?.name ?? id;
}

interface MatchesPageContentProps {
  matches: DisplayMatch[];
  /** The viewer's saved drafts in this workspace, newest first. */
  drafts?: DraftRowData[];
  /** Signed-in user, for the live job subscription. Absent = no subscription. */
  userId?: string;
  /** Which workspace this list belongs to. Only the empty state reads it. */
  scope?: "personal" | "team";
}

type FilterKey =
  | "result"
  | "matchType"
  | "courtType"
  | "source"
  | "analysis"
  /** Team scope only — see `FILTER_GROUPS`. */
  | "player"
  /** A scouting axis (who you played), not a lifecycle one — grouped apart in the panel. */
  | "hand"
  | "backhand";

/**
 * Whether a stored filter value and a chip mean the same thing.
 *
 * Exact for every group but `player`, whose values are people's names and so
 * answer to the same rule the list itself filters by. The chip list keeps ONE
 * raw spelling per person, so a value stored from a different spelling — an
 * older bookmark, or a newer upload that changed which spelling wins the label
 * — would otherwise render its chip unchecked while the list stayed filtered,
 * and clicking it would append a second filter rather than clearing the first.
 *
 * Values stay raw rather than normalized so URLs written before this still
 * resolve; the normalization happens on comparison instead.
 */
function sameValue(key: FilterKey, a: string, b: string): boolean {
  return key === "player"
    ? normalizedPersonName(a) === normalizedPersonName(b)
    : a === b;
}

const FILTER_KEYS: FilterKey[] = [
  "result",
  "matchType",
  "courtType",
  "source",
  "analysis",
  "player",
  "hand",
  "backhand",
];

/**
 * Collapses the nine job statuses into the four buckets a player actually
 * filters by. This is the analysis queue's filter, folded into the chip row
 * that was already here.
 */
function analysisGroup(match: DisplayMatch): string | null {
  const status = match.analysis?.status;
  if (!status) return null;
  if (isInFlight(status)) return "In progress";
  if (isAnalysisFailed(status)) return "Failed";
  if (status === "manual") return "No video";
  return "Ready";
}

const ANALYSIS_GROUP_ORDER = ["In progress", "Ready", "Failed", "No video"];

/**
 * The "Estimates" view — statistics the engine published but could not defend
 * at full confidence, to be read as "Estimate · Review data" in the row.
 *
 * No analysis state carries that marker yet: Phase 2 derivation withholds the
 * aggregates it cannot stand behind (`timeline`) rather than publishing them
 * flagged, so today nothing qualifies and the view is honestly empty. The
 * predicate exists so the pill is wired to the fact the moment a low-confidence
 * flag lands on `MatchAnalysis`, instead of to a status list that would need
 * re-deriving then.
 */
function isEstimate(_analysis: MatchAnalysis | undefined): boolean {
  return false;
}

interface ActiveFilter {
  key: FilterKey;
  value: string;
}

/**
 * Design 18a's three fixed 2-option facets — segmented, not checklists, so
 * they're single-select by construction (see `matches-filter-panel.tsx`).
 * `HAND_OPTIONS`/`BACKHAND_OPTIONS` also back `describeFilters`'s scouting
 * sentence below, which needs the same value → phrase mapping.
 */
const RESULT_OPTIONS: FilterOption[] = [
  { value: null, label: "All" },
  { value: "Won", label: "Won" },
  { value: "Loss", label: "Lost" },
];
const HAND_OPTIONS: FilterOption[] = [
  { value: null, label: "Any" },
  { value: "right", label: "Right" },
  { value: "left", label: "Left" },
];
const BACKHAND_OPTIONS: FilterOption[] = [
  { value: null, label: "Any" },
  { value: "one-handed", label: "One-hand" },
  { value: "two-handed", label: "Two-hand" },
];

/** For every facet's stored value → its human label, used uniformly by `describeFilters`. */
function displayValueFor(key: FilterKey, value: string): string {
  if (key === "result")
    return RESULT_OPTIONS.find((o) => o.value === value)?.label ?? value;
  const group = FILTER_GROUPS.find((g) => g.key === key);
  return group?.displayValue ? group.displayValue(value) : value;
}

/**
 * The applied-filter strip's sentence. Hand + backhand together get the
 * curated scouting phrase; anything else falls back to a plain joined list of
 * each facet's own display label — honest, if less like a sentence, rather
 * than a template guessing at combinations it was never written for.
 */
function describeFilters(filters: ActiveFilter[]): string {
  const hand = filters.find((f) => f.key === "hand")?.value;
  const backhand = filters.find((f) => f.key === "backhand")?.value;
  const rest = filters.filter((f) => f.key !== "hand" && f.key !== "backhand");
  const parts: string[] = [];

  if (hand && backhand) {
    parts.push(
      `${hand === "left" ? "Left" : "Right"}-handed opponents with a ${backhand === "one-handed" ? "one" : "two"}-handed backhand`,
    );
  } else if (hand) {
    parts.push(`${hand === "left" ? "Left" : "Right"}-handed opponents`);
  } else if (backhand) {
    parts.push(
      `Opponents with a ${backhand === "one-handed" ? "one" : "two"}-handed backhand`,
    );
  }

  parts.push(...rest.map((f) => displayValueFor(f.key, f.value)));
  return parts.join(" · ");
}

/**
 * The open, data-driven checklist facets only — Result/Hand/Backhand moved to
 * the fixed segmented constants above, since a segmented control needs a
 * known-ahead-of-time option list, not one read off the matches.
 */
const FILTER_GROUPS: {
  key: FilterKey;
  label: string;
  getValues: (matches: DisplayMatch[]) => string[];
  displayValue?: (val: string) => string;
  /** Omitted outside a team workspace — a personal list is one player already. */
  teamOnly?: boolean;
}[] = [
  {
    // First, because inside a program "who" is the question asked before any
    // other. The list shows the whole squad — every member reads the program's
    // matches, staff and player alike — and until now the only way to read one
    // person's season was to scroll.
    // It reads `player1` because that is always the program's side of the row:
    // `recordResult` and the upload wizard both put the opponent in `player2`.
    key: "player",
    label: "Roster",
    teamOnly: true,
    // Deduplicated by the app's name rule, not by raw string: a season
    // recorded under both "Dana Brooks" and "Dana  Brooks" otherwise offers two
    // chips that render identically — HTML collapses the double space — and
    // each shows half her matches with nothing on screen saying so. The label
    // keeps the first spelling seen; the filter below compares by the same rule,
    // so either spelling's rows come back under the one chip.
    getValues: (matches) => {
      const byName = new Map<string, string>();
      for (const m of matches) {
        const key = normalizedPersonName(m.player1.name);
        if (key && !byName.has(key)) byName.set(key, m.player1.name);
      }
      return [...byName.values()].sort((a, b) =>
        normalizedPersonName(a).localeCompare(normalizedPersonName(b)),
      );
    },
  },
  {
    key: "matchType",
    label: "Match type",
    getValues: (matches) =>
      [...new Set(matches.map((m) => m.matchType))].sort(),
  },
  {
    key: "courtType",
    label: "Court",
    getValues: (matches) =>
      [
        ...new Set(matches.map((m) => m.courtType).filter(Boolean) as string[]),
      ].sort(),
  },
  {
    key: "source",
    label: "Source",
    getValues: (matches) =>
      [
        ...new Set(
          matches.map((m) => m.sourceProvider).filter(Boolean) as string[],
        ),
      ].sort(),
    displayValue: providerName,
  },
  {
    key: "analysis",
    label: "Analysis",
    getValues: (matches) => {
      const present = new Set(
        matches.map(analysisGroup).filter(Boolean) as string[],
      );
      // Fixed order — these are pipeline stages, so alphabetising them would
      // scramble the sequence a reader expects.
      return ANALYSIS_GROUP_ORDER.filter((group) => present.has(group));
    },
  },
];

const PAGE_SIZE = MATCHES_PAGE_SIZE;

/* ─── Sort dropdown ─── */
const SORT_OPTIONS: { field: SortField; label: string }[] = [
  { field: "date", label: "Date" },
  { field: "event", label: "Event" },
  { field: "opponent", label: "Opponent" },
  { field: "result", label: "Result" },
];

function SortDropdown({
  sortField,
  sortDir,
  onSort,
}: {
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
}) {
  const [open, setOpen] = useState(false);

  const activeLabel =
    SORT_OPTIONS.find((o) => o.field === sortField)?.label ?? "Date";
  const dirLabel =
    sortField === "date"
      ? sortDir === "asc"
        ? "Oldest"
        : "Newest"
      : sortDir === "asc"
        ? "A–Z"
        : "Z–A";
  // One quiet phrase, the canvas register: "Newest first" for the default date
  // sort, "{Field} A–Z" for the text fields.
  const sortPhrase =
    sortField === "date"
      ? sortDir === "asc"
        ? "Oldest first"
        : "Newest first"
      : `${activeLabel} ${dirLabel}`;

  // The chosen row is marked by FloatMenu's blue check, as on Schedule. Its
  // second line carries the direction the old ↑/↓ glyph did, and that
  // choosing it again reverses it — `onSort` flips the active field.
  const chosenNote = `${sortField === "date" ? sortPhrase : dirLabel} · again to reverse`;

  return (
    <FloatMenu
      open={open}
      onOpenChange={setOpen}
      width={172}
      sideOffset={6}
      label="Sort options"
      trigger={
        <SortTrigger aria-expanded={open} aria-haspopup="menu" engaged={open}>
          {sortPhrase}
        </SortTrigger>
      }
    >
      {SORT_OPTIONS.map((opt) => {
        const chosen = sortField === opt.field;
        return (
          <FloatMenuItem
            key={opt.field}
            label={opt.label}
            description={chosen ? chosenNote : undefined}
            chosen={chosen}
            onSelect={() => {
              onSort(opt.field);
              setOpen(false);
            }}
          />
        );
      })}
    </FloatMenu>
  );
}

/** The chip's own name, as a heading reads it. */
const LIFECYCLE_NOUN: Record<Exclude<LifecycleValue, "all">, string> = {
  new: "new matches",
  "in-progress": "matches in progress",
  estimates: "estimates",
};

/**
 * What the table's empty body says when the chip, the search and the filters
 * leave no matches: the cut, named, and the one link that undoes the
 * narrowest part of it.
 *
 * The heading names the chip and the search but not the filters: those can
 * run to four facets, and the applied strip right above the table already
 * spells them out in full. Only reachable with something applied — an empty
 * workspace is day zero, which returns before the table renders.
 */
function emptyCutCopy({
  lifecycle,
  query,
  hasFilters,
  clearCut,
  showAll,
}: {
  lifecycle: LifecycleValue;
  query: string;
  hasFilters: boolean;
  clearCut: () => void;
  showAll: () => void;
}): Pick<React.ComponentProps<typeof TableEmptyBody>, "title" | "action"> {
  const noun = lifecycle === "all" ? "matches" : LIFECYCLE_NOUN[lifecycle];

  if (!hasFilters && !query) {
    return {
      title: `No ${noun}`,
      action: { label: "Show all matches", onClick: showAll },
    };
  }
  return {
    title:
      query && !hasFilters
        ? `No ${noun} for “${query}”`
        : `No ${noun} fit this filter`,
    action: {
      label: hasFilters ? "Clear filters" : "Clear search",
      onClick: clearCut,
    },
  };
}

/** The slot never changes once mounted, so there is nothing to subscribe to. */
function noopSubscribe(): () => void {
  return () => {};
}

/* ─── Main content ─── */
export function MatchesPageContent({
  matches: serverMatches,
  drafts = [],
  userId,
  scope = "personal",
}: MatchesPageContentProps): React.JSX.Element {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const workspaceId = useWorkspace().active.id;

  // Teach the route's loading boundary this workspace's first page, so the next
  // client-side visit draws its skeleton at the size the rows will arrive at.
  useEffect(() => {
    rememberMatchesShape(
      workspaceId,
      matchesListShape(
        serverMatches.map((m) => m.date),
        drafts.map((d) => d.updatedAt),
      ),
    );
  }, [workspaceId, serverMatches, drafts]);

  // Live job state, merged over what the server rendered. Without this the bar
  // is a snapshot from page load — a long upload appears frozen, and a job that
  // finishes while the tab is open never says so.
  //
  // Merged before everything below so filtering, sorting and grouping all see
  // the live status: a job that fails mid-view should leave the "In progress"
  // group without a refresh, not just change colour.
  // Only subscribe when there is something to follow. Otherwise every visit to
  // this page holds a WebSocket and a 25-second heartbeat for a channel that
  // will never deliver a message, against a per-project connection cap.
  //
  // Trade-off: a match that enters flight from ANOTHER tab will not light up
  // here without a refresh. Acceptable — uploads start from this app, in the
  // tab the user is already looking at.
  // isLiveUpdating, not isInFlight. A match parked at `processed` is in flight
  // but nothing will move it until Phase 2 ships, so subscribing for it would
  // hold the socket described above open forever rather than briefly.
  const hasInFlight = serverMatches.some(
    (m) => m.analysis && isLiveUpdating(m.analysis.status),
  );
  const livePatches = useLiveMatchAnalysis({
    by: "user",
    userId: hasInFlight ? userId : undefined,
  });
  const matches = useMemo(() => {
    if (livePatches.size === 0) return serverMatches;
    return serverMatches.map((m) => {
      const patch = livePatches.get(m.id);
      if (!patch || !m.analysis) return m;
      return { ...m, analysis: withLiveAnalysis(m.analysis, patch) };
    });
  }, [serverMatches, livePatches]);

  /* Layout is decided by the viewport alone — there is no view control any
     more. Seven columns need the width, so under 1024px the same matches render
     as cards instead. That choice is made in CSS inside MatchesGrid, so it
     needs no state, no listener, and no URL parameter here. */

  // No search box in the filter row — the header owns search (⌘K), and a
  // second control here was the drift Pb2 removed (Updated Design System
  // 19g). The command palette still lands on this page with `?q=<name>` for
  // an opponent or event it found, so the query survives as a cut this list
  // states in words in the applied-filter strip, with the same "Clear filter"
  // as any other. It has no input of its own.
  const [search, setSearch] = useState(() => searchParams.get("q") || "");
  const [sortField, setSortField] = useState<SortField>(
    () => (searchParams.get("sort") as SortField) || "date",
  );
  const [sortDir, setSortDir] = useState<SortDir>(
    () => (searchParams.get("dir") as SortDir) || "desc",
  );
  const [filters, setFilters] = useState<ActiveFilter[]>(() => {
    const result: ActiveFilter[] = [];
    for (const key of FILTER_KEYS) {
      for (const value of searchParams.getAll(key)) {
        // Deduplicated on the way in, by the same rule the chips use. A URL
        // written before the Player chips collapsed to one spelling per person
        // can carry both — `?player=Dana+Brooks&player=Dana++Brooks` — and two
        // entries for one chip make the badge out-count the checked chips and
        // render two pills that look identical in the empty state.
        if (
          result.some((f) => f.key === key && sameValue(key, f.value, value))
        ) {
          continue;
        }
        result.push({ key, value });
      }
    }
    return result;
  });
  const [lifecycle, setLifecycle] = useState<LifecycleValue>(() => {
    const v = searchParams.get("lifecycle");
    return v === "new" || v === "in-progress" || v === "estimates" ? v : "all";
  });
  const readyMatchIds = useMemo(
    () =>
      matches
        .filter((m) => !m.analysis || isAnalysisReady(m.analysis.status))
        .map((m) => m.id),
    [matches],
  );
  const unseenIds = useUnseenReportIds(readyMatchIds);
  const [page, setPage] = useState(() => Number(searchParams.get("page")) || 1);

  // Track newly created match for highlight animation
  const [newMatchId, setNewMatchId] = useState<string | null>(null);

  useEffect(() => {
    function handleMatchCreated(e: Event) {
      const matchId = (e as CustomEvent<{ matchId: string }>).detail?.matchId;
      if (matchId) {
        setNewMatchId(matchId);
        // Clear highlight after animation completes
        const timer = setTimeout(() => setNewMatchId(null), 2000);
        return () => clearTimeout(timer);
      }
    }
    window.addEventListener("match-created", handleMatchCreated);
    return () =>
      window.removeEventListener("match-created", handleMatchCreated);
  }, []);

  // Filter matches
  const filtered = useMemo(() => {
    let result = matches;

    // The palette's `?q=` — two needles, because one query names two kinds of
    // thing. Names go through the app's own rule so a row stored as
    // "Dana  Brooks" is reachable by her name; tournament and round are not
    // people and keep the plain contains. The plain needle is trimmed either
    // way — a trailing space used to empty the whole list.
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const person = normalizedPersonName(search);
      result = result.filter(
        (m) =>
          m.tournamentName.toLowerCase().includes(q) ||
          normalizedPersonName(m.player1.name).includes(person) ||
          normalizedPersonName(m.player2.name).includes(person) ||
          (m.round?.toLowerCase().includes(q) ?? false),
      );
    }

    // Alternatives within a facet, intersection across facets.
    result = result.filter((match) =>
      matchesFilterGroups(match, filters, (m, filter) => {
        switch (filter.key) {
          case "result":
            return filter.value === "Won"
              ? m.score.winner === "player1"
              : m.score.winner === "player2";
          case "matchType":
            return m.matchType === filter.value;
          case "courtType":
            return m.courtType === filter.value;
          case "source":
            return m.sourceProvider === filter.value;
          case "analysis":
            return analysisGroup(m) === filter.value;
          case "hand":
            return m.player2Hand === filter.value;
          case "backhand":
            return m.player2Backhand === filter.value;
          case "player":
            return (
              normalizedPersonName(m.player1.name) ===
              normalizedPersonName(filter.value)
            );
          default:
            return true;
        }
      }),
    );

    // Lifecycle — independent of the panel (v3's Data Table law 6): chips
    // answer "what's the state of this match", the panel answers everything
    // else, and the two never gate on the same predicate.
    if (lifecycle === "new") {
      result = result.filter((m) => unseenIds.has(m.id));
    } else if (lifecycle === "in-progress") {
      result = result.filter(
        (m) => !!m.analysis && isInFlight(m.analysis.status),
      );
    } else if (lifecycle === "estimates") {
      result = result.filter((m) => isEstimate(m.analysis));
    }

    return result;
  }, [matches, search, filters, lifecycle, unseenIds]);

  // Sort matches
  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "date":
          cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
          break;
        case "opponent":
          cmp = a.player2.name.localeCompare(b.player2.name);
          break;
        case "event":
          cmp = a.tournamentName.localeCompare(b.tournamentName);
          break;
        case "result": {
          const aWin = a.score.winner === "player1" ? 1 : 0;
          const bWin = b.score.winner === "player1" ? 1 : 0;
          cmp = aWin - bWin;
          break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortField, sortDir]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedMatches = sorted.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );
  const rangeStart = sorted.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, sorted.length);

  /* ── The drawer ──────────────────────────────────────────────────────────
     The Roster's selection model, verbatim: click opens and selects, clicking
     the selected row closes, ↑ ↓ step, Esc closes, and `?match=` / `?draft=`
     are the deep links that land open. `selectedId` is the washed row;
     `drawerId` outlives it by the slide-out, so the rail can animate closed.
     Drafts sit above the matches on every page, so stepping walks the drafts
     first, then the whole filtered list, turning the page when it has to. */
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const matchId = searchParams.get("match");
    if (matchId && serverMatches.some((m) => m.id === matchId)) return matchId;
    const draftId = searchParams.get("draft");
    return draftId && drafts.some((d) => d.id === draftId) ? draftId : null;
  });
  const [drawerId, setDrawerId] = useState<string | null>(selectedId);
  const [closing, setClosing] = useState(false);
  const [openedByKeyboard, setOpenedByKeyboard] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drawerDraftIndex = drawerId
    ? drafts.findIndex((d) => d.id === drawerId)
    : -1;
  const drawerDraft = drawerDraftIndex >= 0 ? drafts[drawerDraftIndex] : null;
  const drawerIndex =
    drawerId && !drawerDraft ? sorted.findIndex((m) => m.id === drawerId) : -1;
  const drawerMatch = drawerIndex >= 0 ? sorted[drawerIndex] : null;
  // Stepping order: drafts, then matches. A row's place in it decides whether
  // ↑ and ↓ have anywhere to go.
  const drawerPosition = drawerDraft
    ? drawerDraftIndex
    : drawerMatch
      ? drafts.length + drawerIndex
      : -1;
  const rowCount = drafts.length + sorted.length;

  // A record that left the list — deleted, discarded, or cut by a filter —
  // takes the drawer with it rather than leaving it open on a row nobody sees.
  if (drawerId && !drawerMatch && !drawerDraft) {
    setSelectedId(null);
    setDrawerId(null);
    setClosing(false);
  }

  const finishClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setDrawerId(null);
    setClosing(false);
  }, []);

  const selectRow = useCallback((id: string, viaKeyboard: boolean) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setClosing(false);
    setSelectedId(id);
    setDrawerId(id);
    setOpenedByKeyboard(viaKeyboard);
  }, []);

  const closeDrawer = useCallback(
    (returnFocusTo: string | null) => {
      setSelectedId(null);
      setClosing(true);
      // The animation's end normally finishes the close; this covers reduced
      // motion and a rail hidden below `lg`, where no animation runs. A second
      // close during the slide replaces the timer rather than orphaning it —
      // an orphan would fire later and shut whatever drawer opened next.
      if (closeTimer.current) clearTimeout(closeTimer.current);
      closeTimer.current = setTimeout(finishClose, 240);
      if (returnFocusTo) {
        document.getElementById(matchRowId(returnFocusTo))?.focus();
      }
    },
    [finishClose],
  );

  const toggleRow = useCallback(
    (id: string, viaKeyboard: boolean) => {
      if (selectedId === id) closeDrawer(viaKeyboard ? id : null);
      else selectRow(id, viaKeyboard);
    },
    [selectedId, selectRow, closeDrawer],
  );

  const stepRow = useCallback(
    (direction: 1 | -1) => {
      if (!selectedId) return;
      const draftAt = drafts.findIndex((d) => d.id === selectedId);
      const position =
        draftAt >= 0
          ? draftAt
          : drafts.length + sorted.findIndex((m) => m.id === selectedId);
      const target = position + direction;
      if (target < 0 || target >= drafts.length + sorted.length) return;
      let nextId: string;
      if (target < drafts.length) {
        nextId = drafts[target].id;
      } else {
        const matchAt = target - drafts.length;
        nextId = sorted[matchAt].id;
        setPage(Math.floor(matchAt / PAGE_SIZE) + 1);
      }
      selectRow(nextId, true);
      requestAnimationFrame(() => {
        document
          .getElementById(matchRowId(nextId))
          ?.scrollIntoView({ block: "nearest" });
      });
    },
    [drafts, sorted, selectedId, selectRow],
  );

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  // Esc and the arrows work wherever focus is, standing down for fields, open
  // menus and modal dialogs — the drawer's own dialog told apart by its attr.
  useEffect(() => {
    if (!selectedId) return;

    function onKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      const target = event.target as HTMLElement | null;
      if (target) {
        if (target.closest("input, textarea, select, [contenteditable=true]"))
          return;
        if (
          target.closest(
            `[role="dialog"]:not([${DRAWER_ATTR}] [role="dialog"])`,
          )
        )
          return;
        if (target.closest("[data-radix-popper-content-wrapper]")) return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer(selectedId);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        stepRow(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        stepRow(-1);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, closeDrawer, stepRow]);

  // The rail renders beside the page column, not inside it, so the table
  // reflows the way the Roster's does. The page draws the slot; this reads it
  // after hydration (the server has no document, so it renders no drawer).
  const drawerSlot = useSyncExternalStore(
    noopSubscribe,
    () => document.getElementById(MATCH_DRAWER_SLOT_ID),
    () => null,
  );

  // Reset page when filters/query/lifecycle change
  useEffect(() => {
    setPage(1);
  }, [search, filters, lifecycle]);

  // Sync state to URL
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (sortField !== "date") params.set("sort", sortField);
    if (sortDir !== "desc") params.set("dir", sortDir);
    if (page > 1) params.set("page", String(page));
    if (lifecycle !== "all") params.set("lifecycle", lifecycle);
    for (const f of filters) params.append(f.key, f.value);
    if (selectedId) {
      const isDraft = drafts.some((d) => d.id === selectedId);
      params.set(isDraft ? "draft" : "match", selectedId);
    }
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${pathname}${query ? `?${query}` : ""}`,
    );
  }, [
    search,
    sortField,
    sortDir,
    page,
    filters,
    lifecycle,
    selectedId,
    drafts,
    pathname,
  ]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "date" ? "desc" : "asc");
    }
  }

  const toggleFilter = useCallback((key: FilterKey, value: string) => {
    setFilters((prev) => {
      const exists = prev.some(
        (f) => f.key === key && sameValue(key, f.value, value),
      );
      if (exists)
        return prev.filter(
          (f) => !(f.key === key && sameValue(key, f.value, value)),
        );
      return [...prev, { key, value }];
    });
  }, []);

  /**
   * A segmented facet's click always replaces, never toggles — that's what
   * keeps Result/Hand/Backhand single-select. Selecting the neutral option
   * ("All"/"Any", `value === null`) just clears the key.
   */
  const selectSegment = useCallback((key: FilterKey, value: string | null) => {
    setFilters((prev) => {
      const withoutKey = prev.filter((f) => f.key !== key);
      return value === null ? withoutKey : [...withoutKey, { key, value }];
    });
  }, []);

  const segmentedValue = useCallback(
    (key: FilterKey) => filters.find((f) => f.key === key)?.value ?? null,
    [filters],
  );

  const clearFilters = useCallback(() => setFilters([]), []);

  const isFilterActive = useCallback(
    (key: FilterKey, value: string) =>
      filters.some((f) => f.key === key && sameValue(key, f.value, value)),
    [filters],
  );

  // Values are read off the matches, so a category with nothing to offer drops
  // out of the panel rather than opening onto an empty list. Order matches
  // design 18a: Player (team scope) → Result → the data-driven checklists →
  // Analysis → Opponent last, behind its own divider.
  const filterSections: FilterPanelSection<FilterKey>[] = useMemo(() => {
    const checklistSection = (
      group: (typeof FILTER_GROUPS)[number],
    ): FilterPanelSection<FilterKey> | null => {
      if (group.teamOnly && scope !== "team") return null;
      const values = group.getValues(matches);
      if (values.length === 0) return null;
      return {
        label: group.label,
        checklist: { key: group.key, values, displayValue: group.displayValue },
      };
    };

    const byKey = new Map(FILTER_GROUPS.map((g) => [g.key, g]));
    const sections: FilterPanelSection<FilterKey>[] = [];

    const playerSection = checklistSection(byKey.get("player")!);
    if (playerSection) sections.push(playerSection);

    sections.push({
      label: "Result",
      segmented: [{ key: "result", options: RESULT_OPTIONS }],
    });

    for (const key of ["matchType", "courtType", "source"] as const) {
      const section = checklistSection(byKey.get(key)!);
      if (section) sections.push(section);
    }

    const analysisSection = checklistSection(byKey.get("analysis")!);
    if (analysisSection) sections.push(analysisSection);

    const handHasData = matches.some((m) => m.player2Hand);
    const backhandHasData = matches.some((m) => m.player2Backhand);
    if (handHasData || backhandHasData) {
      sections.push({
        label: "Opponent",
        segmented: [
          ...(handHasData
            ? [
                {
                  key: "hand" as FilterKey,
                  rowLabel: "Hand",
                  options: HAND_OPTIONS,
                },
              ]
            : []),
          ...(backhandHasData
            ? [
                {
                  key: "backhand" as FilterKey,
                  rowLabel: "Backhand",
                  options: BACKHAND_OPTIONS,
                },
              ]
            : []),
        ],
      });
    }

    return sections;
  }, [matches, scope]);

  // Whether the strip has anything to state. The palette's query is a cut the
  // same as any facet, and the strip is the one place it is visible.
  const hasCut = filters.length > 0 || search.trim().length > 0;
  const clearCut = () => {
    clearFilters();
    setSearch("");
  };

  if (matches.length === 0) {
    return <EmptyMatches scope={scope} />;
  }

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Toolbar — the view pills left; Filters and the sort right. Nothing
          else lives in this row (19g). Wraps on medium screens. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <LifecycleChips active={lifecycle} onSelect={setLifecycle} />

        <div className="flex items-center gap-2">
          <MatchesFilterPanel
            sections={filterSections}
            hasActive={filters.length > 0}
            isChecklistActive={isFilterActive}
            onToggleChecklist={toggleFilter}
            segmentedValue={segmentedValue}
            onSelectSegment={selectSegment}
            onClear={clearFilters}
            resultCount={sorted.length}
            totalCount={matches.length}
          />

          <SortDropdown
            sortField={sortField}
            sortDir={sortDir}
            onSort={toggleSort}
          />
        </div>
      </div>

      {/* Applied-filter strip — the panel closes on apply, this states the cut
          in words. Never chips, never a badge (v3's Data Table law 6). */}
      {hasCut && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-[var(--radius-element)] px-3.5 py-2.5"
          style={{ background: "var(--surface-subtle)" }}
        >
          <FilterIcon
            className="size-[13px] shrink-0"
            strokeWidth={1.5}
            style={{ color: "var(--ink-500)" }}
            aria-hidden="true"
          />
          <span className="text-[11px]" style={{ color: "var(--ink-700)" }}>
            {[
              ...(search.trim() ? [`Matching “${search.trim()}”`] : []),
              ...(filters.length > 0 ? [describeFilters(filters)] : []),
            ].join(" · ")}
          </span>
          <span
            className="size-[3px] rounded-full"
            style={{ background: "var(--ink-300)" }}
            aria-hidden="true"
          />
          <span className="text-micro tabular">
            {sorted.length} of {matches.length}
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={clearCut}
            className="text-[11px] font-medium whitespace-nowrap text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
          >
            Clear filter
          </button>
        </div>
      )}

      {/* Table / Grid */}
      <MatchesGrid
        matches={paginatedMatches}
        drafts={drafts}
        scope={scope}
        newMatchId={newMatchId}
        unseenIds={unseenIds}
        selectedId={selectedId}
        onToggle={toggleRow}
        // Not while closing: the tracks widen as the rail shrinks, in the
        // same 200ms, rather than waiting for it to finish and then jumping.
        drawerOpen={(drawerMatch !== null || drawerDraft !== null) && !closing}
        // A cut that leaves nothing keeps the table — headers and card — and
        // says so in its body (see `TableEmptyBody`).
        empty={
          <TableEmptyBody
            icon={GalleryHorizontalEnd}
            {...emptyCutCopy({
              lifecycle,
              query: search.trim(),
              hasFilters: filters.length > 0,
              clearCut,
              showAll: () => {
                clearCut();
                setLifecycle("all");
              },
            })}
          />
        }
      />

      {drawerSlot &&
        drawerDraft &&
        createPortal(
          <DraftDrawer
            draft={drawerDraft}
            scope={scope}
            index={drawerDraftIndex}
            total={drafts.length}
            canPrev={drawerPosition > 0}
            canNext={drawerPosition < rowCount - 1}
            closing={closing}
            autoFocus={openedByKeyboard}
            onPrev={() => stepRow(-1)}
            onNext={() => stepRow(1)}
            onClose={() => closeDrawer(drawerDraft.id)}
            onClosed={finishClose}
          />,
          drawerSlot,
        )}

      {drawerSlot &&
        drawerMatch &&
        createPortal(
          <MatchDrawer
            match={drawerMatch}
            scope={scope}
            index={drawerIndex}
            total={sorted.length}
            canPrev={drawerPosition > 0}
            canNext={drawerPosition < rowCount - 1}
            closing={closing}
            autoFocus={openedByKeyboard}
            onPrev={() => stepRow(-1)}
            onNext={() => stepRow(1)}
            onClose={() => closeDrawer(drawerMatch.id)}
            onClosed={finishClose}
          />,
          drawerSlot,
        )}

      {/* Footer — the range in micro type, and the way to the rest of the list
          as one quiet blue link (Platform Audit Pb2). "Older" because the list
          is newest-first; "Newer" appears once there is something newer to go
          back to. No rule of its own: whitespace separates it from the card. */}
      {sorted.length > 0 && (
        <nav className="flex items-center gap-2" aria-label="Pages">
          <span className="text-micro tabular">
            {rangeStart}–{rangeEnd} of {sorted.length}
          </span>
          <div className="flex-1" />
          {safePage > 1 && (
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="text-[11px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
            >
              Newer matches
            </button>
          )}
          {safePage > 1 && safePage < totalPages && (
            <span
              className="size-[3px] rounded-full"
              style={{ background: "var(--ink-300)" }}
              aria-hidden="true"
            />
          )}
          {safePage < totalPages && (
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="text-[11px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
            >
              Older matches
            </button>
          )}
        </nav>
      )}
    </div>
  );
}
