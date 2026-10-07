import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import type { PlaybackMetadataResult } from "@/lib/match-video/types";
import {
  SAMPLE_VIDEO_ATTACHMENT,
  SAMPLE_VIDEO_BLOB,
  SAMPLE_VIDEO_TTL_SECONDS,
  handleGetSampleVideo,
  type SampleVideoDeps,
} from "@/lib/services/sample-match/video";

/**
 * `GET /api/sample-match/video` (first-run onboarding T10), run against fakes.
 *
 * Both seams in `SampleVideoDeps` are stubs: a three-line `auth.getUser()`
 * and a recording signer. No cookie, no Supabase, no Azure — and nothing in
 * this file imports `azure-sas.ts` or `@azure/storage-blob`.
 *
 * The property under test is that the ONLY thing a caller can vary is whether
 * they are signed in: the blob name and TTL the signer receives are the
 * module's constants whatever the request carried, because neither the
 * handler nor the route's `GET` takes a request at all. The last section
 * asserts that of the source, since a runtime test cannot pass what the
 * signature does not accept.
 */

const USER_ID = "7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f";
const READ_SAS =
  "https://acct.blob.core.windows.net/videos/sample/match-v1.mp4?sp=r&sig=READONLY";

interface Minted {
  blobName: string;
  ttlSeconds: number;
}

function fakeDeps(options: {
  user: { id: string } | null;
  authError?: { message: string };
  mint?: SampleVideoDeps["mintSas"];
}): { deps: SampleVideoDeps; minted: Minted[]; sessionReads: number } {
  const minted: Minted[] = [];
  const state = { sessionReads: 0 };
  const deps: SampleVideoDeps = {
    supabase: {
      auth: {
        async getUser() {
          state.sessionReads += 1;
          return {
            data: { user: options.user },
            error: options.authError ?? null,
          };
        },
      },
    },
    mintSas(params) {
      minted.push({ ...params });
      if (options.mint) return options.mint(params);
      return {
        playbackUrl: READ_SAS,
        expiresAt: new Date(Date.now() + params.ttlSeconds * 1000),
      };
    },
  };
  return {
    deps,
    minted,
    get sessionReads() {
      return state.sessionReads;
    },
  };
}

/* -------------------------------------------------------------------------
 * 401
 * ---------------------------------------------------------------------- */

test("no session is 401 unauthenticated, and nothing is signed", async () => {
  const h = fakeDeps({ user: null });
  const response = await handleGetSampleVideo(h.deps);

  expect(response.status).toBe(401);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const body = await response.json();
  expect(body.code).toBe("unauthenticated");
  expect(typeof body.error).toBe("string");
  expect(h.minted).toEqual([]);
});

test("an auth error is 401 too, never a 500 that leaks the cause", async () => {
  const h = fakeDeps({
    user: { id: USER_ID },
    authError: { message: "invalid JWT" },
  });
  const response = await handleGetSampleVideo(h.deps);

  expect(response.status).toBe(401);
  expect((await response.json()).code).toBe("unauthenticated");
  expect(h.minted).toEqual([]);
});

/* -------------------------------------------------------------------------
 * 200
 * ---------------------------------------------------------------------- */

test("a session gets the match-video playback envelope", async () => {
  const h = fakeDeps({ user: { id: USER_ID } });
  const response = await handleGetSampleVideo(h.deps);

  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");

  const body = (await response.json()) as PlaybackMetadataResult;
  // The exact keys `fetchPlaybackSource` reads off
  // `GET /api/matches/[matchId]/video`, and nothing a client could mistake
  // for an upload credential.
  expect(Object.keys(body)).toEqual(["attachment"]);
  expect(body.attachment).not.toBeNull();
  expect(Object.keys(body.attachment!).sort()).toEqual(
    [
      "id",
      "version",
      "offsetSeconds",
      "confirmedVideoTimeSeconds",
      "durationSeconds",
      "contentType",
      "filename",
      "playbackUrl",
      "playbackExpiresAt",
    ].sort(),
  );
  expect(body.attachment!.playbackUrl).toBe(READ_SAS);
  expect(body.attachment!.id).toBe(SAMPLE_VIDEO_ATTACHMENT.id);
  expect(body.attachment!.version).toBe(SAMPLE_VIDEO_ATTACHMENT.version);
  expect(Number.isFinite(Date.parse(body.attachment!.playbackExpiresAt))).toBe(
    true,
  );
  expect(JSON.stringify(body)).not.toContain("uploadUrl");
  expect(h.sessionReads).toBe(1);
});

test("the signer receives exactly the constant key and a 1800 s TTL", async () => {
  const h = fakeDeps({ user: { id: USER_ID } });
  await handleGetSampleVideo(h.deps);

  expect(SAMPLE_VIDEO_BLOB).toBe("sample/match-v1.mp4");
  expect(SAMPLE_VIDEO_TTL_SECONDS).toBe(1800);
  expect(h.minted).toEqual([
    { blobName: "sample/match-v1.mp4", ttlSeconds: 1800 },
  ]);
});

test("the answer's expiry is the signer's, serialised as ISO 8601", async () => {
  const expiresAt = new Date("2026-10-07T12:30:00.000Z");
  const h = fakeDeps({
    user: { id: USER_ID },
    mint: () => ({ playbackUrl: READ_SAS, expiresAt }),
  });
  const body = (await (
    await handleGetSampleVideo(h.deps)
  ).json()) as PlaybackMetadataResult;

  expect(body.attachment!.playbackExpiresAt).toBe("2026-10-07T12:30:00.000Z");
});

/* -------------------------------------------------------------------------
 * 5xx
 * ---------------------------------------------------------------------- */

test("a signer that throws (Azure unset) is 503 storage_unavailable", async () => {
  const h = fakeDeps({
    user: { id: USER_ID },
    mint: () => {
      throw new Error(
        "AZURE_STORAGE_ACCOUNT is not set. Azure Blob Storage holds the source video.",
      );
    },
  });
  const response = await handleGetSampleVideo(h.deps);

  expect(response.status).toBe(503);
  const body = await response.json();
  expect(body.code).toBe("storage_unavailable");
  expect(body.detail).toBe("storage_not_configured");
  expect(body.error).not.toContain("AZURE");
});

test("any other signing failure is the same 503 with its own slug", async () => {
  const h = fakeDeps({
    user: { id: USER_ID },
    mint: () => {
      throw new Error("boom");
    },
  });
  const response = await handleGetSampleVideo(h.deps);

  expect(response.status).toBe(503);
  const body = await response.json();
  expect(body.code).toBe("storage_unavailable");
  expect(body.detail).toBe("sas_signing_failed");
});

test("in production the 503 carries no detail", async () => {
  const previous = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: "production" });
  try {
    const h = fakeDeps({
      user: { id: USER_ID },
      mint: () => {
        throw new Error("AZURE_STORAGE_KEY is not set.");
      },
    });
    const body = await (await handleGetSampleVideo(h.deps)).json();
    expect(body.code).toBe("storage_unavailable");
    expect("detail" in body).toBe(false);
  } finally {
    Object.assign(process.env, { NODE_ENV: previous });
  }
});

test("a session read that throws is 500 internal_error", async () => {
  const deps: SampleVideoDeps = {
    supabase: {
      auth: {
        async getUser() {
          throw new Error("network");
        },
      },
    },
    mintSas: () => {
      throw new Error("must not be reached");
    },
  };
  const response = await handleGetSampleVideo(deps);
  expect(response.status).toBe(500);
  expect((await response.json()).code).toBe("internal_error");
});

/* -------------------------------------------------------------------------
 * The request is never consulted
 * ---------------------------------------------------------------------- */

const ROUTE = "src/app/api/sample-match/video/route.ts";
const HANDLER = "src/lib/services/sample-match/video.ts";

test("a ?key= query is ignored: neither the route nor the handler reads a request", async () => {
  // Runtime half: whatever a caller put in the URL, the handler has no
  // parameter to receive it through, and the signer sees the constant.
  const request = new Request(
    "http://localhost:3000/api/sample-match/video?key=match-video/other/final.mp4",
  );
  expect(new URL(request.url).searchParams.get("key")).not.toBe(
    SAMPLE_VIDEO_BLOB,
  );
  const h = fakeDeps({ user: { id: USER_ID } });
  await handleGetSampleVideo(h.deps);
  expect(h.minted.map((m) => m.blobName)).toEqual([SAMPLE_VIDEO_BLOB]);

  // Source half: the route's `GET` declares no parameter and names nothing a
  // request would carry; the handler module never mentions a request either.
  const stripComments = (source: string) =>
    source.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, "");
  const route = stripComments(readFileSync(ROUTE, "utf8"));
  expect(route).toMatch(/export async function GET\(\)\s*\{/);
  for (const token of [
    "request",
    "nextUrl",
    "searchParams",
    "headers",
    "params",
    ".json(",
  ]) {
    expect(route, `route.ts must not read ${token}`).not.toContain(token);
  }
  expect(route).toContain('export const runtime = "nodejs"');
  expect(route).toContain('export const dynamic = "force-dynamic"');
  expect(route).toContain("mintSas: mintPlaybackSas");

  const handler = stripComments(readFileSync(HANDLER, "utf8"));
  for (const token of ["Request", "searchParams", "nextUrl", "headers"]) {
    expect(handler, `video.ts must not read ${token}`).not.toContain(token);
  }
  expect(handler).toContain('SAMPLE_VIDEO_BLOB = "sample/match-v1.mp4"');
});

test("the session-refresh proxy covers the route and is unchanged", () => {
  const proxy = readFileSync("src/proxy.ts", "utf8");
  // The matcher excludes only webhooks, cron and static assets, so
  // `/api/sample-match/video` gets its cookie refreshed like every other
  // browser route. Nothing here needed a matcher change.
  expect(proxy).toContain("api/webhooks|api/cron");
  expect(proxy).not.toContain("sample-match");
});
