import type { ReactNode } from "react";

// A pass-through layout that carries the tab title.
export const metadata = { title: "Plan" };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
