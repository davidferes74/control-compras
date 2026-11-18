import Anthropic from '@anthropic-ai/sdk';
import {getPool,org} from './server-store';
import {extractionSchema,outputSchema,extractionSystem,extractionTask,isEInvoice,type Extraction} from './extraction';
// Lectura de un archivo guardado (cc_files) con Claude. El resultado se guarda en el propio archivo: un archivo
// idéntico (mismo contenido) nunca se lee dos veces. Límite diario para controlar el gasto.
export const dailyLimit=()=>Math.max(1,Number(process.env.AI_DAILY_LIMIT)||40);
// Modelo configurable; por defecto el que ya usaba el proyecto de origen (económico para transcribir documentos).
export const readerModel=()=>process.env.ANTHROPIC_MODEL||'claude-haiku-5-5';
export class ReadError extends Error{constructor(message:string,public status:number){super(message);}}
let client:Anthropic|undefined;
const anthropic=()=>client??=new Anthropic({apiKey:process.env.ANTHROPIC_API_KEY,timeout:55_000,maxRetries:1});

export async function readFile(fileId:string):Promise<Extraction>{
 if(!process.env.ANTHROPIC_API_KEY)throw new ReadError('Falta ANTHROPIC_API_KEY en Vercel. Guárdala y vuelve a desplegar.',503);
 const pool=getPool();
 // Reserva: un solo intento a la vez por archivo y dentro del límite diario.
 const c=await pool.connect();let file:{mime:string;bytes:Buffer};
 try{await c.query('BEGIN');
  const r=await c.query('SELECT mime,bytes,read_state,read_result,updated_at FROM cc_files WHERE id=$1 AND organization_id=$2 FOR UPDATE',[fileId,org()]);
  if(!r.rowCount)throw new ReadError('Archivo no encontrado.',404);const row=r.rows[0];
  if(row.read_state==='ready'){await c.query('COMMIT');return extractionSchema.parse(row.read_result);}
  if(row.read_state==='reading'&&Date.now()-new Date(row.updated_at).getTime()<120_000)throw new ReadError('La lectura de este archivo ya está en curso.',409);
  await c.query('INSERT INTO cc_ai_daily(organization_id) VALUES($1) ON CONFLICT DO NOTHING',[org()]);
  const budget=await c.query('UPDATE cc_ai_daily SET calls=calls+1 WHERE organization_id=$1 AND day=CURRENT_DATE AND calls<$2 RETURNING calls',[org(),dailyLimit()]);
  if(!budget.rowCount)throw new ReadError(`Se ha alcanzado el límite de ${dailyLimit()} lecturas con IA por hoy. Puedes completar el documento a mano o esperar a mañana.`,429);
  await c.query("UPDATE cc_files SET read_state='reading',read_error=NULL,updated_at=now() WHERE id=$1",[fileId]);
  await c.query('COMMIT');file=row;
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
 const fail=async(message:string,status:number)=>{await pool.query("UPDATE cc_files SET read_state='error',read_error=$2,updated_at=now() WHERE id=$1",[fileId,message]);return new ReadError(message,status);};
 const data=file.bytes.toString('base64');
 // Las facturas electrónicas (XML, UBL, EDIFACT) se envían como documento de texto; PDF e imágenes, tal cual.
 const block:Anthropic.ContentBlockParam=isEInvoice(file.mime)?{type:'document',source:{type:'text',media_type:'text/plain',data:file.bytes.toString('utf8').replace(/^﻿/,'')}}:file.mime==='application/pdf'
  ?{type:'document',source:{type:'base64',media_type:'application/pdf',data}}
  :{type:'image',source:{type:'base64',media_type:file.mime as 'image/jpeg'|'image/png'|'image/webp',data}};
 let response:Anthropic.Message;
 try{response=await anthropic().messages.create({model:readerModel(),max_tokens:16000,system:extractionSystem,output_config:{format:{type:'json_schema',schema:outputSchema}},messages:[{role:'user',content:[block,{type:'text',text:extractionTask}]}]});}
 catch(e){
  if(e instanceof Anthropic.AuthenticationError)throw await fail('Anthropic rechaza la API key. Revisa ANTHROPIC_API_KEY.',502);
  if(e instanceof Anthropic.NotFoundError)throw await fail('El modelo configurado no está disponible para esta cuenta. Revisa ANTHROPIC_MODEL.',502);
  if(e instanceof Anthropic.RateLimitError)throw await fail('Anthropic ha limitado las peticiones. Reintenta en unos minutos.',429);
  if(e instanceof Anthropic.BadRequestError)throw await fail('Anthropic no pudo procesar el archivo (¿protegido, dañado o demasiado grande?).',422);
  if(e instanceof Anthropic.APIError)throw await fail('Anthropic no está disponible ahora. Reintenta más tarde.',502);
  throw await fail('No se pudo contactar con Anthropic. Reintenta más tarde.',502);}
 if(response.stop_reason==='refusal')throw await fail('El modelo ha rechazado leer este archivo. Complétalo a mano.',422);
 if(response.stop_reason!=='end_turn')throw await fail('La lectura quedó incompleta (documento demasiado largo). Prueba a dividir el PDF.',422);
 let result:Extraction;
 try{result=extractionSchema.parse(JSON.parse(response.content.filter(b=>b.type==='text').map(b=>b.text).join('')));}
 catch{throw await fail('La lectura no tiene el formato esperado. Reintenta o complétalo a mano.',502);}
 await pool.query("UPDATE cc_files SET read_state='ready',read_result=$2,model=$3,usage=$4,read_error=NULL,updated_at=now() WHERE id=$1",[fileId,JSON.stringify(result),readerModel(),JSON.stringify(response.usage)]);
 return result;
}
