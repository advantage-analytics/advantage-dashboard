"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import AuthCheckbox from "@/components/auth/auth-checkbox";
import { AUTH_LINK } from "@/components/auth/auth-footer";
import { Problem } from "@/components/join/join-terms";
import {
  ClaimActions,
  ClaimHeading,
  TermMark,
} from "@/components/claim/claim-shell";
import { createClient } from "@/lib/supabase/client";
import { acceptLegalTerms } from "@/lib/legal/acceptance-actions";
import { advButton } from "@/lib/ui/adv-button";
import {
  LEGAL_LINKS,
  LEGAL_VERSIONS,
  type LegalDocument,
  type LegalUpdateCopy,
} from "@/lib/legal/versions";

/**
 * The one-time "Our terms have changed" screen's body.
 *
 * Built from the pilot terms form's pieces (`pilot-terms-form.tsx`): an
 * eyebrow and `text-title-lg` heading, `TermMark` rows for what changed, and
 * the one statement the account makes as a checkbox in a `--surface-subtle`
 * well below the list — never blue marks stacked over a blue checkbox. Every
 * word comes in on `copy`, built by `legalUpdateCopy()` beside the versions,
 * so this file holds layout and behaviour only.
 *
 * Unlike the pilot form there is a way out that is not agreeing: Sign out.
 * The dashboard is gated on this screen, so an account that will not agree
 * has nowhere else to go, and the honest exit is leaving.
 */
export function LegalUpdateForm({
  copy,
  documents,
}: {
  copy: LegalUpdateCopy;
  /** The documents this account is missing, in the order the box names them. */
  documents: readonly LegalDocument[];
}) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [signingOut, setSigningOut] = useState(false);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!agreed) return;
    setProblem(null);
    startTransition(async () => {
      // Success redirects on the server; reaching the line below is a refusal.
      const result = await acceptLegalTerms(
        Object.fromEntries(
          documents.map((document) => [document, LEGAL_VERSIONS[document]]),
        ),
      );
      if (!result || result.ok) return;
      if (result.reason === "terms-changed") {
        setAgreed(false);
        setProblem(copy.refused);
        router.refresh();
        return;
      }
      setProblem("We couldn't save that. Try again.");
    });
  }

  async function signOut() {
    setSigningOut(true);
    // This device only, as `SwitchAccountButton` does.
    await createClient().auth.signOut({ scope: "local" });
    window.location.assign("/login");
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <ClaimHeading
        gap={2}
        eyebrow={copy.eyebrow}
        title={copy.title}
        titlePadTop={8}
      />
      <p className="text-body max-w-[60ch]">{copy.intro}</p>

      <ul className="flex flex-col gap-3 border-t border-[var(--border-hairline)] pt-5">
        {copy.rows.map((row, index) => (
          <li key={index} className="flex gap-2.5">
            <TermMark tone={row.tone} />
            <span className="text-body-sm">{row.text}</span>
          </li>
        ))}
      </ul>

      <div className="flex items-start gap-2.5 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-4 py-3.5">
        <span className="mt-px inline-flex">
          <AuthCheckbox
            id="legal-update-agree"
            checked={agreed}
            onChange={setAgreed}
            aria-label={`I agree to the ${documents
              .map((document) => LEGAL_LINKS[document].label)
              .join(" and ")}`}
            aria-describedby="legal-update-agree-copy"
          />
        </span>
        {/* A sibling span, not a label: the sentence carries links, and a
            label would toggle the box on every click through to a document. */}
        <span id="legal-update-agree-copy" className="text-body-sm">
          I agree to the{" "}
          {documents.map((document, index) => (
            <Fragment key={document}>
              {index > 0 && (index === documents.length - 1 ? " and " : ", ")}
              <a
                href={LEGAL_LINKS[document].href}
                target="_blank"
                rel="noopener noreferrer"
                className={AUTH_LINK}
              >
                {LEGAL_LINKS[document].label}
              </a>
            </Fragment>
          ))}
          .
        </span>
      </div>

      <Problem message={problem} />

      <ClaimActions>
        <button
          type="submit"
          disabled={!agreed || pending || signingOut}
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
        <button
          type="button"
          disabled={pending || signingOut}
          onClick={() => void signOut()}
          className={advButton("ghost")}
        >
          {copy.signOut}
        </button>
      </ClaimActions>
    </form>
  );
}
