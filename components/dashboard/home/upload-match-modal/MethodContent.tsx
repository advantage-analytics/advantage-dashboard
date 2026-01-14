"use client";

/**
 * MethodContent - Step 1 content
 * Two cards for selecting analysis method
 */

import { Card, CardContent } from "@/components/ui/card";

export interface MethodContentProps {
  onMethodSelect: () => void;
}

export function MethodContent({ onMethodSelect }: MethodContentProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card
        className="cursor-pointer hover:shadow-lg transition-shadow"
        onClick={onMethodSelect}
      >
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
              <img
                src="/tennis-court.jpg"
                alt="Tennis Court"
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.parentElement!.innerHTML = '<span class="text-gray-400">Tennis Court Image</span>';
                }}
              />
            </div>
            <div>
              <h3 className="font-semibold mb-2">Electronic Line Calling</h3>
              <p className="text-sm text-muted-foreground">
                Choose from a variety of protocols such as SwingVision, BaselineVision, and many more.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="opacity-50 cursor-not-allowed">
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center">
              <span className="text-gray-400 font-semibold">ADVANTAGE</span>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Coming Soon</h3>
              <p className="text-sm text-muted-foreground">
                Choose to label with Advantage Intelligence or traditional labeling techniques.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
