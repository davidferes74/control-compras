-- Vínculos manuales factura ↔ albarán (fase 2 de conciliación, decisión del propietario 19-11-2026). Idempotente.
-- Los crea una persona con «Vincular» desde Diferencias. El motor los trata como albaranes citados por la factura.
-- Solo añade una tabla: no modifica datos existentes.
CREATE TABLE IF NOT EXISTS cc_links (
 organization_id text NOT NULL,
 invoice_id uuid NOT NULL REFERENCES cc_documents(id) ON DELETE CASCADE,
 delivery_note_id uuid NOT NULL REFERENCES cc_documents(id) ON DELETE CASCADE,
 match_pct integer,                              -- coincidencia que mostraba la búsqueda al vincular
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (organization_id, invoice_id, delivery_note_id)
);
CREATE INDEX IF NOT EXISTS cc_links_note ON cc_links (organization_id, delivery_note_id);
