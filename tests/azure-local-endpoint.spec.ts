import { test, expect } from "@playwright/test";
import {
  resolveAzureStorageConfig,
  mintUploadSas,
} from "@/lib/services/splitstep/video-url/azure-sas";

test("Azure emulator endpoint is explicit, loopback-only, and refused in production", () => {
  const previous = { ...process.env };
  try {
    process.env.AZURE_STORAGE_ACCOUNT = "devstoreaccount1";
    process.env.AZURE_STORAGE_KEY = Buffer.alloc(32).toString("base64");
    process.env.AZURE_STORAGE_CONTAINER = "t19-video";
    Object.assign(process.env, { NODE_ENV: "test" });
    for (const endpoint of [
      "http://example.com",
      "https://localhost:10000",
      "http://user@localhost:10000",
      "http://127.0.0.1:10000/?unsafe=yes",
    ]) {
      process.env.AZURE_STORAGE_ENDPOINT = endpoint;
      expect(resolveAzureStorageConfig().ok).toBe(false);
    }
    process.env.AZURE_STORAGE_ENDPOINT =
      "http://127.0.0.1:10000/devstoreaccount1";
    expect(resolveAzureStorageConfig().ok).toBe(true);
    const sas = new URL(mintUploadSas({ blobName: "fixture.mp4" }).uploadUrl);
    expect(sas.origin).toBe("http://127.0.0.1:10000");
    expect(sas.searchParams.get("spr")).toBe("https,http");
    expect(sas.searchParams.get("sp")).toBe("cw");
    Object.assign(process.env, { NODE_ENV: "production" });
    expect(resolveAzureStorageConfig().ok).toBe(false);
    delete process.env.AZURE_STORAGE_ENDPOINT;
    expect(mintUploadSas({ blobName: "fixture.mp4" }).uploadUrl).toContain(
      "https://devstoreaccount1.blob.core.windows.net/",
    );
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
});
