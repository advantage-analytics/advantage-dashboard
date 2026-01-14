"use client";

/**
 * ProviderContent - Step 2 content
 * Grid of provider cards for selection
 */

import { ProviderCard } from "@/components/dashboard/upload/provider-card";
import { providers } from "@/lib/providers";

export interface ProviderContentProps {
  selectedProvider: string | null;
  onProviderSelect: (providerId: string) => void;
}

export function ProviderContent({ selectedProvider, onProviderSelect }: ProviderContentProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {providers.map((provider) => (
        <ProviderCard
          key={provider.id}
          id={provider.id}
          name={provider.name}
          description={provider.description}
          logo={provider.logo}
          onClick={onProviderSelect}
          isSelected={selectedProvider === provider.id}
        />
      ))}
    </div>
  );
}
