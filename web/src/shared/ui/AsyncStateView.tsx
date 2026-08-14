import { Link } from "@tanstack/react-router";
import { LoaderCircle, RefreshCw, Unplug } from "lucide-react";

export function asyncStateCopy(
  status: "pair-required" | "error",
  message?: string,
) {
  if (status === "pair-required") {
    return {
      title: "Pair with your Mac",
      description: "This browser has no paired device credential yet.",
    };
  }
  const signerUnavailable =
    message?.includes("Remote signer") ||
    message?.includes("Desktop") ||
    message?.includes("signer");
  return signerUnavailable
    ? {
        title: "Mac signer is offline",
        description:
          "Your pairing is still saved. Start or reopen Buzz Desktop, then retry.",
      }
    : {
        title: "Relay data is unavailable",
        description: message,
      };
}

export function AsyncStateView({
  status,
  message,
  onRetry,
}: {
  status: "loading" | "pair-required" | "error";
  message?: string;
  onRetry: () => void;
}) {
  if (status === "loading")
    return (
      <div
        className="flex flex-1 items-center justify-center"
        aria-label="Loading Buzz data"
        role="status"
      >
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  const pair = status === "pair-required";
  const copy = asyncStateCopy(status, message);
  return (
    <div className="flex flex-1 items-center justify-center p-6 text-center">
      <div className="max-w-sm">
        <Unplug className="mx-auto mb-3 size-8 text-muted-foreground" />
        <h2 className="text-base font-semibold">{copy.title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{copy.description}</p>
        {pair ? (
          <Link
            className="mt-4 inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
            to="/app/pair"
          >
            Open Pairing
          </Link>
        ) : (
          <button
            className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium"
            onClick={onRetry}
            type="button"
          >
            <RefreshCw className="size-4" />
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
