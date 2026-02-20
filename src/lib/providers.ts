export interface Provider {
  id: string;
  name: string;
  description?: string;
  logo: string;
  available?: boolean;
}

export const providers: Provider[] = [
  {
    id: "swing-vision",
    name: "SWING VISION",
    description: "AI-powered tennis analysis",
    logo: "/providers/swingvision.png",
  },
  {
    id: "atp-tour",
    name: "ATP TOUR",
    description: "Official ATP Tour data provider",
    logo: "/providers/atp.png",
    available: false,
  },
  // Add more providers here easily
];
