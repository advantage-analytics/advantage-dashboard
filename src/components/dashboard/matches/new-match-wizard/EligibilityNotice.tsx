import { advButton } from "@/lib/ui/adv-button";
import type { WizardEligibility } from "./subject-eligibility";
import { WizardNotice } from "./WizardNotice";

export interface EligibilityNoticeProps {
  /**
   * The hook's decision — `wizardUploadEligibility()`, already run. This
   * component never re-derives the rule; it only words the refusal. A
   * caller must not render it for `eligibility.ok`, and should skip it for
   * `athlete-required` too — step 1's own roster picker is that answer.
   */
  eligibility: Extract<WizardEligibility, { ok: false }>;
  /** Re-reads whichever lookup failed. Shown only when `retryable` is true. */
  onRetry: () => void;
}

/**
 * May this match be recorded here at all — the wizard's answer to that,
 * spoken before anything else on the step matters.
 *
 * A pending claim, a suspended or unclaimed program, a role the workspace's
 * policy restricts, a line only staff may attach to, an athlete not on this
 * program's roster: `wizardUploadEligibility()` (`subject-eligibility.ts`)
 * decides which, and this renders its own sentence verbatim rather than
 * inventing a second wording for the same rule — the reason
 * `PENDING_APPROVAL_NOTICE` exists as one constant in the first place.
 *
 * `retryable` splits two different pictures with the same shape: a lookup
 * that has not come back yet (Retry re-asks it) and a decision that has
 * (nothing here will change until the program, the role or the roster
 * does). Retry never unlocks Continue by itself — it only asks the question
 * again, and the eligibility memo above this component is what would let a
 * fresh "active" or a freshly loaded roster through.
 */
export function EligibilityNotice({
  eligibility,
  onRetry,
}: EligibilityNoticeProps) {
  return (
    <WizardNotice>
      <>
        <p>{eligibility.message}</p>
        {eligibility.retryable && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRetry}
              className={advButton("outline", "sm")}
            >
              Retry
            </button>
          </div>
        )}
      </>
    </WizardNotice>
  );
}
