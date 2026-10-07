"use client";

import {
  Fragment,
  useMemo,
  useState,
  type FocusEvent,
  type RefObject,
} from "react";
import { Flag, Maximize2, Minimize2 } from "lucide-react";
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
  scoreMismatchText,
  toCheckLabel,
} from "@/lib/services/labels/marks-copy";
import { markSummary } from "@/lib/services/labels/marks-state";
import type { LabelGame } from "@/lib/services/labels/operations";
import {
  bandsBeforePoints,
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
  labelSetScores,
  scoreMismatch,
  type LabelScoreMismatch,
} from "@/lib/services/labels/set-scores";
import { cn } from "@/lib/utils";
import { LabelFollowPill } from "./label-follow-pill";
import { LabelGameBand } from "./label-game-band";
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
  names: SideNames;
  /** The session's marks. Null draws no chip, hover line or suggestion. */
  marks?: LabelMarks | null;
  expandedPointId: string | null;
  onTogglePoint?: (pointId: string) => void;
  editable?: boolean;
  selectedShotId?: string | null;
  onSelectShot?: (shotId: string) => void;
  onPatchPoint?: (pointId: string, patch: LabelPointPatch) => void;
  onPatchShot?: (shotId: string, patch: LabelShotPatch) => void;
  /** Absent: no ⋯ menu, no tick, no Add shot — the rows are read-only. */
  operations?: LabelRowOperations;
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
}) {
  // The shots well unfolds for every point the labeller or the film opens,
  // never for the one already open when this rail mounted (the page loading, or
  // the layout switching).
  const [openAtMount] = useState(expandedPointId);
  const [openMoved, setOpenMoved] = useState(false);
  if (!openMoved && expandedPointId !== openAtMount) setOpenMoved(true);
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
      openGhostIds,
      onToggleGhost,
      points,
      scores: pointScores,
      adScoring,
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
      openGhostIds,
      onToggleGhost,
      points,
      pointScores,
      adScoring,
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
                const open = point.id === expandedPointId;
                return (
                  <Fragment key={point.id}>
                    {band ? (
                      <LabelGameBand
                        band={band}
                        points={points}
                        names={names}
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
                  </Fragment>
                );
              })}
            </div>
          </div>

          {affordance ? (
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
 * The score that doesn't add up, as a chip in the header: the labelled pair
 * against the entered one ("4–7 · entered 4–6") in amber. Under 600px of header
 * the words give way and the dot stands alone.
 *
 * With the three answers it is a `FloatMenu` trigger in the rail's tone; they
 * write only `label_sessions` (`final_score`, `video_ends_early`), never
 * `matches`. Without them the chip is words alone.
 */
function ScoreChip({
  mismatch,
  tone,
  onFixEnteredScore,
  onVideoEndsEarly,
  onFindGap,
}: {
  mismatch: LabelScoreMismatch;
  tone: RailTone;
  /** Store the labelled sets as `final_score`. Absent: no answers at all. */
  onFixEnteredScore?: () => void;
  onVideoEndsEarly?: () => void;
  /** Hold and scroll to the set's first point (null: the rows end before it). */
  onFindGap?: (pointId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const { setNumber, labelled, entered, firstPointId } = mismatch;
  const answers = onFixEnteredScore && onVideoEndsEarly && onFindGap;
  const text = scoreMismatchText(labelled, entered);
  const detail = scoreMismatchDetail(setNumber, labelled, entered);
  const chip = cn(
    "inline-flex h-[18px] shrink-0 items-center gap-[5px] rounded-full bg-[var(--rail-amber-wash)] px-1.5 text-[10px] font-medium whitespace-nowrap text-[var(--rail-amber)]",
    answers &&
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
            <FloatMenuItem
              label={SCORE_MISMATCH_ANSWERS.fix.label}
              description={SCORE_MISMATCH_ANSWERS.fix.description}
              onSelect={() => {
                setOpen(false);
                onFixEnteredScore();
              }}
            />
            <FloatMenuItem
              label={SCORE_MISMATCH_ANSWERS.endsEarly.label}
              description={SCORE_MISMATCH_ANSWERS.endsEarly.description}
              onSelect={() => {
                setOpen(false);
                onVideoEndsEarly();
              }}
            />
            <FloatMenuItem
              label={SCORE_MISMATCH_ANSWERS.findGap.label}
              description={findGapDescription(setNumber, firstPointId !== null)}
              onSelect={() => {
                setOpen(false);
                onFindGap(firstPointId);
              }}
            />
          </FloatMenu>
        </span>
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

interface OverflowSlot {
  overflow: GameOverflow;
  /** The cascade's summary from the first leftover; null when it cannot be planned. */
  summary: GameShiftSummary | null;
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
