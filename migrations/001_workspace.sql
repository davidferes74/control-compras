-- H1 transactional workspace aggregate, single organization per deployment.
-- JSONB versioned aggregate is a deliberate prototype boundary, not final normalized model.
CREATE TABLE IF NOT EXISTS ria_workspaces (
 organization_id text PRIMARY KEY,
 version bigint NOT NULL DEFAULT 0,
 state jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ria_command_log (
 organization_id text NOT NULL REFERENCES ria_workspaces(organization_id),
 command_id uuid NOT NULL,
 applied_version bigint NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id, command_id)
);
