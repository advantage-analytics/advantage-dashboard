import { SearchX } from "lucide-react";
import { ErrorState } from "@/components/dashboard/matches/error-state";

export default function NotFound() {
  return (
    <ErrorState
      icon={SearchX}
      title="Match not found"
      description="This match doesn't exist or has been removed from your library."
      primaryAction={{
        type: "link",
        label: "Back to matches",
        href: "/dashboard/matches",
      }}
    />
  );
}
