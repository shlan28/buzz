import { Activity } from "lucide-react";
import { useWorkConsoleData } from "@/shared/hooks/useWorkConsoleData";
import { AsyncStateView } from "@/shared/ui/AsyncStateView";
import { DesktopParityAppShell } from "@/shared/ui/DesktopParityAppShell";
export function ActivityPage() {
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
        <>
          <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 px-4">
            <Activity className="size-4 text-muted-foreground" />
            <h1 className="text-sm font-semibold">Agent Activity</h1>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="mx-auto max-w-3xl space-y-2">
              {[...state.data.messages]
                .reverse()
                .filter((message) => message.author !== state.data.userPubkey)
                .slice(0, 100)
                .map((message) => (
                  <article
                    className="rounded-lg border border-border p-3"
                    key={message.id}
                  >
                    <div className="flex justify-between gap-3">
                      <span className="text-xs font-medium">
                        {message.author.slice(0, 12)}…
                      </span>
                      <time className="text-2xs text-muted-foreground">
                        {new Date(message.createdAt * 1000).toLocaleString()}
                      </time>
                    </div>
                    <p className="mt-1 line-clamp-3 text-sm">
                      {message.content}
                    </p>
                  </article>
                ))}
              {!state.data.messages.some(
                (message) => message.author !== state.data.userPubkey,
              ) && (
                <p className="py-20 text-center text-sm text-muted-foreground">
                  No Agent activity is visible yet.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </DesktopParityAppShell>
  );
}
