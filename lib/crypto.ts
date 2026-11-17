import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
// Cifrado de secretos guardados en la base de datos (tokens de Google). Clave: TOKEN_ENCRYPTION_KEY (64 hex).
export function encryptionReady(){return /^[a-f0-9]{64}$/i.test(process.env.TOKEN_ENCRYPTION_KEY||'');}
function key(){if(!encryptionReady())throw Error('Configura TOKEN_ENCRYPTION_KEY: 64 caracteres hexadecimales aleatorios.');return Buffer.from(process.env.TOKEN_ENCRYPTION_KEY!,'hex');}
export function seal(value:string,organization:string){const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',key(),iv);cipher.setAAD(Buffer.from(organization));const bytes=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),bytes].map(b=>b.toString('base64')).join('.');}
export function unseal(value:string,organization:string){const [iv,tag,bytes]=value.split('.').map(s=>Buffer.from(s,'base64'));const cipher=createDecipheriv('aes-256-gcm',key(),iv);cipher.setAAD(Buffer.from(organization));cipher.setAuthTag(tag);return Buffer.concat([cipher.update(bytes),cipher.final()]).toString('utf8');}
