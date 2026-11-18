import {NextRequest} from 'next/server';
import {z} from 'zod';
import {handle,json} from '@/lib/api';
import {getPool,org,audit} from '@/lib/server-store';
import {encryptionReady} from '@/lib/crypto';
import {authorizationUrl,googleReady,appUrl,hashState,newState,driveScope} from '@/lib/google';
import {driveStatus,folderNameSchema,forgetDrive} from '@/lib/drive';
import {archivePending,refreshSheet} from '@/lib/archive';
export const runtime='nodejs';export const maxDuration=60;export const dynamic='force-dynamic';
// Conexión guiada con Google Drive (portada de Recepciones-IA): «start» lleva a Google con el nombre de la carpeta,
// «sync» guarda ahora lo pendiente y «disconnect» olvida la autorización (la carpeta se queda en Drive).
export async function GET(req:NextRequest){return handle(req,()=>driveStatus());}
const body=z.discriminatedUnion('action',[z.object({action:z.literal('start'),folderName:z.string().max(200)}),z.object({action:z.literal('sync')}),z.object({action:z.literal('disconnect')})]);
export async function POST(req:NextRequest){return handle(req,async()=>{
 const text=await req.text();if(text.length>2000)return json({error:'Solicitud demasiado grande.'},413);const b=body.parse(JSON.parse(text||'{}'));
 if(b.action==='start'){
  if(new URL(req.url).origin!==appUrl())return json({error:'Conecta Google Drive desde la dirección de producción de la app.'},403);
  if(!googleReady()||!encryptionReady())return json({error:'Falta preparar Google en el servidor (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET y TOKEN_ENCRYPTION_KEY).'},503);
  const parsed=folderNameSchema.safeParse(b.folderName);if(!parsed.success)return json({error:'Escribe un nombre para la carpeta.'},422);
  const state=newState(),session=hashState(req.cookies.get('ria_session')!.value);
  await getPool().query("DELETE FROM cc_oauth_states WHERE expires_at<now() OR (organization_id=$1 AND session_hash=$2 AND purpose='drive')",[org(),session]);
  await getPool().query("INSERT INTO cc_oauth_states(state_hash,organization_id,session_hash,expires_at,purpose,data) VALUES($1,$2,$3,now()+interval '10 minutes','drive',$4)",[hashState(state),org(),session,JSON.stringify({folderName:parsed.data})]);
  return {url:authorizationUrl(state,driveScope)};
 }
 if(b.action==='sync'){const result=await archivePending(45_000);const sheet=await refreshSheet();return json({...result,error:result.error||(sheet.ok||!(await driveStatus()).connected?null:sheet.message||null),status:await driveStatus()},result.error?502:200);}
 await forgetDrive();await audit('drive','Google Drive desconectado. La carpeta y sus documentos siguen en Drive.');return {saved:true};
});}
