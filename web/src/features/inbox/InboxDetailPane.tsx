import { ArrowLeft, ExternalLink } from "lucide-react";
import { MessageMarkdown } from "@/features/messages/MessageMarkdown";
import { profileLabel } from "@/features/profile/eventCodec";
import type { WorkConsoleData } from "@/shared/api/communitySession";
import { ProfileAvatar } from "@/shared/ui/ProfileAvatar";
import type { InboxEntry } from "./inboxProjection";
import { inboxContext } from "./inboxProjection";

export function InboxDetailPane({
  data,
  entry,
  onBack,
  onOpenConversation,
}: {
  data: WorkConsoleData;
  entry: InboxEntry;
  onBack: () => void;
  onOpenConversation: () => void;
}) {
  const messages = inboxContext(data, entry);
  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-background"
      data-testid="inbox-detail"
    >
      <header className="flex min-h-14 items-center gap-3 border-b border-border px-4">
        <button
          aria-label="Back to Inbox"
          className="rounded-md p-2 hover:bg-muted min-[900px]:hidden"
          onClick={onBack}
          type="button"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">
            {entry.channelLabel}
          </h2>
          <p className="text-xs text-muted-foreground">Conversation context</p>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs hover:bg-muted disabled:opacity-50"
          disabled={!entry.canOpenConversation}
          onClick={onOpenConversation}
          type="button"
        >
          <ExternalLink className="size-3.5" />
          Open conversation
        </button>
      </header>
      <section
        aria-label="Inbox conversation context"
        className="min-h-0 flex-1 overflow-y-auto px-3 py-4"
      >
        {messages.map((message) => {
          const profile = data.profilesByPubkey[message.author.toLowerCase()];
          const label = profileLabel(profile, message.author);
          return (
            <article
              className={`flex gap-3 rounded-xl px-2 py-2 ${message.id === entry.id ? "bg-primary/[0.07]" : "hover:bg-muted/40"}`}
              data-testid={
                message.id === entry.id ? "inbox-selected-message" : undefined
              }
              key={message.id}
            >
              <ProfileAvatar
                avatarUrl={profile?.avatarUrl}
                className="size-9"
                isAgent={profile?.isAgent}
                label={label}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-semibold">
                    {label}
                  </span>
                  {profile?.isAgent && (
                    <span className="text-2xs text-primary">Agent</span>
                  )}
                  <time className="text-2xs text-muted-foreground">
                    {new Date(message.createdAt * 1000).toLocaleString()}
                  </time>
                </div>
                <MessageMarkdown content={message.content} />
              </div>
            </article>
          );
        })}
      </section>
    </section>
  );
}
