import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * The Roster's Invite dialog holds the join link as its second half.
 *
 * It used to hand off to a popover: "Share a join link instead" closed the
 * dialog and reopened the link under the header's Invite button, where it read
 * as a separate, smaller feature — and on a day-zero roster hung mid-page under
 * a centred button. The link is now `JoinLinkPanel` drawn inside the dialog,
 * behind a two-pill switch.
 *
 * Source-pinned, like `invite-add-handoff.spec.ts`: these tests hold the shape
 * of the wiring, not its behaviour in a browser. That the panel's actions still
 * mint, change and revoke a link is the join-link specs' job, and nothing here
 * runs them.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const INVITE = read("src/components/dashboard/team/roster-invite-dialog.tsx");
const HEADER = read("src/components/dashboard/team/roster-header-buttons.tsx");
const PANEL = read(
  "src/components/dashboard/settings/teams/join-link-popover.tsx",
);
const SHELL = read("src/components/dashboard/team/dialog-shell.tsx");
const MEMBERS = read(
  "src/components/dashboard/settings/teams/team-members-card.tsx",
);

test("the join link is drawn inside the dialog, not handed off to a popover", () => {
  expect(INVITE).toContain('variant="dialog"');
  expect(INVITE).toMatch(/<JoinLinkPanel\s+variant="dialog"/);
  // Hidden on the other half, not unmounted: a remount would drop a link the
  // panel has just minted and reseed from the stale prop.
  expect(INVITE).toMatch(
    /\{showMethods && \(\s*<div role="tabpanel" aria-label="Join link" hidden=\{!onLink\}>/,
  );
  expect(INVITE).not.toMatch(/\{onLink \? \(\s*<div role="tabpanel"/);
  expect(INVITE).toContain("joinLink={joinLink}");

  // The hand-off and its footer link are gone from both ends.
  expect(INVITE).not.toContain("Share a join link instead");
  expect(INVITE).not.toContain("onShareJoinLink");
  expect(HEADER).not.toContain("onShareJoinLink");
  expect(HEADER).not.toContain("JoinLinkPopover");

  // Invite is a plain button again, and the dialog gets the live link.
  expect(HEADER).toMatch(
    /className=\{advButton\("ghost"\)\}\s*onClick=\{\(\) => setInviting\(true\)\}/,
  );
  expect(HEADER).toContain("joinLink={joinLink}");
});

test("the switch is offered only where both halves apply", () => {
  // Not on the receipt, and not when opened for one roster row.
  expect(INVITE).toContain(
    "const showMethods = sent === null && initialTarget === null;",
  );
  expect(INVITE).toContain('const onLink = showMethods && method === "link";');
  expect(INVITE).toMatch(/\{showMethods && \(\s*<MethodPills/);

  // It opens on email, and closing puts it back there.
  expect(INVITE).toContain('useState<"email" | "link">("email")');
  expect(INVITE).toMatch(/function reset\(\) \{[\s\S]*?setMethod\("email"\);/);

  expect(INVITE).toContain('label: "Email invite", icon: Mail');
  expect(INVITE).toContain('label: "Join link", icon: LinkIcon');
});

test("the link half ends on one primary, and email keeps its pair", () => {
  // Done alone for the receipt and the link half; never a second primary.
  expect(INVITE).toMatch(/sent \|\| onLink \? \(/);
  expect(INVITE).toMatch(/disabled=\{!ready\}\s*onClick=\{submit\}/);
});

test("the pills carry no rule and no blue", () => {
  const pills = SHELL.slice(SHELL.indexOf("export function MethodPills"));
  expect(pills).toContain('role="tablist"');
  expect(pills).toContain('role="tab"');
  expect(pills).toContain("aria-selected={isActive}");
  expect(pills).not.toContain("--blue");
  expect(pills).not.toMatch(/border-b|border-t/);
});

test("roles stack in this dialog only", () => {
  expect(INVITE).toContain('layout="stack"');
  expect(SHELL).toContain('layout = "row"');
  // The staff invite shares `RoleChoice` and keeps the row.
  const STAFF = read(
    "src/components/dashboard/settings/teams/staff-invite-dialog.tsx",
  );
  expect(STAFF).toContain("<RoleChoice columns={2}>");
});

test("the seat note groups its squares in fives; narrow columns do not", () => {
  expect(SHELL).toContain(
    "<SeatBoxes seats={seats} adding={adding} grouped />",
  );
  expect(SHELL).toContain("grouped = false");
  // The popover's rung and the Members card keep the undivided squares.
  expect(PANEL).toContain("<SeatBoxes seats={seats} />");
  expect(MEMBERS).toContain("<SeatBoxes seats={seats} />");
});

test("the popover layout is still the default, for Settings › Teams", () => {
  expect(PANEL).toContain('variant = "popover"');
  expect(PANEL).toContain("export function JoinLinkPanel(");
  expect(PANEL).toContain("<JoinLinkPanel {...panel} />");
  expect(MEMBERS).not.toContain('variant="dialog"');

  // The dialog layout: captions instead of dividers, seats as the seat note,
  // shown only while there is a link.
  const dialog = PANEL.slice(
    PANEL.indexOf('if (variant === "dialog") {'),
    PANEL.lastIndexOf('<div className="flex flex-col">'),
  );
  expect(dialog).toContain("Who can join");
  expect(dialog).not.toContain("FloatMenuDivider");
  expect(dialog).not.toContain("<SeatBoxes");
  expect(dialog).toMatch(/\{showLink && \(\s*<SeatNote/);
});
