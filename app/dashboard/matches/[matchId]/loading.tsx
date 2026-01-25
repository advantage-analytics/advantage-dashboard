export default function Loading() {
  return (
    <div className="flex-1 w-full bg-white">
      <div className="relative z-10 px-8 py-12 pt-[136px]">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header Skeleton */}
          <div className="animate-pulse space-y-4">
            <div className="flex flex-row justify-between items-center gap-2">
              <div className="h-8 w-48 bg-gray-200 rounded"></div>
              <div className="h-6 w-32 bg-gray-200 rounded"></div>
            </div>
            <div className="flex flex-row gap-4 items-center">
              <div className="h-5 w-24 bg-gray-200 rounded"></div>
              <div className="h-5 w-32 bg-gray-200 rounded"></div>
            </div>
          </div>

          {/* Match Details Skeleton */}
          <div className="animate-pulse space-y-2">
            <div className="h-4 w-40 bg-gray-200 rounded"></div>
            <div className="h-4 w-32 bg-gray-200 rounded"></div>
          </div>

          {/* Score Display Skeleton */}
          <div className="animate-pulse bg-white border-[#D9D9D9] border-2 p-6 rounded-2xl space-y-6">
            <div className="h-6 w-24 bg-gray-200 rounded"></div>
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div className="flex gap-4">
                  <div className="h-12 w-12 bg-gray-200 rounded"></div>
                  <div className="space-y-2">
                    <div className="h-4 w-32 bg-gray-200 rounded"></div>
                    <div className="h-3 w-48 bg-gray-200 rounded"></div>
                  </div>
                </div>
                <div className="flex gap-6">
                  <div className="h-8 w-8 bg-gray-200 rounded"></div>
                  <div className="h-8 w-8 bg-gray-200 rounded"></div>
                </div>
              </div>
              <div className="h-px bg-gray-200"></div>
              <div className="flex justify-between items-center">
                <div className="flex gap-4">
                  <div className="h-12 w-12 bg-gray-200 rounded"></div>
                  <div className="space-y-2">
                    <div className="h-4 w-32 bg-gray-200 rounded"></div>
                    <div className="h-3 w-48 bg-gray-200 rounded"></div>
                  </div>
                </div>
                <div className="flex gap-6">
                  <div className="h-8 w-8 bg-gray-200 rounded"></div>
                  <div className="h-8 w-8 bg-gray-200 rounded"></div>
                </div>
              </div>
            </div>
          </div>

          {/* Statistics Skeleton */}
          <div className="animate-pulse bg-white border-[#D9D9D9] border-2 p-6 rounded-2xl">
            <div className="h-6 w-24 bg-gray-200 rounded mb-6"></div>
            <div className="grid grid-cols-2 gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex flex-col items-center p-4 bg-gray-100 rounded-lg h-24"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
