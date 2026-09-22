/**
 * The day-zero sentence on a player profile, in the voice of whoever is
 * looking at it.
 *
 * Four readers reach the same empty page and none of them should read the
 * same line. The athlete themself is being offered something to do; a coach
 * looking at one of their players is being told what that player's page will
 * hold; a teammate can only wait. Written by hand at the call site, the third
 * party's voice drifts into "their first match" and "once they or the staff
 * send one" — which is a page about a named person addressing nobody. This
 * module is the one place `firstName` is spoken, so it cannot.
 *
 * `canUpload` is the whole of the offer's existence: a reader who cannot
 * send a match is given a sentence that ends, not a link they would be
 * refused at. `lead` / `link` / `tail` are split because the offer is one
 * sentence with a control inside it — the caller renders `link.label` as the
 * button and the two strings as plain text either side, so the sentence
 * reads as a sentence rather than as a paragraph with a button bolted after.
 *
 * Pure strings, no React: the page composes the elements, and a spec can pin
 * the four voices without a renderer.
 */

export type ProfileDayZeroCopy = {
  /** Everything before the offer control. Always a complete opening. */
  lead: string;
  /** What closes the sentence after the control — `null` when there is none. */
  tail: string | null;
  /** The in-sentence offer, or `null` when this reader cannot send a match. */
  link: { label: string } | null;
  /**
   * The `sr-only` line that pairs with the dimmed, `inert` shape below: what
   * this page holds once it holds anything, and that none of it is real yet.
   * Independent of `canUpload` — it describes the page, not the offer.
   */
  description: string;
};

export function profileDayZeroCopy({
  isSelf,
  firstName,
  canUpload,
}: {
  /** Is the viewer the athlete whose profile this is? */
  isSelf: boolean;
  /** The athlete's first name, spoken only in the third-party voice. */
  firstName: string;
  /** May this viewer send a match for this athlete? */
  canUpload: boolean;
}): ProfileDayZeroCopy {
  const who = isSelf ? "Your" : `${firstName}'s`;
  const description =
    `Once ${isSelf ? "your" : `${firstName}'s`} first match is analysed this page fills with ` +
    "season numbers, every match, results by line, and where first serves " +
    "land. Nothing below is real data yet.";

  if (canUpload) {
    return {
      lead: `${who} first match fills this page. Send match video from New match, or `,
      link: { label: "import a SwingVision export" },
      tail: ".",
      description,
    };
  }

  return {
    lead: isSelf
      ? "Your first match fills this page, once your coaching staff send one."
      : `${firstName}'s first match fills this page, once ${firstName} or the coaching staff send one.`,
    link: null,
    tail: null,
    description,
  };
}
