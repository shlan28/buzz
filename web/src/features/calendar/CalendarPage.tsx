import { CalendarDays } from "lucide-react";
import { useWorkConsoleData } from "@/shared/hooks/useWorkConsoleData";
import { AsyncStateView } from "@/shared/ui/AsyncStateView";
import { DesktopParityAppShell } from "@/shared/ui/DesktopParityAppShell";

export function CalendarPage() {
  const { state, refresh } = useWorkConsoleData();
  const cells = Array.from({ length: 35 }, (_, index) => ({
    id: `calendar-cell-${index + 1}`,
    day: index < 31 ? index + 1 : undefined,
  }));
  return (
    <DesktopParityAppShell>
      {state.status !== "ready" ? (
        <AsyncStateView
          status={state.status}
          message={state.status === "error" ? state.message : undefined}
          onRetry={refresh}
        />
      ) : (
        <>
          <PageHeader
            icon={<CalendarDays className="size-4" />}
            title="Calendar"
          />
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_280px] max-[900px]:grid-cols-1">
            <section className="overflow-y-auto p-4">
              <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-border bg-border text-center">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                  (day) => (
                    <div
                      className="bg-muted p-2 text-2xs font-medium text-muted-foreground"
                      key={day}
                    >
                      {day}
                    </div>
                  ),
                )}
                {cells.map((cell) => (
                  <div
                    className="min-h-20 bg-background p-2 text-left text-xs"
                    key={cell.id}
                  >
                    {cell.day}
                  </div>
                ))}
              </div>
            </section>
            <aside className="overflow-y-auto border-l border-border/60 p-4 max-[900px]:border-l-0 max-[900px]:border-t">
              <h2 className="mb-3 text-sm font-semibold">Agenda</h2>
              <div className="space-y-2">
                {state.data.calendar.length ? (
                  state.data.calendar.map((item) => (
                    <article
                      className="rounded-lg border border-border p-3"
                      key={item.id}
                    >
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.start.toLocaleString()}
                      </p>
                      {item.location && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.location}
                        </p>
                      )}
                    </article>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No calendar events.
                  </p>
                )}
              </div>
            </aside>
          </div>
        </>
      )}
    </DesktopParityAppShell>
  );
}
function PageHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 px-4 text-sm font-semibold text-muted-foreground">
      {icon}
      <span className="text-foreground">{title}</span>
      <span className="ml-auto rounded bg-muted px-2 py-1 text-2xs font-normal">
        Read only
      </span>
    </header>
  );
}
