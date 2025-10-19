"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { useRouter } from "next/navigation";

export default function ChooseProviderClient() {
  const router = useRouter();

  const handleProviderSelect = (provider: string) => {
    // Store the selected provider and navigate to match details
    localStorage.setItem("selectedProvider", provider);
    router.push("/dashboard/upload/match-details");
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card
        className="cursor-pointer hover:shadow-lg transition-shadow"
        onClick={() => handleProviderSelect("atp-tour")}
      >
        <CardContent className="p-6">
          <div className="flex items-center justify-center h-32">
            <div className="text-2xl font-bold text-black">ATP TOUR</div>
          </div>
        </CardContent>
      </Card>

      <Card
        className="cursor-pointer hover:shadow-lg transition-shadow"
        onClick={() => handleProviderSelect("swing-vision")}
      >
        <CardContent className="p-6">
          <div className="flex items-center justify-center h-32">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center">
                <div className="w-4 h-4 bg-white rounded-full"></div>
              </div>
              <div>
                <div className="text-lg font-semibold text-gray-700">SWING</div>
                <div className="text-sm text-gray-500">VISION</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
