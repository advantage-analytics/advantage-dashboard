"use client";

import { useFormStatus } from "react-dom";
import AuthButton from "@/components/auth/auth-button";
import { advButton } from "@/lib/ui/adv-button";

/**
 * The two buttons of `/oauth/consent`, both disabled while the form's POST
 * is in flight so a double tap cannot send two decisions. Allow is the
 * page's one filled action (`AuthButton`); Deny is the DS outline button at
 * the same height, full width beneath it — a secondary that must still be
 * easy to hit, since it is the way to say no. `useFormStatus` needs a client
 * boundary, which is the only reason this is not inline in the page. The
 * pending label sits on the button that was pressed, and a persistent live
 * region says the decision is being sent.
 */
export function DecisionButtons() {
  // `data` is the submitted form, submitter included: the pending label goes
  // on the button that was pressed, never on Allow after a Deny.
  const { pending, data } = useFormStatus();
  const decision = pending ? data?.get("decision") : null;
  return (
    <div className="flex flex-col gap-[10px]" aria-busy={pending || undefined}>
      <AuthButton
        type="submit"
        disabled={pending}
        name="decision"
        value="approve"
      >
        {decision === "approve" ? "Allowing…" : "Allow"}
      </AuthButton>
      <button
        type="submit"
        name="decision"
        value="deny"
        disabled={pending}
        className={`${advButton("outline", "lg")} w-full`}
      >
        {decision === "deny" ? "Denying…" : "Deny"}
      </button>
      {/* Always mounted, so the change of text is what a screen reader hears. */}
      <p role="status" className="sr-only">
        {pending ? "Sending your decision" : ""}
      </p>
    </div>
  );
}
