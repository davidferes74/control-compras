import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import {getPool,org,tx,audit} from './server-store';
import {readFile,ReadError} from './ai-reader';
import {reconcile,supplierGroups,type Doc,type Decisions,type InvoiceMatch,type DeliveryState} from './matching';
import {refMatches} from './normalize';
import type {Extraction} from './extraction';

export class AppError extends Error{constructor(message:string,public status:number){super(message);}}
const dec=z.string().trim().regex(/^-?\d+(\.\d+)?$/,'Número no válido').nullable();
const str=(max:number)=>z.string().trim().max(max);
export const lineInput=z.object({code:str(100),description:str(500),quantity:dec,unit:str(30),unitPrice:dec,discountPct:dec,amount:dec,deliveryRef:str(100)});
export const documentInput=z.object({kind:z.enum(['invoice','delivery_note','credit_note']),supplier:str(300),supplierTaxId:str(30),number:str(100),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),deliveryRefs:z.array(str(100)).max(200),subtotal:dec,tax:dec,total:dec,lines:z.array(lineInput).max(300)});
export type DocumentInput=z.infer<typeof documentInput>;
export const kindLabel={invoice:'Factura',delivery_note:'Albarán',credit_note:'Abono'} as const;

// ---------- Archivos ----------
export async function storeFile(f:{bytes:Buffer;filename:string;mime:string;source:'upload'|'gmail';sourceRef?:string;sender?:string;subject?:string;receivedAt?:Date|null}){
 const digest=createHash('sha256').update(f.bytes).digest('hex'),id=randomUUID();
 const r=await getPool().query('INSERT INTO cc_files(id,organization_id,digest,filename,mime,bytes,source,source_ref,sender,subject,received_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(organization_id,digest) DO NOTHING RETURNING id',[id,org(),digest,f.filename.slice(0,200),f.mime,f.bytes,f.source,f.sourceRef||null,f.sender?.slice(0,300)||null,f.subject?.slice(0,300)||null,f.receivedAt||null]);
 if(r.rowCount)return {id,duplicate:false};
 const prior=await getPool().query('SELECT id FROM cc_files WHERE organization_id=$1 AND digest=$2',[org(),digest]);return {id:prior.rows[0].id as string,duplicate:true};}

const kindFrom=(t:Extraction['documentType'])=>t==='delivery_note'?'delivery_note':t==='credit_note'?'credit_note':'invoice';
function fromExtraction(x:Extraction):DocumentInput{const n=(v:string|null)=>v===null?null:v.trim();
 return {kind:kindFrom(x.documentType),supplier:x.supplier||'',supplierTaxId:x.supplierTaxId||'',number:x.number||'',date:x.date,deliveryRefs:x.documentType==='invoice'?x.deliveryRefs:[],subtotal:n(x.subtotal),tax:n(x.tax),total:n(x.total),
  lines:x.lines.map(l=>({code:l.code||'',description:l.description,quantity:n(l.quantity),unit:l.unit||'',unitPrice:n(l.unitPrice),discountPct:n(l.discountPct),amount:n(l.amount),deliveryRef:l.deliveryRef||''}))};}
const extractionWarnings=(x:Extraction)=>[...(x.documentType==='other'||x.documentType==='unknown'?[`La IA no reconoce este archivo como factura ni albarán${x.typeEvidence?' ('+x.typeEvidence+')':''}. Revísalo o descártalo.`]:[]),...x.warnings];

/** Crea (o devuelve) el borrador de un archivo. Si la IA no puede leerlo, el borrador queda vacío con el motivo. */
export async function draftFromFile(fileId:string,opts:{read:boolean}={read:true}):Promise<{id:string;readError?:string}>{
 const existing=await getPool().query('SELECT id FROM cc_documents WHERE organization_id=$1 AND file_id=$2 ORDER BY created_at LIMIT 1',[org(),fileId]);
 if(existing.rowCount)return {id:existing.rows[0].id};
 let input:DocumentInput={kind:'invoice',supplier:'',supplierTaxId:'',number:'',date:null,deliveryRefs:[],subtotal:null,tax:null,total:null,lines:[]},warnings:string[]=[],readError:string|undefined;
 if(opts.read){try{const x=await readFile(fileId);input=fromExtraction(x);warnings=extractionWarnings(x);}catch(e){readError=e instanceof ReadError?e.message:'No se completó la lectura.';warnings=['Sin lectura automática: '+readError];}}
 else warnings=['Pendiente de lectura con IA.'];
 const id=randomUUID();
 await tx(async c=>{await insertDocument(c,id,fileId,input,warnings);await audit('draft',`Nuevo borrador de ${kindLabel[input.kind].toLowerCase()} ${input.number||'sin número'}${input.supplier?' de '+input.supplier:''}.`,id,c);});
 return {id,readError};}

/** Vuelve a leer con IA el archivo de un borrador y rellena el borrador con el resultado. */
export async function rereadDraft(id:string){const r=await getPool().query('SELECT file_id,status FROM cc_documents WHERE id=$1 AND organization_id=$2',[id,org()]);if(!r.rowCount)throw new AppError('Documento no encontrado.',404);
 const {file_id,status}=r.rows[0];if(!file_id)throw new AppError('Este documento no tiene archivo.',400);if(status!=='draft')throw new AppError('Solo se puede releer un borrador.',409);
 await getPool().query("UPDATE cc_files SET read_state='pending' WHERE id=$1 AND organization_id=$2 AND read_state='error'",[file_id,org()]);
 let x:Extraction;try{x=await readFile(file_id);}catch(e){throw new AppError(e instanceof ReadError?e.message:'No se completó la lectura.',e instanceof ReadError?e.status:502);}
 await tx(async c=>{await c.query('DELETE FROM cc_lines WHERE document_id=$1',[id]);await c.query('DELETE FROM cc_documents WHERE id=$1',[id]);await insertDocument(c,id,file_id,fromExtraction(x),extractionWarnings(x));});}

async function insertDocument(c:PoolClient,id:string,fileId:string|null,d:DocumentInput,warnings:string[]){
 await c.query('INSERT INTO cc_documents(id,organization_id,file_id,kind,supplier,supplier_tax_id,number,doc_date,delivery_refs,subtotal,tax,total,warnings) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[id,org(),fileId,d.kind,d.supplier,d.supplierTaxId,d.number,d.date,d.deliveryRefs,d.subtotal,d.tax,d.total,warnings.map(w=>w.slice(0,500)).slice(0,30)]);
 await insertLines(c,id,d.lines);}
async function insertLines(c:PoolClient,id:string,lines:DocumentInput['lines']){for(const [i,l] of lines.entries())await c.query('INSERT INTO cc_lines(id,document_id,position,code,description,quantity,unit,unit_price,discount_pct,amount,delivery_ref) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[randomUUID(),id,i+1,l.code,l.description,l.quantity,l.unit,l.unitPrice,l.discountPct,l.amount,l.deliveryRef]);}

export async function createManual(kind:DocumentInput['kind']){const id=randomUUID();await tx(c=>insertDocument(c,id,null,{kind,supplier:'',supplierTaxId:'',number:'',date:null,deliveryRefs:[],subtotal:null,tax:null,total:null,lines:[]},[]));return id;}

// ---------- Lectura ----------
const num=(v:unknown)=>v===null||v===undefined?null:String(v);
const iso=(v:unknown)=>v?String(v).slice(0,10):null;
function rowToDoc(r:Record<string,unknown>,lines:Record<string,unknown>[]):Doc{return {id:r.id as string,kind:r.kind as Doc['kind'],supplier:r.supplier as string,supplierTaxId:r.supplier_tax_id as string,number:r.number as string,date:iso(r.doc_date),deliveryRefs:r.delivery_refs as string[],subtotal:num(r.subtotal),tax:num(r.tax),total:num(r.total),
 lines:lines.map(l=>({id:l.id as string,position:l.position as number,code:l.code as string,description:l.description as string,quantity:num(l.quantity),unit:l.unit as string,unitPrice:num(l.unit_price),discountPct:num(l.discount_pct),amount:num(l.amount),deliveryRef:l.delivery_ref as string}))};}

export async function listDocuments(){const r=await getPool().query(`SELECT d.id,d.kind,d.status,d.supplier,d.number,d.doc_date,d.total,d.match_status,d.match_result,d.delivery_refs,d.drive_file_id,d.drive_error,d.created_at,d.updated_at,cardinality(d.warnings) AS warnings,f.source,f.filename,(SELECT count(*) FROM cc_lines l WHERE l.document_id=d.id)::int AS lines
 FROM cc_documents d LEFT JOIN cc_files f ON f.id=d.file_id WHERE d.organization_id=$1 ORDER BY coalesce(d.doc_date,d.created_at::date) DESC,d.created_at DESC LIMIT 2000`,[org()]);
 return r.rows.map(x=>({id:x.id,kind:x.kind,status:x.status,supplier:x.supplier,number:x.number,date:iso(x.doc_date),total:num(x.total),matchStatus:x.match_status,deliveryRefs:x.delivery_refs,drive:Boolean(x.drive_file_id),driveError:x.drive_error,warnings:x.warnings,source:x.source||'manual',filename:x.filename,lines:x.lines,createdAt:x.created_at,
  issues:x.kind==='invoice'&&x.match_result?(x.match_result as InvoiceMatch).discrepancies.filter(d=>!d.accepted&&d.severity!=='info').map(d=>({kind:d.kind,severity:d.severity,message:d.message})):[],
  pendingLines:x.kind==='delivery_note'&&x.match_result?(x.match_result as DeliveryState).pending.length:0}));}

export async function getDocument(id:string){const pool=getPool();const r=await pool.query('SELECT d.*,f.filename,f.mime,f.source,f.sender,f.subject,f.received_at,f.read_state FROM cc_documents d LEFT JOIN cc_files f ON f.id=d.file_id WHERE d.id=$1 AND d.organization_id=$2',[id,org()]);if(!r.rowCount)throw new AppError('Documento no encontrado.',404);const row=r.rows[0];
 const lines=(await pool.query('SELECT * FROM cc_lines WHERE document_id=$1 ORDER BY position',[id])).rows;const doc=rowToDoc(row,lines);
 // Documentos relacionados por la conciliación (para mostrar número y enlace).
 const m=row.match_result as InvoiceMatch|DeliveryState|null;const relatedIds=m?('deliveryNoteIds' in m?m.deliveryNoteIds:m.invoiceIds):[];
 const related=relatedIds.length?(await pool.query('SELECT d.id,d.kind,d.number,d.doc_date,d.match_status,(SELECT json_agg(json_build_object(\'id\',l.id,\'code\',l.code,\'description\',l.description,\'quantity\',l.quantity::text,\'unit\',l.unit,\'unitPrice\',l.unit_price::text,\'discountPct\',l.discount_pct::text) ORDER BY l.position) FROM cc_lines l WHERE l.document_id=d.id) AS lines FROM cc_documents d WHERE d.organization_id=$1 AND d.id=ANY($2)',[org(),relatedIds])).rows.map(x=>({id:x.id,kind:x.kind,number:x.number,date:iso(x.doc_date),matchStatus:x.match_status,lines:x.lines||[]})):[];
 return {...doc,status:row.status as 'draft'|'confirmed',warnings:row.warnings as string[],matchStatus:row.match_status as string|null,match:m,related,driveFileId:row.drive_file_id as string|null,driveError:row.drive_error as string|null,
  file:row.file_id?{id:row.file_id as string,filename:row.filename as string,mime:row.mime as string,source:row.source as string,sender:row.sender as string|null,subject:row.subject as string|null,receivedAt:row.received_at,readState:row.read_state as string}:null,confirmedAt:row.confirmed_at,createdAt:row.created_at};}

// ---------- Escritura ----------
async function loadConfirmed(c:PoolClient){const docs=(await c.query("SELECT * FROM cc_documents WHERE organization_id=$1 AND status='confirmed'",[org()])).rows;const lines=(await c.query("SELECT l.* FROM cc_lines l JOIN cc_documents d ON d.id=l.document_id WHERE d.organization_id=$1 AND d.status='confirmed' ORDER BY l.position",[org()])).rows;
 const by=new Map<string,Record<string,unknown>[]>();for(const l of lines)(by.get(l.document_id)||by.set(l.document_id,[]).get(l.document_id)!).push(l);return docs.map(d=>rowToDoc(d,by.get(d.id)||[]));}

/** Recalcula la conciliación de todos los documentos confirmados. Idempotente; se llama tras cada cambio. */
export async function recompute(c:PoolClient){await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[org()+':reconcile']);
 const docs=await loadConfirmed(c);const decisions:Decisions=new Map();for(const d of (await c.query('SELECT invoice_id,key,reason,created_at FROM cc_decisions WHERE organization_id=$1',[org()])).rows)(decisions.get(d.invoice_id)||decisions.set(d.invoice_id,new Map()).get(d.invoice_id)!).set(d.key,{reason:d.reason,at:new Date(d.created_at).toISOString()});
 const r=reconcile(docs,decisions);
 await c.query("UPDATE cc_documents SET match_status=NULL,match_result=NULL WHERE organization_id=$1 AND (status='draft' OR kind='credit_note')",[org()]);
 for(const [id,m] of r.invoices)await c.query('UPDATE cc_documents SET match_status=$2,match_result=$3 WHERE id=$1 AND (match_status IS DISTINCT FROM $2 OR match_result IS DISTINCT FROM $3::jsonb)',[id,m.status,JSON.stringify(m)]);
 for(const [id,s] of r.deliveries)await c.query('UPDATE cc_documents SET match_status=$2,match_result=$3 WHERE id=$1 AND (match_status IS DISTINCT FROM $2 OR match_result IS DISTINCT FROM $3::jsonb)',[id,s.status,JSON.stringify(s)]);}

export async function saveDocument(id:string,input:DocumentInput,confirm:boolean){
 return tx(async c=>{const cur=await c.query('SELECT status,kind,number FROM cc_documents WHERE id=$1 AND organization_id=$2 FOR UPDATE',[id,org()]);if(!cur.rowCount)throw new AppError('Documento no encontrado.',404);
  const wasConfirmed=cur.rows[0].status==='confirmed',status=confirm||wasConfirmed?'confirmed':'draft';
  if(status==='confirmed'){const missing=[!input.supplier&&'proveedor',!input.number&&'número',!input.date&&'fecha'].filter(Boolean);if(missing.length)throw new AppError('Para confirmar falta: '+missing.join(', ')+'.',422);
   if(input.kind!=='credit_note'&&!input.lines.length)throw new AppError('Añade al menos una línea antes de confirmar.',422);
   // Duplicados: mismo tipo, mismo proveedor y mismo número.
   const others=await loadConfirmed(c);const me:Doc={id,kind:input.kind,supplier:input.supplier,supplierTaxId:input.supplierTaxId,number:input.number,date:input.date,deliveryRefs:[],subtotal:null,tax:null,total:null,lines:[]};
   for(const g of supplierGroups([...others.filter(o=>o.id!==id),me]).values())if(g.includes(me)){const dup=g.find(o=>o!==me&&o.kind===me.kind&&refMatches(o.number,me.number));if(dup)throw new AppError(`Ya existe ${{invoice:'la factura',delivery_note:'el albarán',credit_note:'el abono'}[me.kind]} ${dup.number} de este proveedor. Si es la misma, descarta este borrador.`,409);}}
  await c.query('UPDATE cc_documents SET kind=$3,supplier=$4,supplier_tax_id=$5,number=$6,doc_date=$7,delivery_refs=$8,subtotal=$9,tax=$10,total=$11,status=$12,updated_at=now(),confirmed_at=CASE WHEN $12=\'confirmed\' THEN coalesce(confirmed_at,now()) ELSE NULL END WHERE id=$1 AND organization_id=$2',[id,org(),input.kind,input.supplier,input.supplierTaxId,input.number,input.date,input.kind==='invoice'?input.deliveryRefs:[],input.subtotal,input.tax,input.total,status]);
  await c.query('DELETE FROM cc_lines WHERE document_id=$1',[id]);await insertLines(c,id,input.lines);
  if(status==='confirmed')await recompute(c);
  await audit(confirm&&!wasConfirmed?'confirm':'edit',`${confirm&&!wasConfirmed?'Confirmado':'Editado'}: ${kindLabel[input.kind].toLowerCase()} ${input.number||'sin número'}${input.supplier?' de '+input.supplier:''}.`,id,c);
  return {status,newlyConfirmed:confirm&&!wasConfirmed};});}

export async function deleteDocument(id:string){await tx(async c=>{const r=await c.query('DELETE FROM cc_documents WHERE id=$1 AND organization_id=$2 RETURNING kind,number,supplier,status',[id,org()]);if(!r.rowCount)throw new AppError('Documento no encontrado.',404);const d=r.rows[0];
 if(d.status==='confirmed')await recompute(c);await audit('delete',`Eliminado: ${kindLabel[d.kind as DocumentInput['kind']].toLowerCase()} ${d.number||'sin número'}${d.supplier?' de '+d.supplier:''}.`,null,c);});}

export async function decide(invoiceId:string,key:string,reason:string|null){await tx(async c=>{const r=await c.query("SELECT number,match_result FROM cc_documents WHERE id=$1 AND organization_id=$2 AND kind='invoice' AND status='confirmed'",[invoiceId,org()]);if(!r.rowCount)throw new AppError('Factura no encontrada.',404);
 const d=(r.rows[0].match_result as InvoiceMatch|null)?.discrepancies.find(x=>x.key===key);if(!d)throw new AppError('Esa diferencia ya no existe; recarga la factura.',409);
 if(reason){await c.query('INSERT INTO cc_decisions(organization_id,invoice_id,key,reason) VALUES($1,$2,$3,$4) ON CONFLICT(organization_id,invoice_id,key) DO UPDATE SET reason=EXCLUDED.reason,created_at=now()',[org(),invoiceId,key,reason]);await audit('accept',`Diferencia aceptada en la factura ${r.rows[0].number}: ${d.message} Motivo: ${reason}`,invoiceId,c);}
 else{await c.query('DELETE FROM cc_decisions WHERE organization_id=$1 AND invoice_id=$2 AND key=$3',[org(),invoiceId,key]);await audit('reopen',`Diferencia reabierta en la factura ${r.rows[0].number}: ${d.message}`,invoiceId,c);}
 await recompute(c);});}

export async function readOriginal(fileId:string){const r=await getPool().query('SELECT filename,mime,bytes FROM cc_files WHERE id=$1 AND organization_id=$2',[fileId,org()]);if(!r.rowCount)throw new AppError('Archivo no encontrado.',404);return r.rows[0] as {filename:string;mime:string;bytes:Buffer};}
export async function history(limit=150){return (await getPool().query('SELECT at,action,message,document_id FROM cc_audit WHERE organization_id=$1 ORDER BY at DESC LIMIT $2',[org(),limit])).rows;}

/** Lee con IA los borradores que aún no se han leído (capturados de Gmail), mientras quede tiempo y presupuesto. */
export async function readPending(until:number){const r=await getPool().query("SELECT d.id FROM cc_documents d JOIN cc_files f ON f.id=d.file_id WHERE d.organization_id=$1 AND d.status='draft' AND f.read_state='pending' ORDER BY d.created_at LIMIT 20",[org()]);let read=0,errors=0;
 for(const x of r.rows){if(Date.now()>until)break;try{await rereadDraft(x.id);read++;}catch(e){errors++;if(e instanceof AppError&&e.status===429)break;}}return {read,errors,pending:(r.rowCount||0)-read};}
