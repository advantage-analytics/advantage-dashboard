import Link from "next/link";
import { advButton } from "@/lib/ui/adv-button";

/**
 * Screen 8.2 — what the program can see, before anyone joins it.
 *
 * The design's note on Stage 8 calls this "the most important screen in the
 * document", and the reason is structural rather than sentimental: this is the
 * only moment a player is asked to change who can read their tennis, and the
 * only screen where saying so costs nothing. After the Join button it is a
 * settings page nobody opens.
 *
 * Two headed halves, not one list. A single run of terms would be six things
 * a person has to hold in their head and sort themselves; two headings do the
 * sorting for them, and the answer they arrived with — "what happens to what I
 * already have" — is a whole half rather than a line buried in the middle of
 * one. Each half is a short paragraph: see `JoinTerms` for why not rows.
 *
 * ── Not the same rows as 4.2 ────────────────────────────────────────────────
 * `components/claim/sharing-rows.tsx` carries the trio a player reads on 4.2,
 * when they ask a coach to add them, and the design's caption on that screen
 * claims they are "the same ones the invited player reads in 8.2, in the same
 * order". They are not — 8.2 covers six facts under two headings and shares no
 * sentence with 4.2's three. The caption describes an intent the
 * frames never carried out.
 *
 * Which is why these are here and not there. Importing three sentences that
 * would then need six, or bending the 8.2 halves back into a trio, would each
 * make one screen wrong to make a caption right. The two sets say the same
 * thing at different moments — asking, and accepting — and the moments differ:
 * 4.2 leads with "this changes nothing yet, your coach still has to approve",
 * which is not true here, because on 8.2 the approval already happened and the
 * button is the commitment.
 */

/**
 * The one way this flow reports a refused action.
 *
 * Every join surface needs it, so it lives beside the other shared pieces
 * rather than being exported out of one of them. (The role nouns used to sit
 * here too; they moved to `services/programs/join-role.ts` once the dashboard
 * header needed one, because importing this component module for a three-line
 * record dragged its links and terms into every dashboard page's chunk.)
 */
export function Problem({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-[12px] leading-[18px] text-[var(--danger)]">
      {message}
    </p>
  );
}

/**
 * One side of the terms: a heading and the sentences under it.
 *
 * Prose rather than a checked list. The six rows this replaced were six full
 * sentences, and the design system's own rule for a confirmation is that what
 * it costs is written as prose, not a bulleted tub — a list of sentences reads
 * as fine print, and this is the one screen where the text has to be read.
 */
export interface JoinTerms {
  title: string;
  text: string;
  /**
   * The one clause set in ink-900 medium. A substring of `text`, so the
   * paragraph stays one readable string rather than fragments a later editor
   * has to reassemble before they can change it.
   */
  emphasis?: string;
}

/** What the program gains. */
const JOIN_TERMS_SEEN: JoinTerms = {
  title: "Your coaches will see",
  text: "Matches uploaded to the team, with their video, stats and full report. Your trends across those matches. Any personal match you choose to share, one at a time.",
  emphasis: "to the team",
};

/** What does not move. */
const JOIN_TERMS_KEPT: JoinTerms = {
  title: "Stays yours",
  text: "Everything you've uploaded up to now, personal matches you upload later unless you share them, and your account if you leave. The team's matches stay with the team.",
};

function TermsBlock({ terms }: { terms: JoinTerms }) {
  // Split once, on the clause itself. When `emphasis` is absent — or is edited
  // to something the paragraph no longer contains — this renders the plain
  // paragraph rather than dropping half of it.
  const [before, after] = terms.emphasis
    ? terms.text.split(terms.emphasis)
    : [terms.text, undefined];

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="eyebrow">{terms.title}</span>
      <p className="text-body-sm">
        {before}
        {terms.emphasis !== undefined && after !== undefined && (
          <>
            <span className="font-medium text-[var(--ink-900)]">
              {terms.emphasis}
            </span>
            {after}
          </>
        )}
      </p>
    </div>
  );
}

/**
 * The terms as two columns, for a screen with no side panel.
 *
 * `InviteOffer` uses this: it can list several invitations, so the terms sit
 * once above every button instead of beside one of them.
 */
export function JoinSharingTerms() {
  return (
    <div className="grid gap-6 border-t border-[var(--border-hairline)] pt-5 sm:grid-cols-2 sm:gap-10">
      <TermsBlock terms={JOIN_TERMS_SEEN} />
      <TermsBlock terms={JOIN_TERMS_KEPT} />
    </div>
  );
}

/**
 * The terms as the side panel of a `/join/[token]` screen.
 *
 * The same grey panel the claim screens put beside a decision (`AsidePanel`),
 * so the action sits on the left and what it means sits beside it rather than
 * above it, pushing the button down the page. The quota line closes the panel:
 * it is the last thing joining changes, and it used to float at the far end of
 * the button row with nothing tying it to the terms it belongs to.
 */
export function JoinTermsPanel({
  programHours,
  personalHours,
}: {
  programHours: number;
  personalHours: number;
}) {
  return (
    <div className="flex flex-col gap-3.5 rounded-[var(--radius-card)] bg-[var(--surface-subtle)] p-5">
      <TermsBlock terms={JOIN_TERMS_SEEN} />
      <div className="border-t border-[var(--border-medium)] pt-3">
        <TermsBlock terms={JOIN_TERMS_KEPT} />
      </div>
      {/* Balanced, so the narrow panel never leaves "2h." alone on a line.
          `text-micro` on the block too: its line box, not the page's. */}
      <div className="text-micro text-balance">
        <JoinQuotaNote
          programHours={programHours}
          personalHours={personalHours}
        />
      </div>
    </div>
  );
}

/**
 * The footer line, and the reason the design calls it the one that "makes
 * joining feel like a gift rather than a surrender".
 *
 * The numbers are the real allowances, passed down from the page, which reads
 * them from `getMonthlyCapSeconds()` — the same function `reserveQuota()` uses
 * to decide whether a submission is refused. A hand-typed 75 here would be a
 * promise this product could break by editing one unrelated constant, and the
 * person it broke it for would be the one who had been told the number at the
 * moment they agreed to join.
 */
export function JoinQuotaNote({
  programHours,
  personalHours,
}: {
  programHours: number;
  personalHours: number;
}) {
  return (
    <span className="text-micro">
      Team matches run on the program&apos;s{" "}
      <span className="mono tabular">{formatHours(programHours)}</span>, not
      your <span className="mono tabular">{formatHours(personalHours)}</span>.
    </span>
  );
}

/** "75h", and "1.5h" if an allowance ever stops landing on the hour. */
function formatHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}h`;
}

/**
 * "Not now" — screen 8.3a's way in.
 *
 * A link, and that is the point rather than a shortcut. Declining an invitation
 * must leave the server exactly as it found it: the token is not consumed,
 * `accepted_at` is untouched, and the coach who sent it is not told. A GET to
 * the same page with a flag on it cannot do any of those things by construction,
 * which is a stronger guarantee than an action that could and has been reviewed
 * for not doing so.
 *
 * The caller passes the whole href because there is no longer one shape for it:
 * the token screens decline into `/join/<token>?not-now=1`, and the signed-in
 * offer has no token to build that from. Composing the URL here would mean
 * inventing a token for the surface that never had one.
 */
export function NotNowLink({ href }: { href: string }) {
  return (
    <Link href={href} className={advButton("ghost")}>
      Not now
    </Link>
  );
}

/**
 * The quota line, pushed to the far end of the actions row.
 *
 * Composed by each form rather than bundled with "Not now", because the two
 * screens do not agree on what sits between them: only the sign-up one carries
 * "Sign in with Google instead", and it belongs beside its own button, not
 * after the line that ends the row.
 */
export function JoinQuotaFooter(props: {
  programHours: number;
  personalHours: number;
}) {
  return (
    <span className="ml-auto">
      <JoinQuotaNote {...props} />
    </span>
  );
}
