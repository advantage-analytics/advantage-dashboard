export default function VideoLoading() {
  return (
    <div className="px-8 pb-10">
      <div className="h-10 w-full bg-[#F0F0F0] rounded-[14px] animate-pulse mb-4" />
      <div className="flex gap-4 items-start">
        <div className="flex-1 min-w-0 h-[400px] bg-[#F0F0F0] rounded-[14px] animate-pulse" />
        <div className="shrink-0 w-[360px] h-[400px] bg-[#F0F0F0] rounded-[14px] animate-pulse" />
      </div>
    </div>
  );
}
