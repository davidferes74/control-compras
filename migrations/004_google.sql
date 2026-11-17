ALTER TABLE ria_mail_accounts ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'imap';
ALTER TABLE ria_mail_accounts ADD COLUMN IF NOT EXISTS gmail_cursor text;
CREATE TABLE IF NOT EXISTS ria_oauth_states (
 state_hash text PRIMARY KEY, organization_id text NOT NULL, session_hash text NOT NULL,
 expires_at timestamptz NOT NULL
);
