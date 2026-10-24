"use client";

import {
  Fragment,
  useMemo,
  useState,
  type FocusEvent,
  type RefObject,
} from "react";
import {
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Scale,
  Undo2,
} from "lucide-react";
import { reducedMotionNow } from "@/components/dashboard/matches/match-detail/film/film-motion";
import type { FollowAffordance } from "@/components/dashboard/matches/match-detail/film/film-timeline";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import {
  FloatMenu,
  FloatMenuItem,
  FloatMenuNote,
} from "@/components/ui/float-menu";
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
  scoreMismatchDetail,
} from "@/lib/services/labels/marks-copy";
import {
  openFlags,
  scoreStop,
  type ScoreStop,
} from "@/lib/services/labels/flag-nav";
import type { LabelGame } from "@/lib/services/labels/operations";
import {
  bandsBeforePoints,
  gameKey,
  type LabelScores,
} from "@/lib/services/labels/score";
import {
  isWithdrawnPointAdd,
  type LabelGameType,
  type LabelPoint,
  type LabelSide,
  type LabelStartScore,
  type MatchScore,
} from "@/lib/services/labels/session";
import {
  mismatchGameKey,
  scoreMismatchSentence,
  sessionScoreMismatch,
  scoreReasonText,
  type LabelScoreMismatch,
} from "@/lib/services/labels/set-scores";
import { cn } from "@/lib/utils";
import { LabelFollowPill } from "./label-follow-pill";
import { useRowInView } from "./use-row-in-view";
import { LabelFlagSummary } from "./label-flag-summary";
import { BlackTextAction, gameSlot } from "./label-black-parts";
import {
  dropBeforePoint,
  planGameBoundary,
} from "@/lib/services/labels/game-boundary";
import { tiebreakFolds } from "@/lib/services/labels/tiebreak-fold";
import {
  tiebreakServeBeforePoints,
  tiebreakServeOrders,
} from "@/lib/services/labels/tiebreak-serve";
import {
  foldedPointIds,
  gameServeRepeatBeforePoints,
  gameServeRepeats,
} from "@/lib/services/labels/game-serve-order";
import { LabelGameBand } from "./label-game-band";
import {
  BlackGameUnderflow,
  underflowAfterPoints,
  type UnderflowSlot,
} from "./label-game-underflow";
import {
  BlackDeletedPoint,
  BlackGameOverflow,
  BlackTiebreakFold,
  BlackTiebreakServe,
  BlackGameServeRepeat,
  BlackPointRow,
  BlackSuggestedPoint,
  openPointSuggestions,
} from "./label-black-point-row";
import { BlackShotsWell } from "./label-black-shot-row";
import { labelHands, type SideNames } from "./label-format";
import { RAIL_TONE_CLASS, type RailTone } from "./label-rail-tone";
import type {
  EditContext,
  LabelRowOperations,
  PlayingWindow,
} from "./label-row-parts";
import { LabelSaveStatus } from "./label-save-status";
import {
  LabelStartScoreEditor,
  LabelStartScoreLine,
  formatStartScore,
  startScorePrompt,
  zeroStartScore,
} from "./label-start-score";
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
  onUndo,
  missingShots = 0,
  onAddMissingShots,
  canUndo = false,
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
  matchTiebreakSet = null,
  playOnLets,
  fileOffset = 0,
  names,
  marks = null,
  expandedPointId,
  onTogglePoint,
  editable = false,
  selectedShotId = null,
  armedSlotAfterShotId = null,
  reviewInline = null,
  onSelectShot,
  onExitReview,
  onPatchPoint,
  onPatchShot,
  operations,
  onRemoveShotsAfter,
  onRestoreShots,
  onSetGameServer,
  onFixTiebreakServe,
  onMoveGameBoundary,
  slotStops,
  onSetGameType,
  openGhostIds = NO_IDS,
  onToggleGhost,
  playingPointId = null,
  playingShotId = null,
  playingWindow = null,
  finalScore = null,
  videoEndsEarly = null,
  matchScore = null,
  startScore = null,
  onSaveStartScore,
  onVideoEndsEarly,
  onFindGap,
  onGoToPoint,
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
  /**
   * The console's Undo, for the view with no page header over the rail (full
   * screen). Absent, there is no button; `canUndo` false draws it disabled.
   */
  onUndo?: () => void;
  /** Open "Missing shot?" slots "Add shot" can fill; with the handler, "Add all". */
  missingShots?: number;
  onAddMissingShots?: () => void;
  canUndo?: boolean;
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
  /**
   * The deciding set the entered score spells as a match tiebreak
   * (set-scores.ts `matchTiebreakSet`), computed once by the console: the
   * fold offers it and the shift and pull slots leave it alone.
   */
  matchTiebreakSet?: number | null;
  /** `session.playOnLets`: false offers `Let` on a serve row's result. */
  playOnLets?: boolean;
  /** `LabelVideo.startTimeSeconds`: rows print times on the file's clock. */
  fileOffset?: number;
  names: SideNames;
  /** The session's marks. Null draws no chip, hover line or suggestion. */
  marks?: LabelMarks | null;
  expandedPointId: string | null;
  onTogglePoint?: (pointId: string) => void;
  editable?: boolean;
  selectedShotId?: string | null;
  /** The "Missing shot?" slot a flag jump armed (`EditContext`). */
  armedSlotAfterShotId?: string | null;
  /**
   * The console's inline review block for the open point
   * (`ReviewInlineBlock`), drawn in its well under the stroke it is about.
   */
  reviewInline?: {
    pointId: string;
    afterShotId: string | null;
    node: React.ReactNode;
  } | null;
  /** `target` opens the court on that end: a position cell was clicked. */
  onSelectShot?: (shotId: string, target?: "contact" | "landing") => void;
  /** A click into the row a flag jump selected: leave review mode. */
  onExitReview?: () => void;
  onPatchPoint?: (pointId: string, patch: LabelPointPatch) => void;
  onPatchShot?: (shotId: string, patch: LabelShotPatch) => void;
  /** Absent: no ⋯ menu, no tick, no Add shot — the rows are read-only. */
  operations?: LabelRowOperations;
  /** The hint line's Remove and Restore (`EditContext`); absent read-only. */
  onRemoveShotsAfter?: EditContext["onRemoveShotsAfter"];
  onRestoreShots?: EditContext["onRestoreShots"];
  onSetGameServer?: (game: LabelGame, server: LabelSide) => void;
  /** "Fix serve order" on a tiebreak off its order (tiebreak-serve.ts). */
  onFixTiebreakServe?: (game: LabelGame) => void;
  /**
   * A game band dropped above a point (game-boundary.ts): the points it
   * passed move into the neighbouring game. Absent, the bands do not drag.
   */
  onMoveGameBoundary?: (game: LabelGame, beforePointId: string) => void;
  /**
   * Every amber slot between the rows as a stop (flag-nav.ts `slotStops`),
   * computed once by the console for its `]` / `[` keys and handed here for
   * the header's count and jumps. Absent: none.
   */
  slotStops?: readonly ScoreStop[];
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
   * Where the video starts in the match (`label_sessions.start_score`), as
   * the console holds it; null: at the beginning. `scores` already count
   * from it; the rail's own readings are handed it too.
   */
  startScore?: LabelStartScore | null;
  /**
   * Save a start (label-start-score.tsx). Given on an editable rail, it
   * draws the prompt above point 1, the editor and the header menu's "Video
   * starts mid-match…"; absent, the saved line alone.
   */
  onSaveStartScore?: (start: LabelStartScore) => void;
  /**
   * The chip's answers. Given both, the chip opens a menu of them; absent, it
   * is words alone. Neither rewrites the entered score: the match record's is
   * the source of truth the labelled points are held against.
   */
  onVideoEndsEarly?: () => void;
  onFindGap?: (pointId: string | null) => void;
  /** Make a point current, hold the rail and bring the row up: the flag jumps. */
  onGoToPoint?: (pointId: string) => void;
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
  const mismatch =
    marks !== null
      ? sessionScoreMismatch({
          points,
          games: scores.games,
          finalScore,
          matchScore,
          videoEndsEarly,
          startScore,
        })
      : null;
  // The mismatch as a flag of its own: counted, jumped to, and a slot after
  // the set's last point (`BlackSetScoreSlot`).
  const setScoreStop = scoreStop(mismatch, points);
  // The header's open flags, over every live row — one per point, as the
  // row's chip reads it. None on the marks-off session.
  const openMarks = useMemo(
    () => (marks ? openFlags(points, marks) : []),
    [points, marks],
  );
  // Two lists in the header: amber for what can move the score, grey for
  // wrong data.
  const scoreMarks = useMemo(
    () => openMarks.filter((flag) => !flag.data),
    [openMarks],
  );
  const dataMarks = useMemo(
    () => openMarks.filter((flag) => flag.data),
    [openMarks],
  );
  // One object for every row, the same one until an input moves: the rows
  // are memoised, and a fresh context per render would re-render them all.
  // Nothing of the playhead is in it (`EditContext`).
  const pointScores = scores.points;
  // Read off the rows once, for every placement's Inside Out / Inside In.
  const hands = useMemo(() => labelHands(points), [points]);
  const edit = useMemo<EditContext>(
    () => ({
      editable,
      names,
      selectedShotId,
      armedSlotAfterShotId,
      onSelectShot,
      onExitReview,
      onPatchPoint,
      onPatchShot,
      operations: editable ? operations : undefined,
      onRemoveShotsAfter: editable ? onRemoveShotsAfter : undefined,
      onRestoreShots: editable ? onRestoreShots : undefined,
      openGhostIds,
      onToggleGhost,
      points,
      hands,
      scores: pointScores,
      adScoring,
      matchTiebreakSet,
      startScore,
      playOnLets,
      tone,
      fileOffset,
    }),
    [
      editable,
      names,
      selectedShotId,
      armedSlotAfterShotId,
      onSelectShot,
      onExitReview,
      onPatchPoint,
      onPatchShot,
      operations,
      onRemoveShotsAfter,
      onRestoreShots,
      openGhostIds,
      onToggleGhost,
      points,
      hands,
      pointScores,
      adScoring,
      matchTiebreakSet,
      startScore,
      playOnLets,
      tone,
      fileOffset,
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
  // The tiebreak at 6–6 and the entered match tiebreak, by the first point
  // each folds: on editable sessions.
  const folds = useMemo(
    () =>
      editable
        ? tiebreakFolds(points, adScoring, matchTiebreakSet, startScore)
        : [],
    [editable, points, adScoring, matchTiebreakSet, startScore],
  );
  const foldBefore = useMemo(
    () => new Map(folds.map((fold) => [fold.pointIds[0], fold])),
    [folds],
  );
  // A game band in the air, and the point its drop would land above — set
  // only where `planGameBoundary` has something to move.
  const [bandDrag, setBandDrag] = useState<{
    game: LabelGame;
    before: string | null;
  } | null>(null);
  const draggedGame = bandDrag?.game ?? null;
  const bandDragHandlers = useMemo(
    () =>
      editable && onMoveGameBoundary
        ? {
            onStart: (game: LabelGame, event: React.DragEvent) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", "");
              setBandDrag({ game, before: null });
            },
            onEnd: () => setBandDrag(null),
          }
        : null,
    [editable, onMoveGameBoundary],
  );
  const dropTarget = (event: React.DragEvent): string | null => {
    if (!draggedGame || !(event.target instanceof Element)) return null;
    const row = event.target.closest<HTMLElement>('[data-row="point"]');
    const id = row?.dataset.pointId;
    if (!row || !id) return null;
    const { top, height } = row.getBoundingClientRect();
    const before = dropBeforePoint(
      points,
      id,
      event.clientY < top + Math.min(height, 44) / 2,
    );
    if (before === null) return null;
    const plan = planGameBoundary(points, draggedGame, before);
    return "ok" in plan && plan.write.pointIds.length > 0 ? before : null;
  };
  // The tiebreaks off their serve order, by the first point that is off it.
  const serveOrderBefore = useMemo(
    () =>
      tiebreakServeBeforePoints(editable ? tiebreakServeOrders(points) : []),
    [editable, points],
  );
  // The games served by the same player as the game beside them, by their
  // first point.
  const serveRepeatBefore = useMemo(
    () =>
      gameServeRepeatBeforePoints(
        editable ? gameServeRepeats(points, foldedPointIds(folds)) : [],
      ),
    [editable, points, folds],
  );
  // The games that run over, by their first leftover point. Read off the
  // labeller's own rows, so on every editable session — marks on or off.
  const overflowBefore = useMemo(
    () =>
      editable
        ? overflowBeforePoints(points, adScoring, matchTiebreakSet, startScore)
        : NO_OVERFLOW,
    [editable, points, adScoring, matchTiebreakSet, startScore],
  );
  // The games that end short, by their last live point. On the same sessions
  // as the slot above.
  const underflowAfter = useMemo(
    () =>
      editable
        ? underflowAfterPoints(points, adScoring, matchTiebreakSet, startScore)
        : NO_UNDERFLOW,
    [editable, points, adScoring, matchTiebreakSet, startScore],
  );
  // Where the video starts: the prompt above point 1 while set 1 does not
  // add up and nothing is saved, the editor in its place once asked, and the
  // saved line under the header (label-start-score.tsx).
  const [startEditing, setStartEditing] = useState(false);
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false);
  const canSetStart = editable && onSaveStartScore !== undefined;
  const firstGame = scores.games[0];
  const firstGameType = firstGame?.gameType ?? "game";
  const firstServer: LabelSide = firstGame?.server ?? "p1";
  const firstPointId =
    points.find((point) => point.status !== "deleted")?.id ?? null;
  const startPrompt =
    canSetStart &&
    !startEditing &&
    startScore === null &&
    mismatch?.setNumber === 1 &&
    firstPointId !== null
      ? startScorePrompt({
          mismatch,
          anchor: firstPointId,
          recordSays: matchScore !== null,
          onSet: () => setStartEditing(true),
          onStartsAtZero: () => onSaveStartScore?.(zeroStartScore(firstServer)),
        })
      : null;
  const editStartScore = () => {
    setStartEditing(true);
    scrollerRef?.current?.scrollTo({ top: 0 });
  };

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
          {/* Full screen is for fixing the data and nothing else: what is
              left to do (the count, the two flag lists) leads, and the
              match's name and format stay on the page it was opened from. */}
          {showSession ? (
            <ChromeTooltip
              label={`${player1Name} vs ${player2Name}`}
              detail={`${adScoring ? "Ad scoring" : "No-ad scoring"} · ${playOnLets ? "lets: play on" : "lets replayed"}`}
              side="bottom"
              align="start"
            >
              <span
                role="img"
                data-label-rail-progress=""
                data-match-format={`${adScoring ? "Ad scoring" : "No-ad scoring"} · ${playOnLets ? "Lets: play on" : "Lets replayed"}`}
                aria-label={`${checked} of ${total} points checked. ${player1Name} vs ${player2Name}`}
                className="mono tabular shrink-0 text-[11px] whitespace-nowrap text-white"
              >
                {checked}
                <span className="text-white/35"> / {total}</span>
              </span>
            </ChromeTooltip>
          ) : (
            <span
              data-label-rail-title=""
              className="truncate text-[12px] font-medium text-white"
            >
              Points
            </span>
          )}
          {marks !== null || mismatch ? (
            <LabelFlagSummary
              openMarks={scoreMarks}
              points={points}
              fromPointId={expandedPointId ?? playingPointId}
              onGoToPoint={onGoToPoint}
              tone={tone}
              scoreStop={setScoreStop}
              extraStops={slotStops}
              score={
                mismatch
                  ? (close) => (
                      <ScoreRows
                        mismatch={mismatch}
                        close={close}
                        onGoToGame={goToGame}
                        onVideoEndsEarly={
                          editable ? onVideoEndsEarly : undefined
                        }
                        onFindGap={editable ? onFindGap : undefined}
                        onClearEnteredScore={
                          // Only where the stored score is the one held:
                          // a match record outranks it (`enteredScore`).
                          editable && finalScore !== null && !matchScore
                            ? onClearEnteredScore
                            : undefined
                        }
                      />
                    )
                  : null
              }
            />
          ) : null}
          {marks !== null ? (
            <LabelFlagSummary
              kind="data"
              openMarks={dataMarks}
              points={points}
              fromPointId={expandedPointId ?? playingPointId}
              onGoToPoint={onGoToPoint}
              tone={tone}
              score={null}
              bulk={
                onAddMissingShots && missingShots > 0
                  ? {
                      label:
                        missingShots === 1
                          ? "Add the missing shot"
                          : `Add all ${missingShots} missing shots`,
                      description: "Each where its slot suggests, as one Undo",
                      onSelect: onAddMissingShots,
                    }
                  : null
              }
            />
          ) : null}
          <span className="flex-1" />
          {showSession ? (
            <LabelSaveStatus status={saveStatus} tone={tone} />
          ) : null}
          {canSetStart ? (
            <FloatMenu
              open={sessionMenuOpen}
              onOpenChange={setSessionMenuOpen}
              align="end"
              width={280}
              tone={tone}
              label="Session"
              trigger={
                <button
                  type="button"
                  data-label-rail-session-menu=""
                  aria-label="Session actions"
                  aria-haspopup="menu"
                  aria-expanded={sessionMenuOpen}
                  className={cn(
                    HEADER_BUTTON,
                    "aria-expanded:bg-white/[0.08] aria-expanded:text-white",
                  )}
                >
                  <MoreHorizontal
                    className="size-3.5"
                    strokeWidth={1.6}
                    aria-hidden="true"
                  />
                </button>
              }
            >
              <RailSessionMenuRows
                close={() => setSessionMenuOpen(false)}
                startScore={startScore}
                gameType={firstGameType}
                onEditStartScore={editStartScore}
              />
            </FloatMenu>
          ) : null}
          {showSession && onUndo ? (
            <ChromeTooltip
              label="Undo"
              detail="Takes back the last change"
              shortcut="⌘Z"
              side="bottom"
              align="end"
            >
              <button
                type="button"
                data-label-rail-undo=""
                aria-label="Undo the last change"
                aria-keyshortcuts="Meta+Z"
                disabled={!canUndo}
                onClick={onUndo}
                className={cn(
                  HEADER_BUTTON,
                  "disabled:cursor-default disabled:text-white/25 disabled:hover:bg-transparent disabled:active:scale-100",
                )}
              >
                <Undo2
                  className="size-3.5"
                  strokeWidth={1.6}
                  aria-hidden="true"
                />
              </button>
            </ChromeTooltip>
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

        {startScore !== null ? (
          <LabelStartScoreLine
            start={startScore}
            names={names}
            gameType={firstGameType}
            onEdit={canSetStart ? editStartScore : undefined}
          />
        ) : null}

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            className="flex min-h-0 flex-1 flex-col"
            onFocusCapture={onFocusCapture}
          >
            <div
              ref={scrollerRef}
              data-label-rail-scroller=""
              className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-2"
              onDragOver={
                bandDrag
                  ? (event) => {
                      const before = dropTarget(event);
                      if (before !== null) {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                      }
                      if (before !== bandDrag.before) {
                        setBandDrag({ game: bandDrag.game, before });
                      }
                    }
                  : undefined
              }
              onDrop={
                bandDrag
                  ? (event) => {
                      const before = dropTarget(event);
                      setBandDrag(null);
                      if (before === null) return;
                      event.preventDefault();
                      onMoveGameBoundary?.(bandDrag.game, before);
                    }
                  : undefined
              }
            >
              {canSetStart && startEditing ? (
                <LabelStartScoreEditor
                  initial={startScore}
                  defaultServer={firstServer}
                  names={names}
                  gameType={firstGameType}
                  onCancel={() => setStartEditing(false)}
                  onSave={(start) => {
                    setStartEditing(false);
                    onSaveStartScore?.(start);
                  }}
                />
              ) : (
                startPrompt
              )}
              {points.map((point) => {
                if (point.status === "deleted") {
                  if (isWithdrawnPointAdd(point)) return null;
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
                const fold = foldBefore.get(point.id);
                const serveOrder = serveOrderBefore.get(point.id);
                const serveRepeat = serveRepeatBefore.get(point.id);
                const short = underflowAfter.get(point.id);
                const open = point.id === expandedPointId;
                return (
                  <Fragment key={point.id}>
                    {bandDrag?.before === point.id ? (
                      <div
                        data-game-drop=""
                        aria-hidden="true"
                        className="pointer-events-none relative h-0"
                      >
                        <span className="absolute inset-x-2 -top-px h-0.5 rounded-full bg-[var(--blue)]" />
                      </div>
                    ) : null}
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
                        drag={
                          bandDragHandlers && band !== scores.games[0]
                            ? bandDragHandlers
                            : undefined
                        }
                        gripTrack={bandDragHandlers !== null}
                        dragging={
                          draggedGame?.setNumber === band.setNumber &&
                          draggedGame.gameNumber === band.gameNumber
                        }
                        menu={tone}
                      />
                    ) : null}
                    {fold ? (
                      <BlackTiebreakFold
                        fold={fold}
                        points={points}
                        edit={edit}
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
                    {serveOrder ? (
                      <BlackTiebreakServe
                        order={serveOrder}
                        names={names}
                        onFix={onFixTiebreakServe}
                      />
                    ) : null}
                    {serveRepeat ? (
                      <BlackGameServeRepeat
                        repeat={serveRepeat}
                        names={names}
                        onSetGameServer={onSetGameServer}
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
                          inline={
                            reviewInline?.pointId === point.id
                              ? reviewInline
                              : null
                          }
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
                    {mismatch && setScoreStop?.pointId === point.id
                      ? setScoreSlot({
                          mismatch,
                          anchor: point.id,
                          onVideoEndsEarly: editable
                            ? onVideoEndsEarly
                            : undefined,
                        })
                      : null}
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

/**
 * The rail header's session menu, hook-free so a spec can read it: "Video
 * starts mid-match…" opens the start-score editor above point 1, whether or
 * not the prompt is showing.
 */
export function RailSessionMenuRows({
  close,
  startScore,
  gameType = "game",
  onEditStartScore,
}: {
  close: () => void;
  startScore: LabelStartScore | null;
  gameType?: LabelGameType;
  onEditStartScore: () => void;
}) {
  return (
    <FloatMenuItem
      label="Video starts mid-match…"
      description={
        startScore
          ? `Starts at ${formatStartScore(startScore, gameType)}`
          : "Set the score before the first point on video"
      }
      onSelect={() => {
        close();
        onEditStartScore();
      }}
    />
  );
}

/**
 * The score that doesn't add up, as rows in the flag list: with the answers,
 * `ScoreChipMenu`'s rows; without, "Go to game N" when a game is named, else
 * the sentence alone. They write only `label_sessions` (`final_score`,
 * `video_ends_early`), never `matches`.
 */
export function ScoreRows({
  mismatch,
  close,
  onGoToGame,
  onVideoEndsEarly,
  onFindGap,
  onClearEnteredScore,
}: {
  mismatch: LabelScoreMismatch;
  close: () => void;
  onGoToGame: (gameKey: string) => void;
  onVideoEndsEarly?: () => void;
  onFindGap?: (pointId: string | null) => void;
  onClearEnteredScore?: () => void;
}) {
  const { setNumber, labelled, entered } = mismatch;
  const detail = scoreMismatchDetail(setNumber, labelled, entered);
  if (onVideoEndsEarly && onFindGap) {
    return (
      <ScoreChipMenu
        mismatch={mismatch}
        close={close}
        onGoToGame={onGoToGame}
        onVideoEndsEarly={onVideoEndsEarly}
        onFindGap={onFindGap}
        onClearEnteredScore={onClearEnteredScore}
      />
    );
  }
  const game = mismatchGameKey(mismatch);
  const gameInSet = mismatch.reasons[0]?.gameInSet ?? null;
  if (game !== null && gameInSet !== null) {
    return (
      <FloatMenuItem
        label={`Go to game ${gameInSet}`}
        description={scoreMismatchSentence(mismatch)}
        onSelect={() => {
          close();
          onGoToGame(game);
        }}
      />
    );
  }
  return <FloatMenuNote>{detail}</FloatMenuNote>;
}

/**
 * The chip's menu rows, hook-free so a spec can read them: "Go to game N"
 * when a game is named, the two answers, and "Use the match score again"
 * when given. Each row closes the menu, then asks.
 */
export function ScoreChipMenu({
  mismatch,
  close,
  onGoToGame,
  onVideoEndsEarly,
  onFindGap,
  onClearEnteredScore,
}: {
  mismatch: LabelScoreMismatch;
  close: () => void;
  onGoToGame: (gameKey: string) => void;
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

/**
 * After the last point of a set whose games don't make the match record's
 * score: "Set 1 ends 5–5" over "The match record says 6–4", in the game
 * slots' dashed amber. It names no game: without the video, a guess at which
 * game was credited to the wrong player sends the labeller to the wrong one.
 * Its one answer is "Video ends early" — the other two causes are fixed in
 * the rows, or on the match record itself. When the rows never reach the
 * set, it sits after the last point and says so.
 */
export function setScoreSlot({
  mismatch,
  anchor,
  onVideoEndsEarly,
}: {
  mismatch: LabelScoreMismatch;
  /** The point it follows: the set's last, or the session's last. */
  anchor: string;
  onVideoEndsEarly?: () => void;
}) {
  const reached = mismatch.lastPointId !== null;
  const label = SCORE_MISMATCH_ANSWERS.endsEarly.label;
  return gameSlot({
    icon: Scale,
    row: "set-score",
    anchor,
    title: reached
      ? `Set ${mismatch.setNumber} ends ${mismatch.labelled}`
      : `These points stop before set ${mismatch.setNumber}`,
    reason: reached
      ? `The match record says ${mismatch.entered}. A game is missing or credited to the wrong player`
      : `The match record says set ${mismatch.setNumber} was ${mismatch.entered}`,
    action: onVideoEndsEarly ? (
      <BlackTextAction
        ink="amber"
        data-set-score-ends-early=""
        aria-label={`${label}: ${SCORE_MISMATCH_ANSWERS.endsEarly.description}`}
        onClick={(event) => {
          event.stopPropagation();
          onVideoEndsEarly();
        }}
      >
        {label}
      </BlackTextAction>
    ) : null,
    actionLabel: label,
    details: [SCORE_MISMATCH_ANSWERS.endsEarly.description],
  });
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
  matchTiebreakSet: number | null,
  start: LabelStartScore | null,
): ReadonlyMap<string, OverflowSlot> {
  const before = new Map<string, OverflowSlot>();
  for (const overflow of gameOverflow(
    points,
    adScoring,
    matchTiebreakSet,
    start,
  )) {
    const from = overflow.leftovers[0].id;
    const plan = planGameShift(
      points,
      adScoring,
      from,
      matchTiebreakSet,
      start,
    );
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
