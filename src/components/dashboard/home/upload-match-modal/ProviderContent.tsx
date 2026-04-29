"use client";

/**
 * ProviderContent — Step 1
 * Vertical list of providers; each row carries logo, name, description, and state.
 */

import { Check, Lock } from "lucide-react";
import { providers } from "@/lib/providers";

export interface ProviderContentProps {
  selectedProvider: string | null;
  onProviderSelect: (providerId: string | null) => void;
}

export function ProviderContent({ selectedProvider, onProviderSelect }: ProviderContentProps) {
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
            className={`group relative w-full flex items-center gap-6 px-6 py-5 rounded-[14px] bg-white border text-left transition-[background-color,box-shadow,border-color,transform] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 focus-visible:ring-offset-2 ${
              isSelected
                ? "border-[#3B82F6] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] active:scale-[0.998]"
                : isAvailable
                ? "border-[#F3F3F3] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] hover:shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] active:scale-[0.998] cursor-pointer"
                : "border-[#F3F3F3] cursor-not-allowed"
            }`}
          >
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

            {/* State column */}
            <div className="shrink-0">
              {isSelected ? (
                <div className="size-6 rounded-full bg-[#3B82F6] flex items-center justify-center">
                  <Check className="size-3 text-white" strokeWidth={2.5} />
                </div>
              ) : !isAvailable ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-1 rounded-[6px] bg-[#F5F5F5] text-[10px] font-medium text-[#888888] uppercase tracking-[2.5px]">
                  <Lock className="size-3" strokeWidth={1.5} />
                  Soon
                </span>
              ) : (
                <span className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px] opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  Select
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
