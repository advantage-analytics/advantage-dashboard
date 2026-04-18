"use client";

/**
 * ProviderContent - Step 2 content
 * Grid of provider cards for selection
 */

import { providers } from "@/lib/providers";

export interface ProviderContentProps {
  selectedProvider: string | null;
  onProviderSelect: (providerId: string | null) => void;
}

export function ProviderContent({ selectedProvider, onProviderSelect }: ProviderContentProps) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-[24px]">
      {providers.map((provider) => {
        const isAvailable = provider.available !== false;
        return (
          <button
            key={provider.id}
            type="button"
            disabled={!isAvailable}
            className={`w-[280px] h-[140px] transition-all duration-200 rounded-xl bg-white border overflow-visible relative group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 ${
              isAvailable
                ? 'cursor-pointer border-[#F3F3F3] hover:scale-[1.02]'
                : 'cursor-not-allowed border-[#F3F3F3]'
            } ${
              selectedProvider === provider.id ? 'ring-2 ring-[#3B82F6] ring-offset-2' : ''
            }`}
            onClick={() => {
              if (isAvailable) {
                onProviderSelect(selectedProvider === provider.id ? null : provider.id);
              }
            }}
          >
            {/* Hover overlay for available providers */}
            {isAvailable && (
              <div className="absolute inset-0 bg-[#0D0D0D]/0 group-hover:bg-[#0D0D0D]/[0.01] transition-all duration-200 z-[5] rounded-xl" />
            )}
            <div className="w-full h-full flex items-center justify-center p-6">
              <img
                src={provider.logo}
                alt={provider.name}
                className="w-[232px] h-[92px] object-contain"
              />
            </div>
          </button>
        );
      })}
      </div>
    </div>
  );
}
