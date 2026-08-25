"use client";

import { useState, useTransition } from "react";
import { inviteMember } from "@/components/dashboard/settings/team-actions";
import {
  RESEND_CLASS,
  RESEND_LABEL,
  resendRole,
} from "@/components/dashboard/team/roster-vocabulary";
import type { MemberRole } from "@/lib/data/team-settings-server";

/**
 * Resend, from the home page's roster card.
 *
 * The word and the look are the Roster table's, imported rather than retyped —
 * see `roster-vocabulary.tsx`. What is *not* shared is the wiring, and that is
 * on purpose: the table runs every write through one transition that disables
 * the whole list while any of them is in flight, which is right for a table of
 * five controls per row and wrong for a card holding one button per line. Here
 * each button owns its own pending state, so resending one invitation does not
 * grey out the others.
 *
 * `inviteMember` is the same call the table makes, and the same call the invite
 * dialog makes: `create_program_invite` upserts on the one-open-invite index,
 * so a resend refreshes the row and mints a fresh token rather than leaving two
 * live links into one program. It revalidates this page, so the row's "Invited"
 * date updates underneath the button.
 *
 * Three outcomes, all of them said out loud. The third is the one worth having:
 * `ok` with a warning means the invitation is saved but the mail did not go,
 * and a green tick over it would be a lie.
 */
export function ResendInvite({
  email,
  role,
}: {
  email: string;
  role: MemberRole;
}) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<{ tone: "ok" | "bad"; text: string } | null>(
    null
  );

  return (
    <>
      <button
        type="button"
        disabled={pending}
        aria-label={`Resend the invitation to ${email}`}
        onClick={() => {
          setNote(null);
          startTransition(async () => {
            const result = await inviteMember({
              email,
              role: resendRole(role),
            });
            if (!result.ok) {
              setNote({ tone: "bad", text: result.error });
              return;
            }
            setNote(
              result.warning
                ? { tone: "bad", text: result.warning }
                : { tone: "ok", text: "Sent again" }
            );
          });
        }}
        className={`${RESEND_CLASS} shrink-0`}
      >
        {RESEND_LABEL}
      </button>

      {/* Full-width under the row rather than beside it: the card is 340px, and
          a failure explains itself in a sentence. `role="status"` so a coach
          who pressed the button hears the answer without hunting for it. */}
      {note && (
        <span
          role="status"
          className="basis-full text-[11px] leading-[1.5]"
          style={{
            color: note.tone === "ok" ? "var(--ink-500)" : "var(--danger)",
          }}
        >
          {note.text}
        </span>
      )}
    </>
  );
}
