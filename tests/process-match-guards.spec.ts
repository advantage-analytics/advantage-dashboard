import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import ts from "typescript";
import {
  ANON_KEY,
  MATCH,
  OWNER,
  SERVICE_ROLE_KEY,
  STRANGER,
  USER_TOKENS,
} from "./fixtures/edge-function-guard-identities";

/**
 * process-match writes under a service-role client, and `verify_jwt` is
 * satisfied by the public anon key — so the function has to decide for itself
 * who is calling, which files it may read and whether the match was already
 * processed. The edge function runs in a vm with a stubbed client, and every
 * guard is observed from what that client is asked to do, in order.
 *
 * Past the guards, the write path is ONE rpc — `import_match_rows` — that
 * lands points, shots and match_stats in a single transaction. With a real
 * workbook handed to the stubbed bucket the same harness observes that call:
 * its arguments, the ids the function assigned, and how its errors map.
 *
 * Before any of that, every call asks `admin_claim_match_file` whether the
 * match is an admin-console attempt. The harness answers that rpc from the
 * `claim` option (null: an ordinary match), `import_match_rows` from
 * `rpcError` and `admin_finish_match_file` from `finishError`, and records
 * every rpc's name and arguments so a claimed run's file, digest and
 * settlement can be asserted.
 */
const OWN_FILE = `${OWNER}/swing-vision/${MATCH}/match.xlsx`;

/** A console attempt's identifiers, as `admin_file_attempts` carries them. */
const OPERATION = "44444444-4444-4444-8444-444444444444";
const ITEM = "55555555-5555-4555-8555-555555555555";
const CLAIM_TOKEN = "66666666-6666-4666-8666-666666666666";
const consoleFile = (sha256: string) =>
  `_admin-console/${OPERATION}/${ITEM}/${sha256}.xlsx`;
const REVIEW_REQUIRED = "processing-failed-review-required";

// Transpiled once — the source never changes between tests, only the vm
// context each `invoke()` call runs it in.
const SOURCE = ts.transpileModule(
  readFileSync("supabase/functions/process-match/index.ts", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;

/**
 * The columns `import_match_rows` names in its jsonb_to_recordset lists
 * (supabase/migrations/*_import_match_rows.sql). jsonb_to_recordset matches
 * JSON keys to those names and silently nulls a column with no key — and
 * drops a key with no column — so the keys the function sends must be
 * exactly these sets.
 */
const POINT_COLUMNS = [
  "id",
  "match_id",
  "point_number",
  "set_number",
  "game_number",
  "set_score",
  "game_score",
  "point_score",
  "server_is_player1",
  "won_by_player1",
  "rally_length",
  "result_type",
  "is_break_point",
  "is_set_point",
  "is_match_point",
  "video_time",
  "duration",
].sort();
const SHOT_COLUMNS = [
  "point_id",
  "shot_number",
  "is_player1",
  "shot_type",
  "spin_type",
  "speed_mph",
  "contact_x",
  "contact_y",
  "landing_x",
  "landing_y",
  "result",
  "video_time",
  "zone",
].sort();

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const HOST = "Riley Host";
const GUEST = "Casey Guest";

/**
 * A two-point SwingVision export with the three sheets the write path reads:
 * Settings (the "Host Team" cell keys `is_player1`), Points and Shots. Point 1
 * is an ace; point 2 is a three-shot rally the guest wins.
 *
 * Deterministic and read-only once built (only ever fed to a stubbed
 * `download()`), so every caller shares the one buffer instead of paying for
 * the workbook build and xlsx serialization again per test.
 */
let cachedWorkbook: Promise<Buffer<ArrayBuffer>> | undefined;
function exportWorkbook(): Promise<Buffer<ArrayBuffer>> {
  return (cachedWorkbook ??= buildWorkbook());
}

type ShotRow = readonly (string | number | null)[];

// prettier-ignore
const EXPORT_SHOTS: readonly ShotRow[] = [
  [1, 1, 1, 1, HOST, "Serve", "first_serve", "Flat", 98.2, 0.3, 0.1, 3.1, 17.9, "In", 12.5],
  [1, 1, 2, 1, HOST, "Serve", "first_serve", "Slice", 92, -0.4, 0.2, -1, 18.2, "In", 20],
  [1, 1, 2, 2, GUEST, "Forehand", null, "Topspin", 65, -1.2, 22, 2, 5, "In", 21],
  [1, 1, 2, 3, HOST, "Forehand", null, "Topspin", 70, 2.1, 1.5, -3, 20, "Out", 22.4],
];

async function buildWorkbook(
  shotRows: readonly ShotRow[] = EXPORT_SHOTS,
): Promise<Buffer<ArrayBuffer>> {
  const workbook = new ExcelJS.Workbook();

  const settings = workbook.addWorksheet("Settings");
  settings.addRow([
    "Start Time",
    "End Time",
    "Host Team",
    "Guest Team",
    "Ad Scoring",
  ]);
  settings.addRow([
    "2026-09-10T10:00:00",
    "2026-09-10T11:30:00",
    HOST,
    GUEST,
    false,
  ]);

  const points = workbook.addWorksheet("Points");
  points.addRow([
    "Set",
    "Game",
    "Point",
    "Match Server",
    "Point Winner",
    "Host Game Score",
    "Guest Game Score",
    "Detail",
    "Break Point",
    "Video Time",
    "Duration",
  ]);
  points.addRow([1, 1, 1, "host", "host", "0", "0", "Ace", "false", 12.5, 3.1]);
  points.addRow([
    1,
    1,
    2,
    "host",
    "guest",
    "15",
    "0",
    "Forehand Unforced Error",
    "false",
    20,
    6.4,
  ]);

  const shots = workbook.addWorksheet("Shots");
  shots.addRow([
    "Set",
    "Game",
    "Point",
    "Shot",
    "Player",
    "Stroke",
    "Type",
    "Spin",
    "Speed (MPH)",
    "Hit (x)",
    "Hit (y)",
    "Bounce (x)",
    "Bounce (y)",
    "Result",
    "Video Time",
  ]);
  for (const row of shotRows) shots.addRow([...row]);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

type RpcCall = { name: string; args: Record<string, unknown> };
type RpcError = { code: string; message: string };
/**
 * What the live `admin_claim_match_file` answers for a console match: the
 * attempt's state when it is not `queued`, or — `to_jsonb(row)` plus
 * `claimed`/`actorId` — the row this run now owns.
 */
type Claim =
  | { claimed: false; state: string; operationId: string; itemId: string }
  | {
      claimed: true;
      claim_token: string;
      /** Null once the submitting admin's account is gone. */
      actorId: string | null;
      request: { storagePath: string; sha256: string };
    };

async function invoke({
  bearer,
  body,
  existingPoints = [],
  createdBy = OWNER,
  workbook,
  claim = null,
  claimError = null,
  rpcError = null,
  finishError = null,
  matchError = null,
  pointsError = null,
}: {
  bearer?: string;
  body: Record<string, unknown>;
  existingPoints?: { id: string }[];
  createdBy?: string | null;
  /** The .xlsx every download answers with; without it the bucket is empty. */
  workbook?: Buffer<ArrayBuffer>;
  /** What `admin_claim_match_file` answers; null is "not a console match". */
  claim?: Claim | null;
  /** An error from `admin_claim_match_file` instead of an answer. */
  claimError?: RpcError | null;
  /** What `import_match_rows` answers; null is success. */
  rpcError?: RpcError | null;
  /** What `admin_finish_match_file` answers; null is success. */
  finishError?: RpcError | null;
  /** An error from the `matches` read instead of the row. */
  matchError?: RpcError | null;
  /** An error from the existing-`points` read instead of its rows. */
  pointsError?: RpcError | null;
}) {
  let handler!: (request: Request) => Promise<Response>;
  const events: string[] = [];
  const rpcCalls: RpcCall[] = [];

  const from = (table: string) => {
    const resolve = () => {
      if (table === "matches") {
        if (matchError) return { data: null, error: matchError };
        return {
          data: {
            source_provider: "swing-vision",
            format: { best_of: 3 },
            created_by: createdBy,
          },
          error: null,
        };
      }
      if (table === "points") {
        return pointsError
          ? { data: null, error: pointsError }
          : { data: existingPoints, error: null };
      }
      return { data: [], error: null };
    };
    const query: Record<string, unknown> = {};
    Object.assign(query, {
      select: () => {
        events.push(`read:${table}`);
        return query;
      },
      eq: () => query,
      limit: () => query,
      insert: () => {
        events.push(`insert:${table}`);
        return query;
      },
      single: async () => resolve(),
      then: (onFulfilled: (value: unknown) => unknown) =>
        Promise.resolve(resolve()).then(onFulfilled),
    });
    return query;
  };

  const createClient = (_url: string, key: string) => ({
    auth: {
      getUser: async (token: string) => {
        events.push(`getUser:${key === ANON_KEY ? "anon" : "service"}`);
        const id = USER_TOKENS[token];
        return id
          ? { data: { user: { id } }, error: null }
          : { data: { user: null }, error: { message: "invalid JWT" } };
      },
    },
    from,
    storage: {
      from: (bucket: string) => ({
        download: async (path: string) => {
          events.push(`download:${bucket}/${path}`);
          return workbook
            ? { data: new Blob([workbook]), error: null }
            : { data: null, error: { message: "no such object" } };
        },
      }),
    },
    functions: {
      invoke: async (name: string) => {
        events.push(`invoke:${name}`);
        return { data: null, error: null };
      },
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      events.push(`rpc:${name}`);
      rpcCalls.push({ name, args });
      if (name === "admin_claim_match_file") {
        return { data: claimError ? null : claim, error: claimError };
      }
      if (name === "admin_finish_match_file") {
        return { data: null, error: finishError };
      }
      return { data: null, error: rpcError };
    },
  });

  const env: Record<string, string> = {
    SUPABASE_URL: "https://stub.supabase.co",
    SUPABASE_ANON_KEY: ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
  };
  runInNewContext(SOURCE, {
    exports: {},
    // The function's `await import("npm:exceljs@4.4.0")` transpiles to a
    // require(); hand it the exceljs the workbook above was built with.
    require: (id: string) =>
      id.includes("supabase-js")
        ? { createClient }
        : id.includes("exceljs")
          ? ExcelJS
          : {},
    Deno: {
      serve: (callback: typeof handler) => {
        handler = callback;
      },
      env: { get: (key: string) => env[key] },
    },
    Request,
    Response,
    // Deno's global, which the function assigns each point's id with.
    crypto,
    console: { ...console, log: () => {}, error: () => {} },
  });

  const response = await handler(
    new Request("https://example.test", {
      method: "POST",
      headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
      body: JSON.stringify(body),
    }),
  );
  const json = (await response.json()) as {
    success: boolean;
    error?: string;
    [key: string]: unknown;
  };
  const argsOf = (name: string) =>
    rpcCalls.filter((call) => call.name === name).map((call) => call.args);
  return { status: response.status, json, events, rpcCalls, argsOf };
}

test("no bearer is answered 401 before anything is read", async () => {
  const { status, json, events } = await invoke({
    body: { matchId: MATCH, fileNames: [OWN_FILE] },
  });
  expect(status).toBe(401);
  expect(json).toEqual({ success: false, error: expect.any(String) });
  expect(events).toEqual([]);
});

test("a garbage bearer is answered 401 after getUser rejects it", async () => {
  const { status, events } = await invoke({
    bearer: "not-a-user",
    body: { matchId: MATCH, fileNames: [OWN_FILE] },
  });
  expect(status).toBe(401);
  expect(events).toEqual(["getUser:anon"]);
});

test("a signed-in user who is not the uploader is answered 403", async () => {
  // The body still names the owner: it must be ignored in favour of the token.
  const { status, json, events } = await invoke({
    bearer: "stranger-token",
    body: { matchId: MATCH, userId: OWNER, fileNames: [OWN_FILE] },
  });
  expect(status).toBe(403);
  expect(json.success).toBe(false);
  expect(events).toEqual([
    "getUser:anon",
    "rpc:admin_claim_match_file",
    "read:matches",
  ]);
});

test("a file outside the caller's folder is answered 400 with no download", async () => {
  for (const fileNames of [
    [`${STRANGER}/swing-vision/${MATCH}/match.xlsx`],
    [OWN_FILE, `${OWNER}/../${STRANGER}/swing-vision/${MATCH}/match.xlsx`],
    [`/${OWNER}/match.xlsx`],
  ]) {
    const { status, json, events } = await invoke({
      bearer: "owner-token",
      body: { matchId: MATCH, fileNames },
    });
    expect(status, fileNames.join()).toBe(400);
    expect(json.success).toBe(false);
    expect(events).toEqual([
      "getUser:anon",
      "rpc:admin_claim_match_file",
      "read:matches",
    ]);
  }
});

test("a match that already has points is answered 409 and nothing runs", async () => {
  const { status, json, events } = await invoke({
    bearer: "owner-token",
    body: { matchId: MATCH, fileNames: [OWN_FILE] },
    existingPoints: [{ id: "existing-point" }],
  });
  expect(status).toBe(409);
  expect(json).toEqual({
    success: false,
    error: "This match has already been processed",
  });
  expect(events).toEqual([
    "getUser:anon",
    "rpc:admin_claim_match_file",
    "read:matches",
    "read:points",
  ]);
});

test("the service role with in-folder paths clears every guard", async () => {
  // bucketId is no longer honoured: the download must hit match-data.
  const { status, json, events } = await invoke({
    bearer: SERVICE_ROLE_KEY,
    body: {
      matchId: MATCH,
      bucketId: "other-bucket",
      fileNames: [OWN_FILE, "legacy.xlsx"],
    },
  });
  expect(events).toEqual([
    "rpc:admin_claim_match_file",
    "read:matches",
    "read:points",
    `download:match-data/${OWN_FILE}`,
    `download:match-data/${OWNER}/legacy.xlsx`,
  ]);
  // The stub bucket is empty, so processing itself fails — after the guards.
  expect(status).toBe(500);
  expect(json.error).toContain("No Points sheet data");
});

test("the uploader's own token clears every guard", async () => {
  const { events, argsOf } = await invoke({
    bearer: "owner-token",
    body: { matchId: MATCH, fileNames: [OWN_FILE] },
  });
  expect(events).toEqual([
    "getUser:anon",
    "rpc:admin_claim_match_file",
    "read:matches",
    "read:points",
    `download:match-data/${OWN_FILE}`,
  ]);
  // The claim carries the verified user, never the body's.
  expect(argsOf("admin_claim_match_file")).toEqual([
    { p_match_id: MATCH, p_actor_id: OWNER, p_service: false },
  ]);
});

test("the service role cannot process a match with no uploader", async () => {
  const { status, events } = await invoke({
    bearer: SERVICE_ROLE_KEY,
    body: { matchId: MATCH, fileNames: [OWN_FILE] },
    createdBy: null,
  });
  expect(status).toBe(403);
  expect(events).toEqual(["rpc:admin_claim_match_file", "read:matches"]);
});

test("a real export lands points, shots and stats through one RPC, then the invokes", async () => {
  const { status, json, events, argsOf } = await invoke({
    bearer: SERVICE_ROLE_KEY,
    body: { matchId: MATCH, fileNames: [OWN_FILE] },
    workbook: await exportWorkbook(),
  });
  expect(status).toBe(200);
  expect(json).toEqual({ success: true });
  expect(events).toEqual([
    "rpc:admin_claim_match_file",
    "read:matches",
    "read:points",
    `download:match-data/${OWN_FILE}`,
    "rpc:import_match_rows",
    "invoke:generate-key-moments",
    "invoke:generate-insights",
  ]);
  // No table insert and no separate stats rpc: the function itself writes
  // nothing — the one rpc past the (read-only-for-this-match) claim is the
  // whole write path.
  expect(
    events.filter((e) => e.startsWith("insert:") || e.startsWith("rpc:")),
  ).toEqual(["rpc:admin_claim_match_file", "rpc:import_match_rows"]);
  expect(argsOf("admin_claim_match_file")).toEqual([
    { p_match_id: MATCH, p_actor_id: null, p_service: true },
  ]);

  const [args] = argsOf("import_match_rows");
  expect(args.p_match_id).toBe(MATCH);
  const points = args.p_points as Record<string, unknown>[];
  const shots = args.p_shots as Record<string, unknown>[];
  expect(points).toHaveLength(2);
  expect(shots).toHaveLength(4);

  // Every point carries the id the function assigned, unique across the
  // batch, and exactly the columns the RPC's insert names.
  const ids = new Set<string>();
  for (const point of points) {
    expect(point.id).toMatch(UUID_V4);
    expect(point.match_id).toBe(MATCH);
    expect(Object.keys(point).sort()).toEqual(POINT_COLUMNS);
    ids.add(point.id as string);
  }
  expect(ids.size).toBe(points.length);
  expect(points.map((p) => p.rally_length)).toEqual([1, 3]);

  // Every shot references one of those ids — the ace's serve to point 1, the
  // rally's three shots to point 2 — and `is_player1` still keys on the
  // Settings "Host Team" cell.
  const idOf = new Map(points.map((p) => [p.point_number, p.id]));
  for (const shot of shots) {
    expect(ids.has(shot.point_id as string)).toBe(true);
    expect(Object.keys(shot).sort()).toEqual(SHOT_COLUMNS);
  }
  expect(shots.map((s) => s.point_id)).toEqual([
    idOf.get(1),
    idOf.get(2),
    idOf.get(2),
    idOf.get(2),
  ]);
  expect(shots.map((s) => s.is_player1)).toEqual([true, true, false, true]);
});

test("each shot's zone is placed from its own hitter's contact, never the opponent's", async () => {
  // One fixed court frame: the host serves from the near deuce (+x), the
  // guest receives on the far deuce (-x). Every rally shot below would read
  // the other way from the PREVIOUS hitter's contact, which the zone once used.
  // prettier-ignore
  const rows: ShotRow[] = [
    [1, 1, 1, 1, HOST, "Serve", "first_serve", "Flat", 110, 0.5, -0.3, 3.1, 17.9, "In", 12.5],
    // SwingVision numbers some non-serves 1 too: a stroke, so a direction.
    [1, 1, 1, 1, GUEST, "Forehand", null, "Flat", 30, -2.5, 24, 2.2, 6, "In", 13],
    [1, 1, 2, 1, HOST, "Serve", "first_serve", "Slice", 92, 0.5, -0.3, -2, 18.2, "In", 20],
    [1, 1, 2, 2, GUEST, "Forehand", null, "Topspin", 65, -2.2, 24.5, 3, 4, "In", 21],
    [1, 1, 2, 3, HOST, "Backhand", null, "Slice", 60, 3.1, 0.4, 2.5, 20, "In", 22],
    [1, 1, 2, 4, GUEST, "Forehand", null, "Topspin", 66, 2.4, 23, 0.6, 5, "In", 23],
    [1, 1, 2, 5, HOST, "Forehand", null, "Topspin", 70, null, null, -3, 19, "In", 24],
    [1, 1, 2, 6, GUEST, "Backhand", null, "Flat", 64, 0, 24, 3, 6, "Out", 25],
  ];
  const { status, argsOf } = await invoke({
    bearer: SERVICE_ROLE_KEY,
    body: { matchId: MATCH, fileNames: [OWN_FILE] },
    workbook: await buildWorkbook(rows),
  });
  expect(status).toBe(200);
  const [args] = argsOf("import_match_rows");
  const shots = args.p_shots as Record<string, unknown>[];
  expect(shots.map((s) => [s.shot_number, s.zone])).toEqual([
    [1, "Wide"], // |3.1| >= 2.74
    [1, "Crosscourt"], // a groundstroke at shot 1 is not a serve
    [1, "Body"], // 1.37 <= |-2| < 2.74
    [2, "Crosscourt"], // struck at -2.2, lands at +3: crosses the line
    [3, "Down the Line"], // struck at +3.1, lands at +2.5: stays on its side
    [4, "Middle"], // within 1.0 m of the centre line, whatever the direction
    [5, null], // no contact: unmeasured, never a guess
    [6, null], // struck on the centre line itself
  ]);
});

test("a point keeps only its deciding rally, and a played-on first serve lands as the fault", async () => {
  // SwingVision files every ball struck since the previous point under the
  // next one, each rally numbered from shot 1 — and now and then the next
  // point's feed after the rally, numbered on from it. Point 1: a let, the
  // ace, then a feed and the ball hit back off it. Point 2: the guest's feed,
  // a first serve the tracker called in that the players called out and
  // played on (Type none), then the second-serve rally the Points row
  // scores. Listed out of strike order on purpose.
  // prettier-ignore
  const rows: ShotRow[] = [
    [1, 1, 1, 1, HOST, "Serve", "first_serve", "Flat", 110, 0.5, -0.3, 3.1, 17.9, "In", 12.5],
    [1, 1, 1, 2, GUEST, "Feed", "none", "Flat", 25, -2, 24, 1, 2, "In", 13.5],
    [1, 1, 1, 2, HOST, "Backhand", "none", "Flat", 30, 1, 1, -1, 20, "Net", 14.2],
    [1, 1, 1, 1, HOST, "Serve", "first_serve", "Flat", 108, 0.5, -0.3, 1, 12, "Net", 10],
    [1, 1, 2, 0, GUEST, "Feed", "none", "Flat", 30, -2.5, 24, 2.2, 6, "In", 14],
    [1, 1, 2, 1, HOST, "Serve", "first_serve", "Flat", 101, 0.5, -0.3, -2, 18.2, "In", 16],
    [1, 1, 2, 1, GUEST, "Forehand", "none", "Topspin", 50, -2.2, 24.5, 3, 4, "In", 17],
    [1, 1, 2, 2, HOST, "Volley", "none", "Flat", 40, 1, 8, -1.5, 20, "In", 18],
    [1, 1, 2, 1, HOST, "Serve", "second_serve", "Kick", 80, 0.5, -0.3, -1, 18.2, "In", 20],
    [1, 1, 2, 2, GUEST, "Forehand", "second_return", "Topspin", 65, -1.2, 22, 2, 5, "In", 21],
    [1, 1, 2, 3, HOST, "Forehand", "serve_plus_one", "Topspin", 70, 2.1, 1.5, -3, 20, "Out", 22.4],
  ];
  const { status, argsOf } = await invoke({
    bearer: SERVICE_ROLE_KEY,
    body: { matchId: MATCH, fileNames: [OWN_FILE] },
    workbook: await buildWorkbook(rows),
  });
  expect(status).toBe(200);
  const [args] = argsOf("import_match_rows");
  const points = args.p_points as Record<string, unknown>[];
  const shots = args.p_shots as Record<string, unknown>[];
  const numberOf = new Map(points.map((p) => [p.id, p.point_number]));
  expect(
    shots.map((s) => [
      numberOf.get(s.point_id),
      s.shot_number,
      s.shot_type,
      s.result,
      s.video_time,
    ]),
  ).toEqual([
    [1, 1, "First Serve", "In", 12.5], // the let before it, the feed after, gone
    [2, 1, "First Serve", "Out", 16], // the fault, called out by the players
    [2, 1, "Second Serve", "In", 20],
    [2, 2, "Forehand", "In", 21],
    [2, 3, "Forehand", "Out", 22.4],
  ]);
  // Rally length is the deciding rally's, not the played-on one's.
  expect(points.map((p) => p.rally_length)).toEqual([1, 3]);
});

test("the RPC's unique_violation is answered 409 with the pre-check's body and nothing is invoked", async () => {
  const { status, json, events } = await invoke({
    bearer: SERVICE_ROLE_KEY,
    body: { matchId: MATCH, fileNames: [OWN_FILE] },
    workbook: await exportWorkbook(),
    rpcError: { code: "23505", message: "match already has points" },
  });
  expect(status).toBe(409);
  expect(json).toEqual({
    success: false,
    error: "This match has already been processed",
  });
  expect(events).toEqual([
    "rpc:admin_claim_match_file",
    "read:matches",
    "read:points",
    `download:match-data/${OWN_FILE}`,
    "rpc:import_match_rows",
  ]);
});

test("any other RPC error is a 500 and nothing is invoked", async () => {
  const { status, json, events } = await invoke({
    bearer: SERVICE_ROLE_KEY,
    body: { matchId: MATCH, fileNames: [OWN_FILE] },
    workbook: await exportWorkbook(),
    rpcError: {
      code: "57014",
      message: "canceling statement due to statement timeout",
    },
  });
  expect(status).toBe(500);
  expect(json).toEqual({
    success: false,
    error: "canceling statement due to statement timeout",
  });
  expect(events).toEqual([
    "rpc:admin_claim_match_file",
    "read:matches",
    "read:points",
    `download:match-data/${OWN_FILE}`,
    "rpc:import_match_rows",
  ]);
});

// ---------------------------------------------------------------------------
// The admin console's claim flow
// ---------------------------------------------------------------------------

/** A taken claim over the given bytes, as the console records them. */
function claimOver(
  workbook: Buffer,
  sha256?: string,
): Extract<Claim, { claimed: true }> {
  const digest = sha256 ?? createHash("sha256").update(workbook).digest("hex");
  return {
    claimed: true,
    claim_token: CLAIM_TOKEN,
    actorId: OWNER,
    request: { storagePath: consoleFile(digest), sha256: digest },
  };
}

/** What the console sends: the service-role bearer and its own field set. */
function consoleBody(storagePath: string) {
  return {
    matchId: MATCH,
    userId: OWNER,
    fileNames: [storagePath],
    sourceProvider: "swing-vision",
  };
}

/** An `admin_finish_match_file` call's args for the given settlement. */
const finishArgs = (p_error: string | null) => ({
  p_match_id: MATCH,
  p_claim_token: CLAIM_TOKEN,
  p_error,
});

/**
 * A claimed console call with the harness's usual defaults: the service-role
 * bearer, no created_by (a console attachment to an existing match may carry
 * none), and the claim's own file and bytes. Callers override only what the
 * case under test needs to vary.
 */
function invokeClaimed(
  claim: Extract<Claim, { claimed: true }>,
  workbook: Buffer<ArrayBuffer>,
  overrides: Partial<Parameters<typeof invoke>[0]> = {},
) {
  return invoke({
    bearer: SERVICE_ROLE_KEY,
    body: consoleBody(claim.request.storagePath),
    createdBy: null,
    workbook,
    claim,
    ...overrides,
  });
}

test("a claimed console attempt is read from the claim, not the body, and finished completed", async () => {
  const workbook = await exportWorkbook();
  const claim = claimOver(workbook);
  const { storagePath } = claim.request;
  // created_by is null — a console attachment to an existing match may carry
  // none — and the service role alone would be refused (see the case above);
  // the claim's actor is the identity. The body names a different, ordinary
  // file, so the download below can only have come from the claim.
  const { status, json, events, argsOf } = await invokeClaimed(
    claim,
    workbook,
    { body: { ...consoleBody(storagePath), fileNames: [OWN_FILE] } },
  );
  expect(status).toBe(200);
  expect(json).toEqual({ success: true });
  expect(events).toEqual([
    "rpc:admin_claim_match_file",
    "read:matches",
    "read:points",
    `download:match-data/${storagePath}`,
    "rpc:import_match_rows",
    "invoke:generate-key-moments",
    "invoke:generate-insights",
    "rpc:admin_finish_match_file",
  ]);
  expect(argsOf("admin_finish_match_file")).toEqual([finishArgs(null)]);
  // The rows themselves are the ordinary ones: same keys, same keying.
  const [args] = argsOf("import_match_rows");
  expect(args.p_match_id).toBe(MATCH);
  expect(args.p_points as unknown[]).toHaveLength(2);
  expect(
    (args.p_shots as Record<string, unknown>[]).map((s) => s.is_player1),
  ).toEqual([true, true, false, true]);
});

test("a console attempt that is not queued answers its state and reads nothing", async () => {
  for (const [state, status] of [
    ["processing", 200],
    ["completed", 200],
    ["failed", 409],
  ] as const) {
    const {
      status: got,
      json,
      events,
    } = await invoke({
      bearer: SERVICE_ROLE_KEY,
      body: consoleBody(consoleFile("0".repeat(64))),
      createdBy: null,
      claim: { claimed: false, state, operationId: OPERATION, itemId: ITEM },
    });
    expect(got, state).toBe(status);
    expect(json, state).toEqual({
      success: state === "completed",
      state,
      operationId: OPERATION,
      itemId: ITEM,
    });
    expect(events, state).toEqual(["rpc:admin_claim_match_file"]);
  }
});

test("a claimed file whose bytes no longer hash to the validated sha256 fails the attempt before parsing", async () => {
  const workbook = await exportWorkbook();
  const claim = claimOver(workbook, "0".repeat(64));
  const { storagePath } = claim.request;
  const expected = {
    status: 500,
    json: {
      success: false,
      error: "Validated file bytes changed; review required.",
    },
    events: [
      "rpc:admin_claim_match_file",
      "read:matches",
      "read:points",
      `download:match-data/${storagePath}`,
      "rpc:admin_finish_match_file",
    ],
    finish: [finishArgs(REVIEW_REQUIRED)],
  };
  const run = await invokeClaimed(claim, workbook);
  expect(run.status).toBe(expected.status);
  expect(run.json).toEqual(expected.json);
  expect(run.events).toEqual(expected.events);
  expect(run.argsOf("admin_finish_match_file")).toEqual(expected.finish);

  // The finish call's own error is logged, never the answer.
  const logged = await invokeClaimed(claim, workbook, {
    finishError: { code: "22023", message: "invalid-file-claim" },
  });
  expect(logged.status).toBe(expected.status);
  expect(logged.json).toEqual(expected.json);
  expect(logged.events).toEqual(expected.events);
  expect(logged.argsOf("admin_finish_match_file")).toEqual(expected.finish);
});

test("a claimed attempt on a match with points, or refused by the RPC, is a 409 that fails the attempt", async () => {
  const workbook = await exportWorkbook();
  const claim = claimOver(workbook);
  const { storagePath } = claim.request;
  const body = {
    success: false,
    error: "This match has already been processed",
  };
  const finish = [finishArgs(REVIEW_REQUIRED)];

  // The pre-check: nothing is downloaded.
  const preCheck = await invokeClaimed(claim, workbook, {
    existingPoints: [{ id: "existing-point" }],
  });
  expect(preCheck.status).toBe(409);
  expect(preCheck.json).toEqual(body);
  expect(preCheck.events).toEqual([
    "rpc:admin_claim_match_file",
    "read:matches",
    "read:points",
    "rpc:admin_finish_match_file",
  ]);
  expect(preCheck.argsOf("admin_finish_match_file")).toEqual(finish);

  // import_match_rows's unique_violation: nothing is invoked.
  const rpc = await invokeClaimed(claim, workbook, {
    rpcError: { code: "23505", message: "match already has points" },
  });
  expect(rpc.status).toBe(409);
  expect(rpc.json).toEqual(body);
  expect(rpc.events).toEqual([
    "rpc:admin_claim_match_file",
    "read:matches",
    "read:points",
    `download:match-data/${storagePath}`,
    "rpc:import_match_rows",
    "rpc:admin_finish_match_file",
  ]);
  expect(rpc.argsOf("admin_finish_match_file")).toEqual(finish);
});

test("a completed-finish error is thrown, and the attempt is then failed for review", async () => {
  const workbook = await exportWorkbook();
  const claim = claimOver(workbook);
  const { status, json, events, argsOf } = await invokeClaimed(
    claim,
    workbook,
    { finishError: { code: "57014", message: "statement timeout" } },
  );
  // The rows are committed by now; the caller learns the settlement failed,
  // and the attempt reads `failed` (with a full match behind it) rather than
  // staying `processing` with nothing to poll for.
  expect(status).toBe(500);
  expect(json).toEqual({ success: false, error: "statement timeout" });
  expect(events.slice(-3)).toEqual([
    "invoke:generate-insights",
    "rpc:admin_finish_match_file",
    "rpc:admin_finish_match_file",
  ]);
  expect(argsOf("admin_finish_match_file")).toEqual([
    finishArgs(null),
    finishArgs(REVIEW_REQUIRED),
  ]);
});

test("a user token the claim refuses is answered 403 before any table read", async () => {
  const body = { matchId: MATCH, fileNames: [OWN_FILE] };
  const { status, json, events } = await invoke({
    bearer: "owner-token",
    body,
    claimError: { code: "42501", message: "admin-required" },
  });
  expect(status).toBe(403);
  expect(json.success).toBe(false);
  expect(events).toEqual(["getUser:anon", "rpc:admin_claim_match_file"]);

  // Any other claim failure is the database's, not the caller's.
  const other = await invoke({
    bearer: "owner-token",
    body,
    claimError: { code: "PGRST202", message: "function not found" },
  });
  expect(other.status).toBe(500);
  expect(other.json).toEqual({
    success: false,
    // A fixed string: the database's message is only logged.
    error: "Failed to claim the match file",
  });
  expect(other.events).toEqual(["getUser:anon", "rpc:admin_claim_match_file"]);
});

test("the console namespace and its escaped aliases are refused for every non-claim call", async () => {
  for (const fileName of [
    "_admin-console/op/item/x.xlsx",
    "%5fadmin-console/op/item/x.xlsx",
    `${OWNER}/%2e%2e/x.xlsx`,
    "folder\\x.xlsx",
  ]) {
    const { status, json, events } = await invoke({
      bearer: "owner-token",
      body: { matchId: MATCH, fileNames: [fileName] },
    });
    expect(status, fileName).toBe(400);
    expect(json.success, fileName).toBe(false);
    expect(events, fileName).toEqual([
      "getUser:anon",
      "rpc:admin_claim_match_file",
      "read:matches",
    ]);
  }
});

test("an athlete's own file name with a literal % is not mistaken for an escape", async () => {
  // "100%." is not a valid percent-escape, so there is nothing to decode and
  // the name is judged as typed: in the owner's folder, no alias.
  const fileName = `${OWNER}/swing-vision/${MATCH}/Match 100%.xlsx`;
  const { status, json, events } = await invoke({
    bearer: "owner-token",
    body: { matchId: MATCH, fileNames: [fileName] },
    workbook: await exportWorkbook(),
  });
  expect(status).toBe(200);
  expect(json).toEqual({ success: true });
  expect(events).toContain(`download:match-data/${fileName}`);
});

test("a claimed attempt whose actor is gone still completes from the claim", async () => {
  const workbook = await exportWorkbook();
  const claim = { ...claimOver(workbook), actorId: null };
  const { storagePath } = claim.request;
  const { status, json, events, argsOf } = await invokeClaimed(claim, workbook);
  expect(status).toBe(200);
  expect(json).toEqual({ success: true });
  expect(events).toEqual([
    "rpc:admin_claim_match_file",
    "read:matches",
    "read:points",
    `download:match-data/${storagePath}`,
    "rpc:import_match_rows",
    "invoke:generate-key-moments",
    "invoke:generate-insights",
    "rpc:admin_finish_match_file",
  ]);
  expect(argsOf("admin_finish_match_file")).toEqual([finishArgs(null)]);
});

test("a claimed attempt whose match read fails is a 500 that fails the attempt", async () => {
  const workbook = await exportWorkbook();
  const { status, json, events, argsOf } = await invokeClaimed(
    claimOver(workbook),
    workbook,
    { matchError: { code: "57014", message: "statement timeout" } },
  );
  expect(status).toBe(500);
  expect(json.success).toBe(false);
  expect(events).toEqual([
    "rpc:admin_claim_match_file",
    "read:matches",
    "rpc:admin_finish_match_file",
  ]);
  expect(events.some((e) => e.startsWith("download:"))).toBe(false);
  expect(argsOf("import_match_rows")).toEqual([]);
  expect(argsOf("admin_finish_match_file")).toEqual([
    finishArgs(REVIEW_REQUIRED),
  ]);
});

test("a claimed attempt whose points read fails is a 500 that fails the attempt", async () => {
  const workbook = await exportWorkbook();
  const { status, json, events, argsOf } = await invokeClaimed(
    claimOver(workbook),
    workbook,
    { pointsError: { code: "57014", message: "statement timeout" } },
  );
  expect(status).toBe(500);
  expect(json.success).toBe(false);
  expect(events).toEqual([
    "rpc:admin_claim_match_file",
    "read:matches",
    "read:points",
    "rpc:admin_finish_match_file",
  ]);
  expect(events.some((e) => e.startsWith("download:"))).toBe(false);
  expect(argsOf("import_match_rows")).toEqual([]);
  expect(argsOf("admin_finish_match_file")).toEqual([
    finishArgs(REVIEW_REQUIRED),
  ]);
});
