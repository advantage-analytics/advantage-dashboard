"use client";

import { useRouter } from "next/navigation";
import { ProviderCard } from "@/components/dashboard/upload/provider-card";
import { providers } from "@/lib/providers";

export default function ChooseProviderClient() {
  const router = useRouter();

  const handleProviderSelect = (provider: string) => {
    localStorage.setItem("selectedProvider", provider);
    router.push("/dashboard/upload/match-details");
  };

  return (
    <div className="flex-1 w-full p-6 h-full">
      <div className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">
            Choose Provider
          </h2>
          <p className="text-sm text-muted-foreground">
            Choose from the following Electronic Line Calling (ELC) Providers
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              id={provider.id}
              name={provider.name}
              description={provider.description}
              logo={provider.logo}
              onClick={handleProviderSelect}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
