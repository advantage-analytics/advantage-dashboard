import { expect, test } from "@playwright/test";
import { gzipSync } from "node:zlib";

import {
  GZIP_SUFFIX,
  readVendorJson,
  sasExpiry,
} from "@/lib/services/splitstep/vendor-archive";

/** Keeping every file a completion links to, before its SAS url expires. */

test("sasExpiry reads the se= expiry off a SAS url, and null without one", () => {
  expect(
    sasExpiry(
      "https://acct.blob.core.windows.net/c/x.json?sv=2024&se=2026-10-11T08%3A30%3A58Z&sig=abc",
    )?.toISOString(),
  ).toBe("2026-10-11T08:30:58.000Z");
  expect(sasExpiry("https://acct.blob.core.windows.net/c/x.json")).toBeNull();
  expect(sasExpiry("not a url")).toBeNull();
});

test("readVendorJson inflates a .gz key and passes a plain one through", async () => {
  const json = JSON.stringify([{ frame: 1, player_position: "top" }]);
  const stored: Record<string, Buffer> = {
    "players.json.gz": gzipSync(Buffer.from(json)),
    "trajectories.json": Buffer.from(json),
  };
  const supabase = {
    storage: {
      from: () => ({
        download: async (key: string) => ({
          data: new Blob([stored[key]]),
          error: null,
        }),
      }),
    },
  } as unknown as Parameters<typeof readVendorJson>[0];

  expect(GZIP_SUFFIX).toBe(".gz");
  expect(await readVendorJson(supabase, "players.json.gz")).toBe(json);
  expect(await readVendorJson(supabase, "trajectories.json")).toBe(json);
});
