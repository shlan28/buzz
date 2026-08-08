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
import { profileLabel } from "@/features/profile/eventCodec";
import { subscribeChannelMessages } from "@/features/messages/channelMessageSession";

export function ChannelsPage() {
  const { state, refresh } = useWorkConsoleData();
  const params = useParams({ strict: false }) as { channelId?: string };
  const navigate = useNavigate();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string>();
  const [mentionPubkeys, setMentionPubkeys] = useState<string[]>([]);
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
  useEffect(() => {
    if (!channel) return;
    const catchUp = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const unsubscribe = subscribeChannelMessages(channel.id, () => {
      void refresh();
    });
    document.addEventListener("visibilitychange", catchUp);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", catchUp);
    };
  }, [channel, refresh]);
  const messages = useMemo(
    () =>
      state.status === "ready"
        ? state.data.messages.filter((item) => item.channelId === channel?.id)
        : [],
    [channel?.id, state],
  );
  const mentionQuery = draft.match(/(?:^|\s)@([^\s@]*)$/)?.[1]?.toLowerCase();
  const mentionCandidates = useMemo(() => {
    if (mentionQuery === undefined || state.status !== "ready" || !channel)
      return [];
    return (state.data.membersByChannelId[channel.id] ?? [])
      .filter((pubkey) => pubkey !== state.data.userPubkey.toLowerCase())
      .map((pubkey) => ({
        pubkey,
        profile: state.data.profilesByPubkey[pubkey.toLowerCase()],
        label: profileLabel(
          state.data.profilesByPubkey[pubkey.toLowerCase()],
          pubkey,
        ),
      }))
      .filter(({ label }) => label.toLowerCase().includes(mentionQuery))
      .sort(
        (left, right) =>
          Number(Boolean(right.profile?.isAgent)) -
            Number(Boolean(left.profile?.isAgent)) ||
          left.label.localeCompare(right.label),
      )
      .slice(0, 8);
  }, [channel, mentionQuery, state]);
  const send = async () => {
    if (!channel || !draft.trim() || sending || state.status !== "ready")
      return;
    setSending(true);
    setSendError(undefined);
    try {
      await publishChannelMessage({
        channelId: channel.id,
        content: draft,
        mentionPubkeys: [
          ...new Set([
            ...mentionPubkeys,
            ...(channel.channelType === "dm"
              ? channel.participantPubkeys.filter(
                  (pubkey) => pubkey !== state.data.userPubkey,
                )
              : []),
          ]),
        ],
      });
      setDraft("");
      setMentionPubkeys([]);
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
              <h1 className="truncate text-sm font-semibold">
                {channel.displayName}
              </h1>
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
            aria-label={`${channel.displayName} messages`}
          >
            <div className="mx-auto max-w-4xl px-5 py-4">
              {messages.length ? (
                <div>
                  {messages.map((message, index) => {
                    const previous = messages[index - 1];
                    const messageDay = new Date(
                      message.createdAt * 1000,
                    ).toDateString();
                    const previousDay = previous
                      ? new Date(previous.createdAt * 1000).toDateString()
                      : null;
                    const grouped =
                      previous?.author === message.author &&
                      message.createdAt - previous.createdAt <= 600 &&
                      new Date(previous.createdAt * 1000).toDateString() ===
                        new Date(message.createdAt * 1000).toDateString();
                    const authorProfile =
                      state.data.profilesByPubkey[message.author.toLowerCase()];
                    const authorLabel =
                      message.author === state.data.userPubkey
                        ? "You"
                        : profileLabel(authorProfile, message.author);
                    return (
                      <div key={message.id}>
                        {messageDay !== previousDay && (
                          <div className="relative my-5 flex items-center justify-center">
                            <div className="absolute inset-x-0 h-px bg-border" />
                            <span className="relative rounded-full bg-background px-3 text-2xs font-medium text-muted-foreground">
                              {new Date(
                                message.createdAt * 1000,
                              ).toLocaleDateString([], {
                                day: "numeric",
                                month: "long",
                                year: "numeric",
                              })}
                            </span>
                          </div>
                        )}
                        <article
                          className={`group flex gap-3 px-2 hover:bg-muted/30 ${grouped ? "py-0.5" : "mt-3 pt-2"}`}
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
                              {authorLabel.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            {!grouped && (
                              <div className="flex items-baseline gap-2">
                                <span className="text-sm font-semibold">
                                  {authorLabel}
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
                      </div>
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
              {mentionCandidates.length > 0 && (
                <div
                  className="mb-2 max-h-64 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-xl"
                  data-testid="mention-autocomplete"
                >
                  {mentionCandidates.map(({ label, profile, pubkey }) => (
                    <button
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted"
                      key={pubkey}
                      onClick={() => {
                        setDraft((value) =>
                          value.replace(/@[^\s@]*$/, `@${label} `),
                        );
                        setMentionPubkeys((current) => [
                          ...new Set([...current, pubkey]),
                        ]);
                      }}
                      type="button"
                    >
                      <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-xs font-semibold">
                        {label.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {label}
                      </span>
                      {profile?.isAgent && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-2xs font-medium text-primary">
                          Agent
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              <div className="rounded-xl border border-border bg-background shadow-sm focus-within:ring-1 focus-within:ring-ring">
                <textarea
                  aria-label={`Message ${channel.displayName}`}
                  className="min-h-20 w-full resize-none bg-transparent px-4 py-3 text-base outline-none placeholder:text-muted-foreground"
                  disabled={sending}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                  placeholder={`Message ${channel.channelType === "dm" ? channel.displayName : `#${channel.displayName}`}`}
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
