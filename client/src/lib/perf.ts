type PerfEntry = {
  name: string;
  durationMs: number;
  at: number;
  meta?: Record<string, unknown>;
};

type PerfStore = {
  api: PerfEntry[];
  render: PerfEntry[];
};

declare global {
  interface Window {
    __tracepilotPerfStore?: PerfStore;
  }
}

function devPerfEnabled(): boolean {
  if (!(import.meta as any)?.env?.DEV) return false;
  const envFlag =
    (import.meta as any)?.env?.DEV_PERF_UI === "1"
    || (import.meta as any)?.env?.VITE_DEV_PERF_UI === "1"
    || (window as any)?.DEV_PERF_UI === "1";
  return Boolean(envFlag);
}

function getStore(): PerfStore {
  if (typeof window === "undefined") return { api: [], render: [] };
  if (!window.__tracepilotPerfStore) {
    window.__tracepilotPerfStore = { api: [], render: [] };
  }
  return window.__tracepilotPerfStore;
}

function push(list: PerfEntry[], entry: PerfEntry) {
  list.unshift(entry);
  if (list.length > 20) list.length = 20;
}

export function isPerfUiEnabled(): boolean {
  return devPerfEnabled();
}

export function perfStart(label: string): number {
  if (!devPerfEnabled()) return 0;
  console.time(label);
  return performance.now();
}

export function perfEnd(kind: "api" | "render", label: string, startedAt: number, meta?: Record<string, unknown>) {
  if (!devPerfEnabled() || startedAt === 0) return;
  const durationMs = performance.now() - startedAt;
  console.timeEnd(label);
  const entry: PerfEntry = {
    name: label,
    durationMs: Math.round(durationMs * 10) / 10,
    at: Date.now(),
    meta,
  };
  push(getStore()[kind], entry);
}

export function getPerfStoreSnapshot(): PerfStore {
  const store = getStore();
  return {
    api: [...store.api],
    render: [...store.render],
  };
}
