-- Plantillas de proveedor (docs/requisitos-clasificacion.md, R5). Idempotente.
-- Una plantilla por proveedor, tipo de documento y formato: un proveedor puede tener varias.
-- Se crean y actualizan solo cuando una persona valida o corrige un documento.
CREATE TABLE IF NOT EXISTS cc_templates (
 id uuid PRIMARY KEY,
 organization_id text NOT NULL,
 kind text NOT NULL,                             -- invoice | delivery_note | credit_note
 supplier_tax_id text NOT NULL DEFAULT '',       -- NIF normalizado
 supplier_key text NOT NULL DEFAULT '',          -- nombre normalizado (por si no hay NIF)
 supplier_name text NOT NULL DEFAULT '',
 senders text[] NOT NULL DEFAULT '{}',           -- direcciones de correo desde las que llega
 format jsonb,                                   -- rasgos del formato: etiquetas, numeración, fecha, importes
 example jsonb,                                  -- última extracción validada
 corrections jsonb NOT NULL DEFAULT '[]',        -- campos que una persona corrigió sobre la lectura de la IA
 uses integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cc_templates_supplier ON cc_templates (organization_id, kind, supplier_tax_id);

-- Plantilla que se pasó a la IA al clasificar el documento (o la que aprendió de él al validarlo).
ALTER TABLE cc_documents ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES cc_templates(id);
ALTER TABLE cc_documents ADD COLUMN IF NOT EXISTS template_used boolean NOT NULL DEFAULT false;
