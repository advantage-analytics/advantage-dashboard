/**
 * Cloudflare R2: where the playback copy lives, so viewing costs no egress.
 *
 * Azure still takes every upload and keeps the original, because SplitStep
 * reads only an Azure SAS URL (`splitstep/video-url/azure-sas.ts`). Azure
 * bills every byte a browser downloads; R2 bills none. So the file people
 * actually watch, the playback worker's copy (`workers/playback/run.sh`),
 * is written here, and every player signs a read URL for it here
 * (`docs/r2-video-storage-plan.md`).
 *
 * ── Signing ────────────────────────────────────────────────────────────────
 * Presigned GETs are SigV4 query signatures computed locally, so this file
 * signs them itself, synchronously, rather than through
 * `@aws-sdk/s3-request-presigner` (async): every caller of the Azure
 * `mintPlaybackSas` is synchronous, and the two have to be interchangeable.
 * `tests/r2-presign.spec.ts` checks the result against `@smithy/signature-v4`
 * byte for byte.
 *
 * The signing date is pinned to {@link playbackSasWindow}'s start, as the
 * Azure SAS pins `st`, so every mint in one six-hour window is the SAME URL
 * and the browser's cache holds across page loads. `response-cache-control`
 * is signed in as Azure's `rscc` is.
 *
 * Like an account-key SAS, a presigned URL cannot be withdrawn before it
 * expires. Rotating the token kills all of them. It is read-only, for one
 * object, and only ever minted behind the same access checks as before.
 *
 * Never log or return one of these URLs anywhere but to the player.
 */

import { createHash, createHmac } from "node:crypto";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import {
  PLAYBACK_CACHE_CONTROL,
  playbackSasWindow,
} from "@/lib/services/splitstep/video-url/azure-sas";

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

/**
 * Two token pairs, both scoped to the one bucket:
 * - `read` (Object Read): presigns playback GETs and answers HEAD. The only
 *   pair the app on Vercel holds.
 * - `write` (Object Read & Write): the playback worker, the backfill script,
 *   and deletes. Never on Vercel.
 */
export type R2Access = "read" | "write";

/** Env var names, in one place, for the preflight and the client to agree. */
export const R2_ENV_VARS = {
  read: [
    "R2_ACCOUNT_ID",
    "R2_BUCKET_VIDEOS",
    "R2_READ_ACCESS_KEY_ID",
    "R2_READ_SECRET_ACCESS_KEY",
  ],
  write: [
    "R2_ACCOUNT_ID",
    "R2_BUCKET_VIDEOS",
    "R2_WRITE_ACCESS_KEY_ID",
    "R2_WRITE_SECRET_ACCESS_KEY",
  ],
} as const;

/** R2's ceiling on a presigned URL's life: seven days. */
export const R2_PRESIGN_MAX_SECONDS = 7 * 24 * 60 * 60;

const PLAYBACK_TTL_SECONDS = 30 * 60;

/**
 * An `R2_*` value as pasted into a dashboard: surrounding whitespace (a
 * trailing newline) and one pair of matching quotes are not part of it.
 * Without this, `R2_ACCOUNT_ID="…"` or a value with a newline fails the
 * account-ID check and every R2 read quietly becomes an Azure read.
 */
export function cleanEnvValue(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  let value = raw.trim();
  const quoted = /^(["'])([\s\S]*)\1$/.exec(value);
  if (quoted) value = quoted[2].trim();
  return value === "" ? undefined : value;
}

export function resolveR2Config(
  access: R2Access = "read",
): { ok: true; config: R2Config } | { ok: false; missing: string } {
  const [, , keyName, secretName] = R2_ENV_VARS[access];
  const accountId = cleanEnvValue(process.env.R2_ACCOUNT_ID);
  const bucket = cleanEnvValue(process.env.R2_BUCKET_VIDEOS);
  const accessKeyId = cleanEnvValue(process.env[keyName]);
  const secretAccessKey = cleanEnvValue(process.env[secretName]);
  if (!accountId) return { ok: false, missing: "R2_ACCOUNT_ID" };
  // The format check runs on the cleaned value. The reason names the
  // variable and the rule, never the value.
  if (!/^[0-9a-f]{32}$/i.test(accountId))
    return { ok: false, missing: "R2_ACCOUNT_ID (not 32 hex characters)" };
  if (!bucket) return { ok: false, missing: "R2_BUCKET_VIDEOS" };
  if (!accessKeyId) return { ok: false, missing: keyName };
  if (!secretAccessKey) return { ok: false, missing: secretName };
  return {
    ok: true,
    config: { accountId, accessKeyId, secretAccessKey, bucket },
  };
}

export function requireR2Config(access: R2Access = "read"): R2Config {
  const resolved = resolveR2Config(access);
  if (!resolved.ok) {
    throw new Error(`R2 is not configured: ${resolved.missing} is missing.`);
  }
  return resolved.config;
}

function r2Host(config: R2Config): string {
  return `${config.accountId}.r2.cloudflarestorage.com`;
}

/** RFC 3986 encoding, as SigV4 requires: `encodeURIComponent` leaves `!'()*`. */
function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** Path-style object path: each key segment encoded, the slashes kept. */
function objectPath(config: R2Config, key: string): string {
  return `/${rfc3986(config.bucket)}/${key.split("/").map(rfc3986).join("/")}`;
}

function amzDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

const sha256Hex = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const hmac = (key: Buffer | string, value: string) =>
  createHmac("sha256", key).update(value).digest();

/**
 * A SigV4 presigned GET for one object. Pure but for the inputs, so the
 * spec can pin `signingDate` and compare with the reference signer.
 */
export function presignR2Get(params: {
  config: R2Config;
  key: string;
  signingDate: Date;
  expiresInSeconds: number;
  cacheControl?: string;
}): string {
  const { config, key, signingDate, expiresInSeconds, cacheControl } = params;
  if (
    !Number.isInteger(expiresInSeconds) ||
    expiresInSeconds < 1 ||
    expiresInSeconds > R2_PRESIGN_MAX_SECONDS
  ) {
    throw new Error(`R2 presign expiry out of range: ${expiresInSeconds}s`);
  }
  const host = r2Host(config);
  const path = objectPath(config, key);
  const stamp = amzDate(signingDate);
  const day = stamp.slice(0, 8);
  const scope = `${day}/auto/s3/aws4_request`;

  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Content-Sha256": "UNSIGNED-PAYLOAD",
    "X-Amz-Credential": `${config.accessKeyId}/${scope}`,
    "X-Amz-Date": stamp,
    "X-Amz-Expires": String(expiresInSeconds),
    "X-Amz-SignedHeaders": "host",
    ...(cacheControl ? { "response-cache-control": cacheControl } : {}),
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${rfc3986(k)}=${rfc3986(query[k])}`)
    .join("&");
  const canonicalRequest = [
    "GET",
    path,
    canonicalQuery,
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    stamp,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${config.secretAccessKey}`, day), "auto"), "s3"),
    "aws4_request",
  );
  const signature = hmac(signingKey, stringToSign).toString("hex");
  return `https://${host}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

/**
 * A read URL for one object, for a browser to play: the R2 twin of
 * `mintPlaybackSas`, with the same six-hour window and `Cache-Control`.
 * Throws when R2 is not configured.
 */
export function mintR2Playback(params: {
  key: string;
  ttlSeconds?: number;
  now?: number;
}): { playbackUrl: string; expiresAt: Date } {
  const config = requireR2Config();
  const ttlSeconds = params.ttlSeconds ?? PLAYBACK_TTL_SECONDS;
  const { startsOn, expiresOn } = playbackSasWindow(
    params.now ?? Date.now(),
    ttlSeconds,
  );
  // Whole seconds: the window's start is backdated by the clock-skew margin,
  // which is already whole, so this is exact.
  const expiresInSeconds = Math.round(
    (expiresOn.getTime() - startsOn.getTime()) / 1000,
  );
  return {
    playbackUrl: presignR2Get({
      config,
      key: params.key,
      signingDate: startsOn,
      expiresInSeconds,
      cacheControl: PLAYBACK_CACHE_CONTROL,
    }),
    expiresAt: expiresOn,
  };
}

let cachedClient: { client: S3Client; fingerprint: string } | null = null;

/** The S3 client for server-side calls (HEAD, DELETE, uploads in scripts). */
export function r2Client(config: R2Config = requireR2Config()): S3Client {
  const fingerprint = `${config.accountId}:${config.accessKeyId}`;
  if (cachedClient?.fingerprint === fingerprint) return cachedClient.client;
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${r2Host(config)}`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    // R2 implements no flexible checksums on most calls; ask for none.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  cachedClient = { client, fingerprint };
  return client;
}

/**
 * A 404 from a HEAD. Ambiguous by nature: a HEAD answer has no body, so the
 * SDK names a missing bucket `NotFound` too. Fine for the backfill script,
 * whose next write fails loudly on a wrong bucket; the app's existence check
 * uses {@link r2ObjectExists}, which can tell the two apart.
 */
export function isNotFound(error: unknown): boolean {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === "NotFound" || e?.$metadata?.httpStatusCode === 404;
}

type S3Error = {
  name?: string;
  Code?: string;
  $metadata?: { httpStatusCode?: number };
};

/**
 * The answer to a one-byte ranged GET, as "is the object there". Only a
 * genuine missing object is `false`: `NoSuchKey`, by name. Every other
 * failure throws — above all `NoSuchBucket`, a 404 too, which is what a
 * wrong `R2_BUCKET_VIDEOS` looks like (production, 2026-11-10: the Azure
 * container's name, so every copy read as missing and nothing was logged).
 * A 416 means the object exists but is empty.
 */
export async function objectExistsFrom(
  get: () => Promise<{
    Body?: { transformToByteArray?: () => Promise<unknown> };
  }>,
): Promise<boolean> {
  try {
    const response = await get();
    await response.Body?.transformToByteArray?.(); // release the 1-byte body
    return true;
  } catch (error) {
    const e = error as S3Error;
    const code = e?.name ?? e?.Code;
    if (code === "NoSuchKey") return false;
    if (code === "InvalidRange" || e?.$metadata?.httpStatusCode === 416) {
      return true;
    }
    throw error;
  }
}

/**
 * Whether an object is there, with the READ pair. A GET of one byte rather
 * than a HEAD: a HEAD's 404 has no body, so a missing bucket and a missing
 * key look the same, and a wrong bucket name would read as "every copy is
 * gone" — silently. (A presigned GET URL cannot answer this either: its
 * signature is for one method, and the browser needs no HEAD.)
 */
export async function r2ObjectExists(key: string): Promise<boolean> {
  const config = requireR2Config();
  return objectExistsFrom(() =>
    r2Client(config).send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Range: "bytes=0-0",
      }),
    ),
  );
}

/**
 * Remove one object, with the WRITE pair. R2 answers 204 for a key that is
 * not there. Throws where only the read pair is configured (Vercel).
 */
export async function deleteR2Object(key: string): Promise<void> {
  const config = requireR2Config("write");
  await r2Client(config).send(
    new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
  );
}
