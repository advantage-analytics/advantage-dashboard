"use client";

import { useState } from "react";

import { TEXT_ACTION } from "@/components/admin/admin-people-card";
import {
  SettingsCard,
  SettingsCardTitle,
} from "@/components/dashboard/settings/settings-card";
import type { AdminTeamContact } from "@/lib/data/admin-team-server";

/**
 * The addresses recorded against this program — the directory scrape plus any
 * an admin added — and the link a coach on that list uses to join.
 *
 * The join link is one URL per program (`/claim/[programKey]`), not one per
 * address: the claim flow checks the signer's email against this very list, so
 * every recorded address is let in by the same door. It is printed once at the
 * top with a Copy, and each row can copy it too so an address and its link
 * can be pasted together.
 *
 * Contacts are NOT members or invitations — nothing here grants access — which
 * is why this is its own card rather than rows in the People list.
 */
export function AdminContactsCard({
  contacts,
  joinLink,
}: {
  contacts: AdminTeamContact[];
  joinLink: string | null;
}) {
  return (
    <SettingsCard className="gap-0 bg-[var(--surface-card)] py-6">
      <SettingsCardTitle
        trailing={
          <span className="text-[11px] text-[var(--ink-500)]">
            {contacts.length}
          </span>
        }
      >
        Recorded contacts
      </SettingsCardTitle>

      <div className="mt-3 flex items-center justify-between gap-3 text-[12px]">
        <span className="shrink-0 text-[var(--ink-600)]">Join link</span>
        {joinLink ? (
          <span className="flex min-w-0 items-center gap-3">
            <span className="mono min-w-0 truncate text-[var(--ink-900)]">
              {joinLink}
            </span>
            <CopyButton text={joinLink} label="Copy" />
          </span>
        ) : (
          <span className="text-[var(--ink-500)]">
            No link — this program has no directory key
          </span>
        )}
      </div>

      {contacts.length === 0 ? (
        <p className="mt-3 border-t border-[var(--border-hairline)] pt-3 text-[12px] text-[var(--ink-500)]">
          No addresses recorded for this program.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col">
          {contacts.map((contact) => (
            <li
              key={contact.id}
              className="flex items-center gap-3 border-t border-[var(--border-hairline)] py-[9px]"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[12px] font-medium text-[var(--ink-900)]">
                  {contact.email}
                </span>
                <span className="truncate text-[11px] text-[var(--ink-500)]">
                  {metaLine(contact)}
                </span>
              </div>
              {joinLink ? (
                <CopyButton text={joinLink} label="Copy link" />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </SettingsCard>
  );
}

/** "Head coach · Scraped · Already emailed" — whatever the row has. */
function metaLine(contact: AdminTeamContact): string {
  return [
    contact.name,
    contact.role,
    contact.source === "scrape"
      ? "Scraped"
      : contact.source === "admin"
        ? "Added by admin"
        : null,
    contact.wasEmailed ? "Already emailed" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={TEXT_ACTION}
      onClick={() => {
        navigator.clipboard?.writeText(text).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
