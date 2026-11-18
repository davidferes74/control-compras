-- Conexión guiada con Google Drive (igual que en Recepciones-IA): autorización propia solo con drive.file,
-- la app crea la carpeta con el nombre que elige el usuario. Migración aditiva.
CREATE TABLE IF NOT EXISTS cc_drive (
 organization_id text PRIMARY KEY,
 email text,
 secret text,                 -- tokens cifrados con TOKEN_ENCRYPTION_KEY; NULL = desconectado
 folder_id text,
 folder_name text,
 sheet_id text,
 folders jsonb NOT NULL DEFAULT '{}',   -- caché de subcarpetas año/mes ya creadas
 last_error text,
 last_archive timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
-- Finalidad de cada autorización en curso (gmail o drive) y datos que viajan con ella (nombre de la carpeta).
ALTER TABLE cc_oauth_states ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'gmail';
ALTER TABLE cc_oauth_states ADD COLUMN IF NOT EXISTS data jsonb;
-- La conexión de Gmail ya no pide permiso de Drive: el selector de carpetas y su ajuste dejan de usarse.
DELETE FROM cc_settings WHERE key='drive';
DROP TABLE IF EXISTS cc_drive_folders;
-- Reserva de cada subida (evita duplicados si la tarea diaria y una confirmación coinciden) y nombre en Drive.
ALTER TABLE cc_documents ADD COLUMN IF NOT EXISTS drive_at timestamptz;
ALTER TABLE cc_documents ADD COLUMN IF NOT EXISTS drive_name text;
