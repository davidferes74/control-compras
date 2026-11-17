import {z} from 'zod';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {isIP,BlockList} from 'node:net';
export const mailConfigSchema=z.object({name:z.string().trim().min(1).max(100),email:z.email().max(254),host:z.string().trim().toLowerCase().max(253).regex(/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/),username:z.string().trim().min(1).max(254),password:z.string().min(1).max(1024),folder:z.string().min(1).max(200).default('INBOX'),since:z.iso.date(),sender:z.string().trim().max(254).default(''),subject:z.string().trim().max(150).default('')});
export type MailConfig=z.infer<typeof mailConfigSchema>;
export function encryptionReady(){return /^[a-f0-9]{64}$/i.test(process.env.TOKEN_ENCRYPTION_KEY||'');}
function key(){if(!encryptionReady())throw Error('Configura TOKEN_ENCRYPTION_KEY: 64 caracteres hexadecimales aleatorios.');return Buffer.from(process.env.TOKEN_ENCRYPTION_KEY!,'hex');}
export function seal(value:string,organization:string){const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',key(),iv);cipher.setAAD(Buffer.from(organization));const bytes=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),bytes].map(b=>b.toString('base64')).join('.');}
export function unseal(value:string,organization:string){const [iv,tag,bytes]=value.split('.').map(s=>Buffer.from(s,'base64'));const cipher=createDecipheriv('aes-256-gcm',key(),iv);cipher.setAAD(Buffer.from(organization));cipher.setAuthTag(tag);return Buffer.concat([cipher.update(bytes),cipher.final()]).toString('utf8');}
// Cualquier servidor de correo público, por nombre. Se rechazan IP literales y nombres internos; además, antes de
// conectar se resuelve el nombre y se exige que todas sus direcciones sean públicas (ver publicIPv4), siempre por TLS en el puerto 993.
export function allowedHost(host:string){const h=host.toLowerCase();return !isIP(h)&&/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(h)&&h.includes('.')&&!/(^|\.)(localhost|local|internal|lan|home|corp|test|invalid|example)$/.test(h);}
// Error de correo con un mensaje pensado para el usuario; nunca incluye respuestas del servidor ni credenciales.
export class MailError extends Error{constructor(message:string,public kind:'auth'|'host'|'tls'|'timeout'|'folder'|'other'){super(message);}}
export function describeMailError(e:unknown):MailError{
 if(e instanceof MailError)return e;const x=e as {authenticationFailed?:boolean;code?:string;responseStatus?:string;message?:string}|null;const code=String(x?.code||'');
 if(x?.authenticationFailed)return new MailError('El servidor no ha aceptado el usuario o la contraseña. Revisa que estén bien escritos. Si tu correo tiene verificación en dos pasos, necesitas una «contraseña de aplicación» en lugar de la habitual.','auth');
 if(['ENOTFOUND','EAI_AGAIN','ENODATA'].includes(code))return new MailError('No encontramos ese servidor de correo. Revisa que el nombre esté bien escrito.','host');
 if(['ECONNREFUSED','EHOSTUNREACH','ENETUNREACH','ECONNRESET'].includes(code))return new MailError('El servidor no admite conexión segura en el puerto 993. Puede que el nombre del servidor no sea el de «correo entrante (IMAP)».','host');
 if(code.includes('CERT')||code.includes('TLS')||code==='DEPTH_ZERO_SELF_SIGNED_CERT')return new MailError('El certificado de seguridad del servidor no es válido para ese nombre. Usa el nombre de servidor seguro que indique tu proveedor.','tls');
 if(['ETIMEDOUT','ETIMEOUT','ESOCKETTIMEDOUT'].includes(code)||/timeout/i.test(String(x?.message||'')))return new MailError('El servidor tarda demasiado en responder. Inténtalo de nuevo en unos minutos.','timeout');
 return new MailError('No se pudo conectar con el buzón. Revisa el servidor, el usuario y la contraseña.','other');
}
const blocked=new BlockList();for(const [ip,mask] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as const)blocked.addSubnet(ip,mask,'ipv4');
export function publicIPv4(ip:string){return isIP(ip)===4&&!blocked.check(ip,'ipv4');}
