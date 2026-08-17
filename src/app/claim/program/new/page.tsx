import { ClaimShell } from "@/components/claim/claim-shell";
import { UnlistedProgramForm } from "@/components/claim/unlisted-program-form";

export const metadata = { title: "Tell us about your program" };

/**
 * F3.1 — the program isn't listed.
 *
 * Three fields, into the same queue as an unrecognized-domain claim. The
 * restraint is the design: this is the one screen where a coach outside D-I
 * could be made to feel like an exception, so it gets the same layout, the same
 * step counter and the same button as the main path. No apology, no
 * "unfortunately".
 *
 * All 1,940 teams across every division are now in the directory, so this is
 * genuinely the rare case — which makes it more important, not less, that it
 * reads as a normal path rather than an error.
 */
export default function UnlistedProgramPage() {
  return (
    <ClaimShell
      step="Step 2 of 2"
      heading="Tell us about your program"
      sub="If your team isn't in the list, this is the whole form. We'll add it by hand."
      footer="You'll hear back before you'd have finished uploading a match."
    >
      <UnlistedProgramForm />
    </ClaimShell>
  );
}
