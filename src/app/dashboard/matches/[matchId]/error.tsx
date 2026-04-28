"use client";

import { useEffect, useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { ErrorState } from "@/components/dashboard/matches/error-state";
import {
  readRetryCount,
  writeRetryCount,
} from "@/components/dashboard/matches/retry-state";

const ESCALATION_THRESHOLD = 3;
const SUPPORT_EMAIL = "team@advantage-analytics.com";

function buildSupportMailto(
  matchId: string | undefined,
  digest: string | undefined,
) {
  const subject = "Match detail error";
  const lines = [
    "Hi team,",
    "",
    "I hit an error loading a match. Details below:",
    "",
    matchId ? `Match ID: ${matchId}` : undefined,
    digest ? `Error ID: ${digest}` : undefined,
    "",
    "(Please describe what you were doing when this happened.)",
  ].filter(Boolean);
  const body = lines.join("\n");
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams<{ matchId: string }>();
  const matchId = params?.matchId;
  const [isPending, startTransition] = useTransition();
  const [manualPending, setManualPending] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const loading = isPending || manualPending;
  const escalated = retryCount >= ESCALATION_THRESHOLD;

  useEffect(() => {
    console.error("match-detail error", { matchId, error });
  }, [error, matchId]);

  useEffect(() => {
    if (!matchId) return;
    setRetryCount(readRetryCount(matchId));
  }, [matchId]);

  function handleRetry() {
    setManualPending(true);
    if (matchId) {
      const next = retryCount + 1;
      writeRetryCount(matchId, next);
      setRetryCount(next);
    }
    startTransition(() => {
      reset();
      setManualPending(false);
    });
  }

  const meta: { label: string; value: string; copyable?: boolean }[] = [];
  if (matchId) meta.push({ label: "Match", value: matchId, copyable: true });
  if (error.digest)
    meta.push({ label: "Error", value: error.digest, copyable: true });

  const description = escalated
    ? "We've tried a few times without luck. This might take a moment to resolve — please try again later, or share the error ID below to get help faster."
    : "Something went wrong on our end. Try again — if it keeps happening, share the error ID below.";

  return (
    <ErrorState
      icon={AlertCircle}
      title={escalated ? "Still having trouble loading this match" : "This match couldn't load"}
      description={description}
      primaryAction={{
        type: "button",
        label: "Try again",
        loading,
        onClick: handleRetry,
      }}
      secondaryAction={{ label: "Back to matches", href: "/dashboard/matches" }}
      meta={meta.length > 0 ? meta : undefined}
      helpLink={{
        label: "Email support",
        href: buildSupportMailto(matchId, error.digest),
      }}
    />
  );
}
