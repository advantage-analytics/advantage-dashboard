"use client";

import { Card, CardContent } from "@/components/ui/card";

// Displays the three-step checklist shown on the upload flow sidebar.
export function UploadSteps() {
  return (
    <Card className="w-full h-full rounded-2xl overflow-hidden">
      <CardContent className="p-0 h-full flex flex-col">
        <StepItem index={1} title="Select Match" subtitle="Select a recent match" />
        <Divider />
        <StepItem index={2} title="Upload Match" subtitle="Upload your match data" />
        <Divider />
        <StepItem index={3} title="Confirm Match" subtitle="Confirm match information" />
        <div className="flex-1" />
      </CardContent>
    </Card>
  );
}

function StepItem({ index, title, subtitle }: { index: number; title: string; subtitle: string }) {
  return (
    <div className="px-4 sm:px-6 py-5">
      <div className="flex items-start gap-3">
        <div className="h-6 w-6 rounded-full bg-black text-white flex items-center justify-center text-xs font-semibold mt-0.5">
          {index}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-base font-medium leading-none mb-1">{title}</div>
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


