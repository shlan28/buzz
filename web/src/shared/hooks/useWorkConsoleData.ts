import { useCallback, useEffect, useState } from "react";
import {
  loadWorkConsoleData,
  type WorkConsoleData,
} from "@/shared/api/communitySession";

export type WorkConsoleState =
  | { status: "loading" }
  | { status: "pair-required" }
  | { status: "error"; message: string }
  | { status: "ready"; data: WorkConsoleData };

export function useWorkConsoleData() {
  const [state, setState] = useState<WorkConsoleState>({ status: "loading" });
  const refresh = useCallback(async () => {
    setState({ status: "loading" });
    try {
      setState({ status: "ready", data: await loadWorkConsoleData() });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not load Buzz data.";
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
