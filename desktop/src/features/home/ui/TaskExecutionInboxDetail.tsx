import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Bot, CalendarDays, ExternalLink } from "lucide-react";

import type { InboxItem } from "@/features/home/lib/inbox";
import { taskIdFromExecutionInboxItem } from "@/features/home/lib/taskExecutionInbox";
import { TopChromeInsetHeader } from "@/shared/layout/TopChromeInsetHeader";
import { Button } from "@/shared/ui/button";

function tagValue(item: InboxItem, name: string) {
  return item.item.tags.find((tag) => tag[0] === name)?.[1] ?? null;
}

function label(value: string | null) {
  if (!value) return "None";
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function dueDate(value: string | null) {
  if (!value) return "No due date";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "No due date";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(new Date(parsed * 1_000));
}

export function TaskExecutionInboxDetail({
  isSinglePanelView = false,
  item,
  onBack,
}: {
  isSinglePanelView?: boolean;
  item: InboxItem;
  onBack?: () => void;
}) {
  const navigate = useNavigate();
  const taskId = taskIdFromExecutionInboxItem(item.item);
  const status = tagValue(item, "status");
  const title = tagValue(item, "task-title") ?? "Untitled task";

  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-background"
      data-testid="task-execution-inbox-detail"
    >
      <TopChromeInsetHeader className="flex items-center gap-3 border-b border-border px-4 pb-3">
        {isSinglePanelView && onBack ? (
          <Button
            aria-label="Back to Inbox"
            onClick={onBack}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        ) : null}
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Task result
          </p>
          <h2 className="truncate text-base font-semibold">{title}</h2>
        </div>
      </TopChromeInsetHeader>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <Bot className="h-4 w-4" />
                {item.senderLabel}
              </span>
              <span className="text-muted-foreground">·</span>
              <span
                className={
                  status === "failed"
                    ? "text-destructive"
                    : "text-muted-foreground"
                }
              >
                {status === "failed" ? "Failed" : "Completed"}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                {item.fullTimestampLabel}
              </span>
            </div>

            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Task status</dt>
                <dd className="mt-1 font-medium">
                  {label(tagValue(item, "task-status"))}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Priority</dt>
                <dd className="mt-1 font-medium">
                  {label(tagValue(item, "task-priority"))}
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" /> Due date
                </dt>
                <dd className="mt-1 font-medium">
                  {dueDate(tagValue(item, "task-due"))}
                </dd>
              </div>
            </dl>
          </div>

          <div>
            <h3 className="text-sm font-semibold">
              {status === "failed" ? "Failure details" : "Execution result"}
            </h3>
            <div className="mt-2 whitespace-pre-wrap rounded-lg border border-border bg-muted/20 p-4 text-base leading-relaxed">
              {item.item.content}
            </div>
          </div>

          <div>
            <Button
              disabled={!taskId}
              onClick={() => {
                if (!taskId) return;
                void navigate({
                  to: "/tasks",
                  search: { task: taskId },
                } as never);
              }}
              type="button"
            >
              Open task
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
