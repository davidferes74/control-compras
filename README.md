# Control de compras · Sentidiño

App externa e independiente que **concilia facturas de proveedor con albaranes**: comprueba que lo facturado coincide con lo entregado y señala cada diferencia.

## Cómo funciona

1. **Entrada**: PDF, facturas electrónicas (XML, UBL, Facturae o EDIFACT) o fotos subidos a mano; o adjuntos de Gmail. Del correo solo se recogen PDF y facturas electrónicas, reconocidos por su contenido (las imágenes se excluyen: suelen ser logotipos y firmas). Etiquetas, fecha y filtros son opcionales: sin etiquetas se revisa todo el correo.
2. **Lectura con IA** (Claude): proveedor, NIF, número, fecha, albaranes citados, líneas (código, descripción, cantidad, unidad, precio, descuento, importe) y totales. Queda como *borrador*.
3. **Revisión**: una persona corrige lo leído y **confirma**. Nada cuenta para la conciliación sin confirmar.
4. **Conciliación** (`lib/matching.ts`, reglas exactas con aritmética decimal, sin IA):
   - Factura ↔ albaranes que cita (o, si no cita ninguno, propuestos por proveedor y fecha → «Revisar»).
   - Líneas por código del proveedor, luego descripción exacta, luego descripción parecida (marcada para revisar).
   - Detecta: cantidad facturada de más, facturado sin albarán, albarán citado inexistente, albarán ya facturado, precio o descuento distinto (si el albarán está valorado), importe de línea mal calculado, totales/IVA que no cuadran, y lo entregado sin facturar.
   - Si la factura no cita albaranes, se busca la combinación de albaranes pendientes del proveedor (de 90 días antes a 15 días después) que cuadra al 100 %; si la hay, la factura queda **Lista para validar** en Diferencias, con enlace a cada albarán, y se valida con un clic.
   - Estados: **Conforme**, **Con diferencias**, **Falta albarán**, **Revisar**. Una diferencia solo se acepta con motivo; si cambian los datos, la aceptación deja de valer.
5. **Archivo en Google Drive** (conexión guiada, igual que en Recepciones-IA): el usuario escribe el nombre de la carpeta, elige su cuenta y pulsa Permitir; la app crea la carpeta y guarda cada documento confirmado en `Carpeta/2026/11 noviembre/Facturas/2026-11-17 · Proveedor · Factura F-123.pdf` (los albaranes, con su foto o PDF, en `…/11 noviembre/Albaranes/`), más la hoja «Registro control de compras» (pestañas *Documentos* y *Líneas*). Si Google rechaza la conexión, la app dice el motivo y, si falta un ajuste en Google Cloud, muestra los pasos.

Los abonos se registran y archivan, pero se revisan a mano.

## Variables de entorno (Vercel)

Ver `.env.example`. Mínimas: `DATABASE_URL`, `APP_ACCESS_PASSWORD`, `SESSION_SECRET`, `ANTHROPIC_API_KEY`. Para Google (Gmail y Drive): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`. Tarea diaria: `CRON_SECRET`.

### Google Cloud (una vez, quien administra la app)

1. En el mismo proyecto, activar **Gmail API**, **Google Drive API** y **Google Sheets API**.
2. Pantalla de consentimiento OAuth con los permisos `gmail.readonly` y `drive.file`. Mientras esté en pruebas, añadir las cuentas en *Público → Usuarios de prueba*.
3. Cliente OAuth «Aplicación web» con la URI de redirección `https://<dominio>/api/google/callback` (por defecto `https://control-compras-sentidino.vercel.app/api/google/callback`; otro dominio → `APP_URL`). Sirve para Gmail y para Drive.

Gmail y Drive se autorizan por separado desde Ajustes.

**Gmail desde la app** (mismo proceso que en Recepciones-IA): Conectar Gmail → la app verifica la cuenta con Gmail y la guarda *pausada* → Configurar (nombre, etiquetas, fecha, filtros de remitente y asunto, lectura con IA) → Habilitar captura → Comprobar ahora. Si Google rechaza la conexión, la app dice el motivo y, si falta un ajuste en Google Cloud, muestra los pasos.
 Con `drive.file` la app solo ve la carpeta que crea y lo que guarda en ella.

## Desarrollo

```bash
npm ci
npm test          # pruebas del motor de conciliación y contratos
npm run build     # aplica migraciones si hay DATABASE_URL
```

Estructura: `lib/matching.ts` (conciliación), `lib/documents.ts` (datos), `lib/ai-reader.ts` + `lib/extraction.ts` (lectura), `lib/google.ts`, `lib/gmail-capture.ts`, `lib/archive.ts` (Google), `app/api/*` (rutas), `components/*` (interfaz), `migrations/*` (esquema).
