"use client";

/**
 * ProviderContent — Step 1
 * Vertical list of providers; each row carries logo, name, description, and state.
 */

import { memo } from "react";
import { Check, Lock, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { providers } from "@/lib/providers";

export interface ProviderContentProps {
  selectedProvider: string | null;
  onProviderSelect: (providerId: string | null) => void;
}

function ProviderContentImpl({ selectedProvider, onProviderSelect }: ProviderContentProps) {
  return (
    <div className="flex flex-col gap-2.5 py-2">
      {providers.map((provider) => {
        const isAvailable = provider.available !== false;
        const isSelected = selectedProvider === provider.id;
        return (
          <button
            key={provider.id}
            type="button"
            disabled={!isAvailable}
            onClick={() => {
              if (isAvailable) {
                onProviderSelect(isSelected ? null : provider.id);
              }
            }}
            className={`group relative w-full flex items-center gap-6 px-6 py-5 rounded-[14px] bg-white border text-left transition-colors duration-200 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 focus-visible:ring-offset-2 ${
              isAvailable
                ? "border-[#F3F3F3] hover:border-[#E5E5EA] cursor-pointer"
                : "border-[#F3F3F3] cursor-not-allowed"
            }`}
          >
            {/* Selection accent — sibling overlay so opacity carries the work, not box-shadow */}
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute inset-0 rounded-[14px] ring-1 ring-inset ring-[#3B82F6] transition-opacity ease-[cubic-bezier(0.23,1,0.32,1)] ${
                isSelected ? "opacity-100 duration-200" : "opacity-0 duration-150"
              }`}
            />

            {/* Logo column — fixed width so all rows align */}
            <div className="w-[180px] h-20 flex items-center justify-center shrink-0">
              <img
                src={provider.logo}
                alt={provider.name}
                className={`max-w-full max-h-full object-contain transition-opacity duration-200 ${
                  isAvailable ? "" : "opacity-50"
                }`}
              />
            </div>

            {/* Text column — name + description */}
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <p
                className={`text-[16px] font-normal tracking-[-0.4px] truncate ${
                  isAvailable ? "text-[#0D0D0D]" : "text-[#888888]"
                }`}
              >
                {provider.name}
              </p>
              {provider.description && (
                <p className="text-[12px] font-normal text-[#888888] truncate">
                  {provider.description}
                </p>
              )}
            </div>

            {/* State column — fixed-height container so exit anims don't push layout */}
            <div className="shrink-0 relative flex items-center justify-end h-6 min-w-[24px]">
              <AnimatePresence mode="wait" initial={false}>
                {isSelected ? (
                  <motion.div
                    key="check"
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{
                      opacity: 1,
                      scale: 1,
                      transition: {
                        opacity: { duration: 0.16, ease: [0.23, 1, 0.32, 1] },
                        scale: {
                          type: "spring",
                          duration: 0.4,
                          bounce: 0.4,
                          delay: 0.06,
                        },
                      },
                    }}
                    exit={{
                      opacity: 0,
                      scale: 0.85,
                      transition: { duration: 0.12, ease: [0.23, 1, 0.32, 1] },
                    }}
                    className="size-6 rounded-full bg-[#3B82F6] flex items-center justify-center"
                  >
                    <Check className="size-3 text-white" strokeWidth={2.5} />
                  </motion.div>
                ) : !isAvailable ? (
                  <motion.span
                    key="lock"
                    initial={false}
                    className="inline-flex items-center gap-1 px-1.5 py-1 rounded-[6px] bg-[#F5F5F5] text-[10px] font-medium text-[#888888] uppercase tracking-[2.5px]"
                  >
                    <Lock className="size-3" strokeWidth={1.5} />
                    Soon
                  </motion.span>
                ) : (
                  <motion.span
                    key="hint"
                    initial={false}
                    className="inline-flex items-center gap-1 text-[10px] font-medium text-[#CCCCCC] uppercase tracking-[2.5px] group-hover:text-[#525252] transition-colors duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]"
                  >
                    Select
                    <ChevronRight className="size-3" strokeWidth={1.5} aria-hidden="true" />
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export const ProviderContent = memo(ProviderContentImpl);
