# Estado · 16/11/2026

## Implementado y desplegado

Prototipo H1: interfaz móvil en español, catálogo, recepciones manuales, perfiles de lector y banco de pruebas, lotes/series opcionales, incidencias, histórico y conciliación decimal por referencias explícitas. Demo IndexedDB separada del espacio privado PostgreSQL.

Acceso privado con usuario y contraseña de piloto. Se ha verificado login, lectura autenticada de Neon y cierre de sesión en producción.

Lectura asistida Claude añadida: fotos JPG/PNG/WebP y PDF, salida validada, revisión y selección manual de productos, originales privados en Neon. Ver [09-claude.md](09-claude.md) para límites y decisiones. No crea ni confirma recepciones automáticamente.

## Pruebas y evidencia

- 32 pruebas automatizadas aprobadas y build de producción correcto.
- Despliegue de integración 8685c756918ad43735f3f6b6c9094c81a060d0e2 servido por Vercel.
- API autenticada confirma ANTHROPIC_API_KEY configurada, modelo claude-haiku-5-5.
- Prueba real con PDF sintético TEST-CLAUDE-001: proveedor, referencia, fecha, producto, cantidad 12 y lote extraídos; precio ausente conservado como null. HTTP 200.
- Escritura/lectura del original en Neon comprobada: bytes descargados idénticos al PDF enviado.
- Repetición del mismo documento: HTTP 200, cached=true; no nueva llamada al modelo.
- La prueba creó un registro documental sintético, no producto, albarán comercial ni recepción física.
- No se han probado documentos reales, cámara/PDA física, exactitud por campo a escala ni flujo visual completo. Chromium local no arranca por restricción de sockets del entorno.

## Decisiones provisionales y limitaciones

PostgreSQL guarda el agregado de trabajo en JSONB con versión y bloqueo por organización. Documentos de piloto en tabla separada; Drive pendiente. Sesión de un administrador, pendiente roles multiusuario, protección distribuida de login, retención, restauración y pruebas de concurrencia reales.

Límite de piloto IA: 10 intentos diarios, 3 MB, 10 páginas PDF, 6000 tokens de salida; sin escalado automático caro. Cachear documento idéntico no equivale a aprender diseños.

## Pendiente

Aprendizaje de plantillas, extracción de etiquetas de lotes/series, correo Gmail/Dinahosting, Drive, procesamiento durable, devoluciones/correcciones y compatibilidad de cámara ampliada. No se realizan movimientos ERP ni pagos. Precios siguen pendientes de Administración; la conciliación automática de H1 respalda cantidades y no certifica lotes de factura.

## Siguiente paso

Validar fotos y PDFs representativos, corregir UI con navegador habilitado, verificar recepción completa con catálogo real y PDA, conectar archivo Drive y buzón autorizado. Mantener revisión humana hasta disponer de benchmark.

## Comprobación adicional de acceso · 16/11/2026

10 comprobaciones HTTP reales aprobadas: workspace, extracción y original bloqueados sin sesión (401); login, lectura Neon y original autenticados (200); escritura de workspace y extracción rechazadas desde origen ajeno (403); logout correcto y consulta posterior sin sesión bloqueada. No se enviaron documentos nuevos a IA ni se modificó mercancía.

Añadido scripts/smoke-private.mjs para repetir las comprobaciones básicas con SMOKE_USERNAME y SMOKE_PASSWORD en entorno, sin guardar ni imprimir credenciales. Ejecutar: node scripts/smoke-private.mjs. Sintaxis comprobada; la ejecución documentada anterior se hizo con cliente HTTP Python equivalente y añadió la prueba de original.

Bloqueos para validación real: muestras representativas de albaranes/facturas y etiquetas, acceso a navegador de pruebas/PDA física, buzón inicial y autorización de carpeta Drive. La repetición automática se pausa mientras falten estos elementos; el prototipo no se declara producto terminado.


## 2026-11-16 — Importación masiva Excel
- Añadir producto: alta manual o Importar Excel. Plantilla XLSX vacía con instrucciones, códigos como texto y listas de unidad/seguimiento.
- Hasta 1000 productos / 2 MB, vista previa y confirmación. Solo crea; no sobrescribe existentes.
- Valida obligatorios, duplicados, embalajes, fórmulas y códigos numéricos. Errores con fila de Excel.
- Comando atómico e idempotente, con control de versión y transacción PostgreSQL existente; también disponible en demo.
- 38 tests y build correctos; plantilla renderizada y leída por el parser de la app. No se añadieron productos ficticios en producción.
- Normalizados prefijos OOXML del exportador para compatibilidad con ExcelJS.
- Pendiente prueba visual interactiva/PDA real: Chromium no arranca en este entorno. Despliegue a verificar tras publicación.

## 2026-11-16 — Primer incremento de correo IMAP
- Pantalla privada de correo con alta/edición, prueba, carpetas, filtros, fecha inicial y vista previa; cifrado obligatorio.
- Captura manual incremental y transaccional de adjuntos; deduplicación, exclusiones y bandeja con original descargable.
- Adjuntos abren lectura Claude/revisión existente y guardado de factura con conciliación.
- Migración 003; endpoint autenticado para futuro programador. No se ha activado captura automática ni Gmail OAuth.
- 43 tests y build correctos. No prueba real de buzón: requiere TOKEN_ENCRYPTION_KEY y credenciales introducidas en la app. Navegador/PDA y concurrencia DB pendientes.
- Procedimiento, límites y configuración: docs/10-correo.md.

## 2026-11-16 — Gmail OAuth
- Implementados inicio OAuth, callback con state de un solo uso ligado a sesión/organización, autorización gmail.readonly, identidad verificada por Gmail, tokens cifrados y renovación.
- Configuración por etiquetas/fecha/filtros y captura manual Gmail con paginación, límites, lease y deduplicación; integrado con revisión existente. Migración aditiva 004.
- UI elimina aviso «OAuth pendiente de implementar»: muestra configuración externa pendiente mientras falten GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET. No muestra buzón autorizado sin callback válido.
- 48 pruebas y build correctos. Pendientes credenciales Google Cloud, autorización real del usuario y prueba end-to-end de buzón. Captura periódica y lectura IA automática siguen pendientes.
- Instrucciones exactas del propietario: docs/11-google-oauth.md.


## Corrección retorno OAuth — 16/11/2026
Cookie ria_session cambia de SameSite Strict a Lax para permitir el retorno GET de Google. Conserva HttpOnly, Secure en producción, validación de origen en mutaciones y state de un uso ligado a sesión. Usuarios con cookie anterior deben cerrar sesión y volver a entrar. No se ejecutaron tests locales: executor no disponible; compilación a verificar en Vercel y retorno real pendiente del usuario.


## 2026-11-17 — Varios lotes por producto y recepción parcial
- Un albarán admite varias líneas del mismo producto si el seguimiento por lotes está activo, el producto se sigue por lote y cada línea declara un lote distinto. La lectura se asigna a la línea cuyo lote coincide exactamente (etiqueta GS1 o lote tecleado); sin lote, o con un lote que no figura, no se suma nada. No hay asignación por parecido.
- Panel «Lotes y series recibidos»: cantidades agrupadas por lote sin fusionar. Si el albarán no declara lote, lo observado se registra como «no verificable».
- Recepción parcial: al finalizar con faltantes, el operario decide si el resto llegará (estado `partial`, el albarán sigue abierto) o no llegará (cierre con faltantes y motivo obligatorio). Una recepción parcial respalda facturas solo con lo confirmado; lo leído después no cuenta hasta volver a confirmar. Las lecturas ya confirmadas no se pueden deshacer.
- Datos nuevos, todos opcionales y compatibles con el estado guardado: `Receipt.status='partial'`, `Receipt.partialAt`, `Line.confirmed`, `Scan.confirmed`; comando `confirm` con `shortage: pending|missing`. Sin migración SQL.
- 13 pruebas nuevas (67 en total): lotes, parciales y criterios de aceptación de conciliación (150 = 60 + 40 + 50 sin reutilización; 160 deja 10 sin respaldo; factura anterior al albarán se recalcula al confirmar).
- Pendiente: prueba visual interactiva y con PDA real; un mismo lote repartido en dos líneas; exceso sobre un lote concreto en recepción parcial; devoluciones y abonos; foto de etiqueta.


## 2026-11-17 — Clasificación del documento y foto de etiqueta
- La lectura clasifica el documento en la misma llamada (sin gastar un intento extra): `documentType` = invoice, delivery_note, credit_note, other o unknown, con `typeEvidence` literal. Contrato `extract-v2`: las lecturas en caché del contrato anterior no se reutilizan.
- Formulario: muestra el tipo leído. Si no coincide con el tipo elegido, exige confirmación expresa; abonos, otros documentos y tipo desconocido no se pueden guardar como factura o albarán. Desde el correo se puede «Descartar este adjunto» (pasa a Descartados con su original).
- Foto de etiqueta (`POST /api/label`, prompt P02): «Enviar y verificar» transcribe código, lote, serie y caducidad impresa; las dudas dejan el campo vacío para que lo escriba el operario. La comparación con los lotes del albarán es por igualdad exacta en la app, no la hace el modelo. La foto queda como original privado y se asocia a la lectura (`Scan.evidenceId`).
- Lógica de IA común en lib/ai-reader.ts (caché, límite diario compartido de 10, guardado del original). Sin migración SQL.
- 71 pruebas. **No probado contra la API real de Anthropic**: no hay clave en el entorno de desarrollo. Validar en producción con un documento y una etiqueta de prueba antes de usarlo con documentos reales.
- Pendiente: separar varios documentos de un mismo PDF por páginas, registro de abonos, fotografía de etiqueta en la demo.


## 2026-11-17 — Conexión guiada de cualquier correo
- Asistente de tres pasos para conectar cualquier buzón IMAP sin conocimientos técnicos, con detección automática del servidor y mensajes de error comprensibles. Se retiran las referencias a un proveedor concreto. Detalle en docs/10-correo.md.
- 75 pruebas. Pendiente: validación con buzones reales de varios proveedores; conexión con Microsoft (requiere OAuth propio).


## 2026-11-17 — Conexión con Odoo y catálogo compacto
- Tarjeta Odoo en Conexiones. Accesos heredados de la app principal por variables `ODOO_*` (las de Sentidiño BI) o propios con clave API cifrada. Solo lectura. Detalle en docs/12-odoo.md.
- «Sincronizar productos» trae los productos comprables y activos de Odoo y los fusiona con el catálogo sin romper recepciones (comando `syncProducts`). Migración aditiva 005.
- Configuración: el catálogo pasa a una tarjeta compacta con «Ver productos» (ventana con buscador). En albaranes y facturas, el producto se elige en esa misma ventana en lugar de una lista desplegable.
- 84 pruebas. **No probado contra un Odoo real.**


## 2026-11-17 — Preparación como módulo de Sentidiño BI
- Decisión: app aparte enlazada desde el BI. Detalle y contrato en docs/13-modulo-bi.md.
- Accesos de Odoo heredados también del fichero de configuración del BI.
- Entrada con sesión compartida: `GET /api/session/sso` valida un pase firmado de un solo uso (`SENTIDINO_MODULE_SECRET`). Migración aditiva 006. Enlace de vuelta con `SENTIDINO_BI_URL`.
- 89 pruebas. El lado del BI (alta del módulo y ruta que emite el pase) no está hecho. Sin probar de extremo a extremo.


## 2026-11-17 — Pantalla de entrada
- Al llegar al espacio privado: vídeo de fondo a pantalla completa y botón «Entrar» centrado; después, el acceso sobre el mismo fondo. Una vez por sesión del navegador si ya hay sesión iniciada.
- Vídeo alojado en la app (`public/bienvenida/entrada.mp4`, 1280×720, 10 s, 0,5 MB; el original pesaba 11,6 MB) con imagen fija de respaldo (`entrada.jpg`, 35 KB) que se ve al instante. Con «reducir movimiento» o ahorro de datos solo se muestra la imagen.
- Recodificado con el Chrome local (MediaRecorder, H.264). Comprobado en Chrome de escritorio: se reproduce y repite en bucle. Sin probar en Safari/iOS ni en PDA.


## 2026-11-17 — Menú de usuario
- El avatar de la cabecera y la fila de usuario del menú lateral abren un menú con quién está dentro, en qué espacio y las acciones de cuenta: entrar con un usuario real (desde la demostración), cerrar sesión, ver la demostración, configuración, tema y vuelta a Sentidiño BI.
- Corrige que desde la demostración no hubiera forma visible de pasar al acceso real.
- Comprobado visualmente en demostración; las acciones del espacio privado (cerrar sesión, ver demostración) sin probar con sesión real.


## 2026-11-17 — Paso 1 del nuevo objetivo: leer compras de Odoo
- Nuevo rumbo acordado con el propietario: la app valida entradas y facturas, el agente propone y el humano aprueba; se escribirá en Odoo (entrada sobre el pedido, factura de proveedor en borrador) con un panel de autoridad del agente. Esto sustituye la regla anterior de no hacer movimientos en un ERP; la app sigue funcionando sin Odoo.
- Hecho: lectura de pedidos por recibir, entradas, facturas y proveedores de Odoo, con vistas propias. Detalle en docs/12-odoo.md.
- 95 pruebas. Revisado visualmente con datos de ejemplo. **Sin probar contra un Odoo real.**
- Siguiente: recepción contra pedido; emparejamiento de facturas sin número de albarán y alerta de precios; bandeja de validación y autoridad del agente; escritura en Odoo (primero en base de pruebas); automatización del correo.


## 2026-11-17 — Paso 2: recibir contra un pedido de Odoo
- «Recibir este pedido» abre una recepción de la app ligada al pedido, con lo pendiente calculado y el precio acordado guardado. Detalle en docs/12-odoo.md.
- 100 pruebas. Revisado visualmente con datos de ejemplo (pedido desplegado y formulario). Sin probar contra un Odoo real ni el flujo completo a mano. No se escribe en Odoo.


## 2026-11-17 — Paso 3: emparejar facturas sin albaranes y alertar de precios
- Las facturas que no citan albaranes reciben una propuesta por productos recibidos, que una persona acepta o corrige. Las que los citan no cambian.
- Alerta de precio cuando lo facturado no coincide con lo acordado en el pedido, con el impacto en euros. Detalle en docs/04-lectura-conciliacion.md.
- 109 pruebas. Revisado visualmente con datos de ejemplo (alerta de precio y propuesta). Sin probar con facturas reales ni contra un Odoo real.
- Siguiente: bandeja de validación y panel de autoridad del agente; escritura en Odoo; automatización.


## 2026-11-17 — Paso 4: bandeja de validación y autoridad del agente
- Nueva pestaña Validación con lo que requiere decisión, lo listo y lo que espera; validación con un toque o como excepción con motivo; histórico de lo validado con su autor.
- Panel «Autoridad del agente» en Configuración: cuatro permisos, apagados por defecto. Detalle en docs/14-validacion-agente.md.
- 119 pruebas. Revisado visualmente con datos de ejemplo. Sin probar los clics a mano ni con datos reales. No escribe en Odoo.
- Siguiente: escritura en Odoo (entrada sobre el pedido, lotes, factura en borrador), primero en base de pruebas; automatización del correo.


## 2026-11-17 — Paso 6: correo automático
- Revisión diaria programada de los buzones; lectura automática con IA y registro automático de facturas sin dudas, cada uno con su permiso en «Autoridad del agente» (apagados por defecto). Detalle en docs/10-correo.md.
- Requiere `CRON_SECRET` en Vercel. Migración aditiva 007.
- 124 pruebas. Revisado visualmente el panel y la bandeja con datos de ejemplo. **Sin probar con buzón ni API reales.**
- Pendiente del plan: paso 5 (escritura en Odoo), que necesita base de pruebas y usuario con permisos. También: memoria de equivalencias de códigos de proveedor.
