"use client";

import { useState, useSyncExternalStore } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ProgramCrest } from "@/components/dashboard/settings/teams/program-crest";
import { ResultMark } from "@/components/dashboard/result-mark";
import { ScoreLine } from "@/components/dashboard/score-line";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { FloatMenu, FloatMenuItem } from "@/components/ui/float-menu";
import { getInitials } from "@/lib/data/match-utils";
import type { ScoreLineSet } from "@/lib/ui/score-format";
import { cn } from "@/lib/utils";

/**
 * The cells every redesigned admin table shares (Admin Console canvas,
 * "updated" boards: Today2, Matches2, Requests2, LabelsFlat, Pilots2, Teams2).
 *
 * One file so the grammar stays one grammar: a 32px person avatar that can
 * carry the 7px "New" dot, the two-line match cell, the 16px workspace mark,
 * the two-line date and the pill-shaped filter menu. A page composes these and
 * never redraws one.
 */

/** A person's 32px avatar, with the blue "New since you last looked" dot. */
export function AdminAvatar({
  name,
  photoUrl,
  fresh = false,
  size = 32,
}: {
  name: string;
  photoUrl?: string | null;
  /** Draws the 7px Signal Blue dot on the top-right corner. */
  fresh?: boolean;
  size?: 20 | 26 | 32;
}) {
  const box =
    size === 32
      ? "size-[32px] text-[11px]"
      : size === 26
        ? "size-[26px] text-[9px]"
        : "size-[20px] text-[8px]";
  return (
    <span className="relative inline-flex shrink-0">
      <PersonAvatar
        initials={getInitials(name) || "?"}
        photoUrl={photoUrl}
        className={box}
      />
      {fresh ? <NewDot /> : null}
    </span>
  );
}

/** The 7px dot itself, ringed in the card colour so it reads on a photo. */
export function NewDot() {
  return (
    <span
      role="img"
      aria-label="New"
      className="absolute top-0 right-0 size-[7px] rounded-full bg-[var(--blue)] shadow-[0_0_0_1.5px_var(--surface-card)]"
    />
  );
}

/** The word after a new row's name: 11px, Signal Blue, weight 500. */
export function NewLabel() {
  return (
    <span
      aria-hidden="true"
      className="ml-0.5 shrink-0 text-[11px] font-medium text-[var(--blue-hover)]"
    >
      New
    </span>
  );
}

/**
 * Pattern 2: a 32px avatar, then "Player" (500) "vs Opponent" (ink-600) on
 * line 1 and the ResultMark + Score on line 2. Line 2 draws nothing when the
 * match has no score yet (still uploading, or an unscored draft).
 */
export function AdminMatchCell({
  player,
  opponent,
  photoUrl,
  won,
  sets,
  fresh = false,
  trailing,
}: {
  player: string;
  opponent: string;
  photoUrl?: string | null;
  /** `null` = level or unknown; only drawn when there is a score. */
  won: boolean | null;
  sets: ScoreLineSet[];
  fresh?: boolean;
  /** Extra line-2 content after the score, e.g. a workspace mark. */
  trailing?: React.ReactNode;
}) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <AdminAvatar name={player} photoUrl={photoUrl} fresh={fresh} />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="shrink-0 truncate text-[13px] font-medium text-[var(--ink-900)]">
            {player}
          </span>
          <span className="truncate text-[13px] text-[var(--ink-600)]">
            vs {opponent}
          </span>
          {fresh ? <NewLabel /> : null}
        </span>
        {sets.length > 0 || trailing ? (
          <span className="flex min-w-0 items-center gap-1.5">
            {sets.length > 0 ? (
              <>
                <ResultMark won={won} className="[&_svg]:size-3" />
                <ScoreLine
                  sets={sets}
                  className="text-[12px] whitespace-nowrap text-[var(--ink-700)]"
                />
              </>
            ) : null}
            {trailing}
          </span>
        ) : null}
      </span>
    </span>
  );
}

/** Who a row is about, when it is a person and not a match: avatar + two lines. */
export function AdminPersonCell({
  name,
  rest,
  sub,
  photoUrl,
  fresh = false,
}: {
  name: string;
  /** ink-600 words after the name on line 1 ("claims UC Davis Men's"). */
  rest?: React.ReactNode;
  /** Line 2, 12px ink-600. */
  sub?: React.ReactNode;
  photoUrl?: string | null;
  fresh?: boolean;
}) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <AdminAvatar name={name} photoUrl={photoUrl} fresh={fresh} />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="shrink-0 truncate text-[13px] font-medium text-[var(--ink-900)]">
            {name}
          </span>
          {rest ? (
            <span className="truncate text-[13px] text-[var(--ink-600)]">
              {rest}
            </span>
          ) : null}
          {fresh ? <NewLabel /> : null}
        </span>
        {sub ? (
          <span className="flex min-w-0 items-center gap-1.5 truncate text-[12px] text-[var(--ink-600)]">
            {sub}
          </span>
        ) : null}
      </span>
    </span>
  );
}

export type AdminWorkspaceRef =
  | {
      kind: "team";
      name: string;
      crestUrl: string | null;
      shortCode?: string | null;
    }
  | { kind: "personal"; name?: string };

/**
 * Pattern 3's mark alone: a team's 16px crest (a rounded square at 4px) or a
 * personal workspace's 16px grey circle with a person outline — circles are
 * for people, so every workspace name starts at the same x either way.
 */
export function WorkspaceMark({ workspace }: { workspace: AdminWorkspaceRef }) {
  if (workspace.kind === "team") {
    return (
      <ProgramCrest
        name={workspace.name}
        crestUrl={workspace.crestUrl}
        shortCode={workspace.shortCode}
        size={16}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-[var(--ink-100)]"
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--ink-500)"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </svg>
    </span>
  );
}

/** Pattern 3: the workspace mark with its name beside it. */
export function WorkspaceCell({ workspace }: { workspace: AdminWorkspaceRef }) {
  const label =
    workspace.kind === "team" ? workspace.name : (workspace.name ?? "Personal");
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <WorkspaceMark workspace={workspace} />
      <span
        className={cn(
          "truncate text-[12px]",
          workspace.kind === "team"
            ? "text-[var(--ink-700)]"
            : "text-[var(--ink-600)]",
        )}
      >
        {label}
      </span>
    </span>
  );
}

// ── Dates ────────────────────────────────────────────────────────────────────

const subscribeNever = () => () => {};

/**
 * True once the component runs in the browser. Dates are moments, printed in
 * the viewer's own zone, and the server has no idea what that is — so the
 * server and the first client render print nothing, and the browser fills the
 * cell in. No hydration mismatch, no "yesterday" for anyone west of UTC.
 */
function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** "Today", "Yesterday", "Oct 27", or "Oct 27, 2025" outside this year. */
export function dayLabel(at: Date, now: Date = new Date()): string {
  if (sameDay(at, now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(at, yesterday)) return "Yesterday";
  return at.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(at.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/** "2:14 pm". */
export function timeLabel(at: Date): string {
  return at
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .replace("AM", "am")
    .replace("PM", "pm");
}

/**
 * Pattern 4: the day (13px; "Today" for today) over the time (12px, ink-600).
 * A fresh row's day is ink-900 at 500, like the canvas.
 */
export function TwoLineDate({
  at,
  fresh = false,
  prefix,
}: {
  /** An ISO moment (`created_at`, a job's `updated_at`), never `matches.date`. */
  at: string | null;
  fresh?: boolean;
  /** Words before the time on line 2, e.g. "since". */
  prefix?: string;
}) {
  const isClient = useIsClient();
  if (!at) {
    return <span className="text-[12px] text-[var(--ink-400)]">—</span>;
  }
  const date = new Date(at);
  return (
    <span className="flex min-w-0 flex-col gap-1 tabular-nums">
      <span
        className={cn(
          "truncate text-[13px] whitespace-nowrap",
          fresh ? "font-medium text-[var(--ink-900)]" : "text-[var(--ink-700)]",
        )}
      >
        {isClient ? dayLabel(date) : " "}
      </span>
      <span className="truncate text-[12px] whitespace-nowrap text-[var(--ink-600)]">
        {isClient
          ? prefix
            ? `${prefix} ${timeLabel(date)}`
            : timeLabel(date)
          : " "}
      </span>
    </span>
  );
}

/** A relative age, "3 days" / "20 h" / "4 min", for the Today page's Waiting column. */
export function ageLabel(at: Date, now: Date = new Date()): string {
  const minutes = Math.max(
    0,
    Math.round((now.getTime() - at.getTime()) / 60000),
  );
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 day" : `${days} days`;
}

/** The age, client-only for the same reason as `TwoLineDate`. */
export function AgeText({ at, className }: { at: string; className?: string }) {
  const isClient = useIsClient();
  return (
    <span className={className}>{isClient ? ageLabel(new Date(at)) : " "}</span>
  );
}

// ── Filters ──────────────────────────────────────────────────────────────────

/**
 * Pattern 6's view pills: 28px, a 999px radius, "All · 8" — the count is text
 * in the label. Mutually exclusive views of the same rows, so `radio` roles.
 */
export function CountPills<T extends string>({
  options,
  value,
  onChange,
  label = "Show",
}: {
  options: { value: T; label: string; count?: number | null }[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex flex-wrap items-center gap-1.5"
    >
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-7 cursor-pointer rounded-full border px-3 text-[12px] whitespace-nowrap tabular-nums transition-colors duration-200",
              on
                ? "border-[var(--border-medium)] bg-[var(--surface-subtle)] font-medium text-[var(--ink-900)]"
                : "border-[var(--border-hairline)] bg-[var(--surface-card)] text-[var(--ink-600)] hover:text-[var(--ink-900)]",
            )}
          >
            {option.count == null
              ? option.label
              : `${option.label} · ${option.count}`}
          </button>
        );
      })}
    </div>
  );
}

/** The 1×16 hairline between the view pills and the filter menus. */
export function FilterDivider() {
  return (
    <span
      aria-hidden="true"
      className="mx-1 h-4 w-px shrink-0 bg-[var(--border-medium)]"
    />
  );
}

export interface FilterMenuOption<T extends string> {
  value: T;
  label: string;
  /** Shown on the right of the row, as text. */
  count?: number | null;
  /** A mark before the label (a crest, a conference mark). */
  mark?: React.ReactNode;
}

/**
 * Pattern 6's filter menu: a pill trigger ("Program All ⌄") on the shared
 * `FloatMenu`. The first option is the unfiltered one; picking anything else
 * gives the pill the active wash.
 */
export function FilterMenuPill<T extends string>({
  label,
  options,
  value,
  onChange,
  width = 248,
}: {
  label: string;
  options: FilterMenuOption<T>[];
  value: T;
  onChange: (value: T) => void;
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const chosen = options.find((option) => option.value === value);
  const filtered = options.length > 0 && value !== options[0].value;

  return (
    <FloatMenu
      open={open}
      onOpenChange={setOpen}
      label={label}
      align="start"
      width={width}
      className="max-h-[360px] overflow-y-auto"
      trigger={
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          className={cn(
            "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border pr-2.5 pl-3 text-[12px] whitespace-nowrap transition-colors duration-200 hover:bg-[var(--surface-subtle)]",
            filtered || open
              ? "border-[var(--border-medium)]"
              : "border-[var(--border-hairline)]",
            filtered
              ? "bg-[var(--surface-subtle)]"
              : "bg-[var(--surface-card)]",
          )}
        >
          <span className="text-[var(--ink-600)]">{label}</span>
          <span className="max-w-[180px] truncate font-medium text-[var(--ink-900)]">
            {chosen?.label ?? "All"}
          </span>
          <ChevronDown
            className={cn(
              "size-3 text-[var(--ink-500)] transition-transform duration-200",
              open && "rotate-180",
            )}
            strokeWidth={1.8}
            aria-hidden="true"
          />
        </button>
      }
    >
      {options.map((option) => (
        <FloatMenuItem
          key={option.value}
          label={
            option.count == null
              ? option.label
              : `${option.label} · ${option.count}`
          }
          icon={option.mark}
          chosen={option.value === value}
          onSelect={() => {
            onChange(option.value);
            setOpen(false);
          }}
        />
      ))}
    </FloatMenu>
  );
}

/** The pill-shaped search box the list pages carry (Conferences2, Matches2). */
export function PillSearch({
  value,
  onChange,
  placeholder,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Accessible name. */
  label: string;
  className?: string;
}) {
  return (
    <input
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      aria-label={label}
      className={cn(
        "h-7 w-[220px] rounded-full border border-[var(--border-hairline)] bg-[var(--surface-card)] px-3 text-[12px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-400)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--blue)]",
        className,
      )}
    />
  );
}

/** A navigating row's trailing chevron (table law: rows that navigate get one). */
export function RowChevron() {
  return (
    <ChevronRight
      className="size-[13px] shrink-0 text-[var(--ink-400)]"
      strokeWidth={1.5}
      aria-hidden="true"
    />
  );
}
