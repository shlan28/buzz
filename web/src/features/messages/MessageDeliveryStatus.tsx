import {
  Check,
  Clock3,
  LoaderCircle,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

export type DeliveryState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "accepted" }
  | { status: "waiting"; label: string }
  | { status: "still-waiting"; label: string }
  | { status: "failed"; message: string };

export function MessageDeliveryStatus({
  delivery,
  onRetry,
}: {
  delivery: DeliveryState;
  onRetry: () => void;
}) {
  if (delivery.status === "idle") return null;
  return (
    <div
      aria-live="polite"
      className="flex min-h-7 items-center gap-2 px-1 text-xs text-muted-foreground"
      data-testid="message-delivery-status"
      role="status"
    >
      {delivery.status === "sending" ? (
        <>
          <LoaderCircle className="size-3.5 animate-spin" />
          Signing and sending…
        </>
      ) : delivery.status === "accepted" ? (
        <>
          <Check className="size-3.5 text-emerald-600" />
          Sent
        </>
      ) : delivery.status === "waiting" ? (
        <>
          <LoaderCircle className="size-3.5 animate-spin" />
          Waiting for {delivery.label}…
        </>
      ) : delivery.status === "still-waiting" ? (
        <>
          <Clock3 className="size-3.5" />
          Still waiting for {delivery.label}
        </>
      ) : (
        <>
          <TriangleAlert className="size-3.5 text-destructive" />
          <span className="min-w-0 flex-1 truncate text-destructive">
            {delivery.message}
          </span>
          <button
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-foreground hover:bg-muted"
            onClick={onRetry}
            type="button"
          >
            <RotateCcw className="size-3" />
            Retry
          </button>
        </>
      )}
    </div>
  );
}
