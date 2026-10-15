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
 * boundary, which is the only reason this is not inline in the page.
 */
export function DecisionButtons() {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-col gap-[10px]">
      <AuthButton
        type="submit"
        disabled={pending}
        name="decision"
        value="approve"
      >
        {pending ? "One moment..." : "Allow"}
      </AuthButton>
      <button
        type="submit"
        name="decision"
        value="deny"
        disabled={pending}
        className={`${advButton("outline", "lg")} w-full`}
      >
        Deny
      </button>
    </div>
  );
}
