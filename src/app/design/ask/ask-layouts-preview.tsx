"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { PanelLeftClose, PanelLeftOpen, SquarePen, Trash2 } from "lucide-react";
import { AskAnswer } from "@/components/dashboard/ask/ask-answer";
import {
  AskComposer,
  type AskQuotaView,
} from "@/components/dashboard/ask/ask-composer";
import { AskRail } from "@/components/dashboard/ask/ask-rail";
import type {
  AskAnswerState,
  AskQuestion,
  AskTag,
} from "@/components/dashboard/ask/use-ask-stream";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AskConversationSummary } from "@/lib/data/ask-server";
import type { AskTagOptions } from "@/lib/data/ask-tags";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";

export type AskLayoutVariant = "a" | "b" | "c";

const VARIANTS: readonly {
  id: AskLayoutVariant;
  name: string;
  summary: string;
}[] = [
  {
    id: "a",
    name: "A · Left list, no right rail",
    summary:
      "Earlier questions and New question move to a left column. Tags stay as chips in the composer and the limit sits at the foot of the list, so the answer has the rest of the width.",
  },
  {
    id: "b",
    name: "B · Left list, slim right rail",
    summary:
      "Earlier questions move left. The right rail narrows to 260px and keeps what describes this question: its tags and the month's limit.",
  },
  {
    id: "c",
    name: "C · As built",
    summary:
      "One 340px right rail holds the tags, the limit and earlier questions. New question sits beside the page title.",
  },
];

// ── Fixed inputs ────────────────────────────────────────────────────────────

const TAG_OPTIONS: AskTagOptions = {
  matches: [
    {
      matchId: "m-0928",
      opponentName: "Theo Lindqvist",
      playedOn: "2026-09-28",
      iWon: false,
      scoreText: "4-6, 6-7",
      tournamentName: "Club ladder",
    },
    {
      matchId: "m-0914",
      opponentName: "Marcus Hale",
      playedOn: "2026-09-14",
      iWon: true,
      scoreText: "6-4, 3-6, 7-5",
      tournamentName: "Fall Open",
    },
    {
      matchId: "m-0830",
      opponentName: "Daniel Okafor",
      playedOn: "2026-08-30",
      iWon: true,
      scoreText: "6-3, 6-4",
      tournamentName: "Club ladder",
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

const QUOTA: AskQuotaView = { used: 8, cap: 20, resetsOn: "2026-11-01" };

const CONVERSATIONS: AskConversationSummary[] = [
  {
    id: "c-1",
    title: "Second serve against Marcus",
    updatedAt: "2026-10-07T15:00:00Z",
  },
  {
    id: "c-2",
    title: "Why I lose long rallies to Theo",
    updatedAt: "2026-09-29T15:00:00Z",
  },
  {
    id: "c-3",
    title: "Serve placement on break points",
    updatedAt: "2026-09-20T15:00:00Z",
  },
  {
    id: "c-4",
    title: "What changed between sets at the Fall Open",
    updatedAt: "2026-09-15T15:00:00Z",
  },
  {
    id: "c-5",
    title: "First serve trend since June",
    updatedAt: "2026-09-02T15:00:00Z",
  },
  {
    id: "c-6",
    title: "Return depth against left-handers",
    updatedAt: "2026-08-21T15:00:00Z",
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
  sources: TAG_OPTIONS.matches,
  error: null,
};

const deleteNothing = async () => true;

// ── The page ────────────────────────────────────────────────────────────────

export function AskLayoutsPreview({ variant }: { variant: AskLayoutVariant }) {
  const current = VARIANTS.find((entry) => entry.id === variant) ?? VARIANTS[0];

  return (
    <TooltipProvider>
      <div className="flex min-h-screen flex-col bg-[var(--surface-page)]">
        <header className="flex flex-col gap-3 border-b border-[var(--border-hairline)] bg-[var(--surface-card)] px-6 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-title-lg mr-3">Ask page layouts</h1>
            {VARIANTS.map((entry) => (
              <Link
                key={entry.id}
                href={`/design/ask?v=${entry.id}`}
                aria-current={entry.id === variant ? "page" : undefined}
                className={cn(
                  "flex h-8 items-center rounded-full px-3 text-[12px] font-medium transition-colors duration-[var(--duration-hover)]",
                  entry.id === variant
                    ? "bg-[var(--ink-900)] text-[var(--surface-card)]"
                    : "text-[var(--ink-700)] hover:bg-[var(--surface-subtle)]",
                )}
              >
                {entry.name}
              </Link>
            ))}
          </div>
          <p className="text-body-sm max-w-[80ch]">{current.summary}</p>
        </header>

        <div className="flex flex-1 p-6">
          <div className="flex min-h-[820px] w-full overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)]">
            <DashboardRailStub />
            <div className="flex min-w-0 flex-1 flex-col">
              <DashboardHeaderStub />
              <Layout variant={variant} />
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

/** The dashboard's own icon rail, as grey blocks: it is what a left chat
 *  list would sit beside. */
function DashboardRailStub() {
  return (
    <div
      aria-hidden="true"
      className="flex w-16 shrink-0 flex-col items-center gap-3 border-r border-[var(--border-hairline)] py-4"
    >
      <span className="size-7 rounded-[var(--radius-element)] bg-[var(--surface-skeleton)]" />
      <span className="mt-3 size-5 rounded-[var(--radius-button)] bg-[var(--surface-subtle)]" />
      <span className="size-5 rounded-[var(--radius-button)] bg-[var(--surface-subtle)]" />
      <span className="size-5 rounded-[var(--radius-button)] bg-[var(--surface-subtle)]" />
      <span className="size-5 rounded-[var(--radius-button)] bg-[var(--surface-subtle)]" />
      <span className="size-5 rounded-[var(--radius-button)] bg-[var(--surface-skeleton)]" />
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

function Layout({ variant }: { variant: AskLayoutVariant }) {
  const [draft, setDraft] = useState<AskQuestion>({
    text: "And on break points?",
    tags: TAGS,
  });
  const [listOpen, setListOpen] = useState(true);

  const composer = (
    <AskComposer
      value={draft}
      onChange={setDraft}
      onSubmit={() => {}}
      tagOptions={TAG_OPTIONS}
      quota={QUOTA}
      pending={false}
    />
  );

  if (variant === "c") {
    return (
      <div className="flex min-h-0 flex-1">
        <Centre composer={composer} showNewQuestion />
        <aside
          aria-label="Question context"
          className="flex w-[340px] shrink-0 flex-col gap-7 border-l border-[var(--border-hairline)] px-[22px] py-6"
        >
          <AskRail
            tags={draft.tags}
            tagOptions={TAG_OPTIONS}
            quota={QUOTA}
            conversations={CONVERSATIONS}
            activeConversationId={ACTIVE_ID}
            onDeleteConversation={deleteNothing}
          />
        </aside>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      <ChatList
        open={listOpen}
        onToggle={() => setListOpen((value) => !value)}
        showLimit={variant === "a"}
      />
      <Centre composer={composer} centred={variant === "a"} />
      {variant === "b" && (
        <aside
          aria-label="Question context"
          className="flex w-[260px] shrink-0 flex-col gap-7 border-l border-[var(--border-hairline)] px-[22px] py-6"
        >
          <AskRail
            tags={draft.tags}
            tagOptions={TAG_OPTIONS}
            quota={QUOTA}
            conversations={[]}
            activeConversationId={ACTIVE_ID}
            onDeleteConversation={deleteNothing}
          />
        </aside>
      )}
    </div>
  );
}

// ── Centre column ───────────────────────────────────────────────────────────

function Centre({
  composer,
  showNewQuestion = false,
  centred = false,
}: {
  composer: ReactNode;
  showNewQuestion?: boolean;
  centred?: boolean;
}) {
  const column = cn("w-full max-w-[720px]", centred && "mx-auto");
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 px-14 pt-5">
      <div
        className={cn("flex flex-wrap items-end gap-2.5", centred && column)}
      >
        <div className="min-w-0 flex-1">
          <h2 className="text-display">Ask</h2>
          <div className="mt-[9px] flex h-[18px] items-baseline">
            <span className="text-body-sm truncate">
              Second serve against Marcus
            </span>
          </div>
        </div>
        {showNewQuestion && (
          <button type="button" className={advButton("ghost")}>
            New question
          </button>
        )}
      </div>

      <article className={cn(column, "flex flex-col gap-4")}>
        <div className="flex flex-col gap-2">
          <h3 className="text-data" style={{ fontWeight: 500 }}>
            {QUESTION_TEXT}
          </h3>
          <ul aria-label="Tagged" className="flex flex-wrap gap-1.5">
            {TAGS.map((tag) => (
              <li
                key={`${tag.kind}:${tag.id}`}
                className="flex h-[22px] items-center rounded-[var(--radius-button)] bg-[var(--surface-subtle)] px-2 text-[12px] text-[var(--ink-700)]"
              >
                {tag.label}
              </li>
            ))}
          </ul>
        </div>
        <AskAnswer answer={ANSWER} />
      </article>

      <div className={cn(column, "mt-auto pt-3 pb-8")}>{composer}</div>
    </div>
  );
}

// ── The left chat list (a sketch: exists only on this page) ─────────────────

function ChatList({
  open,
  onToggle,
  showLimit,
}: {
  open: boolean;
  onToggle: () => void;
  showLimit: boolean;
}) {
  if (!open) {
    return (
      <nav
        aria-label="Earlier questions"
        className="flex w-12 shrink-0 flex-col items-center gap-2 border-r border-[var(--border-hairline)] py-4"
      >
        <ChromeTooltip label="Show earlier questions" side="right">
          <button
            type="button"
            aria-label="Show earlier questions"
            onClick={onToggle}
            className="flex size-7 items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-500)] transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)]"
          >
            <PanelLeftOpen className="size-[15px]" strokeWidth={1.5} />
          </button>
        </ChromeTooltip>
        <ChromeTooltip label="New question" side="right">
          <button
            type="button"
            aria-label="New question"
            className="flex size-7 items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-500)] transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)]"
          >
            <SquarePen className="size-[15px]" strokeWidth={1.5} />
          </button>
        </ChromeTooltip>
      </nav>
    );
  }

  return (
    <nav
      aria-label="Earlier questions"
      className="flex w-[264px] shrink-0 flex-col border-r border-[var(--border-hairline)]"
    >
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <button
          type="button"
          className={cn(advButton("ghost", "sm"), "flex-1 gap-1.5")}
        >
          <SquarePen
            aria-hidden="true"
            className="size-3.5"
            strokeWidth={1.5}
          />
          New question
        </button>
        <ChromeTooltip label="Hide earlier questions" side="bottom">
          <button
            type="button"
            aria-label="Hide earlier questions"
            onClick={onToggle}
            className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-500)] transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)]"
          >
            <PanelLeftClose className="size-[15px]" strokeWidth={1.5} />
          </button>
        </ChromeTooltip>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
        <ChatGroup title="This month" rows={CONVERSATIONS.slice(0, 1)} />
        <ChatGroup title="September" rows={CONVERSATIONS.slice(1, 5)} />
        <ChatGroup title="August" rows={CONVERSATIONS.slice(5)} />
      </div>

      {showLimit && (
        <div className="flex flex-col gap-2 border-t border-[var(--border-hairline)] px-4 py-4">
          <p className="text-[12px] font-medium text-[var(--ink-900)] tabular-nums">
            {QUOTA.cap - QUOTA.used} questions left
          </p>
          <span
            role="img"
            aria-label={`${QUOTA.used} of ${QUOTA.cap} questions used`}
            className="flex flex-wrap gap-[3px]"
          >
            {Array.from({ length: QUOTA.cap }, (_, index) => (
              <span
                key={index}
                className={cn(
                  "size-2 rounded-[2px]",
                  index < QUOTA.used
                    ? "bg-[var(--blue)]"
                    : "shadow-[inset_0_0_0_1px_var(--ink-300)]",
                )}
              />
            ))}
          </span>
          <p
            aria-hidden="true"
            className="font-mono text-[11px] text-[var(--ink-600)] tabular-nums"
          >
            {QUOTA.used} / {QUOTA.cap}
            {" · Resets on the 1st"}
          </p>
        </div>
      )}
    </nav>
  );
}

function ChatGroup({
  title,
  rows,
}: {
  title: string;
  rows: AskConversationSummary[];
}) {
  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-0.5">
      <h3 className="eyebrow-sm pb-1.5">{title}</h3>
      <ul className="flex flex-col gap-0.5">
        {rows.map((row) => {
          const active = row.id === ACTIVE_ID;
          return (
            <li
              key={row.id}
              className={cn(
                "group -mx-2 flex h-9 items-center rounded-[var(--radius-element)] pr-1 transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)]",
                active && "bg-[var(--surface-subtle)]",
              )}
            >
              <span
                aria-current={active ? "page" : undefined}
                className="flex h-full min-w-0 flex-1 items-center pr-1 pl-2"
              >
                <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink-900)]">
                  {row.title}
                </span>
              </span>
              <ChromeTooltip label="Delete" side="top">
                <button
                  type="button"
                  aria-label={`Delete ${row.title}`}
                  className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-500)] opacity-0 transition-opacity duration-[var(--duration-hover)] group-focus-within:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 className="size-[13px]" strokeWidth={1.5} />
                </button>
              </ChromeTooltip>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
