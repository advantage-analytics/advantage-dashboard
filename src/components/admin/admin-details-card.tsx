"use client";

import { useState } from "react";

import { AdminTeamDetailsDialog } from "@/components/admin/admin-team-details-dialog";
import { TEXT_ACTION } from "@/components/admin/admin-people-card";
import {
  SettingsCard,
  SettingsCardTitle,
} from "@/components/dashboard/settings/settings-card";
import { uploadPolicyLabel } from "@/lib/workspace/types";
import type { AdminTeamProgram } from "@/lib/data/admin-team-server";

/**
 * The rail's fourth card: the program's directory record and the rules its
 * staff work under — the same twelve-column record `AdminTeamDetailsDialog`
 * edits, read back as six facts.
 *
 * The canvas (`TeamPage.dc.html`'s `#details` section) draws exactly six
 * rows — `Program key`, `Staff page`, `Time zone`, `Who can upload`, `Who
 * edits the schedule`, `Roster` — and this card is that list, nothing added.
 * Home venue is deliberately absent: `team-page-header.tsx` already carries
 * it as one of the header's four facts on a program that has one, and a
 * second printing of the same field two sections down would answer a
 * question the header already answered without saying anything the header
 * didn't.
 *
 * **Values are the same vocabularies the T10 dialog renders**, imported
 * rather than re-derived: `uploadPolicyLabel()` for both policy rows — the
 * events ladder is a subset of the upload ladder's rungs and wording (see
 * `EventsPolicy` in `workspace/types.ts`), so one function serves both rows
 * without a second copy of "Owner and coaches" / "All staff" existing
 * anywhere to drift from the dialog's own `MenuSelect` options.
 *
 * `Edit` opens the T10 dialog directly — the same component the header's
 * outline button opens, with the same `open`/`onOpenChange` contract — so
 * there is exactly one form behind the twelve columns, never a second one
 * that could save a different shape of patch.
 */
export function AdminDetailsCard({ program }: { program: AdminTeamProgram }) {
  const [editing, setEditing] = useState(false);

  return (
    <SettingsCard className="gap-0 bg-[var(--surface-card)] py-6">
      <SettingsCardTitle
        trailing={
          <button
            type="button"
            className={TEXT_ACTION}
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
        }
      >
        Details
      </SettingsCardTitle>

      <dl className="mt-3 flex flex-col">
        <Kv label="Program key" value={<ProgramKeyValue program={program} />} />
        <Kv label="Staff page" value={<StaffPageValue program={program} />} />
        <Kv label="Time zone" value={timeZoneLabel(program.timeZone)} />
        <Kv
          label="Who can upload"
          value={uploadPolicyLabel(program.uploadPolicy)}
        />
        <Kv
          label="Who edits the schedule"
          value={uploadPolicyLabel(program.eventsPolicy)}
        />
        <Kv
          label="Roster"
          value={program.rosterPublic ? "Public" : "Private"}
        />
      </dl>

      <AdminTeamDetailsDialog
        program={program}
        open={editing}
        onOpenChange={setEditing}
      />
    </SettingsCard>
  );
}

/** One `.kv` row: label at ink-600, value at ink-900, per the canvas. */
function Kv({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-4 border-t border-[var(--border-hairline)] py-1.5 first:border-t-0">
      <dt className="text-[12px] text-[var(--ink-600)]">{label}</dt>
      <dd className="min-w-0 truncate text-[12px] text-[var(--ink-900)]">
        {value}
      </dd>
    </div>
  );
}

/** `programs.program_key` verbatim, monospaced — null reads as `—`. */
function ProgramKeyValue({ program }: { program: AdminTeamProgram }) {
  if (!program.programKey) return <>—</>;
  return <span className="mono">{program.programKey}</span>;
}

/**
 * The staff page row: the host only, so the row does not wrap on a long
 * path, linking to the full stored URL — the reviewer's actual destination,
 * not the shortened label. Anything that is not an `http(s)://` URL — a bare
 * domain typed without a scheme, or a `javascript:`/`data:` value an admin
 * typed into the free-text field — prints as plain text, never as a link.
 */
function StaffPageValue({ program }: { program: AdminTeamProgram }) {
  const url = program.staffPageUrl;
  if (!url) return <>—</>;

  const host = hostnameOf(url);
  if (!host) return <>{url}</>;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--ink-900)] underline-offset-2 hover:underline"
    >
      {host}
    </a>
  );
}

/**
 * A regex rather than `new URL()`: the value is a stored string that has
 * never been validated as a URL (the T10 dialog's field is a plain text
 * input), and the offline spec harness has no `URL` global. Only `http` and
 * `https` match — the host is what makes the value a link, so a scheme that
 * can run script (`javascript://…`) must never produce one.
 */
function hostnameOf(url: string): string | null {
  const match = /^https?:\/\/(?:www\.)?([^/?#\s]+)/i.exec(url.trim());
  return match ? match[1] : null;
}

/**
 * `programs.time_zone` — an IANA zone name, per the T10 dialog's own hint —
 * as the short common-name label the canvas draws (`America/New_York` →
 * `Eastern`). Covers the US zones a collegiate program can plausibly sit in;
 * anything outside that list (a stored `Europe/London`, `UTC`, or a value
 * nothing here recognises) prints verbatim rather than guessing at a label,
 * since a wrong human name is worse than the IANA string it was built from.
 */
const TIME_ZONE_LABELS: Record<string, string> = {
  "America/New_York": "Eastern",
  "America/Detroit": "Eastern",
  "America/Chicago": "Central",
  "America/Denver": "Mountain",
  "America/Phoenix": "Mountain (no DST)",
  "America/Los_Angeles": "Pacific",
  "America/Anchorage": "Alaska",
  "Pacific/Honolulu": "Hawaii",
  UTC: "UTC",
};

function timeZoneLabel(timeZone: string): string {
  return TIME_ZONE_LABELS[timeZone] ?? timeZone;
}
