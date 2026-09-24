import { expect, test } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * One skeleton primitive family. `src/components/dashboard/loading/pending.tsx`
 * (`PendingBar`, `PendingRegion`, `PendingFrame`) is the only file that writes
 * the `--surface-skeleton` token, every pulse respects reduced motion, and no
 * route's loading state spins. Rules: `.skills/advantage-analytics-design/
 * reference/empty-and-loading.md` § Loading Skeleton.
 *
 * Offline: the files are read as text, nothing is rendered.
 */

const ROOT = resolve(".");
const SRC = resolve("src");

/** The primitives, and the token's own definition. */
const TOKEN_HOMES = [
  "src/components/dashboard/loading/pending.tsx",
  "src/styles/design-system/colors.css",
];

/**
 * Files that still write the skeleton token or a bare `animate-pulse` by hand.
 * Exact: an entry that no longer breaks either rule fails the last test, so a
 * task that migrates a file deletes its line here. Never add to it.
 */
const LEGACY: string[] = [];

/** Loading files allowed a spinner while they still hold one. */
const SPIN_EXCEPTIONS = [
  "src/components/dashboard/loading/page-skeletons.tsx", // T34 (SimplePageLoader)
];

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const FILES = new Map(
  walk(SRC).map((path) => [
    relative(ROOT, path).split("\\").join("/"),
    readFileSync(path, "utf8"),
  ]),
);

const writesToken = (source: string) => source.includes("--surface-skeleton");
/** An `animate-pulse` not written `motion-safe:animate-pulse`. */
const barePulse = (source: string) =>
  /(?<!motion-safe:)\banimate-pulse\b/.test(source);

const isLoadingFile = (file: string) =>
  file.startsWith("src/components/dashboard/loading/") ||
  (file.startsWith("src/app/") && file.endsWith("/loading.tsx"));

test("LEGACY is sorted, unique and names real files", () => {
  expect([...LEGACY].sort()).toEqual(LEGACY);
  expect(new Set(LEGACY).size).toBe(LEGACY.length);
  for (const file of [...LEGACY, ...SPIN_EXCEPTIONS])
    expect(FILES.has(file), file).toBe(true);
});

test("the skeleton token is written only by the primitives", () => {
  const offenders = [...FILES]
    .filter(
      ([file, source]) => writesToken(source) && !TOKEN_HOMES.includes(file),
    )
    .map(([file]) => file)
    .filter((file) => !LEGACY.includes(file));
  expect(offenders).toEqual([]);
  expect(
    writesToken(FILES.get("src/components/dashboard/loading/pending.tsx")!),
  ).toBe(true);
});

test("every pulse respects reduced motion", () => {
  const offenders = [...FILES]
    .filter(([file, source]) => barePulse(source) && !LEGACY.includes(file))
    .map(([file]) => file);
  expect(offenders).toEqual([]);
});

test("no route's loading state spins", () => {
  const offenders = [...FILES]
    .filter(
      ([file, source]) =>
        isLoadingFile(file) &&
        source.includes("animate-spin") &&
        !SPIN_EXCEPTIONS.includes(file),
    )
    .map(([file]) => file);
  expect(offenders).toEqual([]);
});

test("LEGACY and the spin exceptions hold only files that still need them", () => {
  const cleared = LEGACY.filter((file) => {
    const source = FILES.get(file) ?? "";
    return !writesToken(source) && !barePulse(source);
  });
  expect(cleared, "migrated — delete these lines from LEGACY").toEqual([]);
  const stopped = SPIN_EXCEPTIONS.filter(
    (file) => !(FILES.get(file) ?? "").includes("animate-spin"),
  );
  expect(stopped, "no spinner left — delete the exception").toEqual([]);
});

test("the unused shadcn skeleton stays gone", () => {
  expect(FILES.has("src/components/ui/skeleton.tsx")).toBe(false);
  const importers = [...FILES]
    .filter(([, source]) => source.includes("ui/skeleton"))
    .map(([file]) => file);
  expect(importers).toEqual([]);
});
