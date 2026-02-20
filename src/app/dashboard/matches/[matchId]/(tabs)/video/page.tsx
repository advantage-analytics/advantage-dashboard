import { Video } from "lucide-react";

export default function VideoPage(): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-8 bg-white rounded-2xl min-h-[400px]">
      <div className="w-12 h-12 rounded-full bg-[#F5F5F5] flex items-center justify-center mb-4">
        <Video className="w-6 h-6 text-[#888888]" />
      </div>
      <h2 className="text-base font-semibold text-[#0D0D0D] mb-2">
        Video Coming Soon
      </h2>
      <p className="text-sm text-[#888888] text-center max-w-sm">
        Match footage and highlight clips will be available here.
      </p>
    </div>
  );
}
