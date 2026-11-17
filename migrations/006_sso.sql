-- Pases de entrada desde la app principal ya utilizados (un solo uso). Se limpian al caducar.
CREATE TABLE IF NOT EXISTS ria_sso_nonces (nonce text PRIMARY KEY, expires_at timestamptz NOT NULL);
