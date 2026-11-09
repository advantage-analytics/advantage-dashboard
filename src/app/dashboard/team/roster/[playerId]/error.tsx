"use client";

import { useEffect, useTransition } from "react";
import { useParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { ErrorState } from "@/components/dashboard/matches/error-state";
import { SUPPORT_EMAIL } from "@/lib/constants";
import { useReportBoundaryError } from "@/lib/ui/report-boundary-error";

function buildSupportMailto(
  playerId: string | undefined,
  digest: string | undefined,
) {
  const subject = "Player profile error";
  const lines = [
    "Hi team,",
    "",
    "I hit an error loading a player profile. Details below:",
    "",
    playerId ? `Player ID: ${playerId}` : undefined,
    digest ? `Error ID: ${digest}` : undefined,
    "",
    "(Please describe what you were doing when this happened.)",
  ].filter(Boolean);
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
}

// The profile's reads fail closed — a roster or matches read that errors
// throws rather than reading as "not on the roster" or "0 matches"
// (`player-profile-server.ts`). Without this boundary that throw reached
// `global-error.tsx` and replaced the whole dashboard. `retry`, not `reset`:
// the failure is in the Server Component's fetch, and only `retry()`
// re-fetches the segment (as on match detail's `error.tsx`).
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const params = useParams<{ playerId: string }>();
  const playerId = params?.playerId;
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    console.error("player-profile error", { playerId, error });
  }, [error, playerId]);
  useReportBoundaryError(error);

  const meta: { label: string; value: string; copyable?: boolean }[] = [];
  if (error.digest)
    meta.push({ label: "Error", value: error.digest, copyable: true });

  return (
    <ErrorState
      icon={AlertCircle}
      title="This profile couldn't load"
      description="Something went wrong on our end. Try again — if it keeps happening, share the error ID below."
      primaryAction={{
        type: "button",
        label: "Try again",
        loading: isPending,
        onClick: () => startTransition(() => retry()),
      }}
      secondaryAction={{
        label: "Back to roster",
        href: "/dashboard/team/roster",
      }}
      meta={meta.length > 0 ? meta : undefined}
      helpLink={{
        label: "Email support",
        href: buildSupportMailto(playerId, error.digest),
      }}
    />
  );
}
