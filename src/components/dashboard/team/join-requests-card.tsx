"use client";

import { useState, useTransition } from "react";
import { ArrowRight, GraduationCap, UserPlus, Users } from "lucide-react";
import { advButton } from "@/lib/ui/adv-button";
import { getInitials } from "@/lib/data/match-utils";
import {
  approveJoinRequest,
  resolveJoinRequest,
} from "@/components/dashboard/team/join-request-actions";
import {
  RosterDialog,
  DialogInfoRow,
  DialogProblem,
} from "@/components/dashboard/team/dialog-shell";
import { requesterName } from "@/components/dashboard/team/roster-vocabulary";
import type { InviteResult } from "@/components/dashboard/settings/team-actions";
import type { ActionResult } from "@/components/dashboard/settings/actions";
import type { JoinRequest } from "@/lib/data/join-requests-server";
import type { SeatUsage } from "@/lib/data/team-roster-server";

/**
 * The people who asked to join, and the two ways to answer them.
 *
 * They filed a request from `/claim/[programKey]/request` — the public "Request
 * an invite" form — which until now wrote a row nobody on the program could
 * read. Requests can predate the claim by weeks: the rows sit in
 * `program_requests` from the moment they are filed and appear the first time
 * staff open this page.
 *
 * ── Design 9g + 9i: a quiet line, then a dialog ─────────────────────────────
 * The resting state is one sentence above the table (9g) — a count and a way in,
 * not a card unpacking every requester. "Review requests" opens the dialog (9i),
 * one row per person with what we can say about them, and the two answers.
 *
 * ── Approve is an invite, said plainly ──────────────────────────────────────
 * The design draws Approve as "adds the player, takes a seat". It cannot: a
 * membership in this app is only ever self-created — `program_members.user_id`
 * is NOT NULL and every insert keys on the person's own `auth.uid()` — and a
 * join request carries an email and no account. So **Approve sends a player
 * invite**, which holds a seat now and becomes a membership when they accept,
 * and clears the request. `approveJoinRequest` is that invite-then-resolve, and
 * the copy here says "holds a seat" and "invited", never "joined". **Decline**
 * resolves the request and sends nothing — the description says so, because a
 * control that decides whether somebody hears back should not be guessed at.
 *
 * ── It renders or it does not ───────────────────────────────────────────────
 * No pending requests, no banner: no heading, no "nothing waiting", no green
 * tick. That is `needs-attention.tsx`'s rule on the team pages and it holds
 * here — the ordinary state of this queue is empty. The page's `gap-5` reserves
 * nothing for an element that is absent.
 *
 * ── Who sees it ─────────────────────────────────────────────────────────────
 * Staff of a team workspace, and the page decides that before the data is
 * fetched. Nothing here is the guard: `program_join_requests` is SECURITY
 * DEFINER and hands a player, a non-member and another program's staff the same
 * empty array, and both `resolve_program_join_request` and (through
 * `create_program_invite`) the approve path refuse their writes in SQL.
 */

/** A `.edu` address — a soft trust hint for a college program, nothing we verified. */
function isEduAddress(email: string): boolean {
  return /\.edu$/i.test(email.trim());
}

/** The two things we can honestly say about a requester, from data already loaded. */
function signalsFor(
  request: JoinRequest,
  openInviteEmails: Set<string>
): { edu: boolean; hasOpenInvite: boolean } {
  return {
    edu: isEduAddress(request.email),
    hasOpenInvite: openInviteEmails.has(request.email.trim().toLowerCase()),
  };
}

function Pill({
  icon,
  children,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--surface-subtle)] px-2 py-[3px] text-[10px] font-medium text-[var(--ink-700)]">
      {icon}
      {children}
    </span>
  );
}

export function JoinRequestsCard({
  requests,
  seats,
  programName,
  /** Lowercased emails of the program's open invites — drives "Matches your invite". */
  openInviteEmails,
}: {
  /** `requestedOn` arrives pre-formatted — the loader owns the timezone rule. */
  requests: JoinRequest[];
  seats: SeatUsage;
  programName: string;
  openInviteEmails: string[];
}) {
  const [open, setOpen] = useState(false);
  /**
   * Rows taken off the list by an answer that has not round-tripped yet.
   *
   * Both server actions revalidate this path, so the next payload agrees with
   * this and the row is gone for good. This only decides whether the row waits
   * for that round trip — and it is restored if the server refuses, which is the
   * case the error line explains.
   */
  const [handled, setHandled] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const inviteSet = new Set(openInviteEmails.map((e) => e.trim().toLowerCase()));
  const visible = requests.filter((request) => !handled.includes(request.id));

  /**
   * Approve and Decline share one shape: take the row off the list at once, run
   * the write, and put it back only if the server refuses. Approve returns the
   * invite's third outcome — saved but not delivered — as a warning that keeps
   * the row gone but surfaces the note, the way the invite dialog does.
   */
  function answer(
    request: JoinRequest,
    action: () => Promise<InviteResult | ActionResult>
  ) {
    setError(null);
    setHandled((current) => [...current, request.id]);
    const remaining = visible.filter((r) => r.id !== request.id);
    start(async () => {
      const restore = (message: string) => {
        setHandled((current) => current.filter((id) => id !== request.id));
        setError(message);
      };
      try {
        const result = await action();
        if (!result.ok) {
          restore(result.error);
          return;
        }
        if ("warning" in result && result.warning) setError(result.warning);
        // Last one in the queue: close the dialog rather than leave it open on
        // an empty list. The banner disappears on its own once the revalidation
        // lands and `requests` comes back shorter.
        if (remaining.length === 0) setOpen(false);
      } catch {
        // A rejected action — network drop, redeploy skew — is re-thrown by the
        // transition on the next render, and this route has no error boundary:
        // without this catch, one answer is a full-page crash.
        restore("Couldn't reach the server — the request is still open. Try again.");
      }
    });
  }

  if (visible.length === 0) return null;

  const count = visible.length;

  return (
    <>
      {/* 9g: one line above the table — a count and a way in, not a card. */}
      <div className="flex items-center gap-2.5 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-3.5 py-2.5">
        <UserPlus
          className="size-3.5 shrink-0 text-[var(--ink-600)]"
          strokeWidth={1.5}
          aria-hidden
        />
        <p className="text-[12px] text-[var(--ink-700)]">
          <strong className="font-medium text-[var(--ink-900)]">
            {count === 1 ? "1 player" : `${count} players`}
          </strong>{" "}
          asked to join {programName}.
        </p>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
          className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] font-medium text-[var(--blue)] transition-colors hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
        >
          Review requests
          <ArrowRight className="size-3" strokeWidth={1.5} aria-hidden />
        </button>
      </div>

      {/* 9i: one dialog, one row per requester. */}
      <RosterDialog
        open={open}
        onOpenChange={setOpen}
        width={480}
        title="Requests to join"
        description="Approving sends a player invite and holds a team seat until they accept. Declining clears the request and sends nothing."
        footer={
          <>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={advButton("outline")}
            >
              Done
            </button>
          </>
        }
      >
        <DialogProblem message={error} />

        <ul className="flex flex-col">
          {visible.map((request) => {
            const name = requesterName(request);
            const { edu, hasOpenInvite } = signalsFor(request, inviteSet);

            return (
              <li
                key={request.id}
                className="flex items-start gap-3 border-t border-[var(--border-hairline)] py-3.5"
              >
                <span
                  aria-hidden
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-subtle)] text-[10px] font-medium text-[var(--ink-700)]"
                >
                  {getInitials(name)}
                </span>

                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[13px] font-medium text-[var(--ink-900)]">
                    {name}
                  </span>
                  <span
                    title={request.email}
                    className="truncate text-[11px] text-[var(--ink-500)]"
                  >
                    {request.email}
                  </span>

                  {/* What we can honestly say: an existing invite for this
                      address, and whether it looks like a school one. Not
                      "verified" — the public form checked nothing. */}
                  <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {edu && (
                      <Pill
                        icon={
                          <GraduationCap
                            className="size-2.5"
                            strokeWidth={1.5}
                            aria-hidden
                          />
                        }
                      >
                        .edu email
                      </Pill>
                    )}
                    <Pill>
                      {hasOpenInvite ? "Matches your invite" : "Not on roster yet"}
                    </Pill>
                  </span>

                  {/* Clamped, not trusted: free text from a public form with no
                      length bound, so one unbroken 5,000-character "word" cannot
                      reshape the dialog. The full text is on the title. */}
                  {request.note && (
                    <span
                      title={request.note}
                      className="mt-1.5 line-clamp-2 break-words text-[11px] leading-[1.6] text-[var(--ink-600)]"
                    >
                      {request.note}
                    </span>
                  )}
                </span>

                <span className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    aria-label={`Approve ${name} — send a player invite`}
                    onClick={() =>
                      answer(request, () => approveJoinRequest(request.id))
                    }
                    className={advButton("primary", "sm")}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    aria-label={`Decline the request from ${name}`}
                    onClick={() =>
                      answer(request, () => resolveJoinRequest(request.id))
                    }
                    className={advButton("outline", "sm")}
                  >
                    Decline
                  </button>
                </span>
              </li>
            );
          })}
        </ul>

        <DialogInfoRow
          icon={<Users className="size-3.5" strokeWidth={1.5} aria-hidden />}
        >
          Approving holds a team seat until they accept ·{" "}
          <span className="tabular">
            {seats.used} of {seats.seats}
          </span>{" "}
          used
          {seats.pending > 0 && (
            <>
              , <span className="tabular">{seats.pending}</span> held by open
              invites
            </>
          )}
          .
        </DialogInfoRow>
      </RosterDialog>
    </>
  );
}
