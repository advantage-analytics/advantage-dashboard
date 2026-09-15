"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Minus,
  MoreHorizontal,
  RotateCcw,
  Send,
  Undo2,
  X as XIcon,
} from "lucide-react";
import {
  PeekDrawerFrame,
  ICON_BUTTON,
} from "@/components/dashboard/matches/match-drawer";
import { ProgramCrest } from "@/components/dashboard/settings/teams/program-crest";
import { PersonAvatar } from "@/components/ui/person-avatar";
import {
  VerticalStep,
  type StepState,
} from "@/components/dashboard/shared/vertical-steps";
import { FloatMenu, FloatMenuItem } from "@/components/ui/float-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { advButton } from "@/lib/ui/adv-button";
import { advField } from "@/lib/ui/adv-field";
import { getInitials } from "@/lib/data/match-utils";
import { cn } from "@/lib/utils";
import {
  approveClaim,
  handBackClaim,
  rejectClaim,
  reopenClaim,
  resolveRequest,
  saveClaimNote,
  sendClaimVerification,
} from "@/lib/services/programs/admin-actions";
import type { AdminRequestRow } from "@/lib/data/admin-requests-server";

/**
 * The Admin › Requests peek drawer — the detail half of the container-row law
 * (`tables.md` rule 3), T15.
 *
 * One 340px `PeekDrawerFrame`, the same shell the Matches, Roster and Schedule
 * rails draw, so a fourth surface does not get a fourth drawer. Only the body
 * and the footer are this file's; the header (‹ › · counter · ⋯ · X), the
 * width keyframe and the focus handling are the frame's.
 *
 * ── Two records, one rail ───────────────────────────────────────────────────
 * `AdminRequestRow.detail` is a union: a `program_claims` row (somebody saying
 * "this is my program") or a `program_requests` row (somebody asking to be let
 * into one). They read top-to-bottom the same — who, for which team, what we
 * can check — and they decide differently, so the body branches only where the
 * two records genuinely differ:
 *
 *   claim    identity → what we know → email check (VerticalStep) → note
 *            → footer Approve / Approve anyway, ⋯ Reject · Hand back · Reopen
 *   request  identity → what they said → footer Done / Dismiss
 *
 * A request carries none of the verification or matching columns a claim does,
 * so the email-check section and the note are absent for one rather than drawn
 * empty — "absent, not empty", the Peek Drawer's own rule for the player
 * drawer's chart.
 *
 * ── The footer states what is actually legal ────────────────────────────────
 * `nextClaimStatus` only accepts `approve` out of `pending_review`; an
 * `objected` claim (which the queue still files under "Waiting on you") or a
 * live one has no approve transition at all. So the footer draws its button
 * when approving would work and a quiet sentence when it would not, rather
 * than a full-width primary whose one outcome is a red refusal. Same for a
 * request: Done / Dismiss only while it is `open`, because `resolveRequest`
 * filters on that status.
 *
 * ── Which note goes where ───────────────────────────────────────────────────
 * Two audiences, two columns — the rule `admin-actions.ts` sets on
 * `transition()`. The textarea in the body writes `review_notes` and says so:
 * it is never emailed. The decline dialog's field writes `claimant_message`,
 * which is the only text that reaches the person being declined.
 */

/** The leading glyph on a ⋯ row: neutral ink, never `FloatMenuItem`'s blue. */
const MENU_ROW_ICON = "size-[13px] shrink-0 text-[var(--ink-400)]";

/** A destructive row rests grey and turns red at the moment of intent. */
const DESTRUCTIVE_ROW =
  "group hover:[&>span:last-child>span:first-child]:text-[var(--danger)] focus-visible:[&>span:last-child>span:first-child]:text-[var(--danger)]";
const DESTRUCTIVE_ICON =
  "group-hover:text-[var(--danger)] group-focus-visible:text-[var(--danger)]";

/** "Sep 13 · 1 day" — when it landed, and how long it has been sitting. */
function ageLine(iso: string): string {
  const then = new Date(iso);
  const day = then.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const days = Math.max(
    0,
    Math.floor((Date.now() - then.getTime()) / 86_400_000),
  );
  const age = days === 0 ? "today" : days === 1 ? "1 day" : `${days} days`;
  return `${day} · ${age}`;
}

function shortStamp(iso: string | null): string | undefined {
  if (!iso) return undefined;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** Division / state / men's–women's, as the quiet pills under the team name. */
function teamPills(detail: AdminRequestRow["detail"]): string[] {
  const pills: string[] = [];
  if (detail.division) pills.push(detail.division);
  if (detail.team) pills.push(detail.team === "womens" ? "Women's" : "Men's");
  if (detail.state) pills.push(detail.state);
  return pills;
}

export function RequestDrawer({
  row,
  index,
  total,
  canPrev,
  canNext,
  closing,
  autoFocus,
  onPrev,
  onNext,
  onClose,
  onClosed,
  onChanged,
}: {
  row: AdminRequestRow;
  index: number;
  total: number;
  canPrev: boolean;
  canNext: boolean;
  closing: boolean;
  autoFocus: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onClosed: () => void;
  /** Ran after any write lands — the page refreshes so the row agrees. */
  onChanged: () => void;
}) {
  const detail = row.detail;
  const isClaim = detail.source === "claim";

  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // The internal note. Seeded from the row and re-seeded whenever the drawer
  // steps to a different record, so ↑ ↓ never carries one claim's note onto
  // another's. Keyed on the row id rather than on an effect over `detail`,
  // which would also fire on every refresh and discard an unsaved edit.
  const [note, setNote] = useState(
    detail.source === "claim" ? (detail.reviewNotes ?? "") : "",
  );
  const [noteFor, setNoteFor] = useState(row.id);
  if (noteFor !== row.id) {
    setNoteFor(row.id);
    setNote(detail.source === "claim" ? (detail.reviewNotes ?? "") : "");
    setError(null);
  }

  const [menuOpen, setMenuOpen] = useState(false);
  /** "reject" | "handback" — the two declines that carry a message field. */
  const [declining, setDeclining] = useState<"reject" | "handback" | null>(
    null,
  );
  const [reopening, setReopening] = useState(false);

  const run = (action: () => Promise<{ ok: boolean; error?: string }>) => {
    start(async () => {
      setError(null);
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "That didn't go through.");
        return;
      }
      onChanged();
    });
  };

  const status = row.status;
  const canApprove = isClaim && status === "pending_review";
  const canReject = isClaim && status === "pending_review";
  const canHandBack =
    isClaim && (status === "objection_window" || status === "approved");
  const canReopen = isClaim && (status === "rejected" || status === "objected");
  const hasMenu = canReject || canHandBack || canReopen;

  const claim = detail.source === "claim" ? detail : null;
  // "Approve anyway" is the ghost: a personal address nobody has vouched for
  // and nobody has verified. Anything that HAS a signal — a clicked
  // verification link, a recorded staff contact, a matching domain — earns the
  // primary. The two conditions are complements, so the footer always has
  // exactly one button and never changes width between rows.
  const unvouched = Boolean(
    claim && !claim.verifiedAt && !claim.contactMatched && !claim.domainMatched,
  );

  return (
    <>
      <PeekDrawerFrame
        kind="Request"
        label={`${row.for} · ${row.team}`}
        index={index}
        total={total}
        canPrev={canPrev}
        canNext={canNext}
        closing={closing}
        autoFocus={autoFocus}
        focusKey={row.id}
        onPrev={onPrev}
        onNext={onNext}
        onClose={onClose}
        onClosed={onClosed}
        actions={
          hasMenu && (
            <ChromeTooltip label="Request actions" hidden={menuOpen}>
              <span className="inline-flex">
                <FloatMenu
                  open={menuOpen}
                  onOpenChange={setMenuOpen}
                  width={244}
                  label="Request actions"
                  trigger={
                    <button
                      type="button"
                      aria-label="Request actions"
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      className={ICON_BUTTON}
                    >
                      <MoreHorizontal
                        className="size-3.5"
                        strokeWidth={1.75}
                        aria-hidden
                      />
                    </button>
                  }
                >
                  {canReopen && (
                    <FloatMenuItem
                      label="Put back in the queue"
                      description="Returns the program and asks you to decide again."
                      icon={
                        <RotateCcw
                          className={MENU_ROW_ICON}
                          strokeWidth={1.5}
                          aria-hidden
                        />
                      }
                      onSelect={() => {
                        setMenuOpen(false);
                        setReopening(true);
                      }}
                    />
                  )}
                  {canHandBack && (
                    <FloatMenuItem
                      label="Hand it back"
                      description="Undo the approval and free the program."
                      icon={
                        <Undo2
                          className={cn(MENU_ROW_ICON, DESTRUCTIVE_ICON)}
                          strokeWidth={1.5}
                          aria-hidden
                        />
                      }
                      className={DESTRUCTIVE_ROW}
                      onSelect={() => {
                        setMenuOpen(false);
                        setDeclining("handback");
                      }}
                    />
                  )}
                  {canReject && (
                    <FloatMenuItem
                      label="Reject"
                      description="Declines the claim and emails them why."
                      icon={
                        <XIcon
                          className={cn(MENU_ROW_ICON, DESTRUCTIVE_ICON)}
                          strokeWidth={1.5}
                          aria-hidden
                        />
                      }
                      className={DESTRUCTIVE_ROW}
                      onSelect={() => {
                        setMenuOpen(false);
                        setDeclining("reject");
                      }}
                    />
                  )}
                </FloatMenu>
              </span>
            </ChromeTooltip>
          )
        }
        footer={
          <>
            {error && (
              <p
                role="alert"
                className="text-[12px] leading-[18px] text-[var(--danger)]"
              >
                {error}
              </p>
            )}
            {canApprove ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => approveClaim(row.id, note))}
                className={cn(
                  advButton(unvouched ? "ghost" : "primary", "md"),
                  "w-full",
                )}
              >
                {pending
                  ? "Approving…"
                  : unvouched
                    ? "Approve anyway"
                    : "Approve"}
              </button>
            ) : detail.source === "request" && row.status === "open" ? (
              <>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(() => resolveRequest(detail.requestId, "resolved"))
                  }
                  className={cn(advButton("primary", "md"), "w-full")}
                >
                  Done
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(() => resolveRequest(detail.requestId, "dismissed"))
                  }
                  className={cn(advButton("ghost", "md"), "w-full")}
                >
                  Dismiss
                </button>
              </>
            ) : (
              <p className="text-center text-[11px] leading-[1.5] text-[var(--ink-500)]">
                {settledLine(row)}
              </p>
            )}
          </>
        }
      >
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-[22px] pt-6 pb-[22px]">
          {/* Identity — the team this concerns, then when it landed. */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-start gap-2.5">
              <ProgramCrest
                name={row.team}
                crestUrl={row.crestUrl}
                size={38}
                className="mt-0.5"
              />
              <div className="flex min-w-0 flex-col gap-1">
                {/* Wraps, never truncates — the Peek Drawer's own rule. */}
                <h2 className="text-title-lg [text-wrap:balance] text-[var(--ink-900)]">
                  {row.team}
                </h2>
                <div className="flex flex-wrap items-center gap-1.5">
                  {teamPills(detail).map((pill) => (
                    <span
                      key={pill}
                      className="inline-flex h-[19px] items-center rounded-[var(--radius-pill)] bg-[var(--surface-subtle)] px-2 text-[11px] text-[var(--ink-600)]"
                    >
                      {pill}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <p className="mono tabular text-[11px] text-[var(--ink-500)]">
              {row.for} · {ageLine(row.date)}
            </p>
          </div>

          {/* Who asked — the one boxed block on the panel, so the person is
              never mistaken for another fact about the program. */}
          <div className="flex flex-col gap-2.5 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-3.5 py-3">
            <div className="flex items-start gap-2.5">
              <PersonAvatar
                initials={getInitials(row.from.name)}
                className="size-[26px] text-[9px]"
              />
              <div className="flex min-w-0 flex-col">
                <span className="text-[13px] font-medium break-words text-[var(--ink-900)]">
                  {row.from.name}
                </span>
                <span className="text-[11px] text-[var(--ink-600)]">
                  {row.for}
                </span>
                <span className="text-[11px] break-all text-[var(--ink-600)]">
                  {row.from.email}
                </span>
              </div>
            </div>
            {claimantWords(detail) && (
              <blockquote className="border-l-2 border-[var(--border-medium)] pl-2.5 text-[11px] leading-[1.6] text-[var(--ink-700)] italic">
                {claimantWords(detail)}
              </blockquote>
            )}
          </div>

          {/* What we know — the checks, in the words the review email uses. */}
          <div className="flex flex-col gap-2.5">
            <span className="eyebrow-sm">What we know</span>
            <ul className="flex flex-col gap-2">
              {checksFor(detail).map((check) => (
                <li key={check.text} className="flex items-start gap-2">
                  <span className="mt-[3px] shrink-0">
                    {check.ok ? (
                      <Check
                        className="size-[13px] text-[var(--ink-600)]"
                        strokeWidth={2}
                        aria-hidden
                      />
                    ) : (
                      <Minus
                        className="size-[13px] text-[var(--ink-300)]"
                        strokeWidth={2}
                        aria-hidden
                      />
                    )}
                  </span>
                  <span
                    className={cn(
                      "text-[12px] leading-[1.5]",
                      check.ok
                        ? "text-[var(--ink-900)]"
                        : "text-[var(--ink-600)]",
                    )}
                  >
                    {check.text}
                  </span>
                </li>
              ))}
            </ul>
            {detail.staffPageUrl && (
              <a
                href={detail.staffPageUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
              >
                Open their staff page
                <ExternalLink
                  className="size-[11px]"
                  strokeWidth={1.75}
                  aria-hidden
                />
              </a>
            )}
          </div>

          {claim && (
            <EmailCheckSection
              claim={claim}
              status={status}
              onChanged={onChanged}
            />
          )}

          {claim && (
            <NoteField
              claimId={claim.claimId}
              value={note}
              onChange={setNote}
              saved={claim.reviewNotes ?? ""}
            />
          )}
        </div>
      </PeekDrawerFrame>

      {/* Reject and Hand back are the same shape — decline a claim, tell them
          why — so they are one dialog with two sets of words. */}
      <DeclineDialog
        kind={declining}
        teamName={row.team}
        pending={pending}
        error={error}
        onOpenChange={(open) => {
          if (!open && !pending) setDeclining(null);
        }}
        onConfirm={(claimantMessage) => {
          const kind = declining;
          if (!kind) return;
          run(async () => {
            const result =
              kind === "reject"
                ? await rejectClaim(row.id, note, claimantMessage)
                : await handBackClaim(row.id, note, claimantMessage);
            if (result.ok) setDeclining(null);
            return result;
          });
        }}
      />

      <ConfirmDialog
        open={reopening}
        onOpenChange={(open) => {
          if (!open && !pending) setReopening(false);
        }}
        title="Put this claim back in the queue?"
        description="The program goes back to them as a pending claim, and you decide again. Nobody is emailed."
        confirmLabel="Put it back"
        pendingLabel="Putting it back…"
        pending={pending}
        error={error}
        onConfirm={() =>
          run(async () => {
            const result = await reopenClaim(row.id, note);
            if (result.ok) setReopening(false);
            return result;
          })
        }
      />
    </>
  );
}

/** The requester's or claimant's own words, whichever record this is. */
function claimantWords(detail: AdminRequestRow["detail"]): string | null {
  return detail.source === "claim" ? detail.claimantMessage : detail.note;
}

/**
 * The check list, built from the columns the loader already carries.
 *
 * Every line is stated whether it passed or not — a claim that did NOT match
 * the domain is the single most useful thing on this panel, and a list that
 * only prints what passed would leave it blank. `match_reason`,
 * `programs.review_reasons` and the voucher note are free text and appear
 * only when set.
 */
function checksFor(
  detail: AdminRequestRow["detail"],
): { ok: boolean; text: string }[] {
  if (detail.source === "request") {
    const checks: { ok: boolean; text: string }[] = [
      {
        ok: Boolean(detail.programId),
        text: detail.programId
          ? "This team is already in the directory"
          : "No program in the directory matches this",
      },
    ];
    if (detail.roleLabel) {
      checks.push({
        ok: true,
        text: `They say they are the ${detail.roleLabel.toLowerCase()}`,
      });
    }
    return checks;
  }

  const checks: { ok: boolean; text: string }[] = [
    {
      ok: detail.domainMatched,
      text: detail.domainMatched
        ? `Their address is on ${detail.primaryDomain ?? "the school's domain"}`
        : `Their address is not on ${detail.primaryDomain ?? "the school's domain"}`,
    },
    {
      ok: detail.contactMatched,
      text: detail.contactMatched
        ? "Matches a staff contact we have on record"
        : "No staff contact on record matches them",
    },
    {
      ok: detail.skipsManualReview,
      text: detail.skipsManualReview
        ? "Cleared the automatic checks"
        : detail.reviewReason,
    },
  ];
  if (detail.matchReason) {
    checks.push({ ok: true, text: detail.matchReason });
  }
  if (detail.reviewReasons) {
    checks.push({ ok: false, text: detail.reviewReasons });
  }
  if (detail.voucherNote) {
    checks.push({ ok: true, text: `Vouched for: “${detail.voucherNote}”` });
  }
  return checks;
}

/** What the footer says once there is nothing left to press. */
function settledLine(row: AdminRequestRow): string {
  if (row.detail.source === "request") {
    return row.status === "dismissed"
      ? "Dismissed. They were told."
      : "Closed — nothing left to do here.";
  }
  switch (row.status) {
    // Every row in the Verifying view is this status — the link is out and
    // nobody has clicked it. The footer has to agree with the Email check
    // section right above it, which is offering Resend and Copy link.
    case "pending_email":
      return "Waiting on them to click the link. Resend it or copy it from Email check.";
    case "objection_window":
      return "Live, inside its objection window. Hand it back from ⋯ if it was wrong.";
    case "approved":
      return "Live. Hand it back from ⋯ if it was wrong.";
    case "rejected":
      return "Rejected. Put it back in the queue from ⋯ to reconsider.";
    case "objected":
      return "Someone objected. Put it back in the queue from ⋯ to reconsider.";
    default:
      return "Nothing to decide here.";
  }
}

/**
 * Sent → waiting → yours to approve, as three `VerticalStep`s.
 *
 * The three columns behind it are `verification_sent_at`,
 * `verification_opened_at` and `verified_at`, and they are a clock rather than
 * a flag set: a link can be opened without being confirmed, which is exactly
 * the state the middle step is for. `verified_at` is never cleared by a
 * re-send (see `sendClaimVerification`), so a confirmed claim stays confirmed
 * even while a fresh link is out.
 */
function EmailCheckSection({
  claim,
  status,
  onChanged,
}: {
  claim: Extract<AdminRequestRow["detail"], { source: "claim" }>;
  status: string;
  onChanged: () => void;
}) {
  const [pending, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /** The URL the last Resend handed back, held so Copy link has something. */
  const [link, setLink] = useState<string | null>(null);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  const sent = Boolean(claim.verificationSentAt);
  const opened = Boolean(claim.verificationOpenedAt);
  const verified = Boolean(claim.verifiedAt);
  const decided = status !== "pending_review";

  const steps: { label: string; state: StepState; value?: string }[] = [
    {
      label: sent
        ? "Verification email sent"
        : "Send them a verification email",
      state: sent ? "done" : "later",
      value: shortStamp(claim.verificationSentAt),
    },
    {
      label: verified
        ? "They confirmed it was them"
        : opened
          ? "Opened — waiting for them to confirm"
          : "Waiting for them to confirm",
      state: verified ? "done" : sent ? "now" : "later",
      value: shortStamp(claim.verifiedAt ?? claim.verificationOpenedAt),
    },
    {
      label: "You approve",
      state: decided ? "done" : verified ? "now" : "later",
    },
  ];

  const issue = (copy: boolean) => {
    start(async () => {
      setProblem(null);
      const result = await sendClaimVerification(claim.claimId);
      if (!result.ok) {
        setProblem(result.error);
        return;
      }
      setLink(result.url);
      if (copy) {
        await navigator.clipboard?.writeText(result.url).catch(() => {});
        setCopied(true);
      }
      onChanged();
    });
  };

  const copyLink = () => {
    // The raw token exists in the email and in the last call's return value and
    // nowhere else — it is never stored — so with no link in hand the only way
    // to produce one is to mint a fresh one, which is the same call Resend
    // makes. Minting is therefore the honest behaviour rather than a disabled
    // button: the previous link stops working, which is what "a new link" means.
    if (link) {
      navigator.clipboard?.writeText(link).catch(() => {});
      setCopied(true);
      return;
    }
    issue(true);
  };

  return (
    <div className="flex flex-col gap-3 border-t border-[var(--border-hairline)] pt-4">
      <span className="eyebrow-sm">Email check</span>
      <ol aria-label="Email check progress" className="flex flex-col">
        {steps.map((step, i) => (
          <VerticalStep
            key={step.label}
            label={step.label}
            state={step.state}
            value={step.value}
            last={i === steps.length - 1}
          />
        ))}
      </ol>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => issue(false)}
          className={cn(advButton("outline", "sm"), "flex-1")}
        >
          <Send className="size-3" strokeWidth={1.5} aria-hidden />
          {pending ? "Sending…" : sent ? "Resend" : "Send"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={copyLink}
          className={cn(advButton("ghost", "sm"), "flex-1")}
        >
          <Copy className="size-3" strokeWidth={1.5} aria-hidden />
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      {problem && (
        <p
          role="alert"
          className="text-[11px] leading-[1.5] text-[var(--danger)]"
        >
          {problem}
        </p>
      )}
    </div>
  );
}

/**
 * The reviewer's own note — `review_notes`, and the panel says out loud that
 * it never travels. Saved explicitly rather than on blur: a note is written
 * while thinking, and a field that writes itself the moment focus moves makes
 * a half-formed sentence durable.
 */
function NoteField({
  claimId,
  value,
  onChange,
  saved,
}: {
  claimId: string;
  value: string;
  onChange: (next: string) => void;
  /** What the row currently holds — Save appears only when they differ. */
  saved: string;
}) {
  const [pending, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const dirty = value.trim() !== saved.trim();

  return (
    <div className="flex flex-col gap-2 border-t border-[var(--border-hairline)] pt-4">
      <span className="eyebrow-sm">Your note</span>
      <textarea
        rows={2}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        data-focus-ring="none"
        placeholder="What you checked, or what you're waiting on."
        className={cn(
          advField("underline"),
          "h-auto w-full resize-none py-1.5 leading-[1.55]",
        )}
      />
      <p className="text-[11px] leading-[1.5] text-[var(--ink-500)]">
        Only you see this. It is never emailed.
      </p>
      {dirty && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setProblem(null);
              const result = await saveClaimNote(claimId, value);
              if (!result.ok) setProblem(result.error);
            })
          }
          className={cn(advButton("outline", "sm"), "self-start")}
        >
          {pending ? "Saving…" : "Save note"}
        </button>
      )}
      {problem && (
        <p
          role="alert"
          className="text-[11px] leading-[1.5] text-[var(--danger)]"
        >
          {problem}
        </p>
      )}
    </div>
  );
}

/**
 * Reject and Hand back, as one 440px danger confirm with a claimant-facing
 * message field.
 *
 * The field is the only text that reaches them (`transition()`'s rule), so it
 * is labelled with who reads it rather than left to be guessed — the earlier
 * risk on this surface was an admin typing an internal reason into a box that
 * mails it.
 */
function DeclineDialog({
  kind,
  teamName,
  pending,
  error,
  onOpenChange,
  onConfirm,
}: {
  kind: "reject" | "handback" | null;
  teamName: string;
  pending: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (claimantMessage: string) => void;
}) {
  const [message, setMessage] = useState("");
  // Re-seeded when the dialog opens for a different verb (or closes), so the
  // message typed into a Reject never survives into a Hand back. The
  // previous-prop-in-state pattern, not a ref: a ref read during render is
  // exactly what the React Compiler's `refs` rule refuses.
  const [openFor, setOpenFor] = useState<string | null>(null);
  if (openFor !== kind) {
    setOpenFor(kind);
    if (message !== "") setMessage("");
  }

  const reject = kind === "reject";

  return (
    <ConfirmDialog
      open={kind !== null}
      onOpenChange={onOpenChange}
      tone="danger"
      title={reject ? "Reject this claim?" : `Hand ${teamName} back?`}
      description={
        reject
          ? "They lose the program and get an email with a way to try again."
          : "The program goes back to unclaimed, their membership is removed, and they are emailed."
      }
      confirmLabel={reject ? "Reject claim" : "Hand it back"}
      pendingLabel={reject ? "Rejecting…" : "Handing it back…"}
      pending={pending}
      error={error}
      onConfirm={() => onConfirm(message)}
    >
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="claimant-message"
          className="text-[11px] font-medium text-[var(--ink-700)]"
        >
          What they&rsquo;ll read (optional)
        </label>
        <textarea
          id="claimant-message"
          rows={2}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          data-focus-ring="none"
          placeholder="Our records show someone else runs this program."
          className={cn(
            advField("underline"),
            "h-auto w-full resize-none py-1.5 leading-[1.55]",
          )}
        />
        <p className="text-[11px] leading-[1.5] text-[var(--ink-500)]">
          This goes in the email. Your own note stays in the queue.
        </p>
      </div>
    </ConfirmDialog>
  );
}
