# Texto listo para iniciar el trabajo en Codex

Trabaja exclusivamente en el nuevo repositorio en el que se haya importado este paquete y continúa la app Recepciones-IA. Lee IMPORTAR-NUEVO-REPOSITORIO.md. No publiques cambios en davidferes74/Recepciones-IA ni en su proyecto Vercel: son los destinos de origen.
Lee primero AGENTS.md y todos los documentos enlazados en README.md. Son el traspaso completo de la conversación y la fuente de requisitos. No vuelvas a pedirme que describa la app.

Primero inspecciona el estado real del repositorio. Si solo contiene documentación, implementa el hito H1 de docs/08-plan.md: prototipo móvil funcional con persistencia, recepción de albaranes, escaneo con lector tipo teclado y simulador aislado, configuración de PDA con banco de pruebas, lotes/series opcionales, incidencias y conciliación determinista automática con fixtures. Continúa con los hitos posteriores mientras no dependan de accesos o datos que falten.

La app debe funcionar con cualquier ERP porque inicialmente es independiente. El operario coteja mercancía física contra albarán y Administración coteja facturas contra una o varias recepciones. No confundas fotografía del albarán con confirmación física.

Usa las referencias de Emil Kowalski indicadas en docs/02-diseno.md. Diseña primero móvil/PDA, después tablet/escritorio. No hagas una landing ni una app centrada en chat.

Conserva todos los requisitos: relaciones muchos-a-muchos por línea, cantidades parciales, no doble asignación, disparadores automáticos, precios no verificables cuando falte referencia, plantillas por proveedor/diseño, IA económica con escalado controlado, configuración de lector por usuario y pruebas sin efectos en inventario.

Separa claramente datos de demostración de integraciones reales. No presentes correo, Drive, OCR o lectura de cámara como operativos si solo están simulados. Implementa los adaptadores y muestra el estado real de conexión.

Propón el mínimo montaje técnico necesario, documenta las decisiones y empieza a implementar. No te quedes solo en un plan. Prepara pruebas, migraciones, configuración, commits revisables y un despliegue de prueba en Vercel cuando estén disponibles los accesos necesarios. No inventes credenciales ni habilites gastos sin presupuesto acordado. Pídeme únicamente el dato/acceso que bloquee una integración concreta y sigue con el resto.

Actualiza docs/ESTADO.md en cada hito. Al terminar indica qué funciona, qué se ha probado, qué sigue simulado, qué necesita pruebas físicas y cómo abrir el prototipo.
