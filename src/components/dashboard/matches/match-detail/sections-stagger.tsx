"use client";

import { Children } from "react";
import { motion, useReducedMotion } from "framer-motion";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;

interface SectionsStaggerProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Staggered fade-in + translateY wrapper used by the match detail page to
 * mirror the home page's entrance motion. Each direct child animates in with
 * a per-index delay on first mount.
 *
 * `skipAnimation` only feeds `initial`, which React consults at mount only. A
 * previous version also OR'd in a `hasAnimated` ref, but that ref is always
 * false at mount (its effect runs afterwards), so it never changed what
 * rendered. Reading a ref during render is unsafe under concurrent rendering
 * (react-hooks/refs).
 */
export function SectionsStagger({ children, className }: SectionsStaggerProps) {
  const shouldReduceMotion = useReducedMotion();
  const skipAnimation = shouldReduceMotion;

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
