import { useTaskHistory } from "../hooks";
import { truncatePubkey } from "@/shared/lib/pubkey";

export function TaskHistory({ taskId }: { taskId: string }) {
  const history = useTaskHistory(taskId);
  return (
    <section aria-labelledby="task-history-heading">
      <h3 className="text-sm font-semibold" id="task-history-heading">
        Change history
      </h3>
      {history.isLoading ? (
        <p className="mt-2 text-xs text-muted-foreground">Loading history…</p>
      ) : history.isError ? (
        <p className="mt-2 text-xs text-destructive">
          History couldn&apos;t be loaded.
        </p>
      ) : (
        <ol className="mt-2 space-y-3 border-l border-border pl-3">
          {history.data?.map((entry) => (
            <li className="text-xs" key={entry.id}>
              <p className="font-medium capitalize">Task {entry.action}</p>
              <p className="text-muted-foreground">
                {truncatePubkey(entry.actor)} ·{" "}
                {new Date(entry.createdAt * 1000).toLocaleString()}
              </p>
              <p className="mt-1 text-muted-foreground">
                {entry.changes.join(" · ")}
              </p>
            </li>
          ))}
          {history.data?.length === 0 ? (
            <li className="text-xs text-muted-foreground">
              No recorded changes.
            </li>
          ) : null}
        </ol>
      )}
    </section>
  );
}
