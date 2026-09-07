import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

/**
 * Add player's `initial` prefill — `add-player-dialog.tsx`, reached from
 * `/dashboard/team/roster` via `roster-view.tsx` → `roster-header-buttons.tsx`.
 *
 * The receiving end of a hand-off from the Invite dialog: a coach who has
 * already typed an address there should not retype it here. The awkward part
 * is that `AddPlayerDialog` stays MOUNTED whether or not it is showing, so the
 * prefill has to be applied on the closed→open transition in an effect — a
 * `useState` initializer would run once, on first mount, and a coach who
 * cancelled and reopened would get an empty form the second time.
 *
 * The other half is that `reset()` clears to *empty*, not to `initial`. Cancel
 * must leave no residue behind it; the next open re-applies the prefill from
 * the prop, which still says it.
 *
 * ── What is reproduced, and why ─────────────────────────────────────────────
 * The dialog is a Next client component pulling in Radix and two server
 * actions, and `@playwright/test` rewrites JSX in everything it transpiles —
 * so it cannot be rendered from here. The state machine below is a hand
 * replica driven through real clicks in a real browser, and the first test
 * pins it to the source: the lines the replica models are asserted to still
 * exist verbatim in `add-player-dialog.tsx`.
 *
 * ── What this cannot catch ──────────────────────────────────────────────────
 * The source-pinning test only checks that the effect, its `[open]` dependency
 * list, the open-edge ref and the empty `reset()` still exist as literal text.
 * It says nothing about whether React actually runs that effect at the moment
 * this file assumes, whether the three setters are wired to the three fields
 * the labels claim, or whether `RosterDialog` mounts and unmounts its children
 * in a way that would change the mounting premise the whole design rests on.
 * The behavioural test never touches the real component: the replica has its
 * own inputs and its own open-edge check, written the way this file assumes
 * the real one is written, so an effect keyed on the wrong value, a prefill
 * applied over a coach's own typing, or a `formKey` built from a different
 * list of fields would all pass both tests unnoticed. The header wiring in
 * `roster-header-buttons.tsx` is checked only as source text — that the state
 * exists and is passed — never as rendered behaviour. Those aspects rely on
 * code review, not on this spec.
 */

const SOURCE = readFileSync(
  join(process.cwd(), 'src/components/dashboard/team/add-player-dialog.tsx'),
  'utf8'
);

const HEADER = readFileSync(
  join(process.cwd(), 'src/components/dashboard/team/roster-header-buttons.tsx'),
  'utf8'
);

test('the prefill the replica models is the one the dialog ships', () => {
  // Applied on the open edge, in an effect, never in a state initializer.
  expect(SOURCE).toContain('const wasOpen = useRef(false);');
  expect(SOURCE).toContain('const opening = open && !wasOpen.current;');
  expect(SOURCE).toMatch(
    /if \(initial\.firstName\) setFirstName\(initial\.firstName\);[\s\S]*?if \(initial\.lastName\) setLastName\(initial\.lastName\);[\s\S]*?if \(initial\.email\) setEmail\(initial\.email\);[\s\S]*?\}, \[open\]\);/
  );
  expect(SOURCE).not.toMatch(/useState\((?:initial|props\.initial)/);

  // `reset()` clears to empty, not to `initial` — Cancel leaves no residue.
  expect(SOURCE).toMatch(
    /function reset\(\) \{\s*setFirstName\(""\);\s*setLastName\(""\);[\s\S]*?setEmail\(""\);/
  );
  // ...and nothing inside `reset()` mentions `initial` at all.
  const resetBody = SOURCE.match(/function reset\(\) \{[\s\S]*?\n {2}\}/);
  expect(resetBody).not.toBeNull();
  expect(resetBody![0]).not.toContain('initial');

  // The suppression key is still every argument `addProgramPlayer` is handed.
  expect(SOURCE).toMatch(
    /const formKey = \[\s*firstName\.trim\(\),\s*lastName\.trim\(\),\s*classYear,\s*lineupSpot,\s*email\.trim\(\),\s*\]\.join\("\\u0000"\);/
  );
  expect(SOURCE).toContain(
    'created !== null && created.form === formKey ? created.profileId : null'
  );

  // The header holds the state beside its existing flags and passes it down.
  expect(HEADER).toContain('const [addingPlayer, setAddingPlayer] = useState(false);');
  expect(HEADER).toMatch(
    /const \[addInitial, setAddInitial\] = useState<AddPlayerInitial \| undefined>/
  );
  expect(HEADER).toContain('initial={addInitial}');
});

/**
 * The dialog's prefill and its duplicate-suppression key, transcribed: an
 * open-edge effect that fills three fields, a reset that empties all of them,
 * and a `formKey` that decides whether the created row is still excluded.
 */
const HARNESS = `
  <input id="first"><input id="last"><input id="email">
  <button id="open" type="button">Open</button>
  <button id="cancel" type="button">Cancel</button>
  <div id="dialog" hidden></div>
  <output id="excluded"></output>
  <script>
    const INITIAL = { firstName: 'Maya', lastName: 'Ortiz', email: 'maya@school.edu' };
    let open = false, wasOpen = false;
    // A row this dialog just created, keyed on the exact form that wrote it.
    const created = { profileId: 'p-1', form: ['Maya', 'Ortiz', '', '', 'maya@school.edu'].join('\\u0000') };

    const first = document.getElementById('first');
    const last = document.getElementById('last');
    const email = document.getElementById('email');
    const dialog = document.getElementById('dialog');
    const excluded = document.getElementById('excluded');

    function formKey() {
      return [first.value.trim(), last.value.trim(), '', '', email.value.trim()].join('\\u0000');
    }
    function reset() { first.value = ''; last.value = ''; email.value = ''; }
    function render() {
      dialog.hidden = !open;
      excluded.textContent = created.form === formKey() ? created.profileId : 'none';
    }
    // The effect: fires only on the closed→open edge, after any reset.
    function effect() {
      const opening = open && !wasOpen;
      wasOpen = open;
      if (!opening) return;
      if (INITIAL.firstName) first.value = INITIAL.firstName;
      if (INITIAL.lastName) last.value = INITIAL.lastName;
      if (INITIAL.email) email.value = INITIAL.email;
    }
    document.getElementById('open').addEventListener('click', () => {
      open = true; effect(); render();
    });
    document.getElementById('cancel').addEventListener('click', () => {
      open = false; reset(); effect(); render();
    });
    for (const el of [first, last, email]) el.addEventListener('input', render);
    render();
  </script>`;

test('the prefill survives a cancel-and-reopen, and Cancel leaves no residue', async ({
  page,
}) => {
  await page.setContent(HARNESS);
  const first = page.locator('#first');
  const last = page.locator('#last');
  const email = page.locator('#email');

  // First open: the prefill lands.
  await page.click('#open');
  await expect(first).toHaveValue('Maya');
  await expect(last).toHaveValue('Ortiz');
  await expect(email).toHaveValue('maya@school.edu');

  // An unchanged form still resolves the created row, so the duplicate notes
  // stay off the row this dialog just wrote.
  await expect(page.locator('#excluded')).toHaveText('p-1');

  // Editing any keyed field drops the exclusion — a changed form is a
  // different write, and the notes come back.
  await email.fill('other@school.edu');
  await expect(page.locator('#excluded')).toHaveText('none');
  await email.fill('maya@school.edu');
  await expect(page.locator('#excluded')).toHaveText('p-1');

  // Cancel empties every field: no residue for the next open to inherit.
  await page.click('#cancel');
  await expect(page.locator('#dialog')).toBeHidden();
  await expect(first).toHaveValue('');
  await expect(last).toHaveValue('');
  await expect(email).toHaveValue('');

  // Second open, same `initial`: the prefill is applied again — which a
  // `useState` initializer on a component that stays mounted could not do.
  await page.click('#open');
  await expect(first).toHaveValue('Maya');
  await expect(last).toHaveValue('Ortiz');
  await expect(email).toHaveValue('maya@school.edu');
  await expect(page.locator('#excluded')).toHaveText('p-1');
});
