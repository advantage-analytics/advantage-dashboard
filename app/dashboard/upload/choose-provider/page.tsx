"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ProviderCard } from "@/components/dashboard/upload/provider-card";
import { providers } from "@/lib/providers";
import { Button } from "@/components/ui/button";

/**
 * ChooseProviderClient Component
 * 
 * This component handles the first step of the upload flow where users select
 * an Electronic Line Calling (ELC) provider. It includes the following features:
 * 
 * MODIFICATIONS MADE IN THIS SESSION:
 * 1. Added state management for selected provider (no longer auto-navigates on selection)
 * 2. Added Continue button that's disabled until provider is selected
 * 3. Added provider persistence when navigating back from Step 2
 * 4. Added real-time communication with sidebar via custom events
 * 5. Provider selection is saved to localStorage immediately when selected
 */
export default function ChooseProviderClient() {
  const router = useRouter();
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

  /**
   * Check for existing provider selection when component mounts
   * This allows the provider to remain selected when navigating back from Step 2
   * Previously, the component would clear localStorage on mount, but we changed
   * this to preserve the selection within the upload flow
   */
  useEffect(() => {
    const existingProvider = localStorage.getItem("selectedProvider");
    if (existingProvider) {
      setSelectedProvider(existingProvider);
    }
  }, []);


  /**
   * Handle provider selection
   * MODIFICATION: Previously this would auto-navigate to the next step.
   * Now it only updates state and saves to localStorage, allowing users to
   * review their selection before proceeding.
   */
  const handleProviderSelect = (provider: string) => {
    setSelectedProvider(provider);
    // Save to localStorage immediately when provider is selected
    // This ensures the sidebar can detect the selection in real-time
    localStorage.setItem("selectedProvider", provider);
    // Dispatch custom event to notify sidebar that provider was selected
    // This enables real-time updates to the sidebar navigation state
    window.dispatchEvent(new CustomEvent('providerSelected'));
  };

  /**
   * Handle Continue button click
   * MODIFICATION: Added Continue button to replace auto-navigation.
   * Users must now explicitly click Continue to proceed to Step 2.
   */
  const handleContinue = () => {
    if (selectedProvider) {
      // Provider is already saved to localStorage, just navigate
      router.push("/dashboard/upload/match-details");
    }
  };

  return (
    <div className="flex-1 w-full p-10 h-full flex flex-col">
      <div className="space-y-6 flex-1">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">
            Choose Provider
          </h2>
          <p className="text-sm text-muted-foreground">
            Choose from the following Electronic Line Calling (ELC) Providers
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              id={provider.id}
              name={provider.name}
              description={provider.description}
              logo={provider.logo}
              onClick={handleProviderSelect}
              // MODIFICATION: Added isSelected prop to show visual feedback
              // when a provider is selected (highlighted with black ring and "Selected" badge)
              isSelected={selectedProvider === provider.id}
            />
          ))}
        </div>
      </div>
      
      {/* MODIFICATION: Added Continue button section */}
      {/* This button is disabled until a provider is selected and turns black when clickable */}
      <div className="mt-8 flex justify-end">
        <Button
          onClick={handleContinue}
          disabled={!selectedProvider}
          className={`px-8 py-2 ${
            selectedProvider 
              ? 'bg-black hover:bg-gray-800 text-white' 
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
