import { GUARDIAN_TERMS_URL, PRIVACY_URL, TERMS_URL } from "@/lib/constants";

/**
 * The legal documents an account agrees to, and the version of each that is
 * current.
 *
 * The pages live in the advantage-landing repo (`src/app/legal/*`); each
 * prints its version under its title. The literals here live in exactly two
 * places that name each other:
 *
 *   * `LEGAL_VERSIONS` below
 *   * `public.current_legal_version()` in
 *     `supabase/migrations/20261026061004_legal_acceptances.sql`
 *
 * Bump both in the same change (the SQL side is a new migration replacing the
 * function body) whenever a page's version changes. A `legal_acceptances` row
 * at an older version counts as no acceptance, so every account sees the
 * "Our terms have changed" screen once on its next dashboard visit.
 *
 * Pure — no `next/*` or Supabase imports — so the sign-up form, the terms
 * screen and an offline spec can all read it.
 */
export const LEGAL_VERSIONS = {
  terms: "2.0",
  privacy: "1.4",
  guardian: "1.1",
} as const;

export type LegalDocument = keyof typeof LEGAL_VERSIONS;

export const LEGAL_DOCUMENTS: readonly LegalDocument[] = [
  "terms",
  "privacy",
  "guardian",
];

export function isLegalDocument(value: unknown): value is LegalDocument {
  return (
    typeof value === "string" &&
    (LEGAL_DOCUMENTS as readonly string[]).includes(value)
  );
}

/**
 * The documents an account must hold a current acceptance of. Everyone agrees
 * to the Terms and the Privacy Policy; a guardian account (`users.role` is
 * `parent`, which only guardian onboarding writes) also to the Guardian Terms.
 */
export function requiredLegalDocuments(
  role: string | null | undefined,
): LegalDocument[] {
  return role === "parent"
    ? ["terms", "privacy", "guardian"]
    : ["terms", "privacy"];
}

/** Which of `required` have no row at the current version in `rows`. */
export function missingLegalDocuments(
  required: readonly LegalDocument[],
  rows: readonly { document: string; version: string }[],
): LegalDocument[] {
  return required.filter(
    (document) =>
      !rows.some(
        (row) =>
          row.document === document && row.version === LEGAL_VERSIONS[document],
      ),
  );
}

export const LEGAL_LINKS: Record<
  LegalDocument,
  { label: string; href: string }
> = {
  terms: { label: "Terms and Conditions", href: TERMS_URL },
  privacy: { label: "Privacy Policy", href: PRIVACY_URL },
  guardian: { label: "Guardian Terms", href: GUARDIAN_TERMS_URL },
};

// ── The terms screen's copy ─────────────────────────────────────────────────
//
// Every sentence on `/terms-update` is written here, beside the versions it
// summarises, as `pilot-terms.ts` does for the pilot screen. The rows are the
// changes a returning account most needs to know, not the documents: the
// links in the confirmation box are the documents. Change a version above and
// re-read these rows against the new pages.

export interface LegalUpdateRow {
  /** Blue: what the account gets or keeps. Ink: what we do with its data. */
  tone: "blue" | "ink";
  text: string;
}

export interface LegalUpdateCopy {
  eyebrow: string;
  title: string;
  intro: string;
  rows: readonly LegalUpdateRow[];
  button: string;
  pendingButton: string;
  signOut: string;
  /** The versions changed between page load and submit. */
  refused: string;
}

/**
 * @param returning The account agreed to an earlier version, or predates
 *   these versions — the screen says the terms changed. A new account that
 *   never ticked a box (a Google sign-up) is asked to agree, not told about a
 *   change it never saw the before of.
 * @param guardian The account is a guardian's: the Guardian Terms join the
 *   box and the screen says what they changed.
 */
export function legalUpdateCopy({
  returning,
  guardian,
}: {
  returning: boolean;
  guardian: boolean;
}): LegalUpdateCopy {
  const rows: LegalUpdateRow[] = [
    {
      tone: "blue",
      text: "Matches filed to a team are visible to everyone on it: coaches, staff and teammates. Your personal matches are never visible to a team. You can share any match by public link.",
    },
    {
      tone: "blue",
      text: "Players under 13 can't hold an account. Players 13 to 17 can hold their own only to join a high school, club or academy team through its invitation; otherwise a parent or legal guardian manages one for them.",
    },
    {
      tone: "ink",
      text: "Our video analysis provider may use video of adult players to improve its models. Video from junior accounts, players under 18, and high school or junior teams is never used to train models.",
    },
    {
      tone: "ink",
      text: "Analysis hours are final sales, except where required by law. Hours a match used aren't returned if it is deleted.",
    },
    {
      tone: "ink",
      text: "An AI app you connect can read your statistics and your teams', edit a match's details (never the score) and start upload drafts.",
    },
  ];
  if (guardian) {
    rows.push({
      tone: "ink",
      text: "As the guardian, you manage the account until it's handed over. Handing it over isn't in the app yet: when the player is ready, or turns 18, contact us and we'll arrange it with you.",
    });
  }

  return {
    eyebrow: "Legal",
    title: returning ? "Our terms have changed" : "Agree to our terms",
    intro: returning
      ? "We rewrote our terms to match what Advantage does today. Here's what changed for you."
      : "Before you continue, here's what our terms say about your matches.",
    rows,
    button: "Agree and continue",
    pendingButton: "Saving",
    signOut: "Sign out",
    refused:
      "These terms changed while you were reading. Agree to the current version to continue.",
  };
}
