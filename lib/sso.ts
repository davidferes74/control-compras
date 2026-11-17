import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
// Entrada desde la app principal (Sentidiño BI) sin volver a pedir contraseña.
// El BI firma un pase de un solo uso con un secreto compartido (SENTIDINO_MODULE_SECRET) y redirige aquí.
// Formato: v1.<caducidad en ms>.<nonce hex>.<HMAC-SHA256 hex de "v1.<caducidad>.<nonce>">
export const ssoMaxLifetimeMs=120_000;
export const ssoSecret=()=>{const s=process.env.SENTIDINO_MODULE_SECRET||'';return s.length>=32?s:null;};
const mac=(secret:string,payload:string)=>createHmac('sha256',secret).update(payload).digest('hex');
export function signModuleToken(secret:string,now=Date.now(),lifetimeMs=60_000){const payload=`v1.${now+lifetimeMs}.${randomBytes(16).toString('hex')}`;return payload+'.'+mac(secret,payload);}
export type SsoCheck={ok:true;nonce:string;expires:number}|{ok:false;reason:'format'|'signature'|'expired'|'lifetime'};
export function verifyModuleToken(token:string,secret:string,now=Date.now()):SsoCheck{
 const m=/^v1\.(\d{13})\.([a-f0-9]{32})\.([a-f0-9]{64})$/.exec(token);if(!m)return {ok:false,reason:'format'};
 const [,exp,nonce,sig]=m,expected=mac(secret,`v1.${exp}.${nonce}`);
 if(!timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return {ok:false,reason:'signature'};
 const expires=Number(exp);if(expires<=now)return {ok:false,reason:'expired'};
 // Un pase con caducidad lejana no es válido aunque esté bien firmado: limita el daño de un reloj o un emisor mal configurados.
 if(expires-now>ssoMaxLifetimeMs)return {ok:false,reason:'lifetime'};
 return {ok:true,nonce,expires};
}
// Dirección de la app principal para el enlace de vuelta. Solo https (o http en local).
export function parentAppUrl(){const raw=process.env.SENTIDINO_BI_URL||'';try{const u=new URL(raw);if(u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))return u.origin+u.pathname.replace(/\/+$/,'');}catch{/* sin configurar */}return null;}
