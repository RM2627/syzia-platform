import { useEffect } from "react";
// One request at a time; hidden tabs pause. The delay starts after completion.
export function useVisiblePolling(load: () => Promise<unknown>, delay: number) {
  useEffect(() => {
    let stopped = false,
      running = false,
      timer: ReturnType<typeof setTimeout>;
    async function run() {
      if (stopped || running || document.visibilityState === "hidden") return;
      running = true;
      try {
        await load();
      } finally {
        running = false;
        if (!stopped && !document.hidden) timer = setTimeout(run, delay);
      }
    }
    function visible() {
      clearTimeout(timer);
      if (!document.hidden) void run();
    }
    void run();
    document.addEventListener("visibilitychange", visible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [load, delay]);
}
