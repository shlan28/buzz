import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadWorkConsoleData,
  type WorkConsoleData,
} from "@/shared/api/communitySession";

export type WorkConsoleState =
  | { status: "loading" }
  | { status: "pair-required" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      data: WorkConsoleData;
      refreshing?: boolean;
      refreshError?: string;
    };

let sharedState: WorkConsoleState = { status: "loading" };
let activeLoad: Promise<void> | undefined;
const listeners = new Set<(state: WorkConsoleState) => void>();

function publish(state: WorkConsoleState) {
  sharedState = state;
  for (const listener of listeners) listener(state);
}

export function useWorkConsoleData() {
  const [state, setState] = useState<WorkConsoleState>(sharedState);
  const retainedData = useRef<WorkConsoleData | undefined>(
    sharedState.status === "ready" ? sharedState.data : undefined,
  );
  const refresh = useCallback(async () => {
    if (activeLoad) return activeLoad;
    publish(
      sharedState.status === "ready"
        ? { status: "ready", data: sharedState.data, refreshing: true }
        : { status: "loading" },
    );
    activeLoad = (async () => {
      try {
        const data = await loadWorkConsoleData();
        retainedData.current = data;
        publish({ status: "ready", data });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Could not load Buzz data.";
        const retained =
          retainedData.current ??
          (sharedState.status === "ready" ? sharedState.data : undefined);
        publish(
          retained
            ? { status: "ready", data: retained, refreshError: message }
            : message === "PAIR_REQUIRED"
              ? { status: "pair-required" }
              : { status: "error", message },
        );
      } finally {
        activeLoad = undefined;
      }
    })();
    return activeLoad;
  }, []);
  useEffect(() => {
    listeners.add(setState);
    setState(sharedState);
    if (sharedState.status === "loading" && !activeLoad) void refresh();
    return () => {
      listeners.delete(setState);
    };
  }, [refresh]);
  return { state, refresh };
}
