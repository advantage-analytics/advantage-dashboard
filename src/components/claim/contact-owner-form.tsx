"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import {
  requestInvite,
  raiseObjection,
} from "@/lib/services/programs/claim-actions";
import {
  CLAIM_BUTTON,
  CLAIM_FIELD,
  CLAIM_LABEL,
  CLAIM_LINK,
  CLAIM_MICRO,
  ClaimActions,
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
  unclaimed = false,
  secondary,
  micro,
}: {
  programKey: string;
  kind: "request" | "object";
  /** "Elena V." — named so the confirmation can say who was told. */
  ownerDisplay?: string | null;
  /**
   * True only when nobody owns this program at all — not merely when
   * `ownerDisplay` is empty, which also happens on a real, claimed program
   * whose owner never filled in a name. Changes the "sent" confirmation from
   * "they add you" (a real, if unnamed, person) to language that does not
   * imply anyone is currently reading requests.
   */
  unclaimed?: boolean;
  /** The quiet link beside the button — "They no longer work here". */
  secondary?: React.ReactNode;
  /** The line beside the button — what sending does and does not do. */
  micro?: React.ReactNode;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  if (sent) {
    return (
      <div className="flex flex-col gap-5">
        <p className="text-body max-w-[62ch] rounded-[var(--radius-card)] border border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-5 py-4">
          {kind === "request"
            ? unclaimed
              ? "Filed. No account has been created for you — whoever sets this program up will see your request."
              : `Sent${ownerDisplay ? ` to ${ownerDisplay}` : ""}. No account has been created for you, and nothing is queued — they add you when they're ready.`
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
          ? await requestInvite({ programKey, email, name, note })
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
              Your name
            </label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              className={CLAIM_FIELD}
            />
          </div>
        )}

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
              ? "Add anything that helps them place you — your role, or when you joined."
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
