export interface Provider {
  id: string;
  name: string;
  description?: string;
  logo: string;
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
  },
  // Add more providers here easily
];
