"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck } from "lucide-react";
import {
  SettingsCard,
  SettingsCardTitle,
} from "@/components/dashboard/settings/settings-card";
import { SettingsButton } from "@/components/dashboard/settings/settings-button";
import { PersonAvatar } from "@/components/ui/person-avatar";
import {
  AdminCardNote,
  AdminCardProblem,
  AdminPersonRow,
} from "@/components/admin/admin-people-card";
import { requesterName } from "@/components/dashboard/team/roster-vocabulary";
import {
  noteIconCls,
  noteStripCls,
} from "@/components/dashboard/matches/new-match-wizard/styles";
import { claimRoleLabel } from "@/lib/services/programs/claim-roles";
import { getInitials, shortDate } from "@/lib/data/match-utils";
import { adminResolveJoinRequest } from "@/lib/services/programs/admin-team-actions";
import type {
  AdminTeamClaim,
  AdminTeamJoinRequest,
} from "@/lib/data/admin-team-server";

/**
 * Strangers who have asked to be let into somebody else's program, and the
 * one sentence explaining how the program came to have an owner at all.
 *
 * **Invitations are not here.** They used to be — this card carried a second
 * list of them under a two-noun title — and T11 moved them into
 * the People card, where `TeamPage.dc.html` draws them: a member and an
 * address nobody has accepted yet are the same row answering the same
 * question, "who is on this program". What is left is the other question, and
 * it is genuinely a different one: these people are not on the program and
 * the admin has to decide whether they should be.
 *
 * **The claim strip is here rather than in the header** because it answers
 * the same shape of question the rows above do — somebody asked for this
 * program and something happened — and because it is the sentence that tells
 * an admin whether the current owner was checked by a human or let in by a
 * list. `claimStrip()` below is careful never to say more than the row holds.
 *
 * One transition guards the whole card. These are few, slow, consequential
 * writes on a console page — a second Decline pressed while the first is in
 * flight is a mistake, not a feature.
 */
export function AdminRequestsCard({
  joinRequests,
  claim,
}: {
  joinRequests: readonly AdminTeamJoinRequest[];
  /** The program's latest claim, or null for one nobody has ever claimed. */
  claim: AdminTeamClaim | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const run = (
    work: () => Promise<
      { ok: true; warning?: string } | { ok: false; error: string }
    >,
    done: string,
  ) => {
    setError(null);
    setNote(null);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNote(result.warning ?? done);
      router.refresh();
    });
  };

  const strip = claimStrip(claim);

  return (
    <SettingsCard className="bg-[var(--surface-card)] pt-6">
      <SettingsCardTitle
        trailing={
          joinRequests.length > 0 ? (
            <span className="text-[11px] text-[var(--ink-500)]">
              {joinRequests.length} open
            </span>
          ) : undefined
        }
      >
        Requests
      </SettingsCardTitle>

      <div className="pt-1">
        {joinRequests.map((request) => {
          const name = requesterName(request);
          return (
            <AdminPersonRow key={request.id}>
              <PersonAvatar
                initials={getInitials(name)}
                className="size-[22px] text-[9px]"
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[12px] font-medium text-[var(--ink-900)]">
                  {askedLine(name, request.role)}{" "}
                  <span className="font-normal text-[var(--ink-500)]">
                    · {shortDate(request.createdAt)}
                  </span>
                </span>
                <span className="truncate text-[11px] text-[var(--ink-500)]">
                  {metaLine(request)}
                </span>
              </span>
              {/* Decline before Send invite, as the canvas draws it: the
                  quieter outcome sits away from the cursor's resting edge. */}
              <SettingsButton
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(
                    () => adminResolveJoinRequest(request.id, "dismiss"),
                    `Request from ${request.email} declined.`,
                  )
                }
              >
                Decline
              </SettingsButton>
              {/* "Send invite" rather than "Approve": membership is only ever
                  self-created, so this sends an invitation (coach for a coach
                  request, player otherwise) that reserves
                  a seat now and mints the membership on acceptance, then
                  closes the request. */}
              <SettingsButton
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(
                    () => adminResolveJoinRequest(request.id, "invite"),
                    `Invitation sent to ${request.email}.`,
                  )
                }
              >
                Send invite
              </SettingsButton>
            </AdminPersonRow>
          );
        })}

        {/* The empty line replaces the list, never the card: an approved
            claim is still the most useful sentence on this card when nobody
            is waiting, so the strip below renders either way. */}
        {joinRequests.length === 0 && (
          <p className="border-t border-[var(--border-hairline)] py-3 text-[12px] text-[var(--ink-500)]">
            Nobody is waiting to join.
          </p>
        )}
      </div>

      {strip && (
        <div className={`${noteStripCls} mt-2`}>
          <CircleCheck
            className={`${noteIconCls} text-[var(--ink-400)]`}
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <span>{strip}</span>
        </div>
      )}

      <AdminCardProblem message={error} />
      <AdminCardNote message={error ? null : note} />
    </SettingsCard>
  );
}

/**
 * "Riley Chen asked to join as a player" — the canvas's line.
 *
 * The role clause is dropped rather than guessed when the form captured no
 * role, and when it captured `other`, which is the form's "none of the above"
 * and would render as "asked to join as a other". `program_requests.role`
 * holds `claim_roles.ts` values, so the label comes from `claimRoleLabel`
 * rather than a second mapping that could drift from it.
 */
function askedLine(name: string, role: string | null): string {
  if (!role || role === "other") return `${name} asked to join`;
  const label = claimRoleLabel(role).toLowerCase();
  const article = /^[aeiou]/.test(label) ? "an" : "a";
  return `${name} asked to join as ${article} ${label}`;
}

/** `“…their note…” · address`, or the address alone when they wrote nothing. */
function metaLine(request: AdminTeamJoinRequest): string {
  const said = request.note?.trim();
  return said ? `“${said}” · ${request.email}` : request.email;
}

/**
 * The one sentence under the requests: how this program's owner got in.
 *
 * **Only for an approved claim.** Every other status is a claim still moving
 * — or one that was refused — and the Requests console (`/admin/requests`) is
 * where those are worked. A strip here saying "somebody is claiming this"
 * would be a second, staler copy of that queue.
 *
 * **The three sentences are three different facts, not one sentence with the
 * nouns swapped.** `program_claims` records how a claim reached the objection
 * window, and there are exactly two roads: `complete_program_claim` finds the
 * address in `program_contacts` and opens the window itself
 * (`contact_matched`, no reviewer), or a human approves a `pending_review`
 * claim and `reviewed_by` is stamped. `domain_matched` and
 * `skips_manual_review` are EVIDENCE and nothing more — `domain-match.ts`
 * says so in its own header: an address on the school's domain belongs to a
 * student, an alum or anyone on the faculty, and it has not routed a claim
 * since contact matching landed. So a domain match is reported as what it is,
 * a recorded fact about the address, and never as the thing that approved
 * anybody.
 *
 * When neither road left a trace — no contact match, no reviewer, no domain
 * match — this says the date and stops. That combination is reachable:
 * `program_claims.reviewed_by` is `on delete set null`, so a reviewer whose
 * account is gone leaves an approved claim with nothing naming them, and
 * inventing a reason for it is exactly the fabrication these strips exist to
 * avoid.
 *
 * The date is `updatedAt` — an approved claim's last write is the write that
 * approved it — falling back to `createdAt` for a row nothing has touched.
 */
function claimStrip(claim: AdminTeamClaim | null): string | null {
  if (!claim || claim.status !== "approved") return null;

  const who = claim.claimantName?.trim() || claim.claimedEmail;
  const when = shortDate(claim.updatedAt ?? claim.createdAt);

  if (claim.contactMatched) {
    return `${who}'s claim approved itself ${when} — the address is on the recorded staff list.`;
  }
  if (claim.reviewedBy) {
    return `${who}'s claim was approved by an admin ${when} after review.`;
  }
  if (claim.domainMatched) {
    return `${who}'s claim was approved ${when}; the address is on the school's domain, which is recorded evidence and not an approval on its own.`;
  }
  return `${who}'s claim was approved ${when}. Nothing on the record says who approved it.`;
}
