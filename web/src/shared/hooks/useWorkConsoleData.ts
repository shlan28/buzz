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

export function useWorkConsoleData() {
  const [state, setState] = useState<WorkConsoleState>({ status: "loading" });
  const retainedData = useRef<WorkConsoleData | undefined>(undefined);
  const refresh = useCallback(async () => {
    setState((current) => {
      if (current.status !== "ready") return { status: "loading" };
      return { status: "ready", data: current.data, refreshing: true };
    });
    try {
      const data = await loadWorkConsoleData();
      retainedData.current = data;
      setState({ status: "ready", data });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not load Buzz data.";
      if (retainedData.current) {
        setState({
          status: "ready",
          data: retainedData.current,
          refreshError: message,
        });
        return;
      }
      setState(
        message === "PAIR_REQUIRED"
          ? { status: "pair-required" }
          : { status: "error", message },
      );
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { state, refresh };
}
