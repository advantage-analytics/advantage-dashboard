// app/layout.tsx
import "@/styles/globals.css";

export const metadata = {
  title: "Advantage",
  description: "Elevate Your Game.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}