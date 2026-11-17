CREATE TABLE IF NOT EXISTS ria_documents (
 id uuid PRIMARY KEY,
 organization_id text NOT NULL,
 digest text NOT NULL,
 filename text NOT NULL,
 mime text NOT NULL,
 original bytea NOT NULL,
 state text NOT NULL DEFAULT 'pending',
 result jsonb,
 model text NOT NULL,
 usage jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,digest)
);
CREATE TABLE IF NOT EXISTS ria_ai_daily (
 organization_id text NOT NULL,
 day date NOT NULL DEFAULT CURRENT_DATE,
 calls integer NOT NULL DEFAULT 0,
 PRIMARY KEY(organization_id,day)
);
