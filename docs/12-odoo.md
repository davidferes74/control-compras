# 12 · Conexión con Odoo (solo lectura)

## Objetivo
Usar en Recepciones-IA los mismos productos que en Odoo y prepararla para integrarse como módulo de Sentidiño BI, que ya tiene acceso a Odoo.

## De dónde salen los accesos
1. **App principal (heredados).** Se leen con la misma precedencia que Sentidiño BI: primero su fichero `data/config.json` (el que crea su asistente; se localiza con `DATA_DIR`, la variable que ya usa el BI, o con `SENTIDINO_BI_CONFIG` como ruta completa) y, para lo que falte, sus variables de entorno. Si existen las variables `ODOO_URL`, `ODOO_DB`, `ODOO_LOGIN` y `ODOO_API_KEY` (y opcionalmente `ODOO_COMPANY_ID`), se usan esas. Son las mismas que utiliza Sentidiño BI: al desplegar esta app junto a la principal, o al copiarle esas variables, queda acoplada sin configurar nada. En ese caso la tarjeta lo indica y no deja editar ni guardar claves.
2. **Propios.** Si no existen, el usuario conecta desde Configuración → Conexiones → Odoo con dirección, base de datos, usuario y clave API. La clave se guarda cifrada (`ria_integrations`, `TOKEN_ENCRYPTION_KEY`).

Los heredados mandan sobre los propios.

## Qué se lee
- `product.product` con `purchase_ok = true` y `active = true`: nombre, referencia interna, código de barras, unidad de medida y seguimiento (lote, serie o ninguno). Máximo 3000 productos por sincronización.
- `product.packaging` con código de barras, si el modelo existe en esa versión: primer embalaje como código de caja con su cantidad.
- Solo `search_read`. La app no escribe en Odoo.
- Transportes: `/jsonrpc` clásico y, si la instancia lo ha retirado (Odoo 19+), `/json/2` con la clave como Bearer. Mismo criterio que lib `odoo.js` de Sentidiño BI.

## Cómo se fusiona con el catálogo
- Producto ya enlazado: se actualiza conservando su id.
- Producto manual con la misma referencia o código: se enlaza a Odoo y conserva su id (las recepciones existentes siguen siendo válidas).
- Producto nuevo: se crea.
- Producto enlazado que ya no viene de Odoo: se archiva, no se borra. Un producto archivado no se puede escanear ni elegir.
- Sin código de barras se usa la referencia interna como código. Sin ninguno de los dos, con código repetido en Odoo o en conflicto con otro producto del catálogo, se omite y se informa.

## Límites y pendientes
- Sincronización manual («Sincronizar productos ahora»); la periódica queda pendiente.
- No probado contra una instancia real de Odoo. La dirección introducida por el usuario debe ser pública y HTTPS; la heredada no se restringe.
- Sin conexión a Odoo el catálogo sigue siendo manual (alta individual o Excel).
- Pendiente: proveedores, pedidos de compra y albaranes de Odoo; escritura de recepciones en Odoo (fuera de alcance por ahora).

## Acoplamiento como módulo de Sentidiño BI
Decisión del propietario (17/11/2026): esta app se integrará en el código de Sentidiño BI como un módulo más que opera de forma autónoma.
- Lo ya preparado: accesos a Odoo compartidos (fichero y variables del BI), mismo sistema visual y misma clave de tema.
- Lo que falta para el acoplamiento real: alta del módulo en `src/catalogo-modulos.js` del BI (clave, nombre, prefijo de API), sesión compartida entre ambas (hoy cada una tiene su propio acceso) y decidir cómo conviven los dos servidores: el BI es Express con JavaScript plano y esta app es Next.js con PostgreSQL.

## Paso 1 (17/11/2026) — Lectura de compras
Objetivo acordado: la app valida entradas y facturas y, más adelante, escribe en Odoo (entrada sobre el pedido y factura de proveedor en borrador) con validación humana. Este paso solo lee.
- `GET /api/odoo/data?kind=orders|receipts|bills|suppliers`: lectura en vivo con caché en memoria de 60 s; `refresh=1` la salta. No se guarda nada en la base de datos de la app.
- **Pedidos por recibir** (`purchase.order` confirmados con recepción pendiente o parcial, hasta 300) con sus líneas: pedido, recibido, pendiente y precio. Sin `receipt_status`, el estado se deduce de las líneas.
- **Entradas en Odoo** (`stock.picking` de tipo entrada, últimas 200) y **Facturas en Odoo** (`account.move` de proveedor y abonos, últimas 200).
- **Proveedores** (`res.partner` con `supplier_rank > 0`, hasta 1000): se sugieren en los formularios de albarán y factura para escribir el nombre exacto.
- Antes de leer cada modelo se pregunta qué campos existen (`fields_get`) y solo se piden esos: los nombres cambian entre Odoo 17, 19 y 20 (p. ej. `product_uom` / `product_uom_id`).
- Vistas: selector en Recepciones (Recepciones · Pedidos por recibir · Entradas en Odoo) y en Facturas (Facturas recibidas · Facturas en Odoo). La demostración enseña datos de ejemplo marcados como tales.
- Sin probar contra un Odoo real. Siguiente paso: recepción contra el pedido de Odoo.

## Paso 2 (17/11/2026) — Recepción contra un pedido de Odoo
- En «Pedidos por recibir», cada pedido tiene «Recibir este pedido»: pide el número y la fecha del albarán y propone, por producto, lo que queda por llegar. El operario ajusta lo que trae esta entrega y se abre una recepción normal de la app (escaneo, lotes, parcial, incidencias) ligada al pedido.
- Lo pendiente de cada producto = pendiente en Odoo − lo que la app ya tiene para ese pedido (lo esperado en recepciones abiertas; lo realmente recibido en las cerradas). Evita recibir dos veces lo mismo mientras la entrada no esté escrita en Odoo. Cálculo en lib/order-receive.ts.
- Correspondencia línea de pedido → producto del catálogo: por id de Odoo si el producto está sincronizado y, si no, por referencia interna exacta. Sin correspondencia, la línea no se puede recibir y se ofrece sincronizar el catálogo. Nunca por nombre.
- La recepción guarda `order` (id y nombre del pedido) y, por línea, `orderLineIds` y el precio acordado, para la validación y la escritura posteriores. Campos opcionales; sin migración.
- Un pedido con el mismo producto en varias líneas se recibe como una sola línea.
- Sigue sin escribirse nada en Odoo. Pendiente: leer el albarán con IA para proponer cantidades, y la escritura de la entrada.
