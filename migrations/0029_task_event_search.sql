-- Task commands are audit history and must not create duplicate search hits.
-- Preserve every prior search_tsv rule by wrapping the current generated
-- expression instead of replacing it with a new allowlist.
DROP INDEX IF EXISTS idx_events_search_tsv;

DO $$
DECLARE
    old_expr text;
BEGIN
    SELECT pg_get_expr(d.adbin, d.adrelid)
      INTO old_expr
      FROM pg_attrdef d
      JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
     WHERE d.adrelid = 'events'::regclass AND a.attname = 'search_tsv';
    IF old_expr IS NULL THEN
        RAISE EXCEPTION 'events.search_tsv generated expression not found';
    END IF;
    ALTER TABLE events DROP COLUMN search_tsv;
    EXECUTE format(
        'ALTER TABLE events ADD COLUMN search_tsv TSVECTOR GENERATED ALWAYS AS (CASE WHEN kind IN (42500,42501) THEN NULL::tsvector ELSE (%s) END) STORED',
        old_expr
    );
    CREATE INDEX idx_events_search_tsv ON events USING GIN (search_tsv);
END $$;
