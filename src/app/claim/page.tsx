import { ClaimShell, ClaimHeading } from "@/components/claim/claim-shell";
import { RoleChoice } from "@/components/claim/role-choice";

export const metadata = { title: "How do you use Advantage?" };

/**
 * F2 — question one, who are you here as.
 *
 * One question, three cards, 840px of page. Identical to Onboarding 0.2 — one
 * question vocabulary product-wide. "I coach" goes straight to F3 program
 * setup; the other two answers leave this flow.
 *
 * No back: the account already exists behind this screen, so there is nothing
 * of this flow to go back to. ✕ leaves setup with the account intact.
 */
export default function ClaimStartPage() {
  return (
    <ClaimShell width={840} gap={28}>
      <ClaimHeading
        gap={8}
        step="Step 1 of 2"
        title="How do you use Advantage?"
        body="This sets what your dashboard opens on. You can change it in settings."
        bodyMax="60ch"
      />
      <RoleChoice />
    </ClaimShell>
  );
}
