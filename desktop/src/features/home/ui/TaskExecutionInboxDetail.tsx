import { useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CheckSquare2,
  ExternalLink,
  Flag,
} from "lucide-react";

import { useKnownAgentPubkeys } from "@/features/agents/useKnownAgentPubkeys";
import type { InboxItem } from "@/features/home/lib/inbox";
import { taskIdFromExecutionInboxItem } from "@/features/home/lib/taskExecutionInbox";
import { TopChromeInsetHeader } from "@/shared/layout/TopChromeInsetHeader";
import { normalizePubkey } from "@/shared/lib/pubkey";
import { Button } from "@/shared/ui/button";
import { Markdown } from "@/shared/ui/markdown";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { UserAvatar } from "@/shared/ui/UserAvatar";

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
  agentPubkeys,
  isSinglePanelView = false,
  item,
  onBack,
}: {
  agentPubkeys?: ReadonlySet<string>;
  isSinglePanelView?: boolean;
  item: InboxItem;
  onBack?: () => void;
}) {
  const navigate = useNavigate();
  const knownAgentPubkeys = useKnownAgentPubkeys();
  const authorPubkey = normalizePubkey(item.item.pubkey);
  const isAuthorAgent =
    knownAgentPubkeys.has(authorPubkey) ||
    agentPubkeys?.has(authorPubkey) === true;
  const taskId = taskIdFromExecutionInboxItem(item.item);
  const status = tagValue(item, "status");
  const title = tagValue(item, "task-title") ?? "Untitled task";
  const description = tagValue(item, "task-description");
  const failed = status === "failed";

  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-background"
      data-testid="task-execution-inbox-detail"
    >
      <TopChromeInsetHeader flush>
        <div className="flex min-h-9 items-center justify-between gap-3 px-5 py-2">
          <div className="flex min-w-0 items-center gap-1">
            {isSinglePanelView && onBack ? (
              <Button
                aria-label="Back to Inbox"
                className="rounded-full text-muted-foreground"
                onClick={onBack}
                size="icon"
                type="button"
                variant="ghost"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            ) : null}
            <CheckSquare2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <h2 className="flex min-w-0 items-center gap-2 text-sm leading-5">
              <span className="shrink-0 text-muted-foreground">
                Task result
              </span>
              <span className="text-muted-foreground/60">·</span>
              <span
                className="truncate font-semibold tracking-tight"
                title={title}
              >
                {title}
              </span>
            </h2>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Open task"
                className="shrink-0 rounded-full text-muted-foreground"
                disabled={!taskId}
                onClick={() => {
                  if (!taskId) return;
                  void navigate({
                    to: "/tasks",
                    search: { task: taskId },
                  } as never);
                }}
                size="icon"
                type="button"
                variant="ghost"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open task</TooltipContent>
          </Tooltip>
        </div>
      </TopChromeInsetHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <div>
            <div className="flex items-center gap-2">
              <UserAvatar
                avatarUrl={item.avatarUrl}
                displayName={item.senderLabel}
                size="sm"
              />
              <p className="min-w-0 text-sm">
                <span className="font-semibold">{item.senderLabel}</span>{" "}
                <span className="text-muted-foreground">
                  {failed
                    ? "could not complete this task"
                    : "completed this task"}
                </span>{" "}
                <span className="text-xs text-muted-foreground/70">
                  {item.fullTimestampLabel}
                </span>
              </p>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                {failed ? (
                  <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                {label(tagValue(item, "task-status"))}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Flag className="h-3.5 w-3.5" />
                {label(tagValue(item, "task-priority"))} priority
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                {dueDate(tagValue(item, "task-due"))}
              </span>
            </div>
          </div>

          {description ? (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground">
                Description
              </h3>
              <Markdown
                className="mt-1 text-sm leading-relaxed text-foreground"
                content={description}
                interactive={false}
              />
            </div>
          ) : null}

          <div className={failed ? "text-destructive" : undefined}>
            <h3 className="text-sm font-semibold">
              {failed ? "Failure details" : "Execution result"}
            </h3>
            <Markdown
              className="mt-2 text-base leading-relaxed text-inherit"
              content={item.item.content}
              enableLocalMarkdownPaths={isAuthorAgent}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
