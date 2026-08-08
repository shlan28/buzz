export type PairingLifecycleStep =
  | "idle"
  | "generating"
  | "qr"
  | "expired"
  | "sas"
  | "transferring"
  | "done"
  | "error";

type Unlisten = () => void;

/**
 * Owns asynchronously-created Tauri listeners and releases each at most once.
 * Tauri may already have removed listeners while a WebView is unmounting, so
 * cleanup errors are intentionally contained instead of becoming unhandled
 * promise rejections.
 */
export function createPairingListenerLifecycle() {
  let disposed = false;
  const unlisteners = new Set<Unlisten>();

  const release = (unlisten: Unlisten) => {
    if (!unlisteners.delete(unlisten) && !disposed) return;
    try {
      unlisten();
    } catch {
      // The Tauri WebView can remove the native listener before React cleanup.
    }
  };

  return {
    add(registration: Promise<Unlisten>): void {
      void registration.then(
        (unlisten) => {
          if (disposed) release(unlisten);
          else unlisteners.add(unlisten);
        },
        () => {
          // Listener registration failures surface through pairing state.
        },
      );
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const unlisten of [...unlisteners]) release(unlisten);
      unlisteners.clear();
    },
  };
}

export function shouldCancelPairingOnCleanup(
  step: PairingLifecycleStep,
): boolean {
  return step === "generating" || step === "qr" || step === "sas";
}
