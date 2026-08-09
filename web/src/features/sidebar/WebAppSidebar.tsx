import { Link, useRouterState } from "@tanstack/react-router";
import {
  CalendarDays,
  Hash,
  Inbox,
  Lock,
  ListTodo,
  Route,
  Search,
  Settings,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useWorkConsoleData } from "@/shared/hooks/useWorkConsoleData";
import { cn } from "@/shared/lib/cn";
import { profileLabel } from "@/features/profile/eventCodec";
import type { ProfileLookup } from "@/features/profile/types";
import { ProfileAvatar } from "@/shared/ui/ProfileAvatar";
import { WebGlobalSearch } from "@/features/search/WebGlobalSearch";

const primary = [
  { href: "/app/inbox", icon: Inbox, label: "Inbox" },
  { href: "/app/calendar", icon: CalendarDays, label: "Calendar" },
  { href: "/app/tasks", icon: ListTodo, label: "Tasks" },
  { href: "/app/tracks", icon: Route, label: "Tracks" },
] as const;

export function WebAppSidebar({ collapsed = false }: { collapsed?: boolean }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const { state } = useWorkConsoleData();
  const channels = state.status === "ready" ? state.data.channels : [];
  const currentProfile =
    state.status === "ready" ? state.data.currentProfile : undefined;
  const currentPubkey = state.status === "ready" ? state.data.userPubkey : "";
  const userLabel = profileLabel(currentProfile, currentPubkey || "Buzz");
  const dms = channels.filter((channel) => channel.channelType === "dm");
  const publicChannels = channels.filter(
    (channel) => channel.channelType !== "dm",
  );
  useEffect(() => {
    const openFromShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", openFromShortcut);
    return () => window.removeEventListener("keydown", openFromShortcut);
  }, []);

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col bg-transparent text-sidebar-foreground max-[699px]:w-12",
        collapsed ? "w-12" : "w-[300px]",
      )}
      data-testid="app-sidebar"
    >
      <div
        className={cn("mx-[3px] shrink-0 px-2 pb-2 pt-3", collapsed && "px-1")}
      >
        <button
          aria-label="Search Buzz"
          className={cn(
            "flex h-8 w-full items-center gap-2 rounded-md bg-black/5 px-2 text-sidebar-foreground/55 transition-colors hover:bg-black/10 hover:text-sidebar-foreground dark:bg-white/5 dark:hover:bg-white/10",
            collapsed && "justify-center px-0",
          )}
          onClick={() => setSearchOpen(true)}
          type="button"
        >
          <Search aria-hidden="true" className="size-4" />
          <span
            className={cn(
              "text-sm max-[699px]:sr-only",
              collapsed && "sr-only",
            )}
          >
            Search
          </span>
          <kbd
            className={cn(
              "ml-auto text-2xs opacity-60 max-[699px]:hidden",
              collapsed && "hidden",
            )}
          >
            ⌘K
          </kbd>
        </button>
      </div>

      {state.status === "ready" ? (
        <WebGlobalSearch
          data={state.data}
          onOpenChange={setSearchOpen}
          open={searchOpen}
        />
      ) : null}

      <nav
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-2"
        aria-label="Main navigation"
      >
        <div className="space-y-0.5 pb-2">
          {primary.map(({ href, icon: Icon, label }) => (
            <Link
              aria-current={pathname.startsWith(href) ? "page" : undefined}
              className={rowClass(pathname.startsWith(href))}
              key={href}
              to={href}
            >
              <Icon className="size-4 shrink-0" />
              <span
                className={cn(
                  "truncate max-[699px]:sr-only",
                  collapsed && "sr-only",
                )}
              >
                {label}
              </span>
            </Link>
          ))}
        </div>

        <SidebarGroup collapsed={collapsed} label="Direct Messages">
          {dms.map((channel) => (
            <ChannelLink
              channel={channel}
              key={channel.id}
              pathname={pathname}
              collapsed={collapsed}
              currentPubkey={currentPubkey}
              profiles={
                state.status === "ready" ? state.data.profilesByPubkey : {}
              }
            />
          ))}
          {!dms.length && !collapsed && <EmptyRow label="No direct messages" />}
        </SidebarGroup>

        <SidebarGroup collapsed={collapsed} label="Channels">
          {publicChannels.map((channel) => (
            <ChannelLink
              channel={channel}
              key={channel.id}
              pathname={pathname}
              collapsed={collapsed}
              currentPubkey={currentPubkey}
              profiles={
                state.status === "ready" ? state.data.profilesByPubkey : {}
              }
            />
          ))}
          {!publicChannels.length && !collapsed && (
            <EmptyRow label="No channels" />
          )}
        </SidebarGroup>
      </nav>

      <div className="p-2">
        <Link
          className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 py-2 text-sidebar-foreground transition-colors hover:bg-sidebar-border/35 max-[699px]:justify-center"
          data-testid="open-settings"
          to="/app/settings"
        >
          <ProfileAvatar
            avatarUrl={currentProfile?.avatarUrl}
            className="size-8"
            isAgent={currentProfile?.isAgent}
            label={userLabel}
          />
          <span
            className={cn(
              "min-w-0 flex-1 max-[699px]:sr-only",
              collapsed && "sr-only",
            )}
          >
            <span className="block truncate text-sm font-semibold">
              {userLabel}
            </span>
            <span className="block truncate text-xs text-sidebar-foreground/60">
              Achoverse
            </span>
          </span>
          <Settings
            className={cn(
              "size-4 shrink-0 max-[699px]:hidden",
              collapsed && "hidden",
            )}
          />
        </Link>
      </div>
    </aside>
  );
}

function SidebarGroup({
  children,
  collapsed,
  label,
}: {
  children: ReactNode;
  collapsed: boolean;
  label: string;
}) {
  return (
    <section className="group/sidebar-section py-1">
      <h2
        className={cn(
          "px-2 pb-1 pt-2 text-2xs font-medium uppercase tracking-wider text-sidebar-foreground/45 max-[699px]:sr-only",
          collapsed && "sr-only",
        )}
      >
        {label}
      </h2>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

function ChannelLink({
  channel,
  collapsed,
  currentPubkey,
  pathname,
  profiles,
}: {
  channel: {
    id: string;
    name: string;
    channelType: "stream" | "forum" | "dm";
    visibility: "open" | "private";
    displayName: string;
    participantPubkeys: string[];
  };
  collapsed: boolean;
  currentPubkey: string;
  pathname: string;
  profiles: ProfileLookup;
}) {
  const href = `/app/channels/${channel.id}`;
  const otherParticipants = channel.participantPubkeys.filter(
    (pubkey) => pubkey.toLowerCase() !== currentPubkey.toLowerCase(),
  );
  const primaryParticipant = otherParticipants[0];
  const primaryProfile = primaryParticipant
    ? profiles[primaryParticipant.toLowerCase()]
    : undefined;
  const Icon = channel.visibility === "private" ? Lock : Hash;
  return (
    <Link
      className={rowClass(pathname === href)}
      params={{ channelId: channel.id }}
      to="/app/channels/$channelId"
    >
      {channel.channelType === "dm" ? (
        otherParticipants.length > 1 ? (
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-2xs font-semibold">
            {otherParticipants.length}
          </span>
        ) : (
          <ProfileAvatar
            avatarUrl={primaryProfile?.avatarUrl}
            className="size-6 bg-sidebar-accent text-2xs"
            isAgent={primaryProfile?.isAgent}
            label={channel.displayName}
            testId={`dm-avatar-${channel.id}`}
          />
        )
      ) : (
        <Icon className="size-4 shrink-0" />
      )}
      <span
        className={cn("truncate max-[699px]:sr-only", collapsed && "sr-only")}
      >
        {channel.displayName}
      </span>
    </Link>
  );
}

function EmptyRow({ label }: { label: string }) {
  return (
    <div className="px-2 py-1 text-xs text-sidebar-foreground/40 max-[699px]:hidden">
      {label}
    </div>
  );
}

function rowClass(active: boolean) {
  return cn(
    "flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors max-[699px]:justify-center",
    active
      ? "bg-sidebar-active text-sidebar-active-foreground"
      : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
  );
}
