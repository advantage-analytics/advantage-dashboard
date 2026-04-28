"use client";

/**
 * MethodContent - Step 1 content
 * Two cards for selecting analysis method:
 *   - Electronic Line Calling (available, image-hero)
 *   - Advantage Intelligence (coming soon, disabled)
 *
 * Auto-selects ELC on mount since it is the only available option.
 */

import { useEffect } from "react";
import { ArrowRight, Sparkles } from "lucide-react";

export interface MethodContentProps {
  selectedMethod: string | null;
  onMethodSelect: (methodId: string | null) => void;
}

export function MethodContent({ selectedMethod, onMethodSelect }: MethodContentProps) {
  // Auto-select ELC on mount: it is currently the only available method.
  useEffect(() => {
    if (selectedMethod !== "elc") {
      onMethodSelect("elc");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isElcSelected = selectedMethod === "elc";

  return (
    <div className="h-full flex items-center justify-center gap-3">
      <button
        type="button"
        aria-pressed={isElcSelected}
        onClick={() => onMethodSelect(isElcSelected ? null : "elc")}
        className={`group relative w-[240px] h-[252px] rounded-[14px] overflow-hidden text-left cursor-pointer bg-white border shadow-card transition-[border-color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 focus-visible:ring-offset-2 ${
          isElcSelected
            ? "border-[#3B82F6] shadow-[0_0_0_1px_#3B82F6]"
            : "border-[#F3F3F3] hover:border-[#AAAAAA]"
        }`}
      >
        <img
          src="/marketing/elc-image.png"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] group-hover:scale-[1.03]"
        />

        <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/95 backdrop-blur-[2px]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#5DB955]" aria-hidden="true" />
          <span className="text-[9px] font-medium uppercase tracking-[1.5px] text-[#0D0D0D]">
            Available
          </span>
        </div>

        <div className="absolute inset-x-0 bottom-0 h-[60%] bg-gradient-to-t from-[#0D0D0D]/90 via-[#0D0D0D]/55 to-transparent z-10" />
        <div className="absolute inset-x-0 bottom-0 z-20 p-4">
          <p className="text-[14px] font-medium text-white leading-tight">
            Electronic Line Calling
          </p>
          <p className="mt-1 text-[11px] font-normal text-white/75 leading-[1.45]">
            Import a match from SwingVision, BaselineVision, or another ELC provider.
          </p>
          <div
            className={`mt-3 inline-flex items-center gap-1 text-[11px] font-medium transition-colors duration-200 ${
              isElcSelected ? "text-[#3B82F6]" : "text-white"
            }`}
          >
            <span>{isElcSelected ? "Selected" : "Continue with ELC"}</span>
            <ArrowRight
              className="h-3 w-3 transition-transform duration-200 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] group-hover:translate-x-0.5"
              strokeWidth={2}
              aria-hidden="true"
            />
          </div>
        </div>
      </button>

      <div
        aria-disabled="true"
        className="relative w-[240px] h-[252px] rounded-[14px] overflow-hidden bg-white border border-[#F3F3F3] shadow-card cursor-not-allowed flex flex-col"
      >
        <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#FAFAFA] border border-[#F3F3F3]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#AAAAAA]" aria-hidden="true" />
          <span className="text-[9px] font-medium uppercase tracking-[1.5px] text-[#888888]">
            Coming Soon
          </span>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-2.5">
          <div className="h-9 w-9 rounded-full bg-[#FAFAFA] border border-[#F3F3F3] flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-[#AAAAAA]" strokeWidth={1.5} aria-hidden="true" />
          </div>
          <img
            src="/logos/logo.svg"
            alt="Advantage"
            className="h-[14px] w-auto opacity-60"
          />
        </div>

        <div className="p-4 border-t border-[#F3F3F3]">
          <p className="text-[14px] font-medium text-[#0D0D0D] leading-tight">
            Advantage Intelligence
          </p>
          <p className="mt-1 text-[11px] font-normal text-[#888888] leading-[1.45]">
            Auto-label rallies with our model — no ELC device required.
          </p>
        </div>
      </div>
    </div>
  );
}
