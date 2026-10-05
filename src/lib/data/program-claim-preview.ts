/**
 * What a program's claim link says about itself when it unfurls (iMessage,
 * Slack, X) — pure, so the offline specs can load it and the page metadata and
 * the Open Graph image cannot drift apart.
 *
 * The sender is almost always a staff member or an admin pasting the link to a
 * coach, so an unclaimed program speaks to the person who would set it up. A
 * claimed or mid-claim one does not: the page itself names the owner and the
 * age of the claim, but a preview travels further than the page does, so it
 * stays at "this program is on Advantage" and leaves who and when behind the
 * link.
 */

export interface ClaimPreviewInput {
  schoolName: string;
  /** "Men's" / "Women's", already through `teamLabel`. */
  teamLabel: string;
  status: "unclaimed" | "claim_pending" | "active" | "suspended";
}

export interface ClaimPreview {
  /** "Stanford Women's Tennis" — the program, as a name. */
  program: string;
  /** Blue eyebrow on the image. */
  eyebrow: string;
  /** Page title and og:title, before the "· Advantage" template. */
  title: string;
  description: string;
}

export function claimPreview(input: ClaimPreviewInput): ClaimPreview {
  const program = `${input.schoolName} ${input.teamLabel} Tennis`;

  // The page offers setup to everything that is not "active" or
  // "claim_pending" (a suspended program lands on the same screen as an
  // unclaimed one), so the preview follows it rather than inventing a third
  // wording that disagrees with where the link goes.
  if (input.status !== "active" && input.status !== "claim_pending") {
    return {
      program,
      eyebrow: "Set up your program",
      title: `Set up ${program}`,
      description: `Claim ${program} on Advantage: manage staff and roster access, control who sends video, and share a monthly analysis budget. Free through December 31, 2026.`,
    };
  }

  return {
    program,
    eyebrow: "On Advantage",
    title: `${program} on Advantage`,
    description: `${program} is on Advantage, the tennis analytics platform for college programs. Request access from the program's staff.`,
  };
}
