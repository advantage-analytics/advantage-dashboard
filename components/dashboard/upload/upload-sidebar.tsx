"use client";

import { Card, CardContent } from "@/components/ui/card";
import { useRouter, usePathname } from "next/navigation";

// Displays the three-step checklist shown on the upload flow sidebar.
export default function UploadSideBar() {
  const router = useRouter();
  const pathname = usePathname();

  const steps = [
    {
      index: 1,
      title: "Step 1",
      subtitle: "Choose Provider",
      route: "/dashboard/upload/choose-provider"
    },
    {
      index: 2,
      title: "Step 2",
      subtitle: "Match Details",
      route: "/dashboard/upload/match-details"
    },
    {
      index: 3,
      title: "Step 3",
      subtitle: "Confirm Details",
      route: "/dashboard/upload/confirm-details"
    }
  ];

  const handleStepClick = (route: string) => {
    router.push(route);
  };

  return (
    <Card 
      className="w-[280px] h-[408px] bg-[#FAFAFA] shadow-[0px_4px_8px_rgba(0,0,0,0.1)] rounded-[20px] flex flex-col items-start p-6"
    >
      <CardContent className="p-0 h-[120px] flex flex-col w-full">
        {steps.map((step, index) => (
          <div key={step.index}>
            <StepItem 
              index={step.index} 
              title={step.title} 
              subtitle={step.subtitle}
              isActive={pathname === step.route}
              onClick={() => handleStepClick(step.route)}
            />
            {index < steps.length - 1}
          </div>
        ))}
        <div className="flex-1" />
      </CardContent>
    </Card>
  );
}

function StepItem({ 
  index, 
  title, 
  subtitle, 
  isActive = false, 
  onClick 
}: { 
  index: number; 
  title: string; 
  subtitle: string; 
  isActive?: boolean;
  onClick?: () => void;
}) {
  return (
    <div 
      className={`px-4 sm:px-6 py-5 cursor-pointer hover:bg-gray-50 transition-colors h-[120px] flex items-center rounded-2xl hover:border-2 focus:border-2 focus:border-[hsl(0,0%,90%)] ${
        isActive ? 'bg-gray-100 border-2 border-[hsl(0,0%,90%)]' : ''
      }`}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold mt-0.5 ${
          isActive ? 'bg-black text-white' : 'bg-gray-300 text-gray-600'
        }`}>
          {index}
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-base font-medium leading-none mb-1 ${
            isActive ? 'text-black' : 'text-gray-700'
          }`}>{title}</div>
          <div className="text-sm text-muted-foreground">{subtitle}</div>
        </div>
      </div>
    </div>
  );
}