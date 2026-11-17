# Importación en un nuevo repositorio

Empieza por [IMPORTAR-NUEVO-REPOSITORIO.md](IMPORTAR-NUEVO-REPOSITORIO.md). Las referencias siguientes a GitHub y Vercel describen el proyecto original.

# Recepciones-IA

Prototipo funcional H1 · 16 de noviembre de 2026

**Estado: prototipo implementado; integraciones reales y validación del despliegue pendientes. Ver docs/ESTADO.md.**
Este repositorio es la fuente de contexto para construir la app. No presupongas que dispones de la conversación original.

## Objetivo

App independiente de cualquier ERP para comprobar lo que llega físicamente al almacén frente al albarán del proveedor y conciliar posteriormente albaranes/recepciones con facturas de compra recibidas por correo. Prioridad móvil, tablet y PDA; manejo sencillo; trazabilidad y coste de IA controlado. Volumen inicial comunicado: unos 100 documentos al mes, sin asumir 100 páginas ni 100 escaneos.

## Lectura obligatoria

1. [AGENTS.md](AGENTS.md): instrucciones para el agente de desarrollo.
2. [Especificación funcional](docs/01-producto.md): alcance, requisitos y límites.
3. [Pantallas y experiencia móvil](docs/02-diseno.md).
4. [Lectores y configuración de PDA](docs/03-lectores.md).
5. [Lectura documental y conciliación](docs/04-lectura-conciliacion.md).
6. [Arquitectura y datos](docs/05-arquitectura-datos.md).
7. [Integraciones, seguridad y operaciones](docs/06-integraciones.md).
8. [Pruebas y aceptación](docs/07-pruebas.md).
9. [Plan de implementación y pendientes](docs/08-plan.md).
10. [Prompt para comenzar en Codex](CODEX_START.md).

Los requisitos explícitos del usuario prevalecen. Las propuestas técnicas se identifican como tales; documentar alternativas justificadas sin eliminar funcionalidad acordada.

## Destinos

- Nombre comercial: **Recepciones-IA**.
- Repositorio: **davidferes74/Recepciones-IA**, privado.
- Proyecto Vercel propuesto: **recepciones-ia**, equipo Sentidiño.
- Sin dependencia de Odoo. No crear módulos Odoo ni exigir conexión a ERP.
- UI en español; fechas dd/mm/aaaa; zona de presentación Europe/Madrid; instantes persistidos en UTC.

## Inicio

Abrir este repositorio en Codex y pegar el contenido de CODEX_START.md.
Instalar con `npm ci`; iniciar con `npm run dev`. Validar con `npm test`, `npm run typecheck` y `npm run build`.
No hay credenciales, fotos reales, facturas reales ni datos de proveedores en este paquete.

## Vercel y Neon

El proyecto incluye vercel.json con framework Next.js. La compilación ejecuta migraciones aditivas si existe DATABASE_URL. Sin ella permite probar la demo local.
Configurar exclusivamente en Vercel: DATABASE_URL (aportada por Neon), APP_ACCESS_PASSWORD (contraseña del piloto), SESSION_SECRET (secreto aleatorio de al menos 32 caracteres), ORGANIZATION_ID opcional. No compartir valores por chat ni guardarlos en Git. Volver a desplegar tras cambiar variables.
El acceso de piloto es de un administrador único. No introducir documentación real hasta completar permisos, controles de acceso y pruebas de persistencia. Preview y producción deben usar bases separadas.

## Prueba de demostración

Abrir Lectores y PDA, probar código 8412345678905 con ese mismo código esperado, indicar dispositivo y validar perfil. Abrir ALB-2026-0148: CAJA-ARROZ añade 12 unidades y cada 8423456789015 añade una unidad de aceite (6 esperadas). Confirmar recepción y abrir factura F-2026-0312: las cantidades se respaldan entre dos albaranes. Precio no comprobado. La demo se guarda solo en este navegador.
