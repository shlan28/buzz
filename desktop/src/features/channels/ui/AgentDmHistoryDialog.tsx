import * as React from "react";
import { Search } from "lucide-react";

import {
  defaultAgentDmHistoryInputs,
  normalizeHistoryKeyword,
  parseAgentDmHistoryRange,
} from "@/features/channels/lib/agentDmHistory";
import {
  type AgentDmHistoryRequest,
  useAgentDmHistoryQuery,
} from "@/features/messages/useAgentDmHistoryQuery";
import { normalizePubkey, truncatePubkey } from "@/shared/lib/pubkey";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { UserAvatar } from "@/shared/ui/UserAvatar";

type AgentDmHistoryDialogProps = {
  agentAvatarUrl: string | null;
  agentName: string;
  agentPubkey: string;
  channelId: string;
  currentAvatarUrl: string | null;
  currentDisplayName: string;
  currentPubkey: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

function formatMessageTime(createdAt: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(createdAt * 1_000));
}

function HighlightedContent({
  content,
  keyword,
}: {
  content: string;
  keyword: string;
}) {
  if (!keyword) return content;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = content.split(new RegExp(`(${escaped})`, "gi"));
  let offset = 0;
  return parts.map((part) => {
    const key = `${offset}:${part}`;
    offset += part.length;
    return part.toLocaleLowerCase() === keyword.toLocaleLowerCase() ? (
      <mark
        className="rounded-sm bg-yellow-200/70 px-0.5 text-inherit dark:bg-yellow-700/45"
        key={key}
      >
        {part}
      </mark>
    ) : (
      <React.Fragment key={key}>{part}</React.Fragment>
    );
  });
}

export function AgentDmHistoryDialog({
  agentAvatarUrl,
  agentName,
  agentPubkey,
  channelId,
  currentAvatarUrl,
  currentDisplayName,
  currentPubkey,
  onOpenChange,
  open,
}: AgentDmHistoryDialogProps) {
  const defaults = React.useMemo(() => defaultAgentDmHistoryInputs(), []);
  const [start, setStart] = React.useState(defaults.start);
  const [end, setEnd] = React.useState(defaults.end);
  const [keyword, setKeyword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [request, setRequest] = React.useState<AgentDmHistoryRequest | null>(
    null,
  );
  const historyQuery = useAgentDmHistoryQuery(request);

  React.useEffect(() => {
    if (!open) return;
    const next = defaultAgentDmHistoryInputs();
    setStart(next.start);
    setEnd(next.end);
    setKeyword("");
    setError(null);
    setRequest(null);
  }, [open]);

  function submit() {
    const parsed = parseAgentDmHistoryRange(start, end);
    if (!parsed.range) {
      setError(parsed.error);
      return;
    }
    setError(null);
    setRequest({
      channelId,
      since: parsed.range.since,
      until: parsed.range.until,
      keyword: normalizeHistoryKeyword(keyword),
    });
  }

  function reset() {
    const next = defaultAgentDmHistoryInputs();
    setStart(next.start);
    setEnd(next.end);
    setKeyword("");
    setError(null);
    setRequest(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="grid h-[84vh] w-[min(70rem,calc(100vw-5rem))] max-w-none grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0"
        data-testid="agent-dm-history-dialog"
      >
        <DialogHeader className="border-b px-6 py-5 pr-14">
          <div className="flex items-center gap-2">
            <DialogTitle>查看历史消息</DialogTitle>
            <span className="rounded-md border bg-muted/40 px-2 py-0.5 text-2xs text-muted-foreground">
              只读历史
            </span>
          </div>
          <DialogDescription>
            按时间范围查看与 {agentName} 的历史对话，不会影响当前会话。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 border-b bg-muted/15 px-6 py-4">
          <div className="grid grid-cols-1 items-center gap-2 lg:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_auto]">
            <label
              className="text-sm font-medium"
              htmlFor="agent-history-start"
            >
              开始时间
            </label>
            <Input
              id="agent-history-start"
              type="datetime-local"
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
            <label className="text-sm font-medium" htmlFor="agent-history-end">
              截止时间
            </label>
            <Input
              id="agent-history-end"
              type="datetime-local"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
            <Button disabled={historyQuery.isFetching} onClick={submit}>
              {historyQuery.isFetching
                ? "查询中…"
                : keyword.trim()
                  ? "搜索"
                  : "查看"}
            </Button>
            <Button onClick={reset} variant="ghost">
              重置
            </Button>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="搜索历史消息内容"
              className="pl-9"
              onChange={(event) => setKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
              }}
              placeholder="搜索历史消息内容"
              value={keyword}
            />
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>

        <div
          className="min-h-0 overflow-y-auto px-6 py-4"
          data-testid="agent-dm-history-results"
        >
          {!request ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              选择时间范围后查看历史消息，也可以输入关键词搜索。
            </div>
          ) : historyQuery.isPending ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              正在加载历史消息…
            </div>
          ) : historyQuery.isError ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-sm">
              <p className="text-destructive">历史消息加载失败。</p>
              <Button
                onClick={() => void historyQuery.refetch()}
                size="sm"
                variant="outline"
              >
                重试
              </Button>
            </div>
          ) : historyQuery.data.events.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {request.keyword
                ? "没有找到相关消息。"
                : "该时间范围内没有消息。"}
            </div>
          ) : (
            <div>
              <p className="mb-3 text-sm font-medium">
                {request.keyword
                  ? `找到 ${historyQuery.data.found} 条相关消息`
                  : `${new Date(request.since * 1_000).toLocaleString()} — ${new Date(request.until * 1_000).toLocaleString()}`}
              </p>
              <div className="space-y-0.5">
                {historyQuery.data.events.map((event) => {
                  const fromAgent =
                    normalizePubkey(event.pubkey) ===
                    normalizePubkey(agentPubkey);
                  const fromCurrent =
                    normalizePubkey(event.pubkey) ===
                    normalizePubkey(currentPubkey);
                  const displayName = fromAgent
                    ? agentName
                    : fromCurrent
                      ? currentDisplayName
                      : truncatePubkey(event.pubkey);
                  const avatarUrl = fromAgent
                    ? agentAvatarUrl
                    : fromCurrent
                      ? currentAvatarUrl
                      : null;
                  return (
                    <article
                      className="group flex gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/35"
                      key={event.id}
                    >
                      <UserAvatar
                        avatarUrl={avatarUrl}
                        displayName={displayName}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-semibold">
                            {displayName}
                          </span>
                          <time className="text-2xs text-muted-foreground">
                            {formatMessageTime(event.created_at)}
                          </time>
                        </div>
                        <p className="whitespace-pre-wrap break-words text-base leading-6">
                          <HighlightedContent
                            content={event.content}
                            keyword={request.keyword}
                          />
                        </p>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t px-6 py-3">
          <p className="text-xs text-muted-foreground">
            {historyQuery.data
              ? `${historyQuery.data.found} 条${historyQuery.data.limited ? "（仅显示前一部分）" : ""}`
              : "历史结果不会影响当前会话"}
          </p>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            关闭
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
