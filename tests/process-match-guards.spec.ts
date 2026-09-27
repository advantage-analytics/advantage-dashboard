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
 */
const OWN_FILE = `${OWNER}/swing-vision/${MATCH}/match.xlsx`;

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
 */
async function exportWorkbook(): Promise<Buffer<ArrayBuffer>> {
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
  // prettier-ignore
  shots.addRow([1, 1, 1, 1, HOST, "Serve", "first_serve", "Flat", 98.2, 0.3, 0.1, 3.1, 17.9, "In", 12.5]);
  // prettier-ignore
  shots.addRow([1, 1, 2, 1, HOST, "Serve", "first_serve", "Slice", 92, -0.4, 0.2, -1, 18.2, "In", 20]);
  // prettier-ignore
  shots.addRow([1, 1, 2, 2, GUEST, "Forehand", null, "Topspin", 65, -1.2, 22, 2, 5, "In", 21]);
  // prettier-ignore
  shots.addRow([1, 1, 2, 3, HOST, "Forehand", null, "Topspin", 70, 2.1, 1.5, -3, 20, "Out", 22.4]);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

type RpcCall = { name: string; args: Record<string, unknown> };
type RpcError = { code: string; message: string };

async function invoke({
  bearer,
  body,
  existingPoints = [],
  createdBy = OWNER,
  workbook,
  rpcError = null,
}: {
  bearer?: string;
  body: Record<string, unknown>;
  existingPoints?: { id: string }[];
  createdBy?: string | null;
  /** The .xlsx every download answers with; without it the bucket is empty. */
  workbook?: Buffer<ArrayBuffer>;
  /** What every rpc() answers; null is success. */
  rpcError?: RpcError | null;
}) {
  let handler!: (request: Request) => Promise<Response>;
  const events: string[] = [];
  const rpcCalls: RpcCall[] = [];

  const from = (table: string) => {
    const resolve = () => {
      if (table === "matches") {
        return {
          data: {
            source_provider: "swing-vision",
            format: { best_of: 3 },
            created_by: createdBy,
          },
          error: null,
        };
      }
      if (table === "points") return { data: existingPoints, error: null };
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
  const json = (await response.json()) as { success: boolean; error?: string };
  return { status: response.status, json, events, rpcCalls };
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
  expect(events).toEqual(["getUser:anon", "read:matches"]);
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
    expect(events).toEqual(["getUser:anon", "read:matches"]);
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
  expect(events).toEqual(["getUser:anon", "read:matches", "read:points"]);
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
  const { events } = await invoke({
    bearer: "owner-token",
    body: { matchId: MATCH, fileNames: [OWN_FILE] },
  });
  expect(events).toEqual([
    "getUser:anon",
    "read:matches",
    "read:points",
    `download:match-data/${OWN_FILE}`,
  ]);
});

test("the service role cannot process a match with no uploader", async () => {
  const { status, events } = await invoke({
    bearer: SERVICE_ROLE_KEY,
    body: { matchId: MATCH, fileNames: [OWN_FILE] },
    createdBy: null,
  });
  expect(status).toBe(403);
  expect(events).toEqual(["read:matches"]);
});

test("a real export lands points, shots and stats through one RPC, then the invokes", async () => {
  const { status, json, events, rpcCalls } = await invoke({
    bearer: SERVICE_ROLE_KEY,
    body: { matchId: MATCH, fileNames: [OWN_FILE] },
    workbook: await exportWorkbook(),
  });
  expect(status).toBe(200);
  expect(json).toEqual({ success: true });
  expect(events).toEqual([
    "read:matches",
    "read:points",
    `download:match-data/${OWN_FILE}`,
    "rpc:import_match_rows",
    "invoke:generate-key-moments",
    "invoke:generate-insights",
  ]);
  // No table insert and no separate stats rpc: the function itself writes
  // nothing — the one rpc is the whole write path.
  expect(
    events.filter((e) => e.startsWith("insert:") || e.startsWith("rpc:")),
  ).toEqual(["rpc:import_match_rows"]);

  const [{ args }] = rpcCalls;
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
    "read:matches",
    "read:points",
    `download:match-data/${OWN_FILE}`,
    "rpc:import_match_rows",
  ]);
});
