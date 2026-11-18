-- Gmail como en Recepciones-IA: la cuenta recién autorizada queda pausada hasta que el usuario la configura
-- (etiquetas, fecha, filtros) y habilita la captura. Migración aditiva.
ALTER TABLE cc_google ADD COLUMN IF NOT EXISTS paused boolean NOT NULL DEFAULT true;
