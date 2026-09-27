import { expect, test } from "@playwright/test";

import {
  ATTACHMENT_BLOCK_SIZE_BYTES,
  ATTACHMENT_MAX_BLOCK_ATTEMPTS,
  ATTACHMENT_MAX_COMPLETION_TRANSIENT_ATTEMPTS,
  ATTACHMENT_MAX_CONCURRENT_BLOCKS,
  ATTACHMENT_RENEW_MARGIN_MS,
  BlockPutError,
  TransferAborted,
  transferAttachment,
  type AttachmentTransferDeps,
  type AttachmentTransferProgress,
  type BlockPutRequest,
} from "@/components/dashboard/matches/match-video-attachment/attachment-upload";
import type { AttachmentSelection } from "@/components/dashboard/matches/match-video-attachment/use-attachment-file";

/**
 * The browser upload transport (T19), driven with fake seams.
 *
 * Everything here is a property of the TRANSPORT and none of it needs a real
 * browser: the seams that would need one — `XMLHttpRequest`'s upload-progress
 * event and a `fetch` the platform attaches `Origin` to — are exactly the two
 * this module takes as dependencies. What is left is the part that gets this
 * wrong in production:
 *
 *   1. **Four requests, 8 MiB each.** Not five, not one-at-a-time, and the
 *      last block is the remainder rather than a padded full block.
 *   2. **Progress is bytes.** With four blocks in flight, block-count progress
 *      jumps in quarters; a retried block must never walk the bar backwards.
 *   3. **Retries are bounded, and only for transient failures.** A terminal
 *      refusal repeated three times is three ways to arrive at the same no.
 *   4. **An expired credential is RENEWED, never re-derived.** The module has
 *      no signer and must be shown asking the endpoint for a new URL and
 *      using the one it is given.
 *   5. **A lost success does not re-upload.** This is the expensive bug: a
 *      completion whose 200 never arrived has already published, and reserving
 *      a second attempt would push the whole file again.
 *   6. **The credential never leaves memory.** Asserted against stubbed web
 *      storage, a stubbed cookie jar and a captured console — a SAS's `sig=`
 *      in a bug report is a credential in a bug report.
 */

/* -------------------------------------------------------------------------
 * Fixtures
 * ---------------------------------------------------------------------- */

const MATCH_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const ATTACHMENT_ID = "9c858901-8a57-4791-81fe-4c455b099bc9";
const CLIENT_REQUEST_ID = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";

/** A SAS-shaped URL. The `sig=` is what the credential tests hunt for. */
const SAS_ONE =
  "https://acct.blob.core.windows.net/match-video/staged/one.mp4" +
  "?sv=2024-11-04&se=2026-09-19T12%3A00%3A00Z&sp=cw&sig=FIRSTSIGNATUREAAA%3D";
const SAS_TWO =
  "https://acct.blob.core.windows.net/match-video/staged/one.mp4" +
  "?sv=2024-11-04&se=2026-09-19T18%3A00%3A00Z&sp=cw&sig=SECONDSIGNATUREBB%3D";

const UPLOADS = `/api/matches/${MATCH_ID}/video/uploads`;

function selectionOf(sizeBytes: number): AttachmentSelection {
  // A real Blob, so `slice` produces real byte counts — the block sizing
  // assertions below are measuring the transport, not a stub's arithmetic.
  const file = new File([new Uint8Array(sizeBytes)], "match.mkv", {
    type: "",
  });
  return {
    file,
    filename: "match.mkv",
    sizeBytes,
    // Derived from the extension by T17, NOT from `File.type` — which is ""
    // for .mkv above, and is why the transport must take the selection whole.
    contentType: "video/x-matroska",
    durationSeconds: 3600,
    media: {
      durationSeconds: 3600,
    } as AttachmentSelection["media"],
  };
}

function json(
  body: unknown,
  status = 200,
  headers: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

const RESERVED = {
  attachmentId: ATTACHMENT_ID,
  uploadUrl: SAS_ONE,
  uploadExpiresAt: "2026-09-19T12:00:00.000Z",
};

interface Call {
  method: string;
  url: string;
  body?: unknown;
}

interface Harness {
  deps: AttachmentTransferDeps;
  calls: Call[];
  blocks: BlockPutRequest[];
  /** Highest number of block PUTs in flight at one instant. */
  peakConcurrency: number;
  sleeps: number[];
}

interface HarnessOptions {
  /** Responses for the completion endpoint, in order. The last one repeats. */
  completions?: (() => Response | Promise<Response>)[];
  onBlock?: (request: BlockPutRequest, index: number) => Promise<void> | void;
  nowMs?: number;
  reserve?: () => Response | Promise<Response>;
  renew?: () => Response | Promise<Response>;
}

/**
 * Fake seams.
 *
 * `sleep` resolves immediately and records the interval, so a 202's advertised
 * two seconds is asserted rather than waited for; a spec that actually slept
 * would be a spec nobody runs.
 */
function harness(options: HarnessOptions = {}): Harness {
  const calls: Call[] = [];
  const blocks: BlockPutRequest[] = [];
  const sleeps: number[] = [];
  let live = 0;
  let blockIndex = 0;
  let completionIndex = 0;

  const h: Harness = {
    calls,
    blocks,
    sleeps,
    peakConcurrency: 0,
    deps: {
      now: () => options.nowMs ?? Date.parse("2026-09-19T06:00:00.000Z"),
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      randomUUID: () => CLIENT_REQUEST_ID,
      async fetch(input, init) {
        const url = String(input);
        const method = init?.method ?? "GET";
        let body: unknown;
        if (typeof init?.body === "string") {
          try {
            body = JSON.parse(init.body);
          } catch {
            body = init.body;
          }
        }
        calls.push({ method, url, body });

        if (url.endsWith("/complete")) {
          const responders = options.completions ?? [
            () => json({ status: "committed", attachment: COMMITTED }),
          ];
          const responder =
            responders[Math.min(completionIndex, responders.length - 1)];
          completionIndex += 1;
          return responder();
        }
        if (url.endsWith("/renew")) {
          return (
            options.renew?.() ??
            json({
              attachmentId: ATTACHMENT_ID,
              uploadUrl: SAS_TWO,
              uploadExpiresAt: "2026-09-19T18:00:00.000Z",
            })
          );
        }
        if (method === "DELETE") {
          return json({ attachmentId: ATTACHMENT_ID, state: "retired" });
        }
        return options.reserve?.() ?? json(RESERVED, 201);
      },
      async putBlock(request) {
        blocks.push(request);
        live += 1;
        h.peakConcurrency = Math.max(h.peakConcurrency, live);
        try {
          await options.onBlock?.(request, blockIndex++);
        } finally {
          live -= 1;
        }
      },
    },
  };
  return h;
}

const COMMITTED = {
  id: ATTACHMENT_ID,
  version: 1,
  offsetSeconds: -12.5,
  confirmedVideoTimeSeconds: 42.25,
  durationSeconds: 3600,
  contentType: "video/x-matroska",
  filename: "match.mkv",
};

function run(
  h: Harness,
  overrides: Partial<Parameters<typeof transferAttachment>[0]> = {},
) {
  return transferAttachment({
    matchId: MATCH_ID,
    selection: selectionOf(20 * 1024 * 1024),
    confirmedVideoTimeSeconds: 42.25,
    expectedActive: null,
    deps: h.deps,
    ...overrides,
  });
}

const blockPuts = (h: Harness) =>
  h.blocks.filter((b) => b.url.includes("comp=block&"));
const blockListPuts = (h: Harness) =>
  h.blocks.filter((b) => b.url.includes("comp=blocklist"));

/* -------------------------------------------------------------------------
 * Block sizing and concurrency
 * ---------------------------------------------------------------------- */

test("splits into 8 MiB blocks, the last one a remainder, and commits them in order", async () => {
  const h = harness();
  const result = await run(h);

  expect(result.ok).toBe(true);

  const puts = blockPuts(h);
  expect(puts).toHaveLength(3);
  const sizes = puts.map((p) => (p.body as Blob).size).sort((a, b) => b - a);
  expect(sizes).toEqual([
    ATTACHMENT_BLOCK_SIZE_BYTES,
    ATTACHMENT_BLOCK_SIZE_BYTES,
    4 * 1024 * 1024,
  ]);

  // Equal-length ids before base64, or Azure refuses the list.
  const ids = puts
    .map((p) => decodeURIComponent(new URL(p.url).searchParams.get("blockid")!))
    .map((id) => Buffer.from(id, "base64").toString("binary"));
  expect(ids.sort()).toEqual(["000000", "000001", "000002"]);

  const list = blockListPuts(h);
  expect(list).toHaveLength(1);
  // Final order is the block index order regardless of completion order.
  expect(list[0].body).toBe(
    '<?xml version="1.0" encoding="utf-8"?><BlockList>' +
      ["000000", "000001", "000002"]
        .map(
          (n) =>
            `<Latest>${Buffer.from(n, "binary").toString("base64")}</Latest>`,
        )
        .join("") +
      "</BlockList>",
  );
  // The blob's own content type is set exactly once, at commit, from the
  // selection — not from `File.type`, which is "" for this fixture.
  expect(list[0].headers?.["x-ms-blob-content-type"]).toBe("video/x-matroska");
});

test("never exceeds four concurrent block requests, and uses all four", async () => {
  const h = harness({
    onBlock: async () => {
      // Yield enough times that a sequential implementation could not reach a
      // peak above one, and a parallel one reliably reaches its cap.
      for (let i = 0; i < 5; i++) await Promise.resolve();
    },
  });

  // 12 blocks over a 4-wide pool.
  const result = await run(h, {
    selection: selectionOf(12 * ATTACHMENT_BLOCK_SIZE_BYTES),
  });

  expect(result.ok).toBe(true);
  expect(blockPuts(h)).toHaveLength(12);
  expect(h.peakConcurrency).toBe(ATTACHMENT_MAX_CONCURRENT_BLOCKS);
  expect(h.peakConcurrency).toBeLessThanOrEqual(
    ATTACHMENT_MAX_CONCURRENT_BLOCKS,
  );
});

test("a single-block file still commits a block list", async () => {
  const h = harness();
  const result = await run(h, { selection: selectionOf(1024) });

  expect(result.ok).toBe(true);
  expect(blockPuts(h)).toHaveLength(1);
  expect((blockPuts(h)[0].body as Blob).size).toBe(1024);
  expect(blockListPuts(h)).toHaveLength(1);
});

/* -------------------------------------------------------------------------
 * Progress
 * ---------------------------------------------------------------------- */

test("progress counts bytes actually transferred, including partial requests", async () => {
  const seen: AttachmentTransferProgress[] = [];
  const h = harness({
    onBlock: async (request) => {
      const size = (request.body as Blob).size ?? 0;
      if (size) {
        request.onProgress?.(size / 2);
        await Promise.resolve();
        request.onProgress?.(size);
      }
    },
  });

  const result = await run(h, { onProgress: (p) => seen.push(p) });
  expect(result.ok).toBe(true);

  const total = 20 * 1024 * 1024;
  const bytes = seen.map((p) => p.bytesTransferred);

  // Monotonic, byte-exact at the end, and never over the file's size.
  for (let i = 1; i < bytes.length; i++) {
    expect(bytes[i]).toBeGreaterThanOrEqual(bytes[i - 1]);
  }
  expect(Math.max(...bytes)).toBe(total);
  expect(seen.every((p) => p.totalBytes === total)).toBe(true);

  // Half-block granularity is visible, which block counting cannot produce:
  // 4 MiB is half of one 8 MiB block and no multiple of a whole one.
  expect(bytes).toContain(4 * 1024 * 1024);

  expect(seen[0].phase).toBe("reserving");
  expect(seen.at(-1)!.phase).toBe("committing");
});

test("a retried block cannot walk progress backwards", async () => {
  let attempts = 0;
  const seen: number[] = [];
  const h = harness({
    onBlock: async (request) => {
      const size = (request.body as Blob).size;
      if (size === ATTACHMENT_BLOCK_SIZE_BYTES && attempts++ === 0) {
        request.onProgress?.(size * 0.75);
        throw new BlockPutError("reset", null);
      }
      request.onProgress?.(size);
    },
  });

  const result = await run(h, {
    onProgress: (p) => seen.push(p.bytesTransferred),
  });

  expect(result.ok).toBe(true);
  for (let i = 1; i < seen.length; i++) {
    expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
  }
});

/* -------------------------------------------------------------------------
 * Bounded retries
 * ---------------------------------------------------------------------- */

test("a transient block failure is retried and succeeds", async () => {
  let failed = false;
  const h = harness({
    onBlock: () => {
      if (!failed) {
        failed = true;
        throw new BlockPutError("500", 500);
      }
    },
  });

  const result = await run(h);
  expect(result.ok).toBe(true);
  expect(blockPuts(h)).toHaveLength(4); // three blocks, one repeated
  expect(h.sleeps.length).toBeGreaterThan(0);
});

test("a permanently transient block stops after the attempt budget", async () => {
  const h = harness({
    onBlock: () => {
      throw new BlockPutError("gateway", 503);
    },
  });

  const result = await run(h, { selection: selectionOf(1024) });

  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.aborted).toBe(false);
  expect(result.error.code).toBe("storage_unavailable");
  expect(result.error.detail).toBe("block_status_503");
  // Exactly the budget — never an unbounded loop.
  expect(blockPuts(h)).toHaveLength(ATTACHMENT_MAX_BLOCK_ATTEMPTS);
});

test("a terminal block refusal is not retried at all", async () => {
  const h = harness({
    onBlock: () => {
      throw new BlockPutError("bad request", 400);
    },
  });

  const result = await run(h, { selection: selectionOf(1024) });

  expect(result.ok).toBe(false);
  expect(blockPuts(h)).toHaveLength(1);
});

test("a terminal server refusal on reserve is surfaced verbatim and never retried", async () => {
  const h = harness({
    reserve: () =>
      json(
        {
          error: "The video changed. Reload and try again.",
          code: "stale_attachment",
          detail: "expected_active_mismatch",
        },
        409,
      ),
  });

  const result = await run(h);

  expect(result.ok).toBe(false);
  if (result.ok) return;
  // Passed through, not re-derived from the status.
  expect(result.error.code).toBe("stale_attachment");
  expect(result.error.detail).toBe("expected_active_mismatch");
  expect(result.error.status).toBe(409);
  expect(h.calls.filter((c) => c.url.endsWith("/uploads"))).toHaveLength(1);
  expect(h.blocks).toHaveLength(0);
});

/* -------------------------------------------------------------------------
 * Reservation body
 * ---------------------------------------------------------------------- */

test("the reservation body is the selection, whole", async () => {
  const h = harness();
  await run(h, { expectedActive: { id: ATTACHMENT_ID, version: 3 } });

  const reserve = h.calls.find((c) => c.url.endsWith("/uploads"))!;
  expect(reserve.method).toBe("POST");
  expect(reserve.body).toEqual({
    filename: "match.mkv",
    sizeBytes: 20 * 1024 * 1024,
    // The selection's derived type, never the File's empty one.
    contentType: "video/x-matroska",
    clientRequestId: CLIENT_REQUEST_ID,
    expectedActive: { id: ATTACHMENT_ID, version: 3 },
  });
  // `null` is a claim, and an omitted key is not — so the key is always there.
  const withNull = harness();
  await run(withNull);
  expect(
    "expectedActive" in
      (withNull.calls.find((c) => c.url.endsWith("/uploads"))!.body as object),
  ).toBe(true);
});

/* -------------------------------------------------------------------------
 * Renewal
 * ---------------------------------------------------------------------- */

test("an expired write URL is renewed through the endpoint, never re-derived", async () => {
  let rejected = 0;
  const h = harness({
    onBlock: (request) => {
      if (request.url.startsWith(SAS_ONE) && rejected === 0) {
        rejected += 1;
        throw new BlockPutError("AuthenticationFailed", 403);
      }
    },
  });

  const result = await run(h, { selection: selectionOf(1024) });
  expect(result.ok).toBe(true);

  const renewals = h.calls.filter((c) => c.url.endsWith("/renew"));
  expect(renewals).toHaveLength(1);
  expect(renewals[0].method).toBe("POST");
  expect(renewals[0].url).toBe(`${UPLOADS}/${ATTACHMENT_ID}/renew`);
  // Renewal carries no metadata: there is no field a client may set.
  expect(renewals[0].body).toBeUndefined();

  // The retry uses the URL the SERVER returned. The module has no signer, so
  // a second signature can only have come from the endpoint.
  const retried = blockPuts(h).at(-1)!;
  expect(retried.url.startsWith(SAS_TWO)).toBe(true);
  expect(blockListPuts(h)[0].url.startsWith(SAS_TWO)).toBe(true);
});

test("a credential near expiry is renewed before the block goes out", async () => {
  // Reserved expiry minus the margin is already in the past for this clock.
  const h = harness({
    nowMs:
      Date.parse("2026-09-19T12:00:00.000Z") -
      ATTACHMENT_RENEW_MARGIN_MS +
      1_000,
  });

  const result = await run(h, { selection: selectionOf(1024) });

  expect(result.ok).toBe(true);
  expect(h.calls.filter((c) => c.url.endsWith("/renew"))).toHaveLength(1);
  // Proactive: no 403 was ever received, so nothing was wasted discovering it.
  expect(blockPuts(h)).toHaveLength(1);
  expect(blockPuts(h)[0].url.startsWith(SAS_TWO)).toBe(true);
});

test("four workers hitting an expired credential renew once between them", async () => {
  let rejected = 0;
  const h = harness({
    onBlock: async (request) => {
      if (request.url.startsWith(SAS_ONE)) {
        rejected += 1;
        // Let the siblings reach their own 403 before the first renewal
        // resolves, which is the race single-flight renewal exists for.
        for (let i = 0; i < 3; i++) await Promise.resolve();
        throw new BlockPutError("AuthenticationFailed", 403);
      }
    },
  });

  const result = await run(h, {
    selection: selectionOf(4 * ATTACHMENT_BLOCK_SIZE_BYTES),
  });

  expect(result.ok).toBe(true);
  expect(rejected).toBe(4);
  expect(h.calls.filter((c) => c.url.endsWith("/renew"))).toHaveLength(1);
});

test("a second 403 on a fresh credential is terminal, not a renewal loop", async () => {
  const h = harness({
    onBlock: () => {
      throw new BlockPutError("AuthenticationFailed", 403);
    },
  });

  const result = await run(h, { selection: selectionOf(1024) });

  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error.detail).toBe("block_status_403");
  expect(h.calls.filter((c) => c.url.endsWith("/renew"))).toHaveLength(1);
  expect(blockPuts(h)).toHaveLength(2);
});

/* -------------------------------------------------------------------------
 * Abort
 * ---------------------------------------------------------------------- */

test("abort stops the transfer and attempts cancellation", async () => {
  const controller = new AbortController();
  const h = harness({
    onBlock: (request) => {
      controller.abort();
      if (request.signal?.aborted) throw new TransferAborted();
    },
  });

  const result = await run(h, {
    signal: controller.signal,
    selection: selectionOf(12 * ATTACHMENT_BLOCK_SIZE_BYTES),
  });

  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.aborted).toBe(true);

  // The block list is never committed, so nothing is visible at the blob name.
  expect(blockListPuts(h)).toHaveLength(0);
  // Siblings stopped rather than pushing the rest of a file nobody will
  // publish: far fewer than the twelve blocks the file would need.
  expect(blockPuts(h).length).toBeLessThan(12);

  const cancels = h.calls.filter((c) => c.method === "DELETE");
  expect(cancels).toHaveLength(1);
  expect(cancels[0].url).toBe(`${UPLOADS}/${ATTACHMENT_ID}`);
  expect(cancels[0].body).toBeUndefined();
  // No completion was ever asked for.
  expect(h.calls.some((c) => c.url.endsWith("/complete"))).toBe(false);
});

test("a failed transfer also retires its attempt", async () => {
  const h = harness({
    onBlock: () => {
      throw new BlockPutError("bad request", 400);
    },
  });

  await run(h, { selection: selectionOf(1024) });
  expect(h.calls.filter((c) => c.method === "DELETE")).toHaveLength(1);
});

test("a committed attachment is never cancelled", async () => {
  const h = harness();
  const result = await run(h);

  expect(result.ok).toBe(true);
  expect(h.calls.filter((c) => c.method === "DELETE")).toHaveLength(0);
});

/* -------------------------------------------------------------------------
 * Completion polling
 * ---------------------------------------------------------------------- */

test("202 waits the advertised interval and replays the identical request", async () => {
  const h = harness({
    completions: [
      () =>
        json(
          {
            status: "pending",
            attachmentId: ATTACHMENT_ID,
            retryAfterSeconds: 2,
          },
          202,
          { "Retry-After": "2" },
        ),
      () =>
        json(
          {
            status: "pending",
            attachmentId: ATTACHMENT_ID,
            retryAfterSeconds: 2,
          },
          202,
          { "Retry-After": "2" },
        ),
      () => json({ status: "committed", attachment: COMMITTED }),
    ],
  });

  const result = await run(h);

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.attachment).toEqual(COMMITTED);

  const polls = h.calls.filter((c) => c.url.endsWith("/complete"));
  expect(polls).toHaveLength(3);
  // The SAME attachment and the SAME request, byte for byte.
  expect(new Set(polls.map((p) => p.url))).toEqual(
    new Set([`${UPLOADS}/${ATTACHMENT_ID}/complete`]),
  );
  expect(polls.map((p) => JSON.stringify(p.body))).toEqual([
    JSON.stringify({ confirmedVideoTimeSeconds: 42.25, expectedActive: null }),
    JSON.stringify({ confirmedVideoTimeSeconds: 42.25, expectedActive: null }),
    JSON.stringify({ confirmedVideoTimeSeconds: 42.25, expectedActive: null }),
  ]);
  // The server's two seconds, honoured.
  expect(h.sleeps.filter((ms) => ms === 2000)).toHaveLength(2);
});

test("polls are serialised — never two completions in flight", async () => {
  let live = 0;
  let peak = 0;
  const h = harness({
    completions: [
      async () => {
        live += 1;
        peak = Math.max(peak, live);
        for (let i = 0; i < 3; i++) await Promise.resolve();
        live -= 1;
        return json(
          {
            status: "pending",
            attachmentId: ATTACHMENT_ID,
            retryAfterSeconds: 2,
          },
          202,
        );
      },
      async () => {
        live += 1;
        peak = Math.max(peak, live);
        live -= 1;
        return json({ status: "committed", attachment: COMMITTED });
      },
    ],
  });

  await run(h);
  expect(peak).toBe(1);
});

test("a lost success response is recovered by replaying completion, never by re-uploading", async () => {
  const h = harness({
    completions: [
      // The publication committed; the 200 never came back.
      () => {
        throw new TypeError("Failed to fetch");
      },
      // The replay finds the already-active row and answers idempotently.
      () => json({ status: "committed", attachment: COMMITTED }),
    ],
  });

  const result = await run(h);

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.attachment).toEqual(COMMITTED);

  // THE POINT: one reservation, three block PUTs, one block list. The lost
  // response cost a second completion call and not a second upload.
  expect(h.calls.filter((c) => c.url.endsWith("/uploads"))).toHaveLength(1);
  expect(blockPuts(h)).toHaveLength(3);
  expect(blockListPuts(h)).toHaveLength(1);
  expect(h.calls.filter((c) => c.url.endsWith("/complete"))).toHaveLength(2);
});

test("409 finalizing waits for the other holder rather than failing", async () => {
  const h = harness({
    completions: [
      () =>
        json(
          {
            error:
              "Another video upload for this match is already in progress.",
            code: "pending_attempt_conflict",
            detail: "finalizing",
          },
          409,
        ),
      () => json({ status: "committed", attachment: COMMITTED }),
    ],
  });

  const result = await run(h);
  expect(result.ok).toBe(true);
  expect(h.calls.filter((c) => c.url.endsWith("/complete"))).toHaveLength(2);
});

test("completion transport failures are bounded", async () => {
  const h = harness({
    completions: [
      () => {
        throw new TypeError("Failed to fetch");
      },
    ],
  });

  const result = await run(h);

  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error.code).toBe("storage_unavailable");
  expect(result.error.detail).toBe("complete_network");
  expect(h.calls.filter((c) => c.url.endsWith("/complete"))).toHaveLength(
    ATTACHMENT_MAX_COMPLETION_TRANSIENT_ATTEMPTS + 1,
  );
});

test("a terminal completion refusal is surfaced and stops polling", async () => {
  const h = harness({
    completions: [
      () =>
        json(
          {
            error: "This video is not long enough.",
            code: "insufficient_coverage",
            detail: "video_ends_before_last_point",
          },
          422,
        ),
    ],
  });

  const result = await run(h);

  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error.code).toBe("insufficient_coverage");
  expect(result.error.message).toBe("This video is not long enough.");
  expect(h.calls.filter((c) => c.url.endsWith("/complete"))).toHaveLength(1);
});

/* -------------------------------------------------------------------------
 * Credentials stay in memory
 * ---------------------------------------------------------------------- */

test("the write credential never leaves memory", async () => {
  const stored: string[] = [];
  const store = () => ({
    getItem: () => null,
    setItem: (key: string, value: string) => stored.push(`${key}=${value}`),
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  });

  const globals = globalThis as Record<string, unknown>;
  const saved = {
    localStorage: globals.localStorage,
    sessionStorage: globals.sessionStorage,
    indexedDB: globals.indexedDB,
    document: globals.document,
  };
  const cookies: string[] = [];
  globals.localStorage = store();
  globals.sessionStorage = store();
  globals.indexedDB = {
    open: () => {
      throw new Error("indexedDB touched");
    },
  };
  globals.document = {
    set cookie(value: string) {
      cookies.push(value);
    },
    get cookie() {
      return "";
    },
  };

  const logged: string[] = [];
  const console_ = globalThis.console;
  const capture = (...args: unknown[]) =>
    logged.push(args.map((a) => String(a)).join(" "));
  globalThis.console = {
    ...console_,
    log: capture,
    warn: capture,
    error: capture,
    info: capture,
    debug: capture,
  } as Console;

  let result: Awaited<ReturnType<typeof transferAttachment>>;
  const h = harness({
    // Force a renewal too, so the SECOND signature is in play as well.
    onBlock: (request) => {
      if (request.url.startsWith(SAS_ONE)) {
        throw new BlockPutError("AuthenticationFailed", 403);
      }
    },
  });
  try {
    result = await run(h, { selection: selectionOf(1024) });
  } finally {
    globalThis.console = console_;
    globals.localStorage = saved.localStorage;
    globals.sessionStorage = saved.sessionStorage;
    globals.indexedDB = saved.indexedDB;
    globals.document = saved.document;
  }

  expect(result.ok).toBe(true);

  const signatures = ["FIRSTSIGNATUREAAA", "SECONDSIGNATUREBB", "sig="];
  const leaked = (haystack: string[]) =>
    haystack.filter((entry) => signatures.some((s) => entry.includes(s)));

  expect(stored, "a SAS was written to web storage").toEqual([]);
  expect(cookies, "a SAS was written to a cookie").toEqual([]);
  expect(leaked(logged), "a SAS was logged").toEqual([]);

  // Nor does it escape through the value handed back to the caller.
  expect(leaked([JSON.stringify(result)])).toEqual([]);

  // The credential reached exactly two places, both of them a request: the
  // Azure PUTs, and nothing else. No first-party call carries it.
  expect(
    leaked(h.calls.map((c) => `${c.url} ${JSON.stringify(c.body ?? null)}`)),
  ).toEqual([]);
  expect(h.blocks.every((b) => b.url.includes("sig="))).toBe(true);
});

test("the transport imports nothing that signs", async () => {
  // A structural guard beside the bundle-boundary spec: this module is handed
  // a credential and must never be able to build one. Only the import
  // specifiers are examined — the prose above them names the packages it is
  // avoiding, and a comment is not a dependency.
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(
    "src/components/dashboard/matches/match-video-attachment/attachment-upload.ts",
    "utf8",
  );
  const specifiers = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map(
    (m) => m[1],
  );
  expect(specifiers.length).toBeGreaterThan(0);
  for (const specifier of specifiers) {
    expect(specifier).not.toContain("@azure/");
    expect(specifier).not.toContain("services/match-video/");
    expect(specifier).not.toContain("supabase");
  }
  // No persistence API is reachable from here at all — the only mentions of
  // web storage in this file are the comment saying it is never used.
  expect(source).not.toMatch(/\b(localStorage|sessionStorage|indexedDB)\s*\./);
  expect(source).not.toMatch(/document\s*\.\s*cookie/);
});
