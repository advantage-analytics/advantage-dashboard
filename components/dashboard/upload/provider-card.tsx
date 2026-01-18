"use client";

import { Card, CardContent } from "@/components/ui/card";

/**
 * ProviderCardProps Interface
 * 
 * MODIFICATIONS MADE IN THIS SESSION:
 * - Added isSelected prop to track selection state
 */
interface ProviderCardProps {
  id: string;
  name: string;
  description?: string;
  logo?: React.ReactNode;
  onClick: (providerId: string) => void;
  isSelected?: boolean; // MODIFICATION: Added to show selection state
  available?: boolean; // MODIFICATION: Added to show availability state
}

/**
 * ProviderCard Component
 * 
 * Displays a provider card with selection highlighting.
 * 
 * MODIFICATIONS MADE IN THIS SESSION:
 * 1. Added isSelected prop to show visual feedback when provider is selected
 * 2. Added black ring border and "Selected" badge when isSelected is true
 * 3. Enhanced hover effects and transitions for better UX
 */
export function ProviderCard({ id, name, description, logo, onClick, isSelected = false, available = true }: ProviderCardProps) {
  return (
    <Card
      className={`transition-all duration-200 relative group overflow-visible ${
        available ? 'cursor-pointer' : 'cursor-not-allowed'
      } ${
        // MODIFICATION: Added conditional styling based on selection and availability
        isSelected
          ? 'ring-2 ring-black shadow-lg bg-gray-50' // Selected: black ring, shadow, light background
          : available ? 'hover:shadow-lg hover:bg-gray-50' // Not selected and available: hover effects
          : 'border-gray-300' // Not available: subtle border
      }`}
      onClick={() => {
        if (available) {
          onClick(id);
        }
      }}
    >
      <CardContent className="p-6 relative">
        <div className="flex items-center justify-center h-32">
          {logo || (
            <div className="text-2xl font-bold text-black">{name}</div>
          )}
        </div>
        {description && (
          <div className="text-center mt-2">
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        )}
        {/* MODIFICATION: Added "Selected" badge for selected available providers */}
        {isSelected && available && (
          <div className="text-center mt-2">
            <span className="text-xs font-medium text-black bg-gray-200 px-2 py-1 rounded-full">
              Selected
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}