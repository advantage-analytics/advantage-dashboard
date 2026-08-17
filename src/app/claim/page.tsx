import { ClaimShell } from "@/components/claim/claim-shell";
import { RoleChoice } from "@/components/claim/role-choice";

export const metadata = { title: "How do you use Advantage?" };

/**
 * F2 — the branch point.
 *
 * One question on a 1000px page. The design's own note: it "looks empty in a
 * screenshot and reads correctly in use", because the answer changes everything
 * downstream, so it gets the whole page.
 *
 * An individual player leaves this flow entirely for the existing consumer
 * signup. The spec is explicit that they must not get a collegiate-flavoured
 * dead end.
 */
export default function ClaimStartPage() {
  return (
    <ClaimShell
      step="Step 1 of 2"
      heading="How do you use Advantage?"
      sub="This decides which setup you get. It doesn't limit what you can do later."
      footer="You can change this in settings."
    >
      <RoleChoice />
    </ClaimShell>
  );
}
