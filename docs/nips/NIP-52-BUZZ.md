# NIP-52 Buzz Relay Profile

Updated: 2026-08-01

Update note: defines owner-aware visibility for agent-authored events and keeps calendar access independent from an agent's conversation audience.

## Product behavior

Buzz stores calendar events as signed Nostr events in the community relay. A
user-authored event is readable only by that user. An agent-authored event is
readable by the signing agent and the agent's registered owner. The agent keeps
its own signature and manages its own replacements; it cannot replace a user's
signed event, and the owner cannot publish a replacement that impersonates the
agent.

The agent owner comes from the relay's authenticated owner-agent relationship
(`agent_owner_pubkey`), not from a client-supplied calendar tag. Built-in or
shared persona templates do not make a running agent ownerless or public.

The first release supports date events (`31922`), time events (`31923`),
calendar collections (`31924`), and protocol-valid RSVP storage (`31925`). It
does not implement recurring events, rooms, appointment booking, or external
calendar synchronization.

## Relay profile

- All four kinds are NIP-33 parameterized replaceable events and require one
  non-empty `d` tag.
- Writes require `users:write` and are community-global (`channel_id = NULL`).
  Buzz rejects an `h` tag rather than silently treating it as calendar scope.
- REQ, COUNT, mixed-kind, id queries, and live fan-out apply a per-event result
  gate: allow the event author, and for agent-authored events also allow the
  registered owner. Queries by an owner may therefore return both the owner's
  events and events authored by that owner's agents without exposing either to
  unrelated community members.
- Calendar events are excluded from full-text search at the storage layer.
- Date-event `end` is exclusive. If omitted, storage projects the occurrence as
  `[start, start + one day)`.
- Time-event `end` is exclusive. If omitted, storage uses a one-second range so
  an instantaneous event can participate in overlap queries.
- Time events require at least one `D` tag matching `floor(start / 86400)`.

## Occurrence projection

`events.calendar_start` and `events.calendar_end` are Unix-second bounds derived
from public NIP-52 tags. They are an index only; clients still receive the
original signed event. Database queries use half-open overlap semantics:

```text
calendar_start < requested_to AND calendar_end > requested_from
```

The standard NIP-01 filter has no occurrence-range fields. Buzz does not
reinterpret exact-match `#start` or `#D` tags as ranges. Until a transport-level
filter extension is introduced, callers must page author-scoped kinds and
filter occurrences locally; the database API already exposes the range bounds
for a future shared REQ/HTTP/COUNT integration.

## Privacy boundary

Owner-aware privacy is relay access control, not end-to-end encryption. Relay
operators can inspect titles, times, locations, participants, and content stored
in PostgreSQL. A future encrypted calendar profile would be a separate protocol
because encryption prevents the relay from indexing occurrence time unless
some scheduling metadata remains public.

An agent's inbound conversation policy is not a calendar authorization source.
`owner-only`, `allowlist`, and `anyone` control whose channel messages the agent
may process; none of them expands calendar visibility. Sharing a calendar event
with participants or a channel requires a separate explicit grant in a future
profile.
