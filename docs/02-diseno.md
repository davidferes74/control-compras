# 02 · Pantallas y experiencia móvil

## Referencias elegidas por el usuario

- https://github.com/emilkowalski/skills
- https://aiforui.dev/skills

Revisadas en la conversación: mobile-native y emil-design-eng. Al implementar, leer versión vigente y registrar commit elegido; añadir break-ui para pruebas de contenido extremo. No copiar una web promocional. Aplicar claridad, estados de pulsación, rendimiento y accesibilidad.

## Dirección visual propuesta

App profesional en español, superficies claras, texto oscuro, un acento de marca sobrio. Identidad final/logo de Sentidiño pendientes, no inventar una identidad oficial. Densidad reducida para recepción; mayor detalle para Administración en tablet/escritorio.
Botones táctiles de al menos 48 px como objetivo de producto, texto de entrada mínimo 16 px, contraste suficiente, foco visible, etiquetas explícitas y soporte zoom. No deshabilitar zoom.
Acciones principales abajo sin quedar bajo teclado/notch; safe areas y altura dinámica. No depender de hover ni gestos ocultos. Animaciones cortas que nunca bloqueen una lectura ni desplacen el botón bajo el dedo.
En móvil usar tarjetas/filas; evitar tablas horizontales como experiencia principal. Tablet: lista y detalle cuando quepan.

## Navegación propuesta

Operario: Recepciones / Escanear / Incidencias. Administración: además Facturas / Comparaciones. Configuración fuera del flujo repetitivo.
Cada recepción identifica proveedor, albarán, fecha, progreso y estado. Al salir conservar borrador; al volver restaurar recepción activa.
Estados vacíos, permisos denegados, cámara no disponible, carga, pérdida de conexión y error de guardado deben tener acciones claras.

## Pantallas

| Pantalla | Contenido y acciones |
|---|---|
| Acceso | Login privado, organización y rol; ninguna recepción accesible sin sesión. |
| Inicio/Recepciones | Pendientes, en curso, cerradas; buscar proveedor/albarán; Nueva recepción; continuar última. |
| Nueva recepción | Foto, galería o PDF; varias páginas, reordenar/eliminar antes de enviar; calidad y progreso. |
| Revisión del albarán | Original junto a campos en tablet, alternar en móvil; marcar campos dudosos; confirmar proveedor y líneas. |
| Escaneo de recepción | Lector activo, última lectura, producto y esperado/recibido/pendiente; Deshacer; incidencia; finalizar. |
| Detalle de línea | Unidades/embalaje, lotes y series si activos, evidencia y edición controlada. |
| Captura de etiqueta | Cámara/archivo, foto previa, repetir, Enviar y verificar; resultado esperado/detectado. |
| Cierre | Faltantes, sobrantes, dañados, series/lotes pendientes; confirmar parcial o cerrar con incidencias justificadas. |
| Facturas | Ingreso por correo/manual, proveedor, número, importe y estado; mostrar documentos todavía sin recepción. |
| Comparación | Una factura con varios albaranes y viceversa; desglose por línea y asignación; propuestas y revisión. |
| Incidencias | Filtros, responsable, original, diferencia cuantificada, motivo, resolución con auditoría. |
| Histórico | Buscar documentos/recepciones por proveedor, fecha, referencia, producto, lote/serie y estado. |
| Configuración general | Control lotes/series, tolerancias, usuarios y permisos, conexiones, costes y plantillas. |
| Lectores/PDA | Lista de perfiles, asistente y banco de pruebas detallados en 03. |

## Ejemplo de interacción

Abrir recepción ALB-001 → escanear producto → “Arroz 1 kg · 3 de 10 unidades” → seguir escaneando.
Código desconocido → conservar lectura, advertencia persistente, asignar producto o apartar incidencia; no sumar a línea arbitraria.
Serie repetida → rechazo de suma, indicar lectura original.
Exceso → aviso antes de aceptar sobre-recepción con motivo.
No abrir un modal para cada lectura correcta. Sonido de éxito solo tras aceptación, diferenciado de lectura física del escáner.

## Visibilidad condicional

Control de lotes/series desactivado: desaparecen controles en nuevas recepciones y configuración operativa corriente; histórico mantiene datos registrados. Perfil de producto sin seguimiento no obliga a introducir lote.
Escaneo por código de producto es funcionalidad básica, independiente del módulo opcional de lotes/series.

## Feedback

Texto + icono + color; sonido/vibración opcional según soporte y configuración.
Mostrar “capturado”, “pendiente de sincronizar” y “guardado” de forma distinta. No decir recibido en servidor solo por actualizar estado React.
Deshacer última lectura invierte el evento de captura con auditoría. Si ya está conciliado o confirmado, reabrir/recalcular de forma controlada.
Validación final siempre explícita; lectura de un código nunca cierra el albarán por sí sola.

## Validación de UX

Probar a 360/390 px, tablet vertical/horizontal y escritorio; nombres largos, más de 100 líneas, códigos largos, teclado visible y zoom.
Prueba real móvil/PDA indispensable: gatillo, foco, teclado virtual, sonido, cámara, conexión deficiente. Emulación no certifica hardware.
