"use client";

import {
  Fragment,
  useMemo,
  useState,
  type FocusEvent,
  type RefObject,
} from "react";
import { Flag, Minimize2, WandSparkles } from "lucide-react";
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
  type GameOverflow,
} from "@/lib/services/labels/game-shift";
import type { LabelMarks } from "@/lib/services/labels/marks";
import {
  SCORE_MISMATCH_ANSWERS,
  SCORE_MISMATCH_LABEL,
  findGapDescription,
  fixesLabel,
  onPointsDetail,
  scoreMismatchDetail,
  scoreMismatchText,
  toCheckLabel,
} from "@/lib/services/labels/marks-copy";
import { markSummary } from "@/lib/services/labels/marks-state";
import type { LabelGame } from "@/lib/services/labels/operations";
import {
  labelScores,
  type LabelGameBand as LabelGameBandScore,
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
import {
  BlackDeletedPoint,
  BlackGameBand,
  BlackGameOverflow,
  BlackPointRow,
  BlackSuggestedPoint,
  openPointSuggestions,
} from "./label-black-point-row";
import { BlackShotsWell } from "./label-black-shot-row";
import type { SideNames } from "./label-format";
import type {
  EditContext,
  LabelRowOperations,
  PlayingWindow,
} from "./label-row-parts";
import { LabelSaveStatus } from "./label-save-status";
import type { SaveStatus } from "./save-status";

/**
 * The black view's points rail (T33, board 08l's `.bk-rail`): the Video
 * tab's points list in its dark tone, carrying labels.
 *
 * A 46px header — "{player1} vs {player2}", "{checked} / {total} checked",
 * then the match's two totals in the same mono (a flag glyph with how many
 * marks are still to check, a wand with how many automatic fixes the site
 * made — `markSummary`, only with marks built), then, when the labelled
 * points make a set score the entered one disagrees with, the score chip
 * (`ScoreChip`: the labelled pair against the entered one, in amber, opening
 * the three answers as a dark menu; only with marks built, and not once the
 * labeller has said the video ends early), the save line in its dark tone
 * and the way out (`Minimize2`, "Exit full screen") — over the ONE scroller
 * (`data-label-rail-scroller`), which is what the console's follow scroll
 * moves: a `BlackGameBand` before each game's first live point, a
 * `BlackPointRow` per point with the score before it and its marks (board
 * 08m, `label-black-mark.tsx`) in its tail, a one-line dark tombstone with
 * its Undo (`BlackDeletedPoint`) for a deleted one, a dashed slot
 * (`BlackSuggestedPoint`, board 08m §5) before a point the marks think is
 * missing a point in front of it, a second dashed slot (`BlackGameOverflow`)
 * before the first row sitting past a game's end — the "Game–30" rows,
 * offered a move into the next game — and the recessed shots well
 * (`BlackShotsWell`) under the current point only. The scroller never
 * scrolls sideways: every row is built to fit the rail from its narrowest
 * (520px), and `overflow-x-hidden` holds that. Nor does the header push
 * anything off at 520: the names truncate first, the chip's words give way
 * to its dot under 600px of header, and everything else keeps its width.
 * The "Now playing" pill is pinned over the scroller's top-centre while held
 * and a point is playing, as it is over the light table.
 *
 * Stateless but for the scoreboard memo and the chip's open state, exactly
 * as `LabelPointsTableView`: every callback is the console's, handed down
 * unchanged, so follow and hold, autosave, the row operations and the game
 * menus work here as they do in the light table — only the paint is this
 * file's.
 */
export function LabelBlackRail({
  player1Name,
  player2Name,
  checked,
  total,
  saveStatus,
  onExit,
  scrollerRef,
  onFocusCapture,
  affordance,
  onFollow,
  points,
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
  openTombstoneIds = NO_IDS,
  onToggleTombstone,
  marksEnabled = false,
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
  /** Back to the layout the console was in before this one. */
  onExit: () => void;
  /** Lands on the scroller, for the console's follow scroll. */
  scrollerRef?: RefObject<HTMLDivElement | null>;
  /** The console's editor-focus hold, on the rows' frame. */
  onFocusCapture?: (event: FocusEvent<HTMLDivElement>) => void;
  /** The "Now playing" pill's words while held; null for no pill. */
  affordance: FollowAffordance | null;
  onFollow: () => void;
  points: readonly LabelPoint[];
  /** `session.adScoring`. */
  adScoring?: boolean;
  names: SideNames;
  /**
   * The derivation's marks on these rows (the console's `marks` state). Null
   * draws the rows with no chip, no hover line and no suggestion.
   */
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
  openTombstoneIds?: ReadonlySet<string>;
  onToggleTombstone?: (id: string) => void;
  /**
   * `session.marksEnabled`: with it, and `marks` built, a stroke the site
   * removed is drawn as a ghost (board 08m §3); without, an ordinary row.
   */
  marksEnabled?: boolean;
  /** Ghosts shown as their struck-through row (the console's state). */
  openGhostIds?: ReadonlySet<string>;
  onToggleGhost?: (id: string) => void;
  playingPointId?: string | null;
  playingShotId?: string | null;
  playingWindow?: PlayingWindow | null;
  /**
   * The score chip's reading (the console's session state): the score the
   * labeller entered, whether they said the video ends early, and the match
   * record's score as the fallback the labelled points are held against.
   */
  finalScore?: number[][] | null;
  videoEndsEarly?: boolean | null;
  matchScore?: MatchScore | null;
  /**
   * The chip's answers. Given all three, the chip opens a menu of them;
   * absent, it is words alone. `onFixEnteredScore` gets the labelled sets as
   * `[p1, p2]` pairs — what `final_score` stores.
   */
  onFixEnteredScore?: (finalScore: number[][]) => void;
  onVideoEndsEarly?: () => void;
  onFindGap?: (pointId: string | null) => void;
}) {
  const scores = useMemo(
    () => labelScores(points, adScoring),
    [points, adScoring],
  );
  // The chip's arithmetic, over the same rows as the scoreboard: shown only
  // with marks built (never on a session labelled blind), not once the
  // labeller has said the video ends early, and only on a disagreement.
  const labelledSets = useMemo(
    () => labelSetScores(points, adScoring),
    [points, adScoring],
  );
  const mismatch =
    marks !== null && videoEndsEarly !== true
      ? scoreMismatch(labelledSets, enteredScore(finalScore, matchScore))
      : null;
  // The header's two totals, over every live row — marks, not points, as
  // the rows roll them up. Nothing on the marks-off session.
  const summary = useMemo(
    () => (marks ? markSummary(points, marks) : null),
    [points, marks],
  );
  const edit: EditContext = {
    editable,
    names,
    selectedShotId,
    onSelectShot,
    onPatchPoint,
    onPatchShot,
    operations: editable ? operations : undefined,
    openTombstoneIds,
    onToggleTombstone,
    marksEnabled,
    openGhostIds,
    onToggleGhost,
    points,
    scores: scores.points,
    adScoring,
    playingShotId,
  };
  const bandBefore = bandsBeforePoints(points, scores.games);
  // The slots still waiting for an answer, by the point whose row follows.
  const slotBefore = openPointSuggestions(points, edit, marks);
  // The games that run over, by their first leftover point. Read off the
  // labeller's own rows, so on every editable session — marks on or off.
  const overflowBefore = useMemo(
    () => (editable ? overflowBeforePoints(points, adScoring) : NO_OVERFLOW),
    [editable, points, adScoring],
  );

  return (
    <TooltipProvider>
      {/* A size container, for the chip's words (`@min-[600px]`). */}
      <div
        data-label-rail-header=""
        className="@container flex h-[46px] shrink-0 items-center gap-[10px] pr-[10px] pl-[14px] shadow-[inset_0_-1px_0_rgba(255,255,255,0.08)]"
      >
        <span
          data-label-rail-title=""
          className="truncate text-[12px] font-medium text-white"
        >
          {player1Name} vs {player2Name}
        </span>
        <span
          data-label-rail-progress=""
          className="mono tabular shrink-0 text-[10px] whitespace-nowrap text-white/45"
        >
          {checked} <span className="text-white/25">/</span> {total} checked
        </span>
        {summary ? (
          <>
            <RailTotal
              attr="data-label-rail-to-check"
              icon={Flag}
              count={summary.open}
              label={toCheckLabel(summary.open)}
              detail={onPointsDetail(summary.openPoints)}
              className={
                summary.open > 0 ? "text-[rgba(252,211,77,1)]" : "text-white/45"
              }
            />
            <RailTotal
              attr="data-label-rail-fixes"
              icon={WandSparkles}
              count={summary.fixes}
              label={fixesLabel(summary.fixes)}
              detail={onPointsDetail(summary.fixPoints)}
              className="text-white/55"
            />
          </>
        ) : null}
        {mismatch ? (
          <ScoreChip
            mismatch={mismatch}
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
        <LabelSaveStatus status={saveStatus} tone="dark" />
        <ChromeTooltip label="Exit full screen" side="bottom" align="end">
          <button
            type="button"
            data-label-black-exit=""
            aria-label="Exit full screen"
            onClick={onExit}
            className="flex size-[26px] shrink-0 cursor-pointer items-center justify-center rounded-[8px] text-white/70 transition-colors duration-200 hover:bg-white/[0.08] hover:text-white focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
          >
            <Minimize2
              className="size-3.5"
              strokeWidth={1.6}
              aria-hidden="true"
            />
          </button>
        </ChromeTooltip>
      </div>

      {/* The scroller and the pill's positioning context: the pill sits over
          the rows rather than among them, so it stays put while they move. */}
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
                  <BlackDeletedPoint key={point.id} point={point} edit={edit} />
                );
              }
              const band = bandBefore.get(point.id);
              const slot = slotBefore.get(point.id);
              const overflow = overflowBefore.get(point.id);
              // One point unfolds: the current one (the console's
              // `currentPointId`, playing or resting). Nothing else does.
              const open = point.id === expandedPointId;
              return (
                <Fragment key={point.id}>
                  {band ? (
                    <BlackGameBand
                      band={band}
                      points={points}
                      names={names}
                      onSetGameType={editable ? onSetGameType : undefined}
                      onSetGameServer={editable ? onSetGameServer : undefined}
                    />
                  ) : null}
                  {/* The slot sits between the pair's two rows: after the
                      point before it (and any band), before this one. */}
                  {slot ? (
                    <BlackSuggestedPoint
                      suggestion={slot}
                      point={point}
                      edit={edit}
                    />
                  ) : null}
                  {/* Before the first row that reads "Game–30": the game
                      is already won, these rows belong to the next one. */}
                  {overflow ? (
                    <BlackGameOverflow
                      overflow={overflow}
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
                      <BlackShotsWell point={point} edit={edit} marks={marks} />
                    ) : null}
                  </BlackPointRow>
                </Fragment>
              );
            })}
          </div>
        </div>

        {/* The film room's return pill (point-list.tsx `FollowPill`) in the
            room's own dark recipe — the inset hairline, since the rail is
            as dark as the room — pinned to the scroller's top-centre, over
            the rows. */}
        {affordance ? (
          <button
            type="button"
            data-label-follow-pill=""
            aria-label={affordance.ariaLabel}
            onClick={onFollow}
            className={cn(
              "absolute top-3 left-1/2 z-10 inline-flex h-7 -translate-x-1/2 cursor-pointer items-center rounded-[var(--radius-button)] bg-[rgba(13,13,13,0.72)] px-2.5 text-[11px] font-medium whitespace-nowrap text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)] transition-[background-color,transform] duration-200 ease-[var(--ease-primary)] hover:bg-[rgba(13,13,13,0.9)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none active:scale-[0.97]",
              // Pinned top, so it drops in (the keyframe reads the sign).
              "film-follow-pill-in [--film-pill-rise:-4px]",
            )}
          >
            {affordance.label}
          </button>
        ) : null}
      </div>
    </TooltipProvider>
  );
}

/**
 * One of the header's two totals: a glyph and a count in the progress
 * line's mono, named for a screen reader and the dark tooltip — the
 * marks-copy sentence over "On 30 points". Not a control: nothing happens on
 * a click.
 */
function RailTotal({
  attr,
  icon: Icon,
  count,
  label,
  detail,
  className,
}: {
  attr: string;
  icon: typeof Flag;
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
        {...{ [attr]: "" }}
        className={cn(
          "mono tabular inline-flex shrink-0 items-center gap-1 text-[10px] whitespace-nowrap",
          className,
        )}
      >
        <Icon className="size-2.5" strokeWidth={1.8} aria-hidden="true" />
        {count}
      </span>
    </ChromeTooltip>
  );
}

/**
 * The score that doesn't add up, as a chip in the header (board 08m's
 * `BANNER`, folded into one line): the labelled pair against the entered
 * one — "4–7 · entered 4–6" — in the open flag's amber, an amber dot in
 * front of it. Under 600px of header the words give way and the dot stands
 * alone; the hover says everything either way.
 *
 * With the three answers it is a `FloatMenu` trigger in the rail's dark
 * tone, each row saying what choosing it does: "Fix the entered score"
 * stores the labelled sets as the session's score, "Video ends early" says
 * the rows stop before the match did, and "Find the gap" goes to the
 * mismatching set's first point and writes nothing. The answers write ONLY
 * `label_sessions` (`final_score`, `video_ends_early`) — never `matches`.
 * Without them (a session that cannot be written) the chip is words alone,
 * not a control.
 */
function ScoreChip({
  mismatch,
  onFixEnteredScore,
  onVideoEndsEarly,
  onFindGap,
}: {
  mismatch: LabelScoreMismatch;
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
    "inline-flex h-[18px] shrink-0 items-center gap-[5px] rounded-full bg-[rgba(253,230,138,0.14)] px-1.5 text-[10px] font-medium whitespace-nowrap text-[rgba(252,211,77,1)]",
    answers &&
      "cursor-pointer transition-colors duration-200 hover:bg-[rgba(253,230,138,0.22)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
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

  if (!answers) {
    return (
      <ChromeTooltip
        label={SCORE_MISMATCH_LABEL}
        detail={detail}
        side="bottom"
        wrap
      >
        <span
          role="img"
          data-label-score-chip=""
          aria-label={`${SCORE_MISMATCH_LABEL}. ${detail}`}
          className={chip}
        >
          {inside}
        </span>
      </ChromeTooltip>
    );
  }

  return (
    <ChromeTooltip
      label={SCORE_MISMATCH_LABEL}
      detail={detail}
      side="bottom"
      hidden={open}
      wrap
    >
      <span className="inline-flex shrink-0">
        <FloatMenu
          open={open}
          onOpenChange={setOpen}
          align="end"
          width={272}
          tone="dark"
          label={SCORE_MISMATCH_LABEL}
          trigger={
            <button
              type="button"
              data-label-score-chip=""
              aria-label={SCORE_MISMATCH_LABEL}
              aria-haspopup="menu"
              aria-expanded={open}
              className={cn(chip, open && "bg-[rgba(253,230,138,0.22)]")}
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
    </ChromeTooltip>
  );
}

/**
 * Each game's band goes above its first live point, once — as
 * `LabelPointsTableView` places them: a point moved out of order never
 * repeats it, and a tombstone never carries one.
 */
function bandsBeforePoints(
  points: readonly LabelPoint[],
  games: readonly LabelGameBandScore[],
): ReadonlyMap<string, LabelGameBandScore> {
  const bandByGame = new Map(
    games.map((band) => [`${band.setNumber}·${band.gameNumber}`, band]),
  );
  const bandBefore = new Map<string, LabelGameBandScore>();
  for (const point of points) {
    if (point.status === "deleted") continue;
    const key = `${point.setNumber}·${point.gameNumber}`;
    const band = bandByGame.get(key);
    if (!band) continue;
    bandBefore.set(point.id, band);
    bandByGame.delete(key);
  }
  return bandBefore;
}

/**
 * Each overflowing game's rows past its end, keyed by the first of them —
 * the row the "already won" slot goes before.
 */
function overflowBeforePoints(
  points: readonly LabelPoint[],
  adScoring: boolean,
): ReadonlyMap<string, GameOverflow<LabelPoint>> {
  const before = new Map<string, GameOverflow<LabelPoint>>();
  for (const game of gameOverflow(points, adScoring)) {
    before.set(game.leftovers[0].id, game);
  }
  return before;
}

const NO_IDS: ReadonlySet<string> = new Set();
const NO_OVERFLOW: ReadonlyMap<string, GameOverflow<LabelPoint>> = new Map();
