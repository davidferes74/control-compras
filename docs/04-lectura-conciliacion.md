# 04 · Lectura documental y conciliación automática

## Dos tareas distintas

Extracción convierte documento en datos con evidencia y grado de incertidumbre.
Conciliación relaciona datos validados y calcula diferencias mediante reglas. No delegar al LLM las transacciones ni la decisión de consumir cantidades.
“Agente automático” significa ejecución al llegar información, no llamada obligatoria a IA cada vez.

## Pipeline de lectura

1. Validar tipo/tamaño, huella, páginas y organización. Detectar duplicados exactos.
2. Conservar original inmutable y metadatos de procedencia: correo/adjunto/cámara/subida.
3. PDF con capa textual: extraer texto y coordenadas primero. Detectar capa defectuosa.
4. Foto/escaneo: orientación, recorte, perspectiva, calidad/borrosidad y OCR. Conservar original, no recortar evidencia irreversiblemente.
5. Reconocer proveedor y diseño mediante estructura, encabezados/anclas y referencias; no solo coordenadas fijas.
6. Plantilla conocida validada: extracción por reglas y verificación de campos/líneas.
7. Si formato nuevo o ambiguo: modelo económico con salida estructurada y esquema estricto.
8. Si siguen faltando datos: solicitar nueva foto/corrección o escalar de forma limitada a modelo más capaz sobre zona/página relevante.
9. Validar fechas, proveedor, referencias, conteo de líneas, unidades y cálculos; guardar valores crudos, normalizados, origen/página/zona y alertas.
10. Emitir evento de datos listos. Lectura en revisión no se trata como evidencia final.

No confiar solo en “confidence: 0.99” del modelo. Usar consistencia, evidencia y evaluación medida por campo.
Detectar encabezados repetidos, sumas de página, líneas partidas, documentos multipágina y múltiples documentos en un PDF. La separación de documentos debe poder revisarse.
Campos ausentes = null/desconocido con razón; no inventar precio cero ni completar lote por parecido.
Guardar lectura original separada de corrección humana. Cambios en campos críticos recalculan resultados.

## Plantillas y aprendizaje

Ámbito organización + proveedor + tipo documental + versión de diseño. Un proveedor puede tener múltiples diseños y delegaciones.
Plantilla: anclas, estructura de tabla, mapeo de campos/unidades, reglas de normalización, muestras verificadas y métricas.
Primera lectura validada puede producir plantilla candidata; la activación automática requiere pruebas sobre muestras independientes. Con una sola muestra no garantizar que reconoce todos los documentos.
Correcciones proponen ajustes; no propagar automáticamente una corrección de un documento a todo el proveedor.
Detección de deriva: plantilla falla controles o cambian anclas → revisión/nueva versión. Históricos conservan versión utilizada.
Aprendizaje significa plantillas/equivalencias/versionado, no fine-tuning por defecto.

## Coste y selección de modelos

Medir por documento/página/campo, incluyendo OCR, imágenes, tokens, reintentos y modelo.
Presupuesto por organización y techo por documento; valores por acordar, no inventar presupuesto autorizado.
Caché por huella + versión de extractor/modelo/prompt/plantilla/esquema. Cambiar configuración invalida lo pertinente.
No enviar todo el expediente para resolver un campo ni leer de nuevo imágenes idénticas.
Captura de código y comparación determinista no usan LLM.
Elegir modelos y OCR tras benchmark con documentos reales, coste y latencia. No fijar “el último” como requisito suficiente.
Agotamiento de presupuesto: guardar documento, estado pendiente y aviso; no perder datos ni escalar ilimitadamente.
Panel: gasto, estimado/real, tasa de lectura sin LLM, revisiones, errores y modelos/plantillas utilizadas.
No prometer un porcentaje de ahorro o exactitud antes de medirlo.

## Eventos que disparan conciliación

invoice.extracted, delivery_note.extracted, receipt.scan_accepted, receipt.confirmed, extraction.corrected, mapping.confirmed, document.revised, receipt.returned, assignment.changed.
Lotes/series capturados recalculan la línea y el estado del expediente; una factura no cambia por cada fotograma de cámara.
Agrupar ráfagas de escaneo con debounce acotado sin perder eventos. Pantalla actualizada por polling o suscripción; no exigir botón Comparar.
Factura anterior a albarán o al revés: mismo resultado final al quedar disponibles ambos.

## Búsqueda de candidatos

1. Aislar organización, proveedor e identidad documental.
2. Referencias explícitas de pedido/albarán, líneas y producto; no exigir pedido ERP.
3. Equivalencias de referencias y códigos confirmadas por proveedor.
4. Fechas y cantidades pendientes como evidencia auxiliar, nunca prueba única.
5. Descripciones: similitud/IA solo sugiere candidatos. Empates o falta de referencia → revisión.
Un importe coincidente no demuestra correspondencia. No cruzar proveedores por nombres parecidos.
No reasignar silenciosamente vínculos confirmados por un humano.

## Modelo de relación

Factura tiene líneas. Albarán tiene líneas declaradas. Recepción física tiene líneas observadas vinculadas al albarán cuando procede.
Una asignación relaciona una línea de factura y una porción de una línea de recepción, con unidad base, cantidad decimal, evidencia, autor/método y versión.
Puede existir vínculo documental provisional con albarán sin confirmación física: no consume disponibilidad de recepción confirmada ni produce “conforme físico”.
Una factura puede agrupar N albaranes/pedidos. Un albarán puede alimentar N facturas parciales.
No usar un único invoice_id en la cabecera de albarán como modelo de conciliación.

## Invariantes

- Cantidad disponible = recibido confirmado - devolución confirmada - asignaciones activas a facturas (ajustada por reversos aprobados).
- No asignar más que disponibilidad física ni más que cantidad pendiente de factura.
- Transacción + bloqueo/serialización o control optimista con reintento; un SELECT sin bloqueo seguido de INSERT no basta.
- Decimales exactos y unidad normalizada; si no hay conversión, bloquear asociación automática.
- Factura sin recepción puede quedar pendiente de documentación, no automáticamente fraudulenta.
- Cantidad reclamada/pedida no sustituye cantidad recibida.
- Anulación/revisión libera o revierte asignaciones con auditoría y recalcula; no borrar histórico.
- Notas de abono/devoluciones se representan explícitamente; no mezclar negativos con consumo normal sin lógica definida.
- Un nuevo escaneo pendiente no cambia retroactivamente el cierre sin revisión/versionado.

## Comparación

| Campo | Regla |
|---|---|
| Producto | ID/equivalencia confirmada; semántica solo propuesta. |
| Cantidad | Unidad base y conversión aprobada; tolerancia explícita si procede. |
| Lote/serie | Exacto con normalización aprobada; ausencia en una parte = no verificable. |
| Precio | Comparar moneda, unidad, base neta y descuentos; sin referencia = Administración. |
| Importes | Aritmética decimal, redondeos y desglose impuestos/portes; no asignar portes como mercancía. |
| Duplicado | Huella exacta y clave comercial contextualizada; colisión comercial requiere revisión. |

Tolerancia de cantidad inicial propuesta cero en unidades discretas; pesos/medidas y dinero requieren valores confirmados. Nunca introducir tolerancias ocultas.
“Conforme” incluye alcance: cantidades/productos frente a recepción y qué controles no se pudieron hacer.

## Ejemplo acordado

Albaranes A=60, B=40, C=50 unidades del mismo producto y unidad; A/B del pedido 1, C del pedido 2.
Factura de 150: asignaciones 60+40+50, si recepción física confirmada y vínculos suficientes.
Factura de 160: 150 respaldadas, 10 sin recepción asociada; pendiente/discrepancia según documentación y confirmación, con explicación.
Si C falta: 100 respaldadas, 50 pendientes. Al llegar/confirmar C se reconcilia automáticamente.
Una segunda factura no puede consumir de nuevo esas 150.

## Ampliación 17/11/2026 — Emparejamiento sin albaranes y control de precios
- **Dos pasadas.** Primero las facturas que citan albaranes (solo contra esos albaranes del mismo proveedor). Después, las que no citan ninguno: se proponen las entregas confirmadas de ese proveedor con los mismos productos y aún sin facturar, de la más antigua a la más reciente y nunca posteriores a la fecha de la factura.
- **Una propuesta no respalda.** Las asignaciones propuestas llevan `basis:'product'`; `invoiceSummary` las cuenta en `proposed`, no en `matched`. La persona pulsa «Aceptar emparejamiento» (`acceptMatch`), que convierte la propuesta en albaranes explícitos de la factura, o elige los albaranes a mano (`setInvoiceRefs`).
- Las propuestas reservan cantidades para que dos facturas no reciban la misma propuesta, pero nunca le quitan nada a una factura que cita albaranes.
- **Precios** (`priceCheck`): precio de la línea de factura frente al acordado, que es el del pedido de compra guardado en la línea de recepción. Comparación exacta a 4 decimales, entrega por entrega. Estados: conforme, distinto (con impacto en euros = diferencia × unidades) o no comprobable (sin precio en la factura, sin precio acordado o sin respaldo completo). Nunca se da por bueno lo que no se puede comprobar.
- Límites: la propuesta no cruza proveedores ni compara nombres parecidos; el proveedor debe coincidir exactamente. No hay tolerancia de precio configurable. Los albaranes creados a mano no tienen precio acordado.
