"use client";

/**
 * Browser transport for a SwingVision video attachment (plan step 13, the
 * transport half).
 *
 * This is a HELPER, not a flow. It is called once, by the orchestration step
 * (T20), AFTER the person has confirmed — never on file selection. The file
 * step (T17) deliberately issues no network request at all, and a transport
 * that started itself on selection would undo that: "checked" beside a 6 GB
 * file would quietly become "sent".
 *
 * One call carries one attempt from end to end:
 *
 *   1. reserve    POST   …/video/uploads                      (T8)
 *   2. transfer   PUT    {sas}&comp=block        × N, 4 at a time, to Azure
 *   3. commit     PUT    {sas}&comp=blocklist                  to Azure
 *   4. complete   POST   …/uploads/{id}/complete, polled       (T10)
 *
 * ── What the browser is NOT allowed to do ────────────────────────────────
 *
 * It never mints, extends, derives or stores a credential. The SAS lives in a
 * function-scoped variable for the life of one call and is handed to `fetch`
 * or `XMLHttpRequest` and to nothing else — not `localStorage`, not
 * `sessionStorage`, not IndexedDB, not a cookie, not the URL bar, and not a
 * log line. When the six-hour write window runs out, the fix is to ASK: T9's
 * renew endpoint, for this pending attempt, which re-checks the session, the
 * workspace and the row before it signs. A client-side "extend" would be a
 * credential the database has no record of, and the cleanup worker's whole
 * model is that `upload_sas_expires_at` is never behind a live SAS.
 *
 * Every log call here is deliberately shaped to carry the attachment id and
 * never the URL, because a SAS's `sig=` in a console is a credential in a
 * bug report.
 *
 * ── Why blocks, four at a time ───────────────────────────────────────────
 *
 * Azure's single-shot Put Blob caps far below the 8 GB an attachment may be,
 * so one PUT cannot carry the largest legal file. Blocks also make one network
 * blip cost one block rather than an hour. Four concurrent requests is the
 * point where a single TCP stream's cwnd/RTT ceiling stops being the limit;
 * the vendor path next door (`lib/services/upload/azure-block-upload.ts`) is
 * sequential only because it was proven end-to-end in that shape and nobody
 * re-ran the 5 GB test.
 *
 * Nothing is visible at the blob name until the block list commits, so an
 * abandoned transfer leaves uncommitted blocks Azure collects on its own —
 * never a corrupt half-video.
 *
 * ── Progress is bytes, not blocks ────────────────────────────────────────
 *
 * With four blocks in flight, "blocks finished / blocks total" jumps in
 * quarters and sits still in between. What is reported instead is the sum of
 * completed block sizes plus each in-flight request's own `loaded` count,
 * clamped with `Math.max` so a retried block can never walk the bar backwards.
 * That is also why the default block PUT is `XMLHttpRequest`: `fetch` still
 * has no upload-progress event.
 *
 * ── A lost success must never re-upload ──────────────────────────────────
 *
 * Completion is asynchronous (the publication is an Azure server-side copy),
 * so T10 answers 202 with an interval while the copy runs. The client's
 * contract is to REPLAY THE SAME REQUEST against the SAME attachment — which
 * is exactly what makes a lost 200 recoverable: `begin_finalization` returns
 * the already-active row and `activate_attachment` answers `reused` for the
 * same confirmed time. So a network failure during completion retries the
 * COMPLETION, never the upload. Re-uploading would reserve a second attempt
 * and publish a second copy of a video that is already the match's.
 *
 * Polls are strictly serialised — one in flight, ever. T10 answers a second
 * concurrent poll for one attempt with 409 `pending_attempt_conflict` /
 * `finalizing`, and that refusal is meant for another tab, not for a client
 * racing itself.
 *
 * ── Client bundle ────────────────────────────────────────────────────────
 *
 * Imports only the pure contracts in `lib/match-video/`. `@azure/storage-blob`
 * exists to BUILD a credential and this code is handed one, so it needs no
 * SDK; the storage adapter, the probe and the service modules that reach them
 * are server-only and asserted so by `tests/client-bundle-boundary.spec.ts`.
 */

import { COMPLETION_RETRY_SECONDS } from "@/lib/match-video/limits";
import {
  matchVideoError,
  type ActiveAttachment,
  type CompleteUploadRequest,
  type CompleteUploadResult,
  type ExpectedActiveAttachment,
  type ReserveUploadRequest,
  type ReserveUploadResult,
} from "@/lib/match-video/types";

import type { AttachmentSelection } from "./use-attachment-file";

/* -------------------------------------------------------------------------
 * Bounds
 * ---------------------------------------------------------------------- */

/** Bytes per block. The plan's number, and the vendor path's. */
export const ATTACHMENT_BLOCK_SIZE_BYTES = 8 * 1024 * 1024;

/** Azure's hard ceiling on blocks in one blob. The block size grows to respect it. */
const AZURE_MAX_BLOCKS = 50_000;

/** Concurrent Azure requests. The plan's number; never exceeded. */
export const ATTACHMENT_MAX_CONCURRENT_BLOCKS = 4;

/**
 * Attempts per block, including the first.
 *
 * Bounded because an unbounded retry against a genuinely broken link is a
 * progress bar that never finishes and never fails — the worst of both. Only
 * TRANSIENT failures consume an attempt; a terminal refusal ends the transfer
 * on the spot.
 */
export const ATTACHMENT_MAX_BLOCK_ATTEMPTS = 4;

/** Attempts for one call to a first-party endpoint (reserve, renew, cancel). */
export const ATTACHMENT_MAX_REQUEST_ATTEMPTS = 3;

/**
 * Consecutive transport failures tolerated while polling completion.
 *
 * Separate from the block budget, and deliberately larger: this is the window
 * in which a lost 200 is recovered, and giving up here is what would send a
 * caller back to re-upload a video that is already published.
 */
export const ATTACHMENT_MAX_COMPLETION_TRANSIENT_ATTEMPTS = 6;

/** Hard ceiling on completion polls, so a stuck copy cannot poll forever. */
export const ATTACHMENT_MAX_COMPLETION_POLLS = 900;

/** Bounds on the retry interval a 202 may ask for, in seconds. */
const COMPLETION_RETRY_MIN_SECONDS = 0.5;
const COMPLETION_RETRY_MAX_SECONDS = 30;

/**
 * How close to expiry a credential may get before the next block renews it.
 *
 * A block is at most 8 MiB, so this is generous by orders of magnitude; the
 * margin exists so that a slow link never posts a block against a SAS that
 * expires mid-flight, which Azure reports as an indistinguishable 403.
 */
export const ATTACHMENT_RENEW_MARGIN_MS = 5 * 60_000;

/** Backoff before retrying a transient failure, in milliseconds. */
function backoffMs(attempt: number): number {
  return Math.min(8_000, 500 * 2 ** (attempt - 1));
}

/* -------------------------------------------------------------------------
 * Result and error shapes
 * ---------------------------------------------------------------------- */

/**
 * A refusal, as the caller sees it.
 *
 * `code` is either one of T1's `MatchVideoErrorCode`s or one of the four
 * transport codes the route edge answers with (`invalid_request`,
 * `cross_origin`, `request_too_large`, `internal_error`). Both are PASSED
 * THROUGH from the server response rather than re-derived here: a client that
 * re-invents a code from a status invents a disagreement with the server the
 * first time one of them changes. Locally-originated failures use
 * `matchVideoError`, so they can only ever carry a real code.
 */
export interface AttachmentTransferError {
  code: string;
  status: number;
  message: string;
  /** Machine slug for logs and tests. Never rendered. */
  detail: string;
}

export type AttachmentTransferPhase = "reserving" | "uploading" | "committing";

export interface AttachmentTransferProgress {
  phase: AttachmentTransferPhase;
  /** Bytes Azure has actually accepted, including the requests in flight. */
  bytesTransferred: number;
  totalBytes: number;
}

export type AttachmentTransferResult =
  | { ok: true; attachment: ActiveAttachment }
  | { ok: false; aborted: boolean; error: AttachmentTransferError };

/* -------------------------------------------------------------------------
 * Seams
 * ---------------------------------------------------------------------- */

/** One PUT to Azure. Rejects with {@link BlockPutError} or {@link TransferAborted}. */
export interface BlockPutRequest {
  url: string;
  body: Blob | string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Bytes of THIS request the browser has handed to the socket so far. */
  onProgress?: (loadedBytes: number) => void;
}

export interface AttachmentTransferDeps {
  fetch: typeof fetch;
  putBlock(request: BlockPutRequest): Promise<void>;
  now(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
  randomUUID(): string;
}

export interface AttachmentTransferOptions {
  matchId: string;
  /**
   * The verified selection, WHOLE.
   *
   * Not a filename plus a size plus a type teased back out of it: this object
   * already carries the exact three the reservation body wants, and the
   * content type in particular was derived from the validated extension
   * precisely because the browser's own `File.type` is `""` for `.mkv` and
   * arrives with codec parameters from some tools — either of which the
   * endpoint refuses as `content_type_format`. Re-deriving any of the three
   * here would open that bug from the other side.
   */
  selection: AttachmentSelection;
  confirmedVideoTimeSeconds: number;
  /** The caller's belief. `null` is a claim; see `ExpectedActiveAttachment`. */
  expectedActive: ExpectedActiveAttachment | null;
  /**
   * Stable across retries of one logical attempt, so a reservation whose
   * response was lost is FOUND again rather than duplicated. Generated when
   * omitted; a caller that may retry the whole helper should supply its own.
   */
  clientRequestId?: string;
  signal?: AbortSignal;
  onProgress?: (progress: AttachmentTransferProgress) => void;
  /** Test seam. Production passes nothing. */
  deps?: Partial<AttachmentTransferDeps>;
}

/* -------------------------------------------------------------------------
 * Errors used internally
 * ---------------------------------------------------------------------- */

/** The signal fired. Distinct so it is never mistaken for a failure to retry. */
export class TransferAborted extends Error {
  constructor() {
    super("Upload cancelled");
    this.name = "TransferAborted";
  }
}

/** A failed Azure PUT. `status` is null when no response arrived at all. */
export class BlockPutError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null) {
    super(message);
    this.name = "BlockPutError";
    this.status = status;
  }
}

/** A refusal carried out of a helper by throwing. */
class TransferFailure extends Error {
  readonly failure: AttachmentTransferError;
  constructor(failure: AttachmentTransferError) {
    super(failure.message);
    this.name = "TransferFailure";
    this.failure = failure;
  }
}

function localError(
  code: Parameters<typeof matchVideoError>[0],
  detail: string,
): AttachmentTransferError {
  return matchVideoError(code, detail);
}

/**
 * Whether a failed attempt is worth repeating.
 *
 * `null` means no response arrived — a dropped connection, the case retries
 * exist for. 403 is almost always an expired SAS and is handled by renewing
 * rather than by repeating; every other 4xx is an answer, and asking again
 * spends the budget arriving at it a second time.
 */
function isTransientStatus(status: number | null): boolean {
  if (status === null) return true;
  return status === 408 || status === 429 || status >= 500;
}

/* -------------------------------------------------------------------------
 * Default seams
 * ---------------------------------------------------------------------- */

/**
 * One PUT over `XMLHttpRequest`.
 *
 * XHR and not `fetch` for one reason: `fetch` reports no upload progress, and
 * progress on a multi-gigabyte attachment is not decoration — a bar that sits
 * at 25% for eleven minutes is indistinguishable from one that has died.
 *
 * Referenced only when this default is actually called, so the module imports
 * cleanly in a non-browser test runner.
 */
function xhrPutBlock({
  url,
  body,
  headers,
  signal,
  onProgress,
}: BlockPutRequest): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new TransferAborted());
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    for (const [name, value] of Object.entries(headers ?? {})) {
      xhr.setRequestHeader(name, value);
    }

    const onAbort = () => xhr.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const detach = () => signal?.removeEventListener("abort", onAbort);

    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(event.loaded);
      };
    }

    xhr.onload = () => {
      detach();
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      // Azure's machine-readable code is the part worth surfacing:
      // AuthenticationFailed on an expired SAS, BlobNotFound, and so on. The
      // URL is never included — it carries `sig=`.
      const code = xhr.getResponseHeader("x-ms-error-code");
      reject(
        new BlockPutError(
          `Azure returned ${xhr.status}${code ? ` (${code})` : ""}`,
          xhr.status,
        ),
      );
    };

    xhr.onerror = () => {
      detach();
      // Deliberately names CORS: a browser reports a blocked cross-origin PUT
      // as an indistinguishable network failure, and a missing CORS rule on
      // the storage account is by far the likeliest cause of one here.
      reject(
        new BlockPutError(
          "Network error uploading to storage. If this is a new storage " +
            "account, check the CORS rule on the blob service.",
          null,
        ),
      );
    };

    xhr.onabort = () => {
      detach();
      reject(new TransferAborted());
    };

    xhr.send(body);
  });
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function resolveDeps(
  overrides: Partial<AttachmentTransferDeps> | undefined,
): AttachmentTransferDeps {
  return {
    fetch: overrides?.fetch ?? ((...args) => globalThis.fetch(...args)),
    putBlock: overrides?.putBlock ?? xhrPutBlock,
    now: overrides?.now ?? (() => Date.now()),
    sleep: overrides?.sleep ?? defaultSleep,
    randomUUID: overrides?.randomUUID ?? (() => globalThis.crypto.randomUUID()),
  };
}

/* -------------------------------------------------------------------------
 * First-party requests
 * ---------------------------------------------------------------------- */

/**
 * Why no `Origin` header is set here: a page cannot set one, and that is the
 * point. `http.ts` refuses a mutation without it precisely because a browser
 * always attaches it to a `fetch` and a non-browser client does not. The JSON
 * content type is set on every mutation — including the two with no body —
 * because that is what makes the request one a browser preflights, which is
 * the other half of the same-origin story.
 */
const JSON_HEADERS = { "Content-Type": "application/json" } as const;

/** Never `omit`: these routes are cookie-authenticated. */
const REQUEST_INIT = { credentials: "same-origin" } as const;

async function readErrorBody(
  response: Response,
  fallbackDetail: string,
): Promise<AttachmentTransferError> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object") {
      const shape = body as Record<string, unknown>;
      if (typeof shape.code === "string" && typeof shape.error === "string") {
        return {
          code: shape.code,
          status: response.status,
          message: shape.error,
          detail:
            typeof shape.detail === "string" ? shape.detail : fallbackDetail,
        };
      }
    }
  } catch {
    // A refusal that is not JSON is a proxy or an edge, not one of ours.
  }
  return {
    // `internal_error` is the route edge's own code for "a bug on this side";
    // an unreadable refusal is indistinguishable from one from here.
    code: "internal_error",
    status: response.status,
    message: "Something went wrong on our side. Try again in a moment.",
    detail: fallbackDetail,
  };
}

/**
 * One first-party call with bounded transient retries.
 *
 * A thrown `fetch` (offline, DNS, reset) and a 408/429/5xx are transient and
 * consume an attempt; anything else is the answer. `TransferAborted` is never
 * retried — it IS the answer.
 */
async function requestJson<T>(
  deps: AttachmentTransferDeps,
  signal: AbortSignal,
  url: string,
  init: RequestInit,
  detailPrefix: string,
  maxAttempts = ATTACHMENT_MAX_REQUEST_ATTEMPTS,
): Promise<{ value: T; status: number }> {
  let lastTransient: AttachmentTransferError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal.aborted) throw new TransferAborted();

    let response: Response;
    try {
      response = await deps.fetch(url, { ...REQUEST_INIT, ...init, signal });
    } catch (cause) {
      if (signal.aborted) throw new TransferAborted();
      lastTransient = localError(
        "storage_unavailable",
        `${detailPrefix}_network`,
      );
      if (attempt === maxAttempts) break;
      await deps.sleep(backoffMs(attempt), signal);
      continue;
    }

    if (response.ok) {
      try {
        return { value: (await response.json()) as T, status: response.status };
      } catch {
        throw new TransferFailure(
          localError("storage_unavailable", `${detailPrefix}_malformed`),
        );
      }
    }

    const failure = await readErrorBody(
      response,
      `${detailPrefix}_${response.status}`,
    );
    if (!isTransientStatus(response.status)) throw new TransferFailure(failure);

    lastTransient = failure;
    if (attempt === maxAttempts) break;
    await deps.sleep(backoffMs(attempt), signal);
  }

  throw new TransferFailure(
    lastTransient ?? localError("storage_unavailable", `${detailPrefix}_spent`),
  );
}

/* -------------------------------------------------------------------------
 * Block ids
 * ---------------------------------------------------------------------- */

/**
 * Block ids must be equal-length before base64 encoding or Azure refuses the
 * block list. Six digits covers 999,999 blocks — twenty times the ceiling —
 * so the width never has to change with file size.
 */
function blockIdFor(index: number): string {
  const padded = String(index).padStart(6, "0");
  return typeof btoa === "function"
    ? btoa(padded)
    : Buffer.from(padded, "binary").toString("base64");
}

/* -------------------------------------------------------------------------
 * The transport
 * ---------------------------------------------------------------------- */

/**
 * Carry a confirmed selection to storage and publish it.
 *
 * Resolves with the committed attachment, or with a refusal. It does NOT
 * throw for an expected failure: every branch a caller must render is a
 * value, and `aborted` is separated from `error` because a cancellation is an
 * answer rather than something to apologise for.
 */
export async function transferAttachment(
  options: AttachmentTransferOptions,
): Promise<AttachmentTransferResult> {
  const {
    matchId,
    selection,
    confirmedVideoTimeSeconds,
    expectedActive,
    signal: externalSignal,
    onProgress,
  } = options;
  const deps = resolveDeps(options.deps);

  // One controller for the whole transfer: the caller's cancellation and a
  // sibling worker's failure both have to stop the other three requests, and
  // a worker that keeps pushing blocks after the transfer has failed is bytes
  // spent on a file nobody will publish.
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else
      externalSignal.addEventListener("abort", onExternalAbort, {
        once: true,
      });
  }
  const signal = controller.signal;
  const wasCancelled = () => externalSignal?.aborted === true;

  const base = `/api/matches/${encodeURIComponent(matchId)}/video/uploads`;
  const totalBytes = selection.sizeBytes;

  /**
   * THE CREDENTIAL. A local, for one call, and the only copy that exists in
   * this tab. It is read by `blockUrl` and by nothing else; when the function
   * returns, it is unreachable.
   */
  let uploadUrl: string | null = null;
  let uploadExpiresAtMs = 0;
  /** Bumped on every renewal, so a worker cannot renew a credential twice. */
  let credentialEpoch = 0;

  let attachmentId: string | null = null;
  /** Set once completion commits, so abort cannot cancel a published video. */
  let committed = false;

  let reportedBytes = 0;
  const report = (phase: AttachmentTransferPhase, bytes: number) => {
    // Monotonic: a retried block re-reports from zero, and a bar that walks
    // backwards reads as data loss.
    reportedBytes = Math.max(reportedBytes, bytes);
    onProgress?.({ phase, bytesTransferred: reportedBytes, totalBytes });
  };

  try {
    /* ---- 1. Reserve ------------------------------------------------- */

    report("reserving", 0);

    const reserveBody: ReserveUploadRequest = {
      // Straight off the selection. See the option's own note.
      filename: selection.filename,
      sizeBytes: selection.sizeBytes,
      contentType: selection.contentType,
      clientRequestId: options.clientRequestId ?? deps.randomUUID(),
      expectedActive,
    };

    const reserved = await requestJson<ReserveUploadResult>(
      deps,
      signal,
      base,
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(reserveBody),
      },
      "reserve",
    );

    attachmentId = reserved.value.attachmentId;
    uploadUrl = reserved.value.uploadUrl;
    uploadExpiresAtMs = Date.parse(reserved.value.uploadExpiresAt);

    /* ---- 2. Renewal, asked for and never invented -------------------- */

    let renewalInFlight: Promise<void> | null = null;

    const renewCredential = async (): Promise<void> => {
      if (renewalInFlight) {
        await renewalInFlight;
        return;
      }
      const run = (async () => {
        const renewed = await requestJson<{
          attachmentId: string;
          uploadUrl: string;
          uploadExpiresAt: string;
        }>(
          deps,
          signal,
          `${base}/${encodeURIComponent(attachmentId!)}/renew`,
          // No body at all: `readNoMetadataBody` accepts an absent one and
          // refuses any key, because renewal has no field a client may set.
          { method: "POST", headers: JSON_HEADERS },
          "renew",
        );
        uploadUrl = renewed.value.uploadUrl;
        uploadExpiresAtMs = Date.parse(renewed.value.uploadExpiresAt);
        credentialEpoch += 1;
      })();
      renewalInFlight = run;
      try {
        await run;
      } finally {
        renewalInFlight = null;
      }
    };

    /** Renew before a block goes out if the window is closing. */
    const freshCredential = async (): Promise<string> => {
      if (
        Number.isFinite(uploadExpiresAtMs) &&
        uploadExpiresAtMs - deps.now() < ATTACHMENT_RENEW_MARGIN_MS
      ) {
        await renewCredential();
      }
      return uploadUrl!;
    };

    /* ---- 3. Transfer ------------------------------------------------- */

    // Grow the block size rather than exceed Azure's block ceiling. At 8 MiB
    // that ceiling is ~390 GB, far above the 8 GB cap, so this only matters
    // if the cap is ever raised.
    const blockSize = Math.max(
      ATTACHMENT_BLOCK_SIZE_BYTES,
      Math.ceil(totalBytes / AZURE_MAX_BLOCKS),
    );
    const blockCount = Math.max(1, Math.ceil(totalBytes / blockSize));

    let completedBytes = 0;
    const inFlight = new Map<number, number>();
    const emitUploadProgress = () => {
      let live = 0;
      for (const loaded of inFlight.values()) live += loaded;
      report("uploading", Math.min(totalBytes, completedBytes + live));
    };
    emitUploadProgress();

    const putOnce = async (
      index: number,
      start: number,
      end: number,
    ): Promise<void> => {
      let renewedForThisBlock = false;

      for (let attempt = 1; ; attempt++) {
        if (signal.aborted) throw new TransferAborted();

        const epoch = credentialEpoch;
        const url = await freshCredential();
        inFlight.set(index, 0);

        try {
          await deps.putBlock({
            url: `${url}&comp=block&blockid=${encodeURIComponent(
              blockIdFor(index),
            )}`,
            // No third argument to `slice`, so the chunk carries no type and
            // no Content-Type goes out. The blob's type is set once, at
            // commit.
            body: selection.file.slice(start, end),
            signal,
            onProgress: (loaded) => {
              inFlight.set(index, Math.min(loaded, end - start));
              emitUploadProgress();
            },
          });
          inFlight.delete(index);
          completedBytes += end - start;
          emitUploadProgress();
          return;
        } catch (cause) {
          inFlight.delete(index);
          emitUploadProgress();
          if (cause instanceof TransferAborted || signal.aborted) {
            throw new TransferAborted();
          }
          const status = cause instanceof BlockPutError ? cause.status : null;

          // 403 is an expired or revoked SAS. The answer is to ASK for a new
          // one — once per block, so a credential that is refused twice is a
          // refusal rather than a loop. If another worker already renewed
          // while this request was in flight, retry on theirs instead of
          // asking for a third.
          if (status === 403 && !renewedForThisBlock) {
            renewedForThisBlock = true;
            if (epoch === credentialEpoch) await renewCredential();
            continue;
          }

          if (
            !isTransientStatus(status) ||
            attempt >= ATTACHMENT_MAX_BLOCK_ATTEMPTS
          ) {
            throw new TransferFailure(
              localError(
                "storage_unavailable",
                status === null ? "block_network" : `block_status_${status}`,
              ),
            );
          }
          await deps.sleep(backoffMs(attempt), signal);
        }
      }
    };

    let nextIndex = 0;
    const worker = async (): Promise<void> => {
      for (;;) {
        if (signal.aborted) throw new TransferAborted();
        const index = nextIndex++;
        if (index >= blockCount) return;
        const start = index * blockSize;
        const end = Math.min(start + blockSize, totalBytes);
        try {
          await putOnce(index, start, end);
        } catch (cause) {
          // Stop the siblings: the transfer is over either way, and three
          // more blocks of a file nobody will publish is pure waste.
          controller.abort();
          throw cause;
        }
      }
    };

    const settled = await Promise.allSettled(
      Array.from(
        { length: Math.min(ATTACHMENT_MAX_CONCURRENT_BLOCKS, blockCount) },
        () => worker(),
      ),
    );
    for (const outcome of settled) {
      if (outcome.status === "rejected") throw outcome.reason;
    }

    /* ---- 4. Commit the block list ------------------------------------ */

    report("committing", totalBytes);

    for (let attempt = 1; ; attempt++) {
      if (signal.aborted) throw new TransferAborted();
      const epoch = credentialEpoch;
      const url = await freshCredential();
      const blockList =
        '<?xml version="1.0" encoding="utf-8"?><BlockList>' +
        Array.from(
          { length: blockCount },
          (_unused, index) => `<Latest>${blockIdFor(index)}</Latest>`,
        ).join("") +
        "</BlockList>";
      try {
        await deps.putBlock({
          url: `${url}&comp=blocklist`,
          body: blockList,
          headers: {
            "Content-Type": "application/xml",
            // The one place the blob's own content type is set. Without it
            // Azure stores application/octet-stream and the server's probe
            // sees a type that disagrees with the bytes.
            "x-ms-blob-content-type": selection.contentType,
          },
          signal,
        });
        break;
      } catch (cause) {
        if (cause instanceof TransferAborted || signal.aborted) {
          throw new TransferAborted();
        }
        const status = cause instanceof BlockPutError ? cause.status : null;
        if (status === 403 && attempt === 1) {
          if (epoch === credentialEpoch) await renewCredential();
          continue;
        }
        if (
          !isTransientStatus(status) ||
          attempt >= ATTACHMENT_MAX_BLOCK_ATTEMPTS
        ) {
          throw new TransferFailure(
            localError(
              "storage_unavailable",
              status === null ? "commit_network" : `commit_status_${status}`,
            ),
          );
        }
        await deps.sleep(backoffMs(attempt), signal);
      }
    }

    // The bytes are at the staged key and the credential has no further use.
    // Completion is a first-party, cookie-authenticated call.
    uploadUrl = null;

    /* ---- 5. Complete, polled, one at a time -------------------------- */

    const completeBody: Omit<CompleteUploadRequest, "attachmentId"> = {
      confirmedVideoTimeSeconds,
      expectedActive,
    };
    // Serialised into ONE string, built once. Every poll sends byte-identical
    // bytes, which is what "replay the same request" means: T10 freezes the
    // confirmed time and the expected-active belief on the first call, and a
    // poll that differed would be a different request wearing the same name.
    const completePayload = JSON.stringify(completeBody);
    const completeUrl = `${base}/${encodeURIComponent(attachmentId)}/complete`;

    let transientPolls = 0;

    for (let poll = 1; poll <= ATTACHMENT_MAX_COMPLETION_POLLS; poll++) {
      // Cancellation stops polling but NOT the copy already running inside
      // Azure; the cancel below is what retires the row, and the cleanup
      // worker covers a cancel that never arrives.
      if (signal.aborted) throw new TransferAborted();

      let response: Response;
      try {
        response = await deps.fetch(completeUrl, {
          ...REQUEST_INIT,
          method: "POST",
          headers: JSON_HEADERS,
          body: completePayload,
          signal,
        });
      } catch {
        if (signal.aborted) throw new TransferAborted();
        // THE LOST SUCCESS. A completion whose response never arrived may
        // already have committed, so the recovery is to ask the SAME question
        // again — never to reserve a second attempt and re-upload. T10 answers
        // an already-active row idempotently.
        transientPolls += 1;
        if (transientPolls > ATTACHMENT_MAX_COMPLETION_TRANSIENT_ATTEMPTS) {
          throw new TransferFailure(
            localError("storage_unavailable", "complete_network"),
          );
        }
        await deps.sleep(backoffMs(transientPolls), signal);
        continue;
      }

      if (response.ok) {
        transientPolls = 0;
        let result: CompleteUploadResult;
        try {
          result = (await response.json()) as CompleteUploadResult;
        } catch {
          throw new TransferFailure(
            localError("storage_unavailable", "complete_malformed"),
          );
        }
        if (result.status === "committed") {
          committed = true;
          report("committing", totalBytes);
          return { ok: true, attachment: result.attachment };
        }
        // 202: the copy is still running inside Azure. Wait the interval the
        // server advertised — it, not this module, knows what the copy costs.
        await deps.sleep(
          retryDelayMs(result.retryAfterSeconds, response),
          signal,
        );
        continue;
      }

      const failure = await readErrorBody(
        response,
        `complete_${response.status}`,
      );

      // 409 `finalizing` means ANOTHER holder — a second tab — has the lease.
      // This module never races itself (one poll in flight, ever), so the
      // right move is to wait it out rather than fail a publication that is
      // very likely about to succeed.
      if (
        response.status === 409 &&
        failure.code === "pending_attempt_conflict" &&
        failure.detail === "finalizing"
      ) {
        transientPolls += 1;
        if (transientPolls > ATTACHMENT_MAX_COMPLETION_TRANSIENT_ATTEMPTS) {
          throw new TransferFailure(failure);
        }
        await deps.sleep(retryDelayMs(undefined, response), signal);
        continue;
      }

      if (isTransientStatus(response.status)) {
        transientPolls += 1;
        if (transientPolls > ATTACHMENT_MAX_COMPLETION_TRANSIENT_ATTEMPTS) {
          throw new TransferFailure(failure);
        }
        await deps.sleep(backoffMs(transientPolls), signal);
        continue;
      }

      throw new TransferFailure(failure);
    }

    throw new TransferFailure(
      localError("storage_unavailable", "complete_polls_exhausted"),
    );
  } catch (cause) {
    const aborted = cause instanceof TransferAborted || wasCancelled();

    // Best effort, and only ever for an attempt that did not publish. A
    // cancellation that never arrives is not a leak: T3 retires nothing here,
    // the attempt simply sits pending until its SAS expires and the cleanup
    // worker (T14) collects it. This is the fast path, never the only one.
    if (attachmentId && !committed) {
      await cancelAttempt(deps, base, attachmentId);
    }

    if (aborted) {
      return {
        ok: false,
        aborted: true,
        error: localError("storage_unavailable", "aborted"),
      };
    }
    if (cause instanceof TransferFailure) {
      return { ok: false, aborted: false, error: cause.failure };
    }
    return {
      ok: false,
      aborted: false,
      error: localError("storage_unavailable", "transfer_failed"),
    };
  } finally {
    externalSignal?.removeEventListener("abort", onExternalAbort);
    uploadUrl = null;
    uploadExpiresAtMs = 0;
  }
}

/**
 * The interval a 202 asked for, clamped.
 *
 * The body's `retryAfterSeconds` is preferred over the header because it is
 * the contract's field; the header is the same number for an intermediary's
 * benefit. Clamped because an interval a proxy rewrote to zero would turn
 * polling into a spin, and one rewritten to an hour would strand the wizard.
 */
function retryDelayMs(
  advertised: number | undefined,
  response: Response,
): number {
  const header = Number(response.headers.get("retry-after"));
  const seconds =
    typeof advertised === "number" && Number.isFinite(advertised)
      ? advertised
      : Number.isFinite(header) && header > 0
        ? header
        : COMPLETION_RETRY_SECONDS;
  return (
    Math.min(
      COMPLETION_RETRY_MAX_SECONDS,
      Math.max(COMPLETION_RETRY_MIN_SECONDS, seconds),
    ) * 1000
  );
}

/**
 * Retire this attempt, best effort.
 *
 * Deliberately given NO signal: the common caller is a cancellation, and
 * handing it the signal that just fired would abort the very request meant to
 * clean up after it. T3's cancel is idempotent, so a duplicate is harmless,
 * and a failure here is swallowed — the cleanup worker is the durable path
 * and a second error on top of the first one helps nobody.
 */
async function cancelAttempt(
  deps: AttachmentTransferDeps,
  base: string,
  attachmentId: string,
): Promise<void> {
  try {
    await deps.fetch(`${base}/${encodeURIComponent(attachmentId)}`, {
      ...REQUEST_INIT,
      method: "DELETE",
      headers: JSON_HEADERS,
    });
  } catch {
    // Durable cleanup covers a cancellation that never arrived.
  }
}
