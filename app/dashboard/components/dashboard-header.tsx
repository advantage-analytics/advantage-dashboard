import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";

interface DashboardHeaderProps {
  title?: string;
  subtitle?: string;
  showUploadButton?: boolean;
}

export function DashboardHeader({ 
  title = "Home Dashboard",
  subtitle = "Spring 2025 Season, Week 8",
  showUploadButton = true
}: DashboardHeaderProps) {
  return (
    <header className="border-b bg-background px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-muted-foreground">{subtitle}</p>
        </div>
        {showUploadButton && (
          <Button>
            <Upload className="mr-2 h-4 w-4" />
            Upload
          </Button>
        )}
      </div>
    </header>
  );
}
