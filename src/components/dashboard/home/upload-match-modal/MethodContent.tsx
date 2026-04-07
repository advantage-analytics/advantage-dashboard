"use client";

/**
 * MethodContent - Step 1 content
 * Two cards for selecting analysis method
 */

import { motion } from "framer-motion";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94];

export interface MethodContentProps {
  selectedMethod: string | null;
  onMethodSelect: (methodId: string | null) => void;
}

export function MethodContent({ selectedMethod, onMethodSelect }: MethodContentProps) {
  return (
    <div className="h-full flex items-center justify-center gap-6">
      {/* ELC Card (selectable) */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE_CURVE }}
      >
        <div
          className={`w-[260px] h-[260px] bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] cursor-pointer overflow-hidden transition-colors duration-200 hover:border-[#3B82F6]/30 ${
            selectedMethod === "elc" ? "ring-2 ring-[#3B82F6] ring-offset-2" : ""
          }`}
          onClick={() => onMethodSelect(selectedMethod === "elc" ? null : "elc")}
          role="button"
          tabIndex={0}
          aria-label="Select Electronic Line Calling method"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onMethodSelect(selectedMethod === "elc" ? null : "elc");
            }
          }}
        >
          <img
            src="/marketing/elc-image.png"
            alt="Electronic Line Calling"
            className="h-[156px] w-full object-cover rounded-t-[14px]"
          />
          <div className="px-4 py-4 space-y-1.5">
            <p className="text-[13px] font-medium text-[#0D0D0D]">Electronic Line Calling</p>
            <p className="text-[11px] font-normal text-[#888888] leading-[1.5]">
              Choose from a variety of providers such as SwingVision, BaselineVision, and many more.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Coming Soon Card (disabled) */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 1 * 0.05, ease: EASE_CURVE }}
      >
        <div
          className="w-[260px] h-[260px] bg-[#FAFAFA] border border-[#F3F3F3] rounded-[14px] cursor-not-allowed overflow-hidden relative"
          aria-disabled="true"
          aria-label="Coming soon analysis method"
        >
          <span className="absolute top-3 right-3 px-2 py-0.5 rounded-[6px] bg-[#F5F5F5] text-[9px] font-medium text-[#888888] uppercase tracking-[1.5px] z-10">
            Coming Soon
          </span>
          <div className="h-[156px] w-full flex items-center justify-center">
            <img
              src="/logos/logo.svg"
              alt="Advantage"
              className="w-[78px] h-[14px]"
            />
          </div>
          <div className="px-4 py-4 space-y-1.5">
            <p className="text-[13px] font-medium text-[#888888]">Coming Soon</p>
            <p className="text-[11px] font-normal text-[#888888] leading-[1.5]">
              Choose to label with Advantage Intelligence or traditional labeling techniques.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
