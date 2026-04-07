"use client";

/**
 * ProviderContent - Step 2 content
 * Grid of provider cards for selection
 */

import { motion } from "framer-motion";
import { providers } from "@/lib/providers";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94];

export interface ProviderContentProps {
  selectedProvider: string | null;
  onProviderSelect: (providerId: string | null) => void;
}

export function ProviderContent({ selectedProvider, onProviderSelect }: ProviderContentProps) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-[24px]">
      {providers.map((provider, index) => {
        const isAvailable = provider.available !== false;
        return (
          <motion.div
            key={provider.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05, ease: EASE_CURVE }}
          >
            <div
              className={`w-[280px] h-[140px] rounded-[14px] overflow-hidden relative transition-colors duration-200 ${
                isAvailable
                  ? `bg-white border border-[#F3F3F3] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] cursor-pointer hover:border-[#3B82F6]/30 active:scale-[0.997]`
                  : "bg-[#FAFAFA] border border-[#F3F3F3] cursor-not-allowed"
              } ${
                selectedProvider === provider.id ? "ring-2 ring-[#3B82F6] ring-offset-2" : ""
              }`}
              onClick={() => {
                if (isAvailable) {
                  onProviderSelect(selectedProvider === provider.id ? null : provider.id);
                }
              }}
              role="button"
              tabIndex={isAvailable ? 0 : -1}
              aria-label={isAvailable ? `Select ${provider.name}` : `${provider.name} - coming soon`}
              aria-disabled={!isAvailable}
              onKeyDown={(e) => {
                if (isAvailable && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onProviderSelect(selectedProvider === provider.id ? null : provider.id);
                }
              }}
            >
              {!isAvailable && (
                <span className="absolute top-3 right-3 px-2 py-0.5 rounded-[6px] bg-[#F5F5F5] text-[9px] font-medium text-[#888888] uppercase tracking-[1.5px] z-10">
                  Coming Soon
                </span>
              )}
              <div className="w-full h-full flex items-center justify-center p-6">
                <img
                  src={provider.logo}
                  alt={provider.name}
                  className="w-[232px] h-[92px] object-contain"
                />
              </div>
            </div>
          </motion.div>
        );
      })}
      </div>
    </div>
  );
}
