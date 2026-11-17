# 08 · Plan de implementación, decisiones y pendientes

## Qué está decidido por el usuario

Nombre Recepciones-IA; repo privado davidferes74/Recepciones-IA; Vercel; independencia ERP; DB propia; Google Drive; correo Google o Dinahosting; ~100 documentos/mes; albaranes a veces sin precio y revisión económica por Administración.
Captura de fotos/albaranes y facturas; conciliación automática ante nueva información; múltiples pedidos/albaranes por factura; lectura de producto con móvil/tablet/PDA; foto de lote/serie y botón enviar/verificar; módulo opcional ocultable.
Plantillas por proveedor/diseño para reducir tokens; IA económica cuando sea fiable; prioridad precisión y facilidad de uso. Referencias de diseño de Emil Kowalski.
Configuración manual/guiada de cada lector por usuario, con prueba y validación.

## Propuestas técnicas, no decisiones impuestas

Next.js/TypeScript, Neon PostgreSQL, AI Gateway, agentes durables/eve según herramientas disponibles, PWA, roles sugeridos, IDs y contratos del documento 05.
Se pueden adaptar si hay razón documentada. No cambiar Vercel/Drive o introducir ERP obligatorio sin hablarlo con el usuario.
No se ha elegido modelo de IA, OCR ni servicio de autenticación. Elegir tras documentación y pruebas; no pedir al usuario decisiones de librerías rutinarias.

## Hitos

### H0 · Preparación
Inspeccionar repo, leer instrucciones, crear docs/ESTADO.md y decisiones. Revisar referencias UI. Preparar stack, scripts, autenticación de prueba y configuración sin secretos. Elegir dependencias compatibles y fijar lockfile. No desplegar documentación como si fuese app.

### H1 · Prototipo funcional con datos sintéticos
Pantallas operario y Administración, DB con migraciones, fixtures, carga manual y estado de documento.
Recepciones y confirmación física; scanner tipo teclado + simulador claramente marcado; lotes/series opcionales; perfil de PDA y banco de pruebas.
Motor determinista y eventos con asignaciones parciales; incidencias, histórico, permisos y pruebas.
Sin proveedor OCR conectado: mostrar pendiente o usar fixture explícito, nunca fingir leer el PDF.
Prototipo apto para preview privado y revisión del flujo, no producción.

### H2 · Lectura real y optimización
Conectar OCR/IA, extracción estructurada y evidencias, revisión de usuario, plantillas versionadas, detección de deriva, límites de coste y métricas.
Lectura cámara de códigos y foto de etiquetas. Pruebas con muestras reales antes de activar conformidad automática.

### H3 · Integraciones reales
Autorizar Drive y primer buzón, ejecutar archivado, ingestión incremental, deduplicación y conciliación automática.
Completar reintentos durables, caducidad de credenciales, colas de errores y estado conexión.
Segundo conector de correo previsto y documentado; implementarlo/probarlo antes de anunciar que ambos están operativos.

### H4 · Piloto y despliegue
PDA/modelo real configurado desde asistente por usuario, UX sobre dispositivo físico, tests de concurrencia y aislamiento.
Configurar proyecto Vercel recepciones-ia en equipo correcto, DB y variables seguras, entorno preview y producción separados.
Prueba completa: correo factura → Drive → extracción → albarán fotografiado → escaneos → confirmación → conciliación → histórico.
Entrega con enlaces, pruebas, límites y manual breve. No activar pagos/ERP.

## Información pendiente y cuándo bloquea

| Pendiente | Bloquea | Se puede avanzar con |
|---|---|---|
| Buzón exacto y Google/Dinahosting inicial | Lectura correo real | Carga manual + adaptador simulado explícito. |
| Cuenta/carpeta Drive y autorización | Archivo real | Adaptador de pruebas y almacenamiento privado de desarrollo. |
| Neon/proyecto DB y autenticación app | Persistencia desplegada/acceso real | PostgreSQL de desarrollo y roles de demo aislados. |
| Servicio IA/OCR, credenciales y presupuesto | Extracción real/gasto | Fixtures de extracción y motor sin LLM. |
| 2–3 albaranes mismo diseño y facturas, uno agrupado | Benchmark y plantilla real | Ejemplos sintéticos. |
| Fotos de etiquetas/códigos de unidades y cajas | Mapeo real y reglas | Fixtures estándar y configuración guiada. |
| Marca/modelo PDA, OS y navegador | Compatibilidad certificada | Scanner teclado, simulador y cámara en hardware disponible. |
| Usuarios y correo administrador | Altas reales | Identidades sintéticas en entorno de prueba. |
| Unidades, embalajes y tolerancias reales | Asociación automática en esos casos | Cero tolerancia en unidades discretas y revisión. |
| Logo/identidad final | Acabado visual de marca | UI neutral profesional con nombre real. |
| Retención y recuperación de datos | Piloto productivo definitivo | Política técnica provisional documentada. |

No pedir todos los pendientes de nuevo para empezar. Solicitar solo el que desbloquee el hito activo.

## Referencias para verificar al implementar

- Diseño: https://github.com/emilkowalski/skills y https://aiforui.dev/skills
- Storage: https://vercel.com/docs/marketplace-storage
- IA Gateway: https://vercel.com/docs/ai-gateway
- Neon: https://neon.com/docs
- Gmail API: https://developers.google.com/workspace/gmail/api/guides
- Drive API: https://developers.google.com/workspace/drive/api/guides/about-sdk
- Zebra DataWedge: https://techdocs.zebra.com/datawedge/latest/guide/output/keystroke/
- GS1 identificadores: https://ref.gs1.org/ai/
- Dinahosting: consultar documentación oficial y configuración concreta del buzón antes de implementar.
Son referencias, no evidencia de integración ya hecha ni promesa de planes gratuitos.

## Registro de decisiones

Crear ADR breves cuando se elijan autenticación, cola durable, OCR/modelos, política de duplicados, precisión/tolerancias, archivo temporal y modo offline.
Cada decisión debe indicar motivo, alternativas relevantes, prueba y limitación.

## Definición de entrega a David

App privada accesible desde móvil/tablet; instrucciones para configurar un lector sin programar; recepción real y comparación automática; datos durables; sin falsas conformidades; estado claro de todo control no verificable.
Separar entrega visual, prototipo funcional y piloto real. Documentar pendientes en vez de ocultarlos.
