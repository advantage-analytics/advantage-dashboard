/**
 * The court panel's review column as data: the open point's first open
 * review item (`reviewFlag`, marks-state.ts) put as one step — its question,
 * one sentence of explanation, where the flag lands on the court
 * (`reviewItemTarget`, extended with the add-shot slot), the answers it
 * offers and what each one writes, and what comes after it.
 *
 * Pure, and the answers are data: a `ReviewWrite` names an existing write
 * the console already has — a shot patch, a point patch, a split, the
 * removal of the strokes after one, a Dismiss key, the check tick, an added
 * shot at a slot — and the UI turns it into the call. Nothing here invents
 * a column. Every patch equals what the existing paths write: the ending and
 * winner come from `deriveEnding` / `endingPatchTo` (ending-derived.ts), the
 * same patch "Make it …" (`hintActions`) sends.
 */

import type { LabelPointPatch, LabelShotPatch } from "./edit";
import { deriveEnding, endingPatchTo } from "./ending-derived";
import { openFlags, stepFlag } from "./flag-nav";
import type { LabelMarks } from "./marks";
import { markHover, type MarkNames } from "./marks-copy";
import {
  lastCallAnswer,
  pointRowMarkList,
  reviewFlag,
  reviewItemQuestion,
  type ReviewItem,
  type ReviewItemId,
  type ReviewMember,
} from "./marks-state";
import {
  openMissingShot,
  reviewItemTarget,
  type ReviewTarget,
} from "./review-target";
import {
  isLetServe,
  isServeStroke,
  liveShotsInOrder,
  opponent,
  type LabelPoint,
  type LabelShot,
  type LabelSide,
  type LabelStroke,
} from "./session";
import {
  effectiveShotResult,
  landedOnOwnSide,
  shortOfNet,
} from "./shot-derived";
import { isSuggestionKey } from "./suggestions";

// ── Writes ──────────────────────────────────────────────────────────────────

/** Where the console opens the add-shot row for a missing stroke. */
export interface ReviewSlot {
  /** The live stroke the missing one follows. */
  afterShotId: string;
  /** Who hit the missing stroke; null when the rows do not say. */
  hitter: LabelSide | null;
  /** Its stroke, when the rows say it (a second serve after a fault). */
  kind: LabelStroke | null;
}

/**
 * One write an answer asks for, by the console path that already makes it:
 * `onPatchShot`, `onPatchPoint`, `operations.onSplitPoint`,
 * `onRemoveShotsAfter`, `operations.onDismissSuggestion` (one call a key),
 * `operations.onSetChecked(pointId, true)` and `operations.onAddShot`.
 */
export type ReviewWrite =
  | { write: "shot"; shotId: string; patch: LabelShotPatch }
  | { write: "point"; patch: LabelPointPatch }
  | { write: "split"; shotId: string }
  | { write: "removeAfter"; shotId: string }
  | { write: "dismiss"; keys: string[] }
  | { write: "check" }
  | { write: "addShot"; slot: ReviewSlot };

/** Amber for the reading the data already supports, plain for the rest. */
export type ReviewAnswerKind = "suggested" | "plain" | "dismiss";

export interface ReviewAnswer {
  id: string;
  label: string;
  kind: ReviewAnswerKind;
  /** A second line under the label, where there is one to say. */
  detail?: string;
  /** In order; an answer with none only closes the question on screen. */
  writes: readonly ReviewWrite[];
}

/** The target, with the add-shot slot for an item about a missing stroke. */
export interface ReviewStepTarget extends ReviewTarget {
  slot: ReviewSlot | null;
}

/** The stretch of film to replay for an end-of-point question. */
export interface ReviewReplay {
  fromShotId: string;
  toShotId: string;
}

export interface ReviewStep {
  item: ReviewItem;
  /** "n of m" over the point's open items, 1-based. */
  index: number;
  total: number;
  question: string;
  explanation: string;
  target: ReviewStepTarget;
  answers: ReviewAnswer[];
  /** "Then: add the second serve" — what follows this step, or null. */
  then: string | null;
  /** About three live strokes before the last through the last; item 4 only. */
  replay: ReviewReplay | null;
}

// ── Copy ────────────────────────────────────────────────────────────────────

export const REVIEW_STEP_QUESTION = {
  contact: "Where was it hit?",
  landing: "Where did it land?",
  serve: "How did the serve end?",
  lastBall: "How did the last ball end?",
} as const;

export const CONTACT_EXPLANATION =
  "No position from the video. The run-off grows as you click toward its edge, so a ball taken far behind the baseline still fits.";

export const LANDING_EXPLANATION =
  "No bounce from the video. Click where it landed, or say what happened.";

export const LOOKS_RIGHT_ANSWER = "Looks right";
export const DISMISS_ANSWER = "Dismiss";
export const ADD_SHOT_ANSWER = "Add the shot";
export const ADD_SECOND_SERVE_ANSWER = "Add the second serve";
export const SPLIT_ANSWER = "Split here";
export const SECOND_SERVE_ANSWER = "Make it a second serve";

/** "Remove the 2 shots after" — the follow-up's other answer. */
export function removeShotsAfterLabel(count: number): string {
  return `Remove the ${count} ${count === 1 ? "shot" : "shots"} after`;
}

/** "A lone first serve ended the point and Quan lost it. Click where …" */
export function loneServeExplanation(
  server: string | null,
  lost: boolean,
): string {
  const who = server && lost ? ` and ${server} lost it` : "";
  return `A lone first serve ended the point${who}. Click where it bounced, or say what happened.`;
}

/** "Click where it bounced. A bounce on Quan’s own side means it never cleared the net." */
export function lastBallExplanation(hitter: string | null): string {
  const side = hitter ? `${hitter}’s own side` : "the hitter’s own side";
  return `Click where it bounced. A bounce on ${side} means it never cleared the net.`;
}

/** "Bounced on Quan’s side, 3.0 m short of the net" — "Didn’t clear"'s line. */
export function shankDetail(hitter: string | null, metres: number): string {
  const side = hitter ? `${hitter}’s side` : "the hitter’s side";
  return `Bounced on ${side}, ${metres.toFixed(1)} m short of the net`;
}

/**
 * An item's short label after "Then:" — what the next step asks, said as a
 * thing to do.
 */
export function reviewItemThenLabel(item: ReviewItem): string {
  const open = openMembers(item);
  const has = (...codes: ReviewMember["mark"]["code"][]) =>
    open.some((member) => codes.includes(member.mark.code));
  switch (item.id) {
    case 1:
      return "add the missing shot";
    case 2:
      return has("shot_after_point_end")
        ? "split or remove the shots after"
        : "check for two points in one";
    case 3:
      return has("first_serve_fault_alone")
        ? "say how the serve ended"
        : "check the serves";
    case 4:
      return has("last_landing_missing", "last_shot_unresolved") &&
        !has(
          "last_call_overruled",
          "winner_disputed",
          "net_hit_contradicts_height",
          "ending_suspect_line",
          "winner_to_error_by_bounce",
          "ending_stale",
          "result_type_unknown",
        )
        ? "place the last bounce"
        : "say how the last ball ended";
    case 5:
      return "pick the winner";
    case 6:
      return "check the game and serve order";
    case 7:
      return "place the shot";
  }
}

// ── The point's open items, in the order they are asked ─────────────────────

const openMembers = (item: ReviewItem) =>
  item.members.filter((member) => member.state === "open");

const hasOpen = (item: ReviewItem, code: ReviewMember["mark"]["code"]) =>
  openMembers(item).some((member) => member.mark.code === code);

/** An item 2 that is only "Did the point end here?": the ending's follow-up. */
function isFollowUp(item: ReviewItem): boolean {
  const open = openMembers(item);
  return (
    item.id === 2 &&
    open.length > 0 &&
    open.every((member) => member.mark.code === "shot_after_point_end")
  );
}

/**
 * `item` with the members an edit elsewhere on the point settled asked
 * again: any change to a point settles every counted mark on it
 * (marks-state.ts `markState`), but the column's queue (`keep`) closes an
 * item only when the labeller answers it. Null when nothing is left to ask
 * (every member dismissed).
 */
function reopenSettled(item: ReviewItem): ReviewItem | null {
  const members = item.members
    .filter((member) => member.state !== "dismissed")
    .map((member) =>
      member.state === "settled"
        ? { ...member, state: "open" as const }
        : member,
    );
  if (!members.some((member) => member.state === "open")) return null;
  return { ...item, state: "open", members };
}

/**
 * The point's open items in the order the column asks them: id order
 * (`reviewFlag`, a demoted flag's too — the open point still asks it), except
 * that an item 2 open only on "Did the point end here?" is asked after item
 * 4 when that is open: the strokes after the point's end are the follow-up
 * to how it ended, not a question before it. `keep` names the items the
 * console's queue still has to ask, which an edit elsewhere on the point
 * may have settled (`reopenSettled`).
 */
export function openReviewItems(
  point: LabelPoint,
  marks: LabelMarks,
  points: readonly LabelPoint[],
  keep?: readonly ReviewItemId[],
): ReviewItem[] {
  const flag = reviewFlag(point, marks, points);
  if (!flag) return [];
  const open = flag.items.flatMap((item) => {
    if (item.state === "open") return [item];
    const reopened = keep?.includes(item.id) ? reopenSettled(item) : null;
    return reopened ? [reopened] : [];
  });
  const ending = open.find((item) => item.id === 4);
  const followUp = open.find(isFollowUp);
  if (!ending || !followUp) return open;
  const rest = open.filter((item) => item !== followUp);
  const at = rest.indexOf(ending);
  return [...rest.slice(0, at + 1), followUp, ...rest.slice(at + 1)];
}

// ── The step ────────────────────────────────────────────────────────────────

/** The live strokes an ending is read off: no tombstone, no ghost, no let. */
function played(point: LabelPoint, ghosts: boolean): LabelShot[] {
  return liveShotsInOrder(point, ghosts).filter((shot) => !isLetServe(shot));
}

const landingMissing = (shot: LabelShot) =>
  shot.landingX === null || shot.landingY === null;

/** The first open `missing_shot` slot of the point, as `memberShotId` finds it. */
function openMissingShotSlot(
  point: LabelPoint,
  marks: LabelMarks,
): ReviewSlot | null {
  const slot = openMissingShot(point, marks);
  if (!slot) return null;
  return { afterShotId: slot.afterShotId, hitter: slot.hitter, kind: null };
}

/**
 * Where the step lands: `reviewItemTarget`'s stroke and end, plus the slot
 * for a missing stroke — "Missing shot?" at its open slot, a lone faulted
 * first serve at the second serve it needs (after the serve, by the server).
 */
export function reviewStepTarget(
  item: ReviewItem,
  point: LabelPoint,
  marks: LabelMarks,
  ghosts: boolean,
): ReviewStepTarget {
  const base = reviewItemTarget(item, point, marks, ghosts);
  let slot: ReviewSlot | null = null;
  if (item.id === 1 && hasOpen(item, "same_player_consecutive")) {
    slot = openMissingShotSlot(point, marks);
  } else if (item.id === 3 && hasOpen(item, "first_serve_fault_alone")) {
    const serve = liveShotsInOrder(point, ghosts).at(-1);
    if (serve && serve.stroke === "first_serve") {
      slot = {
        afterShotId: serve.id,
        hitter: serve.hitter,
        kind: "second_serve",
      };
    }
  }
  return { ...base, slot };
}

/** The stroke the step's target names, or undefined. */
function targetStroke(
  target: ReviewStepTarget,
  point: LabelPoint,
): LabelShot | undefined {
  return target.shotId === null
    ? undefined
    : point.shots.find((shot) => shot.id === target.shotId);
}

/** The question the step puts, by what it asks for. */
function stepQuestion(
  item: ReviewItem,
  target: ReviewStepTarget,
  point: LabelPoint,
): string {
  if (target.place === "contact") return REVIEW_STEP_QUESTION.contact;
  if (item.id === 3 && hasOpen(item, "first_serve_fault_alone")) {
    return REVIEW_STEP_QUESTION.serve;
  }
  const stroke = targetStroke(target, point);
  if (target.place === "landing" && stroke && landingMissing(stroke)) {
    return REVIEW_STEP_QUESTION.landing;
  }
  if (item.id === 4) return REVIEW_STEP_QUESTION.lastBall;
  return reviewItemQuestion(item);
}

/** One sentence under the question, with the players' names. */
function stepExplanation(
  item: ReviewItem,
  target: ReviewStepTarget,
  point: LabelPoint,
  names: MarkNames,
  ghosts: boolean,
): string {
  const stroke = targetStroke(target, point);
  if (target.place === "contact") return CONTACT_EXPLANATION;
  if (item.id === 3 && hasOpen(item, "first_serve_fault_alone")) {
    const serve = liveShotsInOrder(point, ghosts).at(-1);
    const server = serve?.hitter ?? null;
    const lost = server !== null && point.winner === opponent(server);
    return loneServeExplanation(server && names[server], lost);
  }
  if (target.place === "landing" && stroke && landingMissing(stroke)) {
    return LANDING_EXPLANATION;
  }
  if (item.id === 4) {
    const last = played(point, ghosts).at(-1);
    return lastBallExplanation(last?.hitter ? names[last.hitter] : null);
  }
  const first = openMembers(item)[0];
  return first ? markHover(first.mark, names) : item.question;
}

/**
 * The point patch a result on `shot` leads to: the ending and winner the
 * strokes then derive, as `endingPatchTo` writes them — null when nothing
 * moves or the strokes settle nothing (a lone first serve that missed).
 */
export function endingWriteFor(
  point: LabelPoint,
  shotId: string,
  result: "in" | "out" | "net",
  ghosts: boolean,
): LabelPointPatch | null {
  const after = {
    ...point,
    shots: point.shots.map((shot) =>
      shot.id === shotId ? { ...shot, result } : shot,
    ),
  };
  const now = deriveEnding(after, ghosts);
  return now ? endingPatchTo(point, now) : null;
}

/** The stored dismiss keys of an item's members (and `extra`), each once. */
function dismissKeys(
  item: ReviewItem,
  extra: readonly string[] = [],
): string[] {
  return [
    ...new Set(
      [...item.members.map((member) => member.dismissKey), ...extra].filter(
        (key): key is string => isSuggestionKey(key),
      ),
    ),
  ];
}

/**
 * A result on `shot`, then the ending it leads to. An answer that only
 * confirms what the rows already hold changes nothing, so on its own it
 * would leave the question standing: `item`'s members are dismissed instead
 * (their stored keys), which closes it as the labeller meant.
 */
function resultWrites(
  point: LabelPoint,
  shotId: string,
  result: "in" | "out" | "net",
  ghosts: boolean,
  item?: ReviewItem,
): ReviewWrite[] {
  const ending = endingWriteFor(point, shotId, result, ghosts);
  const stored = point.shots.find((shot) => shot.id === shotId)?.result;
  if (item && stored === result && ending === null) {
    const keys = dismissKeys(item);
    return keys.length > 0 ? [{ write: "dismiss", keys }] : [];
  }
  return [
    { write: "shot", shotId, patch: { result } },
    ...(ending ? [{ write: "point" as const, patch: ending }] : []),
  ];
}

/** An item's Dismiss: every member's stored key, each once; none → null. */
function dismissAnswer(
  item: ReviewItem,
  extraKeys: readonly string[] = [],
): ReviewAnswer | null {
  const keys = dismissKeys(item, extraKeys);
  if (keys.length === 0) return null;
  return {
    id: "dismiss",
    label: DISMISS_ANSWER,
    kind: "dismiss",
    writes: [{ write: "dismiss", keys }],
  };
}

/**
 * Item 4's answers, named by the last ball's hitter: "Winner by", "Out by",
 * "Net by", and "Didn’t clear by" when its landing is on the hitter's own
 * half. Each writes the last stroke's result and the ending the strokes then
 * derive. The one matching the vendor's call ("Was the last ball in?") or,
 * without one, the stroke's own reading (`effectiveShotResult`) is
 * `suggested`; a shank's suggestion is "Didn’t clear", not "Net".
 */
function lastBallAnswers(
  item: ReviewItem,
  point: LabelPoint,
  marks: LabelMarks,
  names: MarkNames,
  ghosts: boolean,
): ReviewAnswer[] {
  const last = played(point, ghosts).at(-1);
  if (!last) return [];
  const who = last.hitter ? names[last.hitter] : null;
  const by = who ? ` by ${who}` : "";
  const { count } = pointRowMarkList(point, marks);
  const call = hasOpen(item, "last_call_overruled")
    ? lastCallAnswer(point, count, ghosts)
    : null;
  const target = call?.shotId ?? last.id;
  const shank = landedOnOwnSide(last);
  const expected: "in" | "out" | "net" | null =
    call?.mark.params.vendorCall ??
    (() => {
      const own = effectiveShotResult(last);
      return own === "in" || own === "out" || own === "net" ? own : null;
    })();
  const kindOf = (result: "in" | "out" | "net", shankAnswer = false) =>
    expected === result && (result !== "net" || shank === shankAnswer)
      ? "suggested"
      : "plain";
  const inLabel =
    isServeStroke(last.stroke) && !isLetServe(last) ? "Ace" : "Winner";
  const answers: ReviewAnswer[] = [
    {
      id: "in",
      label: `${inLabel}${by}`,
      kind: kindOf("in"),
      writes: resultWrites(point, target, "in", ghosts, item),
    },
    {
      id: "out",
      label: `Out${by}`,
      kind: kindOf("out"),
      writes: resultWrites(point, target, "out", ghosts, item),
    },
    {
      id: "net",
      label: `Net${by}`,
      kind: kindOf("net"),
      writes: resultWrites(point, target, "net", ghosts, item),
    },
  ];
  if (shank) {
    const short = shortOfNet(last);
    answers.push({
      id: "short",
      label: `Didn’t clear${by}`,
      kind: kindOf("net", true),
      detail: short === null ? undefined : shankDetail(who, short),
      writes: resultWrites(point, target, "net", ghosts, item),
    });
  }
  return answers;
}

/** The lone first serve's answers: Out, Net, In on the serve itself. */
function loneServeAnswers(
  point: LabelPoint,
  ghosts: boolean,
  slot: ReviewSlot | null,
): ReviewAnswer[] {
  const serve = liveShotsInOrder(point, ghosts).at(-1);
  if (!serve || serve.stroke !== "first_serve") return [];
  const plain = (id: "out" | "net" | "in", label: string): ReviewAnswer => ({
    id,
    label,
    kind: "plain",
    writes: resultWrites(point, serve.id, id, ghosts),
  });
  return [
    plain("out", "Out"),
    plain("net", "Net"),
    plain("in", "In"),
    ...(slot
      ? [
          {
            id: "add-second-serve",
            label: ADD_SECOND_SERVE_ANSWER,
            kind: "plain" as const,
            writes: [{ write: "addShot" as const, slot }],
          },
        ]
      : []),
  ];
}

/**
 * The follow-up's answers (`shot_after_point_end`): "Split here" at the
 * first stroke after, its question dismissed with it, and "Remove the N
 * shots after" — marking the ball out when it is not stored so already
 * (which drops the strokes after it in the same write, operations.ts
 * `deadBallsAfterMiss`), else removing them. The same writes as
 * `hintActions`'.
 */
function afterPointEndAnswers(
  member: Extract<ReviewMember["mark"], { code: "shot_after_point_end" }>,
  point: LabelPoint,
): ReviewAnswer[] {
  const { shotId, after } = member.params;
  const stored = point.shots.find((shot) => shot.id === shotId)?.result;
  const key = `point_ended:${shotId}`;
  return [
    {
      id: "split",
      label: SPLIT_ANSWER,
      kind: "plain",
      writes: [
        ...(isSuggestionKey(key)
          ? [{ write: "dismiss" as const, keys: [key] }]
          : []),
        { write: "split", shotId: after[0] },
      ],
    },
    {
      id: "remove-after",
      label: removeShotsAfterLabel(after.length),
      kind: "plain",
      writes: [
        stored === "out" || stored === "net"
          ? { write: "removeAfter", shotId }
          : { write: "shot", shotId, patch: { result: "out" } },
      ],
    },
  ];
}

/** The answers an item offers, by what is open on it. */
function stepAnswers(
  item: ReviewItem,
  target: ReviewStepTarget,
  point: LabelPoint,
  marks: LabelMarks,
  names: MarkNames,
  ghosts: boolean,
  /** Whether this is the point's last open item. */
  last = true,
): ReviewAnswer[] {
  const answers: ReviewAnswer[] = [];
  const extraDismiss: string[] = [];
  switch (item.id) {
    case 1: {
      if (target.slot) {
        answers.push({
          id: "add-shot",
          label: ADD_SHOT_ANSWER,
          kind: "plain",
          writes: [{ write: "addShot", slot: target.slot }],
        });
        const slot = marks.suggestions.find(
          (s) =>
            s.kind === "missing_shot" &&
            s.pointId === point.id &&
            s.afterShotId === target.slot?.afterShotId,
        );
        if (slot) extraDismiss.push(slot.key);
      }
      break;
    }
    case 2: {
      for (const { mark } of openMembers(item)) {
        if (mark.code === "shot_after_point_end") {
          answers.push(...afterPointEndAnswers(mark, point));
        } else if (mark.code === "serve_after_serve_in") {
          answers.push({
            id: "split",
            label: SPLIT_ANSWER,
            kind: "plain",
            writes: [{ write: "split", shotId: mark.params.shotId }],
          });
        }
      }
      break;
    }
    case 3: {
      for (const { mark } of openMembers(item)) {
        if (mark.code === "second_serve_as_first") {
          answers.push({
            id: "second-serve",
            label: SECOND_SERVE_ANSWER,
            kind: "plain",
            writes: [
              {
                write: "shot",
                shotId: mark.params.shotId,
                patch: { stroke: "second_serve" },
              },
            ],
          });
        }
      }
      if (hasOpen(item, "first_serve_fault_alone")) {
        answers.push(...loneServeAnswers(point, ghosts, target.slot));
      }
      break;
    }
    case 4:
      answers.push(...lastBallAnswers(item, point, marks, names, ghosts));
      break;
    case 5:
      for (const side of ["p1", "p2"] as const) {
        if (point.winner === side) continue;
        answers.push({
          id: `won-${side}`,
          label: `Won by ${names[side]}`,
          kind: "plain",
          writes: [{ write: "point", patch: { winner: side } }],
        });
      }
      break;
    case 6:
    case 7:
      break;
  }
  const dismiss = dismissAnswer(item, extraDismiss);
  if (dismiss) answers.push(dismiss);
  if (point.checkedAt === null) {
    // "Looks right" confirms what this question is about. On the point's last
    // open question that is the whole point, so it is the check tick; before
    // then it closes this question alone (its marks dismissed), so the
    // "Then:" line's next question still comes.
    answers.push({
      id: "looks-right",
      label: LOOKS_RIGHT_ANSWER,
      kind: "plain",
      writes: last || !dismiss ? [{ write: "check" }] : dismiss.writes,
    });
  }
  return answers;
}

/** About three live strokes before the last, through the last. */
export const REPLAY_SHOTS_BEFORE_LAST = 3;

function stepReplay(point: LabelPoint, ghosts: boolean): ReviewReplay | null {
  const live = liveShotsInOrder(point, ghosts);
  const last = live.at(-1);
  if (!last) return null;
  const from = live[Math.max(0, live.length - 1 - REPLAY_SHOTS_BEFORE_LAST)];
  return { fromShotId: from.id, toShotId: last.id };
}

/** What follows the step: the lone serve's second serve, else the next item. */
function stepThen(
  item: ReviewItem,
  next: ReviewItem | undefined,
): string | null {
  if (item.id === 3 && hasOpen(item, "first_serve_fault_alone")) {
    return "Then: add the second serve";
  }
  return next ? `Then: ${reviewItemThenLabel(next)}` : null;
}

/**
 * The point's first open item as the court panel's review column asks it
 * (`openReviewItems` order), or null with nothing open. `ghosts` is
 * `drawsGhosts(marks)`: whether a site-removed stroke is still a ghost.
 */
export function reviewStep(
  point: LabelPoint,
  marks: LabelMarks,
  points: readonly LabelPoint[],
  names: MarkNames,
  ghosts: boolean,
  /** The console's queue: items still to ask though an edit settled them. */
  keep?: readonly ReviewItemId[],
): ReviewStep | null {
  const open = openReviewItems(point, marks, points, keep);
  const item = open[0];
  if (!item) return null;
  const target = reviewStepTarget(item, point, marks, ghosts);
  return {
    item,
    index: 1,
    total: open.length,
    question: stepQuestion(item, target, point),
    explanation: stepExplanation(item, target, point, names, ghosts),
    target,
    answers: stepAnswers(
      item,
      target,
      point,
      marks,
      names,
      ghosts,
      open.length === 1,
    ),
    then: stepThen(item, open[1]),
    replay: item.id === 4 ? stepReplay(point, ghosts) : null,
  };
}

// ── Auto-advance ────────────────────────────────────────────────────────────

export interface ReviewStop {
  pointId: string;
  /** The point's first open item, in the column's order. */
  item: ReviewItem;
}

/**
 * Where the column goes after an answer: the same point while it still has
 * an open item, else the next flagged point in `direction` (`openFlags` /
 * `stepFlag`, flag-nav.ts — wrapping round the match, demoted flags left
 * out as the rail leaves them). Null with nothing open anywhere.
 */
export function nextReviewStop(
  points: readonly LabelPoint[],
  marks: LabelMarks,
  fromPointId: string | null,
  direction: 1 | -1,
): ReviewStop | null {
  const current =
    fromPointId === null
      ? undefined
      : points.find((point) => point.id === fromPointId);
  if (current) {
    const [item] = openReviewItems(current, marks, points);
    if (item) return { pointId: current.id, item };
  }
  const flag = stepFlag(
    openFlags(points, marks),
    points,
    fromPointId,
    direction,
  );
  if (!flag) return null;
  const point = points.find((p) => p.id === flag.pointId);
  if (!point) return null;
  const [item] = openReviewItems(point, marks, points);
  return item ? { pointId: point.id, item } : null;
}
