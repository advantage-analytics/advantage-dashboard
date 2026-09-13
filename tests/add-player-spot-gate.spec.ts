import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

/**
 * Add player's occupied-spot confirm — `add-player-dialog.tsx`, reached from
 * `/dashboard/team/roster` via `roster-view.tsx`.
 *
 * A shared lineup spot is legal here: `program_players` has no unique index on
 * it, and `spotHeldNote` says so on screen. The gate is not validation, it is
 * an acknowledgement — the coach ticks once to say the shared line was meant,
 * and moving to a *different* occupied spot has to ask again.
 *
 * ── What is reproduced, and why ─────────────────────────────────────────────
 * The dialog is a Next client component pulling in Radix and two server
 * actions, and `@playwright/test` rewrites JSX in everything it transpiles —
 * so it cannot be rendered from here. The state machine below is therefore a
 * hand replica driven through real clicks in a real browser, and the first
 * test pins it to the source: the two lines the replica models are asserted to
 * still exist verbatim in `add-player-dialog.tsx`. If they change, that test
 * fails and this replica must be updated with them.
 *
 * ── What this cannot catch ──────────────────────────────────────────────────
 * The source-pinning test only checks that the `ready` expression and the
 * `disabled` prop it feeds still exist as literal text; it says nothing about
 * where that checkbox actually lives or what it is wired to. The behavioural
 * test below never touches the real component at all, so a checkbox bound to
 * the wrong state variable, a checkbox rendered outside the
 * `spotTakenBy.length > 0` guard so it shows (or hides) at the wrong times, or
 * wrong label copy or wrong classes on the checkbox would all pass both tests
 * without being noticed — the replica has its own checkbox, wired the way this
 * file assumes the real one is wired, and neither test can tell the two apart.
 * Those aspects of `add-player-dialog.tsx` are relying on code review, not on
 * this spec.
 */

const SOURCE = readFileSync(
  join(process.cwd(), "src/components/dashboard/team/add-player-dialog.tsx"),
  "utf8",
);

test("the gate the replica models is the one the dialog ships", () => {
  // `ready` gains exactly one term, and the button is untouched behind it.
  expect(SOURCE).toContain("(spotTakenBy.length === 0 || spotAcknowledged)");
  expect(SOURCE).toContain("disabled={!ready || pending}");

  // The acknowledgement resets both on close and on every spot change.
  expect(SOURCE).toMatch(
    /function reset\(\)[\s\S]*?setSpotAcknowledged\(false\);[\s\S]*?\n {2}}/,
  );
  expect(SOURCE).toMatch(
    /function changeLineupSpot\(next: string\) \{\s*setLineupSpot\(next\);\s*setSpotAcknowledged\(false\);/,
  );

  // Quiet gate, not an alarm: the one red row stays the one the server wrote.
  expect(SOURCE.match(/<DialogProblem/g)).toEqual(["<DialogProblem"]);
  expect(SOURCE).toContain("<DialogProblem message={error} />");
});

/**
 * The dialog's gate, transcribed: two names present, and — only when the
 * chosen spot is held — an acknowledgement that the spot change clears.
 */
const HARNESS = `
  <label><input type="checkbox" id="ack"> share</label>
  <select id="spot">
    <option value="">Not set</option>
    <option value="1">#1</option>
    <option value="3">#3</option>
    <option value="5">#5</option>
  </select>
  <button id="add" type="button">Add to roster</button>
  <script>
    // #3 and #5 are held on this fixture roster; #1 is free.
    const HELD = ['3', '5'];
    let spot = '';
    let ack = false;
    const first = 'Maya', last = 'Ortiz';       // both names already typed
    const spotEl = document.getElementById('spot');
    const ackEl = document.getElementById('ack');
    const addEl = document.getElementById('add');
    const ackLabel = ackEl.parentElement;

    function render() {
      const taken = spot !== '' && HELD.includes(spot);
      ackLabel.hidden = !taken;
      ackEl.checked = ack;
      const ready =
        first.trim() !== '' && last.trim() !== '' && (!taken || ack);
      addEl.disabled = !ready;
    }
    spotEl.addEventListener('change', (e) => {
      spot = e.target.value;
      ack = false;             // an acknowledgement never outlives its spot
      render();
    });
    ackEl.addEventListener('change', (e) => { ack = e.target.checked; render(); });
    render();
  </script>`;

test("an occupied spot gates the primary until it is acknowledged", async ({
  page,
}) => {
  await page.setContent(HARNESS);
  const add = page.locator("#add");
  const ack = page.locator("#ack");

  // No spot chosen: nothing to acknowledge, nothing to gate.
  await expect(add).toBeEnabled();
  await expect(ack).toBeHidden();

  // An occupied spot raises the confirm and holds the button.
  await page.selectOption("#spot", "3");
  await expect(ack).toBeVisible();
  await expect(ack).not.toBeChecked();
  await expect(add).toBeDisabled();

  // Ticking it releases the button.
  await ack.check();
  await expect(add).toBeEnabled();

  // A *different* occupied spot asks again rather than carrying the tick over.
  await page.selectOption("#spot", "5");
  await expect(ack).toBeVisible();
  await expect(ack).not.toBeChecked();
  await expect(add).toBeDisabled();

  // A free spot asks nothing at all.
  await page.selectOption("#spot", "1");
  await expect(ack).toBeHidden();
  await expect(add).toBeEnabled();
});
