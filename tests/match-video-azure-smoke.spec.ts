import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { loadedEnv } from "./fixtures/live-db";

import {
  AZURE_STORAGE_ENV_VARS,
  resolveAzureStorageConfig,
  videoContainerClient,
} from "@/lib/services/splitstep/video-url/azure-sas";
import {
  abortPublication,
  beginPublication,
  checkPublishedMetadata,
  deleteAttachmentBlob,
  inspectAttachmentBlob,
  inspectPublication,
  mintAttachmentPlaybackCredential,
  mintAttachmentUploadCredential,
  type AttachmentStorageRow,
  type PublicationState,
} from "@/lib/services/match-video/storage";
import {
  probeStoredVideo,
  publishedBlobOf,
  stagedBlobOf,
} from "@/lib/services/match-video/probe";
import {
  bufferByteSource,
  inspectMedia,
} from "@/lib/match-video/media-inspection";

/**
 * Controlled Azure smoke test (plan step 17 / T27).
 *
 * Every other storage spec in this directory drives `storage.ts` and
 * `probe.ts` through an in-memory fake of Azure. This one drives the SAME
 * production functions against the real storage account named in
 * `.env.local`, with isolated 15 KB fixtures, to prove the five things the
 * fakes cannot:
 *
 *   1. **Direct upload.** A `cw` credential minted by
 *      `mintAttachmentUploadCredential` accepts Put Block + Put Block List on
 *      the staged key — the exact wire format the browser transport sends —
 *      and is refused on the final key and for reads.
 *   2. **Conditional publication.** `beginPublication` lands the staged bytes
 *      at the final key through a copy conditioned on the ETag the probe
 *      measured; a staged object that changed since is refused with nothing
 *      at the final key, and an object already at the final key that is not
 *      this row's copy is left byte-for-byte alone.
 *   3. **Authorized playback.** The `r` credential serves ranges of the final
 *      key only; the object is not readable without it and not writable with it.
 *   4. **Replacement.** A second attachment publishes beside the first, and
 *      the first's tracked objects are collected through the worker's own
 *      delete seam while the replacement stays playable.
 *   5. **Tracked-object cleanup.** Everything this run created under its own
 *      `match-video/<random match id>/` prefixes is enumerated before and
 *      after collection: nothing untracked appears, nothing survives.
 *
 * Isolation: the match and attachment ids are fresh UUIDs, so the prefixes
 * cannot collide with any athlete's video, and the run never lists, reads or
 * deletes outside those prefixes. The database is not involved — the keys are
 * built with T3's exact layout so the storage side is the one under test.
 *
 * Skips, with the reason, when the three `AZURE_STORAGE_*` variables are not
 * available; a skip here means the criterion is UNVERIFIED, never passed.
 */

// Same lookup the live-DB specs use: process env first, then `.env.local`.
for (const name of AZURE_STORAGE_ENV_VARS) {
  const value = loadedEnv(name);
  if (value && !process.env[name]) process.env[name] = value;
}
const AZURE = resolveAzureStorageConfig();
const HAVE_AZURE = AZURE.ok;
const AZURE_SKIP_REASON = AZURE.ok
  ? ""
  : `${AZURE.missing} not set — the Azure smoke test cannot run here`;

const FIXTURES = resolve("tests/fixtures/match-video");
const CLIP_A = readFileSync(join(FIXTURES, "h264-faststart.mp4"));
const CLIP_B = readFileSync(join(FIXTURES, "h264.mov"));

/** Every key this run may have written, so afterAll can prove none survive. */
const tracked = new Set<string>();
/** Every match prefix this run used, so afterAll can list what is there. */
const prefixes = new Set<string>();

function newRow(): AttachmentStorageRow {
  const matchId = randomUUID();
  const id = randomUUID();
  const prefix = `match-video/${matchId}/`;
  prefixes.add(prefix);
  const row: AttachmentStorageRow = {
    id,
    staged_blob_key: `${prefix}${id}/staged`,
    final_blob_key: `${prefix}${id}/final`,
    source_etag: null,
  };
  tracked.add(row.staged_blob_key);
  tracked.add(row.final_blob_key);
  return row;
}

/* -------------------------------------------------------------------------
 * The browser's wire format, from Node
 *
 * Mirrors `attachment-upload.ts`: N × `PUT {sas}&comp=block&blockid=…` with
 * raw bytes and no content type, then one `PUT {sas}&comp=blocklist` naming
 * the blocks and setting the blob's content type. Two blocks rather than one
 * so the block list actually has an order to get wrong.
 * ---------------------------------------------------------------------- */

function blockIdFor(index: number): string {
  return Buffer.from(String(index).padStart(6, "0"), "binary").toString(
    "base64",
  );
}

async function putViaCredential(
  uploadUrl: string,
  bytes: Buffer,
  contentType = "video/mp4",
): Promise<number[]> {
  const half = Math.ceil(bytes.length / 2);
  const blocks = [bytes.subarray(0, half), bytes.subarray(half)];
  const statuses: number[] = [];
  for (const [index, block] of blocks.entries()) {
    const response = await fetch(
      `${uploadUrl}&comp=block&blockid=${encodeURIComponent(blockIdFor(index))}`,
      { method: "PUT", body: new Uint8Array(block) },
    );
    statuses.push(response.status);
    await response.arrayBuffer();
  }
  const list =
    '<?xml version="1.0" encoding="utf-8"?><BlockList>' +
    blocks
      .map((_b, index) => `<Latest>${blockIdFor(index)}</Latest>`)
      .join("") +
    "</BlockList>";
  const commit = await fetch(`${uploadUrl}&comp=blocklist`, {
    method: "PUT",
    body: list,
    headers: {
      "Content-Type": "application/xml",
      "x-ms-blob-content-type": contentType,
    },
  });
  statuses.push(commit.status);
  await commit.arrayBuffer();
  return statuses;
}

/** Swap the object name inside a SAS URL, leaving the signature as it was. */
function withPath(sasUrl: string, fromKey: string, toKey: string): string {
  const url = new URL(sasUrl);
  expect(url.pathname.endsWith(`/${fromKey}`)).toBe(true);
  url.pathname = url.pathname.slice(0, -fromKey.length) + toKey;
  return url.toString();
}

async function azureStatus(
  url: string,
  init: RequestInit = {},
): Promise<{ status: number; code: string | null; body: Buffer }> {
  const response = await fetch(url, init);
  return {
    status: response.status,
    code: response.headers.get("x-ms-error-code"),
    body: Buffer.from(await response.arrayBuffer()),
  };
}

async function uploadAndProbe(row: AttachmentStorageRow, bytes: Buffer) {
  const credential = mintAttachmentUploadCredential(row);
  expect(credential.ok).toBe(true);
  if (!credential.ok) throw new Error("unreachable");
  expect(await putViaCredential(credential.value.uploadUrl, bytes)).toEqual([
    201, 201, 201,
  ]);
  const staged = stagedBlobOf(row);
  if (!staged.ok) throw new Error("unreachable");
  const probe = await probeStoredVideo({ blob: staged.value });
  expect(probe.ok).toBe(true);
  if (!probe.ok) throw new Error("unreachable");
  return { credential: credential.value, probe: probe.value };
}

async function publishUntilDone(
  row: AttachmentStorageRow,
  sourceEtag: string,
): Promise<Extract<PublicationState, { status: "success" }>> {
  const begun = await beginPublication({ row, sourceEtag });
  expect(begun.ok).toBe(true);
  if (!begun.ok) throw new Error("unreachable");
  let state = begun.value;
  for (let poll = 0; state.status === "pending" && poll < 30; poll++) {
    await new Promise((done) => setTimeout(done, 1000));
    const next = await inspectPublication({ row, sourceEtag });
    expect(next.ok).toBe(true);
    if (!next.ok) throw new Error("unreachable");
    state = next.value;
  }
  expect(state.status).toBe("success");
  if (state.status !== "success") throw new Error("unreachable");
  return state;
}

async function listUnderPrefixes(): Promise<string[]> {
  const container = videoContainerClient();
  const names: string[] = [];
  for (const prefix of prefixes) {
    for await (const blob of container.listBlobsFlat({ prefix })) {
      names.push(blob.name);
    }
  }
  return names.sort();
}

/* -------------------------------------------------------------------------
 * The run
 * ---------------------------------------------------------------------- */

/**
 * Preflight: can this account be spoken to at all?
 *
 * Credentials being present is not the same as the account being live — a
 * disabled account (`AccountIsDisabled`), a rotated key or no network all
 * answer before a single fixture byte moves. Those are ENVIRONMENT gates, and
 * the run records them as a skip whose reason names the Azure error code, so
 * a red suite never stands in for "not verified here" and a green one never
 * hides it: the skip is visible in the report, and the criterion stays open.
 */
async function preflightAccount(): Promise<string | null> {
  if (!AZURE.ok) return AZURE_SKIP_REASON;
  try {
    // One request, read-only, against the container root; no prefix listed.
    await videoContainerClient().getProperties();
    return null;
  } catch (error) {
    const code =
      (error as { code?: string; details?: { errorCode?: string } }).details
        ?.errorCode ??
      (error as { code?: string }).code ??
      "unknown";
    const message = error instanceof Error ? error.message.split("\n")[0] : "";
    return (
      `Azure account ${AZURE.config.account} is not usable from here ` +
      `(${code}: ${message}) — the smoke test did NOT run`
    );
  }
}

test.describe("attachment storage against the real Azure account (smoke)", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 });
  test.skip(!HAVE_AZURE, AZURE_SKIP_REASON);

  /** Row A: the first attachment, carried across the tests below. */
  const rowA = newRow();
  let etagA = "";
  let durationA = 0;
  let copyIdA = "";
  /** Row D: the replacement. */
  const rowD = newRow();
  /** Set by the preflight; every test and the cleanup consult it. */
  let unusable: string | null = null;

  test.beforeAll(async () => {
    unusable = await preflightAccount();
  });

  test.beforeEach(() => {
    test.skip(unusable !== null, unusable ?? "");
  });

  test.afterAll(async () => {
    if (!HAVE_AZURE || unusable !== null) return;
    // Enumerate first, so an object this run left behind is named rather
    // than silently swept: every name under our prefixes must be one we
    // tracked, or the cleanup story has a hole.
    const before = await listUnderPrefixes();
    const untracked = before.filter((name) => !tracked.has(name));
    for (const key of tracked) {
      await videoContainerClient().getBlockBlobClient(key).deleteIfExists();
    }
    for (const name of untracked) {
      // Ours by prefix (a fresh UUID), so it is safe to remove — but it is
      // still a failure, reported below after the account is clean.
      await videoContainerClient().getBlockBlobClient(name).deleteIfExists();
    }
    expect(untracked).toEqual([]);
    expect(await listUnderPrefixes()).toEqual([]);
  });

  test("the account is the one the app would use, and the prefixes are empty", async () => {
    if (!AZURE.ok) throw new Error("unreachable");
    // Named without the key: the report needs the environment, not a secret.
    test.info().annotations.push({
      type: "environment",
      description: `account=${AZURE.config.account} container=${AZURE.config.container}`,
    });
    expect(await listUnderPrefixes()).toEqual([]);
  });

  test("direct upload: the write credential lands the browser's block sequence on the staged key, and nowhere else", async () => {
    const credential = mintAttachmentUploadCredential(rowA);
    expect(credential.ok).toBe(true);
    if (!credential.ok) throw new Error("unreachable");
    const { uploadUrl, expiresAt } = credential.value;
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

    expect(await putViaCredential(uploadUrl, CLIP_A)).toEqual([201, 201, 201]);

    const stagedA = stagedBlobOf(rowA);
    const finalA = publishedBlobOf(rowA);
    if (!stagedA.ok || !finalA.ok) throw new Error("unreachable");
    const landed = await inspectAttachmentBlob(stagedA.value);
    expect(landed.ok).toBe(true);
    if (!landed.ok || !landed.value) throw new Error("unreachable");
    expect(landed.value.contentLength).toBe(CLIP_A.length);
    expect(landed.value.contentType).toBe("video/mp4");
    expect(landed.value.etag).not.toBe("");

    // The same signature presented for the final key is a different string
    // to sign, so Azure refuses it — the browser can never write the
    // published object.
    const swapped = withPath(
      uploadUrl,
      rowA.staged_blob_key,
      rowA.final_blob_key,
    );
    const forged = await azureStatus(
      `${swapped}&comp=block&blockid=${encodeURIComponent(blockIdFor(0))}`,
      { method: "PUT", body: new Uint8Array(CLIP_A.subarray(0, 512)) },
    );
    expect(forged.status).toBe(403);
    expect(forged.code).toBe("AuthenticationFailed");
    const finalHead = await inspectAttachmentBlob(finalA.value);
    expect(finalHead).toEqual({ ok: true, value: null });

    // `cw` is write-only: the uploader's credential cannot read back what it
    // wrote, so an upload URL leaked from a request log streams nothing.
    const read = await azureStatus(uploadUrl);
    expect(read.status).toBe(403);
    expect(read.code).toBe("AuthorizationPermissionMismatch");
  });

  test("the staged bytes are verified through bounded Azure range reads, not a download", async () => {
    const staged = stagedBlobOf(rowA);
    if (!staged.ok) throw new Error("unreachable");
    const probe = await probeStoredVideo({ blob: staged.value });
    expect(probe.ok).toBe(true);
    if (!probe.ok) throw new Error("unreachable");

    const local = await inspectMedia(bufferByteSource(new Uint8Array(CLIP_A)));
    expect(local.ok).toBe(true);
    if (!local.ok) throw new Error("unreachable");

    expect(probe.value.sizeBytes).toBe(CLIP_A.length);
    expect(probe.value.contentType).toBe("video/mp4");
    expect(probe.value.durationSeconds).toBeCloseTo(
      local.value.durationSeconds,
      3,
    );
    expect(probe.value.rangeRequests).toBeGreaterThanOrEqual(1);
    expect(probe.value.bytesRead).toBeLessThanOrEqual(CLIP_A.length);
    expect(probe.value.etag).not.toBe("");
    etagA = probe.value.etag;
    durationA = probe.value.durationSeconds;
  });

  test("publication is one server-side copy conditioned on that ETag, and the final key carries the same bytes", async () => {
    const state = await publishUntilDone(rowA, etagA);
    copyIdA = state.copyId;
    expect(copyIdA).not.toBe("");

    const checked = checkPublishedMetadata(state, { sizeBytes: CLIP_A.length });
    expect(checked.ok).toBe(true);

    // The final object is a real video with the duration the staged probe
    // measured — a copy, not a re-upload, and not a zero-length placeholder.
    const published = publishedBlobOf(rowA);
    if (!published.ok) throw new Error("unreachable");
    const probe = await probeStoredVideo({ blob: published.value });
    expect(probe.ok).toBe(true);
    if (!probe.ok) throw new Error("unreachable");
    expect(probe.value.sizeBytes).toBe(CLIP_A.length);
    expect(probe.value.durationSeconds).toBeCloseTo(durationA, 3);

    // A second begin for the same row finds its own copy and resumes it
    // rather than starting another — the lost-response path, for real.
    const again = await beginPublication({ row: rowA, sourceEtag: etagA });
    expect(again.ok).toBe(true);
    if (!again.ok) throw new Error("unreachable");
    expect(again.value.status).toBe("success");
    if (again.value.status === "success") {
      expect(again.value.copyId).toBe(copyIdA);
      expect(again.value.etag).toBe(state.etag);
    }
  });

  test("a staged object that changed since it was measured is refused, with nothing at the final key", async () => {
    const rowB = newRow();
    const { credential, probe } = await uploadAndProbe(rowB, CLIP_A);
    const measuredEtag = probe.etag;

    // The browser writes again under its still-valid credential — a retried
    // upload of a different file, say. The ETag moves.
    expect(
      await putViaCredential(credential.uploadUrl, CLIP_B, "video/quicktime"),
    ).toEqual([201, 201, 201]);

    const refused = await beginPublication({
      row: rowB,
      sourceEtag: measuredEtag,
    });
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("unreachable");
    expect(refused.error.code).toBe("stale_attachment");
    expect(refused.error.detail).toBe("source_etag_mismatch");
    const state = await inspectPublication({
      row: rowB,
      sourceEtag: measuredEtag,
    });
    expect(state).toEqual({ ok: true, value: { status: "absent" } });

    // Re-measured, the new bytes publish normally: the refusal was about the
    // condition, not the row.
    const staged = stagedBlobOf(rowB);
    if (!staged.ok) throw new Error("unreachable");
    const reprobe = await probeStoredVideo({ blob: staged.value });
    expect(reprobe.ok).toBe(true);
    if (!reprobe.ok) throw new Error("unreachable");
    expect(reprobe.value.etag).not.toBe(measuredEtag);
    const done = await publishUntilDone(rowB, reprobe.value.etag);
    expect(done.contentLength).toBe(CLIP_B.length);
  });

  test("an object already at the final key that is not this row's copy is refused and left byte-for-byte alone", async () => {
    const rowC = newRow();
    // Somebody else's object at our final key: written with the account key,
    // as nothing in the app can, carrying none of our ownership metadata.
    const stranger = Buffer.from(`stranger-${randomUUID()}`);
    const strangerClient = videoContainerClient().getBlockBlobClient(
      rowC.final_blob_key,
    );
    await strangerClient.uploadData(stranger, {
      blobHTTPHeaders: { blobContentType: "text/plain" },
    });
    const strangerBefore = await strangerClient.getProperties();

    const { probe } = await uploadAndProbe(rowC, CLIP_A);
    const refused = await beginPublication({
      row: rowC,
      sourceEtag: probe.etag,
    });
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("unreachable");
    expect(refused.error.code).toBe("stale_attachment");
    expect(refused.error.detail).toBe("destination_mismatch");

    const strangerAfter = await strangerClient.getProperties();
    expect(strangerAfter.etag).toBe(strangerBefore.etag);
    expect(strangerAfter.contentLength).toBe(stranger.length);
    expect(strangerAfter.contentType).toBe("text/plain");
    expect(Buffer.from(await strangerClient.downloadToBuffer())).toEqual(
      stranger,
    );
  });

  test("playback: the read credential serves ranges of the final key only, and the object is closed without it", async () => {
    const credential = mintAttachmentPlaybackCredential(rowA);
    expect(credential.ok).toBe(true);
    if (!credential.ok) throw new Error("unreachable");
    const { playbackUrl } = credential.value;

    const ranged = await azureStatus(playbackUrl, {
      headers: { Range: "bytes=0-1023" },
    });
    expect(ranged.status).toBe(206);
    expect(ranged.body).toEqual(CLIP_A.subarray(0, 1024));

    const tail = await azureStatus(playbackUrl, {
      headers: { Range: `bytes=${CLIP_A.length - 64}-` },
    });
    expect(tail.status).toBe(206);
    expect(tail.body).toEqual(CLIP_A.subarray(CLIP_A.length - 64));

    // No credential, no bytes: the container is not public.
    const bare = new URL(playbackUrl);
    bare.search = "";
    const anonymous = await azureStatus(bare.toString());
    expect([401, 403, 404]).toContain(anonymous.status);
    expect(anonymous.body.length).toBeLessThan(CLIP_A.length);

    // `r` cannot write…
    const write = await azureStatus(
      `${playbackUrl}&comp=block&blockid=${encodeURIComponent(blockIdFor(0))}`,
      { method: "PUT", body: new Uint8Array(16) },
    );
    expect(write.status).toBe(403);
    expect(write.code).toBe("AuthorizationPermissionMismatch");

    // …and cannot be pointed at the staged object, whose bytes are the
    // pre-publication upload nobody has verified for this viewer.
    const swapped = withPath(
      playbackUrl,
      rowA.final_blob_key,
      rowA.staged_blob_key,
    );
    const staged = await azureStatus(swapped);
    expect(staged.status).toBe(403);
    expect(staged.code).toBe("AuthenticationFailed");
  });

  test("replacement: a second attachment publishes beside the first, and the first's tracked objects are collected while the replacement stays playable", async () => {
    const { probe } = await uploadAndProbe(rowD, CLIP_B);
    expect(probe.contentType).toBe("video/quicktime");
    const state = await publishUntilDone(rowD, probe.etag);
    expect(state.contentLength).toBe(CLIP_B.length);

    // Both finals exist at this moment — activation is what retires the old
    // row, and its objects are collected afterwards, not before.
    const finalA = publishedBlobOf(rowA);
    const finalD = publishedBlobOf(rowD);
    const stagedA = stagedBlobOf(rowA);
    if (!finalA.ok || !finalD.ok || !stagedA.ok) throw new Error("unreachable");
    expect((await inspectAttachmentBlob(finalA.value)).ok).toBe(true);
    expect((await inspectAttachmentBlob(finalD.value)).ok).toBe(true);

    // The worker's order on a retired row: abort whatever copy the row
    // recorded (a finished copy reports nothing to abort, no error), then
    // delete both keys through the same seam the worker uses.
    const abort = await abortPublication({ row: rowA, copyId: copyIdA });
    expect(abort).toEqual({ ok: true, value: { aborted: false } });
    expect(await deleteAttachmentBlob(stagedA.value)).toEqual({
      ok: true,
      value: { deleted: true },
    });
    expect(await deleteAttachmentBlob(finalA.value)).toEqual({
      ok: true,
      value: { deleted: true },
    });
    // Absence is the desired state, and asking again is not an error.
    expect(await deleteAttachmentBlob(finalA.value)).toEqual({
      ok: true,
      value: { deleted: false },
    });
    expect(await inspectAttachmentBlob(stagedA.value)).toEqual({
      ok: true,
      value: null,
    });
    expect(await inspectAttachmentBlob(finalA.value)).toEqual({
      ok: true,
      value: null,
    });

    // The old credential is now a dead link, and the replacement plays.
    const oldCredential = mintAttachmentPlaybackCredential(rowA);
    if (!oldCredential.ok) throw new Error("unreachable");
    expect((await azureStatus(oldCredential.value.playbackUrl)).status).toBe(
      404,
    );

    const credential = mintAttachmentPlaybackCredential(rowD);
    if (!credential.ok) throw new Error("unreachable");
    const ranged = await azureStatus(credential.value.playbackUrl, {
      headers: { Range: "bytes=0-255" },
    });
    expect(ranged.status).toBe(206);
    expect(ranged.body).toEqual(CLIP_B.subarray(0, 256));
  });

  test("every object under this run's prefixes is one it tracked", async () => {
    const names = await listUnderPrefixes();
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((name) => !tracked.has(name))).toEqual([]);
  });
});
