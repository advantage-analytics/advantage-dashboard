import { createHash, createHmac } from "node:crypto";

import { expect, test } from "@playwright/test";
// The SDK's own SigV4 signer, as the reference. A dependency of
// @aws-sdk/client-s3, so it is always installed beside it.
import { SignatureV4 } from "@smithy/signature-v4";

import { safeErrorMessage } from "@/lib/analytics";
import {
  PLAYBACK_CACHE_CONTROL,
  PLAYBACK_SAS_WINDOW_SECONDS,
} from "@/lib/services/splitstep/video-url/azure-sas";
import {
  R2_PRESIGN_MAX_SECONDS,
  mintR2Playback,
  presignR2Get,
  resolveR2Config,
  type R2Config,
} from "@/lib/services/video-storage/r2";
import {
  mintStoredPlayback,
  storeOf,
} from "@/lib/services/video-storage/stores";

/**
 * R2 read URLs for the playback copy (docs/r2-video-storage-plan.md). They
 * are signed by hand, synchronously, so they must match the SDK's signer
 * exactly; and like the Azure SAS they must be the same URL for a whole
 * six-hour window, or the browser re-downloads a match on every page load.
 */

const CONFIG: R2Config = {
  accountId: "0123456789abcdef0123456789abcdef",
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
  bucket: "advantage-videos",
};
const KEY =
  "playback/2c1d6a0e-5c1b-4f7e-9d7a-1b2c3d4e5f60/7f0e1d2c-3b4a-5968-7766-554433221100/original.mp4";

function toBytes(value: unknown): string | Uint8Array {
  if (typeof value === "string" || value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array((value as ArrayBufferView).buffer);
}

class NodeSha256 {
  private readonly hash;
  constructor(secret?: unknown) {
    this.hash = secret
      ? createHmac("sha256", toBytes(secret))
      : createHash("sha256");
  }
  update(data: unknown) {
    this.hash.update(toBytes(data));
  }
  async digest() {
    return new Uint8Array(this.hash.digest());
  }
}

async function referenceSignature(params: {
  key: string;
  signingDate: Date;
  expiresIn: number;
}): Promise<string> {
  const host = `${CONFIG.accountId}.r2.cloudflarestorage.com`;
  const signer = new SignatureV4({
    service: "s3",
    region: "auto",
    sha256: NodeSha256,
    uriEscapePath: false,
    applyChecksum: false,
    credentials: {
      accessKeyId: CONFIG.accessKeyId,
      secretAccessKey: CONFIG.secretAccessKey,
    },
  });
  const signed = await signer.presign(
    {
      method: "GET",
      protocol: "https:",
      hostname: host,
      path: `/${CONFIG.bucket}/${params.key}`,
      query: {
        "response-cache-control": PLAYBACK_CACHE_CONTROL,
        "X-Amz-Content-Sha256": "UNSIGNED-PAYLOAD",
      },
      headers: { host, "x-amz-content-sha256": "UNSIGNED-PAYLOAD" },
    },
    {
      signingDate: params.signingDate,
      expiresIn: params.expiresIn,
      unhoistableHeaders: new Set(["x-amz-content-sha256"]),
      unsignableHeaders: new Set(["x-amz-content-sha256"]),
    },
  );
  return signed.query?.["X-Amz-Signature"] as string;
}

test("the hand-rolled SigV4 presign matches the SDK's signer", async () => {
  const signingDate = new Date("2026-11-09T05:55:00Z");
  for (const expiresIn of [1, 23_700, 50_700, R2_PRESIGN_MAX_SECONDS]) {
    const url = new URL(
      presignR2Get({
        config: CONFIG,
        key: KEY,
        signingDate,
        expiresInSeconds: expiresIn,
        cacheControl: PLAYBACK_CACHE_CONTROL,
      }),
    );
    expect(url.searchParams.get("X-Amz-Signature")).toBe(
      await referenceSignature({ key: KEY, signingDate, expiresIn }),
    );
  }
});

test("a presigned URL names one object, read-only, on R2's S3 host", () => {
  const url = new URL(
    presignR2Get({
      config: CONFIG,
      key: KEY,
      signingDate: new Date("2026-11-09T05:55:00Z"),
      expiresInSeconds: 600,
    }),
  );
  expect(url.host).toBe(`${CONFIG.accountId}.r2.cloudflarestorage.com`);
  expect(url.pathname).toBe(`/${CONFIG.bucket}/${KEY}`);
  expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
  // A GET signature: no list, no write, no other key can reuse it.
  expect(url.searchParams.get("X-Amz-Credential")).toBe(
    `${CONFIG.accessKeyId}/20261109/auto/s3/aws4_request`,
  );
  expect(url.searchParams.has("response-cache-control")).toBe(false);
});

test("R2's seven-day ceiling is enforced", () => {
  const base = {
    config: CONFIG,
    key: KEY,
    signingDate: new Date("2026-11-09T05:55:00Z"),
  };
  expect(() =>
    presignR2Get({ ...base, expiresInSeconds: R2_PRESIGN_MAX_SECONDS + 1 }),
  ).toThrow(/out of range/);
  expect(() => presignR2Get({ ...base, expiresInSeconds: 0 })).toThrow(
    /out of range/,
  );
});

function withR2Env<T>(run: () => T): T {
  const previous = { ...process.env };
  try {
    process.env.R2_ACCOUNT_ID = CONFIG.accountId;
    process.env.R2_READ_ACCESS_KEY_ID = CONFIG.accessKeyId;
    process.env.R2_READ_SECRET_ACCESS_KEY = CONFIG.secretAccessKey;
    process.env.R2_BUCKET_VIDEOS = CONFIG.bucket;
    return run();
  } finally {
    process.env = previous;
  }
}

test("playback mints in one six-hour window are the identical URL, with Cache-Control", () => {
  withR2Env(() => {
    const window = PLAYBACK_SAS_WINDOW_SECONDS * 1000;
    const boundary = Date.UTC(2026, 10, 9, 12);
    const early = mintR2Playback({ key: KEY, now: boundary - window + 1 });
    const late = mintR2Playback({ key: KEY, now: boundary - 30 * 60 * 1000 });
    expect(late.playbackUrl).toBe(early.playbackUrl);
    expect(early.expiresAt.getTime()).toBe(boundary);

    const next = mintR2Playback({
      key: KEY,
      now: boundary - 30 * 60 * 1000 + 1,
    });
    expect(next.playbackUrl).not.toBe(early.playbackUrl);

    const url = new URL(early.playbackUrl);
    expect(url.searchParams.get("response-cache-control")).toBe(
      PLAYBACK_CACHE_CONTROL,
    );
    // Valid from before the mint until the window's end.
    const signedAt = Date.parse(
      url.searchParams
        .get("X-Amz-Date")!
        .replace(
          /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
          "$1-$2-$3T$4:$5:$6Z",
        ),
    );
    const expires = Number(url.searchParams.get("X-Amz-Expires"));
    expect(signedAt + expires * 1000).toBe(boundary);
    expect(signedAt).toBeLessThan(boundary - window + 1);
  });
});

test("the label console's eight hours fit inside R2's ceiling", () => {
  withR2Env(() => {
    const now = Date.UTC(2026, 10, 9, 13, 17);
    const { playbackUrl, expiresAt } = mintR2Playback({
      key: KEY,
      ttlSeconds: 8 * 60 * 60,
      now,
    });
    expect(expiresAt.getTime() - now).toBeGreaterThanOrEqual(
      8 * 60 * 60 * 1000,
    );
    const expires = Number(
      new URL(playbackUrl).searchParams.get("X-Amz-Expires"),
    );
    expect(expires).toBeLessThanOrEqual(R2_PRESIGN_MAX_SECONDS);
  });
});

test("an R2 mint without R2 configured throws instead of signing a broken URL", () => {
  const previous = { ...process.env };
  try {
    for (const name of [
      "R2_ACCOUNT_ID",
      "R2_BUCKET_VIDEOS",
      "R2_READ_ACCESS_KEY_ID",
      "R2_READ_SECRET_ACCESS_KEY",
    ]) {
      delete process.env[name];
    }
    expect(() => mintStoredPlayback({ key: KEY, store: "r2" })).toThrow(
      /R2 is not configured/,
    );
  } finally {
    process.env = previous;
  }
});

test("only 'r2' reads as R2; null and anything else are Azure", () => {
  expect(storeOf("r2")).toBe("r2");
  expect(storeOf("azure")).toBe("azure");
  expect(storeOf(null)).toBe("azure");
  expect(storeOf(undefined)).toBe("azure");
  expect(storeOf("R2")).toBe("azure");
});

test("analytics never carries a presigned URL or its signature", () => {
  const url = presignR2Get({
    config: CONFIG,
    key: KEY,
    signingDate: new Date("2026-11-09T05:55:00Z"),
    expiresInSeconds: 600,
  });
  const signature = new URL(url).searchParams.get("X-Amz-Signature")!;
  for (const message of [
    `fetch failed: ${url}`,
    `bad range for ${url.slice(url.indexOf("?"))}`,
  ]) {
    const safe = safeErrorMessage(new Error(message));
    expect(safe).not.toContain(signature);
    expect(safe).not.toContain(CONFIG.accessKeyId);
  }
  expect(safeErrorMessage("x?sv=2024&sig=abc%2Bdef&se=1")).not.toContain("abc");
});

test("the read token signs; deleting needs the write token", () => {
  const previous = { ...process.env };
  try {
    process.env.R2_ACCOUNT_ID = CONFIG.accountId;
    process.env.R2_BUCKET_VIDEOS = CONFIG.bucket;
    process.env.R2_READ_ACCESS_KEY_ID = "READKEY";
    process.env.R2_READ_SECRET_ACCESS_KEY = "readsecret";
    delete process.env.R2_WRITE_ACCESS_KEY_ID;
    delete process.env.R2_WRITE_SECRET_ACCESS_KEY;
    expect(resolveR2Config("read").ok).toBe(true);
    expect(resolveR2Config("write")).toEqual({
      ok: false,
      missing: "R2_WRITE_ACCESS_KEY_ID",
    });
    const url = new URL(mintR2Playback({ key: KEY }).playbackUrl);
    expect(url.searchParams.get("X-Amz-Credential")).toMatch(/^READKEY\//);
  } finally {
    process.env = previous;
  }
});
