import { useRouter } from "@tanstack/react-router";
import {
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { WebAppSidebar } from "@/features/sidebar/WebAppSidebar";
import { cn } from "@/shared/lib/cn";

type DesktopParityAppShellProps = {
  children: ReactNode;
  sidebar?: (collapsed: boolean) => ReactNode;
};

export function DesktopParityAppShell({
  children,
  sidebar,
}: DesktopParityAppShellProps) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
          <ChromeButton
            label="Toggle Sidebar"
            onClick={() => setSidebarOpen((open) => !open)}
          >
            {sidebarOpen ? (
              <PanelLeftClose aria-hidden="true" className="size-4" />
            ) : (
              <PanelLeftOpen aria-hidden="true" className="size-4" />
            )}
          </ChromeButton>
          <ChromeButton
            label="Go back"
            narrow
            onClick={() => router.history.back()}
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </ChromeButton>
          <ChromeButton
            label="Go forward"
            narrow
            onClick={() => router.history.forward()}
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </ChromeButton>
        </div>
        <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-xs font-medium text-sidebar-foreground/55">
          Buzz
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {sidebar?.(!sidebarOpen) ?? <WebAppSidebar collapsed={!sidebarOpen} />}

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
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  narrow?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        "flex h-7 items-center justify-center rounded text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground disabled:opacity-40",
        narrow ? "w-6" : "w-7",
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
