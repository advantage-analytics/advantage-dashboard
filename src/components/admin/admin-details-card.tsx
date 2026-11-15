"use client";

import { useEffect, useRef, useState } from "react";

import { AdminTeamDetailsDialog } from "@/components/admin/admin-team-details-dialog";
import { TEXT_ACTION } from "@/components/admin/admin-people-card";
import { InertButton } from "@/components/admin/inert-button";
import {
  PendingBar,
  PendingRegion,
} from "@/components/dashboard/loading/pending";
import { advButton } from "@/lib/ui/adv-button";
import { uploadPolicyLabel } from "@/lib/workspace/types";
import type { AdminTeamProgram } from "@/lib/data/admin-team-server";
import type { AdminTeamJoinLink } from "@/lib/data/admin-team-links";

/** The facts every program prints, in order, after its Conference. */
const ALWAYS_FACTS = ["Time zone", "Who can upload", "Roster"] as const;

/** What the skeleton labels: the Conference fact, then `ALWAYS_FACTS`. */
const DETAIL_FACT_LABELS = ["Conference", ...ALWAYS_FACTS] as const;

/**
 * The team page's Details section (`TeamDetail.dc.html`): one row of facts,
 * one `Edit details` button, and the program's two join links, each with a
 * Copy.
 *
 * Not a card: the artboard draws Details as a plain section under a heading,
 * so the page stays quiet ("too cluttered and busy" was the owner's verdict
 * on the last one). The facts wrap as a grid rather than a ledger of rows:
 * columns capped at 240px and packed from the left, so at full width they sit
 * side by side as one compact group instead of spreading across the page,
 * and the links below take two of those columns each, on the same left edge.
 *
 * **One editor.** `Edit details` opens `AdminTeamDetailsDialog`, the one form
 * behind the program's record — the header no longer carries a second button
 * for it. The conference is the first fact, but it is not this form's: the
 * page passes `AdminConferenceCard variant="fact"` in through `conference`,
 * with its own `Change` control and its own action.
 *
 * **Only facts with something to say.** The schedule policy is not shown —
 * the schedule is switched off (`SCHEDULE_ENABLED`) — and the staff page is
 * left out when the program has none, rather than printing a lone dash.
 *
 * **Two links, two doors.** The player link (`/join/<token>`) comes from the
 * loader's `joinLink` and is worded for its mode; it is omitted when the
 * program has no live link. The coach link (`/claim/<programKey>`) lets in
 * the recorded contacts and is omitted for a program with no key. Both URLs
 * are rendered and copied, never logged — the player one carries a raw token.
 */
export function AdminDetailsCard({
  program,
  playerLink,
  coachLink,
  conference,
}: {
  program: AdminTeamProgram;
  /** The live player join link, or null for none. */
  playerLink: AdminTeamJoinLink | null;
  /** The absolute `/claim/<programKey>` URL, or null for no key. */
  coachLink: string | null;
  /**
   * The Conference fact — `AdminConferenceCard variant="fact"` — drawn first
   * in the row. A `<div>` of `<dt>`/`<dd>`, since it sits in this `<dl>`.
   */
  conference?: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);

  const [timeZone, uploader, roster] = ALWAYS_FACTS;
  const facts: { label: string; value: React.ReactNode }[] = [
    { label: timeZone, value: timeZoneLabel(program.timeZone) },
    { label: uploader, value: uploadPolicyLabel(program.uploadPolicy) },
    { label: roster, value: program.rosterPublic ? "Public" : "Private" },
  ];
  if (program.staffPageUrl) {
    facts.push({
      label: "Staff page",
      value: <StaffPageValue url={program.staffPageUrl} />,
    });
  }

  const links: { label: string; url: string; copyLabel: string }[] = [];
  if (playerLink) {
    links.push({
      label: playerLinkLabel(playerLink.mode),
      url: playerLink.url,
      copyLabel: "Copy player link",
    });
  }
  if (coachLink) {
    links.push({
      label: "Coach link, recorded contacts",
      url: coachLink,
      copyLabel: "Copy coach link",
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-[14px] font-medium text-[var(--ink-900)]">
          Details
        </h2>
        <button
          type="button"
          className={advButton("outline", "sm")}
          onClick={() => setEditing(true)}
        >
          Edit details
        </button>
      </div>

      <dl className="grid grid-cols-[repeat(auto-fill,minmax(160px,240px))] gap-x-8 gap-y-4">
        {conference}
        {facts.map((fact) => (
          <div key={fact.label} className="min-w-0">
            <dt className="text-[12px] text-[var(--ink-600)]">{fact.label}</dt>
            <dd className="mt-0.5 truncate text-[13px] text-[var(--ink-900)]">
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>

      {links.length > 0 && (
        <dl className="mt-1 grid grid-cols-[repeat(auto-fill,minmax(260px,512px))] gap-x-8 gap-y-4">
          {links.map((link) => (
            <div key={link.label} className="min-w-0">
              <dt className="text-[12px] text-[var(--ink-600)]">
                {link.label}
              </dt>
              <dd className="mt-0.5 flex min-w-0 items-baseline gap-2.5">
                <span className="mono min-w-0 truncate text-[12px] text-[var(--ink-900)]">
                  {link.url}
                </span>
                <CopyText value={link.url} label={link.copyLabel} />
              </dd>
            </div>
          ))}
        </dl>
      )}

      <AdminTeamDetailsDialog
        program={program}
        open={editing}
        onOpenChange={setEditing}
      />
    </div>
  );
}

/** The player link's label, worded for what opening it does. */
export function playerLinkLabel(mode: AdminTeamJoinLink["mode"]): string {
  return mode === "approve"
    ? "Player link, joins with approval"
    : "Player link, anyone can join";
}

/**
 * The word `Copy`, which says `Copied` for a moment once the clipboard took
 * the value — a blocked or missing clipboard says nothing rather than claiming
 * success. `aria-label` names which link it copies.
 */
function CopyText({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <button
      type="button"
      aria-label={label}
      className={TEXT_ACTION}
      onClick={() => {
        navigator.clipboard
          ?.writeText(value)
          .then(() => {
            setCopied(true);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => {});
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/**
 * The staff page: the host only, so the fact does not wrap on a long path,
 * linking to the full stored URL. Anything that is not an `http(s)://` URL —
 * a bare domain typed without a scheme, or a `javascript:`/`data:` value an
 * admin typed into the free-text field — prints as plain text, never a link.
 */
function StaffPageValue({ url }: { url: string }) {
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
 * never been validated as a URL, and the offline spec harness has no `URL`
 * global. Only `http` and `https` match — a scheme that can run script
 * (`javascript://…`) must never produce a link.
 */
function hostnameOf(url: string): string | null {
  const match = /^https?:\/\/(?:www\.)?([^/?#\s]+)/i.exec(url.trim());
  return match ? match[1] : null;
}

/**
 * `programs.time_zone` — an IANA zone name — as the short common-name label
 * (`America/New_York` → `Eastern`). Anything outside this list prints
 * verbatim rather than guessing at a label.
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

/**
 * The Details section while the team page loads: the real heading and fact
 * labels the section always prints (Conference first, as the page seats it),
 * bars for their values. Edit details draws as itself, inert until the page
 * lands. The two join links are not drawn: which of them a program has is
 * not known yet.
 */
export function AdminDetailsCardSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-[14px] font-medium text-[var(--ink-900)]">
          Details
        </h2>
        <InertButton>Edit details</InertButton>
      </div>
      <PendingRegion
        label="details"
        innerClassName="grid grid-cols-[repeat(auto-fill,minmax(160px,240px))] gap-x-8 gap-y-4"
      >
        {DETAIL_FACT_LABELS.map((label) => (
          <div key={label} className="min-w-0">
            <div className="text-[12px] text-[var(--ink-600)]">{label}</div>
            <div className="mt-0.5 flex h-[19.5px] items-center">
              <PendingBar className="h-3 w-28" />
            </div>
          </div>
        ))}
      </PendingRegion>
    </div>
  );
}
