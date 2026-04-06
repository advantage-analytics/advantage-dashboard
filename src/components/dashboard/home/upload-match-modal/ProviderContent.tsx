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
          <div
            key={provider.id}
            className={`w-[280px] h-[140px] transition-all duration-200 rounded-xl bg-white border overflow-visible relative group ${
              isAvailable
                ? 'cursor-pointer border-[#EAECF0] hover:scale-[1.02]'
                : 'cursor-not-allowed border-[#EAECF0]'
            } ${
              selectedProvider === provider.id ? 'ring-2 ring-[var(--color-accent-blue)] ring-offset-2' : ''
            }`}
            onClick={() => {
              if (isAvailable) {
                onProviderSelect(selectedProvider === provider.id ? null : provider.id);
              }
            }}
          >
            {/* Hover overlay for available providers */}
            {isAvailable && (
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/1 transition-all duration-200 z-[5] rounded-xl" />
            )}
            <div className="w-full h-full flex items-center justify-center p-6">
              <img
                src={provider.logo}
                alt={provider.name}
                className="w-[232px] h-[92px] object-contain"
              />
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}
