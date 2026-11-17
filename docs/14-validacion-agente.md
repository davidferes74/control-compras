# 14 · Validación y autoridad del agente

## Idea
El agente (lectura con IA + reglas exactas) deja cada recepción y cada factura comprobada. La persona solo da el visto bueno. En Configuración decide qué puede dar por bueno el agente sin esperarla.

## Validar
- Una **recepción** se valida cuando está confirmada o cerrada. Una **factura**, en cualquier momento.
- Si está conforme, basta un toque. Si no (diferencias, incidencias abiertas, precio distinto, precio no comprobable, unidades sin respaldo), hay que escribir un motivo y queda como **excepción**: la diferencia no se borra.
- Cada validación guarda quién (persona o agente), cuándo y, en las facturas, un retrato de lo validado (albaranes, cantidades, resultado del precio). Si esos datos cambian después, la validación se retira sola y vuelve a la bandeja.
- Se puede deshacer. Lo que una persona deshace, el agente no lo vuelve a validar por su cuenta.
- Validar todavía no escribe nada en Odoo: será la condición para hacerlo.

## Bandeja (pestaña Validación)
| Grupo | Qué contiene | Acción |
|---|---|---|
| Requieren tu decisión | Precio distinto, propuesta de emparejamiento, recepción con diferencias o incidencias, precio no comprobable | Aceptar propuesta · Validar con excepción · Abrir |
| Listo para validar | Recepciones conformes y facturas con cantidades y precios conformes | Validar (una o todas) |
| En espera | Facturas a las que aún les faltan entregas o albaranes | Abrir |

«Validado» lista lo ya validado con su autor y permite deshacer. «Hecho por el agente» muestra sus últimas acciones.

## Autoridad del agente (Configuración)
Cuatro interruptores, apagados por defecto (`Workspace.agent`):
- **Validar recepciones conformes**: confirmada, todas las líneas iguales a lo esperado, sin incidencias abiertas.
- **Aceptar emparejamientos completos**: factura sin albaranes cuya propuesta cubre todas sus unidades.
- **Validar facturas conformes**: todas las unidades respaldadas y precio igual al acordado.
- **…también si el precio no se puede comprobar**: solo con el anterior activo.

- **Leer las facturas que llegan por correo** y **…registrar las que no dejan dudas**: actúan en la revisión programada del buzón (docs/10-correo.md).

Un precio distinto, una diferencia de cantidad o una incidencia abierta nunca los valida el agente.

## Cómo actúa
Tras cada cambio de datos (`afterChange` en lib/domain.ts) se recalcula la conciliación, se retiran las validaciones que ya no corresponden y se aplican, en bucle hasta que no quede nada, las reglas autorizadas. Son reglas deterministas sobre datos ya calculados: la IA no decide validaciones. Cada acción queda en el histórico con `by:'agent'` y el prefijo «Agente ·».

## Límites
- Un solo usuario administrador: «persona» no distingue quién. Roles pendientes.
- La autoridad es global, no por proveedor ni por importe.
- Sin escritura en Odoo (siguiente paso).
