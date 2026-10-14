import { createClient } from "@/lib/supabase/server";
import {
  divisionLabel,
  getProgramPublicStatus,
  programSubtitle,
  teamLabel,
} from "@/lib/data/programs-server";
import { claimPreview } from "@/lib/data/program-claim-preview";
import { LINK_CARD_SIZE, linkCard } from "@/lib/og/link-card";

/**
 * The card a program's claim link unfurls into (iMessage, Slack, X): the
 * school's name under the wordmark, with what the recipient is being asked to
 * do. Drawn by `linkCard`, the layout every shared link's card uses.
 *
 * Few programs have a crest and an unclaimed one never does, so the school's
 * name is the picture. An unknown key is a 404, never a generic card.
 */
export const alt = "Set up your program on Advantage";
export const size = LINK_CARD_SIZE;
export const contentType = "image/png";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** What fits on one line of the card's facts, in characters. */
const FACTS_LINE = 68;

export default async function Image({
  params,
}: {
  params: Promise<{ programKey: string }>;
}) {
  const { programKey } = await params;
  const program = await getProgramPublicStatus(
    await createClient(),
    programKey,
  );
  if (!program) return new Response(null, { status: 404 });

  const { eyebrow } = claimPreview({
    schoolName: program.schoolName,
    teamLabel: teamLabel(program.team),
    status: program.status,
  });
  const squad = `${teamLabel(program.team)} Tennis`;
  // Conference names run to 76 characters ("Region 23 - Mississippi
  // Association of Community Colleges Conference (MACCC)"). Past one line of
  // the card's facts (about 68 characters with the squad) the conference is
  // dropped and the division stays, the same trade the claim flow's eyebrow
  // makes.
  const full = programSubtitle(program.division, program.conference);
  const facts =
    `${squad} · ${full}`.length > FACTS_LINE
      ? (divisionLabel(program.division) ?? "")
      : full;

  return linkCard({
    headline: program.schoolName,
    line: eyebrow,
    facts: [squad, facts].filter(Boolean).join("  ·  "),
    kicker: "College program",
  });
}
