import type { Metadata } from "next";
import { UploadMatchFlow } from "@/components/dashboard/matches/new-match-wizard/UploadMatchFlow";
import { loadMatchDraft } from "@/lib/wizard/actions";

export const metadata: Metadata = {
  title: "New match",
};

/**
 * The wizard, fresh — or resumed from a draft the Matches table offered
 * (`?draft=`). A draft that is not the viewer's, or is gone, opens a fresh
 * wizard rather than an error: the person came here to add a match.
 */
export default async function NewMatchPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}): Promise<React.JSX.Element> {
  const { draft: draftId } = await searchParams;
  const draft = draftId ? await loadMatchDraft(draftId) : null;
  return <UploadMatchFlow draft={draft} />;
}
