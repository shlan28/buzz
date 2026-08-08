import { Link } from "@tanstack/react-router";
import { LoaderCircle, RefreshCw, Unplug } from "lucide-react";

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
  return (
    <div className="flex flex-1 items-center justify-center p-6 text-center">
      <div className="max-w-sm">
        <Unplug className="mx-auto mb-3 size-8 text-muted-foreground" />
        <h2 className="text-base font-semibold">
          {pair ? "Pair with your Mac" : "Mac signer or Relay unavailable"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {pair ? "This browser has no paired device credential yet." : message}
        </p>
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
