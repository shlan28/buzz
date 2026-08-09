import { useNavigate } from "@tanstack/react-router";
import {
  Hash,
  LoaderCircle,
  MessageSquare,
  Search,
  User,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { WorkConsoleData } from "@/shared/api/communitySession";
import { ProfileAvatar } from "@/shared/ui/ProfileAvatar";
import { profileLabel } from "@/features/profile/eventCodec";
import {
  MIN_RELAY_SEARCH_LENGTH,
  normalizeSearchQuery,
  searchLocalEntities,
  searchRelayMessages,
} from "./searchSession";
import type { WebSearchResult, WebSearchState } from "./types";

type WebGlobalSearchProps = {
  data: WorkConsoleData;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

export function WebGlobalSearch({
  data,
  onOpenChange,
  open,
}: WebGlobalSearchProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const localResults = useMemo(
    () =>
      searchLocalEntities(
        query,
        data.channels,
        data.profilesByPubkey,
        data.userPubkey,
      ),
    [data, query],
  );
  const [state, setState] = useState<WebSearchState>({
    status: "idle",
    results: [],
  });
  const results = [...localResults, ...state.results];

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const normalized = normalizeSearchQuery(query);
    const requestId = ++requestIdRef.current;
    if (normalized.length < MIN_RELAY_SEARCH_LENGTH) {
      setState({ status: "idle", results: [] });
      return;
    }
    setState((current) => ({ status: "loading", results: current.results }));
    const timer = window.setTimeout(() => {
      void searchRelayMessages(
        normalized,
        data.channels.map((channel) => channel.id),
      )
        .then((messages) => {
          if (requestId !== requestIdRef.current) return;
          setState({
            status: "ready",
            results: messages.map((message) => ({ kind: "message", message })),
          });
        })
        .catch((error: unknown) => {
          if (requestId !== requestIdRef.current) return;
          setState({
            status: "error",
            results: [],
            message: error instanceof Error ? error.message : "Search failed.",
          });
        });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [data.channels, open, query]);

  useEffect(() => {
    setSelectedIndex((current) =>
      results.length ? Math.min(current, results.length - 1) : 0,
    );
  }, [results.length]);

  if (!open) return null;

  const openResult = (result: WebSearchResult) => {
    onOpenChange(false);
    setQuery("");
    if (result.kind === "message") {
      void navigate({
        to: "/app/channels/$channelId",
        params: { channelId: result.message.channelId },
        search: { message: result.message.id },
      });
      return;
    }
    if (result.kind === "channel") {
      void navigate({
        to: "/app/channels/$channelId",
        params: { channelId: result.channel.id },
      });
      return;
    }
    const destination =
      data.channels.find(
        (channel) =>
          channel.channelType === "dm" &&
          channel.participantPubkeys.some(
            (pubkey) => pubkey.toLowerCase() === result.profile.pubkey,
          ),
      ) ??
      data.channels.find((channel) =>
        channel.participantPubkeys.some(
          (pubkey) => pubkey.toLowerCase() === result.profile.pubkey,
        ),
      );
    if (destination) {
      void navigate({
        to: "/app/channels/$channelId",
        params: { channelId: destination.id },
      });
    }
  };

  return (
    <div
      aria-label="Search Buzz"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/35 px-4 pt-[10vh] backdrop-blur-[2px]"
      data-testid="global-search-dialog"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onOpenChange(false);
      }}
      role="dialog"
    >
      <div className="flex max-h-[min(680px,78vh)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
          <Search className="size-5 text-muted-foreground" />
          <input
            aria-label="Search messages, channels, and people"
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            maxLength={160}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") onOpenChange(false);
              if (event.key === "ArrowDown" && results.length) {
                event.preventDefault();
                setSelectedIndex((value) =>
                  Math.min(value + 1, results.length - 1),
                );
              }
              if (event.key === "ArrowUp" && results.length) {
                event.preventDefault();
                setSelectedIndex((value) => Math.max(value - 1, 0));
              }
              if (event.key === "Enter" && results[selectedIndex]) {
                event.preventDefault();
                openResult(results[selectedIndex]);
              }
            }}
            placeholder="Search messages, channels, and people"
            ref={inputRef}
            value={query}
          />
          {state.status === "loading" ? (
            <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
          ) : null}
          <button
            aria-label="Close search"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => onOpenChange(false)}
            type="button"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-32 overflow-y-auto p-2" role="listbox">
          {!query.trim() ? (
            <SearchHint />
          ) : results.length ? (
            <SearchResultSections
              data={data}
              onOpen={openResult}
              results={results}
              selectedIndex={selectedIndex}
              setSelectedIndex={setSelectedIndex}
            />
          ) : state.status === "loading" ? (
            <SearchStatus label="Searching Buzz…" />
          ) : state.status === "error" ? (
            <SearchStatus label={state.message} />
          ) : (
            <SearchStatus label={`No results for “${query.trim()}”`} />
          )}
        </div>
        <div className="flex shrink-0 items-center gap-4 border-t border-border px-4 py-2 text-2xs text-muted-foreground">
          <span>↑↓ Select</span>
          <span>↵ Open</span>
          <span>Esc Close</span>
        </div>
      </div>
    </div>
  );
}

function SearchResultSections({
  data,
  onOpen,
  results,
  selectedIndex,
  setSelectedIndex,
}: {
  data: WorkConsoleData;
  onOpen: (result: WebSearchResult) => void;
  results: WebSearchResult[];
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
}) {
  let flatIndex = -1;
  return (
    <>
      {(["channel", "person", "message"] as const).map((kind) => {
        const section = results.filter((result) => result.kind === kind);
        if (!section.length) return null;
        return (
          <section className="pb-2" key={kind}>
            <h2 className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              {kind === "channel"
                ? "Channels"
                : kind === "person"
                  ? "People"
                  : "Messages"}
            </h2>
            {section.map((result) => {
              flatIndex += 1;
              const index = flatIndex;
              return (
                <SearchResultRow
                  data={data}
                  key={searchResultKey(result)}
                  onClick={() => onOpen(result)}
                  onFocus={() => setSelectedIndex(index)}
                  result={result}
                  selected={selectedIndex === index}
                />
              );
            })}
          </section>
        );
      })}
    </>
  );
}

function SearchResultRow({
  data,
  onClick,
  onFocus,
  result,
  selected,
}: {
  data: WorkConsoleData;
  onClick: () => void;
  onFocus: () => void;
  result: WebSearchResult;
  selected: boolean;
}) {
  const profile =
    result.kind === "person"
      ? result.profile
      : result.kind === "message"
        ? data.profilesByPubkey[result.message.author.toLowerCase()]
        : undefined;
  const title =
    result.kind === "channel"
      ? result.channel.displayName
      : result.kind === "person"
        ? profileLabel(result.profile, result.profile.pubkey)
        : profileLabel(profile, result.message.author);
  const channel =
    result.kind === "message"
      ? data.channels.find((item) => item.id === result.message.channelId)
      : undefined;
  return (
    <button
      aria-selected={selected}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ${
        selected ? "bg-muted text-foreground" : "hover:bg-muted/60"
      }`}
      onClick={onClick}
      onFocus={onFocus}
      role="option"
      type="button"
    >
      {result.kind === "channel" ? (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground">
          <Hash className="size-4" />
        </span>
      ) : (
        <ProfileAvatar
          avatarUrl={profile?.avatarUrl}
          className="size-8"
          isAgent={profile?.isAgent}
          label={title}
        />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold">{title}</span>
          {result.kind === "message" && channel ? (
            <span className="truncate text-2xs text-muted-foreground">
              {channel.channelType === "dm" ? "DM" : "#"}
              {channel.displayName}
            </span>
          ) : null}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {result.kind === "channel"
            ? result.channel.about ||
              (result.channel.channelType === "dm"
                ? "Direct message"
                : "Channel")
            : result.kind === "person"
              ? result.profile.isAgent
                ? "Agent"
                : result.profile.nip05Handle || "Member"
              : result.message.content.replace(/\s+/g, " ")}
        </span>
      </span>
      {result.kind === "message" ? (
        <time className="shrink-0 text-2xs text-muted-foreground">
          {new Date(result.message.createdAt * 1000).toLocaleDateString()}
        </time>
      ) : result.kind === "person" ? (
        <User className="size-4 shrink-0 text-muted-foreground" />
      ) : (
        <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
      )}
    </button>
  );
}

function SearchHint() {
  return (
    <div className="grid min-h-40 place-items-center px-6 text-center">
      <div>
        <Search className="mx-auto mb-3 size-7 text-muted-foreground" />
        <p className="text-sm font-medium">Search across Buzz</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Find conversations, people, agents, and message history.
        </p>
      </div>
    </div>
  );
}

function SearchStatus({ label }: { label: string }) {
  return (
    <div className="grid min-h-40 place-items-center px-6 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function searchResultKey(result: WebSearchResult) {
  if (result.kind === "channel") return `channel:${result.channel.id}`;
  if (result.kind === "person") return `person:${result.profile.pubkey}`;
  return `message:${result.message.id}`;
}
