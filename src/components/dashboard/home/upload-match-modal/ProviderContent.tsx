"use client";

import { Check } from "lucide-react";
import { providers } from "@/lib/providers";
import { cn } from "@/lib/utils";

export interface ProviderContentProps {
  selectedProvider: string | null;
  onProviderSelect: (providerId: string | null) => void;
}

export function ProviderContent({ selectedProvider, onProviderSelect }: ProviderContentProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center">
      <div className="w-full max-w-[480px] flex flex-col gap-2">
        {providers.map((provider) => {
          const isAvailable = provider.available !== false;
          const isSelected = selectedProvider === provider.id;
          return (
            <button
              key={provider.id}
              type="button"
              disabled={!isAvailable}
              aria-pressed={isSelected}
              onClick={() => {
                if (isAvailable) {
                  onProviderSelect(isSelected ? null : provider.id);
                }
              }}
              className={cn(
                "relative w-full text-left rounded-[10px] border transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40",
                isAvailable
                  ? "cursor-pointer bg-white border-[#F3F3F3] hover:border-[#0D0D0D]/10 hover:bg-[#FAFAFA]"
                  : "cursor-not-allowed bg-[#FAFAFA] border-[#F3F3F3]",
                isSelected && "border-[#3B82F6]/40 bg-[#FAFAFA]"
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "absolute left-0 top-2 bottom-2 w-[2px] rounded-full transition-all duration-200",
                  isSelected ? "bg-[#3B82F6]" : "bg-transparent"
                )}
              />

              <div className="flex items-center gap-4 px-4 py-3">
                <div
                  className={cn(
                    "flex-shrink-0 flex items-center justify-center w-[44px] h-[44px] rounded-[8px] border border-[#F3F3F3]",
                    isAvailable ? "bg-white" : "bg-[#FAFAFA]"
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={provider.logo}
                    alt={provider.name}
                    className={cn(
                      "w-[32px] h-[32px] object-contain",
                      !isAvailable && "opacity-50 grayscale"
                    )}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "text-[13px] font-medium leading-none",
                        isAvailable ? "text-[#0D0D0D]" : "text-[#888888]"
                      )}
                    >
                      {provider.name}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] font-medium uppercase tracking-[2.5px]",
                        isAvailable ? "text-[#5DB955]" : "text-[#AAAAAA]"
                      )}
                    >
                      {isAvailable ? "Available" : "Soon"}
                    </span>
                  </div>
                  {provider.description && (
                    <p
                      className={cn(
                        "mt-1 text-[12px] leading-none",
                        isAvailable ? "text-[#525252]" : "text-[#888888]"
                      )}
                    >
                      {provider.description}
                    </p>
                  )}
                </div>

                <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                  {isSelected && (
                    <Check className="w-3.5 h-3.5 text-[#3B82F6]" strokeWidth={2.5} />
                  )}
                </div>
              </div>
            </button>
          );
        })}

        <p className="mt-3 text-[10px] font-normal text-[#AAAAAA] text-center">
          More providers being added soon.
        </p>
      </div>
    </div>
  );
}
