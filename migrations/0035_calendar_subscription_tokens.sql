-- Private iCalendar feed credentials. The reusable bearer secret is never
-- stored: token_hash is SHA-256(secret), scoped by the host-derived community.
CREATE TABLE calendar_subscription_tokens (
    community_id UUID NOT NULL,
    owner_pubkey BYTEA NOT NULL,
    token_hash BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    PRIMARY KEY (community_id, token_hash),
    CONSTRAINT calendar_subscription_tokens_owner_fk
        FOREIGN KEY (community_id, owner_pubkey)
        REFERENCES users (community_id, pubkey) ON DELETE CASCADE,
    CONSTRAINT calendar_subscription_tokens_hash_len
        CHECK (LENGTH(token_hash) = 32),
    CONSTRAINT calendar_subscription_tokens_owner_len
        CHECK (LENGTH(owner_pubkey) = 32)
);

CREATE UNIQUE INDEX idx_calendar_subscription_tokens_active_owner
    ON calendar_subscription_tokens (community_id, owner_pubkey)
    WHERE revoked_at IS NULL;

CREATE INDEX idx_calendar_subscription_tokens_owner_history
    ON calendar_subscription_tokens (community_id, owner_pubkey, created_at DESC);

-- Migration 0032 attached the lifecycle fence to the then-current schema.
-- New community-scoped tables must opt in explicitly.
SELECT attach_community_write_fence('calendar_subscription_tokens');
