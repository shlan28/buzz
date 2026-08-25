import * as React from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  CalendarDays,
  Check,
  CircleAlert,
  ExternalLink,
  LoaderCircle,
  LockKeyhole,
} from "lucide-react";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import type {
  CalendarSubscriptionSecret,
  CalendarSubscriptionStatus,
} from "@/shared/api/calendarSubscription";
import { writeTextToClipboard } from "@/shared/lib/clipboard";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";

type SecretMutation = UseMutationResult<
  CalendarSubscriptionSecret,
  Error,
  void,
  unknown
>;
type RevokeMutation = UseMutationResult<
  CalendarSubscriptionStatus,
  Error,
  void,
  unknown
>;

type Confirmation = "regenerate" | "revoke" | null;

function maskedUrl(value: string): string {
  try {
    const url = new URL(value.replace(/^webcal:/, "https:"));
    return `${url.origin}/calendar/subscriptions/••••••.ics`;
  } catch {
    return "Private subscription link ••••••";
  }
}

function formatCreatedAt(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    date,
  );
}

export function CalendarSubscriptionDialog({
  open,
  onOpenChange,
  status,
  create,
  regenerate,
  revoke,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: UseQueryResult<CalendarSubscriptionStatus, Error>;
  create: SecretMutation;
  regenerate: SecretMutation;
  revoke: RevokeMutation;
}) {
  const [secret, setSecret] = React.useState<CalendarSubscriptionSecret>();
  const [confirmation, setConfirmation] = React.useState<Confirmation>(null);
  const [copied, setCopied] = React.useState<"https" | "webcal" | null>(null);
  const [actionError, setActionError] = React.useState<string>();

  const close = () => {
    setSecret(undefined);
    setCopied(null);
    setActionError(undefined);
    onOpenChange(false);
  };
  const copy = async (kind: "https" | "webcal", value: string) => {
    try {
      await writeTextToClipboard(value);
      setCopied(kind);
    } catch {
      setActionError("Buzz couldn't access the clipboard. Try again.");
    }
  };
  const runSecretMutation = (mutation: SecretMutation) => {
    setActionError(undefined);
    mutation.mutate(undefined, {
      onSuccess: (next) => {
        setSecret(next);
        setConfirmation(null);
      },
      onError: (error) => {
        setActionError(error.message);
        setConfirmation(null);
      },
    });
  };
  const runRevoke = () => {
    setActionError(undefined);
    revoke.mutate(undefined, {
      onSuccess: () => {
        setSecret(undefined);
        setConfirmation(null);
      },
      onError: (error) => {
        setActionError(error.message);
        setConfirmation(null);
      },
    });
  };
  const isPending =
    create.isPending || regenerate.isPending || revoke.isPending;
  const createdAt = formatCreatedAt(status.data?.createdAt ?? null);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      >
        <DialogContent
          className="max-h-[calc(100vh-2rem)] max-w-xl overflow-y-auto"
          data-testid="calendar-subscription-dialog"
          onEscapeKeyDown={(event) => {
            if (isPending) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>Apple Calendar subscription</DialogTitle>
            <DialogDescription>
              See all of your Buzz events in Apple Calendar.
            </DialogDescription>
          </DialogHeader>

          {status.isLoading ? (
            <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              Loading subscription status…
            </div>
          ) : null}

          {status.isError ? (
            <Alert variant="destructive">
              <AlertTitle className="flex items-center gap-2">
                <CircleAlert className="size-4" />
                Subscription status couldn&apos;t be loaded
              </AlertTitle>
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                <span>Check your connection and try again.</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void status.refetch()}
                >
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          {!status.isLoading && !status.isError && secret ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Check className="size-4 text-primary" />
                Your private subscription link is ready
              </div>
              <p className="text-xs text-muted-foreground">
                Save it now. For security, Buzz won&apos;t show the full link
                again after you close this window.
              </p>
              <div className="space-y-2">
                <span className="text-xs font-medium">Subscription link</span>
                <div className="flex min-w-0 gap-2">
                  <div
                    className="min-w-0 flex-1 truncate rounded-lg border border-input/40 bg-muted/40 px-3 py-2 font-mono text-xs"
                    title="Private link hidden"
                  >
                    {maskedUrl(secret.httpsUrl)}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void copy("https", secret.httpsUrl)}
                  >
                    {copied === "https" ? <Check /> : null}
                    {copied === "https" ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  setActionError(undefined);
                  void openUrl(secret.webcalUrl).catch(() => {
                    setActionError(
                      "Apple Calendar couldn't be opened. Copy the subscription link and add it manually.",
                    );
                  });
                }}
              >
                <ExternalLink /> Open with Apple Calendar
              </Button>
              <div className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">
                  Or add manually on iPhone
                </p>
                <p className="mt-1 leading-5">
                  Settings → Apps → Calendar → Calendar Accounts → Add Account →
                  Other → Add Subscribed Calendar
                </p>
              </div>
            </div>
          ) : null}

          {!status.isLoading &&
          !status.isError &&
          !secret &&
          !status.data?.active ? (
            <div className="space-y-4">
              <div className="space-y-2 text-sm">
                <p className="font-medium">Included</p>
                <p className="flex items-center gap-2">
                  <CalendarDays className="size-4 text-primary" /> Personal
                  calendar
                </p>
                <p className="flex items-center gap-2">
                  <CalendarDays className="size-4 text-primary" /> Calendars
                  from agents you own
                </p>
              </div>
              <Alert className="bg-warning/10">
                <AlertTitle className="flex items-center gap-2">
                  <LockKeyhole className="size-4" /> Private link
                </AlertTitle>
                <AlertDescription>
                  Anyone with this link can read your event titles, times,
                  descriptions, and locations. Treat it like a password.
                </AlertDescription>
              </Alert>
              <p className="text-xs text-muted-foreground">
                This is read-only. Apple Calendar refreshes it periodically, so
                changes may not appear immediately.
              </p>
            </div>
          ) : null}

          {!status.isLoading &&
          !status.isError &&
          !secret &&
          status.data?.active ? (
            <div className="space-y-5">
              <div>
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Check className="size-4 text-primary" /> Active
                </p>
                {createdAt ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Created {createdAt}
                  </p>
                ) : null}
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                Your full private link is no longer available. If you did not
                save it, generate a new one.
              </p>
              <Button
                variant="secondary"
                disabled={isPending}
                onClick={() => setConfirmation("regenerate")}
              >
                Generate new link
              </Button>
              <div className="border-t border-border/60 pt-4">
                <p className="text-sm font-medium">Stop this subscription</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Revoking prevents future refreshes. Cached events remain until
                  you remove the calendar from iOS.
                </p>
                <Button
                  className="mt-3"
                  variant="destructive"
                  disabled={isPending}
                  onClick={() => setConfirmation("revoke")}
                >
                  Revoke link
                </Button>
              </div>
            </div>
          ) : null}

          {actionError ? (
            <Alert variant="destructive">
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          ) : null}
          <div aria-live="polite" className="sr-only">
            {copied ? "Subscription link copied" : ""}
          </div>

          {!status.isLoading &&
          !status.isError &&
          !status.data?.active &&
          !secret ? (
            <DialogFooter>
              <Button
                variant="outline"
                disabled={create.isPending}
                onClick={close}
              >
                Cancel
              </Button>
              <Button
                disabled={create.isPending}
                onClick={() => runSecretMutation(create)}
              >
                {create.isPending ? (
                  <LoaderCircle className="animate-spin" />
                ) : null}
                {create.isPending ? "Creating…" : "Create private link"}
              </Button>
            </DialogFooter>
          ) : null}
          {secret ? (
            <DialogFooter>
              <Button onClick={close}>Done</Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmation !== null}
        onOpenChange={(next) => !next && setConfirmation(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmation === "revoke"
                ? "Revoke subscription link?"
                : "Generate a new link?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              The current link will stop working immediately. Apple may keep
              events it already cached until you remove the subscribed calendar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={
                confirmation === "revoke"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault();
                if (confirmation === "revoke") runRevoke();
                else runSecretMutation(regenerate);
              }}
            >
              {isPending ? <LoaderCircle className="animate-spin" /> : null}
              {confirmation === "revoke" ? "Revoke link" : "Generate new link"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
