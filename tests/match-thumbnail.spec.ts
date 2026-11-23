import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createElement } from "react";
import type * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createLoader } from "./fixtures/vm-modules";
import {
  getMatchThumbnailUrls,
  signMatchThumbnails,
} from "@/lib/data/match-thumbnails-server";
import {
  isThumbnailKeyFor,
  looksLikeJpeg,
  THUMBNAIL_MAX_BYTES,
  thumbnailCaptureTime,
  thumbnailObjectKey,
  thumbnailPrefixFor,
} from "@/lib/match-thumbnail";
import {
  clearThumbnailIfVideoGone,
  type ClearThumbnailDeps,
} from "@/lib/services/match-thumbnail/clear";
import {
  handleUploadThumbnail,
  type UploadThumbnailDeps,
} from "@/lib/services/match-thumbnail/upload";
import type { VisibleMatchRow } from "@/lib/services/match-video/access";
import { purgeMatchStorage } from "@/lib/services/matches/purge-match-storage";

/**
 * Stored match-video thumbnails: who may get one, who may set one, and what a
 * row draws when there is none. Offline — every seam is a fake.
 *
 * The two properties worth a spec of their own:
 *
 *   1. A thumbnail inherits its match's visibility. The loader signs only
 *      rows the caller's own client returned, so a match RLS hides gets no
 *      URL — and nothing is signed for it.
 *   2. `matches.video_thumbnail_key` is writable by the match's creator, so
 *      it is never trusted: a key that is not this match's own
 *      `thumbnails/{matchId}/{uuid}.jpg` is neither signed nor deleted.
 */

const SITE = "http://localhost:3000";
const CREATOR = randomUUID();
const TEAMMATE = randomUUID();
const MATCH = randomUUID();
const OTHER_MATCH = randomUUID();
const HIDDEN_MATCH = randomUUID();

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

/* -------------------------------------------------------------------------
 * Keys
 * ---------------------------------------------------------------------- */

test.describe("thumbnail keys", () => {
  test("a minted key is under its match's prefix and passes its own check", () => {
    const key = thumbnailObjectKey(MATCH, randomUUID());
    expect(key.startsWith(thumbnailPrefixFor(MATCH))).toBe(true);
    expect(key.endsWith(".jpg")).toBe(true);
    expect(isThumbnailKeyFor(MATCH, key)).toBe(true);
  });

  test("another match's key, a video key and a traversal are all refused", () => {
    const other = thumbnailObjectKey(OTHER_MATCH, randomUUID());
    expect(isThumbnailKeyFor(MATCH, other)).toBe(false);
    for (const planted of [
      `videos/${CREATOR}/${MATCH}/original.mp4`,
      `match-video/${MATCH}/${randomUUID()}/final.mp4`,
      `${thumbnailPrefixFor(MATCH)}../../videos/${CREATOR}/${MATCH}/original.mp4`,
      `${thumbnailPrefixFor(MATCH)}${randomUUID()}.mp4`,
      `${thumbnailPrefixFor(MATCH)}${randomUUID()}.jpg?x=1`,
      `${thumbnailPrefixFor(MATCH)}nested/${randomUUID()}.jpg`,
      "",
      null,
      undefined,
    ]) {
      expect(isThumbnailKeyFor(MATCH, planted), String(planted)).toBe(false);
    }
  });

  test("a key cannot be minted for an id that is not a UUID", () => {
    expect(() => thumbnailObjectKey("../videos", randomUUID())).toThrow();
    expect(() => thumbnailObjectKey(MATCH, "x/../y")).toThrow();
  });

  test("the migration states the same key rule as the code", () => {
    const sql = readFileSync(
      "supabase/migrations/20261123050000_matches_video_thumbnail_key.sql",
      "utf8",
    );
    expect(sql).toContain("add column if not exists video_thumbnail_key text");
    expect(sql).toContain("'^thumbnails/' || id::text");
    expect(sql).toContain(
      "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.jpg$",
    );
    // Never filtered on, so never indexed.
    expect(sql).not.toMatch(/create\s+index/i);
  });
});

/* -------------------------------------------------------------------------
 * Which frame
 * ---------------------------------------------------------------------- */

test.describe("thumbnailCaptureTime", () => {
  test("90 seconds past the start of play on a full match", () => {
    expect(thumbnailCaptureTime({ durationSeconds: 5400 })).toBe(90);
    expect(
      thumbnailCaptureTime({ durationSeconds: 5400, startSeconds: 300 }),
    ).toBe(390);
  });

  test("never past the midpoint of a short clip", () => {
    expect(thumbnailCaptureTime({ durationSeconds: 60 })).toBe(30);
    expect(
      thumbnailCaptureTime({
        durationSeconds: 600,
        startSeconds: 100,
        endSeconds: 200,
      }),
    ).toBe(150);
  });

  test("an end of 0, the wizard's untrimmed value, is no end at all", () => {
    expect(
      thumbnailCaptureTime({
        durationSeconds: 5400,
        startSeconds: 0,
        endSeconds: 0,
      }),
    ).toBe(90);
  });

  test("stays inside the file on nonsense input", () => {
    expect(thumbnailCaptureTime({ durationSeconds: NaN })).toBe(0);
    expect(
      thumbnailCaptureTime({ durationSeconds: 100, startSeconds: 500 }),
    ).toBe(100);
    expect(
      thumbnailCaptureTime({ durationSeconds: 100, startSeconds: -5 }),
    ).toBe(50);
  });
});

/* -------------------------------------------------------------------------
 * Serving: visibility and the planted key
 * ---------------------------------------------------------------------- */

function fakeSigner(available = true) {
  const signed: string[] = [];
  return {
    signed,
    storage: {
      available: () => available,
      sign: (key: string) => {
        signed.push(key);
        return `https://store.test/${key}?sig=1`;
      },
    },
  };
}

/**
 * A client whose `matches` read returns only the rows RLS would: `visible`
 * is the caller's whole world, whatever ids were asked for.
 */
function rlsClient(
  visible: { id: string; video_thumbnail_key: string | null }[],
  options: { error?: string } = {},
) {
  const asked: string[][] = [];
  const client = {
    from(table: string) {
      expect(table).toBe("matches");
      let ids: string[] = [];
      const query = {
        select: () => query,
        in: (_column: string, values: string[]) => {
          ids = values;
          asked.push(values);
          return query;
        },
        not: () => query,
        then: (resolve: (value: unknown) => unknown) =>
          resolve(
            options.error
              ? { data: null, error: { message: options.error } }
              : {
                  data: visible.filter(
                    (row) => ids.includes(row.id) && row.video_thumbnail_key,
                  ),
                  error: null,
                },
          ),
      };
      return query;
    },
  } as unknown as SupabaseClient;
  return { client, asked };
}

test.describe("thumbnail URLs for a list", () => {
  test("signs each visible match's own key, in one read", async () => {
    const key = thumbnailObjectKey(MATCH, randomUUID());
    const otherKey = thumbnailObjectKey(OTHER_MATCH, randomUUID());
    const { client, asked } = rlsClient([
      { id: MATCH, video_thumbnail_key: key },
      { id: OTHER_MATCH, video_thumbnail_key: otherKey },
    ]);
    const { storage, signed } = fakeSigner();

    const urls = await getMatchThumbnailUrls(
      client,
      [MATCH, OTHER_MATCH, MATCH],
      storage,
    );

    expect(asked).toEqual([[MATCH, OTHER_MATCH]]);
    expect(Object.keys(urls).sort()).toEqual([MATCH, OTHER_MATCH].sort());
    expect(urls[MATCH]).toContain(key);
    expect(signed.sort()).toEqual([key, otherKey].sort());
  });

  test("a match the caller cannot see gets no URL and no signature", async () => {
    // HIDDEN_MATCH has a thumbnail, but RLS does not return its row.
    const { client } = rlsClient([
      {
        id: MATCH,
        video_thumbnail_key: thumbnailObjectKey(MATCH, randomUUID()),
      },
    ]);
    const { storage, signed } = fakeSigner();

    const urls = await getMatchThumbnailUrls(
      client,
      [MATCH, HIDDEN_MATCH],
      storage,
    );

    expect(urls[HIDDEN_MATCH]).toBeUndefined();
    expect(Object.keys(urls)).toEqual([MATCH]);
    expect(signed.some((key) => key.includes(HIDDEN_MATCH))).toBe(false);
  });

  test("a key planted on a visible row is never signed", () => {
    const { storage, signed } = fakeSigner();
    const urls = signMatchThumbnails(
      [
        // The creator pointed their own row at somebody else's video…
        { id: MATCH, video_thumbnail_key: `videos/${TEAMMATE}/x/original.mp4` },
        // …and at another match's thumbnail.
        {
          id: OTHER_MATCH,
          video_thumbnail_key: thumbnailObjectKey(MATCH, randomUUID()),
        },
      ],
      storage,
    );
    expect(urls).toEqual({});
    expect(signed).toEqual([]);
  });

  test("no thumbnail, no store, a failed read: no entry, never a throw", async () => {
    const { storage, signed } = fakeSigner();
    expect(
      signMatchThumbnails([{ id: MATCH, video_thumbnail_key: null }], storage),
    ).toEqual({});
    expect(signed).toEqual([]);

    const off = fakeSigner(false);
    expect(
      signMatchThumbnails(
        [
          {
            id: MATCH,
            video_thumbnail_key: thumbnailObjectKey(MATCH, randomUUID()),
          },
        ],
        off.storage,
      ),
    ).toEqual({});
    expect(off.signed).toEqual([]);

    const failing = rlsClient([], { error: "boom" });
    expect(
      await getMatchThumbnailUrls(failing.client, [MATCH], storage),
    ).toEqual({});
    expect(await getMatchThumbnailUrls(failing.client, [], storage)).toEqual(
      {},
    );
  });
});

/* -------------------------------------------------------------------------
 * The row image and its fallback
 * ---------------------------------------------------------------------- */

test.describe("MatchThumbnail", () => {
  // Through the vm loader: Playwright's own transform rewrites a directly
  // imported component's JSX into a shape React's server renderer rejects.
  const { MatchThumbnail } = createLoader().load(
    "src/components/dashboard/shared/match-thumbnail.tsx",
  ) as {
    MatchThumbnail: React.FC<{
      src: string | null | undefined;
      width: number;
      height: number;
      fallback: React.ReactNode;
    }>;
  };
  const fallback = createElement("svg", { "data-court": "" });

  test("no thumbnail draws the fallback and no image", () => {
    for (const src of [null, undefined, ""]) {
      const html = renderToStaticMarkup(
        createElement(MatchThumbnail, { src, width: 78, height: 44, fallback }),
      );
      expect(html).toContain("data-court");
      expect(html).not.toContain("<img");
      expect(html).not.toContain("<video");
    }
  });

  test("a thumbnail is a lazy image with fixed dimensions, not a video", () => {
    const html = renderToStaticMarkup(
      createElement(MatchThumbnail, {
        src: "https://store.test/thumbnails/a/b.jpg?sig=1",
        width: 78,
        height: 44,
        fallback,
      }),
    );
    expect(html).toContain("<img");
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('width="78"');
    expect(html).toContain('height="44"');
    expect(html).toContain('alt=""');
    expect(html).not.toContain("<video");
    expect(html).not.toContain("data-court");
  });

  test("a failed load falls back too", () => {
    const source = readFileSync(
      "src/components/dashboard/shared/match-thumbnail.tsx",
      "utf8",
    );
    expect(source).toContain("onError={() => setFailedSrc(src)}");
    expect(source).toContain("failedSrc === src");
  });
});

/* -------------------------------------------------------------------------
 * Upload: who may set one, and what is accepted
 * ---------------------------------------------------------------------- */

const MATCHES: Record<string, VisibleMatchRow> = {
  [MATCH]: {
    id: MATCH,
    created_by: CREATOR,
    program_id: null,
    source_provider: "splitstep",
  },
};

function uploadHarness(
  options: {
    user?: string | null;
    currentKey?: string | null;
    available?: boolean;
    putFails?: boolean;
    writeFails?: boolean;
  } = {},
) {
  const puts: { key: string; bytes: number }[] = [];
  const deletes: string[] = [];
  const writes: { matchId: string; key: string }[] = [];
  const imageId = randomUUID();
  const user = options.user === undefined ? CREATOR : options.user;

  const deps: UploadThumbnailDeps = {
    allowedOrigins: [SITE],
    currentUserId: async () => user,
    // RLS: the creator and a teammate see the match; a stranger does not.
    loadVisibleMatch: async (matchId) => ({
      match:
        user === CREATOR || user === TEAMMATE
          ? (MATCHES[matchId] ?? null)
          : null,
      error: null,
    }),
    activeWorkspace: async () => null,
    storage: {
      available: () => options.available ?? true,
      put: async (key, bytes) => {
        if (options.putFails) throw new Error("azure down");
        puts.push({ key, bytes: bytes.byteLength });
      },
      delete: async (key) => {
        deletes.push(key);
      },
    },
    readKey: async () => ({ key: options.currentKey ?? null, error: null }),
    writeKey: async (matchId, key) => {
      if (options.writeFails) return "no_row_updated";
      writes.push({ matchId, key });
      return null;
    },
    mintImageId: () => imageId,
  };
  return { deps, puts, deletes, writes, imageId };
}

function imageRequest(
  body: Uint8Array | null = JPEG,
  headers: Record<string, string> = {},
): Request {
  return new Request(`${SITE}/api/matches/${MATCH}/video/thumbnail`, {
    method: "POST",
    headers: { origin: SITE, "content-type": "image/jpeg", ...headers },
    body: body ? Buffer.from(body) : undefined,
  });
}

test.describe("POST video/thumbnail", () => {
  test("the creator stores an image under the match's own key", async () => {
    const h = uploadHarness();
    const response = await handleUploadThumbnail(imageRequest(), MATCH, h.deps);

    expect(response.status).toBe(200);
    const key = thumbnailObjectKey(MATCH, h.imageId);
    expect(h.puts).toEqual([{ key, bytes: JPEG.byteLength }]);
    expect(h.writes).toEqual([{ matchId: MATCH, key }]);
    expect(h.deletes).toEqual([]);
  });

  test("signed out is 401 and a stranger gets the same 404 as no match", async () => {
    const anonymous = uploadHarness({ user: null });
    expect(
      (await handleUploadThumbnail(imageRequest(), MATCH, anonymous.deps))
        .status,
    ).toBe(401);

    const stranger = uploadHarness({ user: randomUUID() });
    const hidden = await handleUploadThumbnail(
      imageRequest(),
      MATCH,
      stranger.deps,
    );
    const absent = await handleUploadThumbnail(
      imageRequest(),
      randomUUID(),
      uploadHarness().deps,
    );
    expect(hidden.status).toBe(404);
    expect(absent.status).toBe(404);
    expect((await hidden.json()).code).toBe((await absent.json()).code);
    expect(stranger.puts).toEqual([]);
    expect(stranger.writes).toEqual([]);
  });

  test("someone who can see the match but did not create it is refused", async () => {
    const h = uploadHarness({ user: TEAMMATE });
    const response = await handleUploadThumbnail(imageRequest(), MATCH, h.deps);
    expect(response.status).toBe(403);
    expect(h.puts).toEqual([]);
    expect(h.writes).toEqual([]);
  });

  test("another origin is refused before anything is read", async () => {
    const h = uploadHarness();
    const response = await handleUploadThumbnail(
      imageRequest(JPEG, { origin: "https://evil.example" }),
      MATCH,
      h.deps,
    );
    expect(response.status).toBe(403);
    expect(h.puts).toEqual([]);
  });

  test("only a small JPEG is accepted, by its bytes not its label", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    const html = new TextEncoder().encode("<script>alert(1)</script>");
    const huge = new Uint8Array(THUMBNAIL_MAX_BYTES + 1);
    huge.set(JPEG);

    const cases: [string, Request, number][] = [
      ["png bytes labelled jpeg", imageRequest(png), 400],
      ["html labelled jpeg", imageRequest(html), 400],
      [
        "wrong content type",
        imageRequest(JPEG, { "content-type": "image/png" }),
        400,
      ],
      [
        "svg content type",
        imageRequest(JPEG, { "content-type": "image/svg+xml" }),
        400,
      ],
      ["no body", imageRequest(null), 400],
      ["over the cap", imageRequest(huge), 413],
    ];
    for (const [name, request, status] of cases) {
      const h = uploadHarness();
      const response = await handleUploadThumbnail(request, MATCH, h.deps);
      expect(response.status, name).toBe(status);
      expect(h.puts, name).toEqual([]);
      expect(h.writes, name).toEqual([]);
    }
    expect(looksLikeJpeg(JPEG)).toBe(true);
    expect(looksLikeJpeg(png)).toBe(false);
  });

  test("a replacement deletes the image it replaces", async () => {
    const previous = thumbnailObjectKey(MATCH, randomUUID());
    const h = uploadHarness({ currentKey: previous });
    await handleUploadThumbnail(imageRequest(), MATCH, h.deps);
    expect(h.deletes).toEqual([previous]);
  });

  test("a planted previous key is never deleted", async () => {
    const h = uploadHarness({
      currentKey: `videos/${TEAMMATE}/${OTHER_MATCH}/original.mp4`,
    });
    const response = await handleUploadThumbnail(imageRequest(), MATCH, h.deps);
    expect(response.status).toBe(200);
    expect(h.deletes).toEqual([]);
  });

  test("an image whose key could not be recorded is taken back", async () => {
    const h = uploadHarness({ writeFails: true });
    const response = await handleUploadThumbnail(imageRequest(), MATCH, h.deps);
    expect(response.status).toBe(503);
    expect(h.deletes).toEqual([thumbnailObjectKey(MATCH, h.imageId)]);
  });

  test("a failed store or no store is a 503 that records nothing", async () => {
    for (const options of [{ putFails: true }, { available: false }]) {
      const h = uploadHarness(options);
      const response = await handleUploadThumbnail(
        imageRequest(),
        MATCH,
        h.deps,
      );
      expect(response.status).toBe(503);
      expect(h.writes).toEqual([]);
    }
  });
});

/* -------------------------------------------------------------------------
 * Removal: the thumbnail goes with the video
 * ---------------------------------------------------------------------- */

function clearHarness(options: {
  hasVideo: boolean;
  available?: boolean;
  clearFails?: boolean;
}) {
  const cleared: string[] = [];
  const deleted: string[][] = [];
  const deps: ClearThumbnailDeps = {
    hasVideo: async () => options.hasVideo,
    clearKey: async (matchId) => {
      if (options.clearFails) return "boom";
      cleared.push(matchId);
      return null;
    },
    storage: {
      available: () => options.available ?? true,
      deleteAllFor: async (ids) => {
        deleted.push([...ids]);
        return ids.length;
      },
    },
  };
  return { deps, cleared, deleted };
}

test.describe("removing a match's video", () => {
  test("a match left with no video loses its thumbnail and its key", async () => {
    const h = clearHarness({ hasVideo: false });
    expect(await clearThumbnailIfVideoGone(MATCH, h.deps)).toBe("cleared");
    expect(h.cleared).toEqual([MATCH]);
    expect(h.deleted).toEqual([[MATCH]]);
  });

  test("a match that still has a video keeps its thumbnail", async () => {
    const h = clearHarness({ hasVideo: true });
    expect(await clearThumbnailIfVideoGone(MATCH, h.deps)).toBe("kept");
    expect(h.cleared).toEqual([]);
    expect(h.deleted).toEqual([]);
  });

  test("the image is not deleted while the row still names it", async () => {
    const h = clearHarness({ hasVideo: false, clearFails: true });
    expect(await clearThumbnailIfVideoGone(MATCH, h.deps)).toBe("failed");
    expect(h.deleted).toEqual([]);
  });

  test("the cleanup worker runs it after collecting a retired video", () => {
    const source = readFileSync(
      "src/lib/services/match-video/cleanup.ts",
      "utf8",
    );
    expect(source).toContain("afterFinalCollected: (matchId) =>");
    expect(source).toContain("clearThumbnailIfVideoGone(matchId");
  });

  test("deleting a match deletes its thumbnails", async () => {
    const deletedFor: string[][] = [];
    const empty = {
      select: () => empty,
      in: () => empty,
      then: (resolve: (value: unknown) => unknown) =>
        resolve({ data: [], error: null }),
    };
    const supabase = {
      from: () => empty,
      storage: { from: () => ({ remove: async () => ({ error: null }) }) },
    } as unknown as SupabaseClient;

    await purgeMatchStorage(supabase, [MATCH, OTHER_MATCH], "spec", {
      claimPurge: async () => ({ data: true, error: null }),
      sharedKeyReader: supabase,
      queueR2Deletes: async () => ({ queued: 0, error: null }),
      attachments: {
        authorize: async () => ({ ok: true, value: [] }),
      } as never,
      deleteThumbnails: async (ids) => {
        deletedFor.push(ids);
        return ids.length;
      },
    });

    expect(deletedFor).toEqual([[MATCH, OTHER_MATCH]]);
  });
});

/* -------------------------------------------------------------------------
 * The upload flows capture one
 * ---------------------------------------------------------------------- */

test.describe("capture on upload", () => {
  test("both video lineages save a thumbnail, and neither waits on it", () => {
    const vendor = readFileSync(
      "src/lib/services/splitstep/submit-match-video.ts",
      "utf8",
    );
    const attachment = readFileSync(
      "src/components/dashboard/matches/match-video-attachment/use-attachment-flow.ts",
      "utf8",
    );
    expect(vendor).toContain("void saveMatchThumbnail(matchId, pickedFile");
    expect(attachment).toContain(
      "void saveMatchThumbnail(matchId, picked.file",
    );
    expect(vendor).not.toContain("await saveMatchThumbnail");
    expect(attachment).not.toContain("await saveMatchThumbnail");
  });
});
