"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import {
  requestInvite,
  raiseObjection,
} from "@/lib/services/programs/claim-actions";
import { CLAIM_ROLES } from "@/lib/services/programs/claim-roles";
import {
  CLAIM_BUTTON,
  CLAIM_FIELD,
  CLAIM_LABEL,
  CLAIM_LINK,
  CLAIM_MICRO,
  ClaimActions,
  ClaimSelect,
} from "./claim-shell";

/**
 * The two things you can do about a program somebody else has: ask to be let
 * in, or say the person listed no longer works there.
 *
 * One component because they are the same fields and the same shape of
 * outcome — only the copy and the action differ.
 *
 * On F3.3 it renders inline on the status screen rather than behind a click.
 * The design's own note is that a request arriving with a name and a reason
 * gets answered where a bare notification gets ignored — which only holds if
 * writing the reason is the same gesture as asking.
 */
export function ContactOwnerForm({
  programKey,
  kind,
  ownerDisplay,
  defaultName = "",
  accountEmail,
  nameNote,
  terms,
  secondary,
  micro,
}: {
  programKey: string;
  kind: "request" | "object";
  /** "Elena V." — named so the confirmation can say who was told. */
  ownerDisplay?: string | null;
  /**
   * The signed-in requester's name, read from their profile server-side.
   *
   * A starting value, not a fixed one — the field stays an ordinary editable
   * input, because the name on a profile is not always the name a coach knows
   * someone by. Empty for a signed-out visitor, which is the same form this
   * screen has always shown.
   */
  defaultName?: string;
  /**
   * The signed-in requester's verified account address.
   *
   * When present there is no email field: the address is a fact about the
   * session, not a question for the form, and asking someone to retype it is
   * the one input on this screen that carries no information. It is still
   * what the action files and replies to — the page says so in its own line
   * beside the button. Signed-out visitors get the input as before.
   */
  accountEmail?: string;
  /** The line under the name field — where the prefilled value came from. */
  nameNote?: React.ReactNode;
  /** What entering this program does, between the fields and the button. */
  terms?: React.ReactNode;
  /** The quiet link beside the button — "They no longer work here". */
  secondary?: React.ReactNode;
  /** The line beside the button — what sending does and does not do. */
  micro?: React.ReactNode;
}) {
  const [email, setEmail] = useState(accountEmail ?? "");
  const [name, setName] = useState(defaultName);
  const [role, setRole] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  if (sent) {
    return (
      <div className="flex flex-col gap-5">
        <p className="text-body max-w-[62ch] rounded-[var(--radius-card)] border border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-5 py-4">
          {kind === "request"
            ? `Sent${ownerDisplay ? ` to ${ownerDisplay}` : ""}. No account has been created for you, and nothing is queued — they add you when they're ready.`
            : "Thanks — we'll look into it. Nothing has been reversed automatically; a person checks first."}
        </p>
        <Link href="/claim/program" className={CLAIM_LINK}>
          Back to search
        </Link>
      </div>
    );
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result =
        kind === "request"
          ? await requestInvite({
              programKey,
              email,
              name,
              note,
              role: role || undefined,
            })
          : await raiseObjection({ programKey, email, note });

      if (!result.ok) setError(result.error);
      else setSent(true);
    });
  }

  const fields = (
    <>
      <div className="grid gap-5 sm:grid-cols-2">
        {kind === "request" && (
          <div>
            <label htmlFor="name" className={CLAIM_LABEL}>
              Your name — sent with the request
            </label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              className={CLAIM_FIELD}
            />
            {nameNote && (
              <span className={`${CLAIM_MICRO} mt-2 block`}>{nameNote}</span>
            )}
          </div>
        )}

        {!accountEmail && (
          <div className={kind === "request" ? "" : "sm:col-span-2"}>
            <label htmlFor="email" className={CLAIM_LABEL}>
              Your email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className={CLAIM_FIELD}
            />
          </div>
        )}

        {/* The same answers the claim setup form offers — one vocabulary
            product-wide, so "assistant coach" means the same thing whether it
            arrives on a claim or on a request. Optional, because a player
            asking to join fits none of the staff roles and should not be made
            to pick one anyway. */}
        {kind === "request" && (
          <div>
            <label htmlFor="role" className={CLAIM_LABEL}>
              Your role (optional)
            </label>
            <ClaimSelect
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="">Choose one</option>
              {CLAIM_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </ClaimSelect>
          </div>
        )}
      </div>

      <div>
        <label htmlFor="note" className={CLAIM_LABEL}>
          {kind === "request"
            ? "Add a note (optional)"
            : "What's wrong? (optional)"}
        </label>
        <textarea
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder={
            kind === "request"
              ? "Add anything that helps them place you — when you joined, or who you train with."
              : "They left the program in June."
          }
          className={`${CLAIM_FIELD} h-auto resize-none py-2.5 leading-[1.55]`}
        />
      </div>
    </>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-5">{fields}</div>

      {/* Between the fields and the button, deliberately: what joining does is
          read on the way to the action, not after it. */}
      {terms}

      {error && (
        <p className="rounded-[var(--radius-button)] bg-[rgba(229,24,55,0.08)] px-3 py-2 text-[12px] text-[#E51837]">
          {error}
        </p>
      )}

      <ClaimActions>
        <button
          type="submit"
          disabled={pending || !email.trim()}
          className={CLAIM_BUTTON}
        >
          {pending ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              Sending
            </span>
          ) : kind === "request" ? (
            "Request an invite"
          ) : (
            "Tell us"
          )}
        </button>
        {secondary}
      </ClaimActions>

      {micro && <span className={CLAIM_MICRO}>{micro}</span>}
    </form>
  );
}
