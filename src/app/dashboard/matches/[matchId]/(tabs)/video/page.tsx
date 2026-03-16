import { MatchVideoPanel } from "@/components/dashboard/matches/match-video-panel";

interface VideoPageProps {
  params: Promise<{ matchId: string }>;
}

export default async function VideoPage({
  params,
}: VideoPageProps): Promise<React.JSX.Element> {
  const { matchId } = await params;
  return (
    <MatchVideoPanel matchId={matchId} />
  );
}
