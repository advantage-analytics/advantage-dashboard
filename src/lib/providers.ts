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
  /**
   * Cap on rendered logo height, in px. Omit to fill the shared logo box.
   *
   * The provider logos are not comparable assets. The raster marks are square-ish
   * files with whitespace baked into the image, so they land well inside the box
   * on their own. A wordmark is edge-to-edge ink and pins to the box width,
   * which makes it read as roughly twice the size of its neighbours at the same
   * nominal dimensions. Capping height is what actually equalises optical
   * weight between the two kinds of asset.
   */
  logoMaxHeight?: number;
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
    // 320×57 wordmark. Uncapped it renders 180×32 — wider than either raster
    // mark and with none of their internal padding.
    logoMaxHeight: 22,
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
