"use client";

import { Children, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;

interface SectionsStaggerProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Staggered fade-in + translateY wrapper used by the match detail page to
 * mirror the home page's entrance motion. Each direct child animates in with
 * a per-index delay on first mount; subsequent renders skip the animation
 * via the hasAnimated ref (same pattern as home-content.tsx).
 */
export function SectionsStagger({ children, className }: SectionsStaggerProps) {
  const shouldReduceMotion = useReducedMotion();
  const hasAnimated = useRef(false);
  const skipAnimation = shouldReduceMotion || hasAnimated.current;
  hasAnimated.current = true;

  return (
    <div className={className}>
      {Children.map(children, (child, index) => (
        <motion.div
          key={index}
          initial={skipAnimation ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.3,
            ease: EASE_CURVE,
            delay: index * 0.06,
          }}
        >
          {child}
        </motion.div>
      ))}
    </div>
  );
}
