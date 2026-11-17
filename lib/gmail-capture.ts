import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {getPool,org,getSetting,audit} from './server-store';
import {accessToken,gmail,GoogleError} from './google';
import {readMessage,maxMessageBytes} from './mail-items';
import {storeFile,draftFromFile} from './documents';
// Captura de adjuntos desde Gmail: revisa las etiquetas elegidas, guarda cada PDF/imagen como archivo y crea
// un borrador (leído con IA si está activado). Cada correo se procesa una sola vez (cc_gmail_seen).
export const gmailSettingSchema=z.object({labels:z.array(z.object({id:z.string().min(1).max(200),name:z.string().max(200)})).max(20),since:z.iso.date(),autoRead:z.boolean()});
export type GmailSetting=z.infer<typeof gmailSettingSchema>;
export const gmailSetting=()=>getSetting<GmailSetting>('gmail');
export async function gmailLabels(){const data=await gmail('/labels');return z.array(z.object({id:z.string(),name:z.string(),type:z.string().optional()})).parse(data.labels||[]).filter(l=>l.type==='user'||['INBOX','IMPORTANT','STARRED'].includes(l.id)).sort((a,b)=>a.name.localeCompare(b.name,'es'));}

export async function captureGmail(budgetMs=40_000){
 const setting=await gmailSetting();if(!setting?.labels.length)throw new GoogleError('Elige en Ajustes qué etiquetas de Gmail se revisan.',409);
 const pool=getPool(),lease=randomUUID(),end=Date.now()+budgetMs;
 const claim=await pool.query("UPDATE cc_google SET lease_until=now()+interval '2 minutes',lease_token=$2 WHERE organization_id=$1 AND (lease_until IS NULL OR lease_until<now()) RETURNING 1",[org(),lease]);
 if(!claim.rowCount)throw new GoogleError('Ya hay una revisión del correo en curso.',409);
 const summary={messages:0,files:0,drafts:0,skipped:0,more:false};
 try{const token=await accessToken();const after=Math.floor(Date.parse(setting.since+'T00:00:00Z')/1000);
  outer:for(const label of setting.labels){let pageToken:string|undefined;
   for(let page=0;page<4;page++){const params=new URLSearchParams({maxResults:'50',labelIds:label.id,q:`has:attachment after:${after}`});if(pageToken)params.set('pageToken',pageToken);
    const list=await gmail('/messages?'+params,token);const ids=z.array(z.object({id:z.string().regex(/^[a-zA-Z0-9_-]+$/)})).parse(list.messages||[]).map(m=>m.id);
    const seen=new Set((await pool.query('SELECT message_id FROM cc_gmail_seen WHERE organization_id=$1 AND message_id=ANY($2)',[org(),ids])).rows.map(r=>r.message_id));
    for(const id of ids){if(seen.has(id))continue;if(Date.now()>end){summary.more=true;break outer;}
     const meta=await gmail(`/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,token);const header=(h:string)=>String((meta.payload?.headers||[]).find((x:{name:string})=>x.name.toLowerCase()===h)?.value||'').slice(0,300);
     let outcome='sin adjuntos válidos';
     if(!meta.sizeEstimate||meta.sizeEstimate>maxMessageBytes)outcome='correo mayor de 6 MB';
     else{const items=await readMessage(async()=>{const raw=await gmail(`/messages/${id}?format=raw`,token);return typeof raw.raw==='string'?Buffer.from(raw.raw,'base64url'):null;},e=>e instanceof GoogleError);
      let saved=0;for(const it of items){if(it.status!=='received'||!it.bytes||!it.mime)continue;const f=await storeFile({bytes:it.bytes,filename:it.filename,mime:it.mime,source:'gmail',sourceRef:id,sender:header('from'),subject:header('subject'),receivedAt:meta.internalDate?new Date(Number(meta.internalDate)):null});summary.files++;saved++;
       if(!f.duplicate){await draftFromFile(f.id,{read:false});summary.drafts++;}}
      outcome=saved?`${saved} adjunto(s)`:outcome;if(!saved)summary.skipped++;}
     await pool.query('INSERT INTO cc_gmail_seen(organization_id,message_id,outcome) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[org(),id,outcome]);summary.messages++;}
    pageToken=list.nextPageToken;if(!pageToken)break;}}
  await pool.query('UPDATE cc_google SET last_sync=now(),last_error=NULL WHERE organization_id=$1',[org()]);
  if(summary.drafts)await audit('gmail',`Gmail: ${summary.drafts} documento(s) nuevo(s) de ${summary.messages} correo(s).`);
  return summary;}
 catch(e){await pool.query('UPDATE cc_google SET last_error=$2 WHERE organization_id=$1',[org(),e instanceof GoogleError?e.message:'No se completó la revisión de Gmail.']);throw e;}
 finally{await pool.query('UPDATE cc_google SET lease_until=NULL,lease_token=NULL WHERE organization_id=$1 AND lease_token=$2',[org(),lease]);}}
