"use client";

import { MatchVideoPanel } from "@/components/dashboard/matches/match-video-panel";
import { useParams } from "next/navigation";

export default function VideoPage() {
  const { matchId } = useParams<{ matchId: string }>();
  return <MatchVideoPanel matchId={matchId} />;
}
