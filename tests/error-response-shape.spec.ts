import { expect, test } from "@playwright/test";
import { NextRequest } from "next/server";

import { matchVideoError } from "@/lib/match-video/types";
import { errorResponse, transportError } from "@/lib/services/match-video/http";
import { createLoader } from "./fixtures/vm-modules";
import { withEnv } from "./fixtures/with-env";

/**
 * The house refusal shape, `{ error, code, detail? }` (AGENTS.md › Conventions).
 *
 * `detail` is the machine cause — a SQLSTATE detail, a storage cause — so
 * `errorResponse()` sends it everywhere but production. The one exception is
 * a slug a browser client branches on: `finalizing`, which
 * `attachment-upload.ts` reads to wait out another tab's completion lease.
 *
 * Also here: the two admin upload routes answer the refusal's own status
 * (401 no session, 403 not an admin, 400 a bad request) rather than a flat
 * 400. The routes are loaded through `createLoader` with the submission
 * modules stubbed, so no session, cookie store or database is touched.
 */

const ENV = ["NODE_ENV"] as const;

async function bodyOf(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

test.describe("errorResponse · detail by environment", () => {
  const refusal = transportError("invalid_request", "sqlstate_22023");

  test("outside production the body carries detail", async () => {
    for (const NODE_ENV of ["development", "test", undefined]) {
      const response = await withEnv(ENV, { NODE_ENV }, async () =>
        errorResponse(refusal),
      );
      expect(response.status).toBe(400);
      expect(await bodyOf(response)).toEqual({
        error: "This request is not valid.",
        code: "invalid_request",
        detail: "sqlstate_22023",
      });
    }
  });

  test("in production the body omits detail but keeps error and code", async () => {
    const response = await withEnv(ENV, { NODE_ENV: "production" }, async () =>
      errorResponse(refusal),
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await bodyOf(response);
    expect(body).toEqual({
      error: "This request is not valid.",
      code: "invalid_request",
    });
    expect("detail" in body).toBe(false);
  });

  test("in production a client-read slug still survives: finalizing", async () => {
    const response = await withEnv(ENV, { NODE_ENV: "production" }, async () =>
      errorResponse(matchVideoError("pending_attempt_conflict", "finalizing")),
    );
    expect(response.status).toBe(409);
    expect(await bodyOf(response)).toMatchObject({
      code: "pending_attempt_conflict",
      detail: "finalizing",
    });
  });
});

type Refusal = { ok: false; status: 400 | 401 | 403; message: string };

const REFUSALS: Refusal[] = [
  { ok: false, status: 401, message: "Administrator access is required." },
  { ok: false, status: 403, message: "Administrator access is required." },
  { ok: false, status: 400, message: "Invalid video submission." },
];

function loadRoute(file: string, stubs: Record<string, unknown>) {
  return createLoader({ stubs }).load(file) as Record<
    string,
    (request: Request) => Promise<Response>
  >;
}

test.describe("admin upload routes · the refusal's own status", () => {
  test("POST /api/admin/uploads/video", async () => {
    for (const refusal of [...REFUSALS, { ok: true, jobId: "j" }]) {
      const route = loadRoute("src/app/api/admin/uploads/video/route.ts", {
        "@/lib/services/programs/admin-video-submission": {
          submitAdminMatchVideo: async () => refusal,
        },
      });
      const response = await route.POST(
        new Request("http://localhost/api/admin/uploads/video", {
          method: "POST",
          body: "{}",
        }),
      );
      if (refusal.ok) {
        expect(response.status).toBe(200);
        expect(await bodyOf(response)).toEqual(refusal);
        continue;
      }
      const { status, ...body } = refusal as Refusal;
      expect(response.status).toBe(status);
      // The wizard reads `{ ok, message }`; the status is not echoed.
      expect(await bodyOf(response)).toEqual(body);
    }
  });

  test("POST and GET /api/admin/uploads/file", async () => {
    for (const refusal of REFUSALS) {
      const route = loadRoute("src/app/api/admin/uploads/file/route.ts", {
        "@/lib/services/programs/admin-file-submission": {
          submitAdminMatchFile: async () => refusal,
          getAdminMatchFileStatus: async () => refusal,
        },
      });
      const { status, ...body } = refusal;

      const posted = await route.POST(
        new NextRequest("http://localhost/api/admin/uploads/file", {
          method: "POST",
          body: new FormData(),
        }),
      );
      expect(posted.status).toBe(status);
      expect(await bodyOf(posted)).toEqual(body);

      const read = await route.GET(
        new NextRequest(
          "http://localhost/api/admin/uploads/file?operationId=a&itemId=b",
        ),
      );
      expect(read.status).toBe(status);
      expect(await bodyOf(read)).toEqual(body);
    }
  });
});
