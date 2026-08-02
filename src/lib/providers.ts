import type { ProviderId } from "@/lib/services/upload";

export interface Provider {
  /**
   * Type-linked to the strategy registry's union. This list and the strategy
   * Map in services/upload/providers must stay in step — a display entry with
   * no strategy renders a row that silently refuses to select.
   */
  id: ProviderId;
  name: string;
  description?: string;
  logo: string;
  available?: boolean;
  pillBg?: string;
  pillText?: string;
}

export const providers: Provider[] = [
  {
    id: "swing-vision",
    name: "SwingVision",
    description: "AI-powered tennis analysis",
    logo: "/providers/swingvision.png",
    pillBg: "#2D8B4E",
    pillText: "#FFFFFF",
  },
  {
    // Internally `splitstep`. The vendor is never named in the UI — this is
    // presented as our own analysis engine.
    id: "splitstep",
    name: "Advantage Intelligence",
    description: "Upload match video for AI analysis",
    // TODO: placeholder artwork. Swap for a dedicated
    // /providers/advantage.png once the official asset exists.
    logo: "/logos/logo.svg",
    pillBg: "#3B82F6",
    pillText: "#FFFFFF",
  },
  {
    id: "atp-tour",
    name: "ATP TOUR",
    description: "Official ATP Tour data provider",
    logo: "/providers/atp.png",
    available: false,
    pillBg: "#002B5C",
    pillText: "#5DADE2",
  },
  // Add more providers here easily
];
