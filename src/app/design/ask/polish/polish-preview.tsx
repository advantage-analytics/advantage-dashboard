"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, Play, ThumbsDown, ThumbsUp } from "lucide-react";
import { ASK_SIGNATURE } from "@/components/dashboard/ask/ask-answer";
import { AskFeedbackControl } from "@/components/dashboard/ask/ask-feedback";
import { AskPointList } from "@/components/dashboard/ask/ask-point-list";
import {
  LIST_TONE,
  ROW_TONE,
} from "@/components/dashboard/matches/match-detail/film/point-list-tone";
import { WorkspaceMark } from "@/components/dashboard/workspace-mark";
import { WorkspaceProvider } from "@/components/dashboard/workspace-provider";
import {
  ASK_NO_ADVICE_SENTENCE,
  type AskSourceMatch,
} from "@/lib/services/ask/events";
import type { AskFeedback } from "@/lib/services/ask/feedback";
import type { AskShowPoint } from "@/lib/services/ask/show-response";
import type { WorkspaceContextValue } from "@/lib/workspace/types";
import { cn } from "@/lib/utils";

// ── Fixed inputs ────────────────────────────────────────────────────────────

/** A team workspace with no crest uploaded: its mark is the ink letter. */
const WORKSPACE: WorkspaceContextValue = {
  active: {
    id: "program-1",
    kind: "team",
    name: "Northfield University",
    team: "mens",
    orgType: null,
    timeZone: "UTC",
    role: "coach",
    mark: "N",
    iconUrl: null,
    canSubmitVideo: true,
    programStatus: null,
    playersCanUpload: true,
    memberUploadEnabled: true,
    uploadPolicy: "everyone",
    eventsPolicy: "owner",
    myPlayerId: null,
  },
  available: [],
  viewer: {
    id: "viewer-1",
    email: "coach@example.com",
    name: "Coach",
    firstName: "Coach",
    initials: "C",
    avatarUrl: null,
    plan: "free",
    role: null,
    memberSince: null,
    onboardedAt: null,
    recordingSource: null,
    workspaceHintDoneAt: null,
    activityHintDoneAt: null,
    sampleTourDoneAt: null,
    firstReportTourDoneAt: null,
  },
};

const MATCH: AskSourceMatch = {
  matchId: "m-demo",
  opponentName: "Marcus Hale",
  playedOn: "2026-09-28",
  iWon: true,
  scoreText: "6-4, 6-3",
  playerName: "Theo Lindqvist",
};

/** One point; the score is the score BEFORE it, server first. */
function pt(
  pointNumber: number,
  gameNumber: number,
  gameScore: string,
  pointScore: string,
  resultType: string,
  iWon: boolean,
  iServed: boolean,
  timed = true,
): AskShowPoint {
  return {
    pointNumber,
    setNumber: 1,
    gameNumber,
    gameScore,
    pointScore,
    resultType,
    iWon,
    iServed,
    videoTime: timed ? pointNumber * 31 : null,
    duration: 12,
  };
}

const POINTS: AskShowPoint[] = [
  pt(8, 2, "0-1", "0-0", "Forehand Winner", true, true),
  pt(9, 2, "0-1", "15-0", "Forehand Unforced Error", true, true),
  pt(10, 2, "0-1", "30-0", "Backhand Unforced Error", true, true),
  pt(11, 2, "0-1", "40-0", "Backhand Winner", true, true),
  pt(12, 3, "1-1", "0-0", "Ace", false, false),
  pt(13, 3, "1-1", "15-0", "Backhand Winner", true, false),
  pt(14, 3, "1-1", "15-15", "Forehand Unforced Error", false, false),
  pt(15, 3, "1-1", "30-15", "Double Fault", true, false),
  pt(16, 3, "1-1", "30-30", "Forehand Winner", false, false),
  pt(17, 3, "1-1", "40-30", "Backhand Unforced Error", false, false),
  pt(18, 4, "1-2", "0-0", "Ace", true, true),
  pt(19, 4, "1-2", "15-0", "Backhand Unforced Error", false, true, false),
  pt(20, 4, "1-2", "15-15", "Forehand Winner", true, true),
  pt(21, 4, "1-2", "30-15", "Volley Winner", true, true),
  pt(22, 4, "1-2", "40-15", "Forehand Unforced Error", false, true),
  pt(23, 4, "1-2", "40-30", "Backhand Winner", true, true),
];

const YOU = "Lindqvist";
const OPP = "Hale";
const HEADING = `${POINTS.length} points behind this answer`;

interface Game {
  key: string;
  label: string;
  /** Games before this one, as the list's header has always printed it. */
  before: string;
  /** Games after it — derived here from who won the last point. */
  after: string;
  youServed: boolean;
  points: AskShowPoint[];
}

function gamesOf(points: readonly AskShowPoint[]): Game[] {
  const out: Game[] = [];
  for (const point of points) {
    const last = out[out.length - 1];
    if (last && last.points[0].gameNumber === point.gameNumber) {
      last.points.push(point);
      continue;
    }
    out.push({
      key: `${point.setNumber}-${point.gameNumber}`,
      label: `Set ${point.setNumber} · Game ${point.gameNumber}`,
      before: point.gameScore ?? "",
      after: "",
      youServed: point.iServed === true,
      points: [point],
    });
  }
  for (const game of out) {
    const [you, opp] = game.before.split("-").map(Number);
    const youTookIt = game.points[game.points.length - 1].iWon === true;
    game.after = youTookIt ? `${you + 1}-${opp}` : `${you}-${opp + 1}`;
  }
  return out;
}

const GAMES = gamesOf(POINTS);

/** "Forehand Unforced Error" → "FH UE": the strip's chip label. */
function shortResult(result: string | null): string {
  if (!result) return "—";
  const map: [RegExp, string][] = [
    [/Forehand/i, "FH"],
    [/Backhand/i, "BH"],
    [/Volley/i, "VO"],
    [/Unforced Error/i, "UE"],
    [/Forced Error/i, "FE"],
    [/Winner/i, "W"],
    [/Double Fault/i, "DF"],
  ];
  if (/^Ace$/i.test(result)) return "Ace";
  let out = result;
  for (const [pattern, short] of map) out = out.replace(pattern, short);
  return out;
}

const pointHref = (n: number) => `#point-${n}`;

// ── The page ────────────────────────────────────────────────────────────────

export function AskPolishPreview() {
  return (
    <WorkspaceProvider value={WORKSPACE}>
      <div className="flex min-h-screen flex-col bg-[var(--surface-page)]">
        <header className="flex flex-col gap-2 border-b border-[var(--border-hairline)] bg-[var(--surface-card)] px-4 py-4 sm:px-6">
          <h1 className="text-title">Ask · answer polish</h1>
          <p className="text-body-sm max-w-[75ch]">
            Two parts of a finished answer. The footer&apos;s After is picked
            and built. The points list leads with compact layouts that fit in a
            line or two, then the quieter full lists, then the first round, all
            on the same sixteen points.
          </p>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
            <a href="#footer" className="text-body-sm text-[var(--blue)]">
              Footer
            </a>
            <a href="#compact" className="text-body-sm text-[var(--blue)]">
              Points — compact
            </a>
            <a href="#quiet" className="text-body-sm text-[var(--blue)]">
              Points — quieter
            </a>
            <a href="#points" className="text-body-sm text-[var(--blue)]">
              Points — first round
            </a>
          </nav>
        </header>

        <main className="flex flex-col gap-10 p-4 sm:p-6">
          <FooterSection />
          <CompactSection />
          <QuietSection />
          <PointsSection />
        </main>
      </div>
    </WorkspaceProvider>
  );
}

// ── Footer ──────────────────────────────────────────────────────────────────

const rate = async (_: AskFeedback | null) => true;

function FooterSection() {
  const states: {
    name: string;
    feedback: AskFeedback | null;
    advice?: boolean;
    narrow?: boolean;
  }[] = [
    { name: "No thumb yet", feedback: null },
    {
      name: "Thumbs up given",
      feedback: { rating: "up", reasons: [], note: null },
    },
    {
      name: "With the no-advice sentence",
      feedback: null,
      advice: true,
    },
    {
      name: "Phone width (340px column)",
      feedback: null,
      advice: true,
      narrow: true,
    },
  ];
  return (
    <section id="footer" className="flex scroll-mt-6 flex-col gap-4">
      <SectionHead
        title="Footer — signature and thumbs"
        body="Before, the thumbs sat on their own line under the signature, and their 28px hit areas pushed the icons in from the text's edge, so the footer read as a name with a stray toolbar under it. After, they share the signature's line and the row keeps the text's height. When the signature runs long (the no-advice sentence), the thumbs follow it on the last line. Press a thumb in the After column: it works."
      />
      <div className="flex flex-col gap-4">
        {states.map((state) => (
          <div
            key={state.name}
            className="rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] p-4 sm:p-6"
          >
            <p className="eyebrow-sm pb-4">{state.name}</p>
            <div className="grid gap-6 md:grid-cols-2">
              <Labelled label="Before">
                <div className={cn(state.narrow && "max-w-[340px]")}>
                  <OldFooter
                    feedback={state.feedback}
                    advice={state.advice === true}
                  />
                </div>
              </Labelled>
              <Labelled label="After">
                <div className={cn(state.narrow && "max-w-[340px]")}>
                  <AskFeedbackControl
                    feedback={state.feedback}
                    onRate={rate}
                    lead={<Signature advice={state.advice === true} />}
                  />
                </div>
              </Labelled>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Signature({ advice }: { advice: boolean }) {
  return (
    <p className="text-micro max-w-[60ch]">
      <span style={{ color: "var(--ink-700)" }}>{ASK_SIGNATURE}</span>
      {advice && ` · ${ASK_NO_ADVICE_SENTENCE}`}
    </p>
  );
}

/** The footer as it shipped in PR #455: the signature, then the thumbs. */
function OldFooter({
  feedback,
  advice,
}: {
  feedback: AskFeedback | null;
  advice: boolean;
}) {
  const thumb = (pressed: boolean, children: ReactNode, label: string) => (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      className={cn(
        "inline-flex size-7 cursor-pointer items-center justify-center rounded-[var(--radius-button)]",
        "transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)]",
        pressed && "bg-[var(--surface-subtle)]",
      )}
      style={{ color: pressed ? "var(--blue)" : "var(--ink-500)" }}
    >
      {children}
    </button>
  );
  return (
    <div className="flex flex-col gap-1.5">
      <Signature advice={advice} />
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-1">
          {thumb(
            feedback?.rating === "up",
            <ThumbsUp className="size-3.5" aria-hidden="true" />,
            "Good answer",
          )}
          {thumb(
            feedback?.rating === "down",
            <ThumbsDown className="size-3.5" aria-hidden="true" />,
            "Bad answer",
          )}
          <p className="text-micro ml-1">
            {feedback?.rating === "up" && (
              <span style={{ color: "var(--ink-500)" }}>
                Thanks — kept to help improve Ask.
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Points ──────────────────────────────────────────────────────────────────

const VARIANTS: {
  id: string;
  name: string;
  summary: string;
  render: () => ReactNode;
}[] = [
  {
    id: "current",
    name: "0 · Shipped now (was the card list)",
    summary:
      "The real AskPointList, which now draws I, the picked compact line. It used to be the Video tab's rows in a card: every row repeated the 30px mark and a 'Point 8 · Lindqvist served' line, under a heading floating outside the card. A through D below were the first alternatives to that list.",
    render: () => (
      <AskPointList
        match={MATCH}
        points={POINTS}
        filters="x"
        counted
        href="#watch"
      />
    ),
  },
  {
    id: "tidy",
    name: "A · Tidy card",
    summary:
      "The least change: the same card and row vocabulary as the Video tab, so the two still read as one list. The heading and Watch all move inside the card; the server moves to the game header, where it belongs; the detail line goes, so rows drop from 52px to 40px and the mark from 30px to 22px. The play glyph appears on hover and focus.",
    render: () => <TidyCard />,
  },
  {
    id: "ledger",
    name: "B · Ledger",
    summary:
      "No card: a hairline table in the answer's own flow, like the sources above it. Score first, in mono, so the eye runs down the game the way it was played; the result beside it; who won as a small mark at the edge. 36px rows — sixteen points fit where the current list fits nine.",
    render: () => <Ledger />,
  },
  {
    id: "strips",
    name: "C · Game strips",
    summary:
      "One line per game, its points as chips in order: the score going in, the result abbreviated. A filled chip is a point Lindqvist won, an outlined one Hale's. Reads as the story of each game at a glance; the full result is in each chip's link label, not on screen. Densest by far — a whole set fits in a screen.",
    render: () => <GameStrips />,
  },
  {
    id: "timeline",
    name: "D · Timeline",
    summary:
      "A rail down the left, a node per game and a dot per point — filled for Lindqvist, hollow for Hale — so runs of points read as runs of dots. The quietest layout: no card, no marks, no repeated names.",
    render: () => <Timeline />,
  },
];

function PointsSection() {
  return (
    <section id="points" className="flex scroll-mt-6 flex-col gap-4">
      <SectionHead
        title="Points list — first round"
        body="What 'Show me' opens over one match. The same sixteen points in each: three games, one point the video never timed (19, drawn muted with no link). Every row is still a link into the film on that point."
      />
      <div className="grid gap-4 xl:grid-cols-2">
        {VARIANTS.map((variant) => (
          <div
            key={variant.id}
            id={`points-${variant.id}`}
            className="flex flex-col gap-5 rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] p-4 sm:p-6"
          >
            <div className="flex flex-col gap-1">
              <h3 className="text-body font-medium">{variant.name}</h3>
              <p className="text-body-sm max-w-[70ch]">{variant.summary}</p>
            </div>
            {variant.render()}
          </div>
        ))}
      </div>
    </section>
  );
}

/** The winner's mark at a given size: the workspace's own, or initials. */
function WinnerMark({ won, size }: { won: boolean; size: "sm" | "md" }) {
  const box =
    size === "md"
      ? "size-[22px] rounded-[5px] text-[10px]"
      : "size-[18px] rounded-[4px] text-[9px]";
  return won ? (
    <WorkspaceMark workspace={WORKSPACE.active} className={box} />
  ) : (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center bg-[var(--surface-subtle)] font-medium text-[var(--ink-700)]",
        box,
      )}
    >
      MH
    </span>
  );
}

function PointLink({
  point,
  className,
  children,
}: {
  point: AskShowPoint;
  className: string;
  children: ReactNode;
}) {
  const n = point.pointNumber;
  const label = `${point.resultType ?? `Point ${n}`} — watch point ${n}`;
  if (point.videoTime === null) {
    return (
      <div className={cn(className, "cursor-default opacity-45")}>
        {children}
      </div>
    );
  }
  return (
    <Link
      href={pointHref(n)}
      aria-label={label}
      className={cn(
        className,
        "group/row cursor-pointer no-underline outline-none focus-visible:shadow-[var(--focus-ring)]",
      )}
    >
      {children}
    </Link>
  );
}

function HoverPlay({ seekable }: { seekable: boolean }) {
  return (
    <Play
      className={cn(
        "size-3.5 shrink-0 transition-opacity duration-200",
        seekable
          ? "text-[var(--ink-500)] opacity-0 group-hover/row:opacity-100 group-focus-visible/row:opacity-100"
          : "opacity-0",
      )}
      strokeWidth={1.5}
      aria-hidden="true"
    />
  );
}

function WatchAll() {
  return (
    <Link
      href="#watch"
      className="rounded-sm text-[11px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] outline-none hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)]"
    >
      Watch all
    </Link>
  );
}

const server = (game: Game) => (game.youServed ? YOU : OPP);

// A · Tidy card ───────────────────────────────────────────────────────────────

function TidyCard() {
  const t = LIST_TONE.light;
  const r = ROW_TONE.light;
  return (
    <section className="flex max-w-[420px] flex-col">
      <div className="surface-card flex flex-col" style={t.rootStyle}>
        <div className="mx-1 flex items-center gap-3 border-b border-[var(--border-hairline)] px-2 pt-1 pb-2.5">
          <h4 className="eyebrow-sm min-w-0 flex-1">{HEADING}</h4>
          <WatchAll />
        </div>
        {GAMES.map((game) => (
          <div key={game.key} className="flex flex-col">
            <div className={t.gameHeader}>
              <span className={t.gameLabel}>
                {game.label} · {server(game)} serving
              </span>
              <div className="flex-1" />
              <span className={t.gameMeta}>{game.before}</span>
            </div>
            {game.points.map((point) => (
              <PointLink
                key={point.pointNumber}
                point={point}
                className={cn(
                  "relative flex min-h-[40px] items-center gap-3 rounded-[var(--radius-element)] px-3 py-1 transition-colors duration-200",
                  point.videoTime !== null &&
                    "hover:bg-[var(--surface-subtle)]",
                )}
              >
                <WinnerMark won={point.iWon === true} size="md" />
                <span className={cn(r.title, "min-w-0 flex-1")}>
                  {point.resultType}
                </span>
                <span
                  className="text-scoreboard-sm tabular min-w-[44px] text-right"
                  style={r.scoreStyle}
                >
                  {point.pointScore}
                </span>
                <HoverPlay seekable={point.videoTime !== null} />
              </PointLink>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

// B · Ledger ──────────────────────────────────────────────────────────────────

function Ledger() {
  return (
    <section className="flex max-w-[520px] flex-col">
      <div className="flex items-center gap-3 pb-2">
        <h4 className="text-body-sm min-w-0 flex-1 font-medium text-[var(--ink-900)]">
          {HEADING}
        </h4>
        <WatchAll />
      </div>
      <div className="flex flex-col border-t border-[var(--border-hairline)]">
        {GAMES.map((game) => (
          <div key={game.key} className="flex flex-col">
            <div className="flex h-9 items-end gap-2 border-b border-[var(--border-hairline)] pb-1.5">
              <span className="text-micro font-medium">
                <span style={{ color: "var(--ink-900)" }}>{game.label}</span>
              </span>
              <span className="text-micro">{server(game)} serving</span>
              <div className="flex-1" />
              <span className="mono tabular text-[10px] text-[var(--ink-400)]">
                {game.before} → {game.after}
              </span>
            </div>
            {game.points.map((point) => (
              <PointLink
                key={point.pointNumber}
                point={point}
                className={cn(
                  "grid h-9 grid-cols-[48px_minmax(0,1fr)_18px_14px] items-center gap-3 border-b border-[var(--border-hairline)] px-1 transition-colors duration-200",
                  point.videoTime !== null &&
                    "hover:bg-[var(--surface-subtle)]",
                )}
              >
                <span className="mono tabular text-[12px] text-[var(--ink-500)]">
                  {point.pointScore}
                </span>
                <span className="truncate text-[12px] text-[var(--ink-900)]">
                  {point.resultType}
                </span>
                <WinnerMark won={point.iWon === true} size="sm" />
                <HoverPlay seekable={point.videoTime !== null} />
              </PointLink>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

// C · Game strips ─────────────────────────────────────────────────────────────

function GameStrips() {
  return (
    <section className="flex max-w-[560px] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <h4 className="text-body-sm min-w-0 flex-1 font-medium text-[var(--ink-900)]">
          {HEADING}
        </h4>
        <span className="text-micro inline-flex items-center gap-1.5">
          <span className="size-2 rounded-[2px] bg-[var(--ink-900)]" />
          {YOU}
          <span className="ml-2 size-2 rounded-[2px] border border-[var(--ink-400)]" />
          {OPP}
        </span>
        <WatchAll />
      </div>
      <div className="flex flex-col">
        {GAMES.map((game) => (
          <div
            key={game.key}
            className="flex gap-4 border-t border-[var(--border-hairline)] py-3"
          >
            <div className="flex w-[76px] shrink-0 flex-col gap-0.5 pt-0.5">
              <span className="mono text-[9px] tracking-[1.4px] text-[var(--ink-400)] uppercase">
                S{game.points[0].setNumber} · G{game.points[0].gameNumber}
              </span>
              <span className="text-micro">{server(game)} srv</span>
              <span className="mono tabular text-[10px] text-[var(--ink-500)]">
                {game.after}
              </span>
            </div>
            <ol className="flex min-w-0 flex-wrap gap-1.5">
              {game.points.map((point) => {
                const won = point.iWon === true;
                return (
                  <li key={point.pointNumber}>
                    <PointLink
                      point={point}
                      className={cn(
                        "flex h-[44px] min-w-[58px] flex-col justify-center gap-0.5 rounded-[var(--radius-element)] border px-2 transition-colors duration-200",
                        won
                          ? "border-[var(--ink-900)] bg-[var(--ink-900)] hover:bg-[var(--ink-700)]"
                          : "border-[var(--border-medium)] bg-[var(--surface-card)] hover:bg-[var(--surface-subtle)]",
                      )}
                    >
                      <span
                        className="mono tabular text-[10px]"
                        style={{
                          color: won
                            ? "rgba(255,255,255,0.6)"
                            : "var(--ink-400)",
                        }}
                      >
                        {point.pointScore}
                      </span>
                      <span
                        className="text-[12px] font-medium"
                        style={{ color: won ? "#fff" : "var(--ink-900)" }}
                      >
                        {shortResult(point.resultType)}
                      </span>
                    </PointLink>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}

// D · Timeline ────────────────────────────────────────────────────────────────

function Timeline() {
  return (
    <section className="flex max-w-[460px] flex-col gap-3">
      <div className="flex items-center gap-3">
        <h4 className="text-body-sm min-w-0 flex-1 font-medium text-[var(--ink-900)]">
          {HEADING}
        </h4>
        <WatchAll />
      </div>
      <div className="relative flex flex-col">
        <span
          aria-hidden="true"
          className="absolute top-2 bottom-2 left-[5px] w-px bg-[var(--border-medium)]"
        />
        {GAMES.map((game) => (
          <div key={game.key} className="flex flex-col pb-2">
            <div className="relative flex items-center gap-2 py-1.5 pl-6">
              <span
                aria-hidden="true"
                className="absolute top-1/2 left-0 size-[11px] -translate-y-1/2 rounded-full border-2 border-[var(--ink-900)] bg-[var(--surface-card)]"
              />
              <span className="text-micro font-medium">
                <span style={{ color: "var(--ink-900)" }}>{game.label}</span>
              </span>
              <span className="text-micro">· {server(game)} serving</span>
              <div className="flex-1" />
              <span className="mono tabular text-[10px] text-[var(--ink-400)]">
                {game.before} → {game.after}
              </span>
            </div>
            {game.points.map((point) => {
              const won = point.iWon === true;
              return (
                <PointLink
                  key={point.pointNumber}
                  point={point}
                  className={cn(
                    "relative flex h-8 items-center gap-3 rounded-[var(--radius-element)] pr-2 pl-6 transition-colors duration-200",
                    point.videoTime !== null &&
                      "hover:bg-[var(--surface-subtle)]",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute top-1/2 left-[2px] size-[7px] -translate-y-1/2 rounded-full",
                      won
                        ? "bg-[var(--ink-900)]"
                        : "border border-[var(--ink-400)] bg-[var(--surface-card)]",
                    )}
                  />
                  <span className="mono tabular w-[44px] shrink-0 text-[11px] text-[var(--ink-400)]">
                    {point.pointScore}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink-900)]">
                    {point.resultType}
                  </span>
                  <span className="text-micro shrink-0">{won ? YOU : OPP}</span>
                  <HoverPlay seekable={point.videoTime !== null} />
                </PointLink>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Points, compact ─────────────────────────────────────────────────────────
// In a chat answer the list is a footnote, not the answer: at rest it should
// take a line or two, and the full list belongs to the Video tab it opens.

/** Total film length of the points, for "about 3 min". */
const PLAY_MINUTES = Math.max(
  1,
  Math.round(
    POINTS.reduce((sum, point) => sum + (point.duration ?? 0), 0) / 60,
  ),
);

const GAME_SPAN = `Set ${GAMES[0].points[0].setNumber} · games ${
  GAMES[0].points[0].gameNumber
}–${GAMES[GAMES.length - 1].points[0].gameNumber}`;

const COMPACT: {
  id: string;
  name: string;
  summary: string;
  render: () => ReactNode;
}[] = [
  {
    id: "link",
    name: "I · Just the link",
    summary:
      "The list is gone. One line: a play glyph and 'Watch the 16 points', which opens the Video tab on them as a playlist, with where they fall and how long they run beside it in grey. The answer's own words already say what the points are.",
    render: () => <JustTheLink />,
  },
  {
    id: "row",
    name: "J · Playlist row",
    summary:
      "The same link, given a little more presence: one hairline row with a play button, the count, and the span and running time under it. Still a single target, still one line of height in the chat.",
    render: () => <PlaylistRow />,
  },
  {
    id: "strip",
    name: "K · Link and point strip",
    summary:
      "The link, then a strip of small squares, one per point, grouped by game: filled for Lindqvist's points, outlined for Hale's. Each square plays its own point. Shows the shape of the run in one line without listing anything.",
    render: () => <PointStrip />,
  },
  {
    id: "disclose",
    name: "L · Link, list on request",
    summary:
      "The link at rest, with 'Show the 16 points' beside it. The quiet plain-lines list (E) opens under it only when asked, and folds away again. Compact by default, with nothing taken away.",
    render: () => <LinkThenList />,
  },
];

function CompactSection() {
  return (
    <section id="compact" className="flex scroll-mt-6 flex-col gap-4">
      <SectionHead
        title="Points list — compact"
        body="For an answer in a chat. Each takes a line or two at rest, and every one opens the same playlist the current Watch all does. Shown inside a slice of answer so the weight is judged in place."
      />
      <div className="grid gap-4 xl:grid-cols-2">
        {COMPACT.map((variant) => (
          <div
            key={variant.id}
            id={`compact-${variant.id}`}
            className="flex flex-col gap-5 rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] p-4 sm:p-6"
          >
            <div className="flex flex-col gap-1">
              <h3 className="text-body font-medium">{variant.name}</h3>
              <p className="text-body-sm max-w-[70ch]">{variant.summary}</p>
            </div>
            <AnswerSlice>{variant.render()}</AnswerSlice>
          </div>
        ))}
      </div>
    </section>
  );
}

/** The last paragraph of an answer and its footer, around a variant. */
function AnswerSlice({ children }: { children: ReactNode }) {
  return (
    <div className="flex max-w-[560px] flex-col gap-3 border-l border-[var(--border-hairline)] pl-4">
      <p className="text-body text-pretty" style={{ lineHeight: 1.65 }}>
        You won 10 of the 16 points across these three games and held serve both
        times.
      </p>
      {children}
      <AskFeedbackControl
        feedback={null}
        onRate={rate}
        lead={<Signature advice={false} />}
      />
    </div>
  );
}

const watchCopy = `Watch the ${POINTS.length} points`;

// I · Just the link ───────────────────────────────────────────────────────────

function JustTheLink() {
  return (
    <p className="text-body-sm flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <Link
        href="#watch"
        className="inline-flex items-center gap-1.5 rounded-sm font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] outline-none hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)]"
      >
        <Play className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
        {watchCopy}
      </Link>
      <span className="text-micro">
        {GAME_SPAN} · about {PLAY_MINUTES} min
      </span>
    </p>
  );
}

// J · Playlist row ────────────────────────────────────────────────────────────

function PlaylistRow() {
  return (
    <Link
      href="#watch"
      className="group/row flex max-w-[420px] items-center gap-3 rounded-[var(--radius-element)] border border-[var(--border-hairline)] px-3 py-2 no-underline transition-colors duration-200 outline-none hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)]"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--ink-900)]">
        <Play
          className="ml-px size-3.5 fill-white text-white"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[13px] font-medium text-[var(--ink-900)]">
          {watchCopy}
        </span>
        <span className="text-micro truncate">
          {GAME_SPAN} · about {PLAY_MINUTES} min
        </span>
      </span>
    </Link>
  );
}

// K · Link and point strip ────────────────────────────────────────────────────

function PointStrip() {
  return (
    <div className="flex flex-col gap-2">
      <JustTheLink />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {GAMES.map((game) => (
          <ol
            key={game.key}
            aria-label={`${game.label}, ${outcomeOf(game)}`}
            className="flex items-center gap-[3px]"
          >
            {game.points.map((point) => {
              const won = point.iWon === true;
              const square = (
                <span
                  aria-hidden="true"
                  className={cn(
                    "block size-[10px] rounded-[2px] transition-transform duration-200",
                    won
                      ? "bg-[var(--ink-900)]"
                      : "border border-[var(--ink-400)]",
                    point.videoTime === null && "opacity-30",
                  )}
                />
              );
              return (
                <li key={point.pointNumber}>
                  {point.videoTime === null ? (
                    <span className="flex size-4 items-center justify-center">
                      {square}
                    </span>
                  ) : (
                    <Link
                      href={pointHref(point.pointNumber)}
                      aria-label={`${point.resultType} at ${point.pointScore} — watch point ${point.pointNumber}`}
                      className="flex size-4 items-center justify-center rounded-[3px] outline-none hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)]"
                    >
                      {square}
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        ))}
        <span className="text-micro">
          <span style={{ color: "var(--ink-900)" }}>■</span> {YOU} ·{" "}
          <span style={{ color: "var(--ink-400)" }}>□</span> {OPP}
        </span>
      </div>
    </div>
  );
}

// L · Link, list on request ───────────────────────────────────────────────────

function LinkThenList() {
  return (
    <details className="group/list flex flex-col">
      <summary className="flex list-none flex-wrap items-center gap-x-3 gap-y-0.5 [&::-webkit-details-marker]:hidden">
        <JustTheLink />
        <span className="text-body-sm inline-flex cursor-pointer items-center gap-0.5 rounded-sm text-[var(--ink-500)] transition-colors duration-200 hover:text-[var(--ink-900)]">
          <span className="group-open/list:hidden">
            Show the {POINTS.length} points
          </span>
          <span className="hidden group-open/list:inline">Hide them</span>
          <ChevronRight
            className="size-3.5 transition-transform duration-200 group-open/list:rotate-90"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </span>
      </summary>
      <div className="pt-3">
        <PlainLines bare />
      </div>
    </details>
  );
}

// ── Points, quieter ─────────────────────────────────────────────────────────
// What the list is for: find a point, play it. A row needs its result and its
// score; the game is context; who served is the game's, said once; who won is
// carried by ink alone — Lindqvist's points in ink, Hale's receding.

/** "Lindqvist held to love" / "Hale broke" — the game in three words. */
function outcomeOf(game: Game): string {
  const serverWon = game.points[game.points.length - 1].iWon === game.youServed;
  const winnerIsYou = serverWon === game.youServed;
  const loserPoints = game.points.filter(
    (point) => (point.iWon === true) !== winnerIsYou,
  ).length;
  if (!serverWon) return `${game.youServed ? OPP : YOU} broke`;
  return `${server(game)} held${loserPoints === 0 ? " to love" : ""}`;
}

/** Ink by who won the point: the one encoding the quiet layouts keep. */
const wonInk = (point: AskShowPoint) =>
  point.iWon === true ? "var(--ink-900)" : "var(--ink-500)";

/** "Forehand Unforced Error" → "forehand unforced error", for a sentence. */
const lower = (result: string | null) => (result ?? "point").toLowerCase();

const QUIET: {
  id: string;
  name: string;
  summary: string;
  render: () => ReactNode;
}[] = [
  {
    id: "lines",
    name: "E · Plain lines",
    summary:
      "Nothing but the points. One line each: the result, and the score going in at the edge. No card, no marks, no rules. Who won is ink: Lindqvist's points are dark, Hale's grey. A game is a muted label and a breath of space, with the server said once.",
    render: () => <PlainLines />,
  },
  {
    id: "sentences",
    name: "F · Game sentences",
    summary:
      "Each game reads like the answer above it: what happened, then its points as a run of words, each one a link to that point's film. The quietest on screen, and the closest to the answer's own voice, though the score of each point is gone (it is in the link's label).",
    render: () => <GameSentences />,
  },
  {
    id: "folded",
    name: "G · Folded games",
    summary:
      "One line per game at rest — label, what happened, the games after — and its points open beneath it on a click. The first game opens by itself. Long lists stay short; the reader opens the game they care about.",
    render: () => <FoldedGames />,
  },
  {
    id: "scoresheet",
    name: "H · Scoresheet",
    summary:
      "Two columns and nothing else: the score in mono, then the result. The game label sits in the score column's gutter on its first point only, so the eye runs straight down the match. Who won is ink, as in E.",
    render: () => <Scoresheet />,
  },
];

function QuietSection() {
  return (
    <section id="quiet" className="flex scroll-mt-6 flex-col gap-4">
      <SectionHead
        title="Points list — quieter, distilled"
        body="Four takes that strip the list back. All drop the 30px marks, the per-row 'served' line and the card. Who won survives as ink weight alone, with one key under the heading. Rows are still links into the film, and point 19, never timed, is still muted with no link."
      />
      <div className="grid gap-4 xl:grid-cols-2">
        {QUIET.map((variant) => (
          <div
            key={variant.id}
            id={`quiet-${variant.id}`}
            className="flex flex-col gap-5 rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] p-4 sm:p-6"
          >
            <div className="flex flex-col gap-1">
              <h3 className="text-body font-medium">{variant.name}</h3>
              <p className="text-body-sm max-w-[70ch]">{variant.summary}</p>
            </div>
            {variant.render()}
          </div>
        ))}
      </div>
    </section>
  );
}

/** The heading every quiet layout shares: the count, the key, Watch all. */
function QuietHead() {
  return (
    <div className="flex items-baseline gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h4 className="text-body-sm font-medium text-[var(--ink-900)]">
          {HEADING}
        </h4>
        <p className="text-micro">
          <span style={{ color: "var(--ink-900)" }}>{YOU}</span>&apos;s points
          in ink, {OPP}&apos;s in grey
        </p>
      </div>
      <WatchAll />
    </div>
  );
}

// E · Plain lines ─────────────────────────────────────────────────────────────

/** `bare` drops the heading, for L, where the link above already is one. */
function PlainLines({ bare = false }: { bare?: boolean }) {
  return (
    <section className="flex max-w-[420px] flex-col gap-4">
      {!bare && <QuietHead />}
      <div className="flex flex-col gap-4">
        {GAMES.map((game) => (
          <div key={game.key} className="flex flex-col">
            <p className="text-micro pb-1">
              {game.label} · {server(game)} serving
            </p>
            {game.points.map((point) => (
              <PointLink
                key={point.pointNumber}
                point={point}
                className={cn(
                  "-mx-2 flex h-8 items-center gap-3 rounded-[var(--radius-element)] px-2 transition-colors duration-200",
                  point.videoTime !== null &&
                    "hover:bg-[var(--surface-subtle)]",
                )}
              >
                <span
                  className="min-w-0 flex-1 truncate text-[13px]"
                  style={{ color: wonInk(point) }}
                >
                  {point.resultType}
                </span>
                <span className="mono tabular text-[11px] text-[var(--ink-400)]">
                  {point.pointScore}
                </span>
                <HoverPlay seekable={point.videoTime !== null} />
              </PointLink>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

// F · Game sentences ──────────────────────────────────────────────────────────

function GameSentences() {
  return (
    <section className="flex max-w-[520px] flex-col gap-4">
      <QuietHead />
      <div className="flex flex-col gap-4">
        {GAMES.map((game) => (
          <div key={game.key} className="flex flex-col gap-1">
            <p className="text-micro">
              {game.label} ·{" "}
              <span style={{ color: "var(--ink-700)" }}>{outcomeOf(game)}</span>{" "}
              · {game.after}
            </p>
            <p className="text-body-sm" style={{ lineHeight: 1.7 }}>
              {game.points.map((point, index) => {
                const word =
                  index === 0
                    ? (point.resultType ?? "Point")
                    : lower(point.resultType);
                const sep = index < game.points.length - 1 ? ", " : ".";
                return (
                  <span key={point.pointNumber}>
                    {point.videoTime === null ? (
                      <span style={{ color: "var(--ink-300)" }}>{word}</span>
                    ) : (
                      <Link
                        href={pointHref(point.pointNumber)}
                        aria-label={`${point.resultType} at ${point.pointScore} — watch point ${point.pointNumber}`}
                        className="rounded-sm underline decoration-[var(--border-medium)] decoration-1 underline-offset-[3px] transition-colors duration-200 outline-none hover:decoration-[var(--ink-500)] focus-visible:shadow-[var(--focus-ring)]"
                        style={{ color: wonInk(point) }}
                      >
                        {word}
                      </Link>
                    )}
                    <span style={{ color: "var(--ink-400)" }}>{sep}</span>
                  </span>
                );
              })}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

// G · Folded games ────────────────────────────────────────────────────────────

function FoldedGames() {
  return (
    <section className="flex max-w-[420px] flex-col gap-3">
      <QuietHead />
      <div className="flex flex-col">
        {GAMES.map((game, index) => (
          <details
            key={game.key}
            open={index === 0}
            className="group/game border-t border-[var(--border-hairline)] last:border-b"
          >
            <summary className="-mx-2 flex h-10 cursor-pointer list-none items-center gap-3 rounded-[var(--radius-element)] px-2 outline-none hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] [&::-webkit-details-marker]:hidden">
              <ChevronRight
                className="size-3.5 shrink-0 text-[var(--ink-400)] transition-transform duration-200 group-open/game:rotate-90"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <span className="text-[13px] text-[var(--ink-900)]">
                {game.label}
              </span>
              <span className="text-micro min-w-0 flex-1 truncate">
                {outcomeOf(game)}
              </span>
              <span className="mono tabular text-[11px] text-[var(--ink-400)]">
                {game.after}
              </span>
            </summary>
            <div className="flex flex-col pb-2 pl-[26px]">
              {game.points.map((point) => (
                <PointLink
                  key={point.pointNumber}
                  point={point}
                  className={cn(
                    "-mx-2 flex h-8 items-center gap-3 rounded-[var(--radius-element)] px-2 transition-colors duration-200",
                    point.videoTime !== null &&
                      "hover:bg-[var(--surface-subtle)]",
                  )}
                >
                  <span className="mono tabular w-[40px] shrink-0 text-[11px] text-[var(--ink-400)]">
                    {point.pointScore}
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate text-[12px]"
                    style={{ color: wonInk(point) }}
                  >
                    {point.resultType}
                  </span>
                  <HoverPlay seekable={point.videoTime !== null} />
                </PointLink>
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

// H · Scoresheet ──────────────────────────────────────────────────────────────

function Scoresheet() {
  return (
    <section className="flex max-w-[420px] flex-col gap-4">
      <QuietHead />
      <div className="flex flex-col gap-3">
        {GAMES.map((game) => (
          <div
            key={game.key}
            className="grid grid-cols-[52px_minmax(0,1fr)] gap-x-4"
          >
            <div className="flex flex-col pt-[7px]">
              <span className="mono text-[9px] tracking-[1.4px] text-[var(--ink-400)] uppercase">
                G{game.points[0].gameNumber}
              </span>
              <span className="text-micro">{server(game)}</span>
            </div>
            <div className="flex flex-col">
              {game.points.map((point) => (
                <PointLink
                  key={point.pointNumber}
                  point={point}
                  className={cn(
                    "-mx-2 grid h-7 grid-cols-[44px_minmax(0,1fr)_14px] items-center gap-3 rounded-[var(--radius-element)] px-2 transition-colors duration-200",
                    point.videoTime !== null &&
                      "hover:bg-[var(--surface-subtle)]",
                  )}
                >
                  <span className="mono tabular text-[11px] text-[var(--ink-400)]">
                    {point.pointScore}
                  </span>
                  <span
                    className="truncate text-[12px]"
                    style={{ color: wonInk(point) }}
                  >
                    {point.resultType}
                  </span>
                  <HoverPlay seekable={point.videoTime !== null} />
                </PointLink>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Shared chrome ───────────────────────────────────────────────────────────

function SectionHead({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col gap-1 px-1">
      <h2 className="text-title">{title}</h2>
      <p className="text-body-sm max-w-[80ch]">{body}</p>
    </div>
  );
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-micro">{label}</span>
      {children}
    </div>
  );
}
