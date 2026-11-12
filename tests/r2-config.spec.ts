import { expect, test } from "@playwright/test";

import {
  cleanEnvValue,
  objectExistsFrom,
  resolveR2Config,
} from "@/lib/services/video-storage/r2";
import {
  mintStoredPlayback,
  resetR2ConfigWarningForTests,
  storedObjectExists,
} from "@/lib/services/video-storage/stores";

/**
 * Production, 2026-11-10: a job marked R2, its copy in R2, and every viewer
 * still served Azure with nothing in the logs. A bad Vercel value made
 * `resolveR2Config()` fail, and the readers fell back silently. Pasted
 * values are now cleaned, and a fallback for that reason is said out loud,
 * once, naming the variable and never its value.
 */

const ACCOUNT = "0123456789abcdef0123456789abcdef";
const SECRET = "a-secret-that-must-never-be-logged";
const KEY = "playback/u/m/original.mp4";

function withEnv<T>(vars: Record<string, string | undefined>, run: () => T): T {
  const previous = { ...process.env };
  try {
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    return run();
  } finally {
    process.env = previous;
  }
}

const R2 = {
  R2_ACCOUNT_ID: ACCOUNT,
  R2_BUCKET_VIDEOS: "advantage-video",
  R2_READ_ACCESS_KEY_ID: "READKEY",
  R2_READ_SECRET_ACCESS_KEY: SECRET,
  VIDEO_READ_STORE: undefined,
};
const AZURE = {
  AZURE_STORAGE_ACCOUNT: "devstoreaccount1",
  AZURE_STORAGE_KEY: Buffer.from("k".repeat(32)).toString("base64"),
  AZURE_STORAGE_CONTAINER: "advantage-videos",
  AZURE_STORAGE_ENDPOINT: undefined,
};

function captureWarnings<T>(run: () => T): { result: T; warnings: string[] } {
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) =>
    warnings.push(args.map(String).join(" "));
  try {
    return { result: run(), warnings };
  } finally {
    console.warn = original;
  }
}

test("pasted values lose surrounding whitespace and one pair of quotes", () => {
  expect(cleanEnvValue(`${ACCOUNT}\n`)).toBe(ACCOUNT);
  expect(cleanEnvValue(`  "${ACCOUNT}"  `)).toBe(ACCOUNT);
  expect(cleanEnvValue(`'${ACCOUNT}'`)).toBe(ACCOUNT);
  expect(cleanEnvValue(`" ${ACCOUNT}\n"`)).toBe(ACCOUNT);
  expect(cleanEnvValue(`"${ACCOUNT}'`)).toBe(`"${ACCOUNT}'`); // unmatched: kept
  expect(cleanEnvValue("   ")).toBeUndefined();
  expect(cleanEnvValue('""')).toBeUndefined();
  expect(cleanEnvValue(undefined)).toBeUndefined();
});

test("a quoted or newline-padded account ID now resolves, cleaned", () => {
  for (const pasted of [`"${ACCOUNT}"`, `${ACCOUNT}\r\n`, ` '${ACCOUNT}' `]) {
    const resolved = withEnv(
      { ...R2, R2_ACCOUNT_ID: pasted, R2_BUCKET_VIDEOS: " advantage-video\n" },
      () => resolveR2Config(),
    );
    expect(resolved).toEqual({
      ok: true,
      config: {
        accountId: ACCOUNT,
        bucket: "advantage-video",
        accessKeyId: "READKEY",
        secretAccessKey: SECRET,
      },
    });
  }
});

test("the account-ID format is still checked after cleaning, and never echoed", () => {
  const bad = "not-an-account-id";
  const resolved = withEnv({ ...R2, R2_ACCOUNT_ID: `"${bad}"` }, () =>
    resolveR2Config(),
  );
  expect(resolved).toEqual({
    ok: false,
    missing: "R2_ACCOUNT_ID (not 32 hex characters)",
  });
  expect(JSON.stringify(resolved)).not.toContain(bad);
});

test("a copy marked R2 on a deployment that cannot read R2 is said once, by variable name", async () => {
  resetR2ConfigWarningForTests();
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) =>
    warnings.push(args.map(String).join(" "));
  const previous = { ...process.env };
  try {
    Object.assign(process.env, R2, { R2_ACCOUNT_ID: "bad value" });
    delete process.env.VIDEO_READ_STORE;
    expect(await storedObjectExists(KEY, "r2")).toBe(false);
    expect(await storedObjectExists(KEY, "r2")).toBe(false);
  } finally {
    process.env = previous;
    console.warn = original;
  }
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toBe(
    "[video-storage] R2 is not configured (R2_ACCOUNT_ID (not 32 hex characters)); reading from Azure instead",
  );
  expect(warnings[0]).not.toContain("bad value");
  expect(warnings[0]).not.toContain(SECRET);
});

test("an R2 mint without R2 configured signs Azure and warns once", () => {
  resetR2ConfigWarningForTests();
  const { result, warnings } = captureWarnings(() =>
    withEnv({ ...AZURE, ...R2, R2_READ_SECRET_ACCESS_KEY: "  " }, () => [
      mintStoredPlayback({ key: KEY, store: "r2" }),
      mintStoredPlayback({ key: KEY, store: "r2" }),
    ]),
  );
  for (const { playbackUrl } of result) {
    expect(new URL(playbackUrl).host).toBe(
      "devstoreaccount1.blob.core.windows.net",
    );
  }
  expect(warnings).toEqual([
    "[video-storage] R2 is not configured (R2_READ_SECRET_ACCESS_KEY); reading from Azure instead",
  ]);
});

test("with R2 configured nothing is warned", async () => {
  resetR2ConfigWarningForTests();
  const { warnings } = captureWarnings(() =>
    withEnv({ ...AZURE, ...R2 }, () =>
      mintStoredPlayback({ key: KEY, store: "r2" }),
    ),
  );
  expect(warnings).toEqual([]);
});

/* ------------------------------------------------- what "not there" means */

const s3Error = (name: string, status: number) =>
  Object.assign(new Error(name), {
    name,
    $metadata: { httpStatusCode: status },
  });

test("only a genuinely missing object reads as absent", async () => {
  await expect(
    objectExistsFrom(async () => {
      throw s3Error("NoSuchKey", 404);
    }),
  ).resolves.toBe(false);
});

test("a wrong bucket is an error, not 'absent' (production, 2026-11-10)", async () => {
  // R2_BUCKET_VIDEOS held the Azure container's name: every copy read as
  // missing, and nothing was logged.
  await expect(
    objectExistsFrom(async () => {
      throw s3Error("NoSuchBucket", 404);
    }),
  ).rejects.toMatchObject({ name: "NoSuchBucket" });
  // Any 404 without NoSuchKey — the shape a HEAD gives — is an error too.
  await expect(
    objectExistsFrom(async () => {
      throw s3Error("NotFound", 404);
    }),
  ).rejects.toMatchObject({ name: "NotFound" });
  await expect(
    objectExistsFrom(async () => {
      throw s3Error("AccessDenied", 403);
    }),
  ).rejects.toMatchObject({ name: "AccessDenied" });
});

test("a found object, or an empty one (416), is there, and its body is released", async () => {
  let released = false;
  await expect(
    objectExistsFrom(async () => ({
      Body: {
        transformToByteArray: async () => {
          released = true;
          return new Uint8Array(1);
        },
      },
    })),
  ).resolves.toBe(true);
  expect(released).toBe(true);
  await expect(
    objectExistsFrom(async () => {
      throw s3Error("InvalidRange", 416);
    }),
  ).resolves.toBe(true);
});
