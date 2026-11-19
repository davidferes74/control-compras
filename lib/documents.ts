import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import {getPool,org,tx,audit,getSetting} from './server-store';
import {readFile,ReadError,readerModel} from './ai-reader';
import {learnTemplate} from './templates';
import {reconcile,supplierGroups,type Doc,type Decisions,type InvoiceMatch,type DeliveryState} from './matching';
import {refMatches} from './normalize';
import {decidirEstado,estadoDe,estadosVisibles,umbralesSchema,umbralesIniciales,type Estado,type Decision,type Umbrales} from './classify-rules';
import {PROMPT_VERSION,type Clasificacion} from './prompts/clasificador-documentos';

export class AppError extends Error{constructor(message:string,public status:number){super(message);}}
const dec=z.string().trim().regex(/^-?\d+(\.\d+)?$/,'Número no válido').nullable();
const str=(max:number)=>z.string().trim().max(max);
export const lineInput=z.object({code:str(100),description:str(500),quantity:dec,unit:str(30),unitPrice:dec,discountPct:dec,amount:dec,deliveryRef:str(100)});
export const documentInput=z.object({kind:z.enum(['invoice','delivery_note','credit_note']),supplier:str(300),supplierTaxId:str(30),number:str(100),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),deliveryRefs:z.array(str(100)).max(200),subtotal:dec,tax:dec,total:dec,lines:z.array(lineInput).max(300)});
export type DocumentInput=z.infer<typeof documentInput>;
export const kindLabel={invoice:'Factura',delivery_note:'Albarán',credit_note:'Abono'} as const;

// ---------- Archivos ----------
export async function storeFile(f:{bytes:Buffer;filename:string;mime:string;source:'upload'|'gmail';sourceRef?:string|null;sender?:string|null;subject?:string|null;receivedAt?:Date|null;parentFileId?:string|null;pages?:string|null}){
 const digest=createHash('sha256').update(f.bytes).digest('hex'),id=randomUUID();
 const r=await getPool().query('INSERT INTO cc_files(id,organization_id,digest,filename,mime,bytes,source,source_ref,sender,subject,received_at,parent_file_id,pages) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(organization_id,digest) DO NOTHING RETURNING id',[id,org(),digest,f.filename.slice(0,200),f.mime,f.bytes,f.source,f.sourceRef||null,f.sender?.slice(0,300)||null,f.subject?.slice(0,300)||null,f.receivedAt||null,f.parentFileId||null,f.pages||null]);
 if(r.rowCount)return {id,duplicate:false};
 const prior=await getPool().query('SELECT id FROM cc_files WHERE organization_id=$1 AND digest=$2',[org(),digest]);return {id:prior.rows[0].id as string,duplicate:true};}

// ---------- Clasificación (docs/requisitos-clasificacion.md) ----------
export type Origin='correo'|'escaneo'|'manual';
/** Estado de clasificación de un documento y su auditoría. Obligatorio al crear: no hay estado por defecto. */
export type ClassMeta={classState:Estado;origin:Origin;classBy:'ia'|'persona'|'manual';reason?:string;detectedType?:string;missing?:string[];confidence?:number|null;promptVersion?:string|null;model?:string|null;data?:unknown};
export const emptyInput=(kind:DocumentInput['kind']):DocumentInput=>({kind,supplier:'',supplierTaxId:'',number:'',date:null,deliveryRefs:[],subtotal:null,tax:null,total:null,lines:[]});
/** Umbrales de confianza configurables (ajuste «clasificador»); por defecto 0,85. */
export async function umbrales():Promise<Umbrales>{const s=umbralesSchema.safeParse({...umbralesIniciales,...(await getSetting<Partial<Umbrales>>('clasificador')||{})});return s.success?s.data:umbralesIniciales;}
export function fromClasificacion(x:Clasificacion,kind:DocumentInput['kind']):DocumentInput{const d=x.datos;
 return {kind,supplier:d.supplier||'',supplierTaxId:d.supplierTaxId||'',number:d.number||'',date:d.date,deliveryRefs:kind==='invoice'?d.deliveryRefs:[],subtotal:d.subtotal,tax:d.tax,total:d.total,
  lines:d.lines.map(l=>({code:l.code||'',description:l.description,quantity:l.quantity,unit:l.unit||'',unitPrice:l.unitPrice,discountPct:l.discountPct,amount:l.amount,deliveryRef:l.deliveryRef||''}))};}
/** Datos de auditoría de una lectura de la IA, con el estado que hayan decidido las reglas. */
export const metaFrom=(x:Clasificacion,d:Decision,classState:Estado,origin:Origin,classBy:ClassMeta['classBy']):ClassMeta=>({classState,origin,classBy,reason:d.motivo,detectedType:x.tipo_documento,missing:d.faltan,confidence:x.confianza,promptVersion:PROMPT_VERSION,model:readerModel(),data:{recipient:x.datos.recipient,recipientTaxId:x.datos.recipientTaxId,orderNumber:x.datos.orderNumber,currency:x.datos.currency,matchesTemplate:x.coincide_con_plantilla,format:x.formato}});
const classParams=(m:ClassMeta)=>[m.classState,m.classBy,m.confidence??null,(m.reason||'').slice(0,500),(m.detectedType||'').slice(0,200),(m.missing||[]).map(x=>x.slice(0,200)).slice(0,30),m.promptVersion||null,m.model||null,m.data===undefined?null:JSON.stringify(m.data)];
export async function logClassification(c:PoolClient,documentId:string,m:Pick<ClassMeta,'classState'|'classBy'|'reason'|'detectedType'|'confidence'|'promptVersion'|'model'>){
 await c.query('INSERT INTO cc_classifications(id,organization_id,document_id,state,by,confidence,reason,detected_type,prompt_version,model) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[randomUUID(),org(),documentId,m.classState,m.classBy,m.confidence??null,(m.reason||'').slice(0,500),(m.detectedType||'').slice(0,200),m.promptVersion||null,m.model||null]);}

// Los archivos subidos a mano NO pasan por el filtro del clasificador (decisión del propietario): se leen con el mismo
// prompt, pero el borrador es visible desde el primer momento y siempre lo confirma una persona. Si la IA no reconoce
// una factura ni un albarán, queda en ámbar (DUDOSO) para que la persona decida; nunca se oculta ni se descarta solo.
const uploadMeta=(x:Clasificacion,d:Decision):ClassMeta=>{const unknown=x.clase==='ninguna'||x.estado==='DESCARTADO';return metaFrom(x,d,unknown?'DUDOSO':estadoDe(d.kind),'escaneo','manual');};
const readWarnings=(x:Clasificacion,d:Decision)=>[...(x.clase==='ninguna'||x.estado==='DESCARTADO'?[`La IA no reconoce este archivo como factura ni albarán (${x.tipo_documento||'tipo desconocido'}): ${d.motivo}`]:d.estado==='DUDOSO'?['Revisa con atención: '+d.motivo]:[]),...x.datos.warnings];

/** Crea (o devuelve) el borrador de un archivo SUBIDO A MANO. Si la IA no puede leerlo, el borrador queda vacío con el motivo. */
export async function draftFromFile(fileId:string,opts:{read:boolean}={read:true}):Promise<{id:string;readError?:string}>{
 const existing=await getPool().query('SELECT id FROM cc_documents WHERE organization_id=$1 AND file_id=$2 AND class_state=ANY($3) ORDER BY created_at LIMIT 1',[org(),fileId,estadosVisibles]);
 if(existing.rowCount)return {id:existing.rows[0].id};
 let input=emptyInput('invoice'),warnings:string[]=[],readError:string|undefined,meta:ClassMeta={classState:'DUDOSO',origin:'escaneo',classBy:'manual',reason:'Sin lectura automática: indica el tipo y los datos.'};
 if(opts.read){try{const x=await readFile(fileId),d=decidirEstado(x,await umbrales());input=fromClasificacion(x,d.kind);warnings=readWarnings(x,d);meta=uploadMeta(x,d);}catch(e){readError=e instanceof ReadError?e.message:'No se completó la lectura.';warnings=['Sin lectura automática: '+readError];}}
 else warnings=['Pendiente de lectura con IA.'];
 const id=randomUUID();
 await tx(async c=>{await insertDocument(c,id,fileId,input,warnings,meta);await audit('draft',`Nuevo borrador de ${kindLabel[input.kind].toLowerCase()} ${input.number||'sin número'}${input.supplier?' de '+input.supplier:''}.`,id,c);});
 return {id,readError};}

/** Vuelve a leer con IA el archivo de un borrador subido a mano y rellena el borrador (sin borrarlo). */
export async function rereadDraft(id:string){const r=await getPool().query('SELECT file_id,status,origin,class_state FROM cc_documents WHERE id=$1 AND organization_id=$2',[id,org()]);if(!r.rowCount)throw new AppError('Documento no encontrado.',404);
 const {file_id,status,origin,class_state}=r.rows[0];if(!file_id)throw new AppError('Este documento no tiene archivo.',400);if(status!=='draft'||class_state==='DESCARTADO')throw new AppError('Solo se puede releer un borrador.',409);
 if(origin==='correo')throw new AppError('Los documentos del correo se releen con el clasificador.',400);
 await getPool().query("UPDATE cc_files SET read_state='pending' WHERE id=$1 AND organization_id=$2 AND read_state='error'",[file_id,org()]);
 let x:Clasificacion;try{x=await readFile(file_id);}catch(e){throw new AppError(e instanceof ReadError?e.message:'No se completó la lectura.',e instanceof ReadError?e.status:502);}
 const d=decidirEstado(x,await umbrales());await tx(c=>fillDocument(c,id,fromClasificacion(x,d.kind),readWarnings(x,d),uploadMeta(x,d)));}

export async function insertDocument(c:PoolClient,id:string,fileId:string|null,d:DocumentInput,warnings:string[],m:ClassMeta){
 await c.query("INSERT INTO cc_documents(id,organization_id,file_id,kind,supplier,supplier_tax_id,number,doc_date,delivery_refs,subtotal,tax,total,warnings,origin,class_state,class_by,class_confidence,class_reason,detected_type,missing_fields,prompt_version,class_model,class_data,classified_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,CASE WHEN $15::text='PENDIENTE_CLASIFICACION' THEN NULL ELSE now() END)",[id,org(),fileId,d.kind,d.supplier,d.supplierTaxId,d.number,d.date,d.deliveryRefs,d.subtotal,d.tax,d.total,warnings.map(w=>w.slice(0,500)).slice(0,30),m.origin,...classParams(m)]);
 await insertLines(c,id,d.lines);}
/** Rellena un documento existente con una lectura nueva (datos, líneas y clasificación). Nunca borra el documento. */
export async function fillDocument(c:PoolClient,id:string,d:DocumentInput,warnings:string[],m:ClassMeta,extra:{status?:'draft'|'confirmed';duplicateOf?:string|null}={}){
 const status=extra.status||'draft';
 await c.query("UPDATE cc_documents SET kind=$3,supplier=$4,supplier_tax_id=$5,number=$6,doc_date=$7,delivery_refs=$8,subtotal=$9,tax=$10,total=$11,warnings=$12,class_state=$13,class_by=$14,class_confidence=$15,class_reason=$16,detected_type=$17,missing_fields=$18,prompt_version=$19,class_model=$20,class_data=$21,classified_at=now(),class_attempts=class_attempts+1,status=$22,confirmed_at=CASE WHEN $22::text='confirmed' THEN now() ELSE NULL END,duplicate_of=$23,match_status=NULL,match_result=NULL,updated_at=now() WHERE id=$1 AND organization_id=$2",[id,org(),d.kind,d.supplier,d.supplierTaxId,d.number,d.date,d.deliveryRefs,d.subtotal,d.tax,d.total,warnings.map(w=>w.slice(0,500)).slice(0,30),...classParams(m),status,extra.duplicateOf||null]);
 await c.query('DELETE FROM cc_lines WHERE document_id=$1',[id]);await insertLines(c,id,d.lines);await logClassification(c,id,m);}
async function insertLines(c:PoolClient,id:string,lines:DocumentInput['lines']){for(const [i,l] of lines.entries())await c.query('INSERT INTO cc_lines(id,document_id,position,code,description,quantity,unit,unit_price,discount_pct,amount,delivery_ref) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[randomUUID(),id,i+1,l.code,l.description,l.quantity,l.unit,l.unitPrice,l.discountPct,l.amount,l.deliveryRef]);}

/** Documento sin archivo, introducido a mano: la persona elige el tipo. */
export async function createManual(kind:DocumentInput['kind']){const id=randomUUID();await tx(c=>insertDocument(c,id,null,emptyInput(kind),[],{classState:estadoDe(kind),origin:'manual',classBy:'manual'}));return id;}

// ---------- Lectura ----------
const num=(v:unknown)=>v===null||v===undefined?null:String(v);
const iso=(v:unknown)=>v?String(v).slice(0,10):null;
function rowToDoc(r:Record<string,unknown>,lines:Record<string,unknown>[]):Doc{return {id:r.id as string,kind:r.kind as Doc['kind'],supplier:r.supplier as string,supplierTaxId:r.supplier_tax_id as string,number:r.number as string,date:iso(r.doc_date),deliveryRefs:r.delivery_refs as string[],subtotal:num(r.subtotal),tax:num(r.tax),total:num(r.total),
 lines:lines.map(l=>({id:l.id as string,position:l.position as number,code:l.code as string,description:l.description as string,quantity:num(l.quantity),unit:l.unit as string,unitPrice:num(l.unit_price),discountPct:num(l.discount_pct),amount:num(l.amount),deliveryRef:l.delivery_ref as string}))};}

export async function listDocuments(){const r=await getPool().query(`SELECT d.id,d.kind,d.status,d.supplier,d.number,d.doc_date,d.total,d.match_status,d.match_result,d.delivery_refs,d.drive_file_id,d.drive_error,d.created_at,d.updated_at,cardinality(d.warnings) AS warnings,d.class_state,d.class_by,d.class_reason,d.detected_type,d.missing_fields,d.class_confidence,d.origin,d.duplicate_of,d.template_used,f.source,f.filename,f.sender,f.received_at,(SELECT count(*) FROM cc_lines l WHERE l.document_id=d.id)::int AS lines
 FROM cc_documents d LEFT JOIN cc_files f ON f.id=d.file_id WHERE d.organization_id=$1 AND d.class_state=ANY($2) ORDER BY coalesce(d.doc_date,d.created_at::date) DESC,d.created_at DESC LIMIT 2000`,[org(),estadosVisibles]);
 return r.rows.map(x=>({id:x.id,kind:x.kind,status:x.status,supplier:x.supplier,number:x.number,date:iso(x.doc_date),total:num(x.total),matchStatus:x.match_status,deliveryRefs:x.delivery_refs,drive:Boolean(x.drive_file_id),driveError:x.drive_error,warnings:x.warnings,source:x.source||'manual',filename:x.filename,lines:x.lines,createdAt:x.created_at,classState:x.class_state,classBy:x.class_by,classReason:x.class_reason,detectedType:x.detected_type,missingFields:x.missing_fields,confidence:x.class_confidence===null?null:Number(x.class_confidence),origin:x.origin,duplicateOf:x.duplicate_of,templateUsed:Boolean(x.template_used),sender:x.sender,receivedAt:x.received_at,
  issues:x.kind==='invoice'&&x.match_result?(x.match_result as InvoiceMatch).discrepancies.filter(d=>!d.accepted&&d.severity!=='info').map(d=>({key:d.key,kind:d.kind,severity:d.severity,message:d.message})):[],
  ready:Boolean(x.kind==='invoice'&&x.status==='confirmed'&&(x.match_result as InvoiceMatch|null)?.ready),deliveryNoteIds:x.kind==='invoice'&&x.match_result?(x.match_result as InvoiceMatch).deliveryNoteIds:[],
  pendingLines:x.kind==='delivery_note'&&x.match_result?(x.match_result as DeliveryState).pending.length:0}));}

export async function getDocument(id:string){const pool=getPool();const r=await pool.query('SELECT d.*,f.filename,f.mime,f.source,f.sender,f.subject,f.received_at,f.read_state FROM cc_documents d LEFT JOIN cc_files f ON f.id=d.file_id WHERE d.id=$1 AND d.organization_id=$2 AND d.class_state=ANY($3)',[id,org(),estadosVisibles]);if(!r.rowCount)throw new AppError('Documento no encontrado.',404);const row=r.rows[0];
 const lines=(await pool.query('SELECT * FROM cc_lines WHERE document_id=$1 ORDER BY position',[id])).rows;const doc=rowToDoc(row,lines);
 // Documentos relacionados por la conciliación (para mostrar número y enlace).
 const m=row.match_result as InvoiceMatch|DeliveryState|null;const relatedIds=m?('deliveryNoteIds' in m?m.deliveryNoteIds:m.invoiceIds):[];
 const related=relatedIds.length?(await pool.query('SELECT d.id,d.kind,d.number,d.doc_date,d.match_status,(SELECT json_agg(json_build_object(\'id\',l.id,\'code\',l.code,\'description\',l.description,\'quantity\',l.quantity::text,\'unit\',l.unit,\'unitPrice\',l.unit_price::text,\'discountPct\',l.discount_pct::text) ORDER BY l.position) FROM cc_lines l WHERE l.document_id=d.id) AS lines FROM cc_documents d WHERE d.organization_id=$1 AND d.id=ANY($2)',[org(),relatedIds])).rows.map(x=>({id:x.id,kind:x.kind,number:x.number,date:iso(x.doc_date),matchStatus:x.match_status,lines:x.lines||[]})):[];
 return {...doc,status:row.status as 'draft'|'confirmed',warnings:row.warnings as string[],matchStatus:row.match_status as string|null,match:m,related,classState:row.class_state as Estado,classBy:row.class_by as string|null,classReason:row.class_reason as string,detectedType:row.detected_type as string,missingFields:row.missing_fields as string[],confidence:row.class_confidence===null?null:Number(row.class_confidence),origin:row.origin as Origin,duplicateOf:row.duplicate_of as string|null,templateUsed:Boolean(row.template_used),promptVersion:row.prompt_version as string|null,classModel:row.class_model as string|null,classifiedAt:row.classified_at,classData:row.class_data,driveFileId:row.drive_file_id as string|null,driveError:row.drive_error as string|null,
  file:row.file_id?{id:row.file_id as string,filename:row.filename as string,mime:row.mime as string,source:row.source as string,sender:row.sender as string|null,subject:row.subject as string|null,receivedAt:row.received_at,readState:row.read_state as string}:null,confirmedAt:row.confirmed_at,createdAt:row.created_at};}

// ---------- Escritura ----------
async function loadConfirmed(c:PoolClient){const docs=(await c.query("SELECT * FROM cc_documents WHERE organization_id=$1 AND status='confirmed' AND class_state IN ('FACTURA','ALBARAN')",[org()])).rows;const lines=(await c.query("SELECT l.* FROM cc_lines l JOIN cc_documents d ON d.id=l.document_id WHERE d.organization_id=$1 AND d.status='confirmed' AND d.class_state IN ('FACTURA','ALBARAN') ORDER BY l.position",[org()])).rows;
 const by=new Map<string,Record<string,unknown>[]>();for(const l of lines)(by.get(l.document_id)||by.set(l.document_id,[]).get(l.document_id)!).push(l);return docs.map(d=>rowToDoc(d,by.get(d.id)||[]));}

/** Recalcula la conciliación de todos los documentos confirmados. Idempotente; se llama tras cada cambio. */
export async function recompute(c:PoolClient){await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[org()+':reconcile']);
 const docs=await loadConfirmed(c);const decisions:Decisions=new Map();for(const d of (await c.query('SELECT invoice_id,key,reason,created_at FROM cc_decisions WHERE organization_id=$1',[org()])).rows)(decisions.get(d.invoice_id)||decisions.set(d.invoice_id,new Map()).get(d.invoice_id)!).set(d.key,{reason:d.reason,at:new Date(d.created_at).toISOString()});
 const r=reconcile(docs,decisions);
 await c.query("UPDATE cc_documents SET match_status=NULL,match_result=NULL WHERE organization_id=$1 AND (status='draft' OR kind='credit_note')",[org()]);
 for(const [id,m] of r.invoices)await c.query('UPDATE cc_documents SET match_status=$2,match_result=$3 WHERE id=$1 AND (match_status IS DISTINCT FROM $2 OR match_result IS DISTINCT FROM $3::jsonb)',[id,m.status,JSON.stringify(m)]);
 for(const [id,s] of r.deliveries)await c.query('UPDATE cc_documents SET match_status=$2,match_result=$3 WHERE id=$1 AND (match_status IS DISTINCT FROM $2 OR match_result IS DISTINCT FROM $3::jsonb)',[id,s.status,JSON.stringify(s)]);}

/** Documento ya confirmado del mismo tipo, proveedor (NIF o nombre) y número; null si no hay. */
export async function findDuplicate(c:PoolClient,id:string,input:Pick<DocumentInput,'kind'|'supplier'|'supplierTaxId'|'number'|'date'>){
 const others=await loadConfirmed(c);const me:Doc={id,kind:input.kind,supplier:input.supplier,supplierTaxId:input.supplierTaxId,number:input.number,date:input.date,deliveryRefs:[],subtotal:null,tax:null,total:null,lines:[]};
 for(const g of supplierGroups([...others.filter(o=>o.id!==id),me]).values())if(g.includes(me)){const dup=g.find(o=>o!==me&&o.kind===me.kind&&refMatches(o.number,me.number));if(dup)return dup;}
 return null;}

export async function saveDocument(id:string,input:DocumentInput,confirm:boolean){
 return tx(async c=>{const cur=await c.query('SELECT status,kind,number,class_state,class_by FROM cc_documents WHERE id=$1 AND organization_id=$2 FOR UPDATE',[id,org()]);if(!cur.rowCount)throw new AppError('Documento no encontrado.',404);
  const was=cur.rows[0] as {status:string;class_state:Estado;class_by:string|null};
  if(was.class_state==='PENDIENTE_CLASIFICACION')throw new AppError('Este documento todavía no se ha clasificado.',409);
  if(was.class_state==='DESCARTADO')throw new AppError('Este documento está descartado. Recupéralo primero como factura o como albarán.',409);
  const wasConfirmed=was.status==='confirmed',status=confirm||wasConfirmed?'confirmed':'draft';
  if(status==='confirmed'){const missing=[!input.supplier&&'proveedor',!input.number&&'número',!input.date&&'fecha'].filter(Boolean);if(missing.length)throw new AppError('Para confirmar falta: '+missing.join(', ')+'.',422);
   if(input.kind!=='credit_note'&&!input.lines.length)throw new AppError('Añade al menos una línea antes de confirmar.',422);
   // Duplicados: mismo tipo, mismo proveedor y mismo número.
   const dup=await findDuplicate(c,id,input);if(dup)throw new AppError(`Ya existe ${{invoice:'la factura',delivery_note:'el albarán',credit_note:'el abono'}[input.kind]} ${dup.number} de este proveedor. Si es la misma, descarta este documento.`,409);}
  // Confirmar es validar: un dudoso pasa a factura o albarán. Sin confirmar, un dudoso sigue dudoso aunque se edite.
  const classState:Estado=status==='confirmed'||was.class_state!=='DUDOSO'?estadoDe(input.kind):'DUDOSO',validated=confirm&&(!wasConfirmed||was.class_by==='ia'),byPerson=validated||classState!==was.class_state;
  await c.query("UPDATE cc_documents SET kind=$3,supplier=$4,supplier_tax_id=$5,number=$6,doc_date=$7,delivery_refs=$8,subtotal=$9,tax=$10,total=$11,status=$12,class_state=$13,class_by=CASE WHEN $14::boolean THEN 'persona' ELSE class_by END,duplicate_of=CASE WHEN $12::text='confirmed' THEN NULL ELSE duplicate_of END,updated_at=now(),confirmed_at=CASE WHEN $12::text='confirmed' THEN coalesce(confirmed_at,now()) ELSE NULL END WHERE id=$1 AND organization_id=$2",[id,org(),input.kind,input.supplier,input.supplierTaxId,input.number,input.date,input.kind==='invoice'?input.deliveryRefs:[],input.subtotal,input.tax,input.total,status,classState,byPerson]);
  await c.query('DELETE FROM cc_lines WHERE document_id=$1',[id]);await insertLines(c,id,input.lines);
  if(validated)await c.query("UPDATE cc_documents SET class_reason='Validado por un usuario.',missing_fields='{}' WHERE id=$1 AND organization_id=$2",[id,org()]);
  if(byPerson)await logClassification(c,id,{classState,classBy:'persona',reason:validated?'Validado por un usuario.':'Tipo cambiado por un usuario.'});
  // R5: lo que una persona valida o corrige alimenta la plantilla del proveedor.
  if(status==='confirmed')await learnTemplate(c,id);
  if(status==='confirmed')await recompute(c);
  await audit(confirm&&!wasConfirmed?'confirm':'edit',`${confirm&&!wasConfirmed?'Confirmado':'Editado'}: ${kindLabel[input.kind].toLowerCase()} ${input.number||'sin número'}${input.supplier?' de '+input.supplier:''}.`,id,c);
  return {status,newlyConfirmed:confirm&&!wasConfirmed};});}

/** Descartar es mover a «Descartados», nunca borrar (R3). El documento deja de contar para conciliar. */
export async function discardDocument(id:string,reason='Descartado por un usuario.'){await tx(async c=>{const r=await c.query('SELECT kind,number,supplier,status,class_state FROM cc_documents WHERE id=$1 AND organization_id=$2 FOR UPDATE',[id,org()]);if(!r.rowCount)throw new AppError('Documento no encontrado.',404);const d=r.rows[0];
 if(d.class_state==='PENDIENTE_CLASIFICACION')throw new AppError('Este documento todavía no se ha clasificado.',409);if(d.class_state==='DESCARTADO')return;
 await c.query("UPDATE cc_documents SET class_state='DESCARTADO',class_by='persona',class_reason=$3,status='draft',confirmed_at=NULL,match_status=NULL,match_result=NULL,updated_at=now() WHERE id=$1 AND organization_id=$2",[id,org(),reason.slice(0,500)]);
 await logClassification(c,id,{classState:'DESCARTADO',classBy:'persona',reason});
 if(d.status==='confirmed')await recompute(c);await audit('discard',`Descartado: ${kindLabel[d.kind as DocumentInput['kind']].toLowerCase()} ${d.number||'sin número'}${d.supplier?' de '+d.supplier:''}.`,id,c);});}

/** Recupera un descartado como factura o como albarán. Vuelve como borrador: lo confirma una persona. */
export async function recoverDocument(id:string,kind:'invoice'|'delivery_note'){await tx(async c=>{const r=await c.query('SELECT class_state,number,supplier FROM cc_documents WHERE id=$1 AND organization_id=$2 FOR UPDATE',[id,org()]);if(!r.rowCount)throw new AppError('Documento no encontrado.',404);
 if(r.rows[0].class_state!=='DESCARTADO')throw new AppError('Este documento no está descartado.',409);const what=`Recuperado como ${kindLabel[kind].toLowerCase()}`;
 await c.query("UPDATE cc_documents SET kind=$3,class_state=$4,class_by='persona',class_reason=$5,status='draft',duplicate_of=NULL,updated_at=now() WHERE id=$1 AND organization_id=$2",[id,org(),kind,estadoDe(kind),what+' por un usuario.']);
 await logClassification(c,id,{classState:estadoDe(kind),classBy:'persona',reason:what+' por un usuario.'});await audit('recover',`${what}: ${r.rows[0].number||'documento sin número'}${r.rows[0].supplier?' de '+r.rows[0].supplier:''}.`,id,c);});}

export async function decide(invoiceId:string,key:string,reason:string|null){await tx(async c=>{const r=await c.query("SELECT number,match_result FROM cc_documents WHERE id=$1 AND organization_id=$2 AND kind='invoice' AND status='confirmed'",[invoiceId,org()]);if(!r.rowCount)throw new AppError('Factura no encontrada.',404);
 const d=(r.rows[0].match_result as InvoiceMatch|null)?.discrepancies.find(x=>x.key===key);if(!d)throw new AppError('Esa diferencia ya no existe; recarga la factura.',409);
 if(reason){await c.query('INSERT INTO cc_decisions(organization_id,invoice_id,key,reason) VALUES($1,$2,$3,$4) ON CONFLICT(organization_id,invoice_id,key) DO UPDATE SET reason=EXCLUDED.reason,created_at=now()',[org(),invoiceId,key,reason]);await audit('accept',`Diferencia aceptada en la factura ${r.rows[0].number}: ${d.message} Motivo: ${reason}`,invoiceId,c);}
 else{await c.query('DELETE FROM cc_decisions WHERE organization_id=$1 AND invoice_id=$2 AND key=$3',[org(),invoiceId,key]);await audit('reopen',`Diferencia reabierta en la factura ${r.rows[0].number}: ${d.message}`,invoiceId,c);}
 await recompute(c);});}

export async function readOriginal(fileId:string){const r=await getPool().query('SELECT filename,mime,bytes FROM cc_files WHERE id=$1 AND organization_id=$2',[fileId,org()]);if(!r.rowCount)throw new AppError('Archivo no encontrado.',404);return r.rows[0] as {filename:string;mime:string;bytes:Buffer};}
export async function history(limit=150){return (await getPool().query('SELECT at,action,message,document_id FROM cc_audit WHERE organization_id=$1 ORDER BY at DESC LIMIT $2',[org(),limit])).rows;}

export async function pendingCount(){return (await getPool().query("SELECT count(*)::int AS n FROM cc_documents WHERE organization_id=$1 AND class_state='PENDIENTE_CLASIFICACION'",[org()])).rows[0].n as number;}
