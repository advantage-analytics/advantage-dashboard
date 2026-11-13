import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

/**
 * The vendor's trimmed video copy was retired on 2026-11-12
 * (docs/r2-video-storage-plan.md): every job keeps its upload and gets a
 * playback copy, so the ~70 GB of `trimmed/` in Azure Hot bought nothing.
 * Nothing may start a new copy, and no player may fall back to one.
 * `purgeMatchStorage` still deletes any `trimmed_object_key` a row names.
 */

const code = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

test("no delivery path copies the vendor's trimmed video any more", () => {
  for (const path of [
    "src/app/api/webhooks/splitstep/route.ts",
    "src/lib/services/splitstep/vendor-archive.ts",
    "src/app/api/cron/archive-vendor-files/route.ts",
  ]) {
    const source = code(path);
    expect(source, path).not.toMatch(/archiveTrimmedVideo|beginCopyFromURL/);
    expect(source, path).not.toMatch(/trimmed_object_key|trimmedKey/);
  }
});

test("the purge still deletes a trimmed copy a row names", () => {
  expect(code("src/lib/services/matches/purge-match-storage.ts")).toContain(
    "j.trimmed_object_key",
  );
});

test("the deletion script reads every job row, paged and ordered, before deciding", () => {
  // PostgREST caps a response at 1,000 rows. An unpaged read would let the
  // hold-back miss a job that still plays a trimmed copy.
  const script = code("scripts/delete-trimmed-copies.ts");
  expect(script).toMatch(/readAllPages<JobRow>\(/);
  expect(script).toMatch(/\.order\("id", \{ ascending: true \}\)/);
  // It only ever deletes under trimmed/, checked again per delete.
  expect(script).toMatch(/if \(!key\.startsWith\(PREFIX\)\) throw/);
  // A delete counts only when Azure says it deleted something.
  expect(script).toMatch(/if \(succeeded\) deleted \+= 1;/);
});
