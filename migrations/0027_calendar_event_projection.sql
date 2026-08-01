-- NIP-52 occurrence-time projection. Calendar occurrence time is independent
-- from Nostr created_at, so range views need dedicated indexed bounds.
ALTER TABLE events
    ADD COLUMN calendar_start BIGINT,
    ADD COLUMN calendar_end BIGINT;

WITH projected AS (
    SELECT community_id, created_at, id, kind,
           (SELECT tag->>1 FROM jsonb_array_elements(tags) tag
             WHERE tag->>0 = 'start' LIMIT 1) AS start_value,
           (SELECT tag->>1 FROM jsonb_array_elements(tags) tag
             WHERE tag->>0 = 'end' LIMIT 1) AS end_value
      FROM events
     WHERE kind IN (31922, 31923)
), valid AS (
    SELECT *,
        CASE
          WHEN kind = 31923 AND start_value ~ '^[0-9]+$'
            THEN start_value::BIGINT
          WHEN kind = 31922 AND pg_input_is_valid(start_value, 'date')
            THEN EXTRACT(EPOCH FROM start_value::date)::BIGINT
        END AS projected_start,
        CASE
          WHEN kind = 31923 AND end_value ~ '^[0-9]+$'
            THEN end_value::BIGINT
          WHEN kind = 31923 AND start_value ~ '^[0-9]+$' AND end_value IS NULL
            THEN start_value::BIGINT + 1
          WHEN kind = 31922 AND pg_input_is_valid(end_value, 'date')
            THEN EXTRACT(EPOCH FROM end_value::date)::BIGINT
          WHEN kind = 31922 AND pg_input_is_valid(start_value, 'date') AND end_value IS NULL
            THEN EXTRACT(EPOCH FROM (start_value::date + 1))::BIGINT
        END AS projected_end
      FROM projected
)
UPDATE events e
   SET calendar_start = v.projected_start,
       calendar_end = v.projected_end
  FROM valid v
 WHERE e.community_id = v.community_id
   AND e.created_at = v.created_at
   AND e.id = v.id
   AND v.projected_end > v.projected_start;

ALTER TABLE events ADD CONSTRAINT events_calendar_projection_pair
    CHECK ((calendar_start IS NULL) = (calendar_end IS NULL));
ALTER TABLE events ADD CONSTRAINT events_calendar_projection_order
    CHECK (calendar_start IS NULL OR calendar_end > calendar_start);

CREATE INDEX idx_events_calendar_occurrence
    ON events (community_id, pubkey, calendar_start, calendar_end)
    WHERE calendar_start IS NOT NULL AND deleted_at IS NULL;

-- Author-only events must never enter full-text search. Preserve the current
-- generated expression for every other kind (same brownfield-safe pattern as
-- migration 0014).
DO $$
DECLARE
    existing_expression TEXT;
BEGIN
    SELECT pg_get_expr(d.adbin, d.adrelid)
      INTO existing_expression
      FROM pg_attrdef d
      JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
     WHERE d.adrelid = 'events'::regclass AND a.attname = 'search_tsv';
    IF existing_expression IS NULL THEN
        RAISE EXCEPTION 'events.search_tsv generated expression not found';
    END IF;
    ALTER TABLE events DROP COLUMN search_tsv;
    EXECUTE format(
        'ALTER TABLE events ADD COLUMN search_tsv TSVECTOR GENERATED ALWAYS AS (CASE WHEN kind IN (31922,31923,31924,31925) THEN NULL::tsvector ELSE (%s) END) STORED',
        existing_expression
    );
    CREATE INDEX idx_events_search_tsv ON events USING GIN (search_tsv);
END $$;
