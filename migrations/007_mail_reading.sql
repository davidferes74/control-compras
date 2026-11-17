-- Lectura automática de adjuntos del correo: documento leído (ria_documents) y estado de esa lectura.
ALTER TABLE ria_mail_items ADD COLUMN IF NOT EXISTS document_id uuid;
ALTER TABLE ria_mail_items ADD COLUMN IF NOT EXISTS read_state text;
