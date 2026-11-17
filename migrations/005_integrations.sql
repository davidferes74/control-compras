-- Conexiones con sistemas externos (Odoo). El secreto va cifrado con TOKEN_ENCRYPTION_KEY; puede ser NULL
-- cuando la conexión se hereda de la app principal por variables de entorno y solo se guarda la última sincronización.
CREATE TABLE IF NOT EXISTS ria_integrations (
 organization_id text NOT NULL, kind text NOT NULL, config jsonb NOT NULL DEFAULT '{}', secret text,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(organization_id,kind)
);
