import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

/**
 * A Server Component must never hand an element to a Radix `asChild` Slot —
 * directly (`<TooltipTrigger asChild>`, `<PopoverTrigger asChild>` …) or
 * through `ChromeTooltip`, which wraps its children in `TooltipTrigger
 * asChild`.
 *
 * The element crosses the RSC boundary as a reference, and when the server
 * render reaches the Slot before React has resolved it, Radix's `SlotClone`
 * (`isValidElement(children) ? clone : null`) renders nothing. The browser,
 * which has the element by then, draws it — so the page fails to hydrate.
 * That is how every load of a coach-managed player's page
 * (`/dashboard/team/roster/[playerId]`) threw a hydration error: the rail's
 * `CoachManagedMark` was a server module, and the SSR HTML left its glyph
 * out. `ShareMatchButton`'s `trigger` prop on the match page is the same
 * lesson, taken earlier.
 *
 * The rule, checked over `src/`: a `.tsx` module that renders `asChild` or
 * `<ChromeTooltip` in code (comments aside) starts with `"use client"`.
 */

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return tsxFiles(path);
    return entry.name.endsWith(".tsx") ? [path] : [];
  });
}

/** The source without its comments — `//` lines and `/* … *\/` blocks,
 *  which covers JSX's `{/* … *\/}` — so prose about a Slot never counts. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const isClientModule = (source: string) =>
  /^\s*["']use client["'];?/.test(source);

test("no Server Component hands an element to an asChild Slot or ChromeTooltip", () => {
  const offenders = tsxFiles("src").filter((file) => {
    const source = readFileSync(file, "utf8");
    if (isClientModule(source)) return false;
    const body = code(source);
    return /\basChild\b/.test(body) || /<ChromeTooltip\b/.test(body);
  });
  expect(offenders).toEqual([]);
});

test("CoachManagedMark is a client module, so the player page's rail hydrates", () => {
  expect(
    isClientModule(
      readFileSync("src/components/ui/coach-managed-mark.tsx", "utf8"),
    ),
  ).toBe(true);
});
