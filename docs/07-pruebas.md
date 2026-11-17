# 07 · Criterios de aceptación y pruebas

No prometer “sin fallos”. Medir precisión por campo, tasa de falsos conformes, revisión manual, latencia y coste con ejemplos reales. Modelos nuevos requieren regresión antes de sustituir el anterior.

## Matriz funcional mínima

| Caso | Entrada/acción | Resultado obligatorio |
|---|---|---|
| T01 | Albarán de 10, recepción confirmada 10, factura 10 | Coincidencia por producto/cantidad; precio según evidencia. |
| T02 | Factura 150, recepciones 60/40/50 de dos pedidos | Tres asignaciones exactas y sin saldo residual. |
| T03 | Factura 150 antes del tercer albarán de 50 | 100 asociadas, 50 pendientes; llegada/confirmación completa automáticamente. |
| T04 | Recibido 100, factura A=60, B=40 | Ambas asociadas; una factura C no puede reutilizar cantidades. |
| T05 | Dos workers asignan los mismos 100 simultáneamente | Total asignado nunca supera 100; resultado consistente tras reintento. |
| T06 | Mismo adjunto reenviado o job ejecutado dos veces | No duplica documento/consumo/coste innecesario. |
| T07 | Albarán 10 pero físicamente llegan 8 | Faltan 2; OCR por sí solo no valida recepción de 10. |
| T08 | Factura 160 con recepciones 150 | 10 sin respaldo; no conforme global. |
| T09 | Albarán sin precio | Productos/cantidades verificables; precio no comprobado Administración. |
| T10 | Factura sin lote, albarán con lote | Lote conservado; comparación de lote no verificable. |
| T11 | Lote físico distinto al declarado | Diferencia explícita; no autocorregir para igualar. |
| T12 | Lotes desactivados | Ningún campo/botón obligatorio en nuevas recepciones; historial intacto. |
| T13 | Activados, producto sin seguimiento | Escanea producto sin exigir lote/serie. |
| T14 | Mismo código genérico dos veces intencionalmente | Suma dos unidades; no deduplicar por valor. |
| T15 | Misma serie dos veces para mismo producto/recepción | Segunda no suma; aviso persistente. |
| T16 | Reenvío del mismo capture UUID tras reconexión | Se aplica una vez. |
| T17 | Cámara ve el mismo código en 30 fotogramas | Una lectura hasta rearmado. |
| T18 | Caja confirmada de 12 unidades | Un escaneo suma 12; conversión desconocida solicita revisión. |
| T19 | Código GS1 con lote variable y separador ASCII 29 | Parseo correcto, original preservado, sin confundir campos. |
| T20 | Código truncado/checksum inválido/identificador largo | Rechazo o revisión sin asignación falsa ni desborde UI. |
| T21 | Enter/Tab del lector | Completa lectura, no cierra formulario ni recepción accidentalmente. |
| T22 | Escáner mientras se editan notas | No corrompe notas ni captura fuera del modo activo. |
| T23 | Perfil nuevo o modificado | Pruebas requeridas; activar conserva versión y estado. |
| T24 | Banco de pruebas | No crea movimientos ni asignaciones ni modifica recepciones. |
| T25 | Deshacer última captura | Revierte cantidad y tracking correspondiente con auditoría. |
| T26 | Recepción cerrada en otro dispositivo durante offline | Conflicto explícito al sincronizar; no reabrir silenciosamente. |
| T27 | Fotografía borrosa/cortada | Repetir o revisar; no conforme por estimación del modelo. |
| T28 | Proveedor cambia diseño | No aplicar plantilla vieja sin controles; candidato nuevo versionado. |
| T29 | Dos proveedores con misma referencia | No cruzar productos/documentos entre proveedores por similitud. |
| T30 | Dos albaranes iguales en cantidad, sin referencia suficiente | Propuesta/revisión, no asignación arbitraria. |
| T31 | Corrección manual tras asociación | Invalida/recalcula lo afectado; no pierde decisión humana silenciosamente. |
| T32 | Fallo de Drive, OCR o worker | Estado visible y recuperación idempotente sin pérdida de original. |
| T33 | Presupuesto IA agotado | Guarda pendiente, no escalado ilimitado ni falso éxito. |
| T34 | API con usuario de otra organización | Acceso rechazado a archivo, recepción, perfil y evento. |
| T35 | Instrucciones maliciosas en factura/QR | Se tratan como contenido, sin ejecución ni exfiltración. |
| T36 | Devolución tras factura asociada | Reverso/alerta y revisión; no cantidades negativas opacas ni borrado. |
| T37 | Abono, portes, impuestos/redondeo | Tratamiento separado de mercancía, cálculo decimal explicable. |
| T38 | Factura con varios PDF/documentos y páginas | No omite líneas ni mezcla cabeceras, evidencia por página. |
| T39 | Caducidad/fecha ilegible o ambigua | No inventar; campo con revisión y dato original. |
| T40 | Sin sesión / URL directa del documento | Datos privados no accesibles. |

## Pruebas automatizadas

- Unitarias: normalización segura, checksum, parser GS1, conversiones, cantidades decimales, estado de controles y esquema de extracción.
- Integración real PostgreSQL: transacciones, bloqueos, asignaciones, outbox, lease, reintentos, correcciones y aislamiento.
- End-to-end: crear recepción → cargar documento/fixture → escanear → confirmar → conciliar → ver histórico; perfil de lector → probar → activar; precios no verificables; carga/errores.
- Test de desconexión y recarga; el modo demo no oculta fallos del adaptador real.
- Regresión documental: varios diseños, PDFs textuales/fotos, baja luz, rotación, multipágina, líneas partidas, ceros iniciales, cantidades españolas.
- No escribir tests que solo repliquen implementación sin comprobar invariantes.

## Evidencia física necesaria

Modelo/OS/navegador exactos; tipo de lector y simbologías; ritmo de ráfagas; teclado y gatillo; cámara real; condiciones de luz/reflejos; pérdida de Wi-Fi; guantes si se usan.
Registrar probado/no probado por dispositivo. No afirmar compatibilidad general a partir de emulación.
Pruebas de UX: 360/390 px, tablet ambas orientaciones, textos largos, 100+ líneas, zoom, lector de pantalla, permisos cámara denegados.
Objetivo propuesto de feedback local: <200 ms tras trama completa en dispositivo representativo; medir, no garantía previa. OCR/conciliación asíncronos con progreso.

## Puertas de salida

H1: flujo sintético íntegro persistente y tests básicos sin IA real.
H2: documentos reales con evidencia y corrección; precisión medida, límites de coste.
H3: correo/Drive reales, reintentos y end-to-end.
H4: PDA real configurada por usuario, regresión/concurrencia/seguridad y despliegue privado.
No considerar “producto terminado” solo por superar H1. Publicar limitaciones verificadas.
