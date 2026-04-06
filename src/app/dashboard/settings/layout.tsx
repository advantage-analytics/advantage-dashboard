"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { SettingsNavigation } from "@/components/dashboard/settings/settings-navigation";

interface SettingsLayoutProps {
  children: ReactNode;
}

export default function SettingsLayout({ children }: SettingsLayoutProps) {
  const pathname = usePathname();

  return (
    <div className="flex-1 w-full min-h-screen bg-white">
      <div className="pl-12 pr-8 py-10">
        {/* Page Header */}
        <div className="mb-10">
          <h1 className="text-xl font-medium text-[#0D0D0D] tracking-tight">
            Settings
          </h1>
          <p className="text-xs text-[#999] mt-1.5">
            Manage your account preferences and subscription
          </p>
        </div>

        {/* Content */}
        <div className="flex flex-col md:flex-row gap-10 max-w-4xl">
          <SettingsNavigation />
          <div className="flex-1 min-w-0">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={pathname}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
