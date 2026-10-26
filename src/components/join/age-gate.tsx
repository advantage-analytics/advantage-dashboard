"use client";

import { useState } from "react";
import {
  CLAIM_BUTTON,
  CLAIM_LABEL,
  ClaimActions,
} from "@/components/claim/claim-shell";
import { DateField } from "@/components/ui/date-field";
import { createClient } from "@/lib/supabase/client";
import {
  AGE_REFUSAL,
  AGE_REFUSAL_TITLE,
  DOB_ERROR,
  DOB_MIN,
  ageBand,
  todayUtc,
} from "@/app/onboarding/age";

/**
 * The age gate on the join screens — a team's join link, an emailed
 * invitation, and an invitation accepted from the onboarding intercept or
 * `/invitations/[id]`.
 *
 * Onboarding asks everyone's date of birth on its name step, but two paths
 * skip onboarding: an account that already has a name opening a join link,
 * and an account accepting a pending invitation before it reached the name
 * step. Both are team-invitation paths, so 13–17 may join; under 13 may not
 * (`src/app/onboarding/age.ts`). This asks only when `users.dob` is empty —
 * the page reads that and passes `needsDob` — and the server actions and the
 * accept RPCs apply the same rule again, since both are callable without
 * this screen.
 */

/** The date-of-birth field as the join forms draw it: label above, boxed. */
function JoinDobField({
  value,
  onChange,
  onIncompleteChange,
}: {
  value: string;
  onChange: (next: string) => void;
  onIncompleteChange: (incomplete: boolean) => void;
}) {
  return (
    <div className="max-w-[184px]">
      {/* Not a <label> around the field: `DateField`'s segments are not
          labelable, and a wrapper would send every click to its calendar
          button. It names itself with `label`. */}
      <span className={CLAIM_LABEL} aria-hidden="true">
        Date of birth
      </span>
      <DateField
        label="Date of birth"
        variant="form"
        value={value}
        onChange={onChange}
        onIncompleteChange={onIncompleteChange}
        min={DOB_MIN}
        max={todayUtc()}
        required
        className="w-full"
      />
    </div>
  );
}

/**
 * The under-13 refusal, in place of a Join button: the same heading and
 * sentence onboarding's age step shows. Signed in, Sign out is its only
 * action, as there; signed out (an invitation's sign-up form) nothing was
 * created, so there is nothing to leave.
 */
export function AgeRefusal({ signedIn }: { signedIn: boolean }) {
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    // This device only, as `SwitchAccountButton` does.
    await createClient().auth.signOut({ scope: "local" });
    window.location.assign("/login");
  };

  return (
    <div className="flex flex-col gap-4" role="status">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-title">{AGE_REFUSAL_TITLE.child}</h2>
        <p className="text-body max-w-[58ch]">{AGE_REFUSAL.child}</p>
      </div>
      {signedIn && (
        <ClaimActions>
          <button
            type="button"
            disabled={signingOut}
            onClick={() => void signOut()}
            className={CLAIM_BUTTON}
          >
            Sign out
          </button>
        </ClaimActions>
      )}
    </div>
  );
}

/** What a join action's refusal carries for the gate (`JoinActionResult.age`). */
type AgeCode = "required" | "too-young" | undefined;

/**
 * The gate's client half, shared by every join form.
 *
 * `field` is null while no date is needed. `check()` runs before the action:
 * it answers the date to send (undefined when none is needed) or stops — with
 * a sentence for a date that is not one, or by turning the form into the
 * refusal for under 13, which never reaches the server. `absorb()` reads a
 * refusal that came back anyway: the server's own answer wins, so a stale
 * page that thought no date was needed shows the field after all.
 */
export function useJoinAge(initiallyNeeded: boolean) {
  const [needed, setNeeded] = useState(initiallyNeeded);
  const [dob, setDob] = useState("");
  const [incomplete, setIncomplete] = useState(false);
  const [tooYoung, setTooYoung] = useState(false);
  const ready = !needed || (dob !== "" && !incomplete);

  const check = ():
    | { go: true; dob: string | undefined }
    | { go: false; error: string | null } => {
    if (!needed) return { go: true, dob: undefined };
    const band = ageBand(dob, todayUtc());
    if (band === null) return { go: false, error: DOB_ERROR };
    if (band === "child") {
      setTooYoung(true);
      return { go: false, error: null };
    }
    return { go: true, dob };
  };

  const absorb = (age: AgeCode) => {
    if (age === "too-young") setTooYoung(true);
    if (age === "required") setNeeded(true);
  };

  const field = needed ? (
    <JoinDobField
      value={dob}
      onChange={setDob}
      onIncompleteChange={setIncomplete}
    />
  ) : null;

  return { field, ready, check, absorb, tooYoung };
}
