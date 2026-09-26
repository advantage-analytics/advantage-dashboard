import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { AdminTeamActivityEntry } from "@/lib/data/admin-team-server";
import { ADMIN_ACTIVITY_LABELS } from "@/components/admin/admin-activity-labels";
import { createLoader } from "./fixtures/vm-modules";

/**
 * Admin › Teams › `#activity` — the Activity log card (T19).
 *
 * Rendered offline through `fixtures/vm-modules` with nothing stubbed: the
 * card is a plain server component over `SettingsCard`, `shortDate` and
 * `activityLabel`, all real modules.
 */

type CardProps = {
  activity: readonly AdminTeamActivityEntry[];
};

function load() {
  const loader = createLoader();
  return loader.load("src/components/admin/admin-activity-card.tsx") as {
    AdminActivityCard: React.ComponentType<CardProps>;
  };
}

function render(props: CardProps): string {
  const { AdminActivityCard } = load();
  return text(
    renderToStaticMarkup(React.createElement(AdminActivityCard, props)),
  );
}

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&mdash;|—/g, "—")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function entry(
  overrides: Partial<AdminTeamActivityEntry> = {},
): AdminTeamActivityEntry {
  return {
    id: "1",
    action: "player.added",
    createdAt: "2026-09-10T12:00:00Z",
    actorUserId: "u1",
    actorName: "Avery Lin",
    ...overrides,
  };
}

test("titles the card Activity log", () => {
  const out = render({ activity: [] });
  expect(out).toContain("Activity log");
});

test("an empty audit log shows a line, not nothing", () => {
  const out = render({ activity: [] });
  expect(out).toContain("No activity recorded on this program yet.");
});

test("a row shows the sentence label, the actor and a date", () => {
  const out = render({
    activity: [entry({ action: "ownership.transferred" })],
  });
  expect(out).toContain("Ownership transferred");
  expect(out).toContain("Avery Lin");
  expect(out).toContain("Sep 10");
});

test("a null actor renders an em dash, not a blank", () => {
  const out = render({
    activity: [entry({ actorUserId: null, actorName: null })],
  });
  expect(out).toContain("—");
});

test("every one of the 26 program_audit_log_action_check values has a label", () => {
  // The live list, read via Supabase MCP `pg_get_constraintdef` of
  // `program_audit_log_action_check` — kept verbatim so a drift between the
  // constraint and this map fails here rather than in the console.
  const LIVE_ACTIONS = [
    "player.added",
    "player.updated",
    "player.archived",
    "player.claimed",
    "player.merged",
    "invite.created",
    "invite.revoked",
    "invite.accepted",
    "member.removed",
    "member.role_changed",
    "seats.changed",
    "member.account_deleted",
    "lineup.set",
    "ownership.transferred",
    "event.deleted",
    "player.restored",
    "match.attached",
    "member.left",
    "program.conference_changed",
    "console.result_added",
    "console.analysis_attached",
    "join_request.approved",
    "join_request.declined",
    "pilot.end_changed",
    "pilot.ended",
    "program.details_changed",
  ];

  expect(LIVE_ACTIONS).toHaveLength(26);

  for (const action of LIVE_ACTIONS) {
    const label = ADMIN_ACTIVITY_LABELS[action];
    expect(label, `missing label for "${action}"`).toBeTruthy();
    expect(label.toLowerCase()).not.toContain("splitstep");
  }
});

test("an unknown action falls back to its raw string instead of throwing or hiding the row", () => {
  const out = render({
    activity: [entry({ action: "some.future_action" })],
  });
  expect(out).toContain("some.future_action");
});
