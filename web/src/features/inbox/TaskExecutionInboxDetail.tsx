import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, ExternalLink, XCircle } from "lucide-react";
import { MessageMarkdown } from "@/features/messages/MessageMarkdown";
import { ProfileAvatar } from "@/shared/ui/ProfileAvatar";
import type { TaskResultInboxEntry } from "./inboxProjection";

export function TaskExecutionInboxDetail({
  entry,
  onBack,
}: {
  entry: TaskResultInboxEntry;
  onBack: () => void;
}) {
  const navigate = useNavigate();
  const failed = entry.execution.status === "failed";
  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-background"
      data-testid="task-execution-inbox-detail"
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
          <h2 className="truncate text-sm font-semibold">{entry.task.title}</h2>
          <p className="text-xs text-muted-foreground">
            {failed ? "Task failed" : "Task completed"}
          </p>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs hover:bg-muted"
          onClick={() =>
            void navigate({
              to: "/app/tasks",
              search: { task: entry.task.id } as never,
            })
          }
          type="button"
        >
          <ExternalLink className="size-3.5" />
          Open task
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mx-auto max-w-3xl space-y-5">
          <div className="flex items-center gap-3 rounded-xl border border-border p-4">
            <ProfileAvatar
              avatarUrl={entry.avatarUrl}
              className="size-10"
              isAgent
              label={entry.authorLabel}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {entry.authorLabel}
              </p>
              <time className="text-xs text-muted-foreground">
                {new Date(entry.updatedAt * 1000).toLocaleString()}
              </time>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-medium ${failed ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}
            >
              {failed ? (
                <XCircle className="size-4" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              {failed ? "Failed" : "Finished"}
            </span>
          </div>
          {entry.task.description ? (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Task
              </h3>
              <p className="whitespace-pre-wrap text-sm">
                {entry.task.description}
              </p>
            </section>
          ) : null}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Result
            </h3>
            <div className="rounded-xl border border-border p-4">
              <MessageMarkdown content={entry.preview} />
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
