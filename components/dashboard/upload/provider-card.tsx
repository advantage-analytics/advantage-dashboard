"use client";

import { Card, CardContent } from "@/components/ui/card";

interface ProviderCardProps {
  id: string;
  name: string;
  description?: string;
  logo?: React.ReactNode;
  onClick: (providerId: string) => void;
}

export function ProviderCard({ id, name, description, logo, onClick }: ProviderCardProps) {
  return (
    <Card
      className="cursor-pointer hover:shadow-lg transition-shadow"
      onClick={() => onClick(id)}
    >
      <CardContent className="p-6">
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
      </CardContent>
    </Card>
  );
}