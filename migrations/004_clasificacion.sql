-- Clasificación obligatoria de documentos (docs/requisitos-clasificacion.md, R2–R6).
-- Idempotente: se aplica en cada despliegue. No borra ni reclasifica nada con IA.

-- Archivos: parte de otro archivo (PDF con varios documentos, separado por páginas) y versión del prompt que lo leyó.
ALTER TABLE cc_files ADD COLUMN IF NOT EXISTS parent_file_id uuid REFERENCES cc_files(id);
ALTER TABLE cc_files ADD COLUMN IF NOT EXISTS pages text;
ALTER TABLE cc_files ADD COLUMN IF NOT EXISTS prompt_version text;

-- Documentos: estado de clasificación (obligatorio, sin valor por defecto) y su auditoría.
ALTER TABLE cc_documents ADD COLUMN IF NOT EXISTS class_state text;
ALTER TABLE cc_documents ADD COLUMN IF NOT EXISTS origin text;                     -- correo | escaneo | manual
ALTER TABLE cc_documents ADD COLUMN IF NOT EXISTS class_by text;                   -- ia | persona | manual | anterior
ALTER TABLE cc_documents ADD COLUMN IF NOT EXISTS class_confidence numeric;
ALTER TABLE cc_documents ADD COLUMN IF NOT EXISTS class_reason text NOT NULL DEFAULT '';
ALTER TABLE cc_documents ADD COLUMN IF NOT EXISTS detected_type text NOT NULL DEFAULT '';
ALTER TABLE cc_documents ADD COLUMN IF NOT EXISTS missing_fields text[] NOT NULL DEFAULT '{}';
ALTER TABLE cc_documents ADD COLUMN IF NOT EXISTS prompt_version text;
ALTER TABLE cc_documents ADD COLUMN IF NOT EXISTS class_model text;
ALTER TABLE cc_documents ADD COLUMN IF NOT EXISTS classified_at timestamptz;
ALTER TABLE cc_documents ADD COLUMN IF NOT EXISTS class_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE cc_documents ADD COLUMN IF NOT EXISTS class_data jsonb;                -- destinatario, nº de pedido, moneda
ALTER TABLE cc_documents ADD COLUMN IF NOT EXISTS duplicate_of uuid REFERENCES cc_documents(id);

-- Documentos anteriores al clasificador. Los confirmados los validó una persona; los subidos o hechos a mano
-- conservan su tipo; los borradores capturados del correo quedan como dudosos, visibles y sin conciliar.
UPDATE cc_documents d SET origin=CASE WHEN d.file_id IS NULL THEN 'manual' WHEN (SELECT f.source FROM cc_files f WHERE f.id=d.file_id)='gmail' THEN 'correo' ELSE 'escaneo' END WHERE d.origin IS NULL;
UPDATE cc_documents SET
 class_state=CASE WHEN status='confirmed' OR origin<>'correo' THEN (CASE WHEN kind='delivery_note' THEN 'ALBARAN' ELSE 'FACTURA' END) ELSE 'DUDOSO' END,
 class_by=CASE WHEN status='confirmed' THEN 'persona' WHEN origin<>'correo' THEN 'manual' ELSE 'anterior' END,
 class_reason=CASE WHEN status='confirmed' OR origin<>'correo' THEN '' ELSE 'Documento anterior al clasificador: todavía sin clasificar.' END
 WHERE class_state IS NULL;

ALTER TABLE cc_documents ALTER COLUMN class_state SET NOT NULL;
ALTER TABLE cc_documents ALTER COLUMN origin SET NOT NULL;
ALTER TABLE cc_documents DROP CONSTRAINT IF EXISTS cc_documents_class_state_check;
ALTER TABLE cc_documents ADD CONSTRAINT cc_documents_class_state_check CHECK (class_state IN ('PENDIENTE_CLASIFICACION','FACTURA','ALBARAN','DUDOSO','DESCARTADO'));
ALTER TABLE cc_documents DROP CONSTRAINT IF EXISTS cc_documents_origin_check;
ALTER TABLE cc_documents ADD CONSTRAINT cc_documents_origin_check CHECK (origin IN ('correo','escaneo','manual'));
-- Solo una factura o un albarán puede contar para conciliar: nunca un pendiente, un dudoso, un descartado ni un duplicado.
ALTER TABLE cc_documents DROP CONSTRAINT IF EXISTS cc_documents_confirmed_check;
ALTER TABLE cc_documents ADD CONSTRAINT cc_documents_confirmed_check CHECK (status<>'confirmed' OR (class_state IN ('FACTURA','ALBARAN') AND duplicate_of IS NULL));
CREATE INDEX IF NOT EXISTS cc_documents_class ON cc_documents (organization_id, class_state);

-- Historial de clasificaciones y correcciones (auditoría; alimentará las plantillas de proveedor).
CREATE TABLE IF NOT EXISTS cc_classifications (
 id uuid PRIMARY KEY,
 organization_id text NOT NULL,
 document_id uuid NOT NULL REFERENCES cc_documents(id),
 state text NOT NULL,
 by text NOT NULL,                               -- ia | persona
 confidence numeric,
 reason text NOT NULL DEFAULT '',
 detected_type text NOT NULL DEFAULT '',
 prompt_version text,
 model text,
 template_id uuid,
 at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cc_classifications_document ON cc_classifications (document_id, at);
