import { ClaimShell, ClaimHeading } from "@/components/claim/claim-shell";
import { TeamTypeChoice } from "@/components/claim/team-type-choice";

export const metadata = { title: "What kind of organization?" };

/**
 * Screen 7.1 — what kind of organization. A radio, not a fork: the answer only
 * sets copy ("club" vs "program"), never the machinery.
 *
 * The design's own page title is "What kind of organization?"; its rendered
 * heading duplicated the fork's ("What kind of team is this?"), which on the
 * screen after the fork reads as a stuck step. The page-title wording is used
 * here to keep the two questions distinct.
 *
 * Back returns to the fork; ✕ leaves setup per the Stage 6/7 chrome convention.
 */
export default function TeamTypePage() {
  return (
    <ClaimShell width={720} gap={24} back="/claim/team">
      <ClaimHeading
        gap={8}
        eyebrow="Team setup"
        title="What kind of organization?"
        body="This just sets the wording. Any of these works the same way."
        bodyMax="56ch"
      />
      <TeamTypeChoice />
    </ClaimShell>
  );
}
