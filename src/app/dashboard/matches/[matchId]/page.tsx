import { redirect } from "next/navigation";

interface MatchDetailPageProps {
  params: Promise<{ matchId: string }>;
}

export default async function MatchDetailPage({
  params,
}: MatchDetailPageProps) {
  const { matchId } = await params;

  redirect(`/dashboard/matches/${matchId}/overall`);
}
