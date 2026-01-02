"use client";

import { Card, CardContent } from "@/components/ui/card";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * UploadSideBar Component
 * 
 * Displays the three-step checklist shown on the upload flow sidebar.
 * 
 * MODIFICATIONS MADE IN THIS SESSION:
 * 1. Added state management for selected provider and form completion
 * 2. Added real-time communication with choose-provider page via custom events
 * 3. Added form completion validation to disable Step 3 when form is incomplete
 * 4. Enhanced navigation logic to prevent skipping steps
 * 5. Added visual feedback for disabled states
 */
export default function UploadSideBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [isFormComplete, setIsFormComplete] = useState<boolean>(false);

  /**
   * Check for selected provider in localStorage
   * MODIFICATION: Added to track provider selection state for navigation control
   */
  useEffect(() => {
    const provider = localStorage.getItem("selectedProvider");
    setSelectedProvider(provider || null);
  }, [pathname]); // Re-check when pathname changes

  // Initial check on mount
  useEffect(() => {
    const provider = localStorage.getItem("selectedProvider");
    setSelectedProvider(provider || null);
  }, []);

  /**
   * Function to check if form data is complete
   * MODIFICATION: Added to validate form completion for Step 3 navigation
   * Checks required fields: playerName, opponentName, eventName, date
   */
  const checkFormCompletion = () => {
    const storedData = localStorage.getItem('uploadFormData');
    if (!storedData) {
      setIsFormComplete(false);
      return;
    }
    
    try {
      const formData = JSON.parse(storedData);
      const requiredFields = [
        formData.playerName?.trim(),
        formData.opponentName?.trim(),
        formData.eventName?.trim(),
        formData.date?.trim()
      ];
      
      const complete = requiredFields.every(field => field && field.length > 0);
      setIsFormComplete(complete);
    } catch (error) {
      setIsFormComplete(false);
    }
  };

  // Check form completion on mount and pathname changes
  useEffect(() => {
    checkFormCompletion();
  }, [pathname]);

  /**
   * Listen for provider selection and form data change events
   * MODIFICATION: Added real-time communication system between components
   * This enables the sidebar to update immediately when:
   * 1. A provider is selected on the choose-provider page
   * 2. Form data is submitted on the match-details page
   */
  useEffect(() => {
    const handleProviderSelected = () => {
      const provider = localStorage.getItem("selectedProvider");
      setSelectedProvider(provider || null);
    };

    const handleFormDataChanged = () => {
      checkFormCompletion();
    };

    // Listen for custom events
    window.addEventListener('providerSelected', handleProviderSelected);
    window.addEventListener('formDataChanged', handleFormDataChanged);
    
    return () => {
      window.removeEventListener('providerSelected', handleProviderSelected);
      window.removeEventListener('formDataChanged', handleFormDataChanged);
    };
  }, []);

  const steps = [
    {
      index: 1,
      title: "Step 1",
      subtitle: "Choose Provider",
      route: "/dashboard/upload/choose-provider"
    },
    {
      index: 2,
      title: "Step 2",
      subtitle: "Match Details",
      route: "/dashboard/upload/match-details"
    },
    {
      index: 3,
      title: "Step 3",
      subtitle: "Confirm Details",
      route: "/dashboard/upload/confirm-details"
    }
  ];

  /**
   * Handle step navigation clicks
   * MODIFICATION: Enhanced navigation logic to prevent skipping steps
   * 
   * Navigation Rules:
   * - Step 2: Only accessible if provider is selected (when on Step 1)
   * - Step 3: Only accessible if:
   *   * Provider is selected (when on Step 1)
   *   * Form is complete (when on Step 2)
   */
  const handleStepClick = (route: string, stepIndex: number) => {
    // Only allow navigation to step 2 if provider is selected, or if already on step 1
    if (stepIndex === 2 && !selectedProvider && pathname === "/dashboard/upload/choose-provider") {
      return; // Don't navigate
    }
    
    // Only allow navigation to step 3 if:
    // - On step 1: provider must be selected
    // - On step 2: form must be complete
    if (stepIndex === 3) {
      if (pathname === "/dashboard/upload/choose-provider" && !selectedProvider) {
        return; // Don't navigate from step 1 without provider
      } else if (pathname === "/dashboard/upload/match-details" && !isFormComplete) {
        return; // Don't navigate from step 2 without complete form
      }
    }
    
    router.push(route);
  };

  return (
    <Card 
      className="w-[280px] h-[408px] bg-[#FAFAFA] shadow-[0px_4px_8px_rgba(0,0,0,0.1)] rounded-[20px] flex flex-col items-start p-6"
    >
      <CardContent className="p-0 h-[120px] flex flex-col w-full">
        {steps.map((step, index) => {
          let isDisabled = false;
          
          // MODIFICATION: Enhanced disabled logic for step navigation control
          // Disable step 2 if no provider selected and on step 1
          if (step.index === 2 && !selectedProvider && pathname === "/dashboard/upload/choose-provider") {
            isDisabled = true;
          }
          
          // Disable step 3 if on step 1 (no provider selected) or if form not complete and on step 2
          if (step.index === 3) {
            if (pathname === "/dashboard/upload/choose-provider" && !selectedProvider) {
              isDisabled = true;
            } else if (pathname === "/dashboard/upload/match-details" && !isFormComplete) {
              isDisabled = true;
            }
          }
          
          return (
            <div key={step.index}>
              <StepItem 
                index={step.index} 
                title={step.title} 
                subtitle={step.subtitle}
                isActive={pathname === step.route}
                isDisabled={isDisabled}
                onClick={() => handleStepClick(step.route, step.index)}
              />
              {index < steps.length - 1}
            </div>
          );
        })}
        <div className="flex-1" />
      </CardContent>
    </Card>
  );
}

/**
 * StepItem Component
 * 
 * Individual step item in the upload sidebar.
 * 
 * MODIFICATIONS MADE IN THIS SESSION:
 * 1. Added isDisabled prop to show disabled state
 * 2. Enhanced visual feedback for disabled states (grayed out, no cursor pointer)
 * 3. Added conditional styling based on disabled state
 */
function StepItem({ 
  index, 
  title, 
  subtitle, 
  isActive = false, 
  isDisabled = false,
  onClick 
}: { 
  index: number; 
  title: string; 
  subtitle: string; 
  isActive?: boolean;
  isDisabled?: boolean; // MODIFICATION: Added to show disabled state
  onClick?: () => void;
}) {
  return (
    <div 
      className={`px-4 sm:px-6 py-5 transition-colors h-[120px] flex items-center rounded-2xl ${
        // MODIFICATION: Enhanced conditional styling for disabled states
        isDisabled 
          ? 'cursor-not-allowed opacity-50' // Disabled: no cursor, grayed out
          : 'cursor-pointer hover:bg-gray-50 hover:border-2 focus:border-2 focus:border-[hsl(0,0%,90%)]' // Enabled: hover effects
      } ${
        isActive ? 'bg-gray-100 border-2 border-[hsl(0,0%,90%)]' : ''
      }`}
      onClick={isDisabled ? undefined : onClick} // MODIFICATION: Prevent click when disabled
    >
      <div className="flex items-start gap-3">
        <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold mt-0.5 ${
          // MODIFICATION: Enhanced step number styling for different states
          isActive ? 'bg-black text-white' : isDisabled ? 'bg-gray-200 text-gray-400' : 'bg-gray-300 text-gray-600'
        }`}>
          {index}
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-base font-medium leading-none mb-1 ${
            // MODIFICATION: Enhanced text styling for different states
            isActive ? 'text-black' : isDisabled ? 'text-gray-400' : 'text-gray-700'
          }`}>{title}</div>
          <div className={`text-sm ${isDisabled ? 'text-gray-400' : 'text-muted-foreground'}`}>{subtitle}</div>
        </div>
      </div>
    </div>
  );
}