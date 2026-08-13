/**
 * Browser → Azure Blob upload, in blocks.
 *
 * Runs in the browser against a `cw` SAS URL minted by
 * /api/splitstep/upload-url. Nothing here signs anything, which is why it needs
 * no SDK: `@azure/storage-blob` exists to build credentials, and this code is
 * handed one. Keeping it out of the client bundle is worth the ~80 lines.
 *
 * ── Why blocks rather than one PUT ───────────────────────────────────────────
 * Azure's single-shot Put Blob caps well below the ~7.45 GB the validator
 * accepts, so a whole-file PUT cannot carry the largest allowed match. The R2
 * path this replaces had the same defect — its 5 GiB single-PUT ceiling sat
 * under the accepted size too, and nobody had hit it yet.
 *
 * Blocks also make one failure cost one block instead of the whole transfer,
 * which on a multi-gigabyte upload over home wifi is the difference between a
 * retry and starting an hour over.
 *
 * The protocol is two calls:
 *   PUT {url}&comp=block&blockid={id}   once per chunk, in any order
 *   PUT {url}&comp=blocklist            once, naming the ids in final order
 * Nothing is visible at the blob name until the block list commits, so an
 * abandoned upload leaves uncommitted blocks that Azure garbage-collects after
 * a week rather than a corrupt half-video.
 */

/**
 * Bytes per block. 8 MiB is large enough that per-request overhead disappears
 * on a big file and small enough that losing one to a network blip is cheap.
 */
export const AZURE_BLOCK_SIZE_BYTES = 8 * 1024 * 1024;

/** Azure's hard ceiling on blocks in one blob. The block size scales to respect it. */
const AZURE_MAX_BLOCKS = 50_000;

/** Attempts per block, including the first. */
const MAX_ATTEMPTS_PER_BLOCK = 3;

export interface BlockUploadOptions {
  file: File;
  /** SAS URL from /api/splitstep/upload-url. Already carries its query string. */
  uploadUrl: string;
  /** Content type recorded on the committed blob. */
  contentType?: string;
  /** Cancels in-flight and pending blocks. */
  signal?: AbortSignal;
  /** Called with cumulative bytes accepted by Azure, including the block in flight. */
  onProgress?: (loadedBytes: number, totalBytes: number) => void;
}

class UploadAbortedError extends Error {
  constructor() {
    super('Upload cancelled');
    this.name = 'UploadAbortedError';
  }
}

/**
 * Block ids must be equal-length before base64 encoding, or Azure rejects the
 * block list. Six digits covers 999,999 blocks — twenty times the ceiling
 * above — so the width never has to change with file size.
 */
function blockIdFor(index: number): string {
  return btoa(String(index).padStart(6, '0'));
}

/**
 * Whether a failed attempt is worth repeating.
 *
 * `null` means the request never got a status — a dropped connection, which is
 * the common case worth retrying. A 403 is almost always an expired SAS, and
 * retrying that just spends three attempts arriving at the same answer.
 */
function isRetriable(status: number | null): boolean {
  if (status === null) return true;
  return status === 408 || status === 429 || status >= 500;
}

/**
 * One PUT, with upload progress.
 *
 * XHR rather than fetch: fetch still has no upload-progress event, and progress
 * on this path is not cosmetic — the percentage it produces is what
 * reap_stalled_uploads() reads to decide an upload is still alive.
 */
function put(params: {
  url: string;
  body: Blob | string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  onProgress?: (loadedInThisRequest: number) => void;
}): Promise<void> {
  const { url, body, headers, signal, onProgress } = params;

  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new UploadAbortedError());
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);

    for (const [name, value] of Object.entries(headers ?? {})) {
      xhr.setRequestHeader(name, value);
    }

    const onAbort = () => xhr.abort();
    signal?.addEventListener('abort', onAbort, { once: true });

    const done = () => signal?.removeEventListener('abort', onAbort);

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded);
      };
    }

    xhr.onload = () => {
      done();
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      // Azure puts a machine-readable code in x-ms-error-code and prose in the
      // body. The code is the part worth surfacing: AuthenticationFailed on an
      // expired SAS, BlobNotFound, and so on.
      const code = xhr.getResponseHeader('x-ms-error-code');
      reject(
        Object.assign(
          new Error(
            `Azure returned ${xhr.status}${code ? ` (${code})` : ''}` +
              `${xhr.responseText ? `: ${xhr.responseText.slice(0, 300)}` : ''}`
          ),
          { status: xhr.status }
        )
      );
    };

    xhr.onerror = () => {
      done();
      // Deliberately names CORS. A browser reports a blocked cross-origin PUT
      // as an indistinguishable network failure, and a missing CORS rule on the
      // storage account is by far the likeliest cause of one here.
      reject(
        Object.assign(
          new Error(
            'Network error uploading to Azure. If this is a new storage ' +
              'account, check the CORS rule on the blob service.'
          ),
          { status: null }
        )
      );
    };

    xhr.onabort = () => {
      done();
      reject(new UploadAbortedError());
    };

    xhr.send(body);
  });
}

/** Retry wrapper. Backs off 1s then 2s; an abort is never retried. */
async function putWithRetry(
  params: Parameters<typeof put>[0],
  label: string
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_BLOCK; attempt++) {
    try {
      await put(params);
      return;
    } catch (err) {
      if (err instanceof UploadAbortedError) throw err;

      lastError = err;
      const status = (err as { status?: number | null }).status ?? null;

      if (!isRetriable(status) || attempt === MAX_ATTEMPTS_PER_BLOCK) break;

      console.warn(
        `Retrying ${label} (attempt ${attempt + 1}/${MAX_ATTEMPTS_PER_BLOCK})`
      );
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }

  throw lastError;
}

/**
 * Upload a file as a block blob and commit it.
 *
 * Blocks go up one at a time. Parallelism would raise throughput on a
 * high-latency link, but it makes progress non-monotonic and turns a partial
 * failure into "which blocks landed" bookkeeping — neither is worth it before
 * the path has carried a real match.
 *
 * Resolves once the block list is committed, which is the first moment the blob
 * exists at its name. Rejects with UploadAbortedError if `signal` fires.
 */
export async function uploadFileInBlocks({
  file,
  uploadUrl,
  contentType,
  signal,
  onProgress,
}: BlockUploadOptions): Promise<void> {
  if (file.size === 0) {
    throw new Error('The selected file is empty.');
  }

  // Grow the block size rather than exceed the block ceiling. At 8 MiB the
  // ceiling is ~390 GB, far above anything the validator accepts, so this only
  // ever matters if that limit is raised.
  const blockSize = Math.max(
    AZURE_BLOCK_SIZE_BYTES,
    Math.ceil(file.size / AZURE_MAX_BLOCKS)
  );
  const blockCount = Math.ceil(file.size / blockSize);
  const blockIds: string[] = [];

  let committedBytes = 0;

  for (let index = 0; index < blockCount; index++) {
    const start = index * blockSize;
    const end = Math.min(start + blockSize, file.size);
    const blockId = blockIdFor(index);
    blockIds.push(blockId);

    await putWithRetry(
      {
        url: `${uploadUrl}&comp=block&blockid=${encodeURIComponent(blockId)}`,
        // No third argument to slice(), so the chunk carries no type and XHR
        // sends no Content-Type. The blob's type is set once, at commit.
        body: file.slice(start, end),
        signal,
        onProgress: (loadedInThisBlock) =>
          onProgress?.(committedBytes + loadedInThisBlock, file.size),
      },
      `block ${index + 1}/${blockCount}`
    );

    committedBytes = end;
    onProgress?.(committedBytes, file.size);
  }

  const blockList =
    '<?xml version="1.0" encoding="utf-8"?><BlockList>' +
    blockIds.map((id) => `<Latest>${id}</Latest>`).join('') +
    '</BlockList>';

  await putWithRetry(
    {
      url: `${uploadUrl}&comp=blocklist`,
      body: blockList,
      headers: {
        'Content-Type': 'application/xml',
        // The one place the blob's own content type is set. Without it Azure
        // stores application/octet-stream, and the vendor fetching the file
        // sees a type that disagrees with the bytes.
        'x-ms-blob-content-type': contentType || 'video/mp4',
      },
      signal,
    },
    'block list commit'
  );
}

export { UploadAbortedError };
