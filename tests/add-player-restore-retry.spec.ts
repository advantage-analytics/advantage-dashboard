import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

/**
 * `restore()`'s retry survives its own revalidation — `add-player-dialog.tsx`.
 *
 * `restoreProgramPlayer` revalidates the roster the same way `addProgramPlayer`
 * does, so once it succeeds, the freshly-revalidated `former` prop no longer
 * carries the profile: it is live again, not "former." Deriving the offered
 * profile from `former` alone would then drop the Restore button and note the
 * moment a trailing, optional invite fails — leaving only "Add to roster" on
 * screen, which a coach clicking it (with an email that does not match what is
 * now on file) turns into the exact silent second profile this feature exists
 * to prevent, since `add_program_player`'s duplicate check only fires against
 * a live row's own stored email.
 *
 * `restoreTarget` is the fix: the matched profile, frozen at the moment
 * `restore()` is called, so a retry after a failed invite still has something
 * to offer even once `former` has moved on. This file cannot render the real
 * component (`@playwright/test` rewrites JSX in everything it transpiles, and
 * the dialog pulls in Radix and two server actions), so it pins the mechanism
 * to the source, the same way `add-player-spot-gate.spec.ts` does for the spot
 * gate: string matches, not behaviour. What this cannot catch is documented in
 * that file's header and applies here too — a `restoreTarget` wired to the
 * wrong branch or read at the wrong point would pass every assertion below.
 */

const SOURCE = readFileSync(
  join(process.cwd(), "src/components/dashboard/team/add-player-dialog.tsx"),
  "utf8",
);

test("restoreTarget freezes the match before the RPC that would remove it from `former`", () => {
  // Set at the top of restore(), before startRestore's async body — so it is
  // committed whether or not this call actually reaches restoreProgramPlayer
  // (a retry after a failed invite must keep the same target, not drop it).
  const restoreFn = SOURCE.match(
    /function restore\(person: FormerPlayer\) \{([\s\S]*?)\n {2}}\n/,
  )?.[1];
  expect(restoreFn).toBeTruthy();
  const setTargetIndex = restoreFn!.indexOf("setRestoreTarget(");
  const startRestoreIndex = restoreFn!.indexOf("startRestore(");
  expect(setTargetIndex).toBeGreaterThan(-1);
  expect(startRestoreIndex).toBeGreaterThan(-1);
  expect(setTargetIndex).toBeLessThan(startRestoreIndex);
  expect(restoreFn).toContain("setRestoreTarget({ form: formKey, person });");

  // The offered profile falls back to the frozen target, keyed on the same
  // form, only once `formerPlayerMatch` (reading the live, possibly-stale
  // `former` prop) has nothing.
  expect(SOURCE).toMatch(
    /const restorable =\s*formerPlayerMatch\(former, \{ firstName, lastName, email }\) \?\?\s*\(restoreTarget !== null && restoreTarget\.form === formKey\s*\? restoreTarget\.person\s*: null\);/,
  );

  // Cleared on every exit, same as `created` — a fresh open must not carry a
  // stale retry target from a form the coach already left.
  expect(SOURCE).toMatch(
    /function reset\(\)[\s\S]*?setCreated\(null\);\s*setRestoreTarget\(null\);/,
  );
});
