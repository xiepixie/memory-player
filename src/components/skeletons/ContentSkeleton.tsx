export const ContentSkeleton = () => {
  return (
    <div className="w-full max-w-3xl p-8 space-y-8 animate-pulse mx-auto">
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
  );
};
