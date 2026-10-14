"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { AskAnswer } from "@/components/dashboard/ask/ask-answer";
import { AskEngineMark } from "@/components/dashboard/ask/ask-engine-mark";
import { AskPrompt } from "@/components/dashboard/ask/ask-prompt";
import { AskSources } from "@/components/dashboard/ask/ask-sources";
import type { AskAnswerState } from "@/components/dashboard/ask/use-ask-stream";
import { AskVisualBlock } from "@/components/dashboard/ask/visuals/ask-visual";
import { InsightStatChip } from "@/components/dashboard/shared/insight-stat-chip";
import {
  ASK_NO_ADVICE_SENTENCE,
  type AskSourceMatch,
  type AskVisual,
} from "@/lib/services/ask/events";
import { cn } from "@/lib/utils";

export type AnswerDesign = "1" | "2" | "3" | "4";
export type AnswerByline = "none" | "footer" | "mark" | "current";

const DESIGNS: readonly { id: AnswerDesign; name: string; summary: string }[] =
  [
    {
      id: "1",
      name: "1 · Statement",
      summary:
        "The claim, then each figure with the number it is being judged against, then one paragraph. Closest to what is built, with the comparison brought up beside the number.",
    },
    {
      id: "2",
      name: "2 · Lead figure",
      summary:
        "One number carries the answer and the claim sits beside it. Supporting stats run as a quiet row with their movement against all matches.",
    },
    {
      id: "3",
      name: "3 · Evidence table",
      summary:
        "The numbers as a small table: this match, all matches, the difference. The prose shrinks to one sentence because the table is the evidence.",
    },
    {
      id: "4",
      name: "4 · Visual first",
      summary:
        "The claim, one chart block, a caption. The detailed sentences fold behind a disclosure for the player who wants them.",
    },
  ];

const BYLINES: readonly { id: AnswerByline; name: string }[] = [
  { id: "none", name: "No byline" },
  { id: "footer", name: "Footer line" },
  { id: "mark", name: "Mark only" },
  { id: "current", name: "As built" },
];

// ── Fixed inputs: the answer in the author's screenshot ─────────────────────

const QUESTION = "How did I serve against Beau, and what stood out?";

const SOURCES: AskSourceMatch[] = [
  {
    matchId: "m-beau",
    opponentName: "Beau Perez",
    playedOn: "2026-09-28",
    iWon: true,
    scoreText: "6-3",
    playerName: null,
  },
];

const CLAIM = "You won on the points, not on the first serve.";

const DETAIL: string[] = [
  "Your first serve landed in on 37.5% of attempts, against 58.2% across all your matches. When it did land you won 66.7% of those points, and 50% behind your second serve.",
  "You hit 8 winners and made 13 unforced errors. You converted 66.7% of your break points and saved 25% of the ones you faced, and won 54.8% of all points.",
];

const NO_ADVICE = ASK_NO_ADVICE_SENTENCE;

// ── The six blocks, as the server sends them ────────────────────────────────
// `AskVisual`-shaped: `value` is the cell, `text` the same cell as the server
// formatted it. The blocks below are the shipped components, not sketches.

const pct = (value: number) => ({ value, text: `${value}%` });
const count = (value: number) => ({ value, text: String(value) });

const BARS: AskVisual = {
  kind: "bars",
  caption: "Share of points, from 1 match against 22.",
  subjectLabel: "Sep 28 vs. Beau",
  baselineLabel: "All 22 matches",
  rows: [
    { label: "First serves in", subject: pct(37.5), baseline: pct(58.2) },
    {
      label: "First-serve points won",
      subject: pct(66.7),
      baseline: pct(64.1),
    },
    { label: "Second-serve points won", subject: pct(50), baseline: pct(47.9) },
    { label: "Total points won", subject: pct(54.8), baseline: pct(51.3) },
  ],
};

const SPLIT: AskVisual = {
  kind: "split",
  caption: "The 34 points you won, by how they ended.",
  parts: [
    { label: "Winners", count: count(8) },
    { label: "Opponent forced errors", count: count(11) },
    { label: "Opponent unforced errors", count: count(15) },
  ],
};

const TREND: AskVisual = {
  kind: "trend",
  caption: "First serves in, 8 matches since Jun 4.",
  points: [
    { label: "Jun 4", value: pct(61) },
    { label: "Jun 20", value: pct(57) },
    { label: "Jul 9", value: pct(63) },
    { label: "Jul 27", value: pct(55) },
    { label: "Aug 12", value: pct(59) },
    { label: "Aug 30", value: pct(52) },
    { label: "Sep 14", value: pct(48) },
    { label: "Sep 28", value: pct(37.5) },
  ],
};

const TABLE: AskVisual = {
  kind: "table",
  caption: "From 1 match against 22.",
  columns: ["Sep 28", "All matches", "Difference"],
  rows: [
    { label: "First serves in", cells: ["37.5%", "58.2%", "−20.7"] },
    { label: "First-serve points won", cells: ["66.7%", "64.1%", "+2.6"] },
    { label: "Second-serve points won", cells: ["50%", "47.9%", "+2.1"] },
    { label: "Double faults", cells: ["4", "2.3", "+1.7"] },
  ],
};

const EVIDENCE_TABLE: AskVisual = {
  kind: "table",
  caption: "Differences are in percentage points.",
  columns: ["Sep 28", "All matches", "Difference"],
  rows: [
    { label: "First serves in", cells: ["37.5%", "58.2%", "−20.7"] },
    { label: "First-serve points won", cells: ["66.7%", "64.1%", "+2.6"] },
    { label: "Second-serve points won", cells: ["50%", "47.9%", "+2.1"] },
    { label: "Break points converted", cells: ["66.7%", "41.2%", "+25.5"] },
    { label: "Total points won", cells: ["54.8%", "51.3%", "+3.5"] },
  ],
};

const SERVE: AskVisual = {
  kind: "serve",
  caption: "39 serves on break points, across 22 matches.",
  courts: [
    { label: "First serves", t: count(9), body: count(3), wide: count(6) },
    { label: "Second serves", t: count(4), body: count(5), wide: count(12) },
  ],
};

const FORM: AskVisual = {
  kind: "form",
  caption: "8 matches against left-handed opponents, oldest first.",
  results: [true, false, false, true, false, true, true, false],
};

/** The answer as it ships: the real `AskAnswer`, on a saved-answer state. */
const BUILT: AskAnswerState = {
  status: "done",
  stage: null,
  headline: CLAIM,
  figures: [
    { label: "First serves in", value: "37.5%" },
    { label: "First-serve points won", value: "66.7%" },
    { label: "Total points won", value: "54.8%" },
  ],
  visual: BARS,
  body: DETAIL.join("\n\n"),
  noAdvice: true,
  sources: SOURCES,
  error: null,
};

// ── The page ────────────────────────────────────────────────────────────────

export function AskAnswersPreview({
  design,
  byline,
}: {
  design: AnswerDesign;
  byline: AnswerByline;
}) {
  const current = DESIGNS.find((entry) => entry.id === design) ?? DESIGNS[0];
  const href = (next: Partial<{ d: AnswerDesign; by: AnswerByline }>) =>
    `/design/ask/answers?d=${next.d ?? design}&by=${next.by ?? byline}`;

  return (
    <div className="flex min-h-screen flex-col bg-[var(--surface-page)] selection:bg-[var(--blue-soft)]">
      <header className="flex flex-col gap-3 border-b border-[var(--border-hairline)] bg-[var(--surface-card)] px-6 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-title mr-3">Ask · answers</h1>
          {DESIGNS.map((entry) => (
            <Pill
              key={entry.id}
              href={href({ d: entry.id })}
              active={entry.id === design}
            >
              {entry.name}
            </Pill>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-body-sm mr-1">Signed by</span>
          {BYLINES.map((entry) => (
            <Pill
              key={entry.id}
              href={href({ by: entry.id })}
              active={entry.id === byline}
              quiet
            >
              {entry.name}
            </Pill>
          ))}
        </div>
        <p className="text-body-sm max-w-[75ch]">{current.summary}</p>
      </header>

      <main className="flex flex-col gap-6 p-6">
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1 px-1">
            <h2 className="text-title">As built</h2>
            <p className="text-body-sm max-w-[75ch]">
              The shipped answer component on a saved answer: no byline, the
              block between the figures and the evidence, the signature in the
              footer. The sheets under it are the designs it was chosen from.
            </p>
          </div>
          <Sheet>
            <AskPrompt text={QUESTION} tags={[]} />
            <AskAnswer answer={BUILT} />
          </Sheet>
        </section>

        <Sheet>
          <AskPrompt text={QUESTION} tags={[]} />
          <Signed byline={byline}>
            {design === "1" && <Statement />}
            {design === "2" && <LeadFigure />}
            {design === "3" && <EvidenceTable />}
            {design === "4" && <VisualFirst />}
          </Signed>
        </Sheet>

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1 px-1">
            <h2 className="text-title">Chart blocks</h2>
            <p className="text-body-sm max-w-[75ch]">
              The six blocks an answer can carry, one per answer — the shipped
              components, fed the shape the server sends. The AI names a block
              and the columns of its query result that feed it; the numbers come
              from the database, never from what it types.
            </p>
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <BlockSheet
              name="Comparison bars"
              question="How did my second serve hold up against Marcus?"
            >
              <AskVisualBlock visual={BARS} />
            </BlockSheet>
            <BlockSheet name="Split bar" question="Where did my points end?">
              <AskVisualBlock visual={SPLIT} />
            </BlockSheet>
            <BlockSheet
              name="Trend line"
              question="How has my first serve gone since June?"
            >
              <AskVisualBlock visual={TREND} />
            </BlockSheet>
            <BlockSheet
              name="Stat table"
              question="Give me my serve numbers against Beau."
            >
              <AskVisualBlock visual={TABLE} />
            </BlockSheet>
            <BlockSheet
              name="Serve placement"
              question="Where do I serve on break points?"
            >
              <AskVisualBlock visual={SERVE} />
            </BlockSheet>
            <BlockSheet
              name="Form strip"
              question="What is my record against left-handers?"
            >
              <AskVisualBlock visual={FORM} />
            </BlockSheet>
          </div>
        </section>
      </main>
    </div>
  );
}

function Pill({
  href,
  active,
  quiet = false,
  children,
}: {
  href: string;
  active: boolean;
  quiet?: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center rounded-[var(--radius-pill)] px-3 font-medium transition-colors duration-[var(--duration-hover)]",
        quiet ? "h-7 text-[11px]" : "h-8 text-[12px]",
        active
          ? quiet
            ? "bg-[var(--surface-subtle)] text-[var(--ink-900)]"
            : "bg-[var(--ink-900)] text-[var(--surface-card)]"
          : "text-[var(--ink-700)] hover:bg-[var(--surface-subtle)]",
      )}
    >
      {children}
    </Link>
  );
}

/** The chat column, on the page's own white. */
function Sheet({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] px-10 py-8">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-8">
        {children}
      </div>
    </div>
  );
}

function BlockSheet({
  name,
  question,
  children,
}: {
  name: string;
  question: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] p-6">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-[13px] font-medium text-[var(--ink-900)]">
          {name}
        </h3>
        <p className="text-body-sm">For a question like “{question}”</p>
      </div>
      {children}
    </div>
  );
}

// ── Who signed it ───────────────────────────────────────────────────────────

/**
 * The four ways to sign an answer. With prompts on the right, the left of the
 * column already says "this is the answer" — the question is how much more
 * the engine's name needs to say.
 */
function Signed({
  byline,
  children,
}: {
  byline: AnswerByline;
  children: ReactNode;
}) {
  const body = (
    <div className="flex min-w-0 flex-1 flex-col gap-5">
      {byline === "current" && (
        <span className="pt-[3px] text-[12px] text-[var(--ink-700)]">
          Advantage Intelligence
        </span>
      )}
      {children}
      <Foot byline={byline} />
    </div>
  );

  if (byline === "mark" || byline === "current") {
    return (
      <div className="flex gap-2.5">
        <div className="flex w-[26px] shrink-0 justify-center pt-1">
          <AskEngineMark />
        </div>
        {body}
      </div>
    );
  }
  return body;
}

/** Sources, then the things that are true of every answer, in micro type:
 *  what Ask will not do, and — when asked for — who answered. */
function Foot({ byline }: { byline: AnswerByline }) {
  return (
    <div className="flex flex-col gap-3">
      <AskSources matches={SOURCES} />
      <p className="text-micro max-w-[60ch]">
        {byline === "footer" && (
          <>
            <span className="text-[var(--ink-700)]">
              Advantage Intelligence
            </span>
            {" · "}
          </>
        )}
        {NO_ADVICE}
      </p>
    </div>
  );
}

const Claim = ({ children }: { children: ReactNode }) => (
  <p className="text-title-lg max-w-[24ch] text-balance">{children}</p>
);

// ── 1 · Statement ───────────────────────────────────────────────────────────

function Statement() {
  return (
    <>
      <Claim>{CLAIM}</Claim>
      <ul className="flex flex-wrap gap-x-10 gap-y-4">
        {[
          {
            value: "37.5%",
            label: "First serves in",
            base: "58.2% across all matches",
          },
          {
            value: "66.7%",
            label: "First-serve points won",
            base: "64.1% across all matches",
          },
          {
            value: "54.8%",
            label: "Total points won",
            base: "51.3% across all matches",
          },
        ].map((figure) => (
          <li key={figure.label} className="flex flex-col gap-0.5">
            <span className="text-score">{figure.value}</span>
            <span className="text-[12px] text-[var(--ink-700)]">
              {figure.label}
            </span>
            <span className="text-micro">{figure.base}</span>
          </li>
        ))}
      </ul>
      <p className="text-body max-w-[66ch]" style={{ lineHeight: 1.65 }}>
        {DETAIL[0]}
      </p>
    </>
  );
}

// ── 2 · Lead figure ─────────────────────────────────────────────────────────

function LeadFigure() {
  return (
    <>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <p className="flex flex-col">
          <span className="text-brand-hero tabular-nums">37.5%</span>
          <span className="text-[12px] text-[var(--ink-700)]">
            First serves in
            <span className="pl-2 text-[var(--ink-500)]">
              58.2% across all matches
            </span>
          </span>
        </p>
        <Claim>{CLAIM}</Claim>
      </div>
      <div className="flex flex-wrap gap-x-10 gap-y-4 border-t border-[var(--border-hairline)] pt-4">
        <InsightStatChip
          label="First-serve points won"
          value="66.7%"
          change={2.6}
        />
        <InsightStatChip
          label="Second-serve points won"
          value="50%"
          change={2.1}
        />
        <InsightStatChip label="Total points won" value="54.8%" change={3.5} />
        <InsightStatChip
          label="Unforced errors"
          value="13"
          change={2}
          lowerIsBetter
        />
      </div>
    </>
  );
}

// ── 3 · Evidence table ──────────────────────────────────────────────────────

function EvidenceTable() {
  return (
    <>
      <Claim>{CLAIM}</Claim>
      <AskVisualBlock visual={EVIDENCE_TABLE} />
      <p className="text-body max-w-[66ch]" style={{ lineHeight: 1.65 }}>
        You hit 8 winners and made 13 unforced errors.
      </p>
    </>
  );
}

// ── 4 · Visual first ────────────────────────────────────────────────────────

function VisualFirst() {
  return (
    <>
      <Claim>{CLAIM}</Claim>
      <AskVisualBlock visual={BARS} />
      <details className="group">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-[var(--radius-button)] text-[12px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)] [&::-webkit-details-marker]:hidden">
          <ChevronRight
            aria-hidden="true"
            className="size-3 transition-transform duration-[var(--duration-hover)] group-open:rotate-90"
            strokeWidth={1.5}
          />
          The numbers in full
        </summary>
        <div className="flex flex-col gap-3 pt-3">
          {DETAIL.map((paragraph) => (
            <p
              key={paragraph}
              className="text-body max-w-[66ch]"
              style={{ lineHeight: 1.65 }}
            >
              {paragraph}
            </p>
          ))}
        </div>
      </details>
    </>
  );
}
