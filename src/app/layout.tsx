import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, Roboto_Mono } from "next/font/google";
import { emailOrigin } from "@/lib/site-url";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  // No `weight` list: Inter is a variable font, and listing weights makes
  // next/font emit (and preload) one file per weight instead of one file.
  display: "swap",
});

const mono = Roboto_Mono({
  subsets: ["latin"],
  // Not `--font-mono`: that name is also a Tailwind theme key, and globals.css
  // was resolving it to Inter — so Roboto Mono was downloaded for every visitor
  // and never rendered. The theme key now points here instead.
  variable: "--font-roboto-mono",
  // Variable font — one file, as for Inter. Not preloaded: it sets only
  // numerals and code, never the first paint's text, so it should not compete
  // with the page's LCP for bandwidth.
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  // The production origin on every Vercel deployment, so a preview's canonical
  // and OG URLs name production rather than itself — preview serves the same
  // pages, and Search Console was reporting them as duplicates with no
  // canonical. Locally it is the dev origin. `robots.ts` makes the same call.
  metadataBase: new URL(emailOrigin()),
  // `./` resolves to the current path, so each page declares itself (at the
  // production origin above) as its own canonical, dropping query strings.
  alternates: { canonical: "./" },
  // Pages name themselves ("Roster"); the template adds the brand once, so a
  // tab reads "Roster · Advantage" and the landing page keeps the full name.
  title: { default: "Advantage Analytics", template: "%s · Advantage" },
  description:
    "The world's first centralized hub for tennis analytics. Built for the modern athlete.",
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The page draws to the screen's edges; fixed chrome that sits against an
  // edge (the film room, full-screen visuals) pads itself with
  // `env(safe-area-inset-*)` so nothing hides under the home indicator.
  viewportFit: "cover",
  // Safari's toolbar takes the page colour instead of flashing white.
  themeColor: "#FAFAFA",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-dvh bg-[var(--surface-page)] text-[var(--ink-900)]">
        {children}
      </body>
    </html>
  );
}
