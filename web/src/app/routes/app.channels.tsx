import { createFileRoute } from "@tanstack/react-router";
import { Hash, MoreHorizontal, Search } from "lucide-react";

import { DesktopParityAppShell } from "@/shared/ui/DesktopParityAppShell";

export const Route = createFileRoute("/app/channels")({
  component: ChannelsShellPreview,
});

function ChannelsShellPreview() {
  return (
    <DesktopParityAppShell>
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/60 px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Hash aria-hidden="true" className="size-4 text-muted-foreground" />
          <h1 className="truncate text-sm font-semibold">Channels</h1>
        </div>
        <div className="flex items-center gap-1">
          <button
            aria-label="Search"
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            type="button"
          >
            <Search aria-hidden="true" className="size-4" />
          </button>
          <button
            aria-label="More options"
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            type="button"
          >
            <MoreHorizontal aria-hidden="true" className="size-4" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
            <div className="max-w-sm">
              <div className="mx-auto mb-4 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Hash aria-hidden="true" className="size-5" />
              </div>
              <h2 className="text-base font-semibold">
                Connect your paired Mac
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Pairing and Relay data will appear here. This shell already uses
                the Desktop visual system; no identity secret is stored in the
                browser.
              </p>
            </div>
          </div>
        </section>
      </div>
    </DesktopParityAppShell>
  );
}
