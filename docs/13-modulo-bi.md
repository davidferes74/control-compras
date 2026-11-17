# 13 · Recepciones-IA como módulo de Sentidiño BI

Decisión (17/11/2026): Recepciones-IA sigue siendo una app independiente y Sentidiño BI la muestra como un módulo más («app aparte enlazada»). Opera de forma autónoma: su base de datos, su despliegue y su acceso propio siguen funcionando sin el BI.

## Qué comparte con el BI
| Aspecto | Cómo |
|---|---|
| Accesos a Odoo | Heredados del fichero `data/config.json` del BI o de sus variables `ODOO_*` (docs/12-odoo.md). |
| Sesión | Pase firmado de un solo uso: el usuario que ya está dentro del BI entra sin volver a escribir contraseña. |
| Aspecto | Mismo sistema visual (`arc-foundation.css`) y tipografías. |
| Vuelta | Enlace «Volver a Sentidiño BI» en el menú si se define `SENTIDINO_BI_URL`. |

## Variables en Recepciones-IA
- `SENTIDINO_MODULE_SECRET`: secreto compartido con el BI, 32 caracteres o más, aleatorio. Sin él, la entrada desde el BI está desactivada.
- `SENTIDINO_BI_URL`: dirección pública del BI (https). Opcional; solo para el enlace de vuelta.

## Contrato de entrada (lo que debe hacer el BI)
1. Con el usuario ya autenticado en el BI, generar un pase:
   `payload = "v1." + (Date.now() + 60000) + "." + 16 bytes aleatorios en hexadecimal`
   `pase = payload + "." + HMAC-SHA256(SENTIDINO_MODULE_SECRET, payload) en hexadecimal`
2. Redirigir (302) a `https://<recepciones>/api/session/sso?token=<pase>`.
3. Recepciones-IA comprueba firma, caducidad (máximo 2 minutos) y que el pase no se haya usado; abre su sesión y redirige a `/`. Si algo falla, muestra su pantalla de acceso con un aviso.

Ejemplo para el BI (Node, sin dependencias):
```js
const crypto = require("crypto");
function paseRecepciones() {
  const payload = `v1.${Date.now() + 60000}.${crypto.randomBytes(16).toString("hex")}`;
  return `${payload}.${crypto.createHmac("sha256", process.env.SENTIDINO_MODULE_SECRET).update(payload).digest("hex")}`;
}
// app.get("/api/recepciones/abrir", (req, res) => res.redirect(`${process.env.RECEPCIONES_URL}/api/session/sso?token=${paseRecepciones()}`));
```

## Pendiente en el repositorio del BI
- Alta del módulo `recepciones` en `src/catalogo-modulos.js` (prefijo `/api/recepciones`) para poder activarlo por cliente.
- Ruta `/api/recepciones/abrir` (ejemplo anterior) y entrada en el menú lateral (`public/sidebar.js`).
- Los módulos actuales del BI son áreas de análisis con consultas a Odoo; este sería el primero que abre otra aplicación, así que hay que revisar sus pruebas de módulos y la consola de Sentidiño.

## Seguridad
- El pase viaja en la dirección solo durante la redirección: caduca en un minuto, sirve una vez y la respuesta no deja referencia (`Referrer-Policy: no-referrer`).
- Quien tenga el secreto puede abrir sesión: guardarlo solo como variable de entorno en ambos despliegues y rotarlo si se filtra.
- La sesión abierta es la de administrador único del piloto; los roles por usuario siguen pendientes.
