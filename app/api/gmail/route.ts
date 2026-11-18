import {NextRequest} from 'next/server';
import {z} from 'zod';
import {handle} from '@/lib/api';
import {getPool,org,audit} from '@/lib/server-store';
import {connection,GoogleError} from '@/lib/google';
import {captureGmail,gmailSetting,saveGmailSetting} from '@/lib/gmail-capture';
import {readPending} from '@/lib/documents';
export const runtime='nodejs';export const maxDuration=300;export const dynamic='force-dynamic';
// Gestión de Gmail desde la app (como en Recepciones-IA): «save» guarda la configuración y deja la captura pausada,
// «pause» la habilita o la pausa, y «capture» es «Comprobar ahora».
const body=z.discriminatedUnion('action',[z.object({action:z.literal('save'),config:z.unknown()}),z.object({action:z.literal('pause'),paused:z.boolean()}),z.object({action:z.literal('capture')})]);
export async function POST(req:NextRequest){return handle(req,async()=>{const b=body.parse(await req.json());
 if(!(await connection()))throw new GoogleError('Conecta primero Gmail.',409);
 if(b.action==='save'){const s=await saveGmailSetting(b.config);await audit('settings',`Gmail «${s.name}»: ${s.labels.length?'etiquetas '+s.labels.map(l=>l.name).join(', '):'sin etiquetas'} desde ${s.since}${s.sender?'; remitente contiene «'+s.sender+'»':''}${s.subject?'; asunto contiene «'+s.subject+'»':''}. Captura pausada.`);return {saved:true};}
 if(b.action==='pause'){if(!b.paused&&!(await gmailSetting())?.labels.length)throw new GoogleError('Antes de habilitar la captura, pulsa Configurar y elige al menos una etiqueta.',422);
  await getPool().query('UPDATE cc_google SET paused=$2 WHERE organization_id=$1',[org(),b.paused]);await audit('settings',b.paused?'Captura de Gmail pausada.':'Captura de Gmail habilitada.');return {saved:true};}
 const end=Date.now()+240_000,summary=await captureGmail(40_000),setting=await gmailSetting();
 return {...summary,read:setting?.autoRead?await readPending(end-60_000):null};});}
