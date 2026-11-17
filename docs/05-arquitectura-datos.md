# 05 · Arquitectura y datos propuestos

Este documento es un diseño de implementación, no un sistema ya instalado. Codex puede ajustar componentes con justificación manteniendo requisitos.

## Componentes

- Web mobile-first/PWA, TypeScript/React/Next.js compatible con Vercel.
- API de servidor con autenticación/autorización y validación de esquemas.
- PostgreSQL/Neon propuesto, migraciones y claves foráneas. No usar disco efímero de Vercel como base de datos.
- Archivo privado en Google Drive. Binarios en Drive; IDs, hashes, metadatos y relaciones en PostgreSQL. Un almacenamiento temporal privado puede ser necesario antes de archivar.
- Adaptadores Gmail y Dinahosting/IMAP; empezar con un buzón real elegido.
- Pipeline extracción (PDF/OCR/IA), plantillas y parser de códigos separados.
- Orquestación durable con outbox y workers/cola. Eve fue propuesta para agentes; comprobar integración y documentación actual. Los efectos y cálculos siguen en servicios tipados.
- IA por Vercel AI Gateway propuesta; proveedor/modelo intercambiable tras benchmark.
- Refresco de estados por polling incremental o suscripción, sin dependencia de una petición HTTP abierta durante todo el OCR.

## Flujo durable

Guardar documento + evento outbox en misma transacción → trabajador reclama tarea → archiva/extrae con pasos idempotentes → persiste versión → emite evento → concilia → publica resultado.
Eventos contienen IDs/versión/organización, no PDFs completos.
Entrega al menos una vez: deduplicar efectos. Usar idempotency_key en API/capturas; no prometer exactly-once de transporte.
Reintentos limitados con backoff, clasificación transitorio/permanente, cola de fallos y reintento manual autorizado.
Job con lease/heartbeat o equivalente para recuperación tras caída. Detectar trabajos obsoletos: nunca sobrescribir revisión nueva con resultado antiguo.
Si Drive falla conservar bytes en almacenamiento durable y mostrar archivo pendiente; no confirmar archivo exitoso sin evidencia.
Si archivado funciona y DB falla, reconciliar por clave idempotente/huella sin duplicar documentos.

## Modelo lógico mínimo

Todas las entidades de negocio tienen organization_id; fechas de creación/actualización y versiones cuando son mutables. IDs UUID propuestos.

| Entidad | Campos/relaciones esenciales |
|---|---|
| organizations/settings | nombre, timezone, flags lotes/series, políticas/tolerancias/versiones. |
| users/memberships | identidad, organización, rol, activo. |
| suppliers | nombre, identificador fiscal si disponible, referencias verificadas. |
| products | referencia interna, descripción, unidad base, tracking none/lot/serial. |
| supplier_products | proveedor/producto, referencia y alias confirmados, vigencia. |
| product_codes/packagings | valor textual, simbología si conocida, producto, unidad/cantidad conversión, vigencia. |
| documents | tipo, proveedor, número, fecha, moneda, procedencia, hash, estado, revisión. |
| document_files | original/derivado, MIME, páginas, hash, Drive file ID, estado archivo. |
| document_lines | documento, posición, texto crudo, referencia, producto resuelto, cantidad/unidad, precio/descuentos/impuestos opcionales. |
| document_references | documento/línea, tipo pedido/albarán/factura, valor; múltiples por documento. |
| extraction_runs/fields | extractor/modelo/template/prompt versión, valor crudo/normalizado, página/bbox, comprobaciones, coste y duración. |
| templates/template_versions | proveedor, tipo, huella de diseño, reglas/anclas, estado y evaluaciones. |
| receipts/receipt_lines | documento albarán, estado físico, cantidades esperadas/recibidas/aceptadas/rechazadas, unidad, cierre/versiones. |
| receipt_tracking | línea recepción, lote/serie, caducidad opcional, cantidad y evidencia. |
| scan_events | UUID idempotente, dispositivo/perfil versión, bruto/interpretado, actor, tiempo cliente/servidor, aplicado/revertido. |
| device_profiles/profile_versions | parámetros, parser, mapeo, cantidad, feedback, estado validación. |
| device_tests | entradas/esperados/resultados, versión y dispositivo; sin efectos de recepción. |
| match_candidates | evidencia, puntuación explicable, propuesto/descartado/confirmado; no consume cantidades. |
| allocations | línea factura → línea recepción, cantidad base decimal, estado, método, versión y reverso. |
| reconciliation_runs/results | versiones comparadas, alcance, faltantes, diferencias, no verificables y estado. |
| issues/review_decisions | tipo, diferencia, evidencia, responsable, estado, motivo y resolución. |
| returns/credit_links | reversos y referencias de devolución/abono, estado y cantidades. |
| connectors/email_messages | configuración sin secretos planos, mailbox/cursor, IDs mensaje/adjunto, ingestión. |
| outbox/jobs | evento, clave, intentos, lease, próxima ejecución, error saneado. |
| audit_log | actor, acción, entidad, antes/después permitido, motivo, correlación; append-only. |
| usage_events | organización, documento, modelo/proveedor, unidades/tokens, coste estimado/real, fecha. |

Para cada relación, impedir referencias cruzadas entre organizaciones mediante constraints compuestas o validación equivalente más pruebas. Un índice único de evento por organización+capture UUID; serie duplicada contextualizada por producto y flujo; no unique global sobre barcode de escaneo.
Importes NUMERIC con escala documentada; cantidades suficientes para pesos. No convertir identificadores a enteros. Divisas diferentes sin tipo de cambio válido no son comparables automáticamente.

## Contratos API orientativos

- POST /api/documents/uploads; POST /api/documents/:id/pages; POST /api/documents/:id/process.
- GET/PATCH /api/documents/:id (versión requerida al corregir).
- POST /api/receipts; GET /api/receipts/:id.
- POST /api/receipts/:id/scans (captureId, profileVersion, rawValue, source); respuesta accepted/pending/rejected con motivo.
- POST /api/receipts/:id/scans/:scanId/reverse.
- POST /api/receipts/:id/confirm (versión, parcial/cierre, diferencias aceptadas y motivo).
- POST /api/receipts/:id/label-captures (foto); procesamiento asíncrono y evidencia.
- GET /api/reconciliations/:id; POST /api/allocations/confirm; POST /api/issues/:id/resolve.
- CRUD /api/device-profiles; POST /api/device-profiles/:id/test; POST /api/device-profiles/:id/activate.
- GET /api/jobs/:id; POST /api/jobs/:id/retry.
- Configuración/conexiones/consumo restringida a roles adecuados.
Rutas propuestas, no contratos de un backend existente. Validar cuerpo, permisos, organización, idempotencia y versión en servidor.

## Conectividad débil

Propuesta H1: cola local de escaneos y borradores con UUID y estado visible; IndexedDB para pendientes, nunca única base de datos.
Servidor confirma cada evento y detecta conflicto por recepción cerrada/perfil antiguo.
No cerrar definitivamente en modo offline ni afirmar que OCR/conciliación remotos funcionaron sin conexión.
Sincronizar en reapertura/reconexión; no depender de Background Sync universal.
Si se pospone soporte offline completo, preservar capturas locales y bloquear explícitamente operaciones que requieran servidor. Documentar límite.
