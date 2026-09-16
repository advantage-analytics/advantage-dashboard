"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowUpRight, Merge, MoreHorizontal, Trash2 } from "lucide-react";
import {
  ICON_BUTTON,
  PeekDrawerFrame,
} from "@/components/dashboard/matches/match-drawer";
import { ProgramCrest } from "@/components/dashboard/settings/teams/program-crest";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { ConferenceMark } from "@/components/admin/conference-mark";
import { PilotPill } from "@/components/admin/plan-pills";
import { MergeConferenceDialog } from "@/components/admin/merge-conference-dialog";
import {
  DESTRUCTIVE_ICON,
  DESTRUCTIVE_ROW,
  MENU_ROW_ICON,
} from "@/components/admin/request-drawer";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  FloatMenu,
  FloatMenuDivider,
  FloatMenuItem,
  FloatMenuNote,
} from "@/components/ui/float-menu";
import { MenuSelect } from "@/components/ui/menu-select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  addTeamToConference,
  deleteConference,
  loadConferenceTeams,
  saveConference,
} from "@/lib/services/programs/admin-conference-actions";
import {
  conferenceChanged,
  normalizeWebsite,
  websiteHref,
  type ConferenceDraft,
} from "@/lib/services/programs/conference-format";
import {
  adminSearchTeams,
  type AdminSearchResult,
} from "@/lib/data/admin-search-server";
import {
  conferenceMeta,
  type AdminConferenceRow,
} from "@/lib/data/admin-conferences-view";
import type { AdminConferenceTeam } from "@/lib/data/admin-conferences-server";
import { divisionLabel } from "@/lib/data/programs-server";
import { advButton } from "@/lib/ui/adv-button";
import { advField } from "@/lib/ui/adv-field";
import { cn } from "@/lib/utils";

/**
 * Admin › Conferences — the selected conference, as a 340px peek drawer.
 *
 * `request-drawer.tsx`'s structure: the shared `PeekDrawerFrame` owns the
 * header (‹ › · counter · ⋯ · X), stepping and Esc; this file owns the body
 * and the footer.
 *
 *   identity  mark 40 · name (wraps) · "Division I · 8 schools, …"
 *   fields    Name · Short name · Division · Website — one draft, one Save
 *   teams     every program pointing here, plus "Add a team"
 *
 * ⋯ (`actions`) is Merge into… and, only while no team points here, Delete.
 * A populated conference gets a `FloatMenuNote` in Delete's place rather than
 * a disabled row, so the menu says why instead of offering a dead control.
 * The RPC refuses the delete regardless (`P0001`), and that sentence is shown
 * in the confirm's problem slot, never swallowed.
 *
 * ── Every write ends in `onChanged()` ───────────────────────────────────────
 * The page refreshes, so the row (name, meta, Teams count), the table and the
 * summary all agree with the database. `programs.conference` is not ours to
 * write: the `conferences_mirror_label` trigger rewrites it on a rename.
 */

const DIVISION_VALUES = ["D1", "D2", "D3", "NAIA", "JUCO"] as const;
type DivisionValue = (typeof DIVISION_VALUES)[number];

const DIVISIONS = DIVISION_VALUES.map((value) => ({
  value,
  label: divisionLabel(value) ?? value,
}));

/** How many team rows show before "N more · Show all". */
const TEAMS_PREVIEW = 5;

/** The header search's own debounce. */
const SEARCH_DEBOUNCE_MS = 180;

// ---------------------------------------------------------------------------
// Teams cache
// ---------------------------------------------------------------------------

/**
 * Each conference's teams, fetched on first open and kept for the page's life,
 * so stepping back with ↑ is a state change, not a round trip. Keyed by
 * conference id — `match-drawer.tsx`'s details-cache shape. Dropped by
 * `forgetConferenceTeams` after any write that moves a team.
 */
const teamsCache = new Map<string, AdminConferenceTeam[]>();
/** Open drawers, told when their conference's teams were dropped so they refetch. */
const forgetListeners = new Set<(conferenceId: string) => void>();

/**
 * Drop one conference's cached teams. Exported so the Merge / Delete actions
 * can drop both sides of a merge.
 */
export function forgetConferenceTeams(conferenceId: string): void {
  teamsCache.delete(conferenceId);
  for (const listener of forgetListeners) listener(conferenceId);
}

type TeamsState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; teams: AdminConferenceTeam[] };

/**
 * The conference's teams through `loadConferenceTeams` (an admin-gated server
 * action; the loader behind it is service-role and stays on the server).
 *
 * A cached list whose length disagrees with the row's `teams` count is treated
 * as stale — the refreshed row is the newer answer, whatever moved the team
 * (this drawer, another tab's merge, the Teams page).
 */
function useConferenceTeams(
  conferenceId: string,
  expected: number,
): TeamsState {
  const [loaded, setLoaded] = useState<{
    id: string;
    state: TeamsState;
  } | null>(null);
  // Bumped when this conference's teams are dropped while the drawer is open —
  // nothing else in the deps changes for a same-count move.
  const [revision, setRevision] = useState(0);

  const cached = teamsCache.get(conferenceId);
  const fresh = cached && cached.length === expected ? cached : undefined;

  useEffect(() => {
    const listener = (id: string) => {
      if (id === conferenceId) setRevision((r) => r + 1);
    };
    forgetListeners.add(listener);
    return () => {
      forgetListeners.delete(listener);
    };
  }, [conferenceId]);

  useEffect(() => {
    const hit = teamsCache.get(conferenceId);
    if (hit && hit.length === expected) return;
    let cancelled = false;

    void loadConferenceTeams(conferenceId).then((result) => {
      if (result.ok) teamsCache.set(conferenceId, result.teams);
      if (cancelled) return;
      setLoaded({
        id: conferenceId,
        state: result.ok
          ? { status: "ready", teams: result.teams }
          : { status: "error", error: result.error },
      });
    });

    return () => {
      cancelled = true;
    };
  }, [conferenceId, expected, revision]);

  if (fresh) return { status: "ready", teams: fresh };
  // A previous answer for this id stays on screen while a refetch runs, so a
  // refresh does not flash the list back to "Loading".
  if (loaded?.id === conferenceId) return loaded.state;
  return { status: "loading" };
}

// ---------------------------------------------------------------------------
// Drawer
// ---------------------------------------------------------------------------

function draftFrom(row: AdminConferenceRow): ConferenceDraft {
  return {
    name: row.name,
    shortName: row.shortName,
    division: row.division,
    website: row.website,
  };
}

export function ConferenceDrawer({
  row,
  index,
  total,
  canPrev,
  canNext,
  closing,
  autoFocus,
  onPrev,
  onNext,
  onClose,
  onClosed,
  onChanged,
  conferences,
  syncUrl,
  onDeleted,
}: {
  row: AdminConferenceRow;
  index: number;
  total: number;
  canPrev: boolean;
  canNext: boolean;
  closing: boolean;
  autoFocus: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onClosed: () => void;
  /** Ran after any write lands — the page refreshes so the row agrees. */
  onChanged: () => void;
  /** Every loaded conference — the merge dialog's typeahead runs over these. */
  conferences: readonly AdminConferenceRow[];
  /** Points `?id=` and the drawer at a conference — the merge target. */
  syncUrl: (id: string) => void;
  /** This conference was deleted — the page closes the drawer. */
  onDeleted: () => void;
}) {
  const meta = conferenceMeta(row);

  const [draft, setDraft] = useState<ConferenceDraft>(() => draftFrom(row));
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [pending, start] = useTransition();

  const [menuOpen, setMenuOpen] = useState(false);
  const [merging, setMerging] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePending, startDeleting] = useTransition();

  // Seeded from the row and re-seeded whenever the drawer steps to a different
  // conference, so ↑ ↓ never carries one conference's edit onto the next. Keyed
  // on the id, not on the row object, which changes on every refresh and would
  // discard an unsaved edit. The previous-prop-in-state pattern rather than an
  // effect: `react-hooks/set-state-in-effect` refuses a synchronous setState
  // there, and this renders the right fields on the first paint instead of the
  // second.
  const [draftFor, setDraftFor] = useState(row.id);
  if (draftFor !== row.id) {
    setDraftFor(row.id);
    setDraft(draftFrom(row));
    setError(null);
    setShowAll(false);
    setMenuOpen(false);
    setMerging(false);
    setDeleting(false);
    setDeleteError(null);
  }

  const dirty = conferenceChanged(row, draft);
  const teams = useConferenceTeams(row.id, row.teams);

  const set = (patch: Partial<ConferenceDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const save = () => {
    if (!dirty) return;
    start(async () => {
      setError(null);
      const result = await saveConference(row.id, {
        name: draft.name ?? "",
        shortName: draft.shortName,
        division: draft.division,
        website: draft.website,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Hold the draft in the stored form, so a website typed as
      // "https://IvyLeague.com/" does not read as unsaved once the row comes
      // back as "ivyleague.com".
      setDraft({
        name: draft.name?.trim() ?? "",
        shortName: draft.shortName?.trim() || null,
        division: draft.division?.trim() || null,
        website: normalizeWebsite(draft.website),
      });
      onChanged();
    });
  };

  const remove = () => {
    startDeleting(async () => {
      setDeleteError(null);
      const result = await deleteConference(row.id);
      if (!result.ok) {
        // The RPC's own sentence ("This conference still has N teams — …").
        setDeleteError(result.error);
        return;
      }
      setDeleting(false);
      forgetConferenceTeams(row.id);
      onDeleted();
      onChanged();
    });
  };

  const savedWebsite = normalizeWebsite(draft.website);

  return (
    <>
      <PeekDrawerFrame
        kind="Conference"
        label={row.name}
        index={index}
        total={total}
        canPrev={canPrev}
        canNext={canNext}
        closing={closing}
        autoFocus={autoFocus}
        focusKey={row.id}
        onPrev={onPrev}
        onNext={onNext}
        onClose={onClose}
        onClosed={onClosed}
        actions={
          <ChromeTooltip label="Conference actions" hidden={menuOpen}>
            <span className="inline-flex">
              <FloatMenu
                open={menuOpen}
                onOpenChange={setMenuOpen}
                width={244}
                label="Conference actions"
                trigger={
                  <button
                    type="button"
                    aria-label="Conference actions"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    className={ICON_BUTTON}
                  >
                    <MoreHorizontal
                      className="size-3.5"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                  </button>
                }
              >
                <FloatMenuItem
                  label="Merge into…"
                  description="Moves every team, then removes this one."
                  icon={
                    <Merge
                      className={MENU_ROW_ICON}
                      strokeWidth={1.5}
                      aria-hidden
                    />
                  }
                  onSelect={() => {
                    setMenuOpen(false);
                    setMerging(true);
                  }}
                />
                {row.teams === 0 ? (
                  <>
                    <FloatMenuDivider />
                    <FloatMenuItem
                      label="Delete"
                      icon={
                        <Trash2
                          className={cn(MENU_ROW_ICON, DESTRUCTIVE_ICON)}
                          strokeWidth={1.5}
                          aria-hidden
                        />
                      }
                      className={DESTRUCTIVE_ROW}
                      onSelect={() => {
                        setMenuOpen(false);
                        setDeleteError(null);
                        setDeleting(true);
                      }}
                    />
                  </>
                ) : (
                  // Draws its own hairline above.
                  <FloatMenuNote>
                    Delete is available once no team points here — merge it into
                    another conference first.
                  </FloatMenuNote>
                )}
              </FloatMenu>
            </span>
          </ChromeTooltip>
        }
        footer={
          <>
            {error && (
              <p
                role="alert"
                className="text-[12px] leading-[18px] text-[var(--danger)]"
              >
                {error}
              </p>
            )}
            <button
              type="button"
              disabled={!dirty || pending}
              onClick={save}
              className={cn(advButton("primary", "md"), "w-full")}
            >
              {pending ? "Saving…" : "Save changes"}
            </button>
          </>
        }
      >
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-[22px] pt-6 pb-[22px]">
          {/* Identity */}
          <div className="flex items-center gap-3.5">
            <ConferenceMark
              name={row.name}
              shortName={row.shortName}
              size={40}
            />
            <div className="flex min-w-0 flex-col gap-[3px]">
              {/* Wraps, never truncates — the Peek Drawer's own rule. */}
              <h2 className="text-title-lg [text-wrap:balance] break-words text-[var(--ink-900)]">
                {row.name}
              </h2>
              {meta && (
                <p className="text-[11px] leading-[1.5] text-[var(--ink-500)]">
                  {meta}
                </p>
              )}
            </div>
          </div>

          {/* Fields — the underline vocabulary; the rule going 2px blue is the
            focus mark, so each control opts out of the ring. */}
          <form
            className="grid grid-cols-2 gap-x-4 gap-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <Field
              label="Name"
              htmlFor="conference-name"
              className="col-span-2"
            >
              <input
                id="conference-name"
                type="text"
                value={draft.name ?? ""}
                autoComplete="off"
                data-focus-ring="none"
                onChange={(event) => set({ name: event.target.value })}
                className={cn(advField("underline"), "w-full outline-none")}
              />
            </Field>

            <Field label="Short name" htmlFor="conference-short-name">
              <input
                id="conference-short-name"
                type="text"
                value={draft.shortName ?? ""}
                placeholder="IVY"
                autoComplete="off"
                spellCheck={false}
                data-focus-ring="none"
                onChange={(event) => set({ shortName: event.target.value })}
                className={cn(advField("underline"), "w-full outline-none")}
              />
            </Field>

            <Field label="Division">
              <MenuSelect<DivisionValue>
                label="Division"
                variant="underline"
                value={
                  DIVISION_VALUES.find((value) => value === draft.division) ??
                  undefined
                }
                placeholder="Not set"
                options={DIVISIONS}
                note="A conference sits inside one division."
                onChange={(division) => set({ division })}
              />
            </Field>

            <Field
              label="Website"
              htmlFor="conference-website"
              className="col-span-2"
            >
              <div className="relative">
                <input
                  id="conference-website"
                  type="text"
                  value={draft.website ?? ""}
                  placeholder="ivyleague.com"
                  autoComplete="off"
                  spellCheck={false}
                  data-focus-ring="none"
                  onChange={(event) => set({ website: event.target.value })}
                  className={cn(
                    advField("underline"),
                    "w-full outline-none",
                    savedWebsite && "pr-7",
                  )}
                />
                {savedWebsite && (
                  <ChromeTooltip label="Open website">
                    <a
                      href={websiteHref(savedWebsite)}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label="Open website"
                      className="absolute top-1/2 right-0 flex size-6 -translate-y-1/2 items-center justify-center rounded-[var(--radius-element)] text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
                    >
                      <ArrowUpRight
                        className="size-3.5"
                        strokeWidth={1.75}
                        aria-hidden
                      />
                    </a>
                  </ChromeTooltip>
                )}
              </div>
            </Field>
          </form>

          {/* Teams */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between pb-1.5">
              <span className="eyebrow-sm">
                Teams{" "}
                <span
                  className="tabular-nums"
                  style={{ color: "var(--ink-500)", fontWeight: 400 }}
                >
                  {row.teams}
                </span>
              </span>
              <AddTeamPopover
                conference={row}
                onAdded={(movedFrom) => {
                  forgetConferenceTeams(row.id);
                  if (movedFrom) forgetConferenceTeams(movedFrom);
                  onChanged();
                }}
              />
            </div>

            <TeamsList
              state={teams}
              showAll={showAll}
              onShowAll={() => setShowAll(true)}
            />
          </div>
        </div>
      </PeekDrawerFrame>

      <MergeConferenceDialog
        open={merging}
        onOpenChange={setMerging}
        source={row}
        conferences={conferences}
        syncUrl={syncUrl}
      />

      <ConfirmDialog
        open={deleting}
        onOpenChange={(next) => {
          if (deletePending) return;
          setDeleting(next);
          if (!next) setDeleteError(null);
        }}
        tone="danger"
        title={`Delete ${row.name}?`}
        description="It leaves the directory. No team points here, so nothing else changes."
        confirmLabel="Delete conference"
        pendingLabel="Deleting…"
        pending={deletePending}
        error={deleteError}
        onConfirm={remove}
      />
    </>
  );
}

/** Caption over control — the underline form's one row. */
function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string;
  /** Omitted for a control that names itself (`MenuSelect`'s `aria-label`). */
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-[11px] text-[var(--ink-600)]">
          {label}
        </label>
      ) : (
        <span className="text-[11px] text-[var(--ink-600)]">{label}</span>
      )}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Teams list
// ---------------------------------------------------------------------------

/** `programs.status` → the row's right-hand word. */
function TeamStatus({ status }: { status: string }) {
  if (status === "active") return <PilotPill />;
  const word =
    status === "claim_pending"
      ? "Claim pending"
      : status === "suspended"
        ? "Suspended"
        : "Unclaimed";
  return (
    <span className="shrink-0 text-[11px] whitespace-nowrap text-[var(--ink-500)]">
      {word}
    </span>
  );
}

function TeamsList({
  state,
  showAll,
  onShowAll,
}: {
  state: TeamsState;
  showAll: boolean;
  onShowAll: () => void;
}) {
  if (state.status === "loading") {
    return (
      <p className="py-2 text-[12px] text-[var(--ink-500)]" aria-live="polite">
        Loading teams…
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <p role="alert" className="py-2 text-[12px] text-[var(--danger)]">
        {state.error}
      </p>
    );
  }

  if (state.teams.length === 0) {
    return (
      <p className="py-2 text-[12px] text-[var(--ink-500)]">No teams yet.</p>
    );
  }

  const visible = showAll ? state.teams : state.teams.slice(0, TEAMS_PREVIEW);
  const hidden = state.teams.length - visible.length;

  return (
    <>
      <ul className="flex flex-col">
        {visible.map((team) => (
          <li key={team.id} className="flex min-h-10 items-center gap-3 py-1.5">
            <ProgramCrest name={team.name} crestUrl={team.crestUrl} size={26} />
            <Link
              href={`/admin/teams/${team.id}`}
              className="min-w-0 flex-1 truncate rounded-[4px] text-[13px] text-[var(--ink-900)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--ink-600)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
            >
              {team.name}
            </Link>
            <TeamStatus status={team.status} />
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <p className="flex items-center gap-2 pt-2 text-[12px] whitespace-nowrap text-[var(--ink-600)]">
          <span className="tabular-nums">{hidden} more</span>
          <span className="text-[var(--ink-300)]" aria-hidden>
            ·
          </span>
          <button
            type="button"
            onClick={onShowAll}
            className="cursor-pointer rounded-[4px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
          >
            Show all
          </button>
        </p>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Add a team
// ---------------------------------------------------------------------------

/**
 * "Add a team" — the admin header search's input and debounce, answering with
 * three kinds of row:
 *
 *   no conference         added at once; nothing is lost
 *   another conference    confirmed first — the team leaves that one
 *   this conference       "Already here", nothing to press
 *
 * Replies are stamped with the query that asked for them, as in
 * `admin-search.tsx`, so a slow early reply never repaints a later answer.
 */
function AddTeamPopover({
  conference,
  onAdded,
}: {
  conference: AdminConferenceRow;
  /** `movedFrom` is the conference the team left, when it had one. */
  onAdded: (movedFrom: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [answered, setAnswered] = useState<{
    query: string;
    rows: AdminSearchResult[];
  }>({ query: "", rows: [] });
  const [moving, setMoving] = useState<AdminSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const latest = useRef("");

  useEffect(() => {
    const query = term.trim();
    latest.current = query;
    if (query.length === 0) return;

    const timer = setTimeout(() => {
      void adminSearchTeams(query).then((rows) => {
        if (latest.current !== query) return;
        setAnswered({ query, rows });
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [term]);

  const reset = () => {
    setTerm("");
    setAnswered({ query: "", rows: [] });
    setError(null);
  };

  const changeOpen = (next: boolean) => {
    if (!next && pending) return;
    setOpen(next);
    if (!next) reset();
  };

  const add = (team: AdminSearchResult, done?: () => void) => {
    start(async () => {
      setError(null);
      const result = await addTeamToConference(team.id, conference.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      done?.();
      setOpen(false);
      reset();
      onAdded(team.conferenceId);
    });
  };

  const query = term.trim();
  const loading = answered.query !== query;
  const results = loading ? [] : answered.rows;

  return (
    <>
      <Popover open={open} onOpenChange={changeOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-expanded={open}
            className="cursor-pointer rounded-[4px] text-[12px] font-medium whitespace-nowrap text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
          >
            Add a team
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="end"
          sideOffset={6}
          collisionPadding={12}
          aria-label={`Add a team to ${conference.name}`}
          className="w-[320px] p-1.5"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <input
            ref={inputRef}
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search teams"
            aria-label="Search teams"
            className="h-8 w-full rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-2.5 text-[12px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-400)]"
          />

          {query.length > 0 && (
            <div className="mt-1 flex flex-col">
              {results.length === 0 ? (
                <p className="px-2.5 py-3 text-[12px] text-[var(--ink-500)]">
                  {loading ? "Searching…" : `No team matches “${query}”`}
                </p>
              ) : (
                results.map((result) =>
                  result.conferenceId === conference.id ? (
                    <div
                      key={result.id}
                      className="flex items-center gap-2 rounded-[7px] px-2.5 py-[7px]"
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[12px] text-[var(--ink-600)]">
                          {result.name}
                        </span>
                        {result.subtitle ? (
                          <span className="mt-0.5 truncate text-[11px] text-[var(--ink-500)]">
                            {result.subtitle}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-[11px] text-[var(--ink-500)]">
                        Already here
                      </span>
                    </div>
                  ) : (
                    <button
                      key={result.id}
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        if (result.conferenceId) {
                          setError(null);
                          setOpen(false);
                          setMoving(result);
                        } else {
                          add(result);
                        }
                      }}
                      className="flex cursor-pointer flex-col rounded-[7px] px-2.5 py-[7px] text-left transition-colors duration-100 hover:bg-[var(--surface-subtle)] focus-visible:bg-[var(--surface-subtle)] focus-visible:outline-none disabled:cursor-default disabled:opacity-60"
                    >
                      <span className="truncate text-[12px] text-[var(--ink-900)]">
                        {result.name}
                      </span>
                      {result.subtitle ? (
                        <span className="mt-0.5 truncate text-[11px] text-[var(--ink-500)]">
                          {result.subtitle}
                        </span>
                      ) : null}
                    </button>
                  ),
                )
              )}
            </div>
          )}

          {pending && !moving && (
            <p className="px-2.5 pt-1 pb-1.5 text-[11px] text-[var(--ink-500)]">
              Adding…
            </p>
          )}
          {error && !moving && (
            <p
              role="alert"
              className="px-2.5 pt-1 pb-1.5 text-[11px] leading-[1.5] text-[var(--danger)]"
            >
              {error}
            </p>
          )}
        </PopoverContent>
      </Popover>

      <ConfirmDialog
        open={moving !== null}
        onOpenChange={(next) => {
          if (next || pending) return;
          setMoving(null);
          setError(null);
          reset();
        }}
        title={
          moving ? `Move ${moving.name} to ${conference.name}?` : "Move team?"
        }
        description={
          moving?.conferenceLabel
            ? `It leaves ${moving.conferenceLabel} and joins ${conference.label}.`
            : `It joins ${conference.label}.`
        }
        confirmLabel="Move team"
        pendingLabel="Moving…"
        pending={pending}
        error={moving ? error : null}
        onConfirm={() => {
          const team = moving;
          if (!team) return;
          add(team, () => setMoving(null));
        }}
      />
    </>
  );
}
