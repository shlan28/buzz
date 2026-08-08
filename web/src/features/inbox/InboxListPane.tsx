import type { InboxEntry } from "./inboxProjection";
import { MessageMarkdown } from "@/features/messages/MessageMarkdown";
import { ProfileAvatar } from "@/shared/ui/ProfileAvatar";

export function InboxListPane({
  entries,
  onSelect,
  selectedId,
}: {
  entries: InboxEntry[];
  onSelect: (id: string) => void;
  selectedId?: string;
}) {
  return (
    <section
      className="min-h-0 min-w-0 flex-1 overflow-y-auto"
      aria-label="Inbox items"
    >
      {entries.map((entry) => (
        <button
          aria-current={selectedId === entry.id ? "true" : undefined}
          className={`flex w-full items-start gap-3 border-b border-border/45 px-4 py-3 text-left transition-colors hover:bg-muted/40 ${selectedId === entry.id ? "bg-muted/40" : ""}`}
          data-testid={`inbox-item-${entry.id}`}
          key={entry.id}
          onClick={() => onSelect(entry.id)}
          type="button"
        >
          <ProfileAvatar
            avatarUrl={entry.avatarUrl}
            className="size-9"
            isAgent={entry.isAgent}
            label={entry.authorLabel}
          />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-2">
              <span className="truncate text-sm font-semibold">
                {entry.authorLabel}
              </span>
              {entry.isAgent && (
                <span className="text-2xs text-primary">Agent</span>
              )}
              <time className="ml-auto shrink-0 text-2xs text-muted-foreground">
                {new Date(entry.message.createdAt * 1000).toLocaleString()}
              </time>
            </span>
            <span className="block truncate text-2xs font-medium text-muted-foreground">
              {entry.categoryText}
            </span>
            <span className="mt-1 block text-muted-foreground">
              <MessageMarkdown
                compact
                content={entry.preview || "Empty message"}
              />
            </span>
          </span>
        </button>
      ))}
      {entries.length === 0 && (
        <div className="grid min-h-64 place-items-center text-sm text-muted-foreground">
          You’re all caught up.
        </div>
      )}
    </section>
  );
}
