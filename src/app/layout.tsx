import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter, Roboto_Mono } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const mono = Roboto_Mono({
  subsets: ["latin"],
  // Not `--font-mono`: that name is also a Tailwind theme key, and globals.css
  // was resolving it to Inter — so Roboto Mono was downloaded for every visitor
  // and never rendered. The theme key now points here instead.
  variable: "--font-roboto-mono",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: "Advantage Analytics",
  description:
    "The world's first centralized hub for tennis analytics. Built for the modern athlete.",
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    title: "Advantage Analytics",
    description:
      "The world's first centralized hub for tennis analytics. Built for the modern athlete.",
    siteName: "Advantage",
    images: [
      {
        url: "/opengraph-image.jpg",
        width: 1200,
        height: 630,
        alt: "Advantage Analytics",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Advantage Analytics",
    description:
      "The world's first centralized hub for tennis analytics. Built for the modern athlete.",
    images: ["/opengraph-image.jpg"],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
<body className="min-h-dvh bg-background text-foreground">{children}</body>
    </html>
  );
}
