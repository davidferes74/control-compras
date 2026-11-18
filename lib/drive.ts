import {z} from 'zod';
import {getPool,org} from './server-store';
import {seal,unseal,encryptionReady} from './crypto';
import {googleReady,type Tokens} from './google';
import {safePart} from './drive-names';
// Archivo de originales en Google Drive (portado de Recepciones-IA). Permiso mínimo «drive.file»: la app solo
// ve y toca la carpeta y los archivos que ella misma crea, nunca el resto del Drive del usuario.
// La carpeta la crea la app al conectar, con el nombre que escribe el usuario.
export const folderUrl=(id:string)=>'https://drive.google.com/drive/folders/'+encodeURIComponent(id);
export const sheetUrl=(id:string)=>'https://docs.google.com/spreadsheets/d/'+encodeURIComponent(id);
export const folderNameSchema=z.string().transform(v=>safePart(v)).pipe(z.string().min(1).max(80));
export const defaultFolderName='Control de compras';
type StoredTokens={access_token:string;refresh_token:string;expires_at:number};
export type DriveRow={email:string|null;secret:string|null;folder_id:string|null;folder_name:string|null;sheet_id:string|null;folders:Record<string,string>;last_error:string|null;last_archive:Date|null};
export class DriveError extends Error{constructor(message:string,public kind:'auth'|'folder'|'api'|'denied'|'other'='other'){super(message);}}
/** Motivo de un 403 de Google: API de Drive sin activar en el proyecto, o permiso insuficiente. */
export function forbiddenKind(body:unknown):'api'|'denied'{const e=(body as {error?:{message?:string;status?:string;errors?:{reason?:string}[];details?:{reason?:string}[]}}|null)?.error;const reasons=[...(e?.errors||[]),...(e?.details||[])].map(x=>String(x.reason||'')).join(' ')+' '+String(e?.message||'');return /accessNotConfigured|SERVICE_DISABLED|has not been used|is disabled|it is disabled/i.test(reasons)?'api':'denied';}
export async function driveRow(){const r=await getPool().query('SELECT email,secret,folder_id,folder_name,sheet_id,folders,last_error,last_archive FROM cc_drive WHERE organization_id=$1',[org()]);return r.rows[0] as DriveRow|undefined;}
export const updateDrive=(fields:Partial<Record<'sheet_id'|'folders'|'last_error'|'last_archive',unknown>>)=>{const keys=Object.keys(fields);return getPool().query(`UPDATE cc_drive SET ${keys.map((k,i)=>`${k}=$${i+2}`).join(',')},updated_at=now() WHERE organization_id=$1`,[org(),...keys.map(k=>k==='folders'?JSON.stringify(fields[k as 'folders']):fields[k as keyof typeof fields])]);};
export const driveConnected=(r:DriveRow|undefined):r is DriveRow&{secret:string;folder_id:string}=>Boolean(r?.secret&&r.folder_id);

/** Estado para la pantalla (sin secretos). */
export async function driveStatus(){
 const r=await driveRow(),connected=driveConnected(r);
 const counts=await getPool().query("SELECT count(*) FILTER (WHERE drive_file_id IS NOT NULL)::int AS archived,count(*) FILTER (WHERE drive_file_id IS NULL AND drive_error IS NOT NULL)::int AS failed FROM cc_documents WHERE organization_id=$1 AND status='confirmed' AND file_id IS NOT NULL",[org()]);
 return {connected,email:connected?r!.email:null,folderName:connected?r!.folder_name:null,folderUrl:connected?folderUrl(r!.folder_id!):null,sheetUrl:connected&&r!.sheet_id?sheetUrl(r!.sheet_id):null,
  archived:counts.rows[0].archived as number,failed:counts.rows[0].failed as number,lastError:r?.last_error||null,lastArchive:r?.last_archive?new Date(r.last_archive).toISOString():null,googleReady:googleReady(),encryptionReady:encryptionReady()};
}
export async function forgetDrive(){await getPool().query('UPDATE cc_drive SET secret=NULL,updated_at=now() WHERE organization_id=$1',[org()]);}

// ---- Llamadas a las APIs de Drive y Hojas de cálculo ----
const hosts=['www.googleapis.com','sheets.googleapis.com'];
export async function call(token:string,url:string,init:RequestInit={}):Promise<Record<string,any>>{
 const u=new URL(url);if(!hosts.includes(u.hostname))throw new DriveError('Destino de Google no permitido.');
 let res:Response;try{res=await fetch(u,{...init,headers:{Authorization:'Bearer '+token,...(init.headers||{})},signal:AbortSignal.timeout(25000),cache:'no-store',redirect:'error'});}catch{throw new DriveError('No se pudo conectar con Google Drive.');}
 if(res.status===401)throw new DriveError('Google ha retirado el permiso. Vuelve a conectar Google Drive.','auth');
 if(res.status===404)throw new DriveError('La carpeta ya no existe en Drive.','folder');
 if(res.status===403){const kind=forbiddenKind(await res.json().catch(()=>null));const sheets=u.hostname.startsWith('sheets');
  throw new DriveError(kind==='api'?(sheets?'La API de Google Sheets no está activada en el proyecto de Google Cloud de la app.':'La API de Google Drive no está activada en el proyecto de Google Cloud de la app.'):'Google no permite a la app usar Drive con esta cuenta.',kind);}
 if(!res.ok)throw new DriveError('Google Drive no pudo completar la operación (HTTP '+res.status+').');
 if(res.status===204)return {};return res.json() as Promise<Record<string,any>>;
}
export async function createFolder(token:string,name:string,parent?:string){const f=await call(token,'https://www.googleapis.com/drive/v3/files?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,mimeType:'application/vnd.google-apps.folder',...(parent?{parents:[parent]}:{})})});return String(f.id);}
export async function driveEmail(token:string){const a=await call(token,'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)');return String(a.user?.emailAddress||'');}
export async function upload(token:string,parent:string,name:string,mime:string,bytes:Buffer){
 const boundary='cc-'+Math.random().toString(36).slice(2);
 const body=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({name,parents:[parent]})}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`),bytes,Buffer.from(`\r\n--${boundary}--`)]);
 const f=await call(token,'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body});return String(f.id);
}
export async function createSpreadsheet(token:string,parent:string,name:string){const f=await call(token,'https://www.googleapis.com/drive/v3/files?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,mimeType:'application/vnd.google-apps.spreadsheet',parents:[parent]})});return String(f.id);}
export const sheets=(token:string,id:string,path:string,init:RequestInit={})=>call(token,`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}${path}`,init);

/** Token de acceso vigente de Drive; lo renueva si caduca en menos de un minuto. */
export async function accessToken(secret:string){
 const tokens=JSON.parse(unseal(secret,org())) as StoredTokens;if(tokens.expires_at>Date.now()+60000)return tokens.access_token;
 const res=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID||'',client_secret:process.env.GOOGLE_CLIENT_SECRET||'',refresh_token:tokens.refresh_token,grant_type:'refresh_token'}),signal:AbortSignal.timeout(12000),cache:'no-store'}).catch(()=>null);
 if(!res)throw new DriveError('No se pudo conectar con Google.');if(!res.ok)throw new DriveError('Google ha retirado el permiso. Vuelve a conectar Google Drive.','auth');
 const fresh=z.object({access_token:z.string().min(1),expires_in:z.number().positive()}).parse(await res.json());
 const next=seal(JSON.stringify({...tokens,access_token:fresh.access_token,expires_at:Date.now()+fresh.expires_in*1000}),org());
 await getPool().query('UPDATE cc_drive SET secret=$2 WHERE organization_id=$1 AND secret=$3',[org(),next,secret]);return fresh.access_token;
}
/** Guarda la conexión recién autorizada y crea la carpeta raíz con el nombre elegido por el usuario. */
export async function connectDrive(tokens:Tokens,folderName:string){
 const email=await driveEmail(tokens.access_token),folderId=await createFolder(tokens.access_token,folderName);
 const secret=seal(JSON.stringify({access_token:tokens.access_token,refresh_token:tokens.refresh_token,expires_at:Date.now()+tokens.expires_in*1000}),org());
 await getPool().query("INSERT INTO cc_drive(organization_id,email,secret,folder_id,folder_name,sheet_id,folders,last_error) VALUES($1,$2,$3,$4,$5,NULL,'{}',NULL) ON CONFLICT(organization_id) DO UPDATE SET email=EXCLUDED.email,secret=EXCLUDED.secret,folder_id=EXCLUDED.folder_id,folder_name=EXCLUDED.folder_name,sheet_id=NULL,folders='{}',last_error=NULL,updated_at=now()",[org(),email,secret,folderId,folderName]);
 // Los documentos archivados en una carpeta anterior no se vuelven a subir; los que fallaron, sí.
 await getPool().query('UPDATE cc_documents SET drive_error=NULL WHERE organization_id=$1 AND drive_file_id IS NULL',[org()]);
}
