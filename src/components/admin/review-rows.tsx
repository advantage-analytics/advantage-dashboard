"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import {
  approveClaim,
  handBackClaim,
  rejectClaim,
  reopenClaim,
  resolveRequest,
  type AdminOutcome,
} from "@/lib/services/programs/admin-actions";
import { divisionLabel, teamLabel } from "@/lib/data/programs-server";
import { claimRoleLabel } from "@/lib/services/programs/claim-roles";
import { cn } from "@/lib/utils";

/**
 * Every decidable claim action takes the same three arguments: the claim id,
 * the internal note, and the claimant-facing message. Approve and reopen ignore
 * the third — they send no decline — but sharing the signature lets one `act`
 * helper drive all four buttons.
 */
type ClaimAction = (
  claimId: string,
  notes?: string,
  claimantMessage?: string
) => Promise<AdminOutcome>;

const CARD =
  "rounded-[10px] border border-[var(--border-hairline)] bg-[var(--surface-card)] p-4";
const BTN =
  "inline-flex h-8 items-center rounded-[6px] px-3 text-[12px] font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none cursor-pointer";

/** Shape the queries return. Loose on purpose — PostgREST embeds vary. */
type Row = Record<string, unknown>;
type Embedded = { school_name?: string; team?: string; division?: string; state?: string; staff_page_url?: string; review_reasons?: string } | null;

function embedded(row: Row): Embedded {
  const p = row.programs;
  return (Array.isArray(p) ? p[0] : p) as Embedded;
}

function Result({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="mt-3 rounded-[6px] bg-[rgba(229,24,55,0.08)] px-3 py-2 text-[12px] text-[#E51837]">
      {error}
    </p>
  );
}

export function ClaimRow({ claim }: { claim: Row }) {
  const program = embedded(claim);
  const [notes, setNotes] = useState("");
  const [claimantMessage, setClaimantMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const act = (fn: ClaimAction) =>
    startTransition(async () => {
      setError(null);
      const result = await fn(claim.id as string, notes, claimantMessage);
      if (!result.ok) setError(result.error);
    });

  const status = claim.status as string;
  const contactMatched = Boolean(claim.contact_matched);
  const matched = Boolean(claim.domain_matched);
  const lowRisk = Boolean(claim.skips_manual_review);

  // Which moves the state machine actually allows from here. Rendering a button
  // the machine will refuse is a promise the UI cannot keep — `objection_window`
  // takes neither approve nor reject, and `objected` is terminal.
  const decidable = status === "pending_review";
  const reversible = status === "objection_window";
  // Settled, but not permanent. Reopening returns it to the queue and gives the
  // program back — the admin still has to approve it from there.
  const reopenable = status === "rejected" || status === "objected";

  return (
    <div className={CARD}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[14px] text-[var(--ink-900)]">
          {program?.school_name ?? "Unknown school"}
        </span>
        <span className="text-[12px] text-[var(--ink-500)]">
          {program?.team ? teamLabel(program.team) : ""}
          {program?.division ? ` \u00b7 ${divisionLabel(program.division)}` : ""}
          {program?.state ? ` \u00b7 ${program.state}` : ""}
        </span>
        <div className="flex-1" />
        <span className="text-[11px] text-[var(--ink-400)]">{status}</span>
      </div>

      <p className="mt-2 text-[13px] text-[var(--ink-700)]">
        {(claim.claimant_name as string) || "No name"}{" "}
        <span className="text-[var(--ink-500)]">
          · {(claim.claimant_role as string)?.replace(/_/g, " ")}
        </span>
      </p>
      <p className="font-mono text-[12px] text-[var(--ink-600)]">
        {claim.claimed_email as string}
      </p>

      {/* Why the automatic check said what it said. "Routed to review" with no
          explanation is a decision somebody has to make twice. A contact match
          is its own chip because it is the only signal that decided anything —
          the other two are evidence a reviewer weighs. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px]",
            contactMatched || lowRisk
              ? "bg-[rgba(93,185,85,0.12)] text-[#3F8A39]"
              : "bg-[var(--surface-subtle)] text-[var(--ink-600)]"
          )}
        >
          {contactMatched
            ? "On the staff list"
            : lowRisk
              ? "Low risk"
              : matched
                ? "Matched, needs a look"
                : "No domain match"}
        </span>
        {program?.staff_page_url && (
          <a
            href={program.staff_page_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-[var(--blue)] hover:underline"
          >
            Staff page <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        )}
      </div>

      {(claim.match_reason || program?.review_reasons) && (
        <p className="mt-2 text-[11px] leading-[1.5] text-[var(--ink-500)]">
          {(claim.match_reason as string) ?? ""}
          {program?.review_reasons ? ` \u2014 ${program.review_reasons}` : ""}
        </p>
      )}

      {/* Two notes, two audiences, kept visibly apart. The internal note is
          only ever seen here in the queue; the claimant message is the ONLY
          text that leaves in the decline email. Each label says which is
          which, so an admin cannot ship internal commentary to the person they
          declined by mistake. */}
      {(decidable || reversible || reopenable) && (
        <div className="mt-3">
          <label
            htmlFor={`note-${String(claim.id)}`}
            className="mb-1 block text-[11px] text-[var(--ink-500)]"
          >
            Internal note — kept on the claim, never emailed
          </label>
          <input
            id={`note-${String(claim.id)}`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Only your team sees this"
            className="h-8 w-full rounded-[6px] border border-[var(--border-medium)] bg-[var(--surface-card)] px-2.5 text-[12px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-400)] focus:border-[var(--ink-900)]"
          />
        </div>
      )}

      {(decidable || reversible) && (
        <div className="mt-2">
          <label
            htmlFor={`claimant-msg-${String(claim.id)}`}
            className="mb-1 block text-[11px] text-[var(--ink-500)]"
          >
            Message to claimant &mdash; they&rsquo;ll see this in the decline email
          </label>
          <input
            id={`claimant-msg-${String(claim.id)}`}
            value={claimantMessage}
            onChange={(e) => setClaimantMessage(e.target.value)}
            placeholder="Optional — added to what they receive"
            className="h-8 w-full rounded-[6px] border border-[var(--border-medium)] bg-[var(--surface-card)] px-2.5 text-[12px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-400)] focus:border-[var(--ink-900)]"
          />
        </div>
      )}

      {decidable && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => act(approveClaim)}
            className={cn(BTN, "bg-[var(--ink-900)] text-white hover:opacity-90")}
          >
            {pending ? <Loader2 className="size-3 animate-spin" aria-hidden="true" /> : "Approve"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => act(rejectClaim)}
            className={cn(BTN, "border border-[var(--border-medium)] text-[var(--ink-700)] hover:bg-[var(--surface-subtle)]")}
          >
            Reject
          </button>
          {/* Rejection hands the program back and removes the membership, so the
              right person can claim it. It is not a dead end for the claimant. */}
          <span className="text-[11px] text-[var(--ink-400)]">
            Rejecting frees the program
          </span>
        </div>
      )}

      {reversible && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => act(handBackClaim)}
            className={cn(BTN, "border border-[var(--border-medium)] text-[var(--ink-700)] hover:bg-[var(--surface-subtle)]")}
          >
            {pending ? <Loader2 className="size-3 animate-spin" aria-hidden="true" /> : "Hand it back"}
          </button>
          <span className="text-[11px] text-[var(--ink-400)]">
            Already live — nothing to approve
          </span>
        </div>
      )}

      {reopenable && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => act(reopenClaim)}
            className={cn(BTN, "border border-[var(--border-medium)] text-[var(--ink-700)] hover:bg-[var(--surface-subtle)]")}
          >
            {pending ? <Loader2 className="size-3 animate-spin" aria-hidden="true" /> : "Put back in the queue"}
          </button>
          <span className="text-[11px] text-[var(--ink-400)]">
            Returns the program to them, still needing your approval
          </span>
        </div>
      )}

      {!decidable && !reversible && !reopenable && (
        <p className="mt-3 text-[11px] text-[var(--ink-400)]">
          Settled. The program is free for someone else to claim.
        </p>
      )}

      <Result error={error} />
    </div>
  );
}

const KIND_LABEL: Record<string, string> = {
  invite_request: "Wants an invite",
  ownership_dispute: "Says the owner has left",
  unlisted_program: "Program not in the directory",
};

export function RequestRow({ request }: { request: Row }) {
  const program = embedded(request);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const act = (status: "resolved" | "dismissed") =>
    startTransition(async () => {
      setError(null);
      const result = await resolveRequest(request.id as string, status);
      if (!result.ok) setError(result.error);
    });

  const school =
    program?.school_name ?? (request.school_name as string) ?? "Unknown school";
  const team = program?.team ?? (request.team as string);

  return (
    <div className={CARD}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[13px] text-[var(--ink-900)]">{school}</span>
        {team && (
          <span className="text-[12px] text-[var(--ink-500)]">{teamLabel(team)}</span>
        )}
        <div className="flex-1" />
        <span className="text-[11px] text-[var(--ink-400)]">
          {KIND_LABEL[request.kind as string] ?? (request.kind as string)}
        </span>
      </div>

      <p className="mt-1.5 font-mono text-[12px] text-[var(--ink-600)]">
        {request.email as string}
        {request.name ? (
          <span className="ml-2 font-sans text-[var(--ink-500)]">
            {request.name as string}
          </span>
        ) : null}
        {/* Structured, so it renders as the label it was picked as — not
            whatever the note happened to say. Old rows have no role and show
            nothing, same as before the column existed. */}
        {request.role ? (
          <span className="ml-2 font-sans text-[var(--ink-500)]">
            · {claimRoleLabel(request.role as string)}
          </span>
        ) : null}
      </p>

      {request.note ? (
        <p className="mt-2 text-[12px] leading-[1.55] text-[var(--ink-700)]">
          &ldquo;{request.note as string}&rdquo;
        </p>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => act("resolved")}
          className={cn(BTN, "bg-[var(--ink-900)] text-white hover:opacity-90")}
        >
          {pending ? <Loader2 className="size-3 animate-spin" aria-hidden="true" /> : "Done"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => act("dismissed")}
          className={cn(BTN, "border border-[var(--border-medium)] text-[var(--ink-700)] hover:bg-[var(--surface-subtle)]")}
        >
          Dismiss
        </button>
      </div>

      <Result error={error} />
    </div>
  );
}
