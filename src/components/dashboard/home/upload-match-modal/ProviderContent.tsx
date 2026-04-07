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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-[600px] px-4">
      {providers.map((provider) => {
        const isAvailable = provider.available !== false;
        const isSelected = selectedProvider === provider.id;
        return (
          <div
            key={provider.id}
            className={`w-full aspect-[2/1] transition-all duration-200 rounded-[14px] bg-white border shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 focus-visible:outline-none ${
              isAvailable
                ? 'cursor-pointer border-[#F3F3F3] hover:border-[#3B82F6]/40 hover:shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)]'
                : 'opacity-50 cursor-not-allowed border-[#F3F3F3]'
            } ${
              isSelected ? 'border-[#3B82F6] shadow-[0px_2px_8px_0px_rgba(59,130,246,0.15)]' : ''
            }`}
            tabIndex={isAvailable ? 0 : -1}
            role="button"
            aria-label={`Select ${provider.name}${!isAvailable ? ' (unavailable)' : ''}`}
            aria-pressed={isSelected}
            onClick={() => {
              if (isAvailable) {
                onProviderSelect(isSelected ? null : provider.id);
              }
            }}
            onKeyDown={(e) => {
              if (isAvailable && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onProviderSelect(isSelected ? null : provider.id);
              }
            }}
          >
            <div className="w-full h-full flex items-center justify-center p-6">
              <img
                src={provider.logo}
                alt={provider.name}
                className="max-w-[232px] max-h-[92px] object-contain"
              />
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}
