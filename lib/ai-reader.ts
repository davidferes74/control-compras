import {createHash,randomUUID} from 'node:crypto';
import {getPool,org} from './server-store';
// Lector común de documentos con Claude: caché por archivo idéntico, límite diario del piloto, original
// privado en ria_documents y salida validada. Lo usan la lectura de albaranes/facturas y la de etiquetas.
export const dailyLimit=10;
export const readerModel=()=>process.env.ANTHROPIC_MODEL||'claude-haiku-5-5';
export class ReadError extends Error{constructor(message:string,public status:number){super(message);}}
type Options<T>={bytes:Buffer;mime:string;name:string;scope:string;system:string;task:string;schema:object;maxTokens:number;parse:(raw:unknown)=>T};
export async function readDocument<T>(o:Options<T>):Promise<{id:string;result:T;cached:boolean}>{
 if(!process.env.ANTHROPIC_API_KEY)throw new ReadError('Falta ANTHROPIC_API_KEY en Production. Guarda la variable y vuelve a desplegar.',503);
 const model=readerModel();
 // «scope» distingue tipo de lectura y versión del contrato: cambiar el esquema no reutiliza resultados antiguos.
 const digest=createHash('sha256').update(o.scope+':'+model+':').update(o.bytes).digest('hex');
 const id=randomUUID();let savedId=id;let reserved=false;
 try{
  const client=await getPool().connect();
  try{await client.query('BEGIN');await client.query('INSERT INTO ria_ai_daily(organization_id) VALUES($1) ON CONFLICT DO NOTHING',[org()]);await client.query('SELECT calls FROM ria_ai_daily WHERE organization_id=$1 AND day=CURRENT_DATE FOR UPDATE',[org()]);
   const prior=await client.query('SELECT id,state,result,updated_at FROM ria_documents WHERE organization_id=$1 AND digest=$2',[org(),digest]);const old=prior.rows[0];
   if(old?.state==='ready'){await client.query('COMMIT');return {id:old.id,result:o.parse(old.result),cached:true};}
   if(old?.state==='pending'&&Date.now()-new Date(old.updated_at).getTime()<120000){await client.query('ROLLBACK');throw new ReadError('La lectura está en curso. Espera antes de reintentar.',409);}
   const budget=await client.query('UPDATE ria_ai_daily SET calls=calls+1 WHERE organization_id=$1 AND day=CURRENT_DATE AND calls<$2 RETURNING calls',[org(),dailyLimit]);
   if(!budget.rowCount){await client.query('ROLLBACK');throw new ReadError(`Límite de piloto alcanzado: ${dailyLimit} intentos de lectura al día. Puedes continuar manualmente.`,429);}
   if(old){savedId=old.id;await client.query("UPDATE ria_documents SET state='pending',updated_at=now() WHERE id=$1",[savedId]);}else await client.query('INSERT INTO ria_documents(id,organization_id,digest,filename,mime,original,model) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,org(),digest,o.name,o.mime,o.bytes,model]);
   await client.query('COMMIT');reserved=true;
  }catch(e){if(!(e instanceof ReadError))await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
  const block={type:o.mime==='application/pdf'?'document':'image',source:{type:'base64',media_type:o.mime,data:o.bytes.toString('base64')}};
  const response=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},signal:AbortSignal.timeout(45000),body:JSON.stringify({model,max_tokens:o.maxTokens,system:o.system,messages:[{role:'user',content:[block,{type:'text',text:o.task}]}],output_config:{format:{type:'json_schema',schema:o.schema}}})});
  if(!response.ok)throw new ReadError(response.status===401?'Anthropic rechaza la API key. Revisa ANTHROPIC_API_KEY.':response.status===429?'Anthropic ha limitado las peticiones. Reintenta más tarde.':response.status===404?'El modelo no está disponible para esta cuenta. Revisa ANTHROPIC_MODEL.':'Anthropic no pudo procesar el archivo. Revisa saldo, modelo y documento.',502);
  const body=await response.json();if(body.stop_reason!=='end_turn')throw new Error('Lectura incompleta o rechazada.');
  const result=o.parse(JSON.parse(body.content.filter((c:{type:string})=>c.type==='text').map((c:{text:string})=>c.text).join('')));
  await getPool().query("UPDATE ria_documents SET state='ready',result=$2,usage=$3,updated_at=now() WHERE id=$1",[savedId,JSON.stringify(result),JSON.stringify(body.usage)]);
  return {id:savedId,result,cached:false};
 }catch(e){
  if(reserved)await getPool().query("UPDATE ria_documents SET state='error',updated_at=now() WHERE id=$1",[savedId]).catch(()=>{});
  if(e instanceof ReadError)throw e;
  throw new ReadError('No se completó la lectura. El original guardado se conserva; puedes reintentar o continuar manualmente.',502);
 }
}
