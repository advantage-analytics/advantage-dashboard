/**
 * The edit vocabulary of the labelling console: which `label_shots` and
 * `label_points` columns a labeller may change, what each may hold, and how a
 * change moves the row's `status`.
 *
 * Pure and import-free of anything server-side — the server actions validate
 * with it (edit-session.ts) and the `"use client"` console uses the same
 * functions for its optimistic update, so the pill a labeller sees the moment
 * they edit is the status the server is about to write.
 *
 * Patches are keyed by COLUMN name (`contact_x`, `ended_by`), the wire format
 * of `updateLabelShot` / `updateLabelPoint`. Every allowed value is one the
 * migration's CHECK accepts (supabase/migrations/20260928180000_label_sessions.sql),
 * so a patch that parses here can never be refused by the table.
 */

import type {
  LabelEnding,
  LabelPoint,
  LabelPointStatus,
  LabelServeSide,
  LabelShot,
  LabelShotResult,
  LabelShotStatus,
  LabelSide,
  LabelStroke,
} from "./session";

// ── Vocabularies (one per CHECK list in the migration) ─────────────────────

export const LABEL_SIDES: readonly LabelSide[] = ["p1", "p2"];

export const LABEL_STROKES: readonly LabelStroke[] = [
  "first_serve",
  "second_serve",
  "forehand",
  "backhand",
  "forehand_volley",
  "backhand_volley",
  "overhead",
];

export const LABEL_SHOT_RESULTS: readonly LabelShotResult[] = [
  "in",
  "out",
  "net",
];

export const LABEL_ENDINGS: readonly LabelEnding[] = [
  "ace",
  "service_winner",
  "double_fault",
  "winner",
  "error",
  "let_replayed",
  "not_a_point",
];

export const LABEL_SERVE_SIDES: readonly LabelServeSide[] = ["deuce", "ad"];

// ── Shots ───────────────────────────────────────────────────────────────────

/** The `label_shots` columns whose value a labeller sets. */
export const LABEL_SHOT_VALUE_FIELDS = [
  "hitter",
  "stroke",
  "result",
  "contact_x",
  "contact_y",
  "landing_x",
  "landing_y",
  "video_time",
] as const;
export type LabelShotValueField = (typeof LABEL_SHOT_VALUE_FIELDS)[number];

/** Every key `updateLabelShot` accepts: the values, plus `unclear`. */
export const LABEL_SHOT_EDIT_FIELDS = [
  ...LABEL_SHOT_VALUE_FIELDS,
  "unclear",
] as const;
export type LabelShotEditField = (typeof LABEL_SHOT_EDIT_FIELDS)[number];

/** A shot's editable values, keyed by column. */
export interface LabelShotValues {
  hitter: LabelSide | null;
  stroke: LabelStroke | null;
  result: LabelShotResult | null;
  contact_x: number | null;
  contact_y: number | null;
  landing_x: number | null;
  landing_y: number | null;
  video_time: number | null;
}

export type LabelShotPatch = Partial<LabelShotValues> & {
  /**
   * The value fields the video cannot settle — excluded from scoring. Names
   * come from {@link LABEL_SHOT_VALUE_FIELDS}; the list replaces the stored
   * one whole.
   */
  unclear?: LabelShotValueField[];
};

// ── Points ──────────────────────────────────────────────────────────────────

/** The `label_points` columns whose value a labeller sets. */
export const LABEL_POINT_VALUE_FIELDS = [
  "winner",
  "ending",
  "ended_by",
  "serve_side",
] as const;
export type LabelPointValueField = (typeof LABEL_POINT_VALUE_FIELDS)[number];

/** Every key `updateLabelPoint` accepts: the values, plus the free-text note. */
export const LABEL_POINT_EDIT_FIELDS = [
  ...LABEL_POINT_VALUE_FIELDS,
  "note",
] as const;
export type LabelPointEditField = (typeof LABEL_POINT_EDIT_FIELDS)[number];

export interface LabelPointValues {
  winner: LabelSide | null;
  ending: LabelEnding | null;
  ended_by: LabelSide | null;
  serve_side: LabelServeSide | null;
}

export type LabelPointPatch = Partial<LabelPointValues> & {
  note?: string | null;
};

/** The longest note kept — a sentence or two about a point, not an essay. */
export const LABEL_NOTE_MAX = 2000;

// ── Parsing ─────────────────────────────────────────────────────────────────

export type ParseResult<T> = { ok: true; patch: T } | { error: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/** `null`, or one of `allowed`. */
function vocab<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | null | undefined {
  if (value === null) return null;
  return typeof value === "string" &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

/** `null`, or a finite number. `undefined` = invalid. */
function finite(value: unknown): number | null | undefined {
  if (value === null) return null;
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function checkKeys(
  input: Record<string, unknown>,
  allowed: readonly string[],
  what: string,
): string | null {
  const keys = Object.keys(input);
  if (keys.length === 0) return `Nothing to update on the ${what}.`;
  const unknown = keys.filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    return `A ${what} edit cannot change ${unknown.map((k) => `"${k}"`).join(", ")}.`;
  }
  return null;
}

/**
 * A shot patch, validated whole: any key outside
 * {@link LABEL_SHOT_EDIT_FIELDS} rejects the entire patch, so nothing is
 * written from a request that tried to reach `status`, `event_id` or `vendor`.
 *
 * A position travels as a pair — `contact_x` with `contact_y`, `landing_x`
 * with `landing_y`, both numbers or both null — for the same reason
 * `parse.ts` nulls vendor positions as a pair: half a position is a real
 * sideline at a nonsense depth.
 */
export function parseLabelShotPatch(
  input: unknown,
): ParseResult<LabelShotPatch> {
  if (!isPlainObject(input)) return { error: "A shot edit must be an object." };
  const keyError = checkKeys(input, LABEL_SHOT_EDIT_FIELDS, "shot");
  if (keyError) return { error: keyError };

  const patch: LabelShotPatch = {};

  if ("hitter" in input) {
    const v = vocab(input.hitter, LABEL_SIDES);
    if (v === undefined) return { error: "Player must be p1 or p2." };
    patch.hitter = v;
  }
  if ("stroke" in input) {
    const v = vocab(input.stroke, LABEL_STROKES);
    if (v === undefined) return { error: "Unknown stroke." };
    patch.stroke = v;
  }
  if ("result" in input) {
    const v = vocab(input.result, LABEL_SHOT_RESULTS);
    if (v === undefined) return { error: "Result must be in, out or net." };
    patch.result = v;
  }

  for (const [x, y, name] of [
    ["contact_x", "contact_y", "Hit position"],
    ["landing_x", "landing_y", "Landing position"],
  ] as const) {
    const hasX = x in input;
    const hasY = y in input;
    if (!hasX && !hasY) continue;
    if (hasX !== hasY) {
      return { error: `${name} needs both ${x} and ${y}.` };
    }
    const vx = finite(input[x]);
    const vy = finite(input[y]);
    if (vx === undefined || vy === undefined) {
      return { error: `${name} must be two numbers, in metres.` };
    }
    if ((vx === null) !== (vy === null)) {
      return { error: `${name} must be set or cleared as a pair.` };
    }
    patch[x] = vx;
    patch[y] = vy;
  }

  if ("video_time" in input) {
    const v = finite(input.video_time);
    if (v === undefined || (v !== null && v < 0)) {
      return { error: "Time must be a number of seconds, not negative." };
    }
    patch.video_time = v;
  }

  if ("unclear" in input) {
    const list = input.unclear;
    if (
      !Array.isArray(list) ||
      !list.every(
        (item) =>
          typeof item === "string" &&
          (LABEL_SHOT_VALUE_FIELDS as readonly string[]).includes(item),
      )
    ) {
      return {
        error: `Unclear must list shot fields: ${LABEL_SHOT_VALUE_FIELDS.join(", ")}.`,
      };
    }
    patch.unclear = [...new Set(list as LabelShotValueField[])];
  }

  return { ok: true, patch };
}

/** A point patch, validated whole — see {@link parseLabelShotPatch}. */
export function parseLabelPointPatch(
  input: unknown,
): ParseResult<LabelPointPatch> {
  if (!isPlainObject(input))
    return { error: "A point edit must be an object." };
  const keyError = checkKeys(input, LABEL_POINT_EDIT_FIELDS, "point");
  if (keyError) return { error: keyError };

  const patch: LabelPointPatch = {};

  if ("winner" in input) {
    const v = vocab(input.winner, LABEL_SIDES);
    if (v === undefined) return { error: "Won by must be p1 or p2." };
    patch.winner = v;
  }
  if ("ending" in input) {
    const v = vocab(input.ending, LABEL_ENDINGS);
    if (v === undefined) return { error: "Unknown ending." };
    patch.ending = v;
  }
  if ("ended_by" in input) {
    const v = vocab(input.ended_by, LABEL_SIDES);
    if (v === undefined) return { error: "Ended by must be p1 or p2." };
    patch.ended_by = v;
  }
  if ("serve_side" in input) {
    const v = vocab(input.serve_side, LABEL_SERVE_SIDES);
    if (v === undefined) return { error: "Serve side must be deuce or ad." };
    patch.serve_side = v;
  }
  if ("note" in input) {
    const note = input.note;
    if (note !== null && typeof note !== "string") {
      return { error: "A note must be text." };
    }
    const trimmed = note === null ? "" : note.trim();
    if (trimmed.length > LABEL_NOTE_MAX) {
      return { error: `A note is at most ${LABEL_NOTE_MAX} characters.` };
    }
    patch.note = trimmed === "" ? null : trimmed;
  }

  return { ok: true, patch };
}

// ── Status ──────────────────────────────────────────────────────────────────

/**
 * How close two values of one field must be to count as the same label.
 *
 * Positions: 1 cm. The console prints metres to two places and a court click
 * resolves to ~6 cm, so a retyped "1.80" over a stored 1.8049 is the same
 * position, not an edit. Time: 0.05 s, half the tenth the console prints — a
 * retyped "41:13.1" over a stored 2473.12 (a `real`, so it round-trips with
 * float noise anyway) is the same stroke time.
 */
export const POSITION_TOLERANCE_M = 0.01;
export const VIDEO_TIME_TOLERANCE_S = 0.05;

const TOLERANCE: Partial<Record<LabelShotValueField, number>> = {
  contact_x: POSITION_TOLERANCE_M,
  contact_y: POSITION_TOLERANCE_M,
  landing_x: POSITION_TOLERANCE_M,
  landing_y: POSITION_TOLERANCE_M,
  video_time: VIDEO_TIME_TOLERANCE_S,
};

/** Whether two values of `field` are the same label, within its tolerance. */
export function sameShotValue(
  field: LabelShotValueField,
  a: LabelShotValues[LabelShotValueField],
  b: LabelShotValues[LabelShotValueField],
): boolean {
  if (a === null || b === null) return a === b;
  const tolerance = TOLERANCE[field];
  if (
    tolerance !== undefined &&
    typeof a === "number" &&
    typeof b === "number"
  ) {
    return Math.abs(a - b) < tolerance;
  }
  return a === b;
}

/**
 * The status a shot takes after `patch` is applied to `current`.
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 *   added    stays added — a stroke the labeller put in has no vendor value
 *            to differ from (and the migration forbids an `added` row with an
 *            event id, so it can never become a vendor shot).
 *   deleted  is left alone — tombstones are T7's; edit-session.ts refuses to
 *            edit one at all.
 *   kept     becomes `edited` when any patched VALUE field differs, beyond
 *            its tolerance, from its baseline; otherwise stays `kept`.
 *   edited   stays `edited`.
 *
 * ── The baseline: the vendor snapshot as the seed mapped it ────────────────
 * A field's baseline is the value the seed wrote for it (seed.ts
 * `buildLabelSeed`): the row's own `vendor` stroke carried through the
 * pinned derivation into the label vocabulary. While a row is `kept`, every
 * one of its value fields still holds exactly that — `kept` means nothing has
 * diverged — so for a `kept` row the baseline IS `current`, and this compares
 * against it.
 *
 * Why not re-derive each baseline from the `vendor` jsonb instead: three of
 * the eight fields cannot be derived from one stroke at all —
 *   hitter  the vendor names a free-text player label; which label is p1 is
 *           the fold's call over the whole match (transcript.ts `player1`);
 *   result  structural, from the stroke's rally position and the point's
 *           WINNER (result-type.ts `shotResult`) — the vendor's own `in` flag
 *           is contradicted on 16–38% of rally strokes;
 *   stroke  for a serve, first vs second depends on the other serves in the
 *           rally; the vendor says only "serve".
 * The other five (positions via `metersToCourtFrame`, time via the job's
 * `start_time_seconds`) could be re-derived, but only with TODAY's
 * derivation code, while the seed used the session's pinned
 * `derivation_version` — once the two drift, a no-op edit would read as a
 * change. The seeded value has neither problem.
 *
 * The price: an `edited` shot does not go back to `kept` when its values are
 * set back, because an overwritten seed value is no longer in the row to
 * compare against. `edited` therefore means "the labeller changed a value
 * here", which is what the pill tells them.
 *
 * `unclear` never moves the status: it says the video cannot settle a field,
 * not that the field's value is different.
 */
export function labelShotStatusAfterPatch(
  current: LabelShotValues & { status: LabelShotStatus },
  patch: LabelShotPatch,
): LabelShotStatus {
  if (current.status !== "kept") return current.status;
  for (const field of LABEL_SHOT_VALUE_FIELDS) {
    if (!(field in patch)) continue;
    const next = patch[field] as LabelShotValues[typeof field];
    if (!sameShotValue(field, current[field], next)) return "edited";
  }
  return "kept";
}

/**
 * The status a point takes after `patch`: `unchanged` becomes `edited` when a
 * patched value field differs from the stored one; `edited`, `added` and
 * `deleted` are left as they are. The note never moves it — it annotates the
 * point, it is not a label.
 */
export function labelPointStatusAfterPatch(
  current: LabelPointValues & { status: LabelPointStatus },
  patch: LabelPointPatch,
): LabelPointStatus {
  if (current.status !== "unchanged") return current.status;
  for (const field of LABEL_POINT_VALUE_FIELDS) {
    if (!(field in patch)) continue;
    if (current[field] !== patch[field]) return "edited";
  }
  return "unchanged";
}

// ── The console's camelCase rows ────────────────────────────────────────────

/** A console shot's value fields, keyed by column. */
export function labelShotValues(shot: LabelShot): LabelShotValues {
  return {
    hitter: shot.hitter,
    stroke: shot.stroke,
    result: shot.result,
    contact_x: shot.contactX,
    contact_y: shot.contactY,
    landing_x: shot.landingX,
    landing_y: shot.landingY,
    video_time: shot.videoTime,
  };
}

/** A console point's value fields, keyed by column. */
export function labelPointValues(point: LabelPoint): LabelPointValues {
  return {
    winner: point.winner,
    ending: point.ending,
    ended_by: point.endedBy,
    serve_side: point.serveSide,
  };
}

/** `shot` with `patch`'s values (and the status they imply) applied. */
export function applyLabelShotPatch(
  shot: LabelShot,
  patch: LabelShotPatch,
): LabelShot {
  const next: LabelShot = {
    ...shot,
    status: labelShotStatusAfterPatch(
      { ...labelShotValues(shot), status: shot.status },
      patch,
    ),
  };
  if ("hitter" in patch) next.hitter = patch.hitter ?? null;
  if ("stroke" in patch) next.stroke = patch.stroke ?? null;
  if ("result" in patch) next.result = patch.result ?? null;
  if ("contact_x" in patch) next.contactX = patch.contact_x ?? null;
  if ("contact_y" in patch) next.contactY = patch.contact_y ?? null;
  if ("landing_x" in patch) next.landingX = patch.landing_x ?? null;
  if ("landing_y" in patch) next.landingY = patch.landing_y ?? null;
  if ("video_time" in patch) next.videoTime = patch.video_time ?? null;
  return next;
}

/** `point` with `patch`'s values (and the status they imply) applied. */
export function applyLabelPointPatch(
  point: LabelPoint,
  patch: LabelPointPatch,
): LabelPoint {
  const next: LabelPoint = {
    ...point,
    status: labelPointStatusAfterPatch(
      { ...labelPointValues(point), status: point.status },
      patch,
    ),
  };
  if ("winner" in patch) next.winner = patch.winner ?? null;
  if ("ending" in patch) next.ending = patch.ending ?? null;
  if ("ended_by" in patch) next.endedBy = patch.ended_by ?? null;
  if ("serve_side" in patch) next.serveSide = patch.serve_side ?? null;
  return next;
}
