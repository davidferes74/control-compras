-- Control de compras: conciliación de facturas de proveedor con albaranes.
-- Una organización por despliegue (ORGANIZATION_ID). Importes y cantidades en numeric (decimal exacto).

-- Archivos originales (subidos o capturados de Gmail) y su lectura con IA, con caché por contenido idéntico.
CREATE TABLE IF NOT EXISTS cc_files (
 id uuid PRIMARY KEY,
 organization_id text NOT NULL,
 digest text NOT NULL,
 filename text NOT NULL,
 mime text NOT NULL,
 bytes bytea NOT NULL,
 source text NOT NULL DEFAULT 'upload',          -- upload | gmail
 source_ref text,                                -- id del mensaje de Gmail
 sender text,
 subject text,
 received_at timestamptz,
 read_state text NOT NULL DEFAULT 'pending',     -- pending | reading | ready | error
 read_result jsonb,
 read_error text,
 model text,
 usage jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (organization_id, digest)
);

CREATE TABLE IF NOT EXISTS cc_ai_daily (
 organization_id text NOT NULL,
 day date NOT NULL DEFAULT CURRENT_DATE,
 calls integer NOT NULL DEFAULT 0,
 PRIMARY KEY (organization_id, day)
);

-- Documentos: facturas, albaranes y abonos. «draft» = pendiente de revisión; «confirmed» = cuenta para conciliar.
CREATE TABLE IF NOT EXISTS cc_documents (
 id uuid PRIMARY KEY,
 organization_id text NOT NULL,
 file_id uuid REFERENCES cc_files(id),
 kind text NOT NULL,                             -- invoice | delivery_note | credit_note
 status text NOT NULL DEFAULT 'draft',           -- draft | confirmed
 supplier text NOT NULL DEFAULT '',
 supplier_tax_id text NOT NULL DEFAULT '',
 number text NOT NULL DEFAULT '',
 doc_date date,
 delivery_refs text[] NOT NULL DEFAULT '{}',     -- albaranes citados por la factura
 subtotal numeric,
 tax numeric,
 total numeric,
 warnings text[] NOT NULL DEFAULT '{}',
 match_status text,                              -- facturas: ok | diff | missing | review ; albaranes: invoiced | partial | pending
 match_result jsonb,
 drive_file_id text,
 drive_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 confirmed_at timestamptz
);
CREATE INDEX IF NOT EXISTS cc_documents_org ON cc_documents (organization_id, status, kind);
CREATE INDEX IF NOT EXISTS cc_documents_file ON cc_documents (organization_id, file_id);

CREATE TABLE IF NOT EXISTS cc_lines (
 id uuid PRIMARY KEY,
 document_id uuid NOT NULL REFERENCES cc_documents(id) ON DELETE CASCADE,
 position integer NOT NULL,
 code text NOT NULL DEFAULT '',
 description text NOT NULL DEFAULT '',
 quantity numeric,
 unit text NOT NULL DEFAULT '',
 unit_price numeric,
 discount_pct numeric,
 amount numeric,
 delivery_ref text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS cc_lines_document ON cc_lines (document_id, position);

-- Diferencias aceptadas por una persona, con motivo. «key» incluye los valores comparados:
-- si los datos cambian, la aceptación deja de aplicarse.
CREATE TABLE IF NOT EXISTS cc_decisions (
 organization_id text NOT NULL,
 invoice_id uuid NOT NULL REFERENCES cc_documents(id) ON DELETE CASCADE,
 key text NOT NULL,
 reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (organization_id, invoice_id, key)
);

CREATE TABLE IF NOT EXISTS cc_audit (
 id bigserial PRIMARY KEY,
 organization_id text NOT NULL,
 at timestamptz NOT NULL DEFAULT now(),
 action text NOT NULL,
 message text NOT NULL,
 document_id uuid
);
CREATE INDEX IF NOT EXISTS cc_audit_org ON cc_audit (organization_id, at DESC);

-- Ajustes (carpeta de Drive, etiquetas de Gmail, hoja de registro…).
CREATE TABLE IF NOT EXISTS cc_settings (
 organization_id text NOT NULL,
 key text NOT NULL,
 value jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (organization_id, key)
);

-- Cuenta de Google autorizada (Gmail lectura + Drive limitado). Tokens cifrados con TOKEN_ENCRYPTION_KEY.
CREATE TABLE IF NOT EXISTS cc_google (
 organization_id text PRIMARY KEY,
 email text NOT NULL,
 secret text NOT NULL,
 scopes text NOT NULL,
 last_sync timestamptz,
 last_error text,
 lease_until timestamptz,
 lease_token uuid,
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cc_oauth_states (
 state_hash text PRIMARY KEY,
 organization_id text NOT NULL,
 session_hash text NOT NULL,
 expires_at timestamptz NOT NULL
);

-- Correos de Gmail ya revisados (para no procesarlos dos veces).
CREATE TABLE IF NOT EXISTS cc_gmail_seen (
 organization_id text NOT NULL,
 message_id text NOT NULL,
 outcome text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (organization_id, message_id)
);

-- Subcarpetas creadas en Drive (proveedor / año-mes) para no duplicarlas.
CREATE TABLE IF NOT EXISTS cc_drive_folders (
 organization_id text NOT NULL,
 root_id text NOT NULL,
 path text NOT NULL,
 folder_id text NOT NULL,
 PRIMARY KEY (organization_id, root_id, path)
);
