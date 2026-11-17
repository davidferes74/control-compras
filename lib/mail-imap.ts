import {ImapFlow} from 'imapflow';
import {resolve4} from 'node:dns/promises';
import {createHash,randomUUID} from 'node:crypto';
import {allowedHost,publicIPv4,unseal,MailError,describeMailError,type MailConfig} from './mail-config';
import {getPool,org} from './server-store';
import {readMessage,excludedItem,maxMessageBytes,type MailItem} from './mail-items';
export async function withMailbox<T>(config:MailConfig,work:(client:ImapFlow)=>Promise<T>):Promise<T>{
 if(!allowedHost(config.host))throw new MailError('Ese nombre de servidor no es válido. Debe ser un nombre público como imap.tuproveedor.com.','host');
 let addresses:string[];try{addresses=await resolve4(config.host);}catch(e){throw describeMailError(e);}
 if(!addresses.length||addresses.some(ip=>!publicIPv4(ip)))throw new MailError('Ese servidor no es accesible desde internet.','host');
 const client=new ImapFlow({host:addresses[0],servername:config.host,port:993,secure:true,auth:{user:config.username,pass:config.password},logger:false,disableAutoIdle:true,disableCompression:true,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,maxLiteralSize:6*1024*1024,maxResponseSize:7*1024*1024,tls:{rejectUnauthorized:true,minVersion:'TLSv1.2'}});
 client.on('error',()=>{});const timeout=setTimeout(()=>client.close(),45000);
 try{try{await client.connect();}catch(e){throw describeMailError(e);}return await work(client);}finally{clearTimeout(timeout);client.close();}
}
export async function testMailbox(config:MailConfig){return withMailbox(config,async c=>{const folders=(await c.list()).filter(f=>!f.flags.has('\\Noselect')).map(f=>f.path).slice(0,100);let lock;try{lock=await c.getMailboxLock(config.folder,{readOnly:true});}catch{throw new MailError('La conexión funciona, pero no existe la carpeta «'+config.folder+'». Elige una de la lista.','folder');}lock.release();return folders;});}
export async function inspectMailbox(config:MailConfig,cursor=0,validity?:string){return withMailbox(config,async c=>{
 const lock=await c.getMailboxLock(config.folder,{readOnly:true});try{
 const current=String(c.mailbox&&c.mailbox.uidValidity);const after=current===validity?cursor:0;
 const found=await c.search({since:new Date(config.since+'T00:00:00Z'),...(config.sender?{from:config.sender}:{}),...(config.subject?{subject:config.subject}:{})},{uid:true});
 const uids=(found||[]).filter(uid=>uid>after).sort((a,b)=>a-b);const messages=[];
 for(const uid of uids.slice(0,10)){const m=await c.fetchOne(uid,{envelope:true,size:true},{uid:true});if(!m)continue;messages.push({uid,subject:m.envelope?.subject||'(sin asunto)',sender:(m.envelope?.from||[]).map(f=>f.address||'').join(', '),receivedAt:m.envelope?.date?new Date(m.envelope.date).toISOString():null,size:m.size});}
 return {messages,validity:current,remaining:Math.max(0,uids.length-10)};
 }finally{lock.release();}
});}
export async function captureMailbox(accountId:string){
 const pool=getPool(),token=randomUUID();const claim=await pool.query("UPDATE ria_mail_accounts SET lease_until=now()+interval '2 minutes',lease_token=$3 WHERE id=$1 AND organization_id=$2 AND paused=false AND (lease_until IS NULL OR lease_until<now()) RETURNING *",[accountId,org(),token]);
 const account=claim.rows[0];if(!account)throw Error('Cuenta pausada o comprobación en curso.');
 const config={...account.config,password:unseal(account.secret,org())} as MailConfig;
 let saved=0,processed=0;
 try{await withMailbox(config,async c=>{const lock=await c.getMailboxLock(config.folder,{readOnly:true});try{
 const validity=String(c.mailbox&&c.mailbox.uidValidity);const after=validity===account.uid_validity?Number(account.last_uid):0;
 const found=await c.search({since:new Date(config.since+'T00:00:00Z'),...(config.sender?{from:config.sender}:{}),...(config.subject?{subject:config.subject}:{})},{uid:true});
 const uids=(found||[]).filter(uid=>uid>after).sort((a,b)=>a-b).slice(0,10);
 for(const uid of uids){const meta=await c.fetchOne(uid,{envelope:true,size:true},{uid:true});if(!meta)continue;
 const sender=(meta.envelope?.from||[]).map(x=>x.address||'').join(', ').slice(0,500),subject=(meta.envelope?.subject||'(sin asunto)').slice(0,500),received=meta.envelope?.date||null;
 let items:MailItem[];
 if(!meta.size||meta.size>maxMessageBytes)items=[excludedItem('Correo demasiado grande','Supera 6 MB. Descarga sus adjuntos desde tu correo y súbelos individualmente.')];
 else items=await readMessage(async()=>{const m=await c.fetchOne(uid,{source:{start:0,maxLength:maxMessageBytes+1}},{uid:true});return m?m.source:null;},()=>!c.usable);
 const db=await pool.connect();try{await db.query('BEGIN');const lease=await db.query('SELECT id FROM ria_mail_accounts WHERE id=$1 AND organization_id=$2 AND lease_token=$3 AND paused=false FOR UPDATE',[accountId,org(),token]);if(!lease.rowCount)throw Error('Captura detenida.');
 await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[org()+':mail-digest']);
 for(const [index,item] of items.entries()){const digest=item.bytes?createHash('sha256').update(item.bytes).digest('hex'):null;const prior=digest?await db.query('SELECT id FROM ria_mail_items WHERE organization_id=$1 AND digest=$2 AND original IS NOT NULL LIMIT 1',[org(),digest]):null;const duplicate=Boolean(prior?.rowCount);
 const result=await db.query('INSERT INTO ria_mail_items(id,organization_id,account_id,source_key,sender,subject,received_at,filename,mime,original,digest,status,detail) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT DO NOTHING',[randomUUID(),org(),accountId,`${config.folder}:${validity}:${uid}:${index}`,sender,subject,received,item.filename,item.mime,duplicate?null:item.bytes,digest,duplicate?'duplicate':item.status,duplicate?'Archivo idéntico ya capturado.':item.detail]);if(result.rowCount&&item.bytes&&!duplicate)saved++;}
 await db.query('UPDATE ria_mail_accounts SET uid_validity=$2,last_uid=$3 WHERE id=$1',[accountId,validity,uid]);await db.query('COMMIT');processed++;
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }
 }finally{lock.release();}});
 await pool.query('UPDATE ria_mail_accounts SET last_sync=now(),last_error=NULL WHERE id=$1 AND lease_token=$2',[accountId,token]);return {saved,processed};
 }catch{await pool.query("UPDATE ria_mail_accounts SET last_error='No se completó la captura. Revisa credenciales, carpeta y conexión; vuelve a comprobar.' WHERE id=$1 AND lease_token=$2",[accountId,token]);throw Error('No se completó la captura. Los documentos ya guardados se conservan; puedes reintentar.');}
 finally{await pool.query('UPDATE ria_mail_accounts SET lease_until=NULL,lease_token=NULL WHERE id=$1 AND lease_token=$2',[accountId,token]);}
}
