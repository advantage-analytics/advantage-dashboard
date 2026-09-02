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
 * Two columns, not one list. A single column of six rows would be six things a
 * person has to hold in their head and sort themselves; two headed columns do
 * the sorting for them, and the answer they arrived with — "what happens to
 * what I already have" — is a whole column rather than a line buried in the
 * middle of one.
 *
 * ── Not the same rows as 4.2 ────────────────────────────────────────────────
 * `components/claim/sharing-rows.tsx` carries the trio a player reads on 4.2,
 * when they ask a coach to add them, and the design's caption on that screen
 * claims they are "the same ones the invited player reads in 8.2, in the same
 * order". They are not — 8.2's own frame draws six rows in two columns and
 * shares no sentence with 4.2's three. The caption describes an intent the
 * frames never carried out.
 *
 * Which is why these are here and not there. Importing three sentences that
 * would then need six, or bending the 8.2 columns back into a trio, would each
 * make one screen wrong to make a caption right. The two sets say the same
 * thing at different moments — asking, and accepting — and the moments differ:
 * 4.2 leads with "this changes nothing yet, your coach still has to approve",
 * which is not true here, because on 8.2 the approval already happened and the
 * button is the commitment.
 */

export interface JoinTermRow {
  text: string;
  /**
   * The one clause the design sets in ink-900 medium. A substring of `text`,
   * so the sentence stays one readable string rather than three fragments a
   * later editor has to reassemble in their head before they can change it.
   */
  emphasis?: string;
}

/** Left column. Blue ticks: what the program gains. */
export const JOIN_TERMS_SEEN: readonly JoinTermRow[] = [
  {
    text: "Matches uploaded to the team — video, stats and the full report",
    emphasis: "to the team",
  },
  { text: "Your trends across those matches" },
  { text: "Any personal match you choose to share, one at a time" },
];

/** Right column. Ink ticks: what does not move. */
export const JOIN_TERMS_KEPT: readonly JoinTermRow[] = [
  { text: "Everything you've uploaded up to now" },
  { text: "Personal matches you upload later, unless you share them" },
  {
    text: "Your account, if you leave the program — the team's matches stay with the team",
  },
];

/**
 * The 2 × 12 mark the design system uses wherever a short list of facts has to
 * read as facts. Blue on the left column, ink on the right — the colour is the
 * only thing distinguishing "they gain this" from "you keep this", and it does
 * the work a paragraph of policy would do badly.
 */
function Tick({ tone }: { tone: "blue" | "ink" }) {
  return (
    <span
      aria-hidden="true"
      className="mt-[5px] h-3 w-0.5 shrink-0 rounded-full"
      style={{
        backgroundColor: tone === "blue" ? "var(--blue)" : "var(--ink-300)",
      }}
    />
  );
}

function TermsColumn({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: readonly JoinTermRow[];
  tone: "blue" | "ink";
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <span className="eyebrow">{title}</span>
      <ul className="flex flex-col gap-2.5">
        {rows.map((row) => {
          // Split once, on the clause itself. When `emphasis` is absent — or is
          // edited to something the sentence no longer contains — this renders
          // the plain sentence rather than dropping half of it.
          const [before, after] = row.emphasis
            ? row.text.split(row.emphasis)
            : [row.text, undefined];

          return (
            <li key={row.text} className="flex gap-2.5">
              <Tick tone={tone} />
              <span className="text-body-sm">
                {before}
                {row.emphasis !== undefined && after !== undefined && (
                  <>
                    <span className="font-medium text-[var(--ink-900)]">
                      {row.emphasis}
                    </span>
                    {after}
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The two columns, in the order the design draws them. */
export function JoinSharingTerms() {
  return (
    <div className="grid gap-6 border-t border-[var(--border-hairline)] pt-5 sm:grid-cols-2 sm:gap-10">
      <TermsColumn title="Your coaches will see" rows={JOIN_TERMS_SEEN} tone="blue" />
      <TermsColumn title="Stays yours" rows={JOIN_TERMS_KEPT} tone="ink" />
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
      <span className="mono tabular">{formatHours(programHours)}</span>, not your{" "}
      <span className="mono tabular">{formatHours(personalHours)}</span>.
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
 */
export function NotNowLink({ token }: { token: string }) {
  return (
    <Link
      href={`/join/${encodeURIComponent(token)}?not-now=1`}
      className={advButton("ghost")}
    >
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
