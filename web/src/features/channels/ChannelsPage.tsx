import { Hash, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { useWorkConsoleData } from "@/shared/hooks/useWorkConsoleData";
import { AsyncStateView } from "@/shared/ui/AsyncStateView";
import { DesktopParityAppShell } from "@/shared/ui/DesktopParityAppShell";

export function ChannelsPage() {
  const { state, refresh } = useWorkConsoleData();
  const [selectedId, setSelectedId] = useState<string>();
  const data = state.status === "ready" ? state.data : undefined;
  const readyData = data ?? { channels: [], messages: [], userPubkey: "" };
  const channel =
    readyData.channels.find((item) => item.id === selectedId) ??
    readyData.channels[0];
  const messages = useMemo(
    () => readyData.messages.filter((item) => item.channelId === channel?.id),
    [readyData.messages, channel],
  );
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
          <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/60 px-4">
            <div className="flex items-center gap-2">
              <Hash className="size-4 text-muted-foreground" />
              <h1 className="text-sm font-semibold">
                {channel?.name ?? "Channels"}
              </h1>
            </div>
            <button
              aria-label="Refresh"
              className="rounded-md p-2 text-muted-foreground hover:bg-accent"
              onClick={refresh}
              type="button"
            >
              <RefreshCw className="size-4" />
            </button>
          </header>
          <div className="flex min-h-0 flex-1">
            <aside className="w-56 shrink-0 overflow-y-auto border-r border-border/60 p-2 max-[760px]:w-14">
              {readyData.channels.map((item) => (
                <button
                  className={`flex h-9 w-full items-center gap-2 rounded-md px-2 text-sm max-[760px]:justify-center ${item.id === channel?.id ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/60"}`}
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  type="button"
                >
                  <Hash className="size-4 shrink-0" />
                  <span className="truncate max-[760px]:sr-only">
                    {item.name}
                  </span>
                </button>
              ))}
            </aside>
            <section className="min-w-0 flex-1 overflow-y-auto p-4">
              {messages.length ? (
                <div className="space-y-4">
                  {messages.map((message) => (
                    <article className="flex gap-3" key={message.id}>
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                        {message.author.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-semibold">
                            {message.author === readyData.userPubkey
                              ? "You"
                              : `${message.author.slice(0, 8)}…`}
                          </span>
                          <time className="text-2xs text-muted-foreground">
                            {new Date(
                              message.createdAt * 1000,
                            ).toLocaleString()}
                          </time>
                        </div>
                        <p className="whitespace-pre-wrap break-words text-sm leading-6">
                          {message.content}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty
                  text={
                    readyData.channels.length
                      ? "No messages in this channel."
                      : "No channels are visible to this account yet."
                  }
                />
              )}
            </section>
          </div>
        </>
      )}
    </DesktopParityAppShell>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
