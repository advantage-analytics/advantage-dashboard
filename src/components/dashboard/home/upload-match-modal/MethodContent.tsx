"use client";

/**
 * MethodContent - Step 1 content
 * Two cards for selecting analysis method
 */

import { Sparkles } from "lucide-react";

export interface MethodContentProps {
  selectedMethod: string | null;
  onMethodSelect: (methodId: string | null) => void;
}

export function MethodContent({ selectedMethod, onMethodSelect }: MethodContentProps) {
  const isSelected = selectedMethod === "elc";

  return (
    <div className="h-full flex items-center justify-center gap-6">
      {/* ELC Card */}
      <div
        className={`flex-1 max-w-[280px] cursor-pointer transition-all duration-200 rounded-[14px] overflow-hidden bg-white border shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] hover:border-[#3B82F6]/40 hover:shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)] focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 focus-visible:outline-none ${
          isSelected
            ? "border-[#3B82F6] shadow-[0px_2px_8px_0px_rgba(59,130,246,0.15)]"
            : "border-[#F3F3F3]"
        }`}
        onClick={() => onMethodSelect(isSelected ? null : "elc")}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onMethodSelect(isSelected ? null : "elc");
          }
        }}
        aria-label="Select Electronic Line Calling method"
      >
        <img
          src="/marketing/elc-image.png"
          alt="Electronic Line Calling"
          className="w-full h-24 object-cover"
        />
        <div className="px-4 py-3 space-y-1">
          <p className="text-[13px] font-medium text-[#0D0D0D]">Electronic Line Calling</p>
          <p className="text-[12px] font-normal text-[#525252] leading-[1.5]">
            Choose from a variety of providers such as SwingVision, BaselineVision, and many more.
          </p>
        </div>
      </div>

      {/* Coming Soon Card */}
      <div
        className="flex-1 max-w-[280px] cursor-not-allowed rounded-[14px] overflow-hidden bg-white border border-[#F3F3F3] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] opacity-50"
        aria-label="Coming soon"
      >
        <div className="flex items-center justify-center h-24">
          <div className="bg-[#F5F5F5] p-4 rounded-full">
            <Sparkles className="size-8 text-[#888888]" strokeWidth={1.5} aria-hidden="true" />
          </div>
        </div>
        <div className="px-4 py-3 space-y-1">
          <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">Coming Soon</p>
          <p className="text-[12px] font-normal text-[#525252] leading-[1.5]">
            Choose to label with Advantage Intelligence or traditional labeling techniques.
          </p>
        </div>
      </div>
    </div>
  );
}
