import {createHash,randomBytes} from 'node:crypto';
import {z} from 'zod';
import {getPool,org} from './server-store';
import {seal,unseal,encryptionReady} from './crypto';
// Una sola autorización de Google para dos cosas:
//  - Gmail solo lectura: capturar adjuntos de facturas y albaranes.
//  - Drive limitado (drive.file): la app solo ve la carpeta que el usuario elige y los archivos que ella crea.
export const scopes=['https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/drive.file'];
export const appUrl=()=>(process.env.APP_URL||'https://control-compras-sentidino.vercel.app').replace(/\/$/,'');
export const googleRedirect=()=>appUrl()+'/api/google/callback';
export const googleReady=()=>Boolean(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET);
/** El selector de carpetas (Google Picker) necesita además una API key de navegador y el número de proyecto. */
export const pickerConfig=()=>{const id=process.env.GOOGLE_CLIENT_ID||'',key=process.env.GOOGLE_API_KEY||'',project=process.env.GOOGLE_PROJECT_NUMBER||id.split('-')[0];return key&&/^\d+$/.test(project)?{apiKey:key,appId:project}:null;};
export const newState=()=>randomBytes(32).toString('hex');
export const hashState=(v:string)=>createHash('sha256').update(v).digest('hex');
export function authorizationUrl(state:string){const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');url.search=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID!,redirect_uri:googleRedirect(),response_type:'code',scope:scopes.join(' '),access_type:'offline',prompt:'consent select_account',state}).toString();return url.toString();}
const tokenSchema=z.object({access_token:z.string().min(1),refresh_token:z.string().min(1).optional(),expires_in:z.number().positive(),scope:z.string(),token_type:z.string()});
export async function exchangeCode(code:string){const res=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:process.env.GOOGLE_CLIENT_ID!,client_secret:process.env.GOOGLE_CLIENT_SECRET!,redirect_uri:googleRedirect(),grant_type:'authorization_code'}),signal:AbortSignal.timeout(15000),cache:'no-store'});if(!res.ok)throw Error('Autorización rechazada.');return tokenSchema.parse(await res.json());}
export const missingScopes=(granted:string)=>scopes.filter(s=>!granted.split(' ').includes(s));

export class GoogleError extends Error{constructor(message:string,public status=502){super(message);}}
type Stored={access_token:string;refresh_token:string;expires_at:number};
export async function connection(){const r=await getPool().query('SELECT email,scopes,last_sync,last_error,secret FROM cc_google WHERE organization_id=$1',[org()]);return r.rows[0] as {email:string;scopes:string;last_sync:Date|null;last_error:string|null;secret:string}|undefined;}
export async function saveConnection(email:string,tokens:z.infer<typeof tokenSchema>){if(!tokens.refresh_token)throw Error('Google no ha devuelto permiso sin conexión.');const secret=seal(JSON.stringify({access_token:tokens.access_token,refresh_token:tokens.refresh_token,expires_at:Date.now()+tokens.expires_in*1000}),org());
 await getPool().query('INSERT INTO cc_google(organization_id,email,secret,scopes) VALUES($1,$2,$3,$4) ON CONFLICT(organization_id) DO UPDATE SET email=EXCLUDED.email,secret=EXCLUDED.secret,scopes=EXCLUDED.scopes,last_error=NULL,updated_at=now()',[org(),email,secret,tokens.scope]);}
/** Token de acceso vigente; lo renueva si caduca en menos de un minuto. */
export async function accessToken():Promise<string>{if(!googleReady()||!encryptionReady())throw new GoogleError('Google no está configurado en el servidor.',503);const c=await connection();if(!c)throw new GoogleError('Conecta primero la cuenta de Google en Ajustes.',409);
 const t=JSON.parse(unseal(c.secret,org())) as Stored;if(t.expires_at>Date.now()+60_000)return t.access_token;
 const res=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID!,client_secret:process.env.GOOGLE_CLIENT_SECRET!,refresh_token:t.refresh_token,grant_type:'refresh_token'}),signal:AbortSignal.timeout(12000),cache:'no-store'});
 if(!res.ok){await getPool().query("UPDATE cc_google SET last_error='Google ha retirado el permiso. Vuelve a conectar la cuenta.' WHERE organization_id=$1",[org()]);throw new GoogleError('Google ha retirado el permiso. Vuelve a conectar la cuenta en Ajustes.',409);}
 const u=z.object({access_token:z.string().min(1),expires_in:z.number().positive()}).parse(await res.json());
 await getPool().query('UPDATE cc_google SET secret=$2 WHERE organization_id=$1 AND secret=$3',[org(),seal(JSON.stringify({...t,access_token:u.access_token,expires_at:Date.now()+u.expires_in*1000}),org()),c.secret]);return u.access_token;}

const allowedHosts=['gmail.googleapis.com','www.googleapis.com','sheets.googleapis.com'];
/** Petición autenticada a una API de Google, con tamaño de respuesta limitado. */
export async function google(url:string,init:RequestInit&{raw?:boolean}={},token?:string):Promise<any>{const u=new URL(url);if(!allowedHosts.includes(u.hostname)||u.protocol!=='https:')throw new GoogleError('Destino de Google no permitido.');
 const res=await fetch(u,{...init,headers:{...(init.headers||{}),Authorization:'Bearer '+(token||await accessToken())},signal:AbortSignal.timeout(20000),cache:'no-store',redirect:'error'});
 if(!res.ok){const status=res.status;if(status===401||status===403)throw new GoogleError(u.hostname.startsWith('gmail')?'Gmail ha rechazado el acceso. Vuelve a conectar Google.':'Google Drive ha rechazado el acceso. Comprueba que la carpeta sigue existiendo y vuelve a elegirla o a conectar Google.',409);if(status===404)throw new GoogleError('Google no encuentra el elemento (¿carpeta borrada o movida?).',404);throw new GoogleError('Google no responde ahora. Reintenta más tarde.');}
 if(res.status===204)return null;const reader=res.body?.getReader();if(!reader)return null;let size=0;const chunks:Uint8Array[]=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>12*1024*1024){await reader.cancel();throw new GoogleError('Respuesta de Google demasiado grande.');}chunks.push(value);}
 const body=Buffer.concat(chunks);return init.raw?body:JSON.parse(body.toString('utf8')||'null');}
export const gmail=(path:string,token?:string)=>google('https://gmail.googleapis.com/gmail/v1/users/me'+path,{},token);

// ---------- Drive ----------
const FOLDER='application/vnd.google-apps.folder';
const q=(s:string)=>s.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
async function createFolder(name:string,parent:string,token:string){return (await google('https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,mimeType:FOLDER,parents:[parent]})},token)).id as string;}
/** Carpeta «ruta/a/subcarpeta» dentro de la raíz elegida; crea lo que falte y recuerda los ids. */
export async function ensureFolder(rootId:string,path:string[],token:string){let parent=rootId,acc='';
 for(const raw of path){const name=raw.replace(/[\/\\]/g,'-').trim().slice(0,120)||'Sin nombre';acc+=(acc?'/':'')+name;
  const known=await getPool().query('SELECT folder_id FROM cc_drive_folders WHERE organization_id=$1 AND root_id=$2 AND path=$3',[org(),rootId,acc]);
  if(known.rowCount){parent=known.rows[0].folder_id;continue;}
  const found=await google(`https://www.googleapis.com/drive/v3/files?fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true&q=${encodeURIComponent(`name='${q(name)}' and mimeType='${FOLDER}' and '${q(parent)}' in parents and trashed=false`)}`,{},token);
  const id=found.files?.[0]?.id||await createFolder(name,parent,token);
  await getPool().query('INSERT INTO cc_drive_folders(organization_id,root_id,path,folder_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[org(),rootId,acc,id]);parent=id;}
 return parent;}
export async function uploadFile(parent:string,name:string,mime:string,bytes:Buffer,token:string){const boundary='cc'+randomBytes(12).toString('hex');
 const body=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({name,parents:[parent]})}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`),bytes,Buffer.from(`\r\n--${boundary}--`)]);
 return (await google('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id&supportsAllDrives=true',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body},token)).id as string;}
export async function folderInfo(id:string,token?:string){return google(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,mimeType,trashed&supportsAllDrives=true`,{},token) as Promise<{id:string;name:string;mimeType:string;trashed:boolean}>;}
export async function createSpreadsheet(parent:string,name:string,token:string){return (await google('https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,mimeType:'application/vnd.google-apps.spreadsheet',parents:[parent]})},token)).id as string;}
export const sheets=(id:string,path:string,init:RequestInit={},token?:string)=>google(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}${path}`,init,token);
