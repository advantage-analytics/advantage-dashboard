"use client";

import { useEffect, useState } from "react";
import type { EvidencePart } from "@/lib/ui/insight-evidence";
import { HOME_CLAIM_CLASS } from "@/lib/ui/home-claim";

// Cached per session so navigating away and back doesn't re-trigger the LLM.
// The key is suffixed with a signature of the underlying performance data (see
// `cacheSignature`), so uploading a new match invalidates the stale insight and
// regenerates it. Bump the version below to invalidate every cache — v4 drops
// every v3 entry, which held whole paragraphs rather than a single claim.
const CACHE_KEY = "advantage-home-insight:v4";

// The adapter's mock stream (no provider configured) returns this marker. We
// never cache it, so configuring a provider + restarting heals on next load.
const MOCK_MARKER = "No LLM provider";

interface HomeAiInsightProps {
  /**
   * The evidence line, already composed from computed stats. Never LLM text —
   * see `buildInsightEvidenceWithCaption`. Renders immediately, without waiting on the
   * stream, because it needs nothing the server did not already know.
   */
  evidence: EvidencePart[];
  /**
   * Signature of the underlying performance data (match count, win rate, recent
   * form). When it changes — e.g. a newly uploaded match finishes processing — the
   * cached insight is invalidated and a fresh one is generated.
   */
  cacheSignature?: string;
}

export default function HomeAiInsight({
  evidence,
  cacheSignature = "",
}: HomeAiInsightProps) {
  const [claim, setClaim] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    const cacheKey = `${CACHE_KEY}:${cacheSignature}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      setClaim(cached);
      setError(false);
      return;
    }

    // No cache for this data signature — reset to the loading state and re-fetch.
    setClaim("");
    setError(false);
    const controller = new AbortController();

    async function load() {
      try {
        const res = await fetch("/api/home-insight", {
          method: "POST",
          signal: controller.signal,
        });

        // 204 — the server found no movement worth a claim. Not an error: the
        // evidence line below still stands on its own.
        if (res.status === 204) return;

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
          setClaim(acc);
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

  // Pa2's "quiet body" setting: the claim at 14px/300 — a size step over the
  // evidence rather than display type, so the page's largest type stays the
  // KPI numbers above — and the evidence dropped to 12px ink-600 with only
  // its figures in ink-900. The claim reads first by a wider margin; the
  // evidence is something you lean in for. The footer (caption and sample
  // size) belongs to `FocusCard`, which draws it for the empty card too.
  return (
    <div className="flex flex-col gap-3">
      {/* Claim — one falsifiable sentence, the card's only title-weight text. */}
      {error ? (
        <p className="text-body-sm">
          Couldn&apos;t load your insight right now. Try again in a moment.
        </p>
      ) : claim ? (
        <span className={HOME_CLAIM_CLASS} style={{ maxWidth: "30ch", textWrap: "pretty" }}>
          {claim}
        </span>
      ) : (
        <div className="h-5 w-[85%] animate-pulse rounded-full bg-[#F3F3F3]" aria-hidden />
      )}

      {/* Evidence — computed, never invented. Present even when the claim
          fails to load: the numbers are ours and they are still true. */}
      <span
        className="text-[12px] leading-[1.7] text-[var(--ink-600)]"
        style={{ textWrap: "pretty" }}
      >
        {evidence.map((part, i) =>
          part.tabular ? (
            <span key={i} className="tabular text-[var(--ink-900)]">
              {part.text}
            </span>
          ) : (
            <span key={i}>{part.text}</span>
          )
        )}
      </span>
    </div>
  );
}
