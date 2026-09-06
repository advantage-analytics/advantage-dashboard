import type { Metadata } from "next";
import { UploadMatchFlow } from "@/components/dashboard/matches/new-match-wizard/UploadMatchFlow";
import { loadMatchDraft } from "@/lib/wizard/actions";
import { isProviderSupported, type ProviderId } from "@/lib/services/upload";

export const metadata: Metadata = {
  title: "New match",
};

/**
 * The wizard, fresh — or resumed from a draft the Matches table offered
 * (`?draft=`). A draft that is not the viewer's, or is gone, opens a fresh
 * wizard rather than an error: the person came here to add a match.
 *
 * `?source=` preselects the Source field for a link that already named one —
 * Home's day-zero page sends SwingVision importers here. It does **not** skip
 * step one: that step also asks which workspace the match is filed under and
 * who played it, and the second of those decides `matches.player1_id`, where a
 * wrong value hands read access to the wrong person and attributes every
 * statistic to them. A link may answer a question on that step; it may not
 * answer them all and move on.
 *
 * Validated against the provider registry, so an unknown or retired id falls
 * through to the wizard's own default rather than reaching the flow.
 */
export default async function NewMatchPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string; source?: string }>;
}): Promise<React.JSX.Element> {
  const { draft: draftId, source } = await searchParams;
  const draft = draftId ? await loadMatchDraft(draftId) : null;
  const initialProvider: ProviderId | null =
    source && isProviderSupported(source) ? (source as ProviderId) : null;
  return <UploadMatchFlow draft={draft} initialProvider={initialProvider} />;
}
