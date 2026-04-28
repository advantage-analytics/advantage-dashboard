"use client";

/**
 * MethodContent - Step 1 content
 * Two cards for selecting analysis method
 */

import { motion } from "framer-motion";
import { Cpu, Clock } from "lucide-react";

export interface MethodContentProps {
  selectedMethod: string | null;
  onMethodSelect: (methodId: string | null) => void;
}

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

export function MethodContent({ selectedMethod, onMethodSelect }: MethodContentProps) {
  const isElcSelected = selectedMethod === "elc";

  return (
    <div className="h-full flex items-center justify-center gap-5">
      <motion.button
        type="button"
        whileHover={{ y: -2 }}
        transition={{ duration: 0.2, ease: EASE }}
        onClick={() => onMethodSelect(isElcSelected ? null : "elc")}
        className={`w-[260px] h-[200px] rounded-2xl bg-white p-5 text-left flex flex-col cursor-pointer transition-colors transition-shadow duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 ${
          isElcSelected
            ? "border border-[#3B82F6] ring-2 ring-[#3B82F6]/15 shadow-[0px_4px_12px_rgba(0,0,0,0.08)]"
            : "border border-[#EAECF0] hover:border-[#D5D5D5] hover:shadow-[0px_4px_12px_rgba(0,0,0,0.08)]"
        }`}
      >
        <div className="w-10 h-10 rounded-xl bg-[#3B82F6]/10 text-[#3B82F6] flex items-center justify-center">
          <Cpu className="w-5 h-5" strokeWidth={2} />
        </div>
        <div className="mt-4 space-y-1.5 flex-1">
          <p className="text-sm font-medium text-[#0D0D0D]">Electronic Line Calling</p>
          <p className="text-xs text-[#666] leading-relaxed">
            Choose from a variety of providers such as SwingVision, BaselineVision, and many more.
          </p>
        </div>
      </motion.button>

      <div
        className="w-[260px] h-[200px] rounded-2xl bg-[#FAFAFA] border border-[#EAECF0] p-5 flex flex-col cursor-not-allowed relative"
        aria-disabled="true"
      >
        <div className="w-10 h-10 rounded-xl bg-[#F0F0F0] text-[#999] flex items-center justify-center">
          <Clock className="w-5 h-5" strokeWidth={2} />
        </div>
        <div className="mt-4 space-y-1.5 flex-1">
          <p className="text-sm font-medium text-[#999]">Advantage Intelligence</p>
          <p className="text-xs text-[#999] leading-relaxed">
            Choose to label with Advantage Intelligence or traditional labeling techniques.
          </p>
        </div>
        <span className="absolute bottom-4 right-4 bg-white border border-[#EAECF0] rounded-full px-2 py-0.5 text-[10px] text-[#666] font-medium">
          Coming soon
        </span>
      </div>
    </div>
  );
}
