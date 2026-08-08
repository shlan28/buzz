import { Link, useRouterState } from "@tanstack/react-router";
import {
  CalendarDays,
  CheckSquare2,
  ChevronLeft,
  ChevronRight,
  Hash,
  Inbox,
  PanelLeftClose,
  Search,
  Settings,
  Waypoints,
} from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/shared/lib/cn";

type DesktopParityAppShellProps = { children: ReactNode };

const destinations = [
  { href: "/app/channels", icon: Inbox, label: "Inbox" },
  { href: "/app/calendar", icon: CalendarDays, label: "Calendar" },
  { href: "/app/tasks", icon: CheckSquare2, label: "Tasks" },
  { href: "/app/tracks", icon: Waypoints, label: "Tracks" },
] as const;

export function DesktopParityAppShell({
  children,
}: DesktopParityAppShellProps) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return (
    <div
      className="buzz-theme-gradient-layer relative flex h-dvh min-h-0 w-full flex-col overflow-hidden text-foreground"
      data-testid="desktop-parity-app-shell"
    >
      <header
        className="relative flex h-10 shrink-0 items-center bg-transparent px-3 text-sidebar-foreground"
        data-testid="app-top-chrome"
      >
        <div className="flex items-center gap-0.5">
          <ChromeButton label="Toggle Sidebar">
            <PanelLeftClose aria-hidden="true" className="size-4" />
          </ChromeButton>
          <ChromeButton disabled label="Go back" narrow>
            <ChevronLeft aria-hidden="true" className="size-4" />
          </ChromeButton>
          <ChromeButton disabled label="Go forward" narrow>
            <ChevronRight aria-hidden="true" className="size-4" />
          </ChromeButton>
        </div>
        <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-xs font-medium text-sidebar-foreground/55">
          Buzz
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className="flex w-[300px] shrink-0 flex-col bg-transparent text-sidebar-foreground max-[699px]:w-12"
          data-testid="app-sidebar"
        >
          <div className="mx-[3px] shrink-0 px-2 pb-2 pt-3 max-[699px]:hidden">
            <div className="flex h-8 items-center gap-2 rounded-md bg-black/5 px-2 text-sidebar-foreground/55 dark:bg-white/5">
              <Search aria-hidden="true" className="size-4" />
              <span className="text-sm">Search</span>
            </div>
          </div>

          <nav
            aria-label="Main navigation"
            className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-2"
          >
            {destinations.map(({ href, icon: Icon, label }) => {
              const active =
                pathname === href || pathname.startsWith(`${href}/`);
              const disabled = href !== "/app/channels";
              const row = (
                <>
                  <Icon aria-hidden="true" className="size-4 shrink-0" />
                  <span className="truncate max-[699px]:sr-only">{label}</span>
                </>
              );
              return disabled ? (
                <div
                  aria-disabled="true"
                  className="flex h-8 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground/40 max-[699px]:justify-center"
                  key={href}
                  title={`${label} — coming next`}
                >
                  {row}
                </div>
              ) : (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors max-[699px]:justify-center",
                    active
                      ? "bg-sidebar-active text-sidebar-active-foreground"
                      : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                  key={href}
                  to={href}
                >
                  {row}
                </Link>
              );
            })}

            <div className="px-2 pb-1 pt-4 text-2xs font-medium uppercase tracking-wider text-sidebar-foreground/45 max-[699px]:sr-only">
              Channels
            </div>
            <div className="flex h-8 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground/65 max-[699px]:justify-center">
              <Hash aria-hidden="true" className="size-4 shrink-0" />
              <span className="truncate max-[699px]:sr-only">general</span>
            </div>
          </nav>

          <div className="p-2">
            <button
              className="flex h-10 w-full items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground max-[699px]:justify-center"
              type="button"
            >
              <Settings aria-hidden="true" className="size-4 shrink-0" />
              <span className="flex min-w-0 flex-1 flex-col items-start max-[699px]:sr-only">
                <span className="truncate font-medium">Buzz User</span>
                <span className="truncate text-2xs text-sidebar-foreground/45">
                  Settings
                </span>
              </span>
            </button>
          </div>
        </aside>

        <main
          className="relative z-10 mb-2 ml-px mr-2 mt-px flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-background shadow-content-edge"
          data-buzz-content-surface
          data-testid="content-surface"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

function ChromeButton({
  children,
  disabled = false,
  label,
  narrow = false,
}: {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  narrow?: boolean;
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        "flex h-7 items-center justify-center rounded text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground disabled:opacity-40",
        narrow ? "w-6" : "w-7",
      )}
      disabled={disabled}
      type="button"
    >
      {children}
    </button>
  );
}
