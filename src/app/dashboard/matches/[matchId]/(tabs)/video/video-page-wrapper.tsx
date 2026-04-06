"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

const EASE_CURVE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

export function VideoPageWrapper({ children }: { children: ReactNode }) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE_CURVE }}
    >
      {children}
    </motion.div>
  );
}
