import { MatchVideoPanel } from "@/components/dashboard/matches/match-video-panel";
import { VideoPageWrapper } from "./video-page-wrapper";

interface VideoPageProps {
  params: Promise<{ matchId: string }>;
}

export default async function VideoPage({
  params,
}: VideoPageProps): Promise<React.JSX.Element> {
  const { matchId } = await params;
  return (
    <VideoPageWrapper>
      <MatchVideoPanel matchId={matchId} />
    </VideoPageWrapper>
  );
}
