/**
 * The edit vocabulary of the labelling console: which `label_shots` and
 * `label_points` columns a labeller may change, what each may hold, and how a
 * change moves the row's `status`.
 *
 * Pure: the server actions validate with it (edit-session.ts) and the console
 * uses the same functions for its optimistic update, so the two cannot
 * disagree.
 *
 * Patches are keyed by COLUMN name (`contact_x`, `ended_by`). Every allowed
 * value is one the migration's CHECK accepts
 * (supabase/migrations/20260928190122_label_sessions.sql).
 */

import {
  isServeStroke,
  LABEL_SPINS,
  type LabelEnding,
  type LabelPoint,
  type LabelPointSeedValues,
  type LabelPointStatus,
  type LabelServeSide,
  type LabelShot,
  type LabelShotResult,
  type LabelShotSeedValues,
  type LabelShotStatus,
  type LabelSide,
  type LabelStroke,
} from "./session";

export { LABEL_SPINS };

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
  "let",
];

/**
 * Why a patch may not leave the row a let on a stroke that is not a serve, or
 * null when it may. A let is a serve's result and nothing else's, so the row is
 * judged as the patch would leave it: the patch's own `stroke` and `result`
 * where it carries them, else the stored row's. That refuses both a let set on
 * a forehand and a let serve retyped to a forehand without its result cleared
 * (the rail sends the calculated result with such a retype,
 * `strokeChangePatch`). With nothing in hand to judge (a patch parsed before
 * the row is read) there is nothing to refuse yet — the write re-asks with the
 * row (edit-session.ts `writeLabelShotEdit`).
 */
export function letResultError(
  patch: LabelShotPatch,
  stored?: Pick<LabelShotValues, "stroke"> &
    Partial<Pick<LabelShotValues, "result">>,
): string | null {
  const result = "result" in patch ? patch.result : stored?.result;
  if (result !== "let") return null;
  const stroke = "stroke" in patch ? patch.stroke : stored?.stroke;
  if (stroke === undefined) return null;
  return isServeStroke(stroke) ? null : "Only a serve can be a let.";
}

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
  "spin",
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

/** A shot's editable values, keyed by column — the same keys as its seed. */
export type LabelShotValues = LabelShotSeedValues;

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

/**
 * Every key `updateLabelPoint` accepts: the values, plus the free-text note.
 * Not `game_type`: that is set for a whole game at once by its own operation,
 * never through a point edit — a patch naming it is rejected whole.
 */
export const LABEL_POINT_EDIT_FIELDS = [
  ...LABEL_POINT_VALUE_FIELDS,
  "note",
] as const;

export interface LabelPointValues {
  winner: LabelSide | null;
  ending: LabelEnding | null;
  ended_by: LabelSide | null;
  serve_side: LabelServeSide | null;
}

export type LabelPointPatch = Partial<LabelPointValues> & {
  note?: string | null;
};

/**
 * Every field a point's status is measured on — the patchable values plus
 * set, game and server, which only a move changes — keyed by column, the
 * same keys as `label_points.seed`.
 *
 * `game_type` is deliberately absent: marking a game a tiebreak is a
 * game-level annotation, not a correction of the seed, so it never makes a
 * point `edited`, is dropped from a stored seed that carries it
 * (`parseLabelPointSeed`), and is left alone by Reset.
 */
export const LABEL_POINT_SEED_FIELDS = [
  "set_number",
  "game_number",
  "server",
  "serve_side",
  "winner",
  "ending",
  "ended_by",
] as const;
export type LabelPointFields = LabelPointSeedValues;

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
    if (v === undefined) {
      return { error: "Result must be in, out, net or let." };
    }
    patch.result = v;
  }
  if ("spin" in input) {
    const v = vocab(input.spin, LABEL_SPINS);
    if (v === undefined) {
      return { error: "Spin must be topspin, flat, backspin or sidespin." };
    }
    patch.spin = v;
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

  const letError = letResultError(patch);
  if (letError) return { error: letError };

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

/** Whether every value field of `values` is its seed's, within tolerance. */
export function shotMatchesSeed(
  values: LabelShotValues,
  seed: LabelShotSeedValues,
): boolean {
  return LABEL_SHOT_VALUE_FIELDS.every((field) =>
    sameShotValue(field, values[field], seed[field]),
  );
}

/** Whether every field of `values` is its seed's. */
export function pointMatchesSeed(
  values: LabelPointFields,
  seed: LabelPointSeedValues,
): boolean {
  return LABEL_POINT_SEED_FIELDS.every(
    (field) => values[field] === seed[field],
  );
}

/** A shot as the status rule reads it: its values, status and seed. */
export type LabelShotState = LabelShotValues & {
  status: LabelShotStatus;
  seed: LabelShotSeedValues | null;
};

/** A point as the status rule reads it: its fields, status and seed. */
export type LabelPointState = LabelPointFields & {
  status: LabelPointStatus;
  seed: LabelPointSeedValues | null;
};

/**
 * The status a shot takes after `patch` is applied to `current`.
 *
 * - `added` stays added; `deleted` is left alone (edit-session.ts refuses to
 *   edit one).
 * - `kept` / `edited` with a seed: `kept` when every value field equals its
 *   seed within its tolerance after the patch, else `edited`. So an edit set
 *   back returns the shot to `kept`.
 * - `kept` / `edited` without a seed: `kept` becomes `edited` when a patched
 *   value differs from the stored one; `edited` stays `edited`.
 *
 * The baseline is the value the seed wrote (seed.ts `buildLabelSeed`), frozen
 * in the row's `seed` jsonb, never re-derived from `vendor`: hitter, result and
 * a serve's first or second cannot be derived from one stroke, and the rest
 * only with today's derivation code rather than the session's pinned
 * `derivation_version`.
 *
 * `unclear` never moves the status. The server's write (edit-session.ts) and
 * the console's optimistic apply ({@link applyLabelShotPatch}) both call this.
 */
export function labelShotStatusAfterPatch(
  current: LabelShotState,
  patch: LabelShotPatch,
): LabelShotStatus {
  if (current.status === "added" || current.status === "deleted") {
    return current.status;
  }
  if (current.seed === null) {
    if (current.status !== "kept") return current.status;
    for (const field of LABEL_SHOT_VALUE_FIELDS) {
      if (!(field in patch)) continue;
      const next = patch[field] as LabelShotValues[typeof field];
      if (!sameShotValue(field, current[field], next)) return "edited";
    }
    return "kept";
  }
  const after: LabelShotValues = {
    ...pickShotValues(current),
    ...(Object.fromEntries(
      LABEL_SHOT_VALUE_FIELDS.filter((field) => field in patch).map((field) => [
        field,
        patch[field] ?? null,
      ]),
    ) as Partial<LabelShotValues>),
  };
  return shotMatchesSeed(after, current.seed) ? "kept" : "edited";
}

/**
 * The status a point takes when `change` is applied to `current`: a patch's
 * values, or a move's set, game and server.
 *
 * The shot rule, for points: `added` and `deleted` are left as they are; with a
 * seed, `unchanged` when every field equals its seed after the change, else
 * `edited`; without one, `unchanged` becomes `edited` on a changed value and
 * `edited` stays `edited`.
 */
export function labelPointStatusAfterChange(
  current: LabelPointState,
  change: Partial<LabelPointFields>,
): LabelPointStatus {
  if (current.status === "added" || current.status === "deleted") {
    return current.status;
  }
  if (current.seed === null) {
    if (current.status !== "unchanged") return current.status;
    for (const field of LABEL_POINT_SEED_FIELDS) {
      if (!(field in change)) continue;
      if (current[field] !== (change[field] ?? null)) return "edited";
    }
    return "unchanged";
  }
  const after: LabelPointFields = {
    ...pickPointFields(current),
    ...(Object.fromEntries(
      LABEL_POINT_SEED_FIELDS.filter((field) => field in change).map(
        (field) => [field, change[field] ?? null],
      ),
    ) as Partial<LabelPointFields>),
  };
  return pointMatchesSeed(after, current.seed) ? "unchanged" : "edited";
}

/**
 * The status a point takes after a patch — {@link labelPointStatusAfterChange}
 * over its value fields. The note never moves it: it annotates the point, it
 * is not a label.
 */
export function labelPointStatusAfterPatch(
  current: LabelPointState,
  patch: LabelPointPatch,
): LabelPointStatus {
  const change = Object.fromEntries(
    LABEL_POINT_VALUE_FIELDS.filter((field) => field in patch).map((field) => [
      field,
      patch[field] ?? null,
    ]),
  ) as Partial<LabelPointFields>;
  return labelPointStatusAfterChange(current, change);
}

function pickShotValues(row: LabelShotValues): LabelShotValues {
  return {
    hitter: row.hitter,
    stroke: row.stroke,
    result: row.result,
    spin: row.spin,
    contact_x: row.contact_x,
    contact_y: row.contact_y,
    landing_x: row.landing_x,
    landing_y: row.landing_y,
    video_time: row.video_time,
  };
}

function pickPointFields(row: LabelPointFields): LabelPointFields {
  return {
    set_number: row.set_number,
    game_number: row.game_number,
    server: row.server,
    serve_side: row.serve_side,
    winner: row.winner,
    ending: row.ending,
    ended_by: row.ended_by,
  };
}

// ── The stored seed ─────────────────────────────────────────────────────────

/**
 * The seed keys every stored shot seed has carried since the column existed.
 * `spin` is the exception: it joined later (..._label_shots_spin.sql), and a
 * seed written before then simply has no key for it.
 */
const LABEL_SHOT_SEED_REQUIRED_FIELDS = LABEL_SHOT_VALUE_FIELDS.filter(
  (field) => field !== "spin",
);

/**
 * A `label_shots.seed` jsonb as the status rule can trust it, or null.
 *
 * Every key but `spin` must be present with a value the column would accept;
 * a seed missing one, or holding anything else, is treated as no seed at all —
 * a half-trusted baseline would read a real edit as a revert. A seed with no
 * `spin` key parses with `spin: null`: the vendor spin on such a row was never
 * part of its baseline, and refusing the whole seed would strip Reset from
 * every row seeded before the column existed.
 */
export function parseLabelShotSeed(value: unknown): LabelShotSeedValues | null {
  if (!isPlainObject(value)) return null;
  if (!LABEL_SHOT_SEED_REQUIRED_FIELDS.every((field) => field in value)) {
    return null;
  }
  const hitter = vocab(value.hitter, LABEL_SIDES);
  const stroke = vocab(value.stroke, LABEL_STROKES);
  const result = vocab(value.result, LABEL_SHOT_RESULTS);
  const spin = "spin" in value ? vocab(value.spin, LABEL_SPINS) : null;
  const contactX = finite(value.contact_x);
  const contactY = finite(value.contact_y);
  const landingX = finite(value.landing_x);
  const landingY = finite(value.landing_y);
  const videoTime = finite(value.video_time);
  if (
    hitter === undefined ||
    stroke === undefined ||
    result === undefined ||
    spin === undefined ||
    contactX === undefined ||
    contactY === undefined ||
    landingX === undefined ||
    landingY === undefined ||
    videoTime === undefined
  ) {
    return null;
  }
  return {
    hitter,
    stroke,
    result,
    spin,
    contact_x: contactX,
    contact_y: contactY,
    landing_x: landingX,
    landing_y: landingY,
    video_time: videoTime,
  };
}

/**
 * A `label_points.seed` jsonb, or null — see {@link parseLabelShotSeed}.
 * Only {@link LABEL_POINT_SEED_FIELDS} come through: a seed that also carries
 * `game_type` (or anything else) has it dropped, not rejected.
 */
export function parseLabelPointSeed(
  value: unknown,
): LabelPointSeedValues | null {
  if (!isPlainObject(value)) return null;
  if (!LABEL_POINT_SEED_FIELDS.every((field) => field in value)) return null;
  const setNumber = whole(value.set_number);
  const gameNumber = whole(value.game_number);
  const server = vocab(value.server, LABEL_SIDES);
  const serveSide = vocab(value.serve_side, LABEL_SERVE_SIDES);
  const winner = vocab(value.winner, LABEL_SIDES);
  const ending = vocab(value.ending, LABEL_ENDINGS);
  const endedBy = vocab(value.ended_by, LABEL_SIDES);
  if (
    setNumber === undefined ||
    gameNumber === undefined ||
    server === undefined ||
    serveSide === undefined ||
    winner === undefined ||
    ending === undefined ||
    endedBy === undefined
  ) {
    return null;
  }
  return {
    set_number: setNumber,
    game_number: gameNumber,
    server,
    serve_side: serveSide,
    winner,
    ending,
    ended_by: endedBy,
  };
}

/** `null`, or an integer. `undefined` = invalid. */
function whole(value: unknown): number | null | undefined {
  if (value === null) return null;
  return typeof value === "number" && Number.isInteger(value)
    ? value
    : undefined;
}

// ── The console's camelCase rows ────────────────────────────────────────────

/** A console shot's value fields, keyed by column. */
export function labelShotValues(shot: LabelShot): LabelShotValues {
  return {
    hitter: shot.hitter,
    stroke: shot.stroke,
    result: shot.result,
    spin: shot.spin,
    contact_x: shot.contactX,
    contact_y: shot.contactY,
    landing_x: shot.landingX,
    landing_y: shot.landingY,
    video_time: shot.videoTime,
  };
}

/** A console point's fields the status is measured on, keyed by column. */
export function labelPointFields(
  point: Pick<
    LabelPoint,
    | "setNumber"
    | "gameNumber"
    | "server"
    | "serveSide"
    | "winner"
    | "ending"
    | "endedBy"
  >,
): LabelPointFields {
  return {
    set_number: point.setNumber,
    game_number: point.gameNumber,
    server: point.server,
    serve_side: point.serveSide,
    winner: point.winner,
    ending: point.ending,
    ended_by: point.endedBy,
  };
}

export function labelShotState(shot: LabelShot): LabelShotState {
  return { ...labelShotValues(shot), status: shot.status, seed: shot.seed };
}

export function labelPointState(point: LabelPoint): LabelPointState {
  return { ...labelPointFields(point), status: point.status, seed: point.seed };
}

/** `shot` with `patch`'s values (and the status they imply) applied. */
export function applyLabelShotPatch(
  shot: LabelShot,
  patch: LabelShotPatch,
): LabelShot {
  const next: LabelShot = {
    ...shot,
    status: labelShotStatusAfterPatch(labelShotState(shot), patch),
  };
  if ("hitter" in patch) next.hitter = patch.hitter ?? null;
  if ("stroke" in patch) next.stroke = patch.stroke ?? null;
  if ("result" in patch) next.result = patch.result ?? null;
  if ("spin" in patch) next.spin = patch.spin ?? null;
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
    status: labelPointStatusAfterPatch(labelPointState(point), patch),
  };
  if ("winner" in patch) next.winner = patch.winner ?? null;
  if ("ending" in patch) next.ending = patch.ending ?? null;
  if ("ended_by" in patch) next.endedBy = patch.ended_by ?? null;
  if ("serve_side" in patch) next.serveSide = patch.serve_side ?? null;
  return next;
}
