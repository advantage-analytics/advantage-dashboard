"use client";

import { useEffect, useState } from "react";
import type { KpiCardData } from "@/lib/data/performance-server";
import { InsightStatChip } from "@/components/dashboard/shared/insight-stat-chip";

// Cached per session so navigating away and back doesn't re-trigger the LLM.
// The key is suffixed with a signature of the underlying performance data (see
// `cacheSignature`), so uploading a new match invalidates the stale insight and
// regenerates it. Bump the version below to invalidate every cache (e.g. a
// mock-mode response cached before an LLM provider was configured).
const CACHE_KEY = "advantage-home-insight:v3";

// The adapter's mock stream (no provider configured) returns this marker. We
// never cache it, so configuring a provider + restarting heals on next load.
const MOCK_MARKER = "No LLM provider";

interface HomeAiInsightProps {
  /** Deterministic supporting stats (top KPI movers) rendered as evidence chips. */
  supportingStats?: KpiCardData[];
  /**
   * Signature of the underlying performance data (match count, win rate, recent
   * form). When it changes — e.g. a newly uploaded match finishes processing — the
   * cached insight is invalidated and a fresh one is generated.
   */
  cacheSignature?: string;
}

export default function HomeAiInsight({
  supportingStats = [],
  cacheSignature = "",
}: HomeAiInsightProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    const cacheKey = `${CACHE_KEY}:${cacheSignature}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      setText(cached);
      setError(false);
      return;
    }

    // No cache for this data signature — reset to the loading state and re-fetch.
    setText("");
    setError(false);
    const controller = new AbortController();

    async function load() {
      try {
        const res = await fetch("/api/home-insight", {
          method: "POST",
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          setError(true);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setText(acc);
        }

        // Cache only a real insight — never the mock-mode warning.
        if (acc.trim() && !acc.includes(MOCK_MARKER)) {
          sessionStorage.setItem(cacheKey, acc);
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        setError(true);
      }
    }

    load();

    return () => controller.abort();
  }, [cacheSignature]);

  const body = error ? (
    <p className="text-[12px] font-normal text-[var(--color-text-body)] leading-[19.8px]">
      Couldn&apos;t load your insight right now. Try again in a moment.
    </p>
  ) : !text ? (
    <div className="flex flex-col gap-2" aria-hidden>
      <div className="h-[12px] w-full rounded-full bg-[#F3F3F3] animate-pulse" />
      <div className="h-[12px] w-[85%] rounded-full bg-[#F3F3F3] animate-pulse" />
      <div className="h-[12px] w-[60%] rounded-full bg-[#F3F3F3] animate-pulse" />
    </div>
  ) : (
    <p className="text-[12px] font-normal text-[var(--color-text-body)] leading-[19.8px]">
      {text}
    </p>
  );

  return (
    <div className="flex flex-col gap-3.5">
      {body}
      {supportingStats.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {supportingStats.map((stat) => (
            <InsightStatChip
              key={stat.key}
              label={stat.label}
              value={stat.value}
              change={stat.change}
              lowerIsBetter={stat.lowerIsBetter}
            />
          ))}
        </div>
      )}
    </div>
  );
}
