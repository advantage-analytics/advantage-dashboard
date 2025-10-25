import type { Metadata } from "next";
import { Open_Sans, Inter, Roboto} from "next/font/google";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ['300', '700'],
});

export const metadata: Metadata = {
  title: "Advantage Dashboard",
  description: "Copyright Advantage Analytics LLC",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
