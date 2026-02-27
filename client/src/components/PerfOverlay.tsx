import { useEffect, useState } from "react";
import { getPerfStoreSnapshot, isPerfUiEnabled } from "@/lib/perf";

export function PerfOverlay() {
  const [tick, setTick] = useState(0);
  const enabled = isPerfUiEnabled();

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setTick((v) => v + 1), 500);
    return () => window.clearInterval(id);
  }, [enabled]);

  if (!enabled) return null;

  const snap = getPerfStoreSnapshot();
  void tick;

  return (
    <div className="fixed bottom-3 right-3 z-[9999] w-[360px] rounded-md border bg-background/95 p-3 text-xs shadow-xl">
      <div className="mb-2 font-semibold">Perf Overlay</div>
      <div className="mb-1 text-muted-foreground">Last API timings</div>
      <div className="max-h-28 overflow-auto space-y-1">
        {snap.api.length === 0 ? <div className="text-muted-foreground">No API timings yet</div> : snap.api.slice(0, 6).map((item, idx) => (
          <div key={`api-${idx}`} className="flex justify-between gap-2">
            <span className="truncate">{item.name}</span>
            <span>{item.durationMs}ms</span>
          </div>
        ))}
      </div>
      <div className="mt-2 mb-1 text-muted-foreground">Last render timings</div>
      <div className="max-h-28 overflow-auto space-y-1">
        {snap.render.length === 0 ? <div className="text-muted-foreground">No render timings yet</div> : snap.render.slice(0, 6).map((item, idx) => (
          <div key={`render-${idx}`} className="flex justify-between gap-2">
            <span className="truncate">{item.name}</span>
            <span>{item.durationMs}ms</span>
          </div>
        ))}
      </div>
    </div>
  );
}
