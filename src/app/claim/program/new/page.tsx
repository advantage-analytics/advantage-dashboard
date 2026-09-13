import { ClaimShell, ClaimHeading } from "@/components/claim/claim-shell";
import { UnlistedProgramForm } from "@/components/claim/unlisted-program-form";

export const metadata = { title: "Tell us about your program" };

/**
 * F3.1 — the program isn't listed.
 *
 * Three fields, into the same queue as an unrecognized-domain claim. The
 * restraint is the design: this is the one screen where a coach outside D-I
 * could be made to feel like an exception, so it gets the same layout, the same
 * step counter and the same button as the D-I path. No apology, no
 * "unfortunately".
 *
 * The frame's line — "we've loaded NCAA Division I so far" — stopped being true
 * when the other four divisions landed: 641 D-III, 552 D-I, 342 D-II, 208 NAIA,
 * 197 JUCO. Worse, it worked against the restraint above it, telling exactly
 * the coach this screen must not single out that they are the exception.
 */
export default function UnlistedProgramPage() {
  return (
    <ClaimShell width={720} gap={24} back="/claim/program">
      <ClaimHeading
        gap={8}
        step="Step 2 of 2"
        title="Tell us about your program"
        body="If your team isn't in the list, this is the whole form. We'll add it by hand."
        bodyMax="62ch"
      />
      <UnlistedProgramForm />
    </ClaimShell>
  );
}
