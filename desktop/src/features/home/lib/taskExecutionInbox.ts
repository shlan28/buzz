import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  parseTaskExecutionState,
  parseTaskState,
} from "@/features/tasks/lib/taskEvents";
import type { Task, TaskExecution } from "@/features/tasks/types";
import { useOwnedAgentPubkeys } from "@/features/home/useOwnedAgentPubkeys";
import type { UserProfileLookup } from "@/features/profile/lib/identity";
import { useRelaySelfQuery } from "@/features/moderation/hooks";
import { relayClient } from "@/shared/api/relayClient";
import type { FeedItem, RelayEvent } from "@/shared/api/types";
import {
  KIND_TASK_EXECUTION_STATE,
  KIND_TASK_STATE,
} from "@/shared/constants/kinds";
import { normalizePubkey } from "@/shared/lib/pubkey";

const taskExecutionInboxKey = ["task-execution-inbox"] as const;

export function latestTaskExecutionStates(
  executions: readonly TaskExecution[],
): TaskExecution[] {
  const byExecution = new Map<string, TaskExecution>();
  for (const execution of executions) {
    const current = byExecution.get(execution.id);
    if (
      !current ||
      execution.updatedAt > current.updatedAt ||
      (execution.updatedAt === current.updatedAt &&
        execution.eventId.localeCompare(current.eventId) > 0)
    ) {
      byExecution.set(execution.id, execution);
    }
  }
  return [...byExecution.values()];
}

function taskTag(name: string, value: string | number | null) {
  return value === null || value === "" ? [] : [[name, String(value)]];
}

export function isTaskExecutionInboxItem(
  item: Pick<FeedItem, "kind" | "tags">,
) {
  return (
    item.kind === KIND_TASK_EXECUTION_STATE &&
    item.tags.some((tag) => tag[0] === "task-inbox" && tag[1] === "result")
  );
}

export function taskIdFromExecutionInboxItem(item: Pick<FeedItem, "tags">) {
  return (
    item.tags
      .find((tag) => tag[0] === "t" && tag[1]?.startsWith("task-id:"))?.[1]
      ?.slice("task-id:".length) ?? null
  );
}

export function buildTaskExecutionInboxItems({
  currentPubkey,
  executions,
  ownedAgentPubkeys,
  tasks,
}: {
  currentPubkey?: string;
  executions: readonly TaskExecution[];
  ownedAgentPubkeys: ReadonlySet<string>;
  tasks: readonly Task[];
}): FeedItem[] {
  const viewer = currentPubkey ? normalizePubkey(currentPubkey) : null;
  if (!viewer) return [];
  const tasksById = new Map(tasks.map((task) => [task.id, task]));

  return executions.flatMap((execution): FeedItem[] => {
    if (execution.status !== "finished" && execution.status !== "failed") {
      return [];
    }
    const assignee = normalizePubkey(execution.assignee);
    const requester = normalizePubkey(execution.requester);
    const owner = execution.owner ? normalizePubkey(execution.owner) : null;
    if (
      requester !== viewer &&
      owner !== viewer &&
      !(requester === assignee && ownedAgentPubkeys.has(assignee))
    ) {
      return [];
    }
    const task = tasksById.get(execution.taskId);
    if (!task) return [];

    return [
      {
        id: execution.eventId,
        kind: KIND_TASK_EXECUTION_STATE,
        pubkey: execution.assignee,
        content:
          execution.message.trim() ||
          (execution.status === "finished"
            ? "The Agent completed this task without a text summary."
            : "The Agent did not provide additional failure details."),
        createdAt: execution.updatedAt,
        channelId: null,
        channelName: "Tasks",
        tags: [
          ["task-inbox", "result"],
          ["d", execution.id],
          ["t", `task-id:${task.id}`],
          ["status", execution.status],
          ["requester", execution.requester],
          ["p", execution.assignee, "", "agent"],
          ["task-title", task.title],
          ["task-description", task.description],
          ["task-status", task.status],
          ["task-priority", task.priority],
          ...taskTag("task-due", task.dueDate),
        ],
        category: "agent_activity",
      },
    ];
  });
}

async function fetchTaskExecutionInboxState(relaySelfPubkey: string) {
  const [taskEvents, executionEvents] = await Promise.all([
    relayClient.fetchEvents({ kinds: [KIND_TASK_STATE], limit: 500 }),
    relayClient.fetchEvents({ kinds: [KIND_TASK_EXECUTION_STATE], limit: 500 }),
  ]);
  return {
    tasks: taskEvents.flatMap((event) => {
      const task = parseTaskState(event, relaySelfPubkey);
      return task ? [task] : [];
    }),
    executions: latestTaskExecutionStates(
      executionEvents.flatMap((event) => {
        const execution = parseTaskExecutionState(event, relaySelfPubkey);
        return execution ? [execution] : [];
      }),
    ),
  };
}

export function useTaskExecutionInboxItems({
  currentPubkey,
  ownedAgentPubkeys,
  relaySelfPubkey,
}: {
  currentPubkey?: string;
  ownedAgentPubkeys: ReadonlySet<string>;
  relaySelfPubkey?: string;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    enabled: Boolean(relaySelfPubkey && currentPubkey),
    queryKey: [...taskExecutionInboxKey, relaySelfPubkey ?? null],
    queryFn: () => fetchTaskExecutionInboxState(relaySelfPubkey ?? ""),
  });

  React.useEffect(() => {
    if (!relaySelfPubkey) return;
    let disposed = false;
    let dispose: (() => void) | undefined;
    void relayClient
      .subscribeLive(
        { kinds: [KIND_TASK_STATE, KIND_TASK_EXECUTION_STATE], limit: 0 },
        (_event: RelayEvent) => {
          void queryClient.invalidateQueries({
            queryKey: taskExecutionInboxKey,
          });
        },
      )
      .then((nextDispose) => {
        if (disposed) nextDispose();
        else dispose = nextDispose;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      dispose?.();
    };
  }, [queryClient, relaySelfPubkey]);

  return React.useMemo(
    () =>
      buildTaskExecutionInboxItems({
        currentPubkey,
        executions: query.data?.executions ?? [],
        ownedAgentPubkeys,
        tasks: query.data?.tasks ?? [],
      }),
    [currentPubkey, ownedAgentPubkeys, query.data],
  );
}

export function useCurrentUserTaskExecutionInboxItems(
  currentPubkey: string | undefined,
  profiles: UserProfileLookup | undefined,
) {
  const ownedAgentPubkeys = useOwnedAgentPubkeys(true, profiles, currentPubkey);
  const relaySelfPubkey = useRelaySelfQuery().data;
  return useTaskExecutionInboxItems({
    currentPubkey,
    ownedAgentPubkeys,
    relaySelfPubkey: relaySelfPubkey ?? undefined,
  });
}
