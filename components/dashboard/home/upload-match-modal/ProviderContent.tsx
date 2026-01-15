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
      {providers.map((provider) => (
        <div
          key={provider.id}
          className={`w-[280px] h-[140px] cursor-pointer transition-all duration-200 rounded-xl bg-white border border-[#EAECF0] overflow-hidden relative group hover:scale-[1.02] ${
            selectedProvider === provider.id ? 'ring-2 ring-[#3B82F6] ring-offset-2' : ''
          }`}
          onClick={() => onProviderSelect(selectedProvider === provider.id ? null : provider.id)}
        >
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/1 transition-all duration-200 z-[5]" />
          <div className="w-full h-full flex items-center justify-center p-6">
            <img
              src={provider.logo}
              alt={provider.name}
              className="w-[232px] h-[92px] object-contain"
            />
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}
