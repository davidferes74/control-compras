# Gmail OAuth y captura

## Implementado
Botón Conectar con Google en Configuración → Correo de facturas. Solicita exclusivamente gmail.readonly (no envío ni modificación de correos) con acceso offline y consentimiento explícito. El callback verifica una autorización pendiente aleatoria de 256 bits, ligada a organización y sesión, con caducidad de 10 minutos y consumo SQL único antes de intercambiar el código. Tokens exclusivamente en servidor, cifrados con TOKEN_ENCRYPTION_KEY. Dirección de cuenta obtenida de users.getProfile; no se confía en dirección introducida por el cliente. Cuenta nueva guardada pausada. Reconexión no sustituye una cuenta IMAP y preserva la configuración Gmail existente.

Configuración Gmail: nombre, etiqueta obtenida de API, fecha inicial UTC y filtros locales contains de remitente/asunto. Cambios dejan la cuenta pausada y reinician paginación. Comprobar ahora obtiene mensajes por páginas de 20, máximo 10 nuevos procesados; continúa en sucesivas ejecuciones. Identificadores de mensaje y configuración forman clave de ingestión; SHA256 deduplica contenido dentro de organización. No depende de leído/no leído. Raw MIME se limita a 6 MB y adjuntos a 3 MB; mismos formatos y revisión con Claude del conector IMAP. Las exclusiones quedan visibles. No se llama a IA por autorizar ni capturar.

Renovación de access_token en servidor. Refresh fallido muestra acción de reconectar. Cursor de página se reinicia tras error para recuperación; mensajes ya guardados no duplican originales. Al terminar una vuelta, la siguiente vuelve a consultar desde la primera página para detectar nuevos correos. No es Gmail watch/PubSub ni captura periódica aún: endpoint de tareas disponible, programador pendiente.

## Google Cloud: configuración del propietario
1. Crear o seleccionar proyecto en https://console.cloud.google.com/ y habilitar Gmail API.
2. Google Auth Platform: configurar nombre Recepciones-IA, correo de soporte/contacto del propietario, audiencia y acceso a datos. Para piloto externo, añadir la cuenta concreta como usuario de prueba. Solicitar `https://www.googleapis.com/auth/gmail.readonly`.
3. Crear cliente OAuth de tipo Aplicación web.
4. URI de redirección autorizada EXACTA: `https://recepciones-ia.vercel.app/api/mail/google/callback`. Es fija para esta instalación; preview no inicia autorizaciones. No hace falta origen JavaScript para este flujo de servidor.
5. Copiar identificador del cliente a GOOGLE_CLIENT_ID y secreto del cliente a GOOGLE_CLIENT_SECRET en Vercel → recepciones-ia → Environment Variables → Production. No poner NEXT_PUBLIC ni compartir secretos por chat/Git.
6. Redeploy. El botón se habilita cuando el servidor detecta ambas variables y la clave de cifrado válida.
7. Abrir la app privada → Configuración → Conectar con Google → seleccionar cuenta y consentir. Al regresar, configurar etiqueta/fecha, habilitar captura y comprobar ahora.

El cliente OAuth se crea una vez para la aplicación; cada usuario conecta su buzón sin crear su propio cliente. No se puede suplir con una API key ni con la conexión Gmail de ChatGPT.
En modo externo Testing, los refresh tokens con Gmail caducan a los 7 días; el piloto deberá reconectar. Para distribución a clientes evaluar verificación de scope restringido y evaluación de seguridad de Google según aplicabilidad/excepciones. No publicar sin cumplir requisitos del proveedor.

## Validación y límites
48 tests y build, incluidos parámetros de autorización, aleatoriedad/hash, token sin refresh, permiso denegado, filtros de fecha y rechazo de rutas arbitrarias. Falta prueba OAuth real (no disponibles credenciales del proyecto Google), prueba captura de buzón y navegador real. No se afirma conectado hasta recibir callback válido y comprobar Gmail API. Roles siguen siendo administrador único del piloto. Revocación desde Google Account; botón de desconexión en app pendiente. Histórico de pruebas: docs/ESTADO.md.
Fuentes: https://developers.google.com/identity/protocols/oauth2/web-server , https://developers.google.com/identity/protocols/oauth2 , https://developers.google.com/workspace/gmail/api/auth/scopes , https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list .
