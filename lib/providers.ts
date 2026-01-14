export interface Provider {
  id: string;
  name: string;
  description?: string;
  logo: string;
}

export const providers: Provider[] = [
  {
    id: "atp-tour",
    name: "ATP TOUR",
    description: "Official ATP Tour data provider",
    logo: "/providers/atp.png",
  },
  {
    id: "swing-vision",
    name: "SWING VISION",
    description: "AI-powered tennis analysis",
    logo: "/providers/swingvision.png",
  },
  // Add more providers here easily
];
