"use client";

import { useState, useTransition } from "react";
import { resolveJoinRequest } from "@/components/dashboard/team/join-request-actions";
import { RosterInviteDialog } from "@/components/dashboard/team/roster-invite-dialog";
import {
  InviteRing,
  RESEND_CLASS,
  requesterName,
} from "@/components/dashboard/team/roster-vocabulary";
import type { ManagedPlayer } from "@/components/dashboard/team/invite-target-picker";
import type { JoinRequest } from "@/lib/data/join-requests-server";
import type { SeatUsage } from "@/lib/data/team-roster-server";

/**
 * The people who asked to join, waiting on somebody to notice.
 *
 * They filed a request from `/claim/[programKey]/request` — the public "Request
 * an invite" form — which until now wrote a row nobody on the program could
 * read. Requests can predate the claim by weeks: this is the surface that makes
 * "whoever sets the program up sees who asked" true, because the rows sit in
 * `program_requests` from the moment they are filed and appear the first time
 * staff open this page.
 *
 * ── Why it lives on Roster ──────────────────────────────────────────────────
 * This is already the program's invite-management surface — `Invite` in the
 * header, the outstanding invitations inside the table, Resend and Revoke on
 * each of them. A join request is the inbound half of that same conversation,
 * so answering one is a click from where the outbound half is handled rather
 * than a screen of its own.
 *
 * ── It renders or it does not ───────────────────────────────────────────────
 * No pending requests, no card: no heading, no "nothing waiting", no green
 * tick. That is `needs-attention.tsx`'s rule on the team pages and it holds
 * here — the ordinary state of this queue is empty, and a program that has
 * never had a request should see the roster, not a box telling it at length
 * that nobody has asked. The page's `gap-5` reserves nothing for an element
 * that is absent.
 *
 * ── Who sees it ─────────────────────────────────────────────────────────────
 * Staff of a team workspace, and the page decides that before the data is
 * fetched — see the gate in `roster/page.tsx`. Nothing here is the guard:
 * `program_join_requests` is SECURITY DEFINER and hands a player, a non-member
 * and another program's staff the same empty array, and
 * `resolve_program_join_request` refuses their writes in SQL. The gate above
 * only decides what is worth rendering and what is worth asking for.
 *
 * ── The two answers ─────────────────────────────────────────────────────────
 * **Invite** opens the roster's own invite dialog with the address filled in,
 * which is the one that sends mail and spends a seat when accepted. **Dismiss**
 * resolves the request and sends nothing at all — the subline says so, because
 * a control that silently decides whether somebody hears back should not be
 * guessed at.
 */

/** A pending request, with its date already formatted by the server. */
export type PendingJoinRequest = JoinRequest & {
  /**
   * `createdAt` as "Aug 29".
   *
   * Formatted in the page rather than here, the way `getRosterData` formats
   * `invitedOn`: `toLocaleDateString` reads the runtime's own time zone, so a
   * client component formatting an ISO string renders one date on the server
   * and can render its neighbour in the browser.
   */
  requestedOn: string;
};

export function JoinRequestsCard({
  requests,
  managedPlayers,
  seats,
  playersCanUpload,
}: {
  requests: PendingJoinRequest[];
  /** Passed straight through to the invite dialog — see below. */
  managedPlayers: ManagedPlayer[];
  seats: SeatUsage;
  playersCanUpload: boolean;
}) {
  /**
   * Rows taken off the list by a dismiss that has not come back yet.
   *
   * `resolveJoinRequest` revalidates this path, so the server's next payload
   * agrees with this and the row is gone for good. This only decides whether
   * the row waits for that round trip — and it is restored if the server
   * refuses, which is the case the error line below explains.
   */
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [inviting, setInviting] = useState<PendingJoinRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const visible = requests.filter((request) => !dismissed.includes(request.id));

  function dismiss(request: PendingJoinRequest) {
    setError(null);
    setDismissed((current) => [...current, request.id]);
    start(async () => {
      const result = await resolveJoinRequest(request.id);
      if (!result.ok) {
        setDismissed((current) => current.filter((id) => id !== request.id));
        setError(result.error);
      }
    });
  }

  return (
    <>
      {visible.length > 0 && (
        <section className="rounded-[var(--radius-card)] border border-[var(--border-medium)] bg-[var(--surface-card)]">
          {/* The card carries the horizontal padding and every row pulls its
              own back out again — 9a's treatment, so the rows line up with the
              heading above them and the roster table below. */}
          <div className="px-6 pt-4 pb-2">
            <h2 className="eyebrow">Join requests</h2>
            {/* The count lives here rather than beside the eyebrow: no bare
                numeral next to a card header, it goes in the subline. The
                second sentence is the part worth saying — dismissing is the
                one control on this page that decides somebody hears nothing
                back, and it should not have to be discovered. */}
            <p className="mt-1.5 text-[11px] leading-[1.6] text-[var(--ink-500)]">
              {visible.length === 1
                ? "One person has"
                : `${visible.length} people have`}{" "}
              asked to join from your program page. Inviting emails them a link;
              dismissing clears the request without sending one.
            </p>

            {error && (
              <p
                role="alert"
                className="mt-2.5 text-[12px] leading-[18px] text-[var(--danger)]"
              >
                {error}
              </p>
            )}

            <ul className="mt-1.5">
              {visible.map((request) => {
                const name = requesterName(request);

                return (
                  /* No hover wash: the row is not a destination, it carries
                     two controls of its own. Same reason the table's own
                     invitation rows go without one. */
                  <li
                    key={request.id}
                    className="-mx-4 flex items-start gap-3 rounded-[var(--radius-element)] px-4 py-3"
                  >
                    {/* The dashed ring is the roster's mark for "an address,
                        no person yet", and that is exactly what this is —
                        arriving from the other direction. */}
                    <InviteRing />

                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-[13px] font-medium text-[var(--ink-900)]">
                        {name}
                      </span>
                      {/* Titled as well as truncated: where somebody gave no
                          name the line above is this address's local part, so
                          the full address is the only thing that separates two
                          requesters who share one. */}
                      <span
                        title={request.email}
                        className="truncate text-[11px] text-[var(--ink-500)]"
                      >
                        {request.email}
                      </span>
                      {/* What they wrote, when they wrote anything. Clamped
                          rather than trusted: this is free text from a public
                          form with no length bound on it, and one unbroken
                          5,000-character "word" must not be able to reshape a
                          coach's roster page. The full text is on the title. */}
                      {request.note && (
                        <span
                          title={request.note}
                          className="mt-1 line-clamp-2 break-words text-[11px] leading-[1.6] text-[var(--ink-600)]"
                        >
                          {request.note}
                        </span>
                      )}
                    </span>

                    {/* Aligned to the name rather than to the block, which is
                        three lines tall when there is a note. */}
                    <span className="mt-0.5 flex shrink-0 items-center gap-4">
                      <span className="text-micro tabular">
                        Asked {request.requestedOn}
                      </span>

                      {/* The pair reads as one control, the way Resend and
                          Revoke do on an invitation row: answer it, or clear
                          it. The blue is that same quiet text action — one
                          look for the roster's row-level blue — and not a
                          filled button, because the page's one primary is
                          "Add player" in the header. */}
                      <span className="flex items-center gap-3.5">
                        <button
                          type="button"
                          aria-label={`Invite ${name}`}
                          onClick={() => {
                            setError(null);
                            setInviting(request);
                          }}
                          className={RESEND_CLASS}
                        >
                          Invite
                        </button>
                        {/* Hovers to ink, not to `--danger`. The Revoke button
                            it sits beside in the table is tinted because it
                            destroys a live invitation; this resolves a request
                            and writes nothing anybody was relying on, and most
                            of them are cleared as routine. Tinting the
                            ordinary action red would cry wolf. */}
                        <button
                          type="button"
                          aria-label={`Dismiss the request from ${name}`}
                          onClick={() => dismiss(request)}
                          className="text-[11px] text-[var(--ink-500)] transition-colors hover:text-[var(--ink-900)]"
                        >
                          Dismiss
                        </button>
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      {/* Mounted per requester and keyed on the request, so the dialog's own
          state initialises from THIS address every time. It resets itself on
          close, but that reset runs while the previous requester is still the
          selected one — reopening on somebody else without a remount would
          bring the last person's address back with it. */}
      {inviting && (
        <RosterInviteDialog
          key={inviting.id}
          open
          onOpenChange={(next) => {
            if (!next) setInviting(null);
          }}
          managedPlayers={managedPlayers}
          seats={seats}
          playersCanUpload={playersCanUpload}
          initialEmail={inviting.email}
        />
      )}
    </>
  );
}
