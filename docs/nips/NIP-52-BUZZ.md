# NIP-52 Buzz Relay Profile

Updated: 2026-08-01

Update note: documents the private, author-owned NIP-52 profile implemented by Buzz.

## Product behavior

Buzz stores calendar events as signed Nostr events in the community relay. They
are personal data by default: only the authenticated author can read their own
calendar events. An agent therefore creates and manages events under the
agent's own pubkey; it cannot replace a user's signed event.

The first release supports date events (`31922`), time events (`31923`),
calendar collections (`31924`), and protocol-valid RSVP storage (`31925`). It
does not implement recurring events, rooms, appointment booking, or external
calendar synchronization.

## Relay profile

- All four kinds are NIP-33 parameterized replaceable events and require one
  non-empty `d` tag.
- Writes require `users:write` and are community-global (`channel_id = NULL`).
  Buzz rejects an `h` tag rather than silently treating it as calendar scope.
- REQ and COUNT filters that exclusively select these kinds must specify
  `authors:[self]`. Mixed-kind and id queries apply the same author-only gate to
  each returned event. Live fan-out uses that result gate as well.
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

Author-only is relay access control, not end-to-end encryption. Relay operators
can inspect titles, times, locations, participants, and content stored in
PostgreSQL. A future encrypted calendar profile would be a separate protocol
because encryption prevents the relay from indexing occurrence time unless
some scheduling metadata remains public.
