import { useNavigate } from "@tanstack/react-router";
import { Inbox, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useWorkConsoleData } from "@/shared/hooks/useWorkConsoleData";
import { AsyncStateView } from "@/shared/ui/AsyncStateView";
import { DesktopParityAppShell } from "@/shared/ui/DesktopParityAppShell";
import { InboxDetailPane } from "./InboxDetailPane";
import { InboxListPane } from "./InboxListPane";
import { buildInboxEntries } from "./inboxProjection";

export function InboxPage() {
  const navigate = useNavigate();
  const { state, refresh } = useWorkConsoleData();
  const [selectedId, setSelectedId] = useState<string | undefined>(
    () => new URLSearchParams(window.location.search).get("item") ?? undefined,
  );
  const entries = useMemo(
    () => (state.status === "ready" ? buildInboxEntries(state.data) : []),
    [state],
  );
  const selected =
    entries.find((entry) => entry.id === selectedId) ?? entries[0];

  useEffect(() => {
    const sync = () =>
      setSelectedId(
        new URLSearchParams(window.location.search).get("item") ?? undefined,
      );
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const select = (id?: string) => {
    setSelectedId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("item", id);
    else url.searchParams.delete("item");
    window.history.pushState(window.history.state, "", url);
  };

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
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div
              className={`${selectedId ? "hidden min-[900px]:flex" : "flex"} min-h-0 w-full flex-col border-r border-border/50 min-[900px]:w-[360px] min-[900px]:shrink-0`}
            >
              <h2 className="flex items-center gap-2 border-b border-border/50 px-4 py-3 text-sm font-semibold">
                <Inbox className="size-4" />
                Recent activity
              </h2>
              <InboxListPane
                entries={entries}
                onSelect={select}
                selectedId={selected?.id}
              />
            </div>
            {selected ? (
              <div
                className={`${selectedId ? "flex" : "hidden min-[900px]:flex"} min-h-0 min-w-0 flex-1`}
              >
                <InboxDetailPane
                  data={state.data}
                  entry={selected}
                  onBack={() => select(undefined)}
                  onOpenConversation={() =>
                    void navigate({
                      to: "/app/channels/$channelId",
                      params: { channelId: selected.message.channelId },
                    })
                  }
                />
              </div>
            ) : (
              <div className="grid flex-1 place-items-center text-sm text-muted-foreground">
                You’re all caught up.
              </div>
            )}
          </div>
        </div>
      )}
    </DesktopParityAppShell>
  );
}
