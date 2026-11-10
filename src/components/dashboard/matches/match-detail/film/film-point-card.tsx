"use client";

import { memo, useMemo, useState } from "react";
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Link2,
  MoreHorizontal,
  Plus,
} from "lucide-react";

import type { MatchPoint } from "@/lib/data/match-points-server";
import type { NoteAuthor, PointNote, PointTag } from "@/lib/data/point-notes";
import {
  NOTE_MAX_LENGTH,
  noteAge,
  normalizeNoteBody,
  tagSuggestions,
  TAG_MAX_LENGTH,
} from "@/lib/data/point-notes-logic";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";
import { WorkspaceMark } from "@/components/dashboard/workspace-mark";
import { useOptionalWorkspace } from "@/components/dashboard/workspace-provider";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import {
  FloatMenu,
  FloatMenuDivider,
  FloatMenuItem,
  FloatMenuNote,
} from "@/components/ui/float-menu";
import { PersonAvatar } from "@/components/ui/person-avatar";
import {
  PendingBar,
  PendingRegion,
} from "@/components/dashboard/loading/pending";
import { pointResultLabel } from "@/components/dashboard/matches/match-detail/match-filters/model";
import { useMatchFilters } from "@/components/dashboard/matches/match-detail/match-filters/provider";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";

import { lastNameOf } from "./film-list-filters";
import { readPointScore, UNREAD_SCORE, youFirstScore } from "./film-score";
import { rallyNumbering } from "./film-shots";

/**
 * "This point" — the card under the report player (canvas "W-E chat · tags +
 * icon row", Page 1b frame). It replaced `FilmThisPoint`'s shot table when the
 * shots moved into the point list's well.
 *
 * Top to bottom: an icon row (bookmark, copy link, the point stepper), the
 * point in one line (winner mark, how it ended, score before · set · game ·
 * shots · seconds), the point's tags as grey pills, a short thread of notes,
 * and a reply field.
 *
 * It always shows the PLAYING point, like the scoreboard and the transport
 * counter beside it (T22) — only the list keeps follow-or-hold.
 *
 * Attribution (guardrails §4): who won comes from `useMatchSides()` against
 * `wonByPlayer1`, never from player1/player2 read off the point.
 *
 * Read-only reports (share page, sample match): the film tab passes no
 * `notes`, no `tags` and no `onToggleSaved`, and the card draws none of them —
 * no disabled controls telling a reader that this page writes.
 */

export interface NotesThread {
  status: "loading" | "ready" | "error";
  /** This point's notes, oldest first. */
  notes: PointNote[];
  authors: Map<string, NoteAuthor>;
  /** The signed-in viewer, to mark "You" and offer Delete on their own notes. */
  viewerId: string | null;
  onSend: (body: string) => Promise<boolean>;
  onDelete: (noteId: string) => void;
  onRetry: () => void;
}

export interface PointTagsControl {
  vocabulary: PointTag[];
  applied: PointTag[];
  onAdd: (tag: PointTag) => void;
  onCreate: (name: string) => void;
  onRemove: (tag: PointTag) => void;
}

/** Notes shown before "Show N earlier" folds the rest away. */
const THREAD_TAIL = 3;

const ICON_BUTTON =
  "inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--nav-fg)] transition-colors duration-200 hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40 touch:hit-area";

/** The shipped grey pill (`lifecycle-chips.tsx`): 26px, hairline at rest. */
const PILL =
  "inline-flex h-[26px] shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-pill)] px-[11px] text-[12px] transition-colors duration-200 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none";

export const FilmPointCard = memo(function FilmPointCard({
  point,
  position,
  matchId,
  onStep,
  onToggleSaved,
  canCopyLink = false,
  onGoToFirst,
  tags,
  notes,
}: {
  /** The point the playhead is inside, or null before the first serve. */
  point: MatchPoint | null;
  /** 1-based place of the point in the applied cut, and the cut's size. */
  position: { index: number; total: number } | null;
  matchId: string;
  /** Walk the applied cut — the same step the transport takes. */
  onStep: (direction: -1 | 1) => void;
  /** Absent on a read-only report: no bookmark control is drawn. */
  onToggleSaved?: () => void;
  /** A link into the dashboard report; off on read-only reports. */
  canCopyLink?: boolean;
  /** Seek to the applied cut's first point; absent when the cut holds none. */
  onGoToFirst?: () => void;
  tags?: PointTagsControl;
  notes?: NotesThread;
}) {
  return (
    <section
      aria-label="This point"
      // Which point the card is on, in the DOM: the specs assert the card
      // follows the PLAYING point while the list is held (T22).
      data-point-id={point?.id}
      // No `min-h-0`: the card stops shrinking at its own content — the
      // pinned rows plus the notes list's floor (see `Thread`) — and the
      // pane scrolls from there, rather than the thread being squeezed away
      // when the filter strip or a wrapped tag row takes the height.
      className="surface-card flex flex-1 flex-col"
      style={{ padding: "10px 20px 14px" }}
    >
      <div className="flex h-7 shrink-0 items-center gap-1">
        <span className="eyebrow">This point</span>
        <div className="flex-1" />
        {point && onToggleSaved && (
          <ChromeTooltip
            label={point.saved ? "Remove bookmark" : "Bookmark"}
            shortcut="S"
          >
            <button
              type="button"
              aria-label={
                point.saved ? "Remove bookmark" : "Bookmark this point"
              }
              aria-pressed={point.saved}
              onClick={onToggleSaved}
              className={ICON_BUTTON}
              style={point.saved ? { color: "var(--blue)" } : undefined}
            >
              <Bookmark
                className="size-3.5"
                strokeWidth={1.5}
                fill={point.saved ? "currentColor" : "none"}
              />
            </button>
          </ChromeTooltip>
        )}
        {point && canCopyLink && (
          <CopyPointLink matchId={matchId} pointId={point.id} />
        )}
        {point && (onToggleSaved || canCopyLink) && (
          <span
            aria-hidden="true"
            className="mx-1 h-3.5 w-px bg-[var(--ink-200)]"
          />
        )}
        <StepButton direction={-1} disabled={!position} onStep={onStep} />
        <span
          className="mono tabular min-w-10 text-center text-[10px] whitespace-nowrap"
          style={{ color: "var(--ink-500)" }}
        >
          {position ? `${position.index} / ${position.total}` : "– / –"}
        </span>
        <StepButton direction={1} disabled={!position} onStep={onStep} />
      </div>

      {!point ? (
        <NoPointYet onStart={onGoToFirst} />
      ) : (
        <>
          <PointSummary point={point} />
          {tags && <TagRow tags={tags} />}
          {notes && <Thread notes={notes} />}
          {notes && <Composer key={point.id} onSend={notes.onSend} />}
        </>
      )}
    </section>
  );
});

/**
 * Before the film reaches a point (the opening seconds, or a seek into dead
 * time): the card's own anatomy, empty — the winner's 30px mark slot as a
 * dashed outline, a title naming the state and one line saying what lands
 * here — plus the one way to make it appear (empty-and-loading.md, honest
 * zero). No action when the cut holds no point to start from.
 */
function NoPointYet({ onStart }: { onStart?: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mt-2.5 flex shrink-0 items-center gap-3">
        <span
          aria-hidden="true"
          className="size-[30px] shrink-0 rounded-[var(--radius-button)] border border-dashed border-[var(--border-field)]"
        />
        <span className="flex min-w-0 flex-col gap-px">
          <span className="text-[13px] font-medium text-[var(--ink-900)]">
            No point playing
          </span>
          <span className="text-micro">
            Its result, tags and notes show here once a point plays.
          </span>
        </span>
      </div>
      {onStart && (
        <button
          type="button"
          onClick={onStart}
          className="mt-3 w-fit cursor-pointer text-[11px] font-medium text-[var(--blue)] transition-colors duration-200 hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
        >
          Go to the first point
        </button>
      )}
    </div>
  );
}

/**
 * A point with no notes: centred in the thread's own space, a statement and
 * one line on what a note is for, and the one way to add one — which puts
 * the caret in the reply field below rather than opening a second composer.
 */
function EmptyThread() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-6 py-4 text-center">
      <span className="text-[13px] text-[var(--ink-900)]">No notes yet</span>
      <span className="max-w-[40ch] text-[11px] leading-[1.55] text-[var(--ink-500)]">
        Write down what you saw on this point — it stays with the point for when
        you watch it again.
      </span>
      <button
        type="button"
        onClick={() => document.getElementById(COMPOSER_ID)?.focus()}
        className="mt-[3px] w-fit cursor-pointer text-[11px] font-medium text-[var(--blue)] transition-colors duration-200 hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
      >
        Add the first note
      </button>
    </div>
  );
}

/** The reply field's id, so the empty thread's action can put the caret in it. */
const COMPOSER_ID = "film-point-note-input";

function StepButton({
  direction,
  disabled,
  onStep,
}: {
  direction: -1 | 1;
  disabled: boolean;
  onStep: (direction: -1 | 1) => void;
}) {
  const label = direction === -1 ? "Previous point" : "Next point";
  const Icon = direction === -1 ? ChevronLeft : ChevronRight;
  return (
    <ChromeTooltip label={label} shortcut={direction === -1 ? "←" : "→"}>
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={() => onStep(direction)}
        className={ICON_BUTTON}
      >
        <Icon className="size-3.5" strokeWidth={1.5} />
      </button>
    </ChromeTooltip>
  );
}

/** Copies a link that opens this report on this point (`?tab=film&point=`). */
function CopyPointLink({
  matchId,
  pointId,
}: {
  matchId: string;
  pointId: string;
}) {
  const [copied, setCopied] = useState(false);
  // The link opens the dashboard report, so only people who can already see
  // this match follow it. In a team that is the program; in a personal
  // workspace there is no team to name.
  const isTeam = useOptionalWorkspace()?.active?.kind === "team";
  const copy = async () => {
    const url = new URL(
      `/dashboard/matches/${matchId}`,
      window.location.origin,
    );
    url.searchParams.set("tab", "film");
    url.searchParams.set("point", pointId);
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard refused (permissions, insecure context): nothing to show.
    }
  };
  return (
    <ChromeTooltip
      label={
        copied
          ? "Link copied"
          : isTeam
            ? "Copy link for your team"
            : "Copy link to this point"
      }
    >
      <button
        type="button"
        aria-label="Copy link to this point"
        onClick={copy}
        className={ICON_BUTTON}
      >
        <Link2 className="size-3.5" strokeWidth={1.6} />
      </button>
    </ChromeTooltip>
  );
}

function PointSummary({ point }: { point: MatchPoint }) {
  const sides = useMatchSides();
  const { context: filterContext } = useMatchFilters();
  const workspace = useOptionalWorkspace()?.active ?? null;
  const youIsPlayer1 = sides.you.isPlayer1;
  const isYou = point.wonByPlayer1 === youIsPlayer1;
  const winner = isYou ? sides.you : sides.opp;
  const crestUrl = winner.player.crestUrl ?? null;

  const raw = readPointScore(point);
  const score =
    raw === null
      ? UNREAD_SCORE
      : (youFirstScore(raw, point.serverIsPlayer1, youIsPlayer1) ?? raw);
  const shots = useMemo(() => rallyNumbering(point.shots).count, [point]);
  const seconds = point.duration != null ? Math.round(point.duration) : null;
  const line = [
    `${lastNameOf(winner.name)} won`,
    score,
    `Set ${point.setNumber} · Game ${point.gameNumber}`,
    `${shots} ${shots === 1 ? "shot" : "shots"}`,
    seconds != null ? `${seconds}s` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mt-2.5 flex shrink-0 items-center gap-3">
      {(isYou && workspace) || crestUrl ? (
        <WorkspaceMark
          workspace={
            isYou && workspace
              ? workspace
              : { kind: "team", mark: winner.initials, iconUrl: crestUrl }
          }
          className="size-[30px] rounded-[var(--radius-button)] text-[11px] tracking-[0.3px]"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex size-[30px] shrink-0 items-center justify-center rounded-[var(--radius-button)] bg-[var(--surface-subtle)] text-[11px] font-medium tracking-[0.3px] text-[var(--ink-700)]"
        >
          {winner.initials}
        </span>
      )}
      <span className="flex min-w-0 flex-col gap-px">
        <span className="truncate text-[13px] font-medium text-[var(--ink-900)]">
          {pointResultLabel(point, filterContext)}
        </span>
        <span className="text-micro tabular truncate">{line}</span>
      </span>
    </div>
  );
}

function TagRow({ tags }: { tags: PointTagsControl }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const appliedIds = useMemo(
    () => new Set(tags.applied.map((t) => t.id)),
    [tags.applied],
  );
  const { matches, canCreate } = tagSuggestions(
    tags.vocabulary,
    appliedIds,
    query,
  );
  const close = () => {
    setOpen(false);
    setQuery("");
  };

  return (
    <div
      role="group"
      aria-label="Tags"
      className="mt-3 flex shrink-0 flex-wrap gap-1.5"
    >
      {tags.applied.map((tag) => (
        <ChromeTooltip key={tag.id} label={`Remove “${tag.name}”`}>
          <button
            type="button"
            aria-pressed="true"
            onClick={() => tags.onRemove(tag)}
            className={cn(
              PILL,
              "border border-[var(--border-medium)] bg-[var(--surface-subtle)] font-medium text-[var(--ink-900)]",
            )}
          >
            {tag.name}
          </button>
        </ChromeTooltip>
      ))}
      <FloatMenu
        open={open}
        onOpenChange={(next) => (next ? setOpen(true) : close())}
        align="start"
        width={240}
        label="Tag this point"
        trigger={
          <button
            type="button"
            aria-expanded={open}
            className={cn(
              PILL,
              "border border-dashed border-[var(--border-field)] text-[var(--ink-500)] hover:bg-[var(--surface-subtle)]",
            )}
          >
            <Plus className="size-2.5" strokeWidth={2} aria-hidden="true" />
            Tag
          </button>
        }
      >
        <div className="px-1 pb-1">
          <input
            autoFocus
            value={query}
            maxLength={TAG_MAX_LENGTH}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // The menu's own typeahead must not eat the letters.
              e.stopPropagation();
              if (e.key === "Enter") {
                e.preventDefault();
                if (matches[0]) {
                  tags.onAdd(matches[0]);
                  close();
                } else if (canCreate) {
                  tags.onCreate(query);
                  close();
                }
              }
            }}
            placeholder="Find or create a tag"
            aria-label="Find or create a tag"
            className="h-8 w-full rounded-[var(--radius-element)] border border-[var(--border-field)] bg-[var(--surface-card)] px-2.5 text-[12px] text-[var(--ink-900)] outline-none focus:border-[var(--field-ring)] focus:shadow-[var(--focus-ring-field)]"
          />
        </div>
        {matches.slice(0, 8).map((tag) => (
          <FloatMenuItem
            key={tag.id}
            label={tag.name}
            onSelect={() => {
              tags.onAdd(tag);
              close();
            }}
          />
        ))}
        {canCreate && (
          <>
            {matches.length > 0 && <FloatMenuDivider />}
            <FloatMenuItem
              label={`Create “${query.trim()}”`}
              onSelect={() => {
                tags.onCreate(query);
                close();
              }}
            />
          </>
        )}
        {matches.length === 0 && !canCreate && (
          <FloatMenuNote>
            {tags.vocabulary.length === 0
              ? "Type a name to make your first tag."
              : "Every tag is already on this point."}
          </FloatMenuNote>
        )}
      </FloatMenu>
    </div>
  );
}

function Thread({ notes }: { notes: NotesThread }) {
  const [expanded, setExpanded] = useState(false);
  const hidden = expanded ? 0 : Math.max(0, notes.notes.length - THREAD_TAIL);
  const shown = notes.notes.slice(hidden);

  return (
    <div className="mt-4 flex flex-1 flex-col border-t border-[var(--border-hairline)] pt-3">
      {notes.status === "loading" ? (
        <PendingRegion label="notes" innerClassName="flex flex-col gap-3 py-1">
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-2.5">
              <PendingBar className="size-6 shrink-0 rounded-full" />
              <span className="flex flex-1 flex-col gap-1.5 pt-0.5">
                <PendingBar className="h-2.5 w-24" />
                <PendingBar className="h-2.5 w-3/4" />
              </span>
            </div>
          ))}
        </PendingRegion>
      ) : notes.status === "error" ? (
        <p className="text-micro flex items-center gap-2 py-1">
          Notes didn’t load.
          <button
            type="button"
            onClick={notes.onRetry}
            className="cursor-pointer text-[11px] font-medium text-[var(--blue)] hover:text-[var(--blue-hover)]"
          >
            Try again
          </button>
        </p>
      ) : notes.notes.length === 0 ? (
        <EmptyThread />
      ) : (
        // Side by side the list is out of flow inside a box with a floor of
        // about a note and a half: the box takes whatever height the card
        // has left and the notes scroll within it, but it never drops under
        // the floor. Stacked, the card is content-height and the notes sit
        // in flow, all of them showing.
        <div className="relative flex-1 @min-[720px]:min-h-20">
          <div
            data-notes-list
            className="flex flex-col gap-3.5 @min-[720px]:absolute @min-[720px]:inset-0 @min-[720px]:overflow-y-auto"
          >
            {hidden > 0 && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="w-fit cursor-pointer text-[11px] font-medium text-[var(--blue)] hover:text-[var(--blue-hover)]"
              >
                Show {hidden} earlier {hidden === 1 ? "note" : "notes"}
              </button>
            )}
            {shown.map((note) => (
              <NoteRow
                key={note.id}
                note={note}
                author={notes.authors.get(note.authorId) ?? null}
                mine={note.authorId === notes.viewerId}
                onDelete={() => notes.onDelete(note.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NoteRow({
  note,
  author,
  mine,
  onDelete,
}: {
  note: PointNote;
  author: NoteAuthor | null;
  mine: boolean;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const name = mine ? "You" : (author?.name ?? "Teammate");
  return (
    <div className="group/note flex gap-2.5">
      <PersonAvatar
        initials={author?.initials ?? "?"}
        photoUrl={author?.avatarUrl ?? null}
        className="size-6 text-[9px]"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline gap-2">
          <span className="text-[12px] font-medium text-[var(--ink-900)]">
            {name}
          </span>
          <span className="text-micro">
            {noteAge(note.createdAt)}
            {note.editedAt ? " · Edited" : ""}
          </span>
        </div>
        <p className="text-[12px] leading-[1.5] break-words whitespace-pre-wrap text-[var(--ink-700)]">
          {note.body}
        </p>
      </div>
      {mine && (
        <FloatMenu
          open={menuOpen}
          onOpenChange={setMenuOpen}
          width={160}
          label="Note actions"
          trigger={
            <button
              type="button"
              aria-label="Note actions"
              aria-expanded={menuOpen}
              className={cn(
                ICON_BUTTON,
                "opacity-0 group-hover/note:opacity-100 focus-visible:opacity-100 touch:opacity-100",
                menuOpen && "opacity-100",
              )}
            >
              <MoreHorizontal className="size-3.5" strokeWidth={1.5} />
            </button>
          }
        >
          <FloatMenuItem label="Delete note" onSelect={onDelete} />
        </FloatMenu>
      )}
    </div>
  );
}

function Composer({ onSend }: { onSend: (body: string) => Promise<boolean> }) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const ready = normalizeNoteBody(draft) !== null && !sending;

  const send = async () => {
    if (!ready) return;
    setSending(true);
    const ok = await onSend(draft);
    setSending(false);
    if (ok) setDraft("");
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
      className="mt-3 flex h-10 shrink-0 items-center gap-2 rounded-[var(--radius-element)] border border-[var(--border-field)] bg-[var(--surface-card)] pr-1.5 pl-3 transition-[border-color,box-shadow] duration-200 focus-within:border-[var(--field-ring)] focus-within:shadow-[var(--focus-ring-field)]"
    >
      <input
        id={COMPOSER_ID}
        // The bordered form is the field and draws the ring; without this the
        // global field ring draws a second one inside it.
        data-focus-ring="none"
        value={draft}
        maxLength={NOTE_MAX_LENGTH}
        onChange={(e) => setDraft(e.target.value)}
        // Space and the arrows drive the player everywhere else on the tab;
        // inside the field they are text.
        onKeyDown={(e) => e.stopPropagation()}
        placeholder="Reply…"
        aria-label="Add a note on this point"
        className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-500)]"
      />
      <button
        type="submit"
        disabled={!ready}
        className={cn(advButton("primary", "sm"), "h-7")}
      >
        Send
      </button>
    </form>
  );
}
