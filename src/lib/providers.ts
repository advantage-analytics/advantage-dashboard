export interface Provider {
  id: string;
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
