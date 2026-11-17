# Importar Recepciones-IA en un repositorio nuevo

Este ZIP contiene una copia del código de `davidferes74/Recepciones-IA`, rama main, commit `18eadb1ec5eb7fea6b0bceab16ce1809dd3a08ab`, obtenida el 17/11/2026. Incluye recursos, fuentes, plantilla Excel, tests y migraciones. No contiene historial Git, dependencias instaladas, credenciales, base de datos ni documentos del usuario. Los datos de demostración del código sí están incluidos.

## Subirlo a GitHub

1. Descomprime el ZIP en una carpeta vacía.
2. Crea un repositorio nuevo, preferiblemente privado. No añadas README, licencia ni gitignore al crearlo: el paquete ya contiene sus archivos de inicio.
3. En el repositorio vacío, elige la opción para subir archivos existentes. Sube **el contenido descomprimido**, con `package.json`, `app`, `lib` y `public` directamente en la raíz. No subas el ZIP como único archivo ni introduzcas otra carpeta por encima.
4. Incluye también `.gitignore` y `.env.example`; algunos exploradores ocultan los archivos que empiezan por punto.
5. GitHub puede limitar el número de archivos por carga. Si no permite subir todos, haz varias cargas conservando las carpetas, o utiliza GitHub Desktop/Git.
6. Confirma los cambios y comprueba que estén presentes `public/plantilla-productos.xlsx`, los recursos de `public` y las siete migraciones SQL.

Alternativa con Git desde la carpeta descomprimida (sustituye USUARIO y NUEVO-REPO):

```bash
git init -b main
git add .
git commit -m "Importar Recepciones-IA"
git remote add origin https://github.com/USUARIO/NUEVO-REPO.git
git push -u origin main
```

El ZIP es una instantánea de archivos para comenzar un historial nuevo, no un mirror del historial del repositorio original.

## Arranque y comprobaciones

Usa Node.js 22 o una versión admitida por package.json. Instala dependencias con `npm ci`. Ejecuta `npm test`, `npm run build` y después `npm run typecheck`. Para desarrollo: `npm run dev`. Sin DATABASE_URL se ofrece el modo demostración del navegador.

## Proyecto independiente en Vercel

Importa el NUEVO repositorio en un NUEVO proyecto. Framework Next.js; raíz `./`; instalación `npm ci`; compilación `npm run build`. El código conserva la configuración del proyecto de origen, incluido el cron diario de correo a las 06:00 UTC.

Crea una base Neon/PostgreSQL independiente y configura las variables de servidor descritas en `.env.example`. No reutilices DATABASE_URL del original si quieres datos separados. El build ejecuta migraciones cuando existe DATABASE_URL: apunta exclusivamente a la base del nuevo proyecto. Preview y producción deben usar bases separadas.

Configura usuario y contraseña propios, SESSION_SECRET aleatorio y ORGANIZATION_ID para la nueva instalación. Para correo necesitas TOKEN_ENCRYPTION_KEY; para IA, ANTHROPIC_API_KEY. Las integraciones opcionales se habilitan solo después de aportar y validar su configuración. No subas valores reales de variables al repositorio.

## Google y cambio de dominio

IMPORTANTE: esta copia conserva el código original. `lib/google-oauth.ts` contiene una constante `googleRedirect` que apunta a `https://recepciones-ia.vercel.app/api/mail/google/callback`.

Antes de conectar Gmail en otro dominio, cambia esa constante por `https://TU-NUEVO-DOMINIO/api/mail/google/callback`, registra exactamente esa URI en el cliente OAuth de Google y configura GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en el nuevo proyecto. Actualiza también las referencias al dominio en los tests de OAuth si vas a ejecutarlos contra la configuración nueva. No basta con copiar las claves.

Para comprobaciones HTTP con `scripts/smoke-private.mjs`, especifica SMOKE_BASE_URL con el dominio nuevo: su valor por defecto apunta al proyecto original. Aporta las credenciales únicamente como variables de entorno.

Si utilizas acceso desde Sentidiño BI, configura la URL de retorno y un secreto de módulo propio compartido con el BI autorizado. Consulta docs/13-modulo-bi.md. No se incluyen conexiones de Odoo ni buzones ya autorizados: esos datos están fuera del repositorio.

## Continuar desarrollo

Lee AGENTS.md y la documentación actual del paquete. Las menciones a destinos antiguos en documentos históricos identifican el proyecto de origen; no son autorización para publicar cambios allí. CODEX_START.md se ha adaptado para trabajar en el repositorio donde se importe el ZIP.

La copia del código no implica que todas las integraciones estén verificadas para el nuevo entorno. Revisa docs/ESTADO.md y valida las conexiones tras configurar la instalación. No incluye la base de datos ni el historial de documentos del despliegue original.

## Validación del paquete

124 tests aprobados y build Next.js correcto al preparar esta copia. La compilación se hizo sin DATABASE_URL: no se ejecutaron migraciones contra una base real ni se probaron servicios externos. Los archivos de código y recursos coinciden con GitHub; solo se adaptaron README.md, CODEX_START.md y .env.example y se añadió esta guía.
