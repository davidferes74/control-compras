# 03 · Lectores, PDA, códigos y configuración por el usuario

## Objetivo

Pantalla aparte donde un usuario autorizado pueda configurar cualquier lector compatible con los modos implementados, sin programar, y verificar su comportamiento antes de usarlo.
No prometer compatibilidad universal: “cualquier modelo” es objetivo de extensibilidad. Los modos especiales necesitan adaptador y validación real.

## Modos

1. Lector tipo teclado (keyboard wedge): PDA, USB o Bluetooth que entrega caracteres al navegador. Primer objetivo.
2. Cámara móvil/tablet: decodificador específico de códigos con fallback compatible; no depender exclusivamente de BarcodeDetector sin comprobar soporte.
3. Integración del fabricante: fase posterior/adaptador según modelo, Android, navegador y SDK. No simular que una web recibe Android Intents de forma universal.
4. Entrada manual explícita como recuperación, registrada como tal.

Fotos de texto usan OCR/IA; códigos legibles se decodifican directamente. Un lector 1D no lee necesariamente QR/DataMatrix; mostrar limitación según pruebas.

## Perfil persistido y versionado

Nombre, organización, dispositivo lógico, marca/modelo/OS/navegador informativos, modo, prefijo/sufijo, terminador Enter/Tab/otro, delimitador, timeout de trama, simbologías esperadas, parser GS1/personalizado, mapeo de campos, modo cantidad y feedback, pruebas y estado.
Guardar versión, creador, fecha de validación y dispositivo probado. No fingerprint invasivo; identificador local registrado seleccionable.
Estados: borrador, pendiente de pruebas, validado, retirado. Cambiar parser/encuadre invalida validación; conservar versión anterior y permitir restaurar.
Asignar perfil por dispositivo/usuario; los ejemplos de proveedores no se comparten entre organizaciones.

## Asistente

1. Nombrar y elegir modo. Explicar qué requiere configurar en la app del fabricante.
2. Capturar una etiqueta de prueba. Mostrar caracteres crudos de forma escapada, longitud, simbología si el lector la informa, tiempos y terminador.
3. Detectar sugerencias de prefijo/sufijo/terminador. Confirmación humana; no autoactivar por una sola muestra.
4. Elegir interpretación: código de producto simple, GS1 o formato propio.
5. Modo guiado: separador, posiciones/segmentos con ejemplos; modo avanzado opcional con regex restringida, validada y con protección frente a ejecución costosa. No ejecutar código arbitrario.
6. Definir cantidad: una unidad por lectura, pedir cantidad, o embalaje con conversión confirmada. Cantidad codificada solo si el parser la interpreta inequívocamente.
7. Probar batería y comparar entrada/esperado/resultado.
8. Guardar y activar en ese dispositivo.

## Banco de pruebas sin efectos

Pruebas no generan recepción, movimiento, asignación de factura ni cambios de stock. Pueden guardar muestras del perfil con acceso restringido.
Mostrar: valor crudo, normalizado, campos extraídos, producto candidato, unidad/embalaje, cantidad que sumaría, advertencias y motivo.
Pruebas de lectura normal, múltiples consecutivas, desconocido, falta de terminador, doble envío accidental, serie repetida, etiqueta incompleta y caracteres especiales.
Para perfil GS1: separadores ASCII 29/FNC1, identificadores de simbología, campos variables y longitudes.
“Validado en este dispositivo” solo tras resultado esperado confirmado; no equivale a certificación universal.

## Reglas de códigos

Soporte inicial propuesto: EAN-8/13, UPC, Code 128, GS1-128, GS1 DataMatrix y QR cuando hardware/decoder lo permitan. Leer Code 128 no implica que su contenido sea GS1. QR genérico puede contener URL o texto: nunca abrir URL o ejecutar instrucciones automáticamente.
GS1: interpretar AIs y validaciones con biblioteca/estándar vigente: 01 GTIN, 10 lote, 21 serie, 17 caducidad cuando presentes; 00 SSCC no equivale a producto ni cantidad sin datos adicionales.
Conservar ceros iniciales, mayúsculas/minúsculas relevantes y valor original. No convertir identificadores a números. No confundir O/0 o I/1 para “hacer cuadrar”.
Identificador de simbología no siempre se envía: estado desconocido permitido.
EAN/GTIN identifica artículo comercial, no garantiza lote/serie/cantidad. Verificar checksum cuando aplique.
Fechas GS1 y pesos variables requieren parser conforme, no reglas improvisadas.

## Conteo y duplicados

- Código genérico repetido: puede ser otra unidad legítima. No deduplicar por valor.
- Cámara continua: no sumar cada fotograma; rearmado al retirar código o nueva acción explícita.
- Evento reenviado: mismo UUID de captura = una sola aplicación, incluso tras reconexión.
- Serie repetida en mismo producto/recepción: bloquear incremento; retornos y re-recepciones se revisan como otro flujo.
- Caja vs unidad: conversión explícita por código de embalaje/producto; “caja” sin equivalencia queda pendiente.
- Una línea con 10 unidades y lote L puede recibir 6 L y 4 M: mostrar diferencia; no unir lotes.
- Escanear una etiqueta de lote no prueba cantidad: pedirla/contarla.
- Ruido temporal: no descartar lecturas legítimas solo por velocidad. Separar rebote de transporte de escaneos distintos; parámetros probados en hardware.

## Foco e interacción

Captura de escáner activa solo en modo recepción/prueba; no interceptar escritura en contraseña, notas o configuración.
Mantener foco tras aceptar una lectura y tras resolver incidencia; no disparar submit/cierre por Enter del lector.
Aceptar lectura completa antes de interpretar, gestionar ráfagas en cola y mostrar error si trama incompleta.
No forzar teclado virtual permanentemente. Teclado físico y tacto deben coexistir.
Configuración de activación de simbologías, gatillo, intensidad o firmware pertenece normalmente al fabricante.
