import { expect, test } from "@playwright/test";
import { NextRequest } from "next/server";

import { swingVisionStrategy } from "@/lib/services/upload";
import { createLoader } from "./fixtures/vm-modules";

/**
 * The app-side guards on the SwingVision import routes (T12).
 *
 * `/api/upload` used to trust the live `match_files_guard_upload_eligibility`
 * trigger for ownership — which only fires once the bytes are already in
 * storage — and had no idempotency at all: `process-match` inserts points and
 * shots unconditionally, so a retried POST doubled every statistic. The route
 * now loads the match through the caller's own client and refuses before the
 * storage upload and before the function is invoked. `/api/validate-file`
 * had no auth gate, decoded any body it was handed, and echoed parser
 * messages on its 500s.
 *
 * Both routes are driven through the vm loader with `@/lib/supabase/server`
 * stubbed; the fake client records every storage upload and every
 * `functions.invoke`, so each refusal asserts that neither happened. Nothing
 * here opens a database or a browser.
 */

const OWNER = "u-owner";
const OTHER = "u-someone-else";
const MATCH = "m-1";
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type Row = Record<string, unknown>;

interface FakeDb {
  /** The signed-in user, or null for no session. */
  user: { id: string } | null;
  /** The `matches` row the caller's client can see, or null for none. */
  match: { id: string; created_by: string | null } | null;
  matchFiles: Row[];
  points: Row[];
}

/**
 * Just enough of the Supabase client for both routes: table reads answer
 * from `db`, `match_files.insert` appends to it (so the post-upload listing
 * sees the new row, as it would live), and the storage and functions seams
 * only record what they were asked to do.
 */
function fakeClient(db: FakeDb) {
  const uploads: string[] = [];
  const invokes: { name: string; body: unknown }[] = [];

  function from(table: string) {
    const rows = (): Row[] => {
      if (table === "match_files") return db.matchFiles;
      if (table === "points") return db.points;
      if (table === "matches" && db.match)
        return [{ source_provider: "swing-vision", ...db.match }];
      return [];
    };
    let inserted: Row | null = null;
    const builder = {
      select: () => builder,
      eq: () => builder,
      limit: () => builder,
      insert(row: Row) {
        inserted = { id: `mf-${db.matchFiles.length + 1}`, ...row };
        db.matchFiles.push(inserted);
        return builder;
      },
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      single: async () => ({
        data: inserted ?? rows()[0] ?? null,
        error: null,
      }),
      then<R>(resolve: (value: { data: Row[]; error: null }) => R) {
        return Promise.resolve({ data: [...rows()], error: null }).then(
          resolve,
        );
      },
    };
    return builder;
  }

  const client = {
    auth: {
      getUser: async () => ({
        data: { user: db.user },
        error: db.user ? null : { message: "Auth session missing" },
      }),
    },
    from,
    storage: {
      from: () => ({
        upload: async (path: string) => {
          uploads.push(path);
          return { data: { path }, error: null };
        },
        remove: async () => ({ error: null }),
      }),
    },
    functions: {
      invoke: (name: string, options: { body: unknown }) => {
        invokes.push({ name, body: options.body });
        return Promise.resolve({ data: null, error: null });
      },
    },
  };

  return { client, uploads, invokes };
}

type RouteHandler = (request: NextRequest) => Promise<Response>;

// The vm context starts bare; the routes reach for these at call time.
const GLOBALS = { Buffer, File, URL };

function loadUploadRoute(client: unknown): RouteHandler {
  const loader = createLoader({
    stubs: { "@/lib/supabase/server": { createClient: async () => client } },
    globals: GLOBALS,
  });
  return loader.load("src/app/api/upload/route.ts").POST as RouteHandler;
}

function loadValidateRoute(
  client: unknown,
  validator: (file: File) => Promise<unknown>,
  strategy?: { config: { maxFileSizeMB: number } },
): RouteHandler {
  const loader = createLoader({
    stubs: {
      "@/lib/supabase/server": { createClient: async () => client },
      "@/lib/services/upload/validators/swingvision-validator": {
        validateSwingVisionFile: validator,
      },
      ...(strategy
        ? { "@/lib/services/upload": { swingVisionStrategy: strategy } }
        : {}),
    },
    globals: GLOBALS,
  });
  return loader.load("src/app/api/validate-file/route.ts").POST as RouteHandler;
}

function uploadRequest() {
  const fd = new FormData();
  fd.append(
    "file",
    new File([new Uint8Array(16)], "match.xlsx", { type: XLSX_MIME }),
  );
  fd.append("matchId", MATCH);
  fd.append("providerId", "swing-vision");
  return new NextRequest("http://localhost/api/upload", {
    method: "POST",
    body: fd,
  });
}

function validateRequest(body: unknown, raw = false) {
  return new NextRequest("http://localhost/api/validate-file", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

async function withConsoleErrors<T>(run: () => Promise<T>) {
  const errors: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };
  try {
    return { result: await run(), errors };
  } finally {
    console.error = original;
  }
}

function ownDb(overrides: Partial<FakeDb> = {}): FakeDb {
  return {
    user: { id: OWNER },
    match: { id: MATCH, created_by: OWNER },
    matchFiles: [],
    points: [],
    ...overrides,
  };
}

// ── /api/upload ─────────────────────────────────────────────────────────────

test.describe("/api/upload", () => {
  test("no session → 401, nothing uploaded, nothing invoked", async () => {
    const { client, uploads, invokes } = fakeClient(ownDb({ user: null }));
    const POST = loadUploadRoute(client);

    const res = await POST(uploadRequest());

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false, error: "Unauthorized" });
    expect(uploads).toEqual([]);
    expect(invokes).toEqual([]);
  });

  test("a match the caller cannot see → 404 before storage", async () => {
    const { client, uploads, invokes } = fakeClient(ownDb({ match: null }));
    const POST = loadUploadRoute(client);

    const res = await POST(uploadRequest());

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      success: false,
      error: "Match not found",
    });
    expect(uploads).toEqual([]);
    expect(invokes).toEqual([]);
  });

  test("a match created by somebody else → 403, zero uploads, zero invokes", async () => {
    const { client, uploads, invokes } = fakeClient(
      ownDb({ match: { id: MATCH, created_by: OTHER } }),
    );
    const POST = loadUploadRoute(client);

    const res = await POST(uploadRequest());

    expect(res.status).toBe(403);
    expect((await res.json()).success).toBe(false);
    expect(uploads).toEqual([]);
    expect(invokes).toEqual([]);
  });

  test("an existing match_files row → 409, so a retry cannot fire process-match again", async () => {
    const { client, uploads, invokes } = fakeClient(
      ownDb({
        matchFiles: [{ id: "mf-existing", match_id: MATCH }],
      }),
    );
    const POST = loadUploadRoute(client);

    const res = await POST(uploadRequest());

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      success: false,
      error: "This match already has a file",
    });
    expect(uploads).toEqual([]);
    expect(invokes).toEqual([]);
  });

  test("a match that already has points → 409 even with no file row", async () => {
    const { client, uploads, invokes } = fakeClient(
      ownDb({ points: [{ id: "pt-1", match_id: MATCH }] }),
    );
    const POST = loadUploadRoute(client);

    const res = await POST(uploadRequest());

    expect(res.status).toBe(409);
    expect(uploads).toEqual([]);
    expect(invokes).toEqual([]);
  });

  test("the owner's first upload still lands and invokes process-match with userId", async () => {
    const db = ownDb();
    const { client, uploads, invokes } = fakeClient(db);
    const POST = loadUploadRoute(client);

    const res = await POST(uploadRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.fileId).toBe("mf-1");
    expect(uploads).toEqual([`${OWNER}/swing-vision/${MATCH}/match.xlsx`]);
    expect(invokes).toEqual([
      {
        name: "process-match",
        body: {
          matchId: MATCH,
          userId: OWNER,
          fileNames: [`${OWNER}/swing-vision/${MATCH}/match.xlsx`],
          sourceProvider: "swing-vision",
        },
      },
    ]);
  });
});

// ── /api/validate-file ──────────────────────────────────────────────────────

/** A strategy whose ceiling is three bytes: exactly one base64 quartet. */
const TINY_STRATEGY = { config: { maxFileSizeMB: 3 / (1024 * 1024) } };

function spyValidator(result: unknown = { success: true }) {
  const calls: File[] = [];
  const validator = async (file: File) => {
    calls.push(file);
    if (result instanceof Error) throw result;
    return result;
  };
  return { validator, calls };
}

test.describe("/api/validate-file", () => {
  test("no session → 401 in /api/upload's shape, validator never called", async () => {
    const { client } = fakeClient(ownDb({ user: null }));
    const { validator, calls } = spyValidator();
    const POST = loadValidateRoute(client, validator);

    const res = await POST(
      validateRequest({ file: "QUJD", fileName: "match.xlsx" }),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false, error: "Unauthorized" });
    expect(calls).toEqual([]);
  });

  test("the ceiling is derived from the strategy: one quartet over → 413, validator never called", async () => {
    const { client } = fakeClient(ownDb());
    const { validator, calls } = spyValidator();
    const POST = loadValidateRoute(client, validator, TINY_STRATEGY);

    // Four characters is the ceiling for a three-byte file; five is over it.
    const res = await POST(
      validateRequest({
        file: "data:application/octet-stream;base64,QUJDRA",
        fileName: "match.xlsx",
      }),
    );

    expect(res.status).toBe(413);
    expect((await res.json()).success).toBe(false);
    expect(calls).toEqual([]);
  });

  test("a payload exactly at the ceiling is decoded and handed to the validator", async () => {
    const { client } = fakeClient(ownDb());
    const { validator, calls } = spyValidator({
      success: true,
      message: "ok",
    });
    const POST = loadValidateRoute(client, validator, TINY_STRATEGY);

    const res = await POST(
      validateRequest({
        file: "data:application/octet-stream;base64,QUJD",
        fileName: "match.xlsx",
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, message: "ok" });
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("match.xlsx");
    expect(calls[0].size).toBe(3);
  });

  test("the real ceiling is Math.ceil(maxFileSizeMB MiB / 3) * 4 characters", async () => {
    const { client } = fakeClient(ownDb());
    const { validator, calls } = spyValidator();
    const POST = loadValidateRoute(client, validator);

    const bytes = swingVisionStrategy.config.maxFileSizeMB * 1024 * 1024;
    const limit = Math.ceil(bytes / 3) * 4;
    expect(limit).toBe(69_905_068);

    const res = await POST(
      validateRequest({ file: "A".repeat(limit + 1), fileName: "match.xlsx" }),
    );

    expect(res.status).toBe(413);
    expect(calls).toEqual([]);
  });

  test("a validator crash → 500 with the fixed message; the cause only in the log", async () => {
    const { client } = fakeClient(ownDb());
    const { validator } = spyValidator(
      new Error("Sheet 'Shots' cell B7: not a number"),
    );
    const POST = loadValidateRoute(client, validator);

    const { result: res, errors } = await withConsoleErrors(() =>
      POST(validateRequest({ file: "QUJD", fileName: "match.xlsx" })),
    );

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      success: false,
      error: "Failed to validate file. Please try again.",
    });
    expect(errors).toHaveLength(1);
    expect(String(errors[0][1])).toContain("cell B7");
  });

  test("an unparseable body → 500 with the same fixed message", async () => {
    const { client } = fakeClient(ownDb());
    const { validator, calls } = spyValidator();
    const POST = loadValidateRoute(client, validator);

    const { result: res } = await withConsoleErrors(() =>
      POST(validateRequest("{not json", true)),
    );

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      success: false,
      error: "Failed to validate file. Please try again.",
    });
    expect(calls).toEqual([]);
  });

  test("a missing file or name → 400 before any decoding", async () => {
    const { client } = fakeClient(ownDb());
    const { validator, calls } = spyValidator();
    const POST = loadValidateRoute(client, validator);

    const res = await POST(validateRequest({ fileName: "match.xlsx" }));

    expect(res.status).toBe(400);
    expect(calls).toEqual([]);
  });
});
