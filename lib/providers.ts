export interface Provider {
  id: string;
  name: string;
  description?: string;
  logo: React.ReactNode;
}

import type { ReactNode } from "react";

export const providers: Provider[] = [
  {
    id: "atp-tour",
    name: "ATP TOUR",
    description: "Official ATP Tour data provider",
    logo: "ATP TOUR" as unknown as ReactNode,
  },
  {
    id: "swing-vision",
    name: "SWING VISION",
    description: "AI-powered tennis analysis",
    logo: "SWING VISION" as unknown as ReactNode,
  },
  // Add more providers here easily
];
