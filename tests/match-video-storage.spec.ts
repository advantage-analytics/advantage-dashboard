import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

import {
  BlobSASPermissions,
  RestError,
  SASProtocol,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} from "@azure/storage-blob";

import {
  abortPublication,
  ATTACHMENT_UPLOAD_SAS_TTL_SECONDS,
  beginPublication,
  checkPublishedMetadata,
  deleteAttachmentBlob,
  discardFailedPublication,
  inspectAttachmentBlob,
  inspectPublication,
  mintAttachmentPlaybackCredential,
  mintAttachmentUploadCredential,
  PUBLICATION_SOURCE_SAS_TTL_SECONDS,
  publicationColumns,
  type AttachmentBlobHead,
  type AttachmentBlobOps,
  type AttachmentStorageRow,
  type CopyStatus,
} from "@/lib/services/match-video/storage";
import {
  publishedBlobOf,
  stagedBlobOf,
} from "@/lib/services/match-video/probe";

/**
 * The storage adapter's two promises: the browser can never write the final
 * object, and the final object is written exactly once. Everything else here
 * — resumption after a lost response, concurrent completion attempts, a
 * staged file that changed after it was measured — is those two promises
 * under adversarial timing.
 *
 * Signing runs for real against a throwaway account key, so the SAS
 * assertions are about actual signatures, not about a stub's return value.
 * The blob operations run against an in-memory container that answers the
 * way Azure does: 412 on a failed source condition, 409 on an existing or
 * pending destination, 409 on deleting a destination mid-copy.
 */

/* -------------------------------------------------------------------------
 * Signing environment
 * ---------------------------------------------------------------------- */

const ACCOUNT = "advtestaccount";
const ACCOUNT_KEY = Buffer.from("not-a-real-key-" + randomUUID()).toString(
  "base64",
);
const CONTAINER = "advantage-videos";

test.beforeAll(() => {
  process.env.AZURE_STORAGE_ACCOUNT = ACCOUNT;
  process.env.AZURE_STORAGE_KEY = ACCOUNT_KEY;
  process.env.AZURE_STORAGE_CONTAINER = CONTAINER;
});

const credential = () => new StorageSharedKeyCredential(ACCOUNT, ACCOUNT_KEY);

/** Percent-encode the way the SDK's `BlockBlobClient.url` does. */
function blobPath(key: string): string {
  return `/${CONTAINER}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Recompute the signature a SAS with these exact parameters would carry for
 * `blobName`. Equal to the URL's `sig` only when `blobName` is the blob the
 * URL was signed for.
 */
function signatureFor(url: URL, blobName: string): string {
  return generateBlobSASQueryParameters(
    {
      containerName: CONTAINER,
      blobName,
      permissions: BlobSASPermissions.parse(url.searchParams.get("sp")!),
      startsOn: new Date(url.searchParams.get("st")!),
      expiresOn: new Date(url.searchParams.get("se")!),
      protocol: SASProtocol.Https,
    },
    credential(),
  ).signature;
}

/* -------------------------------------------------------------------------
 * Rows
 * ---------------------------------------------------------------------- */

function row(
  overrides: Partial<AttachmentStorageRow> = {},
): AttachmentStorageRow {
  const id = overrides.id ?? randomUUID();
  const matchId = randomUUID();
  return {
    id,
    staged_blob_key: `match-video/${matchId}/${id}/staged.mp4`,
    final_blob_key: `match-video/${matchId}/${id}/final.mp4`,
    source_etag: null,
    ...overrides,
  };
}

const STAGED_ETAG = '"0x8DDA1B2C3D4E5F6"';
const STAGED_BYTES = 6_442_450_944; // 6 GiB — never materialised

/* -------------------------------------------------------------------------
 * In-memory Azure
 * ---------------------------------------------------------------------- */

interface FakeBlob {
  contentLength: number;
  etag: string;
  contentType: string | null;
  metadata: Record<string, string>;
  copy: AttachmentBlobHead["copy"];
}

interface Call {
  op: "properties" | "startCopy" | "abortCopy" | "deleteIfExists";
  key: string;
}

function rest(status: number, code: string): RestError {
  return new RestError(code, { statusCode: status, code });
}

/**
 * A container that behaves like Azure for the four operations the adapter
 * uses. Copies never complete on their own: the test decides when, so a
 * pending copy stays pending for as long as an assertion needs.
 */
class FakeContainer implements AttachmentBlobOps {
  readonly blobs = new Map<string, FakeBlob>();
  readonly calls: Call[] = [];
  readonly sourceUrls: string[] = [];
  /** Copy completes inside Start Copy, as a small same-account copy does. */
  completeSynchronously = false;
  /** Start the copy, then lose the response. */
  loseStartResponse = false;
  /** Start Copy fails outright with this status before touching anything. */
  startFailsWith: number | null = null;
  propertiesFailWith: number | null = null;

  put(key: string, blob: Partial<FakeBlob> & { etag: string }): void {
    this.blobs.set(key, {
      contentLength: STAGED_BYTES,
      contentType: "video/mp4",
      metadata: {},
      copy: null,
      ...blob,
    });
  }

  stage(r: AttachmentStorageRow, etag = STAGED_ETAG): void {
    this.put(r.staged_blob_key, { etag });
  }

  async properties(key: string): Promise<AttachmentBlobHead> {
    this.calls.push({ op: "properties", key });
    if (this.propertiesFailWith) {
      throw rest(this.propertiesFailWith, "ServerBusy");
    }
    const blob = this.blobs.get(key);
    if (!blob) throw rest(404, "BlobNotFound");
    return {
      contentLength: blob.contentLength,
      etag: blob.etag,
      contentType: blob.contentType,
      metadata: { ...blob.metadata },
      copy: blob.copy ? { ...blob.copy } : null,
    };
  }

  async startCopy(input: {
    destinationKey: string;
    sourceUrl: string;
    sourceIfMatch: string;
    metadata: Record<string, string>;
  }): Promise<{ copyId: string; copyStatus: CopyStatus }> {
    this.calls.push({ op: "startCopy", key: input.destinationKey });
    this.sourceUrls.push(input.sourceUrl);
    if (this.startFailsWith) throw rest(this.startFailsWith, "ServerBusy");

    const sourceKey = decodeURIComponent(
      new URL(input.sourceUrl).pathname.slice(`/${CONTAINER}/`.length),
    );
    const source = this.blobs.get(sourceKey);
    if (!source) throw rest(404, "CannotVerifyCopySource");

    const destination = this.blobs.get(input.destinationKey);
    if (destination) {
      throw destination.copy?.status === "pending"
        ? rest(409, "PendingCopyOperation")
        : rest(409, "BlobAlreadyExists");
    }
    if (source.etag !== input.sourceIfMatch) {
      throw rest(412, "SourceConditionNotMet");
    }

    const copyId = randomUUID();
    const status: CopyStatus = this.completeSynchronously
      ? "success"
      : "pending";
    this.blobs.set(input.destinationKey, {
      contentLength: status === "success" ? source.contentLength : 0,
      etag: `"copy-${copyId.slice(0, 8)}"`,
      contentType: source.contentType,
      metadata: { ...input.metadata },
      copy: {
        id: copyId,
        status,
        progress:
          status === "success"
            ? `${source.contentLength}/${source.contentLength}`
            : `0/${source.contentLength}`,
        completedOn: status === "success" ? new Date() : null,
        description: null,
      },
    });
    if (this.loseStartResponse) throw new Error("socket hang up");
    return { copyId, copyStatus: status };
  }

  async abortCopy(key: string, copyId: string): Promise<void> {
    this.calls.push({ op: "abortCopy", key });
    const blob = this.blobs.get(key);
    if (!blob) throw rest(404, "BlobNotFound");
    if (!blob.copy || blob.copy.status !== "pending") {
      throw rest(409, "NoPendingCopyOperation");
    }
    if (blob.copy.id !== copyId) throw rest(409, "CopyIdMismatch");
    blob.copy = { ...blob.copy, status: "aborted", description: "aborted" };
    blob.contentLength = 0;
  }

  async deleteIfExists(key: string): Promise<boolean> {
    this.calls.push({ op: "deleteIfExists", key });
    const blob = this.blobs.get(key);
    if (!blob) return false;
    if (blob.copy?.status === "pending")
      throw rest(409, "PendingCopyOperation");
    this.blobs.delete(key);
    return true;
  }

  /** The test's hand on Azure's copy engine. */
  finishCopy(key: string): void {
    const blob = this.blobs.get(key)!;
    const total = Number(blob.copy!.progress!.split("/")[1]);
    blob.copy = {
      ...blob.copy!,
      status: "success",
      progress: `${total}/${total}`,
      completedOn: new Date(),
    };
    blob.contentLength = total;
  }

  failCopy(key: string, description: string): void {
    const blob = this.blobs.get(key)!;
    blob.copy = { ...blob.copy!, status: "failed", description };
    blob.contentLength = 0;
  }

  progressCopy(key: string, copied: number): void {
    const blob = this.blobs.get(key)!;
    const total = Number(blob.copy!.progress!.split("/")[1]);
    blob.copy = { ...blob.copy!, progress: `${copied}/${total}` };
  }

  writes(): string[] {
    return this.calls
      .filter((c) => c.op === "startCopy" || c.op === "deleteIfExists")
      .map((c) => c.key);
  }
}

/* -------------------------------------------------------------------------
 * Credentials: the browser can write the staged key and nothing else
 * ---------------------------------------------------------------------- */

test("upload credential names the staged key, write-only, six hours", () => {
  const r = row();
  const before = Date.now();
  const minted = mintAttachmentUploadCredential(r);
  expect(minted.ok).toBe(true);
  if (!minted.ok) return;

  const url = new URL(minted.value.uploadUrl);
  expect(url.protocol).toBe("https:");
  expect(url.host).toBe(`${ACCOUNT}.blob.core.windows.net`);
  expect(url.pathname).toBe(blobPath(r.staged_blob_key));
  expect(url.pathname).not.toContain("final");

  // Permissions: create and write, nothing that reads, deletes or lists.
  expect(url.searchParams.get("sp")).toBe("cw");
  // A blob-scoped resource, not a container one.
  expect(url.searchParams.get("sr")).toBe("b");
  expect(url.searchParams.get("spr")).toBe("https");

  // Six hours from now, within the run's own slack.
  const expires = new Date(url.searchParams.get("se")!).getTime();
  expect(ATTACHMENT_UPLOAD_SAS_TTL_SECONDS).toBe(6 * 60 * 60);
  expect(expires - before).toBeGreaterThanOrEqual(
    ATTACHMENT_UPLOAD_SAS_TTL_SECONDS * 1000 - 1000,
  );
  expect(expires - before).toBeLessThanOrEqual(
    ATTACHMENT_UPLOAD_SAS_TTL_SECONDS * 1000 + 5000,
  );
  // The SAS `se` is whole seconds; the returned Date keeps milliseconds.
  expect(Math.floor(minted.value.expiresAt.getTime() / 1000)).toBe(
    expires / 1000,
  );
});

test("upload signature is bound to the staged name — it does not verify for the final key", () => {
  const r = row();
  const minted = mintAttachmentUploadCredential(r);
  expect(minted.ok).toBe(true);
  if (!minted.ok) return;

  const url = new URL(minted.value.uploadUrl);
  const sig = url.searchParams.get("sig")!;

  // Recomputing the signature for the staged blob with the URL's own
  // parameters reproduces it: the recomputation is faithful.
  expect(signatureFor(url, r.staged_blob_key)).toBe(sig);
  // The same parameters signed for the final blob give a different value: a
  // browser that swaps the path on this URL presents a signature Azure will
  // reject. There is no write credential for the final key to be had here.
  expect(signatureFor(url, r.final_blob_key)).not.toBe(sig);
});

test("playback credential names the final key, read-only, thirty minutes", () => {
  const r = row();
  const before = Date.now();
  const minted = mintAttachmentPlaybackCredential(r);
  expect(minted.ok).toBe(true);
  if (!minted.ok) return;

  const url = new URL(minted.value.playbackUrl);
  expect(url.pathname).toBe(blobPath(r.final_blob_key));
  expect(url.pathname).not.toContain("staged");
  expect(url.searchParams.get("sp")).toBe("r");
  expect(url.searchParams.get("sr")).toBe("b");
  const expires = new Date(url.searchParams.get("se")!).getTime();
  expect(expires - before).toBeGreaterThanOrEqual(30 * 60 * 1000 - 1000);
  expect(expires - before).toBeLessThanOrEqual(30 * 60 * 1000 + 5000);

  // And it verifies only for the final blob.
  const sig = url.searchParams.get("sig")!;
  expect(signatureFor(url, r.final_blob_key)).toBe(sig);
  expect(signatureFor(url, r.staged_blob_key)).not.toBe(sig);
});

test("a row whose keys are URLs or identical is refused before signing", () => {
  const cases: AttachmentStorageRow[] = [
    row({ staged_blob_key: "https://evil.example/x?sig=1" }),
    row({ staged_blob_key: "match-video/a/b/staged.mp4?sv=1" }),
    row({ staged_blob_key: "" }),
    row({ staged_blob_key: "same.mp4", final_blob_key: "same.mp4" }),
  ];
  for (const r of cases) {
    const minted = mintAttachmentUploadCredential(r);
    expect(minted.ok).toBe(false);
    if (!minted.ok) expect(minted.error.code).toBe("storage_unavailable");
  }
  const badFinal = mintAttachmentPlaybackCredential(
    row({ final_blob_key: "https://evil.example/final.mp4" }),
  );
  expect(badFinal.ok).toBe(false);
});

test("missing Azure configuration is a 503, not a throw", () => {
  const saved = process.env.AZURE_STORAGE_KEY;
  delete process.env.AZURE_STORAGE_KEY;
  try {
    const minted = mintAttachmentUploadCredential(row());
    expect(minted.ok).toBe(false);
    if (!minted.ok) {
      expect(minted.error.code).toBe("storage_unavailable");
      expect(minted.error.detail).toBe("storage_not_configured");
      expect(minted.error.status).toBe(503);
    }
  } finally {
    process.env.AZURE_STORAGE_KEY = saved;
  }
});

/* -------------------------------------------------------------------------
 * Bounded metadata
 * ---------------------------------------------------------------------- */

test("inspecting a blob is one properties call and never a byte read", async () => {
  const azure = new FakeContainer();
  const r = row();
  azure.stage(r);

  const staged = stagedBlobOf({ ...r, source_etag: STAGED_ETAG });
  expect(staged.ok).toBe(true);
  if (!staged.ok) return;

  const result = await inspectAttachmentBlob(staged.value, azure);
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value).toEqual({
      contentLength: STAGED_BYTES,
      etag: STAGED_ETAG,
      contentType: "video/mp4",
    });
  }
  expect(azure.calls).toEqual([{ op: "properties", key: r.staged_blob_key }]);
  // The seam has no read method at all; this is the type-level half of the
  // "bounded metadata" promise, restated as a runtime check on the fake.
  expect("download" in azure).toBe(false);
  expect("read" in azure).toBe(false);

  const final = publishedBlobOf(r);
  expect(final.ok).toBe(true);
  if (!final.ok) return;
  const absent = await inspectAttachmentBlob(final.value, azure);
  expect(absent.ok && absent.value === null).toBe(true);

  // The row remembers a different ETag than what is there: refused.
  const moved = stagedBlobOf({ ...r, source_etag: '"other"' });
  if (moved.ok) {
    const stale = await inspectAttachmentBlob(moved.value, azure);
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.code).toBe("stale_attachment");
  }
});

/* -------------------------------------------------------------------------
 * Publication: begin
 * ---------------------------------------------------------------------- */

test("begin issues one Start Copy and returns pending without waiting", async () => {
  const azure = new FakeContainer();
  const r = row();
  azure.stage(r);

  const started = Date.now();
  const result = await beginPublication(
    { row: r, sourceEtag: STAGED_ETAG },
    azure,
  );
  // The fake never completes a copy on its own. If begin waited for the copy
  // this would hang; a fast return is the assertion.
  expect(Date.now() - started).toBeLessThan(1000);

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.value.status).toBe("pending");
  if (result.value.status !== "pending") return;
  expect(result.value.copyId).toMatch(/^[0-9a-f-]{36}$/);
  expect(result.value.startedAt).toBeInstanceOf(Date);

  expect(azure.calls).toEqual([{ op: "startCopy", key: r.final_blob_key }]);
  // Destination carries the ownership metadata for a later resume.
  const destination = azure.blobs.get(r.final_blob_key)!;
  expect(destination.metadata).toEqual({
    adv_attachment_id: r.id,
    adv_source_etag: STAGED_ETAG,
    adv_staged_key: r.staged_blob_key,
  });
  expect(destination.copy?.status).toBe("pending");
});

test("the copy's source is a short read-only SAS for the staged key that never leaves the server", async () => {
  const azure = new FakeContainer();
  const r = row();
  azure.stage(r);

  const before = Date.now();
  const result = await beginPublication(
    { row: r, sourceEtag: STAGED_ETAG },
    azure,
  );
  expect(result.ok).toBe(true);

  expect(azure.sourceUrls).toHaveLength(1);
  const source = new URL(azure.sourceUrls[0]);
  expect(source.pathname).toBe(blobPath(r.staged_blob_key));
  expect(source.searchParams.get("sp")).toBe("r");
  const expires = new Date(source.searchParams.get("se")!).getTime();
  expect(expires - before).toBeLessThanOrEqual(
    PUBLICATION_SOURCE_SAS_TTL_SECONDS * 1000 + 5000,
  );
  expect(PUBLICATION_SOURCE_SAS_TTL_SECONDS).toBeLessThanOrEqual(
    ATTACHMENT_UPLOAD_SAS_TTL_SECONDS,
  );

  // Nothing in what the caller gets back could be persisted or returned to a
  // browser as a credential.
  const serialised = JSON.stringify(result);
  expect(serialised).not.toContain("sig=");
  expect(serialised).not.toContain("blob.core.windows.net");
});

test("a staged blob that changed since it was measured is refused", async () => {
  const azure = new FakeContainer();
  const r = row();
  azure.stage(r, '"replaced-after-probe"');

  const result = await beginPublication(
    { row: r, sourceEtag: STAGED_ETAG },
    azure,
  );
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.code).toBe("stale_attachment");
    expect(result.error.detail).toBe("source_etag_mismatch");
    expect(result.error.status).toBe(409);
  }
  expect(azure.blobs.has(r.final_blob_key)).toBe(false);
});

test("two concurrent begins start exactly one copy and agree on its id", async () => {
  const azure = new FakeContainer();
  const r = row();
  azure.stage(r);

  const [a, b] = await Promise.all([
    beginPublication({ row: r, sourceEtag: STAGED_ETAG }, azure),
    beginPublication({ row: r, sourceEtag: STAGED_ETAG }, azure),
  ]);
  expect(a.ok && b.ok).toBe(true);
  if (!a.ok || !b.ok) return;
  expect(a.value.status).toBe("pending");
  expect(b.value.status).toBe("pending");
  if (a.value.status !== "pending" || b.value.status !== "pending") return;
  expect(a.value.copyId).toBe(b.value.copyId);

  const starts = azure.calls.filter((c) => c.op === "startCopy");
  expect(starts).toHaveLength(2);
  const destination = azure.blobs.get(r.final_blob_key)!;
  expect(destination.copy?.id).toBe(a.value.copyId);
  // The loser read the destination instead of writing anything.
  expect(azure.writes()).toEqual([r.final_blob_key, r.final_blob_key]);
  expect(azure.calls.filter((c) => c.op === "deleteIfExists")).toHaveLength(0);
});

test("a lost Start Copy response is recovered by the next begin", async () => {
  const azure = new FakeContainer();
  const r = row();
  azure.stage(r);

  azure.loseStartResponse = true;
  const first = await beginPublication(
    { row: r, sourceEtag: STAGED_ETAG },
    azure,
  );
  expect(first.ok).toBe(false);
  if (!first.ok) {
    expect(first.error.code).toBe("storage_unavailable");
    expect(first.error.detail).toBe("start_copy_failed");
  }
  const copyId = azure.blobs.get(r.final_blob_key)!.copy!.id;

  // Retry: Azure says 409, the adapter reads the destination, recognises its
  // own copy and resumes it — no second copy, no overwrite.
  azure.loseStartResponse = false;
  const second = await beginPublication(
    { row: r, sourceEtag: STAGED_ETAG },
    azure,
  );
  expect(second.ok).toBe(true);
  if (!second.ok) return;
  expect(second.value.status).toBe("pending");
  if (second.value.status === "pending") {
    expect(second.value.copyId).toBe(copyId);
  }
  expect(azure.blobs.get(r.final_blob_key)!.copy!.id).toBe(copyId);
});

test("a same-account copy that completes inside Start Copy comes back as success", async () => {
  const azure = new FakeContainer();
  azure.completeSynchronously = true;
  const r = row();
  azure.stage(r);

  const result = await beginPublication(
    { row: r, sourceEtag: STAGED_ETAG },
    azure,
  );
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.value.status).toBe("success");
  if (result.value.status !== "success") return;
  expect(result.value.contentLength).toBe(STAGED_BYTES);
  expect(result.value.etag).toMatch(/^"copy-/);
  expect(result.value.startedAt).toBeInstanceOf(Date);
  expect(azure.calls.map((c) => c.op)).toEqual(["startCopy", "properties"]);
});

test("storage failing to start the copy stays retryable", async () => {
  const azure = new FakeContainer();
  const r = row();
  azure.stage(r);
  azure.startFailsWith = 503;

  const result = await beginPublication(
    { row: r, sourceEtag: STAGED_ETAG },
    azure,
  );
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.code).toBe("storage_unavailable");
    expect(result.error.status).toBe(503);
  }

  // Missing source: also storage, not the user's file.
  const gone = new FakeContainer();
  const missing = await beginPublication(
    { row: row(), sourceEtag: STAGED_ETAG },
    gone,
  );
  expect(missing.ok).toBe(false);
  if (!missing.ok) {
    expect(missing.error.code).toBe("storage_unavailable");
    expect(missing.error.detail).toBe("source_not_found");
  }

  const noEtag = await beginPublication({ row: r, sourceEtag: "" }, azure);
  expect(noEtag.ok).toBe(false);
  if (!noEtag.ok) expect(noEtag.error.detail).toBe("missing_source_etag");
});

/* -------------------------------------------------------------------------
 * Publication: poll, persist, resume
 * ---------------------------------------------------------------------- */

test("pending → success is observed by polling, one properties call each", async () => {
  const azure = new FakeContainer();
  const r = row();
  azure.stage(r);

  const begun = await beginPublication(
    { row: r, sourceEtag: STAGED_ETAG },
    azure,
  );
  expect(begun.ok).toBe(true);
  if (!begun.ok || begun.value.status !== "pending") return;
  const copyId = begun.value.copyId;

  // What T10 stores between polls.
  const persisted = publicationColumns(begun.value, STAGED_ETAG);
  expect(persisted).toEqual({
    source_etag: STAGED_ETAG,
    copy_id: copyId,
    copy_status: "pending",
    copy_started_at: begun.value.startedAt!.toISOString(),
  });

  azure.progressCopy(r.final_blob_key, 1_073_741_824);
  const midway = await inspectPublication(
    { row: r, sourceEtag: STAGED_ETAG },
    azure,
  );
  expect(midway.ok).toBe(true);
  if (!midway.ok) return;
  expect(midway.value.status).toBe("pending");
  if (midway.value.status === "pending") {
    expect(midway.value.copyId).toBe(copyId);
    expect(midway.value.bytesCopied).toBe(1_073_741_824);
    expect(midway.value.bytesTotal).toBe(STAGED_BYTES);
    expect(midway.value.startedAt).toBeNull();
  }
  // A poll does not touch the persisted start time.
  expect(publicationColumns(midway.value, STAGED_ETAG)).toEqual({
    source_etag: STAGED_ETAG,
    copy_id: copyId,
    copy_status: "pending",
  });

  // Not done yet: the metadata check refuses to pass a pending copy.
  const early = checkPublishedMetadata(midway.value, {
    sizeBytes: STAGED_BYTES,
  });
  expect(early.ok).toBe(false);
  if (!early.ok) expect(early.error.detail).toBe("copy_pending");

  azure.finishCopy(r.final_blob_key);
  const done = await inspectPublication(
    { row: r, sourceEtag: STAGED_ETAG },
    azure,
  );
  expect(done.ok).toBe(true);
  if (!done.ok) return;
  expect(done.value.status).toBe("success");
  if (done.value.status !== "success") return;
  expect(done.value.copyId).toBe(copyId);
  expect(done.value.contentLength).toBe(STAGED_BYTES);
  expect(done.value.completedAt).toBeInstanceOf(Date);
  expect(publicationColumns(done.value, STAGED_ETAG).copy_status).toBe(
    "success",
  );

  const checked = checkPublishedMetadata(done.value, {
    sizeBytes: STAGED_BYTES,
  });
  expect(checked.ok).toBe(true);
  const wrongLength = checkPublishedMetadata(done.value, {
    sizeBytes: STAGED_BYTES - 1,
  });
  expect(wrongLength.ok).toBe(false);
  if (!wrongLength.ok) {
    expect(wrongLength.error.code).toBe("stale_attachment");
    expect(wrongLength.error.detail).toBe("published_length_mismatch");
  }

  expect(azure.calls.filter((c) => c.op === "properties")).toHaveLength(2);
  expect(azure.calls.filter((c) => c.op === "startCopy")).toHaveLength(1);
});

test("a failed copy is reported, can be discarded, and only then retried", async () => {
  const azure = new FakeContainer();
  const r = row();
  azure.stage(r);

  const begun = await beginPublication(
    { row: r, sourceEtag: STAGED_ETAG },
    azure,
  );
  if (!begun.ok || begun.value.status !== "pending") throw new Error("setup");
  const firstCopyId = begun.value.copyId;

  // Retrying while the copy is pending neither restarts nor clears it.
  const retryPending = await beginPublication(
    { row: r, sourceEtag: STAGED_ETAG },
    azure,
  );
  expect(retryPending.ok && retryPending.value.status === "pending").toBe(true);
  const discardPending = await discardFailedPublication(
    { row: r, sourceEtag: STAGED_ETAG },
    azure,
  );
  expect(discardPending.ok).toBe(false);
  if (!discardPending.ok)
    expect(discardPending.error.detail).toBe("copy_still_pending");

  azure.failCopy(r.final_blob_key, "500 InternalError");
  const failed = await inspectPublication(
    { row: r, sourceEtag: STAGED_ETAG },
    azure,
  );
  expect(failed.ok).toBe(true);
  if (!failed.ok) return;
  expect(failed.value.status).toBe("failed");
  if (failed.value.status === "failed") {
    expect(failed.value.copyId).toBe(firstCopyId);
    expect(failed.value.description).toBe("500 InternalError");
  }
  expect(publicationColumns(failed.value, STAGED_ETAG).copy_status).toBe(
    "failed",
  );
  const notPublished = checkPublishedMetadata(failed.value, {
    sizeBytes: STAGED_BYTES,
  });
  expect(notPublished.ok).toBe(false);

  // Begin on a dead copy reports it rather than silently replacing it.
  const retryFailed = await beginPublication(
    { row: r, sourceEtag: STAGED_ETAG },
    azure,
  );
  expect(retryFailed.ok && retryFailed.value.status === "failed").toBe(true);
  expect(azure.calls.filter((c) => c.op === "deleteIfExists")).toHaveLength(0);

  // The caller clears its own wreckage, then starts fresh.
  const discarded = await discardFailedPublication(
    { row: r, sourceEtag: STAGED_ETAG },
    azure,
  );
  expect(discarded.ok && discarded.value.discarded).toBe(true);
  expect(azure.blobs.has(r.final_blob_key)).toBe(false);

  const again = await beginPublication(
    { row: r, sourceEtag: STAGED_ETAG },
    azure,
  );
  expect(again.ok).toBe(true);
  if (again.ok && again.value.status === "pending") {
    expect(again.value.copyId).not.toBe(firstCopyId);
  }

  // Discarding a successful publication is refused outright.
  azure.finishCopy(r.final_blob_key);
  const keep = await discardFailedPublication(
    { row: r, sourceEtag: STAGED_ETAG },
    azure,
  );
  expect(keep.ok).toBe(false);
  if (!keep.ok) expect(keep.error.detail).toBe("copy_already_succeeded");
  expect(azure.blobs.has(r.final_blob_key)).toBe(true);
});

test("a copy id lost after discard-and-retry is re-learned from the destination", async () => {
  const azure = new FakeContainer();
  const r = row();
  azure.stage(r);

  const first = await beginPublication(
    { row: r, sourceEtag: STAGED_ETAG },
    azure,
  );
  if (!first.ok || first.value.status !== "pending") throw new Error("setup");
  azure.failCopy(r.final_blob_key, "boom");
  await discardFailedPublication({ row: r, sourceEtag: STAGED_ETAG }, azure);

  azure.loseStartResponse = true;
  await beginPublication({ row: r, sourceEtag: STAGED_ETAG }, azure);
  azure.loseStartResponse = false;

  // T10 still holds the FIRST copy id; the destination now belongs to a
  // second copy of the same source. Ownership matches, so the new id is
  // reported for T10 to persist rather than the row being refused.
  const seen = await inspectPublication(
    { row: r, sourceEtag: STAGED_ETAG },
    azure,
  );
  expect(seen.ok).toBe(true);
  if (seen.ok && seen.value.status === "pending") {
    expect(seen.value.copyId).not.toBe(first.value.copyId);
    expect(seen.value.copyId).toBe(azure.blobs.get(r.final_blob_key)!.copy!.id);
  }
});

test("nothing at the final key reads as absent, and poll errors stay retryable", async () => {
  const azure = new FakeContainer();
  const r = row();

  const absent = await inspectPublication(
    { row: r, sourceEtag: STAGED_ETAG },
    azure,
  );
  expect(absent.ok && absent.value.status === "absent").toBe(true);
  if (absent.ok) {
    expect(publicationColumns(absent.value, STAGED_ETAG)).toEqual({
      source_etag: STAGED_ETAG,
      copy_id: null,
      copy_status: null,
    });
  }

  azure.propertiesFailWith = 503;
  const busy = await inspectPublication(
    { row: r, sourceEtag: STAGED_ETAG },
    azure,
  );
  expect(busy.ok).toBe(false);
  if (!busy.ok) expect(busy.error.code).toBe("storage_unavailable");
});

/* -------------------------------------------------------------------------
 * Immutability: a mismatched destination is refused, never overwritten
 * ---------------------------------------------------------------------- */

test("an object at the final key that is not this row's copy is refused by every path", async () => {
  const azure = new FakeContainer();
  const r = row();
  azure.stage(r);

  const strangers: Array<[string, Partial<FakeBlob>]> = [
    ["no metadata at all", { metadata: {} }],
    [
      "another attachment's copy",
      {
        metadata: {
          adv_attachment_id: randomUUID(),
          adv_source_etag: STAGED_ETAG,
          adv_staged_key: r.staged_blob_key,
        },
        copy: {
          id: randomUUID(),
          status: "success",
          progress: null,
          completedOn: new Date(),
          description: null,
        },
      },
    ],
    [
      "this attachment, but a different source ETag",
      {
        metadata: {
          adv_attachment_id: r.id,
          adv_source_etag: '"an-earlier-upload"',
          adv_staged_key: r.staged_blob_key,
        },
        copy: {
          id: randomUUID(),
          status: "failed",
          progress: null,
          completedOn: null,
          description: "x",
        },
      },
    ],
  ];

  for (const [label, stranger] of strangers) {
    azure.blobs.delete(r.final_blob_key);
    azure.put(r.final_blob_key, { etag: '"stranger"', ...stranger });
    const snapshot = JSON.stringify(azure.blobs.get(r.final_blob_key));
    azure.calls.length = 0;

    const begun = await beginPublication(
      { row: r, sourceEtag: STAGED_ETAG },
      azure,
    );
    expect(begun.ok, label).toBe(false);
    if (!begun.ok) {
      expect(begun.error.code, label).toBe("stale_attachment");
      expect(begun.error.detail, label).toBe("destination_mismatch");
    }
    const polled = await inspectPublication(
      { row: r, sourceEtag: STAGED_ETAG },
      azure,
    );
    expect(polled.ok, label).toBe(false);
    const discard = await discardFailedPublication(
      { row: r, sourceEtag: STAGED_ETAG },
      azure,
    );
    expect(discard.ok, label).toBe(false);

    // Untouched: no delete, and the object is byte-for-byte what it was.
    expect(
      azure.calls.filter((c) => c.op === "deleteIfExists"),
      label,
    ).toHaveLength(0);
    expect(JSON.stringify(azure.blobs.get(r.final_blob_key)), label).toBe(
      snapshot,
    );
  }

  // Our metadata but no copy record: something PUT this object. Also refused.
  azure.blobs.delete(r.final_blob_key);
  azure.put(r.final_blob_key, {
    etag: '"put-not-copied"',
    metadata: {
      adv_attachment_id: r.id,
      adv_source_etag: STAGED_ETAG,
      adv_staged_key: r.staged_blob_key,
    },
    copy: null,
  });
  const put = await beginPublication(
    { row: r, sourceEtag: STAGED_ETAG },
    azure,
  );
  expect(put.ok).toBe(false);
  if (!put.ok) expect(put.error.detail).toBe("destination_not_a_copy");
});

test("only the final key is ever written, and only by a copy", async () => {
  const azure = new FakeContainer();
  const r = row();
  azure.stage(r);

  await beginPublication({ row: r, sourceEtag: STAGED_ETAG }, azure);
  await inspectPublication({ row: r, sourceEtag: STAGED_ETAG }, azure);
  azure.finishCopy(r.final_blob_key);
  await inspectPublication({ row: r, sourceEtag: STAGED_ETAG }, azure);
  mintAttachmentUploadCredential(r);
  mintAttachmentPlaybackCredential(r);

  expect(azure.writes()).toEqual([r.final_blob_key]);
  expect(azure.calls.filter((c) => c.op === "startCopy")).toHaveLength(1);
  // The staged object was never written to by the adapter — the browser is
  // the only writer there, and the adapter is the only writer at final.
  expect(azure.blobs.get(r.staged_blob_key)!.etag).toBe(STAGED_ETAG);
});

/* -------------------------------------------------------------------------
 * Abort and delete: the seams T14's cleanup needs
 * ---------------------------------------------------------------------- */

test("abort stops a pending copy and is idempotent afterwards", async () => {
  const azure = new FakeContainer();
  const r = row();
  azure.stage(r);

  const begun = await beginPublication(
    { row: r, sourceEtag: STAGED_ETAG },
    azure,
  );
  if (!begun.ok || begun.value.status !== "pending") throw new Error("setup");
  const copyId = begun.value.copyId;

  const aborted = await abortPublication({ row: r, copyId }, azure);
  expect(aborted.ok && aborted.value.aborted).toBe(true);

  const state = await inspectPublication(
    { row: r, sourceEtag: STAGED_ETAG },
    azure,
  );
  expect(state.ok && state.value.status === "aborted").toBe(true);
  if (state.ok) {
    expect(publicationColumns(state.value, STAGED_ETAG).copy_status).toBe(
      "aborted",
    );
  }

  // Again: nothing pending, no error.
  const again = await abortPublication({ row: r, copyId }, azure);
  expect(again.ok && again.value.aborted === false).toBe(true);
  // Never started: same.
  const never = await abortPublication(
    { row: row(), copyId: randomUUID() },
    azure,
  );
  expect(never.ok && never.value.aborted === false).toBe(true);
  const noId = await abortPublication({ row: r, copyId: "" }, azure);
  expect(noId.ok).toBe(false);

  // The aborted destination is a dead copy of ours: discardable.
  const discarded = await discardFailedPublication(
    { row: r, sourceEtag: STAGED_ETAG },
    azure,
  );
  expect(discarded.ok && discarded.value.discarded).toBe(true);
});

test("deletion is idempotent and refuses to pretend a pending destination is gone", async () => {
  const azure = new FakeContainer();
  const r = row();
  azure.stage(r);
  const staged = stagedBlobOf(r);
  const final = publishedBlobOf(r);
  if (!staged.ok || !final.ok) throw new Error("setup");

  const first = await deleteAttachmentBlob(staged.value, azure);
  expect(first.ok && first.value.deleted).toBe(true);
  const second = await deleteAttachmentBlob(staged.value, azure);
  expect(second.ok && second.value.deleted === false).toBe(true);

  azure.stage(r);
  const begun = await beginPublication(
    { row: r, sourceEtag: STAGED_ETAG },
    azure,
  );
  if (!begun.ok || begun.value.status !== "pending") throw new Error("setup");

  const blocked = await deleteAttachmentBlob(final.value, azure);
  expect(blocked.ok).toBe(false);
  if (!blocked.ok) {
    expect(blocked.error.code).toBe("storage_unavailable");
    expect(blocked.error.detail).toBe("pending_copy_blocks_delete");
  }
  expect(azure.blobs.has(r.final_blob_key)).toBe(true);

  await abortPublication({ row: r, copyId: begun.value.copyId }, azure);
  const cleared = await deleteAttachmentBlob(final.value, azure);
  expect(cleared.ok && cleared.value.deleted).toBe(true);
});
