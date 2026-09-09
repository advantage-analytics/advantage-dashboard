import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

/**
 * Invite → Add player, the hand-off — `roster-invite-dialog.tsx` offering it
 * and `roster-header-buttons.tsx` performing it, both reached from
 * `/dashboard/team/roster` via `roster-view.tsx`.
 *
 * A coach types an address into Invite and realises the athlete has no account
 * and no roster row yet. Invite would send email and wait; Add player creates
 * the row now. The offer sits under the email field and carries the address
 * across — nothing else. Invite collects an address, never a name, so no name
 * is invented for the other two fields.
 *
 * What it is NOT is a redirect. "Someone new" + Send still sends the
 * invitation, spends a seat on acceptance and mints a self-owned profile; that
 * capability is untouched, and the last test here pins the send path that
 * proves it.
 *
 * ── The three conditions on the offer ───────────────────────────────────────
 * All three are one rule from different sides: it appears only when this
 * invitation would MINT a profile rather than bind one.
 *   · a profile chosen (`linked`)  — the duplicate the picker exists to prevent
 *   · an empty field               — no address to carry
 *   · a parsed list (`listed`)     — many people, one row would drop the rest
 *
 * ── The stale prefill ───────────────────────────────────────────────────────
 * `addInitial` lives in the header for the length of ONE opening of Add player.
 * It is cleared when that dialog closes, so the next plain "Add player" click
 * cannot inherit an address from a hand-off that already happened.
 *
 * ── What is reproduced, and why ─────────────────────────────────────────────
 * Both files are Next client components pulling in Radix and server actions,
 * and `@playwright/test` rewrites JSX in everything it transpiles — so neither
 * can be rendered from here. The state machine below is a hand replica driven
 * through real clicks in a real browser; the source-pinning tests assert that
 * the lines the replica models still exist verbatim.
 *
 * ── What this cannot catch ──────────────────────────────────────────────────
 * The source-pinning tests check literal text and nothing else. They cannot
 * tell whether React renders the offer where the JSX claims (it is asserted to
 * sit between the closing `</SettingsField>` and the role block as source
 * text — that says nothing about its painted position, its contrast against
 * the surface behind it, or whether `SettingsField` being a `<label>` swallows
 * the click the way it does for the chip remove buttons two elements above);
 * whether `draft`, `linked` and `listed` hold the values this file assumes at
 * the moment the offer is evaluated; or whether `onHandOffToAddPlayer` is
 * actually the prop the header passes rather than a same-named prop on a
 * different child.
 *
 * The behavioural test never touches either real component. Its replica has
 * its own flags and its own guard, written the way this file assumes the real
 * ones are written, so a guard reading the wrong flag, an `addInitial` cleared
 * on the wrong event, a hand-off that closed Invite without opening Add
 * player, or a prefill effect that never fires because Add player was already
 * open would all pass here unnoticed. Nothing in this spec exercises
 * `inviteMember`, `create_program_invite`, seat accounting, or the mail send:
 * the fourth test proves only that the call site still reads as it did, not
 * that an invitation still arrives. That the "Someone new" invitation still
 * WORKS end to end is covered by code review and by the live-DB invite specs,
 * not by this file.
 */

const INVITE = readFileSync(
  join(process.cwd(), "src/components/dashboard/team/roster-invite-dialog.tsx"),
  "utf8",
);

const HEADER = readFileSync(
  join(
    process.cwd(),
    "src/components/dashboard/team/roster-header-buttons.tsx",
  ),
  "utf8",
);

test("the offer renders under the email field, on exactly three conditions", () => {
  // The copy, verbatim — the arrow is an entity in source.
  expect(INVITE).toContain("Add a coach-managed profile instead &rarr;");

  // Guarded on: no profile chosen, no parsed list, something typed.
  expect(INVITE).toContain(
    '{onHandOffToAddPlayer && !linked && !listed && draft !== "" && (',
  );
  // ...and it hands over the trimmed address, nothing else.
  expect(INVITE).toContain("onHandOffToAddPlayer(address);");
  expect(INVITE).not.toMatch(/onHandOffToAddPlayer\(\s*\{/);

  /* It leaves through `close()`, which is what resets this dialog. The header
     flips `inviting` itself, so a hand-off that skipped `close()` would be the
     one exit that kept the typed address — and this dialog stays mounted, so
     reopening Invite would offer to invite somebody the coach just added as a
     coach-managed row. `address` is read before `close()` clears `draft`. */
  expect(INVITE).toMatch(
    /const address = draft;\s*close\(\);\s*onHandOffToAddPlayer\(address\);/,
  );

  // Quiet blue text, not a button — the DS's footer-left register.
  expect(INVITE).toMatch(
    /text-\[11px\] font-medium text-\[var\(--blue\)\][\s\S]{0,80}\n\s*>\n\s*Add a coach-managed profile instead/,
  );
  expect(INVITE).not.toMatch(
    /advButton\([^)]*\)[\s\S]{0,200}Add a coach-managed profile/,
  );

  // Positioned under the email field, above the role block.
  expect(INVITE).toMatch(
    /<\/SettingsField>[\s\S]*?Add a coach-managed profile instead[\s\S]*?\{linked \? \(/,
  );
});

test("the header performs the hand-off and clears it afterwards", () => {
  expect(HEADER).toContain("onHandOffToAddPlayer={handOffToAddPlayer}");

  // Email only, no invented name; Invite closes, Add player opens.
  expect(HEADER).toMatch(
    /function handOffToAddPlayer\(email: string\) \{\s*if \(addingPlayer\) return;\s*setAddInitial\(\{ email \}\);\s*setInviting\(false\);\s*setAddingPlayer\(true\);\s*\}/,
  );
  expect(HEADER).not.toMatch(/setAddInitial\(\{[^}]*(firstName|lastName)/);

  // The stale-prefill close: `addInitial` does not outlive one opening.
  expect(HEADER).toMatch(
    /onOpenChange=\{\(next\) => \{\s*setAddingPlayer\(next\);\s*if \(!next\) setAddInitial\(undefined\);\s*\}\}/,
  );
  expect(HEADER).toContain("initial={addInitial}");
});

test('the invitation path is untouched — "Someone new" still sends', () => {
  // "Someone new" is still `null`, and still reaches `pick`.
  const PICKER = readFileSync(
    join(
      process.cwd(),
      "src/components/dashboard/team/invite-target-picker.tsx",
    ),
    "utf8",
  );
  expect(PICKER).toContain(
    "onSelect(index === 0 ? null : players[index - 1]);",
  );
  expect(INVITE).toContain("onSelect={pick}");

  // Send still calls `submit`, and `submit` still calls the same action with
  // the same three arguments — a null target still means an unbound invite.
  expect(INVITE).toMatch(/disabled=\{!ready\}\s*onClick=\{submit\}/);
  expect(INVITE).toMatch(
    /const result = await inviteMember\(\{\s*email: address,\s*role,\s*playerId: target\?\.profileId \?\? null,\s*\}\);/,
  );
  // Readiness is still "there is an address and nothing in flight" — the offer
  // added no condition to it.
  expect(INVITE).toContain("const ready = addresses.length > 0 && !pending;");
  expect(INVITE).toContain('"Send invite"');
});

/**
 * The two state machines, transcribed: the invite dialog deciding whether to
 * show the offer, and the header deciding what happens when it is taken.
 */
const HARNESS = `
  <input id="email">
  <button id="pick-profile" type="button">Choose profile</button>
  <button id="pick-new" type="button">Someone new</button>
  <button id="paste-list" type="button">Paste list</button>
  <div id="invite">Invite</div>
  <button id="handoff" type="button" hidden>Add a coach-managed profile instead</button>
  <button id="send" type="button">Send invite</button>
  <output id="sent"></output>
  <div id="add" hidden>Add player</div>
  <input id="add-email">
  <button id="add-open" type="button">Add player</button>
  <button id="add-close" type="button">Close add</button>
  <output id="add-initial"></output>
  <script>
    // ── invite dialog ──────────────────────────────────────────────────────
    let target = null;        // the picker's selection
    let emails = [];          // parsed chips
    let inviteOpen = true;
    // ── header ─────────────────────────────────────────────────────────────
    let addOpen = false, addInitial = undefined, wasAddOpen = false;

    const email = document.getElementById('email');
    const handoff = document.getElementById('handoff');

    function draft() { return email.value.trim(); }
    function render() {
      const linked = target !== null;
      const listed = emails.length > 0;
      handoff.hidden = !(!linked && !listed && draft() !== '');
      document.getElementById('invite').hidden = !inviteOpen;
      document.getElementById('add').hidden = !addOpen;
      document.getElementById('add-initial').textContent =
        addInitial === undefined ? 'none' : JSON.stringify(addInitial);
    }
    // Add player's own open-edge prefill, from add-player-dialog.tsx.
    function addEffect() {
      const opening = addOpen && !wasAddOpen;
      wasAddOpen = addOpen;
      if (!opening) return;
      if (addInitial && addInitial.email) document.getElementById('add-email').value = addInitial.email;
    }
    function handOffToAddPlayer(value) {
      if (addOpen) return;            // already open: leave it alone
      addInitial = { email: value };  // email only — no name is invented
      inviteOpen = false;
      addOpen = true;
      addEffect();
    }

    email.addEventListener('input', render);
    document.getElementById('pick-profile').addEventListener('click', () => {
      target = { profileId: 'p-1', email: 'priya@school.edu' };
      email.value = target.email; render();
    });
    document.getElementById('pick-new').addEventListener('click', () => { target = null; render(); });
    document.getElementById('paste-list').addEventListener('click', () => {
      emails = ['a@school.edu', 'b@school.edu']; email.value = ''; render();
    });
    handoff.addEventListener('click', () => { handOffToAddPlayer(draft()); render(); });
    // The invitation, unchanged by any of the above.
    document.getElementById('send').addEventListener('click', () => {
      const list = [...emails, ...(draft() ? [draft()] : [])];
      if (list.length === 0) return;
      document.getElementById('sent').textContent =
        'invited ' + list.join(',') + ' playerId=' + (target ? target.profileId : 'null');
    });
    document.getElementById('add-open').addEventListener('click', () => { addOpen = true; addEffect(); render(); });
    document.getElementById('add-close').addEventListener('click', () => {
      addOpen = false;
      addInitial = undefined;               // one opening only
      document.getElementById('add-email').value = '';
      addEffect(); render();
    });
    render();
  </script>`;

test("the offer appears only for an unbound single address", async ({
  page,
}) => {
  await page.setContent(HARNESS);
  const handoff = page.locator("#handoff");

  // Empty field: nothing to carry.
  await expect(handoff).toBeHidden();

  await page.fill("#email", "maya@school.edu");
  await expect(handoff).toBeVisible();

  // A chosen profile: the duplicate the picker exists to prevent.
  await page.click("#pick-profile");
  await expect(handoff).toBeHidden();

  // Back to "Someone new" with an address typed: offered again.
  await page.click("#pick-new");
  await page.fill("#email", "maya@school.edu");
  await expect(handoff).toBeVisible();

  // A pasted list is many people; one row would drop the rest.
  await page.click("#paste-list");
  await expect(handoff).toBeHidden();
});

test("taking the offer closes Invite and opens Add player with the email", async ({
  page,
}) => {
  await page.setContent(HARNESS);

  await page.click("#pick-new");
  await page.fill("#email", "maya@school.edu");
  await page.click("#handoff");

  await expect(page.locator("#invite")).toBeHidden();
  await expect(page.locator("#add")).toBeVisible();
  await expect(page.locator("#add-email")).toHaveValue("maya@school.edu");
  // Only the address crossed over.
  await expect(page.locator("#add-initial")).toHaveText(
    '{"email":"maya@school.edu"}',
  );
});

test("the hand-off is a no-op while Add player is already open", async ({
  page,
}) => {
  await page.setContent(HARNESS);

  // A coach is part-way through Add player already.
  await page.click("#add-open");
  await page.fill("#add-email", "typed-by-hand@school.edu");

  await page.fill("#email", "maya@school.edu");
  await page.click("#handoff");

  await expect(page.locator("#add-email")).toHaveValue(
    "typed-by-hand@school.edu",
  );
  await expect(page.locator("#add-initial")).toHaveText("none");
});

test("a closed Add player forgets the hand-off, so the next open is empty", async ({
  page,
}) => {
  await page.setContent(HARNESS);

  await page.fill("#email", "maya@school.edu");
  await page.click("#handoff");
  await expect(page.locator("#add-email")).toHaveValue("maya@school.edu");

  await page.click("#add-close");
  await expect(page.locator("#add-initial")).toHaveText("none");

  // A later, unrelated "Add player" must not inherit September's address.
  await page.click("#add-open");
  await expect(page.locator("#add")).toBeVisible();
  await expect(page.locator("#add-email")).toHaveValue("");
});

test('"Someone new" plus Send still sends the invitation, offer or not', async ({
  page,
}) => {
  await page.setContent(HARNESS);

  await page.click("#pick-new");
  await page.fill("#email", "maya@school.edu");
  // The offer is on screen and deliberately ignored.
  await expect(page.locator("#handoff")).toBeVisible();
  await page.click("#send");
  await expect(page.locator("#sent")).toHaveText(
    "invited maya@school.edu playerId=null",
  );
});
