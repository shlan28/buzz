import { Inbox, RefreshCw } from "lucide-react";
import { useWorkConsoleData } from "@/shared/hooks/useWorkConsoleData";
import { AsyncStateView } from "@/shared/ui/AsyncStateView";
import { DesktopParityAppShell } from "@/shared/ui/DesktopParityAppShell";

export function InboxPage() {
  const { state, refresh } = useWorkConsoleData();
  return (
    <DesktopParityAppShell>
      {state.status !== "ready" ? (
        <AsyncStateView
          status={state.status}
          message={state.status === "error" ? state.message : undefined}
          onRetry={refresh}
        />
      ) : (
        <div
          className="flex min-h-0 flex-1 flex-col"
          data-testid="inbox-screen"
        >
          <header className="flex min-h-16 items-center gap-3 border-b border-border px-5">
            <div className="mr-auto">
              <h1 className="text-lg font-semibold tracking-tight">Inbox</h1>
              <p className="text-xs text-muted-foreground">
                Messages and activity that need your attention
              </p>
            </div>
            <button
              aria-label="Refresh inbox"
              className="rounded-md p-2 text-muted-foreground hover:bg-muted"
              onClick={refresh}
              type="button"
            >
              <RefreshCw
                className={`size-4 ${state.refreshing ? "animate-spin" : ""}`}
              />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-4xl p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Inbox className="size-4" />
                Recent activity
              </h2>
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                {[...state.data.messages]
                  .reverse()
                  .slice(0, 100)
                  .map((message) => {
                    const channel = state.data.channels.find(
                      (item) => item.id === message.channelId,
                    );
                    return (
                      <article
                        className="flex gap-3 border-b border-border p-4 last:border-0 hover:bg-muted/40"
                        key={message.id}
                      >
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                          {message.author.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-semibold">
                              {message.author === state.data.userPubkey
                                ? "You"
                                : `${message.author.slice(0, 10)}…`}
                            </span>
                            <span className="truncate text-xs text-muted-foreground">
                              in {channel?.name ?? "a conversation"}
                            </span>
                            <time className="ml-auto shrink-0 text-2xs text-muted-foreground">
                              {new Date(
                                message.createdAt * 1000,
                              ).toLocaleString()}
                            </time>
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm leading-5">
                            {message.content}
                          </p>
                        </div>
                      </article>
                    );
                  })}
                {!state.data.messages.length && (
                  <div className="grid min-h-64 place-items-center text-sm text-muted-foreground">
                    You’re all caught up.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </DesktopParityAppShell>
  );
}
