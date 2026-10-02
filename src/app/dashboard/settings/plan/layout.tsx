import type { ReactNode } from "react";

// The page is a Client Component, which cannot export `metadata`; this
// pass-through layout carries the tab title instead.
export const metadata = { title: "Plan" };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
