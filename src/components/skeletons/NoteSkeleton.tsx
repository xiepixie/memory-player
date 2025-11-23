export const NoteSkeleton = () => {
  return (
    <div className="h-full w-full bg-base-100 flex flex-col relative overflow-hidden">
      {/* 1. Header Skeleton */}
      <div className="h-16 border-b border-base-200 flex items-center justify-between px-4 bg-base-100/50 z-10">
        {/* Left: Back Button & Title */}
        <div className="flex items-center gap-3 w-1/3">
          <div className="w-8 h-8 rounded-full bg-base-200 animate-pulse" /> {/* Back Btn */}
          <div className="flex flex-col gap-1.5">
            <div className="w-32 h-4 rounded-md bg-base-200 animate-pulse" /> {/* Title */}
            <div className="w-16 h-2 rounded-md bg-base-200/60 animate-pulse" /> {/* Meta */}
          </div>
        </div>

        {/* Center: Mode Toggle Pills */}
        <div className="flex justify-center w-1/3">
            <div className="h-8 w-48 rounded-full bg-base-200 animate-pulse" />
        </div>

        {/* Right: Action Icons */}
        <div className="flex justify-end gap-2 w-1/3">
             <div className="w-8 h-8 rounded-full bg-base-200/50 animate-pulse" />
             <div className="w-8 h-8 rounded-full bg-base-200/50 animate-pulse" />
        </div>
      </div>

      {/* 2. Editor Content Skeleton - Three Column Layout Simulation */}
      <div className="flex-1 flex relative">
          
        {/* Center Column (Editor) */}
        <div className="flex-1 flex justify-center overflow-hidden">
            <div className="w-full max-w-3xl p-8 space-y-8 animate-pulse">
                {/* H1 Title */}
                <div className="w-3/4 h-10 rounded-lg bg-base-200 mb-8" />
                
                {/* Paragraph 1 */}
                <div className="space-y-3">
                    <div className="w-full h-4 rounded bg-base-200/60" />
                    <div className="w-11/12 h-4 rounded bg-base-200/60" />
                    <div className="w-full h-4 rounded bg-base-200/60" />
                </div>

                {/* H2 Heading */}
                <div className="w-1/3 h-8 rounded-lg bg-base-200 mt-8" />

                {/* Paragraph 2 */}
                <div className="space-y-3">
                    <div className="w-full h-4 rounded bg-base-200/60" />
                    <div className="w-10/12 h-4 rounded bg-base-200/60" />
                    <div className="w-full h-4 rounded bg-base-200/60" />
                    <div className="w-4/5 h-4 rounded bg-base-200/60" />
                </div>

                {/* List Items */}
                <div className="space-y-4 pt-4">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="flex gap-3 items-center">
                            <div className="w-2 h-2 rounded-full bg-base-300" />
                            <div className="w-2/3 h-4 rounded bg-base-200/60" />
                        </div>
                    ))}
                </div>
            </div>
        </div>

      </div>
    </div>
  );
};
