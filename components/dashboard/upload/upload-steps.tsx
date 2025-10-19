"use client";

import { Card, CardContent } from "@/components/ui/card";
import { useRouter, usePathname } from "next/navigation";

// Displays the three-step checklist shown on the upload flow sidebar.
export function UploadSteps() {
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
    <Card className="w-full h-full rounded-2xl overflow-hidden">
      <CardContent className="p-0 h-full flex flex-col">
        {steps.map((step, index) => (
          <div key={step.index}>
            <StepItem 
              index={step.index} 
              title={step.title} 
              subtitle={step.subtitle}
              isActive={pathname === step.route}
              onClick={() => handleStepClick(step.route)}
            />
            {index < steps.length - 1 && <Divider />}
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
      className={`px-4 sm:px-6 py-5 cursor-pointer hover:bg-gray-50 transition-colors ${
        isActive ? 'bg-gray-100' : ''
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

function Divider() {
  return <div className="h-px w-full bg-gray-200" />;
}

export default UploadSteps;


