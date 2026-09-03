"use client";

/**
 * DetailsStepContent — the last step: score and context.
 *
 * Four things, top to bottom, in the step-1 register:
 *
 *   The schedule's OFFER — in a team workspace the file's date may match an
 *   open line for this player within two days, so the schedule offers, in the
 *   note-strip register: "Looks like #2 Singles › Marcus Reid vs Jordan
 *   Alvarez", Attach and a quiet decline. Accept and six fields fill; Detach
 *   empties them again and touches nothing typed by hand.
 *
 *   The SCORE — 40px cells with the set numbers as eyebrows, the format read
 *   back at the right as a fact, no set control: a dashed column after the
 *   last set adds one, clearing a set's two cells removes it, a game digit
 *   advances focus, and tiebreak cells appear on their own.
 *
 *   The PLAYERS — who played and which way. The opponent is named here and
 *   nowhere else: an underline in the 200px column with everyone you've played
 *   offered as you type (or, in a dual, the opponent program's roster), then a
 *   read-back row like the player's own — name and provenance, hand · backhand,
 *   Change. Change and Add turn the two facts into tappable words in the same
 *   sentence; nothing grows.
 *
 *   The CONTEXT — a three-column grid on the underline vocabulary: Event (with
 *   your own past events offered as you type), Date (already taken from the
 *   file and labelled as such), Court, Format, Scoring, Lets, and Duration
 *   where an export measured it. Required fields carry the form's red
 *   asterisk; an unmarked label means optional.
 *
 * Design: Upload Wizard v5 — 3d · 5c · 6b · 7a · 7c · 11a · 11b · 11d.
 *
 * ── Attribution ─────────────────────────────────────────────────────────────
 * An opponent picked from a roster carries `opponentPlayerId` — the id
 * travels with the CLICK, never the text (`docs/ui-revamp-guardrails.md`).
 * The player's own name is never re-asked here: it was settled on step 1.
 */

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  MapPin,
  Plus,
  XCircle,
} from "lucide-react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { StatePill } from "@/components/ui/state-pill";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/data/match-utils";
import { normalizedPersonName } from "@/lib/data/person-name";
import { siteLabel } from "@/lib/schedule/format";
import { saveOpponentPlayer } from "@/lib/schedule/actions";
import {
  findLineOffers,
  opponentRosterForLine,
  opponentsPlayed,
  playerStyleFromMatches,
  saveMyStyle,
  yourEvents,
  type OpponentPlayed,
  type OpponentRosterRow,
  type YourEvent,
} from "@/lib/wizard/actions";
import type { EventPreset, FormData, LineOffer, ValueSource } from "./types";
import {
  floatMenuCls,
  floatMenuDividerCls,
  floatMenuLabelCls,
  floatMenuRowCls,
  focusRingCls,
  noteStripCls,
} from "./styles";
import { formatHoursMinutes, setHasData } from "./utils";

export interface DetailsStepContentProps {
  formData: FormData;
  onInputChange: (
    field: keyof FormData,
    value: string | number | boolean | null | undefined
  ) => void;
  onScoreChange: (player: "player" | "opponent", index: number, value: string) => void;
  onTiebreakChange: (player: "player" | "opponent", index: number, value: string) => void;
  isProcessingProvider: boolean;
  workspaceKind: "personal" | "team";
  /** Whose match this is — settled on step 1, read back here. */
  subject: { name: string; isSelf: boolean; playerId: string | null; userId: string | null };
  /** The event line this flow started from, when it did. */
  preset: EventPreset | null;
  /** The schedule offer accepted with Attach, when one was. */
  attachedLine: LineOffer | null;
  onAttach: (offer: LineOffer) => void;
  onDetach: () => void;
  /** Whether the export was read — decides the "from the export" tags. */
  exportRead: boolean;
  /** Why the last Save match failed, if it did. */
  error: string | null;
}

type Hand = "right" | "left";
type Backhand = "one-handed" | "two-handed";

const HAND_LABEL: Record<Hand, string> = { right: "Right-handed", left: "Left-handed" };
const BACKHAND_LABEL: Record<Backhand, string> = {
  "two-handed": "Two-handed backhand",
  "one-handed": "One-handed backhand",
};

const COURT_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "Outdoor Hard Court", label: "Hard" },
  { value: "Indoor Hard Court", label: "Hard · indoor" },
  { value: "Clay Court", label: "Clay" },
  { value: "Grass Court", label: "Grass" },
];

const FORMAT_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "1", label: "Best of 1" },
  { value: "3", label: "Best of 3" },
  { value: "5", label: "Best of 5" },
];

const ROUND_OPTIONS: readonly { value: string; label: string; short: string }[] = [
  { value: "Round of 128", label: "Round of 128", short: "R128" },
  { value: "Round of 64", label: "Round of 64", short: "R64" },
  { value: "Round of 32", label: "Round of 32", short: "R32" },
  { value: "Round of 16", label: "Round of 16", short: "R16" },
  { value: "Quarterfinals", label: "Quarterfinals", short: "QF" },
  { value: "Semifinals", label: "Semifinals", short: "SF" },
  { value: "Finals", label: "Finals", short: "F" },
];

/** A set whose games say a tiebreak was played — 7-6, or 1-0 for a match tiebreak. */
function isTiebreakSet(p: number | null, o: number | null): boolean {
  if (p === null || o === null) return false;
  const high = Math.max(p, o);
  const low = Math.min(p, o);
  return (high >= 7 && high - low === 1) || (high === 1 && low === 0);
}

/** "Sep 5, 2026" or "Sep 5, 2026 · 2:04 PM" from the form's date and time. */
function formatDateRead(date: string, time: string): string {
  if (!date) return "";
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return date;
  const day = new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  if (!time) return day;
  const [hh, mm] = time.split(":").map(Number);
  if (!Number.isFinite(hh)) return day;
  const clock = new Date(y, m - 1, d, hh, mm || 0).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${day} · ${clock}`;
}

/** "Sat Sep 5" for the offer strip. */
function formatDayShort(date: string): string {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** "Aug 22" for a history row. */
function formatMonthDay(date: string): string {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** The tournament mark from the design's assets, inline so it takes the ink colour. */
function TournamentMark({ className }: { className?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true" className={className}>
      <path
        d="M1.875 1.875H5V5.625H1.875M5 3.75H9.375V11.25H5M9.375 7.5H13.75M1.875 9.375H5V13.125H1.875"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Required() {
  return (
    <span aria-label="Required" className="text-[12px] leading-none text-[var(--error)]">
      *
    </span>
  );
}

/** A section's eyebrow, its asterisk and its one-line micro. */
function SectionHead({
  label,
  required = false,
  micro,
}: {
  label: string;
  required?: boolean;
  micro: string;
}) {
  return (
    <div className="flex flex-col gap-[5px]">
      <span className="inline-flex items-center gap-1">
        <span className="eyebrow">{label}</span>
        {required && <Required />}
      </span>
      <span className="text-micro">{micro}</span>
    </div>
  );
}

/** The 22px avatar a menu row carries. */
function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[10px] font-medium text-[var(--ink-700)]"
    >
      {getInitials(name)}
    </span>
  );
}

/** The dashed ring a "new" row wears — a place waiting for something real. */
function NewRing() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-full border border-dashed border-[var(--ink-300)]"
    >
      <Plus className="size-[11px] text-[var(--ink-500)]" strokeWidth={1.5} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// The underline cell vocabulary

/** Eyebrow over a 13px value on a hairline — the Context grid's cell. */
function Cell({
  label,
  required = false,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span className="inline-flex items-center gap-1">
        <span className="eyebrow">{label}</span>
        {required && <Required />}
      </span>
      {children}
    </div>
  );
}

const UNDERLINE_CLS =
  "flex min-h-[34px] w-full items-center gap-2 border-b pb-2 pt-1.5 text-left text-[13px] transition-[border-color] duration-[var(--duration-hover)]";

/** A cell whose value is chosen from a short list. */
function SelectCell<T extends string | boolean>({
  label,
  required,
  placeholder,
  value,
  options,
  onChange,
  read,
  mono = false,
}: {
  label: string;
  required?: boolean;
  placeholder: string;
  value: T | undefined;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  /** Override for the read-back, e.g. "Hard · away". */
  read?: string;
  mono?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <Cell label={label} required={required}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              UNDERLINE_CLS,
              "cursor-pointer",
              open ? "border-b-2 border-[var(--blue)] pb-[7px]" : "border-[var(--border-hairline)]",
              focusRingCls
            )}
          >
            <span
              className={cn(
                "min-w-0 flex-1 truncate",
                mono && "mono",
                current ? "text-[var(--ink-900)]" : "text-[var(--ink-400)]"
              )}
            >
              {read ?? current?.label ?? placeholder}
            </span>
            <ChevronDown className="size-[13px] shrink-0 text-[var(--ink-400)]" strokeWidth={1.5} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className={cn(floatMenuCls, "w-[var(--radix-popover-trigger-width)] min-w-[180px]")}
        >
          {options.map((option) => {
            const isCurrent = option.value === value;
            return (
              <button
                key={String(option.value)}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cn(floatMenuRowCls, "h-[34px]", isCurrent && "bg-[var(--surface-subtle)]")}
              >
                <span
                  className={cn(
                    "flex-1 text-[12px] text-[var(--ink-900)]",
                    isCurrent ? "font-medium" : "font-normal"
                  )}
                >
                  {option.label}
                </span>
                {isCurrent ? (
                  <Check className="size-[13px] text-[var(--blue)]" strokeWidth={1.5} />
                ) : (
                  <span className="w-[13px]" />
                )}
              </button>
            );
          })}
        </PopoverContent>
      </Popover>
    </Cell>
  );
}

/** A read-back cell: a value nobody edits here, with where it came from. */
function ReadCell({
  label,
  required,
  value,
  placeholder,
  tag,
  mono = false,
}: {
  label: string;
  required?: boolean;
  value: string;
  placeholder?: string;
  tag?: string;
  mono?: boolean;
}) {
  return (
    <Cell label={label} required={required}>
      <div className={cn(UNDERLINE_CLS, "border-[var(--border-hairline)]")}>
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            mono && "mono tabular text-[12px]",
            value ? "text-[var(--ink-900)]" : "text-[var(--ink-400)]"
          )}
        >
          {value || placeholder}
        </span>
        {tag && <span className="text-micro shrink-0 whitespace-nowrap">{tag}</span>}
      </div>
    </Cell>
  );
}

/** The date, read back in mono with its provenance; a popover edits it. */
function DateCell({
  date,
  time,
  tag,
  onChange,
}: {
  date: string;
  time: string;
  tag?: string;
  onChange: (date: string, time: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const inputCls = `h-8 w-full rounded-[var(--radius-button)] border border-[var(--border-field)] bg-white px-2 text-[13px] text-[var(--ink-900)] outline-none tabular-nums ${focusRingCls}`;
  return (
    <Cell label="Date" required>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              UNDERLINE_CLS,
              "cursor-pointer",
              open ? "border-b-2 border-[var(--blue)] pb-[7px]" : "border-[var(--border-hairline)]",
              focusRingCls
            )}
          >
            <span
              className={cn(
                "mono tabular min-w-0 flex-1 truncate text-[12px]",
                date ? "text-[var(--ink-900)]" : "text-[var(--ink-400)]"
              )}
            >
              {date ? formatDateRead(date, time) : "Pick a day"}
            </span>
            {tag && <span className="text-micro shrink-0 whitespace-nowrap">{tag}</span>}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={6} className={cn(floatMenuCls, "w-[240px] gap-2 p-3")}>
          <label className="flex flex-col gap-1">
            <span className="eyebrow-sm" style={{ color: "var(--ink-400)" }}>
              Date
            </span>
            <input
              type="date"
              aria-label="Date"
              max={new Date().toISOString().slice(0, 10)}
              value={date}
              onChange={(e) => onChange(e.target.value, time)}
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="eyebrow-sm" style={{ color: "var(--ink-400)" }}>
              Time
            </span>
            <input
              type="time"
              aria-label="Time"
              value={time}
              onChange={(e) => onChange(date, e.target.value)}
              className={inputCls}
            />
          </label>
        </PopoverContent>
      </Popover>
    </Cell>
  );
}

/**
 * Event, typed — with your own past events offered as you go, and a last row
 * that creates the name you typed and asks what kind it is (design 6b).
 */
function EventCell({
  value,
  kind,
  events,
  onPick,
}: {
  value: string;
  kind: FormData["eventKind"];
  events: YourEvent[];
  onPick: (name: string, kind: FormData["eventKind"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [askKind, setAskKind] = useState(false);
  const [term, setTerm] = useState(value);
  const inputId = useId();

  // The field shows what it holds; typing narrows the list.
  const shown = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return needle
      ? events.filter((e) => e.name.toLowerCase().includes(needle))
      : events;
  }, [events, term]);
  const exact = shown.some((e) => e.name.toLowerCase() === term.trim().toLowerCase());

  const commit = (name: string, nextKind: FormData["eventKind"]) => {
    onPick(name, nextKind);
    setTerm(name);
    setOpen(false);
    setAskKind(false);
  };

  return (
    <Cell label="Event" className={cn(open && "col-span-2")}>
      <Popover open={open} onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setAskKind(false);
          // A typed name that was never chosen still counts: it is the event.
          if (term.trim() !== value) onPick(term.trim(), term.trim() ? kind ?? "other" : undefined);
        }
      }}>
        <PopoverAnchor asChild>
          <div
            className={cn(
              UNDERLINE_CLS,
              open ? "border-b-2 border-[var(--blue)] pb-[7px]" : "border-[var(--border-hairline)]"
            )}
          >
            <input
              id={inputId}
              value={term}
              placeholder="None — one-off"
              autoComplete="off"
              onFocus={() => setOpen(true)}
              onChange={(e) => {
                setTerm(e.target.value);
                setAskKind(false);
                if (!open) setOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (exact) {
                    const hit = shown.find((x) => x.name.toLowerCase() === term.trim().toLowerCase())!;
                    commit(hit.name, hit.kind);
                  } else if (term.trim()) setAskKind(true);
                }
              }}
              className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-400)]"
            />
            {!open && (
              <ChevronDown className="size-[13px] shrink-0 text-[var(--ink-400)]" strokeWidth={1.5} />
            )}
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          sideOffset={6}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={cn(floatMenuCls, "w-[300px]")}
        >
          {askKind ? (
            <>
              <span className={floatMenuLabelCls}>
                What kind of event is &ldquo;{term.trim()}&rdquo;?
              </span>
              <button type="button" onClick={() => commit(term.trim(), "tournament")} className={floatMenuRowCls}>
                <TournamentMark className="text-[var(--ink-500)]" />
                <span className="flex-1 text-[12px] font-medium text-[var(--ink-900)]">Tournament</span>
                <span className="text-[11px] text-[var(--ink-500)]">asks for the round</span>
              </button>
              <button type="button" onClick={() => commit(term.trim(), "other")} className={floatMenuRowCls}>
                <span className="w-[13px]" />
                <span className="flex-1 text-[12px] font-medium text-[var(--ink-900)]">Other</span>
                <span className="text-[11px] text-[var(--ink-500)]">a league, a ladder, a trip</span>
              </button>
            </>
          ) : (
            <>
              {shown.length > 0 && <span className={floatMenuLabelCls}>Your events</span>}
              {shown.slice(0, 6).map((event) => (
                <button
                  key={event.name}
                  type="button"
                  onClick={() => commit(event.name, event.kind)}
                  className={cn(floatMenuRowCls, event.name === value && "bg-[var(--surface-subtle)]")}
                >
                  <TournamentMark className="text-[var(--ink-500)] opacity-60" />
                  <span className="min-w-0 truncate text-[12px] font-medium text-[var(--ink-900)]">
                    {event.name}
                  </span>
                  <span className="shrink-0 text-[11px] text-[var(--ink-500)]">
                    {event.years}
                    {event.matches > 1 ? ` · ${event.matches} matches` : ""}
                  </span>
                </button>
              ))}
              {term.trim() && !exact && (
                <>
                  {shown.length > 0 && <span className={floatMenuDividerCls} />}
                  <button type="button" onClick={() => setAskKind(true)} className={floatMenuRowCls}>
                    <Plus className="size-[13px] shrink-0 text-[var(--ink-500)]" strokeWidth={1.5} />
                    <span className="min-w-0 truncate text-[12px] text-[var(--ink-700)]">
                      New event{" "}
                      <span className="font-medium text-[var(--ink-900)]">&ldquo;{term.trim()}&rdquo;</span>
                    </span>
                  </button>
                </>
              )}
              {shown.length === 0 && !term.trim() && (
                <span className={cn(floatMenuLabelCls, "pb-2")}>
                  Type a name — your past events will be offered here.
                </span>
              )}
            </>
          )}
        </PopoverContent>
      </Popover>
    </Cell>
  );
}

// ---------------------------------------------------------------------------
// The schedule's offer

function OfferStrip({
  offer,
  attached,
  onAttach,
  onDetach,
  onDecline,
}: {
  offer: LineOffer;
  attached: boolean;
  onAttach: () => void;
  onDetach: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-3 py-[9px]">
      {attached ? (
        <Check className="mr-0.5 size-[13px] shrink-0 text-[var(--ink-500)]" strokeWidth={1.5} aria-hidden="true" />
      ) : (
        <span className="mr-0.5 whitespace-nowrap text-[11px] text-[var(--ink-500)]">Looks like</span>
      )}
      {offer.slot && <span className="text-[11px] text-[var(--ink-500)]">{offer.slot}</span>}
      <ChevronRight className="size-3 shrink-0 text-[var(--ink-300)]" strokeWidth={1.5} aria-hidden="true" />
      <span className="min-w-0 truncate text-[12px] text-[var(--ink-900)]">
        <span className="font-medium">{offer.playerName}</span> vs {offer.opponentName || "—"}
      </span>
      <span className="mx-2 h-3.5 w-px shrink-0 bg-[var(--border-medium)]" aria-hidden="true" />
      <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11px] text-[var(--ink-600)]">
        <Calendar className="size-[13px] text-[var(--ink-400)]" strokeWidth={1.5} aria-hidden="true" />
        {formatDayShort(offer.date)}
      </span>
      <span className="ml-3 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11px] text-[var(--ink-600)]">
        <MapPin className="size-[13px] text-[var(--ink-400)]" strokeWidth={1.5} aria-hidden="true" />
        {siteLabel(offer.site)}
      </span>
      <span className="flex-1" />
      {attached ? (
        <button
          type="button"
          onClick={onDetach}
          className="shrink-0 cursor-pointer text-[11px] text-[var(--ink-500)] transition-colors duration-150 hover:text-[var(--ink-900)]"
        >
          Detach
        </button>
      ) : (
        <span className="inline-flex shrink-0 items-center gap-3.5">
          <button
            type="button"
            onClick={onAttach}
            title="Fills opponent, date, court, format and scoring from the lineup, and closes this slot"
            className="cursor-pointer text-[11px] font-medium text-[var(--blue)] transition-colors duration-150 hover:text-[var(--blue-hover)]"
          >
            Attach
          </button>
          <button
            type="button"
            onClick={onDecline}
            className="cursor-pointer text-[11px] text-[var(--ink-500)] transition-colors duration-150 hover:text-[var(--ink-900)]"
          >
            Not this match
          </button>
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The score

const CELL_CLS =
  "tabular inline-flex size-10 items-center justify-center rounded-[var(--radius-cell)] border border-[var(--border-medium)] bg-white text-center text-[16px] text-[var(--ink-900)] outline-none transition-[border-color,box-shadow] duration-150 focus:border-[1.5px] focus:border-[var(--blue)] focus:shadow-[0_0_0_2px_var(--blue-tint-12)]";

const ScoreInput = ({
  value,
  onValue,
  inputRef,
  label,
  tiebreak = false,
  invalid = false,
}: {
  value: number | null;
  onValue: (v: string) => void;
  inputRef?: (el: HTMLInputElement | null) => void;
  label: string;
  tiebreak?: boolean;
  invalid?: boolean;
}) => (
  <input
    ref={inputRef}
    type="text"
    inputMode="numeric"
    maxLength={tiebreak ? 3 : 2}
    aria-label={label}
    aria-invalid={invalid || undefined}
    value={value === null ? "" : String(value)}
    onChange={(e) => onValue(e.target.value.replace(/[^0-9]/g, ""))}
    data-focus-ring="none"
    className={cn(
      CELL_CLS,
      tiebreak && "text-[13px] text-[var(--ink-700)]",
      invalid && "border-[var(--error)]"
    )}
  />
);

function ScoreBlock({
  formData,
  playerName,
  opponentName,
  fromLine,
  onScoreChange,
  onTiebreakChange,
  onSetsChange,
}: {
  formData: FormData;
  playerName: string;
  opponentName: string;
  /** "Best of 3 · no-ad" when a line declared the format. */
  fromLine: boolean;
  onScoreChange: DetailsStepContentProps["onScoreChange"];
  onTiebreakChange: DetailsStepContentProps["onTiebreakChange"];
  onSetsChange: (count: number) => void;
}) {
  const bestOf = parseInt(formData.bestOf, 10) || 3;
  // Sets with anything in them, counted from the front.
  let filled = 0;
  for (let i = 0; i < bestOf; i++) {
    if (setHasData(formData, i)) filled = i + 1;
  }
  // Two columns to start, one more than is filled after that, never past the
  // format. The dashed column after the last is how a set gets added.
  const displayed = Math.min(bestOf, Math.max(2, filled + 1));
  const ghost = displayed < bestOf;

  const refs = useRef<Record<string, HTMLInputElement | null>>({});
  const key = (row: "p" | "o", i: number, tb = false) => `${row}${i}${tb ? "t" : ""}`;
  const focusKey = (k: string) => window.setTimeout(() => refs.current[k]?.focus(), 0);

  const tie = (i: number) => isTiebreakSet(formData.playerScores[i] ?? null, formData.opponentScores[i] ?? null);

  const setDigit = (row: "player" | "opponent", i: number, v: string) => {
    onScoreChange(row, i, v);
    if (v.length === 0) {
      // Clearing the last set's cells removes it.
      const other = row === "player" ? formData.opponentScores[i] : formData.playerScores[i];
      if (i === displayed - 1 && i >= 2 && (other === null || other === undefined)) onSetsChange(i);
      return;
    }
    // A game digit advances focus; tiebreak cells wait for Tab.
    if (row === "player") focusKey(key("o", i));
    else if (i + 1 < displayed) focusKey(key("p", i + 1));
    else if (ghost) focusKey(key("p", i + 1));
  };

  // Typing in the dashed column adds the set and keeps the digit.
  const ghostDigit = (row: "player" | "opponent", v: string) => {
    if (!v) return;
    onSetsChange(displayed + 1);
    onScoreChange(row, displayed, v);
    focusKey(row === "player" ? key("o", displayed) : key("p", displayed + 1));
  };

  const format = `${FORMAT_OPTIONS.find((o) => o.value === formData.bestOf)?.label ?? "Best of 3"}${
    formData.adScoring === undefined ? "" : formData.adScoring ? " · ad" : " · no-ad"
  }`;

  // A render function, not a component: declared inside render, a component
  // would remount on every keystroke and lose the cell that has focus.
  const renderRow = (row: "player" | "opponent", name: string, muted: boolean) => {
    const scores = row === "player" ? formData.playerScores : formData.opponentScores;
    const tbs = row === "player" ? formData.playerTiebreaks : formData.opponentTiebreaks;
    const r = row === "player" ? "p" : "o";
    return (
      <div className="flex items-center gap-4">
        <span className={cn("min-w-0 flex-1 truncate text-[14px]", muted ? "text-[var(--ink-600)]" : "text-[var(--ink-900)]")}>
          {name}
        </span>
        <span className="flex gap-3">
          {Array.from({ length: displayed }, (_, i) => (
            <span key={i} className="flex gap-3">
              <ScoreInput
                value={scores[i] ?? null}
                onValue={(v) => setDigit(row, i, v)}
                inputRef={(el) => {
                  refs.current[key(r, i)] = el;
                }}
                label={`${name}, set ${i + 1}`}
              />
              {tie(i) && (
                <ScoreInput
                  tiebreak
                  value={tbs[i] ?? null}
                  onValue={(v) => onTiebreakChange(row, i, v)}
                  inputRef={(el) => {
                    refs.current[key(r, i, true)] = el;
                  }}
                  label={`${name}, set ${i + 1} tiebreak`}
                />
              )}
            </span>
          ))}
          {ghost && (
            <span className="relative inline-flex size-10 items-center justify-center rounded-[var(--radius-cell)] border border-dashed border-[var(--border-medium)]">
              <Plus className="pointer-events-none absolute size-[13px] text-[var(--ink-400)]" strokeWidth={1.5} aria-hidden="true" />
              <input
                ref={(el) => {
                  refs.current[key(r, displayed)] = el;
                }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                aria-label={`${name}, add set ${displayed + 1}`}
                value=""
                onChange={(e) => ghostDigit(row, e.target.value.replace(/[^0-9]/g, ""))}
                data-focus-ring="none"
                className="size-full cursor-text bg-transparent text-center text-[16px] text-[var(--ink-900)] outline-none focus:rounded-[var(--radius-cell)] focus:shadow-[0_0_0_1.5px_var(--blue)]"
              />
            </span>
          )}
        </span>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-baseline gap-3">
        <span className="inline-flex items-center gap-1">
          <span className="eyebrow">Score</span>
          <Required />
        </span>
        <span className="flex-1" />
        <span className="text-[12px] text-[var(--ink-600)]">{format}</span>
      </div>
      {/* Set numbers as eyebrows over the cells; a TB column where one is. */}
      <div className="flex justify-end gap-3 pr-0.5">
        {Array.from({ length: displayed }, (_, i) => (
          <span key={i} className="flex gap-3">
            <span className="eyebrow-sm w-10 text-center" style={{ color: "var(--ink-400)" }}>
              {i + 1}
            </span>
            {tie(i) && (
              <span className="eyebrow-sm w-10 text-center" style={{ color: "var(--ink-400)" }}>
                TB
              </span>
            )}
          </span>
        ))}
        {ghost && <span className="w-10" />}
      </div>
      {renderRow("player", playerName || "You", false)}
      {renderRow("opponent", opponentName || "Opponent", true)}
      <span className="text-micro pt-0.5">
        Digits move on <span className="text-[var(--ink-300)]">·</span> tiebreak cells appear on their own
        {ghost && (
          <>
            {" "}
            <span className="text-[var(--ink-300)]">·</span> type in the dashed column to add a set
          </>
        )}
        {fromLine && (
          <>
            {" "}
            <span className="text-[var(--ink-300)]">·</span> format from the event
          </>
        )}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The players

/** One of the two facts as a tappable word — a two-item menu, radius 12. */
function WordSelect<T extends string>({
  value,
  placeholder,
  options,
  onChange,
}: {
  value: T | undefined;
  placeholder: string;
  options: readonly { value: T; label: string }[];
  onChange: (value: T | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-button)] px-2 pb-1 pt-[3px] text-[13px] transition-colors duration-[var(--duration-hover)]",
            open ? "bg-[var(--ink-100)]" : "bg-[var(--surface-subtle)] hover:bg-[var(--ink-100)]",
            current ? "text-[var(--ink-900)]" : "text-[var(--ink-400)]",
            focusRingCls
          )}
        >
          {current?.label ?? placeholder}
          <ChevronDown
            className={cn("size-[13px] text-[var(--ink-400)] transition-transform duration-150", open && "rotate-180")}
            strokeWidth={1.5}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className={cn(floatMenuCls, "w-[180px]")}>
        {options.map((option) => {
          const isCurrent = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={cn(floatMenuRowCls, "h-[34px] gap-2", isCurrent && "bg-[var(--surface-subtle)]")}
            >
              <span className={cn("flex-1 text-[12px] text-[var(--ink-900)]", isCurrent ? "font-medium" : "font-normal")}>
                {option.label}
              </span>
              {isCurrent ? (
                <Check className="size-[13px] text-[var(--blue)]" strokeWidth={1.5} />
              ) : (
                <span className="w-[13px]" />
              )}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

const HAND_OPTIONS: readonly { value: Hand; label: string }[] = [
  { value: "right", label: "Right-handed" },
  { value: "left", label: "Left-handed" },
];
const BACKHAND_OPTIONS: readonly { value: Backhand; label: string }[] = [
  { value: "two-handed", label: "Two-handed backhand" },
  { value: "one-handed", label: "One-handed backhand" },
];

/** The read-back sentence, or its editing form: the same two words either way. */
function StyleWords({
  hand,
  backhand,
  editing,
  onHand,
  onBackhand,
  dimmed = false,
}: {
  hand: Hand | undefined;
  backhand: Backhand | undefined;
  editing: boolean;
  onHand: (v: Hand | undefined) => void;
  onBackhand: (v: Backhand | undefined) => void;
  dimmed?: boolean;
}) {
  if (editing) {
    return (
      <span className="inline-flex items-center gap-2 text-[13px] text-[var(--ink-900)]">
        <WordSelect value={hand} placeholder="Hand" options={HAND_OPTIONS} onChange={onHand} />
        <span className="text-[var(--ink-300)]">·</span>
        <WordSelect value={backhand} placeholder="Backhand" options={BACKHAND_OPTIONS} onChange={onBackhand} />
      </span>
    );
  }
  if (!hand && !backhand) {
    return (
      <span className={cn("inline-flex items-center gap-2 text-[13px] text-[var(--ink-400)]", dimmed && "opacity-45")}>
        {dimmed ? (
          <>
            Hand <span className="text-[var(--ink-300)]">·</span> Backhand
          </>
        ) : (
          "Not set"
        )}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 text-[13px] text-[var(--ink-900)]">
      {hand ? HAND_LABEL[hand] : <span className="text-[var(--ink-400)]">Hand</span>}
      <span className="text-[var(--ink-300)]">·</span>
      {backhand ? BACKHAND_LABEL[backhand] : <span className="text-[var(--ink-400)]">Backhand</span>}
    </span>
  );
}

const ACTION_CLS =
  "cursor-pointer text-[11px] font-medium transition-colors duration-[var(--duration-hover)]";

function provenanceFor(source: ValueSource | undefined, ctx: {
  isSelf: boolean;
  school: string | null;
  saved: boolean;
}): string | null {
  switch (source) {
    case "profile":
      return ctx.isSelf ? "from your profile" : "from their profile";
    case "history":
      return "from your last match";
    case "export":
      return "from the export";
    case "event":
      return "from the lineup";
    case "roster":
      return ctx.school ? `from ${ctx.school}'s roster` : "from their roster";
    case "new":
      return ctx.saved && ctx.school ? `new · saved to ${ctx.school}` : ctx.isSelf ? null : "only you see this name";
    case "file":
      return "from the file";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------

function DetailsStepContentImpl({
  formData,
  onInputChange,
  onScoreChange,
  onTiebreakChange,
  isProcessingProvider,
  workspaceKind,
  subject,
  preset,
  attachedLine,
  onAttach,
  onDetach,
  exportRead,
  error,
}: DetailsStepContentProps) {
  const line = preset?.kind === "line" ? preset : null;
  const lineSchool = attachedLine?.opponentSchool ?? line?.opponentSchool ?? formData.opponentSchool ?? null;
  const lineProgramKey = attachedLine?.opponentProgramKey ?? line?.opponentProgramKey ?? formData.opponentProgramKey ?? null;
  const lineSlot = attachedLine?.slot ?? line?.round ?? null;
  const inDual =
    (attachedLine?.eventKind ?? line?.eventKind) === "dual" && Boolean(lineProgramKey);
  const fromLine = Boolean(attachedLine || line);

  // ---- Async: the offer, the people, the events, the styles

  const [offers, setOffers] = useState<LineOffer[]>([]);
  const [declined, setDeclined] = useState<Set<string>>(() => new Set());
  const [played, setPlayed] = useState<OpponentPlayed[]>([]);
  const [roster, setRoster] = useState<OpponentRosterRow[]>([]);
  const [events, setEvents] = useState<YourEvent[]>([]);

  useEffect(() => {
    let cancelled = false;
    void opponentsPlayed().then((rows) => {
      if (!cancelled) setPlayed(rows);
    });
    void yourEvents().then((rows) => {
      if (!cancelled) setEvents(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The schedule only offers in a team workspace, with no line pinned, for a
  // date. Re-asked when the date or the subject changes.
  useEffect(() => {
    if (workspaceKind !== "team" || line || !formData.date) return;
    let cancelled = false;
    void findLineOffers({
      date: formData.date,
      playerUserId: subject.playerId ?? subject.userId,
      playerName: subject.name,
    }).then((rows) => {
      if (!cancelled) setOffers(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceKind, line, formData.date, subject.playerId, subject.userId, subject.name]);

  useEffect(() => {
    if (!inDual || !lineProgramKey) return;
    let cancelled = false;
    void opponentRosterForLine({ opponentProgramKey: lineProgramKey, slot: lineSlot }).then((rows) => {
      if (!cancelled) setRoster(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [inDual, lineProgramKey, lineSlot]);

  // A roster player has no profile to read; their last match is the record.
  const styleAsked = useRef(false);
  useEffect(() => {
    if (styleAsked.current || subject.isSelf) return;
    if (formData.playerHand || formData.playerBackhand) return;
    styleAsked.current = true;
    void playerStyleFromMatches({ playerId: subject.playerId, playerName: subject.name }).then((style) => {
      if (!style) return;
      const hand = style.hand === "right" || style.hand === "left" ? style.hand : undefined;
      const backhand =
        style.backhand === "one-handed" || style.backhand === "two-handed" ? style.backhand : undefined;
      if (!hand && !backhand) return;
      onInputChange("playerHand", hand);
      onInputChange("playerBackhand", backhand);
      onInputChange("playerStyleSource", "history");
    });
  }, [subject.isSelf, subject.playerId, subject.name, formData.playerHand, formData.playerBackhand, onInputChange]);

  const offer = attachedLine ?? offers.find((o) => !declined.has(o.entryId)) ?? null;

  // ---- Players: editing state

  const [editingPlayer, setEditingPlayer] = useState(false);
  const [editingOpponent, setEditingOpponent] = useState(false);
  const [savingProfile, setSavingProfile] = useState<"idle" | "saving" | "saved">("idle");
  const [savedSchool, setSavedSchool] = useState<string | null>(null);
  const [nameOpen, setNameOpen] = useState(false);
  const [nameTerm, setNameTerm] = useState("");
  const [namingOpponent, setNamingOpponent] = useState(!formData.opponentName.trim());

  const opponentHand = formData.opponentHand as Hand | undefined;
  const opponentBackhand = formData.opponentBackhand as Backhand | undefined;
  const playerHand = formData.playerHand as Hand | undefined;
  const playerBackhand = formData.playerBackhand as Backhand | undefined;

  const pickPlayed = useCallback(
    (row: OpponentPlayed) => {
      onInputChange("opponentName", row.name);
      onInputChange("opponentSource", "history");
      onInputChange("opponentPlayerId", row.playerId);
      const hand = row.hand === "right" || row.hand === "left" ? row.hand : undefined;
      const backhand =
        row.backhand === "one-handed" || row.backhand === "two-handed" ? row.backhand : undefined;
      onInputChange("opponentHand", hand);
      onInputChange("opponentBackhand", backhand);
      onInputChange("opponentStyleSource", hand || backhand ? "history" : undefined);
      setNamingOpponent(false);
      setNameOpen(false);
    },
    [onInputChange]
  );

  const pickRoster = useCallback(
    (row: OpponentRosterRow) => {
      onInputChange("opponentName", row.name);
      onInputChange("opponentSource", "roster");
      onInputChange("opponentPlayerId", row.playerId);
      // What this program last recorded against them, if anything.
      const seen = played.find((p) => normalizedPersonName(p.name) === normalizedPersonName(row.name));
      const hand = seen?.hand === "right" || seen?.hand === "left" ? seen.hand : undefined;
      const backhand =
        seen?.backhand === "one-handed" || seen?.backhand === "two-handed" ? seen.backhand : undefined;
      onInputChange("opponentHand", hand);
      onInputChange("opponentBackhand", backhand);
      onInputChange("opponentStyleSource", hand || backhand ? "history" : undefined);
      setNamingOpponent(false);
      setNameOpen(false);
    },
    [onInputChange, played]
  );

  const createOpponent = useCallback(
    async (name: string) => {
      onInputChange("opponentName", name);
      onInputChange("opponentSource", "new");
      onInputChange("opponentPlayerId", null);
      onInputChange("opponentHand", undefined);
      onInputChange("opponentBackhand", undefined);
      onInputChange("opponentStyleSource", undefined);
      setNamingOpponent(false);
      setNameOpen(false);
      setSavedSchool(null);
      if (inDual && lineProgramKey) {
        // A program-scoped player, saved to their roster — best-effort: the
        // pool refuses where that program manages its own roster, and the
        // typed name stands either way.
        const result = await saveOpponentPlayer({ opponentProgramKey: lineProgramKey, name });
        if (result.saved) setSavedSchool(lineSchool);
      }
    },
    [inDual, lineProgramKey, lineSchool, onInputChange]
  );

  const saveProfile = async () => {
    setSavingProfile("saving");
    const { saved } = await saveMyStyle({ hand: playerHand, backhand: playerBackhand });
    setSavingProfile(saved ? "saved" : "idle");
    if (saved) onInputChange("playerStyleSource", "profile");
  };

  // ---- Names for the menus

  const needle = normalizedPersonName(nameTerm);
  const playedShown = useMemo(
    () => (needle ? played.filter((p) => normalizedPersonName(p.name).includes(needle)) : played).slice(0, 5),
    [played, needle]
  );
  const rosterShown = useMemo(
    () => (needle ? roster.filter((p) => normalizedPersonName(p.name).includes(needle)) : roster),
    [roster, needle]
  );
  const exactKnown =
    playedShown.some((p) => normalizedPersonName(p.name) === needle) ||
    rosterShown.some((p) => normalizedPersonName(p.name) === needle);

  const playerProvenance = provenanceFor(formData.playerStyleSource, {
    isSelf: subject.isSelf,
    school: null,
    saved: false,
  });
  const opponentProvenance =
    formData.opponentSource === "new"
      ? savedSchool
        ? `new · saved to ${savedSchool}`
        : workspaceKind === "personal"
          ? "only you see this name"
          : "new"
      : provenanceFor(formData.opponentSource, { isSelf: false, school: lineSchool, saved: false }) ??
        (formData.opponentStyleSource === "history" ? "from your last match" : null);

  // ---- Context

  const contextMicro = line
    ? "from the lineup · change any of them here"
    : isProcessingProvider
      ? workspaceKind === "team"
        ? "type what the schedule can't fill"
        : "the day, the surface, how the match was played"
      : "what the export measured, the event it belongs to, then how the match was played";

  const dateTag =
    formData.dateSource === "file"
      ? "from the file"
      : formData.dateSource === "export"
        ? "from the export"
        : undefined;

  const courtRead = (() => {
    const current = COURT_OPTIONS.find((o) => o.value === formData.courtType);
    if (!current) return undefined;
    const site = attachedLine?.site ?? line?.site ?? null;
    return site ? `${current.label} · ${siteLabel(site).toLowerCase()}` : current.label;
  })();

  const eventRead = fromLine
    ? `${attachedLine?.eventName ?? line?.eventName ?? ""}${
        (attachedLine?.eventKind ?? line?.eventKind) === "dual" ? " dual" : ""
      }`
    : "";

  return (
    <div className="flex flex-col gap-8">
      {error && (
        <div className={noteStripCls}>
          <XCircle className="mt-0.5 size-[13px] shrink-0 text-[var(--error)]" strokeWidth={1.5} aria-hidden="true" />
          <span>
            <b className="font-medium text-[var(--ink-900)]">Couldn&apos;t save this match</b>
            {" — "}
            {error}
          </span>
        </div>
      )}

      {offer && !line && (
        <OfferStrip
          offer={offer}
          attached={Boolean(attachedLine)}
          onAttach={() => onAttach(offer)}
          onDetach={onDetach}
          onDecline={() => setDeclined((prev) => new Set(prev).add(offer.entryId))}
        />
      )}

      <ScoreBlock
        formData={formData}
        playerName={subject.name}
        opponentName={formData.opponentName}
        fromLine={fromLine}
        onScoreChange={onScoreChange}
        onTiebreakChange={onTiebreakChange}
        onSetsChange={(count) => onInputChange("numberOfSets", count)}
      />

      {/* Players */}
      <div className="flex flex-col gap-3.5 border-t border-[var(--border-hairline)] pt-6">
        <SectionHead
          label="Players"
          required
          micro="who played, and which way — the opponent is named here and nowhere else"
        />

        {/* The workspace's own player — settled on step 1, read back here. */}
        <div className="flex min-h-10 items-center gap-6">
          <span className="flex w-[200px] shrink-0 flex-col gap-0.5">
            <span className="inline-flex items-center gap-2 text-[13px] text-[var(--ink-900)]">
              <span className="truncate">{subject.name}</span>
              {subject.isSelf && <StatePill>You</StatePill>}
            </span>
            {playerProvenance && <span className="text-micro whitespace-nowrap">{playerProvenance}</span>}
          </span>
          <StyleWords
            hand={playerHand}
            backhand={playerBackhand}
            editing={editingPlayer}
            onHand={(v) => {
              onInputChange("playerHand", v);
              onInputChange("playerStyleSource", undefined);
              setSavingProfile("idle");
            }}
            onBackhand={(v) => {
              onInputChange("playerBackhand", v);
              onInputChange("playerStyleSource", undefined);
              setSavingProfile("idle");
            }}
          />
          <span className="flex-1" />
          {editingPlayer ? (
            <span className="inline-flex items-center gap-3.5">
              {subject.isSelf && (playerHand || playerBackhand) && formData.playerStyleSource !== "profile" && (
                <button
                  type="button"
                  onClick={saveProfile}
                  disabled={savingProfile !== "idle"}
                  className={cn(ACTION_CLS, "text-[var(--ink-500)] hover:text-[var(--ink-900)] disabled:cursor-default")}
                >
                  {savingProfile === "saving" ? "Saving…" : savingProfile === "saved" ? "Saved to your profile" : "Save to your profile"}
                </button>
              )}
              {!playerHand && !playerBackhand && <span className="text-micro whitespace-nowrap">if you know</span>}
              <button
                type="button"
                onClick={() => setEditingPlayer(false)}
                className={cn(ACTION_CLS, "text-[var(--blue)] hover:text-[var(--blue-hover)]")}
              >
                Done
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setEditingPlayer(true)}
              className={cn(ACTION_CLS, "text-[var(--blue)] hover:text-[var(--blue-hover)]")}
            >
              {playerHand || playerBackhand ? "Change" : "Add"}
            </button>
          )}
        </div>

        {/* The opponent — named here, then read back like the row above. */}
        <div className="flex min-h-10 items-center gap-6">
          {namingOpponent ? (
            <Popover open={nameOpen} onOpenChange={setNameOpen}>
              <PopoverAnchor asChild>
                <span className="flex w-[200px] shrink-0 items-center border-b-2 border-[var(--blue)] pb-1.5 pt-1">
                  <input
                    autoFocus
                    value={nameTerm}
                    placeholder="Opponent"
                    aria-label="Opponent"
                    autoComplete="off"
                    onFocus={() => setNameOpen(true)}
                    onChange={(e) => {
                      setNameTerm(e.target.value);
                      if (!nameOpen) setNameOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      const term = nameTerm.trim();
                      if (!term) return;
                      const hitRoster = rosterShown.find((p) => normalizedPersonName(p.name) === needle);
                      const hitPlayed = playedShown.find((p) => normalizedPersonName(p.name) === needle);
                      if (hitRoster) pickRoster(hitRoster);
                      else if (hitPlayed) pickPlayed(hitPlayed);
                      else void createOpponent(term);
                    }}
                    className="w-full bg-transparent text-[13px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-400)]"
                  />
                </span>
              </PopoverAnchor>
              <PopoverContent
                align="start"
                sideOffset={6}
                onOpenAutoFocus={(e) => e.preventDefault()}
                className={cn(floatMenuCls, inDual ? "w-[360px]" : "w-[320px]")}
              >
                {inDual ? (
                  <>
                    {rosterShown.some((p) => p.heldThisLine) && (
                      <span className={floatMenuLabelCls}>
                        {lineSchool}
                        {lineSlot ? ` · ${lineSlot} last season` : ""}
                      </span>
                    )}
                    {rosterShown
                      .filter((p) => p.heldThisLine)
                      .map((p) => (
                        <button key={p.playerId} type="button" onClick={() => pickRoster(p)} className={floatMenuRowCls}>
                          <Avatar name={p.name} />
                          <span className="text-[12px] font-medium text-[var(--ink-900)]">{p.name}</span>
                          <span className="text-[11px] text-[var(--ink-500)]">
                            {p.classYear ? `${p.classYear} · ` : ""}
                            {p.meetings === 0 ? "no matches vs us" : `${p.meetings} ${p.meetings === 1 ? "match" : "matches"} vs us`}
                          </span>
                        </button>
                      ))}
                    {rosterShown.some((p) => !p.heldThisLine) && (
                      <span className={floatMenuLabelCls}>
                        {rosterShown.some((p) => p.heldThisLine) ? "Rest of their roster" : `${lineSchool}'s roster`}
                      </span>
                    )}
                    {rosterShown
                      .filter((p) => !p.heldThisLine)
                      .slice(0, 8)
                      .map((p) => (
                        <button key={p.playerId} type="button" onClick={() => pickRoster(p)} className={floatMenuRowCls}>
                          <Avatar name={p.name} />
                          <span className="text-[12px] font-medium text-[var(--ink-900)]">{p.name}</span>
                          <span className="text-[11px] text-[var(--ink-500)]">
                            {p.classYear ? `${p.classYear} · ` : ""}
                            {p.meetings === 0 ? "no matches vs us" : `${p.meetings} ${p.meetings === 1 ? "match" : "matches"} vs us`}
                          </span>
                        </button>
                      ))}
                  </>
                ) : (
                  <>
                    {playedShown.length > 0 && <span className={floatMenuLabelCls}>People you&apos;ve played</span>}
                    {playedShown.map((p) => (
                      <button key={p.name} type="button" onClick={() => pickPlayed(p)} className={floatMenuRowCls}>
                        <Avatar name={p.name} />
                        <span className="text-[12px] font-medium text-[var(--ink-900)]">{p.name}</span>
                        <span className="text-[11px] text-[var(--ink-500)]">
                          {p.matches} {p.matches === 1 ? "match" : "matches"} · last {formatMonthDay(p.lastDate)}
                        </span>
                      </button>
                    ))}
                  </>
                )}
                {nameTerm.trim() && !exactKnown && (
                  <>
                    {(playedShown.length > 0 || rosterShown.length > 0) && <span className={floatMenuDividerCls} />}
                    <button type="button" onClick={() => void createOpponent(nameTerm.trim())} className={floatMenuRowCls}>
                      <NewRing />
                      <span className="min-w-0 truncate text-[12px] text-[var(--ink-700)]">
                        {inDual ? (
                          <>
                            New player for <span className="font-medium text-[var(--ink-900)]">{lineSchool}</span>
                          </>
                        ) : (
                          <>
                            New opponent{" "}
                            <span className="font-medium text-[var(--ink-900)]">&ldquo;{nameTerm.trim()}&rdquo;</span>
                          </>
                        )}
                      </span>
                      <span className="flex-1" />
                      <span className="shrink-0 text-[11px] text-[var(--ink-500)]">
                        {inDual ? "name only" : "only you see this name"}
                      </span>
                    </button>
                  </>
                )}
                {!nameTerm.trim() && playedShown.length === 0 && rosterShown.length === 0 && (
                  <span className={cn(floatMenuLabelCls, "pb-2")}>Type their name.</span>
                )}
              </PopoverContent>
            </Popover>
          ) : (
            <span className="flex w-[200px] shrink-0 flex-col gap-0.5">
              <button
                type="button"
                onClick={() => {
                  setNameTerm(formData.opponentName);
                  setNamingOpponent(true);
                }}
                title="Change the opponent"
                className="cursor-pointer truncate text-left text-[13px] text-[var(--ink-900)]"
              >
                {formData.opponentName}
              </button>
              {opponentProvenance && <span className="text-micro whitespace-nowrap">{opponentProvenance}</span>}
            </span>
          )}
          <StyleWords
            hand={opponentHand}
            backhand={opponentBackhand}
            editing={editingOpponent && !namingOpponent}
            dimmed={namingOpponent}
            onHand={(v) => {
              onInputChange("opponentHand", v);
              onInputChange("opponentStyleSource", undefined);
            }}
            onBackhand={(v) => {
              onInputChange("opponentBackhand", v);
              onInputChange("opponentStyleSource", undefined);
            }}
          />
          <span className="flex-1" />
          {namingOpponent ? (
            <span className="text-micro whitespace-nowrap">after the name</span>
          ) : editingOpponent ? (
            <span className="inline-flex items-center gap-3.5">
              {!opponentHand && !opponentBackhand && <span className="text-micro whitespace-nowrap">if you know</span>}
              <button
                type="button"
                onClick={() => setEditingOpponent(false)}
                className={cn(ACTION_CLS, "text-[var(--blue)] hover:text-[var(--blue-hover)]")}
              >
                Done
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setEditingOpponent(true)}
              className={cn(ACTION_CLS, "text-[var(--blue)] hover:text-[var(--blue-hover)]")}
            >
              {opponentHand || opponentBackhand ? "Change" : "Add"}
            </button>
          )}
        </div>

        {inDual && namingOpponent && (
          <div className={noteStripCls}>
            <span>
              A player added here belongs to {lineSchool}, not to this match — every match against them
              reuses the same person, so head-to-heads and their scouting profile add up. Name only; class
              and line arrive with their next dual.
            </span>
          </div>
        )}
      </div>

      {/* Context */}
      <div className="flex flex-col gap-[18px] border-t border-[var(--border-hairline)] pt-6">
        <SectionHead label="Context" micro={contextMicro} />
        <div className="grid grid-cols-3 gap-x-6 gap-y-5">
          {fromLine ? (
            <ReadCell
              label="Event"
              value={eventRead}
              tag={lineSlot ? `· ${lineSlot}` : undefined}
            />
          ) : (
            <EventCell
              value={formData.eventName}
              kind={formData.eventKind}
              events={events}
              onPick={(name, kind) => {
                onInputChange("eventName", name);
                onInputChange("eventKind", kind);
                onInputChange(
                  "matchType",
                  kind === "tournament" ? "Tournament" : kind === "dual" ? "Dual Match" : formData.matchType ?? ""
                );
                if (kind !== "tournament") onInputChange("round", "");
              }}
            />
          )}
          {!fromLine && formData.eventKind === "tournament" && (
            <SelectCell
              label="Round"
              placeholder="R32 · R16 · QF · SF · F"
              mono
              value={formData.round || undefined}
              options={ROUND_OPTIONS}
              onChange={(v) => onInputChange("round", v)}
            />
          )}
          <DateCell
            date={formData.date}
            time={formData.time}
            tag={dateTag}
            onChange={(date, time) => {
              onInputChange("date", date);
              onInputChange("time", time);
              onInputChange("dateSource", undefined);
            }}
          />
          <SelectCell
            label="Court"
            placeholder="Surface"
            value={formData.courtType || undefined}
            options={COURT_OPTIONS}
            read={courtRead}
            onChange={(v) => onInputChange("courtType", v)}
          />
          <SelectCell
            label="Format"
            required
            placeholder="Choose"
            value={formData.bestOf || undefined}
            options={FORMAT_OPTIONS}
            onChange={(v) => onInputChange("bestOf", v)}
          />
          <SelectCell
            label="Scoring"
            required
            placeholder="Choose"
            value={formData.adScoring}
            options={[
              { value: true, label: "Ad" },
              { value: false, label: "No-ad" },
            ]}
            onChange={(v) => onInputChange("adScoring", v)}
          />
          {!isProcessingProvider && (
            <ReadCell
              label="Duration"
              value={formData.duration ? formatHoursMinutes(formData.duration / 1000) : ""}
              placeholder="Not set"
              tag={exportRead && formData.duration ? "from the export" : undefined}
              mono
            />
          )}
          <SelectCell
            label="Lets"
            required
            placeholder="Choose"
            value={formData.playOnLets}
            options={[
              { value: true, label: "Play on" },
              { value: false, label: "Replay" },
            ]}
            onChange={(v) => onInputChange("playOnLets", v)}
          />
        </div>
      </div>
    </div>
  );
}

export const DetailsStepContent = memo(DetailsStepContentImpl);
