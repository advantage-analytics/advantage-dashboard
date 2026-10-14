"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUp,
  ArrowUpRight,
  AtSign,
  Check,
  ChevronDown,
  KeyRound,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  SquarePen,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { AskAnswer } from "@/components/dashboard/ask/ask-answer";
import {
  ASK_PLACEHOLDER,
  type AskQuotaView,
} from "@/components/dashboard/ask/ask-composer";
import { AskEngineMark } from "@/components/dashboard/ask/ask-engine-mark";
import { ASK_TAG_ICON } from "@/components/dashboard/ask/ask-tag-menu";
import type {
  AskAnswerState,
  AskTag,
} from "@/components/dashboard/ask/use-ask-stream";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { Kbd } from "@/components/ui/kbd";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AskTagOptions } from "@/lib/data/ask-tags";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";

export type AskRailVariant = "1" | "2" | "3";

const VARIANTS: readonly {
  id: AskRailVariant;
  name: string;
  summary: string;
}[] = [
  {
    id: "1",
    name: "1 · By month",
    summary:
      "The quietest rail. One line per question under a month label, the date at the edge. On hover the date gives way to delete, so the row never shifts.",
  },
  {
    id: "2",
    name: "2 · With context",
    summary:
      "Two lines per question: what was asked, then who or which match it was about. Slower to scan, but a question is recognisable without opening it.",
  },
  {
    id: "3",
    name: "3 · By opponent",
    summary:
      "Grouped under the opponent a question tagged, with untagged questions last. Built for how players return to this page: before a rematch.",
  },
];

// ── Fixed inputs ────────────────────────────────────────────────────────────

const TAG_OPTIONS: AskTagOptions = {
  players: [],
  matches: [
    {
      matchId: "m-0928",
      opponentName: "Theo Lindqvist",
      playedOn: "2026-09-28",
      iWon: false,
      scoreText: "4-6, 6-7",
      tournamentName: "Club ladder",
      playerName: null,
    },
    {
      matchId: "m-0914",
      opponentName: "Marcus Hale",
      playedOn: "2026-09-14",
      iWon: true,
      scoreText: "6-4, 3-6, 7-5",
      tournamentName: "Fall Open",
      playerName: null,
    },
    {
      matchId: "m-0830",
      opponentName: "Daniel Okafor",
      playedOn: "2026-08-30",
      iWon: true,
      scoreText: "6-3, 6-4",
      tournamentName: "Club ladder",
      playerName: null,
    },
  ],
  opponents: [
    { id: "marcus hale", name: "Marcus Hale", matchCount: 7, hand: "right" },
    {
      id: "theo lindqvist",
      name: "Theo Lindqvist",
      matchCount: 4,
      hand: "left",
    },
    {
      id: "daniel okafor",
      name: "Daniel Okafor",
      matchCount: 4,
      hand: "right",
    },
  ],
};

const TAGS: AskTag[] = [
  { kind: "opponent", id: "marcus hale", label: "Marcus Hale" },
  { kind: "match", id: "m-0914", label: "Sep 14 · Marcus Hale" },
];

const QUOTA = {
  used: 8,
  cap: 20,
  resetsOn: "2026-11-01",
} satisfies AskQuotaView;

interface Chat {
  id: string;
  title: string;
  /** Short date as the rail prints it. */
  date: string;
  month: string;
  /** Who the question tagged; null when it tagged nobody. */
  opponent: string | null;
  /** The rest of the context line: a match, a period, a count. */
  context: string;
  kind: "opponent" | "match";
}

const CHATS: readonly Chat[] = [
  {
    id: "c-1",
    title: "Second serve against Marcus",
    date: "Oct 7",
    month: "October",
    opponent: "Marcus Hale",
    context: "Sep 14 · Fall Open",
    kind: "match",
  },
  {
    id: "c-2",
    title: "Why I lose long rallies to Theo",
    date: "Sep 29",
    month: "September",
    opponent: "Theo Lindqvist",
    context: "4 matches",
    kind: "opponent",
  },
  {
    id: "c-3",
    title: "Serve placement on break points",
    date: "Sep 20",
    month: "September",
    opponent: null,
    context: "All 22 matches",
    kind: "match",
  },
  {
    id: "c-4",
    title: "What changed between sets at the Fall Open",
    date: "Sep 15",
    month: "September",
    opponent: "Marcus Hale",
    context: "Sep 14 · Fall Open",
    kind: "match",
  },
  {
    id: "c-5",
    title: "First serve trend since June",
    date: "Sep 2",
    month: "September",
    opponent: null,
    context: "Since Jun 1",
    kind: "match",
  },
  {
    id: "c-6",
    title: "Return depth against Theo's second serve",
    date: "Aug 21",
    month: "August",
    opponent: "Theo Lindqvist",
    context: "4 matches",
    kind: "opponent",
  },
  {
    id: "c-7",
    title: "Net points won on the ladder",
    date: "Aug 12",
    month: "August",
    opponent: "Daniel Okafor",
    context: "Aug 30 · Club ladder",
    kind: "match",
  },
];

const ACTIVE_ID = "c-1";

const QUESTION_TEXT =
  "How did my second serve hold up against Marcus on Sep 14, compared with all my matches?";

const ANSWER: AskAnswerState = {
  status: "done",
  stage: null,
  headline: "Your second serve held against Marcus, above your usual level.",
  figures: [
    { label: "Sep 14 vs. Marcus", value: "55%" },
    { label: "All matches", value: "48%" },
    { label: "Difference", value: "7" },
  ],
  body: "On Sep 14 you won 55% of the points played on your second serve. Across all 22 recorded matches the figure is 48%.\n\nThe difference came on the ad court, where you won 61% of second-serve points in that match against 44% across all matches.",
  visual: null,
  noAdvice: false,
  sources: TAG_OPTIONS.matches,
  error: null,
  answerId: null,
  feedback: null,
};

const FOLLOW_UP = "And on break points?";

// ── The page ────────────────────────────────────────────────────────────────

export function AskLayoutsPreview({
  variant,
  railClosed,
}: {
  variant: AskRailVariant;
  railClosed: boolean;
}) {
  const current = VARIANTS.find((entry) => entry.id === variant) ?? VARIANTS[0];
  const [open, setOpen] = useState(!railClosed);

  return (
    <TooltipProvider>
      <div className="flex min-h-screen flex-col bg-[var(--surface-page)] selection:bg-[var(--blue-soft)]">
        <header className="flex flex-col gap-3 border-b border-[var(--border-hairline)] bg-[var(--surface-card)] px-6 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-title mr-3">Ask · left rail</h1>
            {VARIANTS.map((entry) => (
              <Link
                key={entry.id}
                href={`/design/ask?v=${entry.id}`}
                aria-current={entry.id === variant ? "page" : undefined}
                className={cn(
                  "flex h-8 items-center rounded-[var(--radius-pill)] px-3 text-[12px] font-medium transition-colors duration-[var(--duration-hover)]",
                  entry.id === variant
                    ? "bg-[var(--ink-900)] text-[var(--surface-card)]"
                    : "text-[var(--ink-700)] hover:bg-[var(--surface-subtle)]",
                )}
              >
                {entry.name}
              </Link>
            ))}
          </div>
          <p className="text-body-sm max-w-[75ch]">{current.summary}</p>
        </header>

        <div className="flex flex-1 p-6">
          <div className="flex h-[860px] w-full overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)]">
            <DashboardRailStub />
            <div className="flex min-w-0 flex-1 flex-col">
              <DashboardHeaderStub />
              <div className="flex min-h-0 flex-1">
                <ChatRail
                  variant={variant}
                  open={open}
                  onToggle={() => setOpen((value) => !value)}
                />
                <Thread composer={<ComposerSketch />} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

/** The dashboard's own icon rail, as grey blocks: what the chat rail sits
 *  beside. */
function DashboardRailStub() {
  return (
    <div
      aria-hidden="true"
      className="flex w-16 shrink-0 flex-col items-center gap-3 border-r border-[var(--border-hairline)] py-4"
    >
      <span className="size-7 rounded-[var(--radius-element)] bg-[var(--ink-100)]" />
      <span className="mt-3 size-5 rounded-[var(--radius-button)] bg-[var(--surface-subtle)]" />
      <span className="size-5 rounded-[var(--radius-button)] bg-[var(--surface-subtle)]" />
      <span className="size-5 rounded-[var(--radius-button)] bg-[var(--surface-subtle)]" />
      <span className="size-5 rounded-[var(--radius-button)] bg-[var(--surface-subtle)]" />
      <span className="size-5 rounded-[var(--radius-button)] bg-[var(--ink-100)]" />
    </div>
  );
}

function DashboardHeaderStub() {
  return (
    <div
      aria-hidden="true"
      className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--border-hairline)] px-5"
    >
      <span className="text-[13px] font-medium text-[var(--ink-900)]">Ask</span>
      <span className="h-6 w-40 rounded-[var(--radius-button)] bg-[var(--surface-subtle)]" />
    </div>
  );
}

// ── The thread: prompts on the right, answers on the left ───────────────────

const COLUMN = "mx-auto w-full max-w-[720px]";

function Thread({ composer }: { composer: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto px-10 pt-7 [scrollbar-color:var(--ink-200)_transparent] [scrollbar-width:thin]">
        <div className={cn(COLUMN, "flex flex-col gap-8")}>
          <Prompt text={QUESTION_TEXT} tags={TAGS} />
          <AskAnswer answer={ANSWER} />
          <Prompt text={FOLLOW_UP} tags={[]} />
          <AskAnswer
            answer={{
              status: "streaming",
              stage: "querying",
              headline: null,
              figures: [],
              visual: null,
              body: "",
              noAdvice: false,
              sources: null,
              error: null,
              answerId: null,
              feedback: null,
            }}
          />
        </div>
      </div>
      <div className="px-10 pt-3 pb-6">
        <div className={COLUMN}>{composer}</div>
      </div>
    </div>
  );
}

/**
 * The player's own words, set against the right edge. A neutral wash, never
 * blue: blue is for actions, and this is something already said. Capped at
 * 80% of the column so a long prompt still reads as theirs and an answer
 * never has to share its left edge with one.
 */
function Prompt({ text, tags }: { text: string; tags: AskTag[] }) {
  return (
    <div className="flex flex-col items-end gap-1.5">
      <h3 className="sr-only">You asked</h3>
      <p className="max-w-[80%] rounded-[var(--radius-card)] rounded-br-[var(--radius-cell)] bg-[var(--surface-subtle)] px-3.5 py-2.5 text-[13px] leading-[1.55] whitespace-pre-wrap text-[var(--ink-900)]">
        {text}
      </p>
      {tags.length > 0 && (
        <ul aria-label="Tagged" className="flex flex-wrap justify-end gap-1.5">
          {tags.map((tag) => {
            const Icon = ASK_TAG_ICON[tag.kind];
            return (
              <li
                key={`${tag.kind}:${tag.id}`}
                className="flex h-[22px] items-center gap-1.5 rounded-[var(--radius-button)] px-1 text-[11px] text-[var(--ink-600)]"
              >
                <Icon
                  aria-hidden="true"
                  className="size-3 text-[var(--ink-400)]"
                  strokeWidth={1.5}
                />
                {tag.label}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── The left rail (a sketch: exists only on this page) ──────────────────────

const ICON_BUTTON =
  "flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-500)] transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)]";

function ChatRail({
  variant,
  open,
  onToggle,
}: {
  variant: AskRailVariant;
  open: boolean;
  onToggle: () => void;
}) {
  if (!open) {
    return (
      <nav
        aria-label="Earlier questions"
        className="flex w-[52px] shrink-0 flex-col items-center gap-1 border-r border-[var(--border-hairline)] py-3"
      >
        <RailIconButton
          label="Show earlier questions"
          icon={PanelLeftOpen}
          onClick={onToggle}
        />
        <RailIconButton label="New question · ⇧⌘O" icon={SquarePen} />
      </nav>
    );
  }

  return (
    <nav
      aria-label="Earlier questions"
      className="flex w-[280px] shrink-0 flex-col border-r border-[var(--border-hairline)]"
    >
      <div className="flex items-center gap-1.5 px-3 pt-3 pb-2">
        <button
          type="button"
          className={cn(
            advButton("ghost", "sm"),
            "flex-1 justify-start gap-2 px-2.5",
          )}
        >
          <SquarePen
            aria-hidden="true"
            className="size-3.5 text-[var(--ink-500)]"
            strokeWidth={1.5}
          />
          <span className="flex-1 text-left">New question</span>
          <span aria-hidden="true" className="flex items-center gap-0.5">
            <Kbd size="sm" variant="flat">
              ⇧
            </Kbd>
            <Kbd size="sm" variant="flat">
              ⌘
            </Kbd>
            <Kbd size="sm" variant="flat">
              O
            </Kbd>
          </span>
        </button>
        <RailIconButton
          label="Hide earlier questions"
          icon={PanelLeftClose}
          side="bottom"
          onClick={onToggle}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3 pt-2 pb-4 [scrollbar-color:var(--ink-200)_transparent] [scrollbar-width:thin]">
        {variant === "3" ? (
          <ByOpponent />
        ) : (
          <ByMonth twoLine={variant === "2"} />
        )}
      </div>

      <RailLimit />
    </nav>
  );
}

function RailIconButton({
  label,
  icon: Icon,
  side = "right",
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  side?: "right" | "bottom";
  onClick?: () => void;
}) {
  return (
    <ChromeTooltip label={label} side={side}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className={ICON_BUTTON}
      >
        <Icon className="size-[15px]" strokeWidth={1.5} />
      </button>
    </ChromeTooltip>
  );
}

function groupBy<K extends string>(
  rows: readonly Chat[],
  key: (row: Chat) => K,
): [K, Chat[]][] {
  const groups = new Map<K, Chat[]>();
  for (const row of rows) {
    const name = key(row);
    groups.set(name, [...(groups.get(name) ?? []), row]);
  }
  return [...groups];
}

function ByMonth({ twoLine }: { twoLine: boolean }) {
  return (
    <>
      {groupBy(CHATS, (row) => row.month).map(([month, rows]) => (
        <section key={month} className="flex flex-col gap-0.5">
          <h3 className="eyebrow-sm px-2 pb-1.5">{month}</h3>
          <ul className="flex flex-col gap-0.5">
            {rows.map((row) =>
              twoLine ? (
                <ContextRow key={row.id} row={row} />
              ) : (
                <LineRow key={row.id} row={row} />
              ),
            )}
          </ul>
        </section>
      ))}
    </>
  );
}

function ByOpponent() {
  const groups = groupBy(CHATS, (row) => row.opponent ?? "");
  // Untagged questions last: they are the ones a name cannot find.
  const ordered = [
    ...groups.filter(([name]) => name !== ""),
    ...groups.filter(([name]) => name === ""),
  ];
  const OpponentIcon = ASK_TAG_ICON.opponent;
  return (
    <>
      {ordered.map(([name, rows]) => (
        <section key={name || "all"} className="flex flex-col gap-0.5">
          <h3 className="flex items-center gap-2 px-2 pb-1.5">
            {name !== "" && (
              <OpponentIcon
                aria-hidden="true"
                className="size-3 text-[var(--ink-400)]"
                strokeWidth={1.5}
              />
            )}
            <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[var(--ink-700)]">
              {name || "All matches"}
            </span>
            <span className="font-mono text-[10px] text-[var(--ink-500)] tabular-nums">
              {rows.length}
            </span>
          </h3>
          <ul className="flex flex-col gap-0.5">
            {rows.map((row) => (
              <LineRow key={row.id} row={row} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

const ROW =
  "group relative flex items-center rounded-[var(--radius-element)] transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)]";

/** One line: the question, the date at the edge. On hover and focus-within
 *  the date fades and delete takes its place, so nothing in the row moves. */
function LineRow({ row }: { row: Chat }) {
  const active = row.id === ACTIVE_ID;
  return (
    <li className={cn(ROW, "h-9", active && "bg-[var(--surface-subtle)]")}>
      <span
        aria-current={active ? "page" : undefined}
        className="flex h-full min-w-0 flex-1 items-center gap-2 pr-14 pl-2"
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[12px]",
            active
              ? "font-medium text-[var(--ink-900)]"
              : "text-[var(--ink-700)]",
          )}
        >
          {row.title}
        </span>
      </span>
      <RowEdge row={row} />
    </li>
  );
}

/** Two lines: the question, then what it was about. */
function ContextRow({ row }: { row: Chat }) {
  const active = row.id === ACTIVE_ID;
  const Icon = ASK_TAG_ICON[row.kind];
  return (
    <li className={cn(ROW, "h-[52px]", active && "bg-[var(--surface-subtle)]")}>
      <span
        aria-current={active ? "page" : undefined}
        className="flex h-full min-w-0 flex-1 flex-col justify-center gap-0.5 pr-14 pl-2"
      >
        <span
          className={cn(
            "truncate text-[12px]",
            active
              ? "font-medium text-[var(--ink-900)]"
              : "text-[var(--ink-700)]",
          )}
        >
          {row.title}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-[var(--ink-500)]">
          <Icon
            aria-hidden="true"
            className="size-3 shrink-0 text-[var(--ink-400)]"
            strokeWidth={1.5}
          />
          <span className="truncate">
            {row.opponent ? `${row.opponent} · ${row.context}` : row.context}
          </span>
        </span>
      </span>
      <RowEdge row={row} />
    </li>
  );
}

function RowEdge({ row }: { row: Chat }) {
  return (
    <span className="absolute inset-y-0 right-1 flex w-12 items-center justify-end">
      <span
        aria-hidden="true"
        className="pr-1 font-mono text-[10px] whitespace-nowrap text-[var(--ink-500)] tabular-nums transition-opacity duration-[var(--duration-hover)] group-focus-within:opacity-0 group-hover:opacity-0"
      >
        {row.date}
      </span>
      <span className="absolute right-0 opacity-0 transition-opacity duration-[var(--duration-hover)] group-focus-within:opacity-100 group-hover:opacity-100">
        <ChromeTooltip label="Delete" side="top">
          <button
            type="button"
            aria-label={`Delete ${row.title}`}
            className="flex size-7 items-center justify-center rounded-[var(--radius-button)] text-[var(--ink-500)] transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-card)] hover:text-[var(--danger)]"
          >
            <Trash2 className="size-[13px]" strokeWidth={1.5} />
          </button>
        </ChromeTooltip>
      </span>
    </span>
  );
}

/** The month's allowance, at the foot of the rail where it is always in
 *  reach and never between the player and an answer. */
function RailLimit() {
  const left = QUOTA.cap - QUOTA.used;
  return (
    <div className="flex flex-col gap-2 border-t border-[var(--border-hairline)] px-5 pt-3.5 pb-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12px] text-[var(--ink-900)] tabular-nums">
          {left} questions left
        </p>
        <p
          aria-hidden="true"
          className="font-mono text-[10px] text-[var(--ink-500)] tabular-nums"
        >
          {QUOTA.used} / {QUOTA.cap}
        </p>
      </div>
      <span
        role="img"
        aria-label={`${QUOTA.used} of ${QUOTA.cap} questions used`}
        className="flex gap-[3px]"
      >
        {Array.from({ length: QUOTA.cap }, (_, index) => (
          <span
            key={index}
            className={cn(
              "h-1 flex-1 rounded-[1px]",
              index < QUOTA.used ? "bg-[var(--blue)]" : "bg-[var(--ink-100)]",
            )}
          />
        ))}
      </span>
      <p className="text-[11px] text-[var(--ink-500)]">Resets on the 1st</p>
    </div>
  );
}

// ── The composer with a model menu (a sketch: the built composer shows a
//    static "Advantage Intelligence" label until a player can bring a model) ──

type ModelId = "advantage" | "claude";

/**
 * The composer as it would read once a player can bring their own model.
 * Same box and control row as the built composer; the engine label becomes a
 * menu trigger. The menu is open on arrival so it can be judged, and choosing
 * a row changes the trigger and the count — a model on the player's own key
 * does not draw on the month's questions.
 */
function ComposerSketch() {
  const [menuOpen, setMenuOpen] = useState(true);
  const [model, setModel] = useState<ModelId>("advantage");
  const left = QUOTA.cap - QUOTA.used;

  function choose(next: ModelId) {
    setModel(next);
    setMenuOpen(false);
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-[var(--radius-button)] border border-[var(--border-field)] bg-[var(--surface-card)] px-3 pt-3 pb-2.5">
      <p className="min-h-[39px] px-0.5 text-[13px] leading-[1.5] text-[var(--ink-400)]">
        {ASK_PLACEHOLDER}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <span className="-ml-1 flex h-7 items-center gap-1.5 rounded-[var(--radius-element)] px-2 text-[12px] text-[var(--ink-600)]">
          <AtSign
            aria-hidden="true"
            className="size-3.5 text-[var(--ink-500)]"
            strokeWidth={1.5}
          />
          Tag a match or opponent
        </span>

        <div
          className="relative"
          onKeyDown={(event) => {
            if (event.key === "Escape") setMenuOpen(false);
          }}
        >
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
            className={cn(
              "flex h-7 cursor-pointer items-center gap-2 rounded-[var(--radius-element)] px-2 text-[12px] text-[var(--ink-700)] transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)]",
              menuOpen && "bg-[var(--surface-subtle)] text-[var(--ink-900)]",
            )}
          >
            {model === "advantage" ? (
              <AskEngineMark />
            ) : (
              <ModelGlyph icon={KeyRound} />
            )}
            {model === "advantage" ? "Advantage Intelligence" : "Claude"}
            <ChevronDown
              aria-hidden="true"
              className="size-3 text-[var(--ink-500)]"
              strokeWidth={1.5}
            />
          </button>

          {menuOpen && (
            <div
              role="menu"
              aria-label="Model"
              className="absolute bottom-full left-0 z-10 mb-2 flex w-[328px] flex-col rounded-[var(--radius-dropdown)] border border-[var(--border-hairline)] bg-[var(--surface-card)] p-[5px] shadow-[var(--shadow-dropdown)]"
            >
              <ModelGroup label="Included">
                <ModelRow
                  glyph={<AskEngineMark />}
                  name="Advantage Intelligence"
                  detail={`Reads every match you've sent. ${left} of ${QUOTA.cap} questions left this month.`}
                  chosen={model === "advantage"}
                  onClick={() => choose("advantage")}
                />
              </ModelGroup>

              <ModelGroup label="Your own model">
                <ModelRow
                  glyph={<ModelGlyph icon={KeyRound} />}
                  name="Claude"
                  detail="Your Anthropic API key, added Oct 2. Billed to that account."
                  chosen={model === "claude"}
                  onClick={() => choose("claude")}
                />
                <ModelRow
                  glyph={<ModelGlyph icon={KeyRound} />}
                  name="ChatGPT"
                  detail="Add an OpenAI API key to ask with it."
                  action="Add key"
                />
              </ModelGroup>

              <ModelGroup label="In your own assistant">
                <ModelRow
                  glyph={<ModelGlyph icon={Plug} />}
                  name="Connect Advantage"
                  detail="Add the connector to Claude or ChatGPT and ask about your matches there, on the plan you already have."
                  external
                />
              </ModelGroup>

              <p className="mx-[5px] mt-1 border-t border-[var(--border-hairline)] px-1.5 pt-2.5 pb-2 text-[11px] leading-[1.5] text-[var(--ink-500)]">
                Your own model reads your match statistics, never the video.
                Advantage Intelligence does not check its answers.
              </p>
            </div>
          )}
        </div>

        <div className="flex-1" />

        <p className="font-mono text-[11px] text-[var(--ink-600)] tabular-nums">
          {model === "advantage" ? `${QUOTA.used} / ${QUOTA.cap}` : "Your key"}
        </p>
        <button
          type="button"
          aria-label="Send question"
          disabled
          className={cn(advButton("primary", "sm"), "w-8 px-0")}
        >
          <ArrowUp aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

/** A model that is not Advantage's own: a neutral glyph, never a vendor's
 *  mark — the icon set is Lucide and the name is in the row. */
function ModelGlyph({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-4 shrink-0 items-center justify-center rounded-[3px] bg-[var(--surface-subtle)] text-[var(--ink-600)]"
    >
      <Icon className="size-[11px]" strokeWidth={1.5} />
    </span>
  );
}

function ModelGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-col">
      <p className="eyebrow-sm px-2.5 pt-2.5 pb-1">{label}</p>
      {children}
    </div>
  );
}

function ModelRow({
  glyph,
  name,
  detail,
  chosen,
  action,
  external = false,
  onClick,
}: {
  glyph: ReactNode;
  name: string;
  detail: string;
  /** Set on rows that can be the current model. */
  chosen?: boolean;
  /** A row that leads to adding something first. */
  action?: string;
  /** A row that leaves this page. */
  external?: boolean;
  onClick?: () => void;
}) {
  const selectable = chosen !== undefined;
  return (
    <button
      type="button"
      role={selectable ? "menuitemradio" : "menuitem"}
      aria-checked={selectable ? chosen : undefined}
      onClick={onClick}
      className="flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-button)] px-2.5 py-2 text-left transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)]"
    >
      <span className="mt-px flex">{glyph}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[12px] font-medium text-[var(--ink-900)]">
          {name}
        </span>
        <span className="text-[11px] leading-[1.45] text-[var(--ink-500)]">
          {detail}
        </span>
      </span>
      <span className="mt-0.5 flex min-w-[13px] shrink-0 justify-end">
        {chosen && (
          <Check
            aria-hidden="true"
            className="size-[13px] text-[var(--blue)]"
            strokeWidth={2}
          />
        )}
        {action && (
          <span className="text-[11px] font-medium text-[var(--blue)]">
            {action}
          </span>
        )}
        {external && (
          <ArrowUpRight
            aria-hidden="true"
            className="size-3 text-[var(--ink-400)]"
            strokeWidth={1.5}
          />
        )}
      </span>
    </button>
  );
}
