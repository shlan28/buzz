import { useNavigate, useParams } from "@tanstack/react-router";
import {
  CircleDot,
  Hash,
  Lock,
  RefreshCw,
  SendHorizontal,
  Smile,
  Plus,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { publishChannelMessage } from "@/shared/api/messagePublish";
import { useWorkConsoleData } from "@/shared/hooks/useWorkConsoleData";
import { AsyncStateView } from "@/shared/ui/AsyncStateView";
import { DesktopParityAppShell } from "@/shared/ui/DesktopParityAppShell";

export function ChannelsPage() {
  const { state, refresh } = useWorkConsoleData();
  const params = useParams({ strict: false }) as { channelId?: string };
  const navigate = useNavigate();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string>();
  const channels = state.status === "ready" ? state.data.channels : [];
  const channel =
    channels.find((item) => item.id === params.channelId) ?? channels[0];
  useEffect(() => {
    if (!params.channelId && channel) {
      void navigate({
        to: "/app/channels/$channelId",
        params: { channelId: channel.id },
        replace: true,
      });
    }
  }, [channel, navigate, params.channelId]);
  const messages = useMemo(
    () =>
      state.status === "ready"
        ? state.data.messages.filter((item) => item.channelId === channel?.id)
        : [],
    [channel?.id, state],
  );
  const send = async () => {
    if (!channel || !draft.trim() || sending || state.status !== "ready")
      return;
    setSending(true);
    setSendError(undefined);
    try {
      await publishChannelMessage({
        channelId: channel.id,
        content: draft,
        mentionPubkeys:
          channel.channelType === "dm"
            ? channel.participantPubkeys.filter(
                (pubkey) => pubkey !== state.data.userPubkey,
              )
            : undefined,
      });
      setDraft("");
      await refresh();
    } catch (error) {
      setSendError(
        error instanceof Error ? error.message : "Message could not be sent.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <DesktopParityAppShell>
      {state.status !== "ready" ? (
        <AsyncStateView
          status={state.status}
          message={state.status === "error" ? state.message : undefined}
          onRetry={refresh}
        />
      ) : !channel ? (
        <div className="grid flex-1 place-items-center text-sm text-muted-foreground">
          No conversations are available.
        </div>
      ) : (
        <div
          className="flex min-h-0 flex-1 flex-col"
          data-testid="channel-screen"
        >
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
            {channel.channelType === "dm" ? (
              <CircleDot className="size-5 text-emerald-500" />
            ) : channel.visibility === "private" ? (
              <Lock className="size-4 text-muted-foreground" />
            ) : (
              <Hash className="size-5 text-muted-foreground" />
            )}
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold">{channel.name}</h1>
              {channel.about && (
                <p className="truncate text-xs text-muted-foreground">
                  {channel.about}
                </p>
              )}
            </div>
            <button
              aria-label="Refresh messages"
              className="ml-auto rounded-md p-2 text-muted-foreground hover:bg-muted"
              disabled={state.refreshing}
              onClick={refresh}
              type="button"
            >
              <RefreshCw
                className={`size-4 ${state.refreshing ? "animate-spin" : ""}`}
              />
            </button>
          </header>
          <section
            className="min-h-0 flex-1 overflow-y-auto"
            aria-label={`${channel.name} messages`}
          >
            <div className="mx-auto max-w-4xl px-5 py-4">
              {messages.length ? (
                <div>
                  {messages.map((message, index) => {
                    const previous = messages[index - 1];
                    const grouped =
                      previous?.author === message.author &&
                      message.createdAt - previous.createdAt < 300;
                    return (
                      <article
                        className={`group flex gap-3 px-2 hover:bg-muted/30 ${grouped ? "py-0.5" : "mt-3 pt-2"}`}
                        key={message.id}
                      >
                        {grouped ? (
                          <div className="w-9 shrink-0 text-right text-3xs text-muted-foreground opacity-0 group-hover:opacity-100">
                            {new Date(
                              message.createdAt * 1000,
                            ).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        ) : (
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold">
                            {message.author.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          {!grouped && (
                            <div className="flex items-baseline gap-2">
                              <span className="text-sm font-semibold">
                                {message.author === state.data.userPubkey
                                  ? "You"
                                  : `${message.author.slice(0, 12)}…`}
                              </span>
                              <time className="text-2xs text-muted-foreground">
                                {new Date(
                                  message.createdAt * 1000,
                                ).toLocaleString()}
                              </time>
                            </div>
                          )}
                          <p className="whitespace-pre-wrap break-words text-base leading-6">
                            {message.content}
                          </p>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="grid min-h-80 place-items-center text-center">
                  <div>
                    <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-muted">
                      {channel.channelType === "dm" ? (
                        <CircleDot className="size-6" />
                      ) : (
                        <Hash className="size-6" />
                      )}
                    </div>
                    <h2 className="text-base font-semibold">
                      Start the conversation
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Send a message from Buzz Web.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
          <footer className="shrink-0 px-5 pb-5 pt-2">
            <div className="mx-auto max-w-4xl">
              <div className="rounded-xl border border-border bg-background shadow-sm focus-within:ring-1 focus-within:ring-ring">
                <textarea
                  aria-label={`Message ${channel.name}`}
                  className="min-h-20 w-full resize-none bg-transparent px-4 py-3 text-base outline-none placeholder:text-muted-foreground"
                  disabled={sending}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                  placeholder={`Message ${channel.channelType === "dm" ? channel.name : `#${channel.name}`}`}
                  value={draft}
                />
                <div className="flex h-10 items-center border-t border-border px-2">
                  <button
                    aria-label="Add attachment"
                    className="rounded-md p-1.5 text-muted-foreground opacity-50"
                    disabled
                    type="button"
                  >
                    <Plus className="size-4" />
                  </button>
                  <button
                    aria-label="Add emoji"
                    className="rounded-md p-1.5 text-muted-foreground opacity-50"
                    disabled
                    type="button"
                  >
                    <Smile className="size-4" />
                  </button>
                  <button
                    aria-label="Send message"
                    className="ml-auto rounded-md bg-primary p-1.5 text-primary-foreground disabled:opacity-40"
                    disabled={!draft.trim() || sending}
                    onClick={() => void send()}
                    type="button"
                  >
                    <SendHorizontal className="size-4" />
                  </button>
                </div>
              </div>
              {sendError && (
                <p className="mt-2 text-xs text-destructive">{sendError}</p>
              )}
            </div>
          </footer>
        </div>
      )}
    </DesktopParityAppShell>
  );
}
