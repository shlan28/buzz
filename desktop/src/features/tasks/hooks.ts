import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useManagedAgentsQuery,
  useRelayAgentsQuery,
} from "@/features/agents/hooks";
import { useRelayMembersQuery } from "@/features/community-members/hooks";
import { useRelaySelfQuery } from "@/features/moderation/hooks";
import { useIdentityQuery } from "@/shared/api/hooks";
import { useUsersBatchQuery } from "@/features/profile/hooks";
import { relayClient } from "@/shared/api/relayClient";
import { signRelayEvent } from "@/shared/api/tauri";
import type { RelayEvent } from "@/shared/api/types";
import {
  KIND_TASK_CREATE,
  KIND_TASK_MUTATE,
  KIND_TASK_STATE,
} from "@/shared/constants/kinds";
import {
  buildCreateTaskEvent,
  buildMutateTaskEvent,
  assertTaskAssigneeTags,
  parseTaskState,
  parseTaskHistoryEvent,
} from "./lib/taskEvents";
import { buildTaskAssignees } from "./lib/taskAssignees";
import type {
  Task,
  TaskAssignee,
  TaskDraft,
  TaskHistoryEntry,
  TaskPatch,
} from "./types";

export const tasksQueryKey = ["tasks"] as const;

async function fetchTasks(relaySelfPubkey: string): Promise<Task[]> {
  const pageSize = 500;
  const byId = new Map<string, Task>();
  let until: number | undefined;
  for (;;) {
    const events = await relayClient.fetchEvents({
      kinds: [KIND_TASK_STATE],
      limit: pageSize,
      ...(until === undefined ? {} : { until }),
    });
    for (const event of events) {
      const task = parseTaskState(event, relaySelfPubkey);
      if (!task) continue;
      const current = byId.get(task.id);
      if (!current || current.updatedAt < task.updatedAt)
        byId.set(task.id, task);
    }
    if (events.length < pageSize) break;
    until = Math.min(...events.map((event) => event.created_at)) - 1;
  }
  return [...byId.values()];
}

async function publishCommand(
  input: {
    kind: number;
    content: string;
    tags: string[][];
  },
  expectedAssignee?: string | null,
) {
  assertTaskAssigneeTags(input.tags, expectedAssignee);
  const event = await signRelayEvent(input);
  assertTaskAssigneeTags(event.tags, expectedAssignee);
  return relayClient.publishEvent(
    event,
    "Timed out saving task.",
    "Failed to save task.",
  );
}

export function useTasks() {
  const queryClient = useQueryClient();
  const identity = useIdentityQuery();
  const relaySelf = useRelaySelfQuery();
  const members = useRelayMembersQuery();
  const managedAgents = useManagedAgentsQuery();
  const relayAgents = useRelayAgentsQuery();
  const memberPubkeys = React.useMemo(
    () => (members.data ?? []).map((member) => member.pubkey),
    [members.data],
  );
  const profiles = useUsersBatchQuery(memberPubkeys);
  const query = useQuery({
    enabled: Boolean(relaySelf.data),
    queryKey: [...tasksQueryKey, relaySelf.data ?? null],
    queryFn: () => fetchTasks(relaySelf.data ?? ""),
  });

  React.useEffect(() => {
    let disposed = false;
    let dispose: (() => void) | undefined;
    void relayClient
      .subscribeLive(
        { kinds: [KIND_TASK_STATE], limit: 0 },
        (event: RelayEvent) => {
          void queryClient.invalidateQueries({ queryKey: tasksQueryKey });
          const taskId = event.tags.find((tag) => tag[0] === "d")?.[1];
          if (taskId)
            void queryClient.invalidateQueries({
              queryKey: ["task-history", taskId],
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
  }, [queryClient]);

  const assignees = React.useMemo<TaskAssignee[]>(() => {
    return buildTaskAssignees({
      members: members.data ?? [],
      profiles: profiles.data?.profiles ?? {},
      managedAgents: managedAgents.data ?? [],
      relayAgents: relayAgents.data ?? [],
      viewerPubkey: identity.data?.pubkey,
    });
  }, [
    identity.data?.pubkey,
    managedAgents.data,
    members.data,
    profiles.data?.profiles,
    relayAgents.data,
  ]);

  const create = useMutation({
    mutationFn: (draft: TaskDraft) =>
      publishCommand(buildCreateTaskEvent(draft), draft.assignee ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tasksQueryKey }),
  });
  const update = useMutation({
    mutationFn: ({ task, patch }: { task: Task; patch: TaskPatch }) =>
      publishCommand(buildMutateTaskEvent(task, patch), patch.assignee),
    onMutate: async ({ task, patch }) => {
      await queryClient.cancelQueries({ queryKey: tasksQueryKey });
      const snapshots = queryClient.getQueriesData<Task[]>({
        queryKey: tasksQueryKey,
      });
      queryClient.setQueriesData<Task[]>({ queryKey: tasksQueryKey }, (old) =>
        old?.map((item) =>
          item.id === task.id ? { ...item, ...patch } : item,
        ),
      );
      return { snapshots };
    },
    onError: (_error, _variables, context) => {
      for (const [key, value] of context?.snapshots ?? [])
        queryClient.setQueryData(key, value);
    },
    onSettled: (_data, _error, { task }) => {
      void queryClient.invalidateQueries({ queryKey: tasksQueryKey });
      void queryClient.invalidateQueries({
        queryKey: ["task-history", task.id],
      });
    },
  });

  return {
    ...query,
    tasks: query.data ?? [],
    assignees,
    currentPubkey: identity.data?.pubkey,
    create,
    update,
  };
}

export function useTaskHistory(taskId: string) {
  return useQuery<TaskHistoryEntry[]>({
    queryKey: ["task-history", taskId],
    queryFn: async () => {
      const events: RelayEvent[] = [];
      let until: number | undefined;
      for (;;) {
        const page = await relayClient.fetchEvents({
          kinds: [KIND_TASK_CREATE, KIND_TASK_MUTATE],
          "#t": [`task-id:${taskId}`],
          limit: 500,
          ...(until === undefined ? {} : { until }),
        });
        events.push(...page);
        if (page.length < 500) break;
        until = Math.min(...page.map((event) => event.created_at)) - 1;
      }
      return events
        .map((event) => parseTaskHistoryEvent(event, taskId))
        .filter((entry): entry is TaskHistoryEntry => entry !== null)
        .sort((a, b) => b.createdAt - a.createdAt);
    },
  });
}
