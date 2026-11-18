import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {getPool,org,getSetting,setSetting,audit} from './server-store';
import {accessToken,gmail,connection,GoogleError} from './google';
import {readMessage,maxMessageBytes} from './mail-items';
import {procesarAdjuntoEntrante} from './intake';
// Captura de adjuntos desde Gmail: revisa las etiquetas elegidas y entrega cada PDF o factura electrónica a la
// entrada única (procesarAdjuntoEntrante), que lo deja pendiente de clasificar. Cada correo se procesa una sola vez (cc_gmail_seen).
// Configuración como en Recepciones-IA: nombre, etiquetas, fecha inicial y filtros «contiene» de remitente y asunto.
export const gmailSettingSchema=z.object({name:z.string().trim().min(1).max(100).default('Facturas Gmail'),labels:z.array(z.object({id:z.string().min(1).max(200),name:z.string().max(200)})).max(20),since:z.iso.date(),sender:z.string().trim().max(254).default(''),subject:z.string().trim().max(150).default(''),own:z.string().trim().max(1000).regex(/^[A-Za-z0-9._%+@\-\s,;]*$/,'Cuentas y dominios propios: solo direcciones o dominios separados por comas.').default(''),autoRead:z.boolean()});
export type GmailSetting=z.infer<typeof gmailSettingSchema>;
export const defaultGmailSetting=():GmailSetting=>gmailSettingSchema.parse({labels:[],since:new Date(Date.now()-30*864e5).toISOString().slice(0,10),autoRead:true});
export const gmailSetting=async()=>{const s=await getSetting<Partial<GmailSetting>>('gmail');return s?gmailSettingSchema.parse(s):null;};
/** ¿Pasa el correo los filtros de remitente y asunto? Comparación «contiene», sin distinguir mayúsculas. */
export const passesFilters=(s:Pick<GmailSetting,'sender'|'subject'>,from:string,subject:string)=>(!s.sender||from.toLowerCase().includes(s.sender.toLowerCase()))&&(!s.subject||subject.toLowerCase().includes(s.subject.toLowerCase()));
// ---------- R1: solo correos de entrada (ver docs/requisitos-clasificacion.md) ----------
/** Dirección del remitente en minúsculas: «Nombre <a@b.c>» → «a@b.c». Vacío si no se reconoce. */
export const senderAddress=(from:string)=>(from.match(/<([^<>\s]+@[^<>\s]+)>/)?.[1]||from.match(/[^\s<>"',;:()]+@[^\s<>"',;:()]+/)?.[0]||'').toLowerCase();
/** Cuentas y dominios propios: la lista de Ajustes más la cuenta conectada. Un dominio incluye sus subdominios. */
export const ownEntries=(own:string,account?:string|null)=>[...new Set([...own.split(/[\s,;]+/),account||''].map(x=>x.trim().toLowerCase().replace(/^@/,'')).filter(Boolean))];
const notIncomingLabels=['SENT','DRAFT','SPAM','TRASH'];
/** ¿Es un correo recibido de un tercero? Falso para Enviados, Borradores, Spam y Papelera, y para remitentes propios o irreconocibles. */
export function isIncoming(m:{labelIds?:string[];from:string},own:string[]){
 if((m.labelIds||[]).some(l=>notIncomingLabels.includes(l)))return false;
 const a=senderAddress(m.from);if(!a)return false;const domain=a.slice(a.lastIndexOf('@')+1);
 return !own.some(o=>o.includes('@')?o===a:domain===o||domain.endsWith('.'+o));}
/** Consulta a Gmail: solo recibidos con adjunto PDF o factura electrónica. El mismo filtro se repite en código con isIncoming. */
export const gmailQuery=(after:number,own:string[])=>['has:attachment {filename:pdf filename:xml filename:edi filename:edifact}','after:'+after,'-in:sent -in:drafts -in:spam -in:trash -from:me',...own.filter(o=>/^[a-z0-9._%+@-]+$/.test(o)).map(o=>'-from:'+o)].join(' ');
export const outgoingOutcome='correo de salida o propio';
/** Guarda la configuración: valida las etiquetas contra Gmail, deja la captura pausada y vuelve a evaluar los correos excluidos por filtros. */
export async function saveGmailSetting(input:unknown){const s=gmailSettingSchema.parse(input);const valid=await gmailLabels();const unknown=s.labels.filter(l=>!valid.some(v=>v.id===l.id));if(unknown.length)throw new GoogleError('Etiqueta no válida: '+unknown.map(l=>l.name||l.id).join(', ')+'.',422);
 const claim=await getPool().query('UPDATE cc_google SET paused=true WHERE organization_id=$1 AND (lease_until IS NULL OR lease_until<now()) RETURNING 1',[org()]);if(!claim.rowCount)throw new GoogleError('Cuenta ocupada o no disponible. Reintenta en un momento.',409);
 await setSetting('gmail',s);await getPool().query("DELETE FROM cc_gmail_seen WHERE organization_id=$1 AND outcome=ANY($2)",[org(),['excluido por filtros',outgoingOutcome]]);return s;}
export async function gmailLabels(){const data=await gmail('/labels');return z.array(z.object({id:z.string(),name:z.string(),type:z.string().optional()})).parse(data.labels||[]).filter(l=>l.type==='user'||['INBOX','IMPORTANT','STARRED'].includes(l.id)).sort((a,b)=>a.name.localeCompare(b.name,'es'));}

export async function captureGmail(budgetMs=40_000){
 const setting=await gmailSetting()||defaultGmailSetting();
 if((await connection())?.paused)throw new GoogleError('La captura está pausada. Habilítala en Ajustes → Gmail.',409);
 const pool=getPool(),lease=randomUUID(),end=Date.now()+budgetMs;
 const claim=await pool.query("UPDATE cc_google SET lease_until=now()+interval '2 minutes',lease_token=$2 WHERE organization_id=$1 AND paused=false AND (lease_until IS NULL OR lease_until<now()) RETURNING 1",[org(),lease]);
 if(!claim.rowCount)throw new GoogleError('Ya hay una revisión del correo en curso.',409);
 const summary={messages:0,files:0,drafts:0,skipped:0,more:false};
 try{const token=await accessToken();const own=ownEntries(setting.own,(await connection())?.email);const after=Math.floor(Date.parse(setting.since+'T00:00:00Z')/1000);
  // Sin etiquetas marcadas se revisa todo el correo. Gmail ya filtra por nombre de adjunto; el contenido se comprueba después.
  outer:for(const label of (setting.labels.length?setting.labels:[null])){let pageToken:string|undefined;
   for(let page=0;page<4;page++){const params=new URLSearchParams({maxResults:'50',q:gmailQuery(after,own)});if(label)params.set('labelIds',label.id);if(pageToken)params.set('pageToken',pageToken);
    const list=await gmail('/messages?'+params,token);const ids=z.array(z.object({id:z.string().regex(/^[a-zA-Z0-9_-]+$/)})).parse(list.messages||[]).map(m=>m.id);
    const seen=new Set((await pool.query('SELECT message_id FROM cc_gmail_seen WHERE organization_id=$1 AND message_id=ANY($2)',[org(),ids])).rows.map(r=>r.message_id));
    for(const id of ids){if(seen.has(id))continue;if(Date.now()>end){summary.more=true;break outer;}
     const meta=await gmail(`/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,token);const header=(h:string)=>String((meta.payload?.headers||[]).find((x:{name:string})=>x.name.toLowerCase()===h)?.value||'').slice(0,300);
     let outcome='sin adjuntos válidos';
     // R1: un correo de salida o propio nunca llega a guardarse ni al clasificador.
     if(!isIncoming({labelIds:Array.isArray(meta.labelIds)?meta.labelIds:[],from:header('from')},own)){outcome=outgoingOutcome;summary.skipped++;}
     else if(!passesFilters(setting,header('from'),header('subject'))){outcome='excluido por filtros';summary.skipped++;}
     else if(!meta.sizeEstimate||meta.sizeEstimate>maxMessageBytes)outcome='correo mayor de 6 MB';
     else{const items=await readMessage(async()=>{const raw=await gmail(`/messages/${id}?format=raw`,token);return typeof raw.raw==='string'?Buffer.from(raw.raw,'base64url'):null;},e=>e instanceof GoogleError);
      let saved=0;for(const it of items){if(it.status!=='received'||!it.bytes||!it.mime)continue;const f=await procesarAdjuntoEntrante({bytes:it.bytes,filename:it.filename,mime:it.mime,messageId:id,sender:header('from'),subject:header('subject'),receivedAt:meta.internalDate?new Date(Number(meta.internalDate)):null});summary.files++;saved++;
       if(!f.duplicate)summary.drafts++;}
      outcome=saved?`${saved} adjunto(s)`:outcome;if(!saved)summary.skipped++;}
     await pool.query('INSERT INTO cc_gmail_seen(organization_id,message_id,outcome) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[org(),id,outcome]);summary.messages++;}
    pageToken=list.nextPageToken;if(!pageToken)break;}}
  await pool.query('UPDATE cc_google SET last_sync=now(),last_error=NULL WHERE organization_id=$1',[org()]);
  if(summary.drafts)await audit('gmail',`Gmail: ${summary.drafts} adjunto(s) nuevo(s) de ${summary.messages} correo(s), pendientes de clasificar.`);
  return summary;}
 catch(e){await pool.query('UPDATE cc_google SET last_error=$2 WHERE organization_id=$1',[org(),e instanceof GoogleError?e.message:'No se completó la revisión de Gmail.']);throw e;}
 finally{await pool.query('UPDATE cc_google SET lease_until=NULL,lease_token=NULL WHERE organization_id=$1 AND lease_token=$2',[org(),lease]);}}
