"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import AuthCheckbox from "@/components/auth/auth-checkbox";
import { Problem } from "@/components/join/join-terms";
import { acceptPilotTermsAndCreateTeam } from "@/app/claim/team/actions";
import { acceptPilotTermsForClaim } from "@/lib/services/programs/pilot-terms-actions";
import { advButton } from "@/lib/ui/adv-button";
import type {
  PilotTermsCopy,
  PilotTermsFlow,
  PilotTermsSegment,
} from "@/lib/services/programs/pilot-terms";
import {
  ClaimActions,
  ClaimHeading,
  CLAIM_MICRO,
  TermMark,
} from "./claim-shell";

/**
 * The pilot terms screen's body, for both team-creation flows (design
 * `2026-09-26-pilot-terms-design.html`, frames A, A.1, B and C).
 *
 * Every word comes in on `copy`, built by `pilotTermsCopy()` beside
 * `PILOT_TERMS_VERSION`; this file holds layout and behaviour only, so the
 * text a coach accepted and the version recorded for it cannot drift apart.
 *
 * Terms 1–2 wear a blue `TermMark` (what the program gets), 4–5 an ink one
 * (what we reserve). Term 3 is the one statement the coach makes, so it is a
 * checkbox, set apart in a `--surface-subtle` well BELOW the list: the
 * `TermMark` rule forbids blue marks stacked above a blue checkbox. The single
 * primary button stays disabled (opacity, never a recolour) until it is
 * ticked, with no helper line saying so; the empty box already does.
 */
export function PilotTermsForm({
  flow,
  eyebrow,
  copy,
  version,
  token,
  refused = false,
}: {
  flow: PilotTermsFlow;
  /** The program's or team's own name line. */
  eyebrow: string;
  copy: PilotTermsCopy;
  /** The `PILOT_TERMS_VERSION` this copy was rendered under. */
  version: string;
  /** College only: the signed-in link's `?token=`, carried back to verify. */
  token?: string | null;
  /** Open in frame C: the last attempt was refused for want of acceptance. */
  refused?: boolean;
}) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const [problem, setProblem] = useState<string | null>(
    refused ? copy.refused : null,
  );
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!confirmed) return;
    setProblem(null);
    startTransition(async () => {
      // Success redirects on the server; a returned value is a refusal.
      const result =
        flow === "college"
          ? await acceptPilotTermsForClaim({ version, token })
          : await acceptPilotTermsAndCreateTeam({ version });
      if (!result || result.ok) return;

      if (
        result.reason === "terms-changed" ||
        result.reason === "terms-not-accepted"
      ) {
        // Frame C. Re-render so the coach sees the text they would now be
        // accepting, and ask for the tick again against that text.
        setConfirmed(false);
        setProblem(copy.refused);
        router.refresh();
        return;
      }
      setProblem(refusalFor(result.reason));
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <ClaimHeading
        gap={2}
        eyebrow={eyebrow}
        title={copy.title}
        titlePadTop={8}
      />
      <p className="text-body max-w-[60ch]">{copy.intro}</p>

      <ul className="flex flex-col gap-3 border-t border-[var(--border-hairline)] pt-5">
        {copy.terms.map((term, index) => (
          <li key={index} className="flex gap-2.5">
            <TermMark tone={term.tone} />
            <span className="text-body-sm">
              {term.segments.map((segment, i) => (
                <Segment key={i} segment={segment} />
              ))}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex items-start gap-2.5 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-4 py-3.5">
        <span className="mt-px inline-flex">
          <AuthCheckbox
            id="pilot-terms-confirm"
            checked={confirmed}
            onChange={setConfirmed}
            aria-label={copy.confirmation}
          />
        </span>
        {/* A sibling label rather than a wrapper: `AuthCheckbox` is label-less
            by design, and this sentence carries no links to trip over. */}
        <label
          htmlFor="pilot-terms-confirm"
          className="text-body-sm cursor-pointer"
        >
          {copy.confirmation}
        </label>
      </div>

      <Problem message={problem} />

      <ClaimActions>
        <button
          type="submit"
          disabled={!confirmed || pending}
          className={advButton("primary")}
        >
          {pending ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              {copy.pendingButton}
            </span>
          ) : (
            copy.button
          )}
        </button>
        <span className={CLAIM_MICRO}>{copy.micro}</span>
      </ClaimActions>
    </form>
  );
}

function Segment({ segment }: { segment: PilotTermsSegment }) {
  if (!segment.emphasis) return <>{segment.text}</>;
  return (
    <span
      className={`font-medium text-[var(--ink-900)] ${
        segment.emphasis === "figure" ? "font-mono tabular-nums" : ""
      }`}
    >
      {segment.text}
    </span>
  );
}

/**
 * The refusals that are not frame C. Written here, not in the copy module,
 * because they are about this submit failing rather than about the terms.
 */
function refusalFor(reason: string): string {
  switch (reason) {
    case "limit-reached":
      return "You can own up to 2 club, high school or academy teams. To add another, remove one first or ask its owner to add you instead.";
    case "invalid-name":
      return "Give the team a name between 2 and 120 characters. Go back a step to change it.";
    case "invalid-org-type":
      return "Something's off with the team type. Go back a step and pick one.";
    case "no-session":
      return "Your session expired. Sign in again to continue.";
    default:
      return "We couldn't save that. Try again.";
  }
}
