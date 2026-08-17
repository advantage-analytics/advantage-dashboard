"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import {
  requestInvite,
  raiseObjection,
} from "@/lib/services/programs/claim-actions";
import { CLAIM_BUTTON, CLAIM_FIELD, CLAIM_LABEL, CLAIM_LINK } from "./claim-shell";

/**
 * The two things you can do about a program somebody else has: ask to be let
 * in, or say the person listed no longer works there.
 *
 * One component because they are the same three fields and the same shape of
 * outcome — only the copy and the action differ. Both were dead links until
 * now: the routes they pointed at did not exist, so the primary action on two
 * of the three status screens returned a 404.
 */
export function ContactOwnerForm({
  programKey,
  kind,
  ownerDisplay,
}: {
  programKey: string;
  kind: "request" | "object";
  /** "Elena V." — named so the confirmation can say who was told. */
  ownerDisplay?: string | null;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  if (sent) {
    return (
      <div>
        <p className="rounded-[10px] border border-[var(--border-hairline)] bg-[var(--surface-card)] px-4 py-3.5 text-[13px] leading-[1.6] text-[var(--ink-700)]">
          {kind === "request"
            ? `Sent${ownerDisplay ? ` to ${ownerDisplay}` : ""}. No account has been created for you, and nothing is queued — they add you when they're ready.`
            : "Thanks — we'll look into it. Nothing has been reversed automatically; a person checks first."}
        </p>
        <div className="mt-4">
          <Link href="/claim/program" className={CLAIM_LINK}>
            Back to search
          </Link>
        </div>
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

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="flex flex-col gap-4">
        {kind === "request" && (
          <div>
            <label htmlFor="name" className={CLAIM_LABEL}>Your name</label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              className={CLAIM_FIELD}
            />
          </div>
        )}

        <div>
          <label htmlFor="email" className={CLAIM_LABEL}>Your email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className={CLAIM_FIELD}
          />
        </div>

        <div>
          <label htmlFor="note" className={CLAIM_LABEL}>
            {kind === "request" ? "Add a note (optional)" : "What's wrong? (optional)"}
          </label>
          <textarea
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={
              kind === "request"
                ? "Hi — I'm the new volunteer assistant, I'd like access to the match reports."
                : "They left the program in June."
            }
            className={`${CLAIM_FIELD} h-auto resize-none py-3 leading-[1.5]`}
          />
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-[6px] bg-[rgba(229,24,55,0.08)] px-3 py-2 text-[12px] text-[#E51837]">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !email.trim()}
        className={`${CLAIM_BUTTON} mt-6`}
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
    </form>
  );
}
