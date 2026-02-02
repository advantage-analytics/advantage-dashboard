import { ReactNode } from "react";
import { SettingsNavigation } from "@/components/dashboard/settings/settings-navigation";

interface SettingsLayoutProps {
  children: ReactNode;
}

export default function SettingsLayout({ children }: SettingsLayoutProps) {
  return (
    <div className="flex-1 w-full min-h-screen bg-white">
      {/* pt-24 (96px) clears the absolutely positioned header (py-6 + h-10 ≈ 64px) with breathing room */}
      <div className="px-8 pt-24 pb-12">
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
          <div className="flex-1 min-w-0">{children}</div>
        </div>
      </div>
    </div>
  );
}
