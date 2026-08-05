-- Per-agent task assignment access. Existing agents fail closed.
ALTER TABLE users
    ADD COLUMN task_assignment_policy TEXT NOT NULL DEFAULT 'owner_only',
    ADD COLUMN task_assignment_allowlist JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD CONSTRAINT users_task_assignment_policy_valid
        CHECK (task_assignment_policy IN ('owner_only', 'allowlist', 'anyone')),
    ADD CONSTRAINT users_task_assignment_allowlist_array
        CHECK (jsonb_typeof(task_assignment_allowlist) = 'array');
