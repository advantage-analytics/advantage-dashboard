"use client";

import { usePathname } from "next/navigation";
import { useMemo } from "react";

interface PageTransitionProps {
  children: React.ReactNode;
}

/**
 * Extracts the base path for animation keying.
 * Match detail tabs (/dashboard/matches/[id]/overall, /visuals, /video)
 * share the same base path so tab switching doesn't trigger animations.
 */
function getAnimationKey(pathname: string): string {
  // Match detail pages: /dashboard/matches/[matchId]/*
  const matchDetailPattern = /^\/dashboard\/matches\/([^/]+)/;
  const match = pathname.match(matchDetailPattern);

  if (match) {
    // Use match ID as key - all tabs share same animation key
    return `/dashboard/matches/${match[1]}`;
  }

  // Settings pages: /dashboard/settings/* - handled by settings layout
  if (pathname.startsWith("/dashboard/settings")) {
    return "/dashboard/settings";
  }

  return pathname;
}

/**
 * Page transition using CSS @keyframes instead of Framer Motion.
 * CSS animations are applied by the browser after paint, so the server-rendered
 * HTML is present in the DOM at full opacity for tools that read the initial state.
 */
export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname();
  const animationKey = useMemo(() => getAnimationKey(pathname), [pathname]);

  return (
    <div
      key={animationKey}
      className="animate-page-enter"
    >
      {children}
    </div>
  );
}
