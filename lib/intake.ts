import {randomUUID} from 'node:crypto';
import {PDFDocument} from 'pdf-lib';
import {getPool,org,tx,audit} from './server-store';
import {readFile,ReadError} from './ai-reader';
import {decidirEstado,estadoTrasError,concilia,maxIntentos,motivoError,type Estado} from './classify-rules';
import {PROMPT_VERSION,type Clasificacion} from './prompts/clasificador-documentos';
import {findTemplates,templateContext} from './templates';
import {isEInvoice} from './extraction';
import {AppError,storeFile,insertDocument,fillDocument,findDuplicate,fromClasificacion,metaFrom,emptyInput,umbrales,recompute,readOriginal,rereadDraft,logClassification,kindLabel} from './documents';
// Entrada única de adjuntos de correo y clasificador (R2, R3 y R6 de docs/requisitos-clasificacion.md).
// Ningún otro código puede crear documentos a partir del correo: tests/clasificacion.test.ts lo comprueba.

export type Adjunto={bytes:Buffer;filename:string;mime:string;messageId:string;sender?:string|null;subject?:string|null;receivedAt?:Date|null;parentFileId?:string|null;pages?:string|null};
/**
 * ÚNICO punto de entrada de un adjunto de correo. Guarda el archivo y crea su documento en PENDIENTE_CLASIFICACION:
 * no aparece en ningún listado hasta que lo clasifique clasificarDocumento. Un archivo idéntico a otro ya guardado
 * (mismo contenido) no crea un documento nuevo.
 */
export async function procesarAdjuntoEntrante(a:Adjunto):Promise<{id:string|null;fileId:string;duplicate:boolean}>{
 const stored=await storeFile({bytes:a.bytes,filename:a.filename,mime:a.mime,source:'gmail',sourceRef:a.messageId,sender:a.sender,subject:a.subject,receivedAt:a.receivedAt,parentFileId:a.parentFileId,pages:a.pages});
 if(stored.duplicate)return {id:null,fileId:stored.id,duplicate:true};
 const id=randomUUID();
 // «kind» es solo un valor técnico hasta que se clasifique; lo que manda es el estado.
 await tx(c=>insertDocument(c,id,stored.id,emptyInput('invoice'),[],{classState:'PENDIENTE_CLASIFICACION',origin:'correo',classBy:'ia'}));
 return {id,fileId:stored.id,duplicate:false};}

/** Separa por páginas un PDF con varios documentos. Cada parte entra como un adjunto más, enlazada al archivo y al correo originales. */
async function separar(fileId:string,file:{filename:string;source_ref:string;sender:string|null;subject:string|null;received_at:Date|null},partes:Clasificacion['partes']){
 let source:PDFDocument;try{source=await PDFDocument.load((await readOriginal(fileId)).bytes,{updateMetadata:false});}catch{return 0;}
 const total=source.getPageCount();if(partes.some(p=>p.desde>p.hasta||p.hasta>total))return 0;
 const base=file.filename.replace(/\.pdf$/i,'');let made=0;
 for(const p of partes){const part=await PDFDocument.create();const pages=await part.copyPages(source,Array.from({length:p.hasta-p.desde+1},(_,i)=>p.desde-1+i));pages.forEach(x=>part.addPage(x));
  const range=p.desde===p.hasta?String(p.desde):`${p.desde}-${p.hasta}`;
  const r=await procesarAdjuntoEntrante({bytes:Buffer.from(await part.save()),filename:`${base} (pág. ${range}).pdf`,mime:'application/pdf',messageId:file.source_ref,sender:file.sender,subject:file.subject,receivedAt:file.received_at,parentFileId:fileId,pages:range});
  if(!r.duplicate)made++;}
 return made;}

export type Resultado={estado:Estado;blocked?:string;confirmed?:boolean;duplicate?:boolean;split?:number};
/**
 * Clasifica un documento del correo pendiente (o vuelve a clasificar un dudoso). La IA propone; las reglas de
 * classify-rules deciden. Un fallo de la IA nunca acaba en FACTURA, ALBARAN ni DESCARTADO.
 */
export async function clasificarDocumento(id:string,opts:{fresh?:boolean}={}):Promise<Resultado>{
 const pool=getPool();
 const r=await pool.query('SELECT d.file_id,d.class_state,d.status,d.origin,f.mime,f.parent_file_id,f.filename,f.source_ref,f.sender,f.subject,f.received_at FROM cc_documents d JOIN cc_files f ON f.id=d.file_id WHERE d.id=$1 AND d.organization_id=$2',[id,org()]);
 if(!r.rowCount)throw new AppError('Documento no encontrado.',404);const row=r.rows[0];
 if(row.origin!=='correo')throw new AppError('Solo se clasifican los documentos recibidos por correo.',400);
 if(row.status!=='draft'||!['PENDIENTE_CLASIFICACION','DUDOSO'].includes(row.class_state))throw new AppError('Solo se clasifica un documento pendiente o dudoso.',409);
 // R5: si el proveedor tiene plantilla validada se pasa a la IA como ayuda. No exime de clasificar: el documento
 // sigue el mismo camino (lectura con el prompt único y reglas de classify-rules) con plantilla o sin ella.
 const templates=await findTemplates(row.sender,isEInvoice(row.mime)?(await readOriginal(row.file_id)).bytes.toString('utf8').slice(0,200_000):null),context=templateContext(templates);
 let x:Clasificacion|undefined;
 for(let intento=1;intento<=maxIntentos&&!x;intento++){
  await pool.query("UPDATE cc_files SET read_state='pending' WHERE id=$1 AND organization_id=$2 AND read_state='error'",[row.file_id,org()]);
  try{x=await readFile(row.file_id,{context,fresh:opts.fresh&&intento===1});}
  catch(e){if(!(e instanceof ReadError))throw e;
   // Límite diario, clave o lectura en curso: no es un error de clasificación; el documento se queda como estaba.
   if(e.kind!=='ai')return {estado:row.class_state,blocked:e.message};
   if(estadoTrasError(e.kind,intento)==='DUDOSO'){const reason=`${motivoError}: ${e.message}`;
    await tx(async c=>{await c.query("UPDATE cc_documents SET class_state='DUDOSO',class_by='ia',class_reason=$3,prompt_version=$4,classified_at=now(),class_attempts=class_attempts+1,updated_at=now() WHERE id=$1 AND organization_id=$2",[id,org(),reason.slice(0,500),PROMPT_VERSION]);
     await logClassification(c,id,{classState:'DUDOSO',classBy:'ia',reason,promptVersion:PROMPT_VERSION});});
    return {estado:'DUDOSO'};}}}
 if(!x)return {estado:row.class_state,blocked:'No se completó la lectura.'};
 if(!templates.length)x={...x,coincide_con_plantilla:'sin_plantilla'};
 // Formato cambiado: se extrae de nuevo sin la plantilla. Las reglas lo dejan DUDOSO y, al validarlo, se actualiza la plantilla.
 else if(x.coincide_con_plantilla==='no'){try{x={...await readFile(row.file_id,{fresh:true}),coincide_con_plantilla:'no'};}catch{/* se conserva la lectura hecha con la plantilla */}}
 // Varios documentos en un PDF: se separa por páginas y cada parte se clasifica por separado.
 if(x.partes.length>1&&row.mime==='application/pdf'&&!row.parent_file_id){const n=await separar(row.file_id,row,x.partes);
  if(n){const d=decidirEstado(x),reason=`El archivo contiene ${x.partes.length} documentos (${x.partes.map(p=>p.tipo).join(', ')}): se ha separado por páginas y cada parte se clasifica aparte.`;
   await tx(async c=>{await fillDocument(c,id,emptyInput('invoice'),[],{...metaFrom(x,d,'DESCARTADO','correo','ia'),reason,detectedType:'varios documentos'});await audit('classify',`Archivo «${row.filename}» separado en ${n} documento(s).`,id,c);});
   return {estado:'DESCARTADO',split:n};}}
 const d=decidirEstado(x,await umbrales()),input=fromClasificacion(x,d.kind),warnings=x.datos.warnings;
 return tx(async c=>{
  const cur=await c.query('SELECT status,class_state FROM cc_documents WHERE id=$1 AND organization_id=$2 FOR UPDATE',[id,org()]);
  if(cur.rows[0].status!=='draft'||!['PENDIENTE_CLASIFICACION','DUDOSO'].includes(cur.rows[0].class_state))return {estado:cur.rows[0].class_state as Estado};
  // Decisión del propietario: lo que la IA verifica como factura o albarán concilia solo. Si ya existía el mismo
  // documento (proveedor + número), se enlaza con él y no cuenta dos veces.
  const dup=concilia(d.estado)?await findDuplicate(c,id,input):null,confirmed=concilia(d.estado)&&!dup;
  const meta=metaFrom(x,d,d.estado,'correo','ia');if(dup)meta.reason=`Ya estaba registrado ${kindLabel[d.kind]==='Factura'?'la factura':kindLabel[d.kind]==='Albarán'?'el albarán':'el abono'} ${dup.number} de este proveedor: se ha enlazado con él y no cuenta dos veces.`;
  await fillDocument(c,id,input,warnings,meta,{status:confirmed?'confirmed':'draft',duplicateOf:dup?.id||null});
  const template=templates.find(t=>t.kind===d.kind)||templates[0];
  if(template)await c.query('UPDATE cc_documents SET template_id=$2,template_used=true WHERE id=$1',[id,template.id]);
  if(confirmed)await recompute(c);
  await audit('classify',`Clasificado como ${d.estado}${dup?' (duplicado)':''}: ${x.tipo_documento||'documento'} ${input.number||'sin número'}${input.supplier?' de '+input.supplier:''}. ${d.motivo}`,id,c);
  return {estado:d.estado,confirmed,duplicate:Boolean(dup)};});}

/** Clasifica los documentos pendientes mientras quede tiempo. Se detiene si la IA no está disponible (límite o clave). */
export async function clasificarPendientes(until:number){
 const r=await getPool().query("SELECT id FROM cc_documents WHERE organization_id=$1 AND class_state='PENDIENTE_CLASIFICACION' AND origin='correo' ORDER BY created_at LIMIT 30",[org()]);
 const out={classified:0,facturas:0,albaranes:0,dudosos:0,descartados:0,pending:r.rowCount||0,blocked:null as string|null};
 for(const row of r.rows){if(Date.now()>until)break;
  const res=await clasificarDocumento(row.id).catch(e=>({estado:'PENDIENTE_CLASIFICACION' as Estado,blocked:e instanceof Error?e.message:'Error al clasificar.'}));
  if(res.blocked){out.blocked=res.blocked;break;}
  out.classified++;out.pending--;if(res.estado==='FACTURA')out.facturas++;else if(res.estado==='ALBARAN')out.albaranes++;else if(res.estado==='DUDOSO')out.dudosos++;else if(res.estado==='DESCARTADO')out.descartados++;
  if('split' in res&&res.split)out.pending+=res.split;}
 return out;}

/** «Leer con IA» desde la ficha: un documento del correo se reclasifica; uno subido a mano se relee sin filtro. */
export async function releer(id:string){
 const r=await getPool().query('SELECT origin FROM cc_documents WHERE id=$1 AND organization_id=$2',[id,org()]);if(!r.rowCount)throw new AppError('Documento no encontrado.',404);
 if(r.rows[0].origin!=='correo')return rereadDraft(id);
 const res=await clasificarDocumento(id,{fresh:true});if(res.blocked)throw new AppError(res.blocked,503);}
