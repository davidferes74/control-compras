// Catálogo de proveedores de correo conocidos. Sin dependencias: se usa en el servidor y en el asistente.
// «host» es el servidor IMAP seguro (puerto 993). Para proveedores no listados se intenta la detección
// automática (registro SRV, imap.<dominio>, mail.<dominio>) y, si falla, se pide el servidor al usuario.
export type MailAuth='password'|'app-password'|'google'|'unsupported';
export type MailProvider={id:string;name:string;host?:string;auth:MailAuth;domains:string[];mx:string[];help:string[]};
export const mailProviders:MailProvider[]=[
 {id:'google',name:'Gmail / Google Workspace',auth:'google',domains:['gmail.com','googlemail.com'],mx:['google.com','googlemail.com'],help:['Este correo es de Google. Usa el botón «Conectar con Google»: es más seguro y no tienes que escribir ninguna contraseña aquí.']},
 {id:'microsoft',name:'Outlook / Microsoft 365',auth:'unsupported',domains:['outlook.com','outlook.es','hotmail.com','hotmail.es','live.com','msn.com'],mx:['outlook.com'],help:['Microsoft ya no permite conectar con usuario y contraseña.','La conexión con Microsoft todavía no está disponible. Mientras tanto, puedes reenviar automáticamente las facturas a otro buzón que sí se pueda conectar.']},
 {id:'yahoo',name:'Yahoo Mail',host:'imap.mail.yahoo.com',auth:'app-password',domains:['yahoo.com','yahoo.es','ymail.com'],mx:['yahoodns.net'],help:['Yahoo no acepta tu contraseña habitual en aplicaciones externas.','Entra en tu cuenta de Yahoo → Seguridad de la cuenta → «Generar contraseña de aplicación».','Copia la contraseña que te da Yahoo y pégala aquí.']},
 {id:'icloud',name:'iCloud Mail',host:'imap.mail.me.com',auth:'app-password',domains:['icloud.com','me.com','mac.com'],mx:['icloud.com'],help:['Apple no acepta tu contraseña habitual en aplicaciones externas.','Entra en account.apple.com → Inicio de sesión y seguridad → «Contraseñas de apps» y crea una.','Copia la contraseña que te da Apple y pégala aquí.']},
 {id:'zoho-eu',name:'Zoho Mail (Europa)',host:'imap.zoho.eu',auth:'password',domains:['zoho.eu','zohomail.eu'],mx:['zoho.eu'],help:['En Zoho Mail → Configuración → Cuentas de correo, comprueba que el «Acceso IMAP» está activado.','Si usas verificación en dos pasos, crea una contraseña específica de aplicación en accounts.zoho.eu.']},
 {id:'zoho',name:'Zoho Mail',host:'imap.zoho.com',auth:'password',domains:['zoho.com','zohomail.com'],mx:['zoho.com'],help:['En Zoho Mail → Configuración → Cuentas de correo, comprueba que el «Acceso IMAP» está activado.','Si usas verificación en dos pasos, crea una contraseña específica de aplicación en accounts.zoho.com.']},
 {id:'ionos',name:'IONOS',host:'imap.ionos.es',auth:'password',domains:['ionos.es'],mx:['ionos.es'],help:['Usa la dirección de correo completa como usuario y la contraseña de ese buzón.']},
 {id:'ovh',name:'OVHcloud',host:'ssl0.ovh.net',auth:'password',domains:[],mx:['ovh.net'],help:['Usa la dirección de correo completa como usuario y la contraseña de ese buzón.']},
];
const genericHelp=['Usa la dirección de correo completa como usuario y la contraseña de ese buzón.','Si tu proveedor tiene verificación en dos pasos, puede que necesites crear una «contraseña de aplicación» en su panel.'];
export const genericProvider=(host?:string):MailProvider=>({id:'other',name:'Otro proveedor',host,auth:'password',domains:[],mx:[],help:genericHelp});
export const emailDomain=(email:string)=>email.trim().toLowerCase().split('@')[1]||'';
const within=(name:string,suffix:string)=>name===suffix||name.endsWith('.'+suffix);
export function providerForEmail(email:string):MailProvider|null{const d=emailDomain(email);return d?mailProviders.find(p=>p.domains.includes(d))||null:null;}
// Dominios propios: el registro MX indica quién aloja el correo (p. ej. un dominio de empresa en Google Workspace).
export function providerForMx(exchanges:string[]):MailProvider|null{const names=exchanges.map(x=>x.toLowerCase().replace(/\.$/,''));return mailProviders.find(p=>p.mx.some(s=>names.some(n=>within(n,s))))||null;}
export const candidateHosts=(domain:string)=>domain?['imap.'+domain,'mail.'+domain]:[];
