"use client";

import { motion } from "framer-motion";
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

export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname();
  const animationKey = useMemo(() => getAnimationKey(pathname), [pathname]);

  return (
    <motion.div
      key={animationKey}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.3,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
    >
      {children}
    </motion.div>
  );
}
