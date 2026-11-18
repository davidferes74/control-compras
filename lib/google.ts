import {createHash,randomBytes} from 'node:crypto';
import {z} from 'zod';
import {getPool,org} from './server-store';
import {seal,unseal,encryptionReady} from './crypto';
// Autorizaciones de Google, una por finalidad (igual que en Recepciones-IA):
//  - Gmail solo lectura: capturar adjuntos de facturas y albaranes (cc_google).
//  - Drive limitado (drive.file): la app crea su carpeta y solo ve lo que ella crea (cc_drive, ver lib/drive.ts).
export const gmailScope='https://www.googleapis.com/auth/gmail.readonly';
export const driveScope='https://www.googleapis.com/auth/drive.file';
export const appUrl=()=>(process.env.APP_URL||'https://control-compras-sentidino.vercel.app').replace(/\/$/,'');
export const googleRedirect=()=>appUrl()+'/api/google/callback';
export const googleReady=()=>Boolean(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET);
export const newState=()=>randomBytes(32).toString('hex');
export const hashState=(v:string)=>createHash('sha256').update(v).digest('hex');
/** Fallo al terminar la autorización: «exchange» = Google rechazó el código; «scope» = no se concedió el permiso pedido o faltó el permiso permanente. */
export class OAuthError extends Error{constructor(public kind:'exchange'|'scope'){super('Autorización no completada: '+kind);}}
export function authorizationUrl(state:string,scope=gmailScope){if(!googleReady())throw Error('Google no configurado.');const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');url.search=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID!,redirect_uri:googleRedirect(),response_type:'code',scope,access_type:'offline',prompt:'consent select_account',state}).toString();return url.toString();}
const tokensFor=(scope:string)=>z.object({access_token:z.string().min(1),refresh_token:z.string().min(1),expires_in:z.number().positive(),scope:z.string().refine(v=>v.split(' ').includes(scope)),token_type:z.string().refine(v=>v.toLowerCase()==='bearer')});
export type Tokens=z.infer<ReturnType<typeof tokensFor>>;
export async function exchangeCode(code:string,scope=gmailScope):Promise<Tokens>{const res=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:process.env.GOOGLE_CLIENT_ID!,client_secret:process.env.GOOGLE_CLIENT_SECRET!,redirect_uri:googleRedirect(),grant_type:'authorization_code'}),signal:AbortSignal.timeout(15000),cache:'no-store'});if(!res.ok)throw new OAuthError('exchange');const parsed=tokensFor(scope).safeParse(await res.json());if(!parsed.success)throw new OAuthError('scope');return parsed.data;}
export const missingScopes=(granted:string)=>[gmailScope].filter(s=>!granted.split(' ').includes(s));

export class GoogleError extends Error{constructor(message:string,public status=502){super(message);}}
type Stored={access_token:string;refresh_token:string;expires_at:number};
export async function connection(){const r=await getPool().query('SELECT email,scopes,last_sync,last_error,secret FROM cc_google WHERE organization_id=$1',[org()]);return r.rows[0] as {email:string;scopes:string;last_sync:Date|null;last_error:string|null;secret:string}|undefined;}
export async function saveConnection(email:string,tokens:Tokens){const secret=seal(JSON.stringify({access_token:tokens.access_token,refresh_token:tokens.refresh_token,expires_at:Date.now()+tokens.expires_in*1000}),org());
 await getPool().query('INSERT INTO cc_google(organization_id,email,secret,scopes) VALUES($1,$2,$3,$4) ON CONFLICT(organization_id) DO UPDATE SET email=EXCLUDED.email,secret=EXCLUDED.secret,scopes=EXCLUDED.scopes,last_error=NULL,updated_at=now()',[org(),email,secret,tokens.scope]);}
/** Token de acceso vigente de Gmail; lo renueva si caduca en menos de un minuto. */
export async function accessToken():Promise<string>{if(!googleReady()||!encryptionReady())throw new GoogleError('Google no está configurado en el servidor.',503);const c=await connection();if(!c)throw new GoogleError('Conecta primero Gmail en Ajustes.',409);
 const t=JSON.parse(unseal(c.secret,org())) as Stored;if(t.expires_at>Date.now()+60_000)return t.access_token;
 const res=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID!,client_secret:process.env.GOOGLE_CLIENT_SECRET!,refresh_token:t.refresh_token,grant_type:'refresh_token'}),signal:AbortSignal.timeout(12000),cache:'no-store'});
 if(!res.ok){await getPool().query("UPDATE cc_google SET last_error='Google ha retirado el permiso. Vuelve a conectar Gmail.' WHERE organization_id=$1",[org()]);throw new GoogleError('Google ha retirado el permiso. Vuelve a conectar Gmail en Ajustes.',409);}
 const u=z.object({access_token:z.string().min(1),expires_in:z.number().positive()}).parse(await res.json());
 await getPool().query('UPDATE cc_google SET secret=$2 WHERE organization_id=$1 AND secret=$3',[org(),seal(JSON.stringify({...t,access_token:u.access_token,expires_at:Date.now()+u.expires_in*1000}),org()),c.secret]);return u.access_token;}

/** Petición autenticada a la API de Gmail, con tamaño de respuesta limitado. */
export async function google(url:string,init:RequestInit={},token?:string):Promise<any>{const u=new URL(url);if(u.hostname!=='gmail.googleapis.com'||u.protocol!=='https:')throw new GoogleError('Destino de Google no permitido.');
 const res=await fetch(u,{...init,headers:{...(init.headers||{}),Authorization:'Bearer '+(token||await accessToken())},signal:AbortSignal.timeout(20000),cache:'no-store',redirect:'error'});
 if(!res.ok){const status=res.status;if(status===401||status===403)throw new GoogleError('Gmail ha rechazado el acceso. Vuelve a conectar Gmail.',409);if(status===404)throw new GoogleError('Gmail no encuentra el elemento.',404);throw new GoogleError('Gmail no responde ahora. Reintenta más tarde.');}
 if(res.status===204)return null;const reader=res.body?.getReader();if(!reader)return null;let size=0;const chunks:Uint8Array[]=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>12*1024*1024){await reader.cancel();throw new GoogleError('Respuesta de Google demasiado grande.');}chunks.push(value);}
 return JSON.parse(Buffer.concat(chunks).toString('utf8')||'null');}
export const gmail=(path:string,token?:string)=>google('https://gmail.googleapis.com/gmail/v1/users/me'+path,{},token);
