"use client";

/**
 * ProviderContent - Step 2 content
 * Grid of provider cards for selection
 */

import { motion } from "framer-motion";
import { providers } from "@/lib/providers";

export interface ProviderContentProps {
  selectedProvider: string | null;
  onProviderSelect: (providerId: string | null) => void;
}

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

export function ProviderContent({ selectedProvider, onProviderSelect }: ProviderContentProps) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {providers.map((provider) => {
          const isAvailable = provider.available !== false;
          const isSelected = selectedProvider === provider.id;
          return (
            <motion.button
              key={provider.id}
              type="button"
              disabled={!isAvailable}
              onClick={() => {
                if (isAvailable) {
                  onProviderSelect(isSelected ? null : provider.id);
                }
              }}
              initial={false}
              animate={{
                borderColor: isSelected ? "#3B82F6" : "#EAECF0",
                boxShadow: isSelected
                  ? "0 0 0 2px rgba(59,130,246,0.15)"
                  : "0 0 0 0 rgba(59,130,246,0)",
              }}
              transition={{ duration: 0.2, ease: EASE }}
              whileHover={
                isAvailable && !isSelected
                  ? {
                      borderColor: "#D5D5D5",
                      boxShadow: "0px 4px 12px rgba(0,0,0,0.08)",
                    }
                  : undefined
              }
              className={`w-[280px] h-[140px] p-5 rounded-xl bg-white border flex flex-col items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/30 ${
                isAvailable ? "cursor-pointer" : "cursor-not-allowed opacity-60"
              }`}
            >
              <img
                src={provider.logo}
                alt={provider.name}
                className="max-h-10 max-w-[140px] object-contain"
              />
              {provider.description && (
                <span className="text-xs text-[#666] font-normal text-center leading-tight">
                  {provider.description}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
