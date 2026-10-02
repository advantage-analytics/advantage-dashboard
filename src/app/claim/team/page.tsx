import { ClaimShell, ClaimHeading } from "@/components/claim/claim-shell";
import { TeamKindChoice } from "@/components/claim/team-kind-choice";

export const metadata = { title: "What kind of team is this?" };

/**
 * Screen 5.1 — the fork. The one new junction in the flow: a college program is
 * claimed and announced; a club, high school or academy is a workspace the
 * creator simply owns.
 *
 * Back leads to `/dashboard`, not up a step: this is the first step of the
 * create-team flow, reached from two entry points — onboarding's "I coach" and
 * the sidebar switcher — that share no previous screen, so "back" here means
 * leave the flow. It deliberately does not point at `/claim`, which would
 * resurface the persona question. `/dashboard` is the neutral retreat, and it
 * matches where ✕ (via `/claim/exit`) drops a signed-in coach anyway.
 */
export default function TeamForkPage() {
  return (
    <ClaimShell width={840} gap={28} back="/dashboard">
      <ClaimHeading
        gap={8}
        title="What kind of team is this?"
        body="Both get a shared workspace, a roster and one budget. They differ in how the team is confirmed."
        bodyMax="64ch"
      />
      <TeamKindChoice />
    </ClaimShell>
  );
}
