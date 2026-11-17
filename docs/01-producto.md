# 01 · Producto y requisitos

## Contexto y alcance acordado

El usuario es David. Producto: Recepciones-IA, marca Sentidiño. Se empieza con aproximadamente 100 documentos mensuales. Correo previsto Google o Dinahosting (primer buzón por elegir), Google Drive como archivo. Base de datos propia. Alojamiento en Vercel. Sin integración ERP obligatoria.

Se dijo inicialmente “factura de venta”: en este proyecto significa factura emitida por el proveedor, es decir factura de compra para el usuario. No construir conciliación de ventas a clientes.

## Actores (roles propuestos)

- Operario: recibe, fotografía, escanea, corrige sus capturas antes de confirmar, comunica incidencias y confirma recepción.
- Administración: consulta facturas, revisa asociaciones, precios, diferencias y excepciones.
- Administrador: usuarios, conexiones, configuración, plantillas y perfiles de lectores.
- Lectura: rol opcional posterior, no necesario para H1.
Permisos de servidor, no solo ocultación de botones. Permitir al usuario autorizado configurar lectores sin programador. No dar acceso a secretos al operario.

## Requisitos verificables

| ID | Requisito |
|---|---|
| R01 | Foto multipágina/PDF de albarán; proveedor, número, fecha, pedidos, productos, cantidades y unidades. |
| R02 | Captura automática de facturas adjuntas de correo y archivo privado en Drive. |
| R03 | Recepción física independiente de datos extraídos; diferencias, recepción parcial y cierre explícito. |
| R04 | Escaneo con móvil, tablet, PDA y lector externo según capacidad verificada. |
| R05 | Lotes/series opcionales por empresa y seguimiento por producto; fotografía de etiqueta con botón Enviar y verificar. |
| R06 | Asistente separado para perfiles de PDA/lector, formatos y pruebas por el usuario. |
| R07 | Conciliación automática al llegar factura, albarán, escaneo, confirmación o corrección. |
| R08 | Factura con varios pedidos/albaranes y albarán distribuido en varias facturas, con asignaciones por línea/cantidad. |
| R09 | Comparación de producto, unidades/cantidades, lotes/series si hay referencia y precios solo con referencia disponible. |
| R10 | Aprendizaje de diseños por proveedor basado en plantillas validadas, versionado y reutilización. |
| R11 | Optimización coste mediante parsing, OCR, caché y modelos económicos; escalado solo cuando sea necesario. |
| R12 | Persistencia, histórico, evidencia original y usuario/fecha/motivo de decisiones. |
| R13 | UX mobile-first intuitiva, escaneo continuo, deshacer y feedback visible sin depender solo del color. |
| R14 | No convertir falta de datos o baja confianza en “conforme”. |
| R15 | Cola duradera, reintentos y deduplicación; concurrencia sin doble recepción ni doble facturación. |

## Tres comparaciones separadas

A. Mercancía física vs albarán: qué producto llegó, cuánto, lote/serie y estado.
B. Factura vs recepciones/albaranes: qué cantidad se factura y qué recepción la respalda.
C. Precio facturado vs precio acordado: solo si hay albarán valorado, pedido o tarifa válida.
Si falta precio en albarán, Administración lo revisa por su cuenta. UI: “Recepción conforme. Precio no comprobado: revisión de Administración”. No bloquear trabajo de almacén por esta ausencia.

## Estados independientes

No mezclar todo en un único semáforo:
- Documento/proceso: recibido, archivando, extrayendo, revisión, listo, error recuperable.
- Recepción: borrador, en curso, parcial confirmada, confirmada, cerrada con incidencias, anulada.
- Conciliación: pendiente de documentación, pendiente de confirmación física, parcial, con discrepancias, revisión necesaria, conforme en controles aplicables.
- Control económico: no verificable, pendiente de Administración, conforme, discrepancia, excepción aceptada.
- Sincronización: pendiente local, guardado servidor, error/reintento.
“Excepción aceptada” nunca cambia el dato para fingir coincidencia. Mostrar razón y responsable.
Cerrar recepción no significa pagar ni contabilizar factura.

## Reglas operativas

- El albarán puede llegar antes o después de la factura. Reprocesar solo expedientes afectados.
- Identificador comercial siempre contextualizado por empresa/proveedor/tipo, no global.
- Número de factura repetido puede requerir revisión; no eliminar por coincidencia de nombre de archivo.
- Documento corregido genera revisión/versionado e invalida comprobaciones afectadas.
- Anulaciones y devoluciones conservan histórico; no borrar evidencias.
- Un producto puede venir en varios lotes; cada cantidad se asigna a su lote.
- Serie identifica una unidad dentro del producto; no usar solo serie como identificador global.
- No imponer caducidad si no existe ni fue activada como control.
- Proveedor o referencia desconocida: selección/revisión, nunca adivinación.
- Las sugerencias de equivalencia necesitan confirmación antes de reutilizarse automáticamente.

## Fuera del alcance inicial

No contabilidad, pagos, pedidos a proveedores, portal público, valoración de inventario completa, WMS completo, integración automática Odoo/ERP, entrenamiento de modelo propio ni soporte universal de SDK de todas las PDA. Capturar recepción no escribe stock de ningún ERP.
No se ha solicitado uso multiempresa avanzado, pero aislar datos por organización desde el principio.
