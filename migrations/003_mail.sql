CREATE TABLE IF NOT EXISTS ria_mail_accounts (
 id uuid PRIMARY KEY, organization_id text NOT NULL, name text NOT NULL, email text NOT NULL,
 config jsonb NOT NULL, secret text NOT NULL, paused boolean NOT NULL DEFAULT true,
 uid_validity text, last_uid bigint NOT NULL DEFAULT 0, last_sync timestamptz,
 last_error text, lease_until timestamptz, lease_token uuid,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,email)
);
CREATE TABLE IF NOT EXISTS ria_mail_items (
 id uuid PRIMARY KEY, organization_id text NOT NULL, account_id uuid NOT NULL REFERENCES ria_mail_accounts(id),
 source_key text NOT NULL, sender text NOT NULL, subject text NOT NULL, received_at timestamptz,
 filename text NOT NULL, mime text, original bytea, digest text,
 status text NOT NULL, detail text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,account_id,source_key)
);
CREATE INDEX IF NOT EXISTS ria_mail_digest ON ria_mail_items(organization_id,digest);
