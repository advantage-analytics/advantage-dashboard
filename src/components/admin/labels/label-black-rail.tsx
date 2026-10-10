"use client";

import {
  Fragment,
  useMemo,
  useState,
  type FocusEvent,
  type RefObject,
} from "react";
import { Flag, Maximize2, Minimize2 } from "lucide-react";
import { reducedMotionNow } from "@/components/dashboard/matches/match-detail/film/film-motion";
import type { FollowAffordance } from "@/components/dashboard/matches/match-detail/film/film-timeline";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { FloatMenu, FloatMenuItem } from "@/components/ui/float-menu";
import { TooltipProvider } from "@/components/ui/tooltip";
import type {
  LabelPointPatch,
  LabelShotPatch,
} from "@/lib/services/labels/edit";
import {
  gameOverflow,
  planGameShift,
  type GameOverflow,
  type GameShiftSummary,
} from "@/lib/services/labels/game-shift";
import type { LabelMarks } from "@/lib/services/labels/marks";
import {
  SCORE_MISMATCH_ANSWERS,
  SCORE_MISMATCH_LABEL,
  findGapDescription,
  onPointsDetail,
  scoreMismatchDetail,
  toCheckLabel,
} from "@/lib/services/labels/marks-copy";
import { markSummary } from "@/lib/services/labels/marks-state";
import type { LabelGame } from "@/lib/services/labels/operations";
import {
  bandsBeforePoints,
  gameKey,
  type LabelScores,
} from "@/lib/services/labels/score";
import type {
  LabelGameType,
  LabelPoint,
  LabelSide,
  MatchScore,
} from "@/lib/services/labels/session";
import {
  enteredScore,
  formatSets,
  labelSetScores,
  mismatchGameKey,
  scoreMismatch,
  scoreMismatchSentence,
  scoreReasonText,
  type LabelScoreMismatch,
} from "@/lib/services/labels/set-scores";
import { cn } from "@/lib/utils";
import { LabelFollowPill } from "./label-follow-pill";
import { useRowInView } from "./use-row-in-view";
import { LabelGameBand } from "./label-game-band";
import {
  BlackGameUnderflow,
  underflowAfterPoints,
  type UnderflowSlot,
} from "./label-game-underflow";
import {
  BlackDeletedPoint,
  BlackGameOverflow,
  BlackPointRow,
  BlackSuggestedPoint,
  openPointSuggestions,
} from "./label-black-point-row";
import { BlackShotsWell } from "./label-black-shot-row";
import type { SideNames } from "./label-format";
import { RAIL_TONE_CLASS, type RailTone } from "./label-rail-tone";
import type {
  EditContext,
  LabelRowOperations,
  PlayingWindow,
} from "./label-row-parts";
import { LabelSaveStatus } from "./label-save-status";
import type { SaveStatus } from "./save-status";

/**
 * The points rail: the Video tab's list in a dark or light tone, carrying
 * labels.
 *
 * A 46px header (title, checked count, the match's total of open count marks,
 * score chip, save line, full-screen buttons) over the ONE scroller
 * (`data-label-rail-scroller`) that the console's follow scroll moves. Rows are
 * built for 520px and up; the scroller never scrolls sideways.
 *
 * Stateless but for its memos and the chip's open state: every callback is the
 * console's, unchanged. The rail hands its memoised rows one `edit`,
 * identity-stable callbacks, and the playhead only as each row's own `playing`
 * / `playingWindow` and the open well's `playingShotId`.
 *
 * `tone` (label-rail-tone.ts) is `dark` (full screen) or `light` (docked card):
 * the rail wears the palette on a `display: contents` wrapper and passes the
 * tone to its rows (`edit.tone`) and to every menu it portals. `showSession`
 * off swaps title, progress and save line for "Points" where the page header
 * has them.
 */

const HEADER_BUTTON =
  "flex size-[26px] shrink-0 cursor-pointer items-center justify-center rounded-[8px] text-white/70 transition-[color,background-color,scale] duration-200 hover:bg-white/[0.08] hover:text-white focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none active:scale-[0.96] active:duration-100 motion-reduce:active:scale-100";

export function LabelBlackRail({
  player1Name,
  player2Name,
  checked,
  total,
  saveStatus,
  tone = "dark",
  showSession = true,
  onExit,
  onFullScreen,
  scrollerRef,
  onFocusCapture,
  affordance,
  onFollow,
  points,
  scores,
  adScoring = true,
  playOnLets,
  names,
  marks = null,
  expandedPointId,
  onTogglePoint,
  editable = false,
  selectedShotId = null,
  onSelectShot,
  onPatchPoint,
  onPatchShot,
  operations,
  onRemoveShotsAfter,
  onRestoreShots,
  onSetGameServer,
  onSetGameType,
  openGhostIds = NO_IDS,
  onToggleGhost,
  playingPointId = null,
  playingShotId = null,
  playingWindow = null,
  finalScore = null,
  videoEndsEarly = null,
  matchScore = null,
  onFixEnteredScore,
  onVideoEndsEarly,
  onFindGap,
  onClearEnteredScore,
  onPullGame,
  onAddPoint,
}: {
  player1Name: string;
  player2Name: string;
  /** `labelProgress(points)`. */
  checked: number;
  total: number;
  saveStatus: SaveStatus;
  tone?: RailTone;
  /** Title, checked count and save line. False where the page shows them. */
  showSession?: boolean;
  /** Leave the full-screen view. Absent, there is no exit button. */
  onExit?: () => void;
  onFullScreen?: () => void;
  /** Lands on the scroller, for the console's follow scroll. */
  scrollerRef?: RefObject<HTMLDivElement | null>;
  /** The console's editor-focus hold, on the rows' frame. */
  onFocusCapture?: (event: FocusEvent<HTMLDivElement>) => void;
  /** The "Now playing" pill's words while held; null for no pill. */
  affordance: FollowAffordance | null;
  onFollow: () => void;
  points: readonly LabelPoint[];
  /** `labelScores(points, adScoring)`, computed once by the console. */
  scores: LabelScores;
  adScoring?: boolean;
  /** `session.playOnLets`: false offers `Let` on a serve row's result. */
  playOnLets?: boolean;
  names: SideNames;
  /** The session's marks. Null draws no chip, hover line or suggestion. */
  marks?: LabelMarks | null;
  expandedPointId: string | null;
  onTogglePoint?: (pointId: string) => void;
  editable?: boolean;
  selectedShotId?: string | null;
  /** `target` opens the court on that end: a position cell was clicked. */
  onSelectShot?: (shotId: string, target?: "contact" | "landing") => void;
  onPatchPoint?: (pointId: string, patch: LabelPointPatch) => void;
  onPatchShot?: (shotId: string, patch: LabelShotPatch) => void;
  /** Absent: no ⋯ menu, no tick, no Add shot — the rows are read-only. */
  operations?: LabelRowOperations;
  /** The hint line's Remove and Restore (`EditContext`); absent read-only. */
  onRemoveShotsAfter?: EditContext["onRemoveShotsAfter"];
  onRestoreShots?: EditContext["onRestoreShots"];
  onSetGameServer?: (game: LabelGame, server: LabelSide) => void;
  onSetGameType?: (game: LabelGame, type: LabelGameType) => void;
  /** Ghosts shown as their struck-through row (the console's state). */
  openGhostIds?: ReadonlySet<string>;
  onToggleGhost?: (id: string) => void;
  playingPointId?: string | null;
  playingShotId?: string | null;
  playingWindow?: PlayingWindow | null;
  /**
   * The score chip's reading: the score the labeller entered, whether they said
   * the video ends early, and the match record's score as the fallback.
   */
  finalScore?: number[][] | null;
  videoEndsEarly?: boolean | null;
  matchScore?: MatchScore | null;
  /**
   * The chip's answers. Given all three, the chip opens a menu of them; absent,
   * it is words alone. `onFixEnteredScore` gets the labelled sets as `[p1, p2]`
   * pairs, as `final_score` stores them.
   */
  onFixEnteredScore?: (finalScore: number[][]) => void;
  onVideoEndsEarly?: () => void;
  onFindGap?: (pointId: string | null) => void;
  /**
   * Forget the entered score (`final_score: null`), so the match record's is
   * held against the rows again. Offered only while one is stored.
   */
  onClearEnteredScore?: () => void;
  /**
   * On an editable rail, the "isn't finished" slot after each game that ends
   * short (label-game-underflow.tsx). `onPullGame` gets the short game's key;
   * `onAddPoint` the row to insert after.
   */
  onPullGame?: (gameKey: string) => void;
  onAddPoint?: (afterPointId: string) => void;
}) {
  // The shots well unfolds for every point the labeller or the film opens,
  // never for the one already open when this rail mounted (the page loading, or
  // the layout switching).
  const [openAtMount] = useState(expandedPointId);
  const [openMoved, setOpenMoved] = useState(false);
  if (!openMoved && expandedPointId !== openAtMount) setOpenMoved(true);
  // The "Now playing" pill is the way back to a row out of sight; with the
  // playing point's row on screen it has nothing to point at.
  const playingRowInView = useRowInView(
    scrollerRef,
    affordance?.inCut ? playingPointId : null,
  );
  // The chip's arithmetic, over the same rows as the scoreboard: only with
  // marks built, not once the labeller has said the video ends early, and only
  // on a disagreement.
  const labelledSets = useMemo(
    () => labelSetScores(points, scores.games),
    [points, scores],
  );
  const mismatch =
    marks !== null && videoEndsEarly !== true
      ? scoreMismatch(labelledSets, enteredScore(finalScore, matchScore))
      : null;
  // The header's total, over every live row — marks, not points, as the
  // rows roll them up. Nothing on the marks-off session.
  const summary = useMemo(
    () => (marks ? markSummary(points, marks) : null),
    [points, marks],
  );
  // One object for every row, the same one until an input moves: the rows
  // are memoised, and a fresh context per render would re-render them all.
  // Nothing of the playhead is in it (`EditContext`).
  const pointScores = scores.points;
  const edit = useMemo<EditContext>(
    () => ({
      editable,
      names,
      selectedShotId,
      onSelectShot,
      onPatchPoint,
      onPatchShot,
      operations: editable ? operations : undefined,
      onRemoveShotsAfter: editable ? onRemoveShotsAfter : undefined,
      onRestoreShots: editable ? onRestoreShots : undefined,
      openGhostIds,
      onToggleGhost,
      points,
      scores: pointScores,
      adScoring,
      playOnLets,
      tone,
    }),
    [
      editable,
      names,
      selectedShotId,
      onSelectShot,
      onPatchPoint,
      onPatchShot,
      operations,
      onRemoveShotsAfter,
      onRestoreShots,
      openGhostIds,
      onToggleGhost,
      points,
      pointScores,
      adScoring,
      playOnLets,
      tone,
    ],
  );
  const bandBefore = useMemo(
    () => bandsBeforePoints(points, scores.games),
    [points, scores],
  );
  // The slots still waiting for an answer, by the point whose row follows.
  const slotBefore = useMemo(
    () => openPointSuggestions(points, marks),
    [points, marks],
  );
  // The games that run over, by their first leftover point. Read off the
  // labeller's own rows, so on every editable session — marks on or off.
  const overflowBefore = useMemo(
    () => (editable ? overflowBeforePoints(points, adScoring) : NO_OVERFLOW),
    [editable, points, adScoring],
  );
  // The games that end short, by their last live point. On the same sessions
  // as the slot above.
  const underflowAfter = useMemo(
    () => (editable ? underflowAfterPoints(points, adScoring) : NO_UNDERFLOW),
    [editable, points, adScoring],
  );
  // The chip's "Go to game": the band (or slot) carrying the game's key,
  // brought to the scroller's top.
  const goToGame = (gameKey: string) => {
    const root: ParentNode = scrollerRef?.current ?? document;
    const target = root.querySelector<HTMLElement>(
      `[data-game-key="${gameKey}"]`,
    );
    target?.scrollIntoView({
      block: "start",
      behavior: reducedMotionNow() ? "auto" : "smooth",
    });
  };

  return (
    <TooltipProvider>
      <div
        data-rail-palette={tone}
        className={cn("contents", RAIL_TONE_CLASS[tone])}
      >
        <div
          data-label-rail-header=""
          className="@container flex h-[46px] shrink-0 items-center gap-[10px] pr-[10px] pl-[14px] shadow-[inset_0_-1px_0_color-mix(in_oklab,var(--color-white)_8%,transparent)]"
        >
          <span
            data-label-rail-title=""
            className="truncate text-[12px] font-medium text-white"
          >
            {showSession ? `${player1Name} vs ${player2Name}` : "Points"}
          </span>
          {showSession ? (
            <span
              data-label-rail-progress=""
              className="mono tabular shrink-0 text-[10px] whitespace-nowrap text-white/45"
            >
              {checked} <span className="text-white/25">/</span> {total} checked
            </span>
          ) : null}
          {showSession ? (
            <span
              data-match-format=""
              className="shrink-0 text-[11px] whitespace-nowrap text-white/45"
            >
              <span className="text-white/25">·</span>{" "}
              {adScoring ? "Ad scoring" : "No-ad scoring"}{" "}
              <span className="text-white/25">·</span>{" "}
              {playOnLets ? "Lets: play on" : "Lets replayed"}
            </span>
          ) : null}
          {summary ? (
            <RailTotal
              count={summary.open}
              label={toCheckLabel(summary.open)}
              detail={onPointsDetail(summary.openPoints)}
              className={
                summary.open > 0 ? "text-[var(--rail-amber)]" : "text-white/45"
              }
            />
          ) : null}
          {mismatch ? (
            <ScoreChip
              mismatch={mismatch}
              tone={tone}
              stored={formatSets(labelledSets)}
              onGoToGame={goToGame}
              onFixEnteredScore={
                onFixEnteredScore && editable
                  ? () =>
                      onFixEnteredScore(
                        labelledSets.map((set) => [set.games[0], set.games[1]]),
                      )
                  : undefined
              }
              onVideoEndsEarly={editable ? onVideoEndsEarly : undefined}
              onFindGap={editable ? onFindGap : undefined}
              onClearEnteredScore={
                editable && finalScore !== null
                  ? onClearEnteredScore
                  : undefined
              }
            />
          ) : null}
          <span className="flex-1" />
          {showSession ? (
            <LabelSaveStatus status={saveStatus} tone={tone} />
          ) : null}
          {onFullScreen ? (
            <ChromeTooltip
              label="Full screen"
              detail="Fills the whole screen"
              side="bottom"
              align="end"
            >
              <button
                type="button"
                data-label-rail-full-screen=""
                aria-label="Full screen"
                onClick={onFullScreen}
                className={HEADER_BUTTON}
              >
                <Maximize2
                  className="size-3.5"
                  strokeWidth={1.6}
                  aria-hidden="true"
                />
              </button>
            </ChromeTooltip>
          ) : null}
          {onExit ? (
            <ChromeTooltip label="Exit full screen" side="bottom" align="end">
              <button
                type="button"
                data-label-black-exit=""
                aria-label="Exit full screen"
                onClick={onExit}
                className={HEADER_BUTTON}
              >
                <Minimize2
                  className="size-3.5"
                  strokeWidth={1.6}
                  aria-hidden="true"
                />
              </button>
            </ChromeTooltip>
          ) : null}
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            className="flex min-h-0 flex-1 flex-col"
            onFocusCapture={onFocusCapture}
          >
            <div
              ref={scrollerRef}
              data-label-rail-scroller=""
              className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-2"
            >
              {points.map((point) => {
                if (point.status === "deleted") {
                  return (
                    <BlackDeletedPoint
                      key={point.id}
                      point={point}
                      edit={edit}
                    />
                  );
                }
                const band = bandBefore.get(point.id);
                const slot = slotBefore.get(point.id);
                const overflow = overflowBefore.get(point.id);
                const short = underflowAfter.get(point.id);
                const open = point.id === expandedPointId;
                return (
                  <Fragment key={point.id}>
                    {band ? (
                      <LabelGameBand
                        band={band}
                        points={points}
                        names={names}
                        outcome={
                          bandOutcomeShown(band, scores.games)
                            ? band.outcome
                            : undefined
                        }
                        onSetGameType={editable ? onSetGameType : undefined}
                        onSetGameServer={editable ? onSetGameServer : undefined}
                        menu={tone}
                      />
                    ) : null}
                    {slot ? (
                      <BlackSuggestedPoint
                        suggestion={slot}
                        point={point}
                        edit={edit}
                      />
                    ) : null}
                    {overflow ? (
                      <BlackGameOverflow
                        overflow={overflow.overflow}
                        summary={overflow.summary}
                        point={point}
                        edit={edit}
                      />
                    ) : null}
                    <BlackPointRow
                      point={point}
                      open={open}
                      playing={point.id === playingPointId}
                      playingWindow={
                        point.id === playingPointId ? playingWindow : null
                      }
                      score={scores.points.get(point.id)?.scoreBefore ?? null}
                      onToggle={onTogglePoint}
                      edit={edit}
                      marks={marks}
                    >
                      {open ? (
                        <BlackShotsWell
                          point={point}
                          edit={edit}
                          marks={marks}
                          playingShotId={playingShotId}
                          animate={openMoved}
                        />
                      ) : null}
                    </BlackPointRow>
                    {short ? (
                      <BlackGameUnderflow
                        slot={short}
                        onPull={onPullGame}
                        onAddPoint={onAddPoint}
                      />
                    ) : null}
                  </Fragment>
                );
              })}
            </div>
          </div>

          {affordance && !playingRowInView ? (
            <LabelFollowPill
              affordance={affordance}
              onFollow={onFollow}
              tone={tone}
            />
          ) : null}
        </div>
      </div>
    </TooltipProvider>
  );
}

/** The header's total: a flag glyph and a count. Not a control. */
function RailTotal({
  count,
  label,
  detail,
  className,
}: {
  count: number;
  label: string;
  detail: string | undefined;
  className: string;
}) {
  return (
    <ChromeTooltip label={label} detail={detail} side="bottom">
      <span
        role="img"
        aria-label={label}
        data-label-rail-to-check=""
        className={cn(
          "mono tabular inline-flex shrink-0 items-center gap-1 text-[10px] whitespace-nowrap",
          className,
        )}
      >
        <Flag className="size-2.5" strokeWidth={1.8} aria-hidden="true" />
        {count}
      </span>
    </ChromeTooltip>
  );
}

/**
 * The score that doesn't add up, as a chip in the header: the sentence that
 * says which set, the labelled pair against the entered one and why ("Set 2:
 * labelled 4–5, entered 4–6 · game 5 unfinished (30–40)") in amber. Under
 * 600px of header the words give way and the dot stands alone.
 *
 * With the three answers it is a `FloatMenu` trigger in the rail's tone, led
 * by "Go to game N" when the sentence names one; they write only
 * `label_sessions` (`final_score`, `video_ends_early`), never `matches`.
 * "Fix the entered score" says what it will store; "Use the match score
 * again" (`onClearEnteredScore`) is offered only while a score is stored.
 * Without the answers the chip is a button that goes to the named game, or
 * words alone when none is named.
 */
function ScoreChip({
  mismatch,
  tone,
  stored,
  onGoToGame,
  onFixEnteredScore,
  onVideoEndsEarly,
  onFindGap,
  onClearEnteredScore,
}: {
  mismatch: LabelScoreMismatch;
  tone: RailTone;
  /** The labelled sets as "Fix the entered score" will store them: "6–3, 4–5". */
  stored: string;
  /** Scroll the rail to the band carrying the game's key. */
  onGoToGame: (gameKey: string) => void;
  /** Store the labelled sets as `final_score`. Absent: no answers at all. */
  onFixEnteredScore?: () => void;
  onVideoEndsEarly?: () => void;
  /** Hold and scroll to the set's first point (null: the rows end before it). */
  onFindGap?: (pointId: string | null) => void;
  /** Forget the stored score; given only while one is stored. */
  onClearEnteredScore?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { setNumber, labelled, entered, firstPointId } = mismatch;
  const answers = onFixEnteredScore && onVideoEndsEarly && onFindGap;
  const text = scoreMismatchSentence(mismatch);
  const detail = scoreMismatchDetail(setNumber, labelled, entered);
  const game = mismatchGameKey(mismatch);
  const gameInSet = mismatch.reasons[0]?.gameInSet ?? null;
  const control = Boolean(answers) || game !== null;
  const chip = cn(
    "inline-flex h-[18px] shrink-0 items-center gap-[5px] rounded-full bg-[var(--rail-amber-wash)] px-1.5 text-[10px] font-medium whitespace-nowrap text-[var(--rail-amber)]",
    control &&
      "cursor-pointer transition-[color,background-color,scale] duration-200 hover:bg-[var(--rail-amber-wash-strong)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none active:scale-[0.96] active:duration-100 motion-reduce:active:scale-100",
  );
  const inside = (
    <>
      <span
        aria-hidden="true"
        className="size-1.5 shrink-0 rounded-full bg-current"
      />
      <span
        data-label-score-chip-text=""
        className="mono tabular hidden @min-[600px]:inline"
      >
        {text}
      </span>
    </>
  );

  return (
    <ChromeTooltip
      label={SCORE_MISMATCH_LABEL}
      detail={detail}
      side="bottom"
      hidden={open}
      wrap
    >
      {answers ? (
        <span className="inline-flex shrink-0">
          <FloatMenu
            open={open}
            onOpenChange={setOpen}
            align="end"
            width={272}
            tone={tone}
            label={SCORE_MISMATCH_LABEL}
            trigger={
              <button
                type="button"
                data-label-score-chip=""
                aria-label={SCORE_MISMATCH_LABEL}
                aria-haspopup="menu"
                aria-expanded={open}
                className={cn(
                  chip,
                  open && "bg-[var(--rail-amber-wash-strong)]",
                )}
              >
                {inside}
              </button>
            }
          >
            <ScoreChipMenu
              mismatch={mismatch}
              stored={stored}
              close={() => setOpen(false)}
              onGoToGame={onGoToGame}
              onFixEnteredScore={onFixEnteredScore}
              onVideoEndsEarly={onVideoEndsEarly}
              onFindGap={onFindGap}
              onClearEnteredScore={onClearEnteredScore}
            />
          </FloatMenu>
        </span>
      ) : game !== null ? (
        <button
          type="button"
          data-label-score-chip=""
          aria-label={`${SCORE_MISMATCH_LABEL}. ${detail} Go to game ${gameInSet}.`}
          onClick={() => onGoToGame(game)}
          className={chip}
        >
          {inside}
        </button>
      ) : (
        <span
          role="img"
          data-label-score-chip=""
          aria-label={`${SCORE_MISMATCH_LABEL}. ${detail}`}
          className={chip}
        >
          {inside}
        </span>
      )}
    </ChromeTooltip>
  );
}

/**
 * The chip's menu rows, hook-free so a spec can read them: "Go to game N"
 * when a game is named, the three answers, and "Use the match score again"
 * when given. Each row closes the menu, then asks.
 */
export function ScoreChipMenu({
  mismatch,
  stored,
  close,
  onGoToGame,
  onFixEnteredScore,
  onVideoEndsEarly,
  onFindGap,
  onClearEnteredScore,
}: {
  mismatch: LabelScoreMismatch;
  stored: string;
  close: () => void;
  onGoToGame: (gameKey: string) => void;
  onFixEnteredScore: () => void;
  onVideoEndsEarly: () => void;
  onFindGap: (pointId: string | null) => void;
  onClearEnteredScore?: () => void;
}) {
  const { setNumber, firstPointId } = mismatch;
  const [reason] = mismatch.reasons;
  return (
    <>
      {reason ? (
        <FloatMenuItem
          label={`Go to game ${reason.gameInSet}`}
          description={scoreReasonText(reason)}
          onSelect={() => {
            close();
            onGoToGame(gameKey(reason));
          }}
        />
      ) : null}
      <FloatMenuItem
        label={SCORE_MISMATCH_ANSWERS.fix.label}
        description={`Store ${stored} as the entered score.`}
        onSelect={() => {
          close();
          onFixEnteredScore();
        }}
      />
      <FloatMenuItem
        label={SCORE_MISMATCH_ANSWERS.endsEarly.label}
        description={SCORE_MISMATCH_ANSWERS.endsEarly.description}
        onSelect={() => {
          close();
          onVideoEndsEarly();
        }}
      />
      <FloatMenuItem
        label={SCORE_MISMATCH_ANSWERS.findGap.label}
        description={findGapDescription(setNumber, firstPointId !== null)}
        onSelect={() => {
          close();
          onFindGap(firstPointId);
        }}
      />
      {onClearEnteredScore ? (
        <FloatMenuItem
          label="Use the match score again"
          description="Forget the stored score; the match record's is held against these points."
          onSelect={() => {
            close();
            onClearEnteredScore();
          }}
        />
      ) : null}
    </>
  );
}

interface OverflowSlot {
  overflow: GameOverflow;
  /** The cascade's summary from the first leftover; null when it cannot be planned. */
  summary: GameShiftSummary | null;
}

/**
 * Whether a band ends with its game's outcome. A settled game always does; an
 * unfinished one only when it is behind the labeller — the last game of the
 * session is still being played, and a game with no counted point has
 * nothing to say yet. `gameUnderflow` (game-shift.ts) skips the session's
 * last game for the same reason, so no slot asks about a game the band
 * does not call unfinished.
 */
export function bandOutcomeShown(
  band: LabelScores["games"][number],
  games: LabelScores["games"],
): boolean {
  if (band.outcome.kind !== "unfinished") return true;
  return band !== games.at(-1) && band.points.p1 + band.points.p2 > 0;
}

/**
 * Each overflowing game's rows past its end, keyed by the first of them —
 * the row the "already won" slot goes before — with the shift's summary,
 * planned once here rather than on every render of the slot.
 */
function overflowBeforePoints(
  points: readonly LabelPoint[],
  adScoring: boolean,
): ReadonlyMap<string, OverflowSlot> {
  const before = new Map<string, OverflowSlot>();
  for (const overflow of gameOverflow(points, adScoring)) {
    const from = overflow.leftovers[0].id;
    const plan = planGameShift(points, adScoring, from);
    before.set(from, {
      overflow,
      summary: "error" in plan ? null : plan.summary,
    });
  }
  return before;
}

const NO_IDS: ReadonlySet<string> = new Set();
const NO_OVERFLOW: ReadonlyMap<string, OverflowSlot> = new Map();
const NO_UNDERFLOW: ReadonlyMap<string, UnderflowSlot> = new Map();
