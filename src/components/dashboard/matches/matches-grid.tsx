"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { DisplayMatch } from "@/lib/data/matches-list-types";
import type { MatchView } from "./view-toggle";
import { MatchCardGallery } from "./match-card-gallery";
import { MatchCardList } from "./match-card-list";

interface MatchesGridProps {
  matches: DisplayMatch[];
  view: MatchView;
}

const GRID_CONFIG = {
  gallery: {
    containerClass: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4",
    itemY: 12,
    itemDuration: 0.25,
    itemDelayStep: 0.04,
  },
  list: {
    containerClass: "space-y-6",
    itemY: 8,
    itemDuration: 0.2,
    itemDelayStep: 0.03,
  },
} as const;

export function MatchesGrid({ matches, view }: MatchesGridProps): React.JSX.Element {
  const config = GRID_CONFIG[view];
  const CardComponent = view === "gallery" ? MatchCardGallery : MatchCardList;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={view}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className={config.containerClass}
      >
        {matches.map((match, i) => (
          <motion.div
            key={match.id}
            initial={{ opacity: 0, y: config.itemY }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: config.itemDuration,
              delay: i * config.itemDelayStep,
            }}
          >
            <CardComponent match={match} />
          </motion.div>
        ))}
      </motion.div>
    </AnimatePresence>
  );
}
