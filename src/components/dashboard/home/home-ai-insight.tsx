"use client";

import { useEffect, useState } from "react";

// Cached per session so navigating away and back doesn't re-trigger the LLM.
// Bump the version suffix to invalidate stale caches (e.g. a mock-mode response
// cached before an LLM provider was configured).
const CACHE_KEY = "advantage-home-insight:v2";

// The adapter's mock stream (no provider configured) returns this marker. We
// never cache it, so configuring a provider + restarting heals on next load.
const MOCK_MARKER = "No LLM provider";

export default function HomeAiInsight() {
  const [text, setText] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      setText(cached);
      return;
    }

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
          sessionStorage.setItem(CACHE_KEY, acc);
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        setError(true);
      }
    }

    load();

    return () => controller.abort();
  }, []);

  if (error) {
    return (
      <p className="text-[12px] font-normal text-[var(--color-text-body)] leading-[19.8px]">
        Couldn&apos;t load your insight right now. Try again in a moment.
      </p>
    );
  }

  if (!text) {
    return (
      <div className="flex flex-col gap-2" aria-hidden>
        <div className="h-[12px] w-full rounded-full bg-[#F3F3F3] animate-pulse" />
        <div className="h-[12px] w-[85%] rounded-full bg-[#F3F3F3] animate-pulse" />
        <div className="h-[12px] w-[60%] rounded-full bg-[#F3F3F3] animate-pulse" />
      </div>
    );
  }

  return (
    <p className="text-[12px] font-normal text-[var(--color-text-body)] leading-[19.8px]">
      {text}
    </p>
  );
}
