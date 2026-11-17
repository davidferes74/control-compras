import {productInputSchema,productErrors} from './products';
import {syncedProductSchema,mergeOdooProducts,maxOdooProducts} from './odoo-products';
import Decimal from 'decimal.js';
import {z} from 'zod';
import {parseScan} from './scanner';
import type {Workspace,Profile,Allocation,Invoice,Receipt,Line,AgentAuthority} from './types';
const text=z.string().trim().min(1).max(160), id=z.string().min(1).max(100);
const qty=z.string().regex(/^\d{1,9}(\.\d{1,3})?$/).refine(v=>new Decimal(v).gt(0),'La cantidad debe ser positiva.');
const profileSchema=z.object({id,name:text,version:z.number().int().positive(),prefix:z.string().max(30),suffix:z.string().max(30),terminator:z.enum(['Enter','Tab']),parser:z.enum(['plain','gs1','delimited']),delimiter:z.string().max(4),codePosition:z.number().int().min(0).max(10),lotPosition:z.number().int().min(-1).max(10),serialPosition:z.number().int().min(-1).max(10),quantity:qty,state:z.enum(['draft','validated'])});
export const commandSchema=z.discriminatedUnion('type',[
 productInputSchema.extend({type:z.literal('createProduct')}),
 z.object({type:z.literal('importProducts'),products:z.array(productInputSchema).min(1).max(1000)}),
 z.object({type:z.literal('syncProducts'),products:z.array(syncedProductSchema).min(1).max(maxOdooProducts)}),
 z.object({type:z.literal('scan'),receiptId:id,raw:z.string().min(1).max(512),profileId:id,lot:z.string().max(40).optional(),serial:z.string().max(40).optional(),allowExcess:z.boolean().optional(),reason:z.string().max(400).optional(),evidenceId:z.string().uuid().optional()}),
 z.object({type:z.literal('undo'),receiptId:id}),
 z.object({type:z.literal('confirm'),receiptId:id,reason:z.string().max(400).optional(),shortage:z.enum(['pending','missing']).optional()}),
 z.object({type:z.literal('tracking'),enabled:z.boolean()}),
 z.object({type:z.literal('profile'),profile:profileSchema}),
 z.object({type:z.literal('testProfile'),profileId:id,raw:z.string().min(1).max(512),expected:text}),
 z.object({type:z.literal('activateProfile'),profileId:id,device:text}),
 z.object({type:z.literal('createReceipt'),supplier:text,reference:text,date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),lines:z.array(z.object({productId:id,expected:qty,lot:z.string().max(40).optional(),price:z.string().regex(/^\d{1,9}(\.\d{1,4})?$/).optional(),orderLineIds:z.array(z.number().int().positive()).max(50).optional()})).min(1).max(100),fileIds:z.array(id).max(20).default([]),order:z.object({id:z.number().int().positive(),name:text}).optional()}),
 z.object({type:z.literal('createInvoice'),auto:z.boolean().optional(),supplier:text,reference:text,date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),receiptRefs:z.array(text).max(100),fileIds:z.array(id).max(20).optional(),lines:z.array(z.object({productId:id,quantity:qty,price:z.string().regex(/^\d{1,9}(\.\d{1,4})?$/).optional()})).min(1).max(100)}),
 z.object({type:z.literal('acceptMatch'),invoiceId:id}),
 z.object({type:z.literal('setInvoiceRefs'),invoiceId:id,receiptRefs:z.array(text).max(100)}),
 z.object({type:z.literal('validate'),kind:z.enum(['receipt','invoice']),id,note:z.string().trim().max(400).optional()}),
 z.object({type:z.literal('unvalidate'),kind:z.enum(['receipt','invoice']),id}),
 z.object({type:z.literal('agentAuthority'),authority:z.object({validateReceipts:z.boolean(),acceptProposals:z.boolean(),validateInvoices:z.boolean(),allowUnverifiedPrice:z.boolean(),readMail:z.boolean().default(false),registerInvoices:z.boolean().default(false)})}),
 z.object({type:z.literal('issue'),receiptId:id,message:text}),
 z.object({type:z.literal('resolveIssue'),issueId:id,resolution:text})
]);
export type Command=z.infer<typeof commandSchema>;
export type Envelope={id:string;version:number;command:Command};
export const envelopeSchema=z.object({id:z.string().uuid(),version:z.number().int().nonnegative(),command:commandSchema});
export class DomainError extends Error{constructor(message:string,public code=422){super(message);}}
// parseScan lanza Error genérico; se convierte en DomainError para que la API devuelva 422 con el motivo real.
function readScan(raw:string,p:Profile){try{return parseScan(raw,p);}catch(e){throw new DomainError(e instanceof Error?e.message:'Lectura no válida.');}}
export const sum=(xs:string[])=>xs.reduce((a,v)=>a.plus(v),new Decimal(0)).toString();
// Cantidad que respalda facturas: en una recepción parcial solo lo confirmado por el operario, no lo leído después.
export const confirmedQuantity=(r:Receipt,l:Line)=>r.status==='partial'?(l.confirmed||'0'):r.status==='open'?'0':l.received;
// Lotes observados por línea, sin fusionar. «verifiable» es falso cuando el albarán no declara lote: se registra lo visto, pero no se puede contrastar.
export function lotBreakdown(state:Workspace,receiptId:string){const r=state.receipts.find(x=>x.id===receiptId);if(!r)return [];const rows=new Map<string,{lineId:string;productId:string;lot:string;quantity:Decimal;verifiable:boolean;matches:boolean;evidenceIds:string[]}>();
 for(const sc of state.scans){if(sc.receiptId!==receiptId||sc.reversed||!sc.lot)continue;const line=r.lines.find(l=>l.id===sc.lineId);if(!line)continue;const key=line.id+'|'+sc.lot;const row=rows.get(key)||{lineId:line.id,productId:line.productId,lot:sc.lot,quantity:new Decimal(0),verifiable:Boolean(line.lot),matches:line.lot===sc.lot,evidenceIds:[]};row.quantity=row.quantity.plus(sc.quantity);if(sc.evidenceId&&!row.evidenceIds.includes(sc.evidenceId))row.evidenceIds.push(sc.evidenceId);rows.set(key,row);}
 return [...rows.values()].map(x=>({...x,quantity:x.quantity.toString()}));}
// Emparejamiento factura ↔ recepciones, en dos pasadas y siempre por líneas y cantidades:
//  1) Facturas que citan albaranes: solo contra esos albaranes del mismo proveedor (base «referencia»).
//  2) Facturas que no citan ninguno: PROPUESTA por productos recibidos de ese proveedor y aún no facturados,
//     de la entrega más antigua a la más reciente y nunca posteriores a la fecha de la factura (base «producto»).
// Las referencias explícitas van primero para que una propuesta no les quite cantidades. Una propuesta no respalda
// la factura hasta que una persona la acepta (acceptMatch la convierte en referencias explícitas).
export function reconcile(state:Workspace):Allocation[]{
 const used=new Map<string,Decimal>();const allocations:Allocation[]=[];
 const take=(invoice:Invoice,line:Invoice['lines'][number],receipt:Receipt,remaining:Decimal,basis?:'product')=>{
  for(const rl of receipt.lines.filter(l=>l.productId===line.productId)){
   const key=receipt.id+':'+rl.id;const available=Decimal.max(0,new Decimal(confirmedQuantity(receipt,rl)).minus(used.get(key)||0));const q=Decimal.min(available,remaining);
   if(q.gt(0)){allocations.push({invoiceId:invoice.id,invoiceLineId:line.id,receiptId:receipt.id,lineId:rl.id,quantity:q.toString(),...(basis?{basis}:{})});used.set(key,(used.get(key)||new Decimal(0)).plus(q));remaining=remaining.minus(q);}
  }return remaining;};
 // El orden estable de las facturas evita que un documento nuevo quite asignaciones a uno anterior.
 for(const invoice of state.invoices){if(!invoice.receiptRefs.length)continue;for(const line of invoice.lines){let remaining=new Decimal(line.quantity);
  for(const ref of new Set(invoice.receiptRefs)){const matches=state.receipts.filter(r=>r.reference===ref&&r.supplier===invoice.supplier&&r.status!=='open');
   if(matches.length!==1)continue;remaining=take(invoice,line,matches[0],remaining);}
 }}
 for(const invoice of state.invoices){if(invoice.receiptRefs.length)continue;
  const candidates=state.receipts.filter(r=>r.supplier===invoice.supplier&&r.status!=='open'&&r.date<=invoice.date).sort((a,b)=>a.date.localeCompare(b.date)||a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
  for(const line of invoice.lines){let remaining=new Decimal(line.quantity);for(const receipt of candidates){if(remaining.lte(0))break;remaining=take(invoice,line,receipt,remaining,'product');}}
 }
 return allocations;
}
/** Cantidades de una factura: «matched» es lo respaldado por albaranes citados; «proposed», lo propuesto por productos y aún sin aceptar. */
export function invoiceSummary(s:Workspace,invoice:Invoice){const mine=s.allocations.filter(a=>a.invoiceId===invoice.id),total=sum(invoice.lines.map(l=>l.quantity)),matched=sum(mine.filter(a=>a.basis!=='product').map(a=>a.quantity)),proposed=sum(mine.filter(a=>a.basis==='product').map(a=>a.quantity));
 return {total,matched,proposed,pending:new Decimal(total).minus(matched).toString(),complete:new Decimal(total).eq(matched),proposalComplete:new Decimal(proposed).gt(0)&&new Decimal(total).eq(proposed)};}
// Control económico: precio facturado frente al acordado (el del pedido de compra, guardado en la línea de recepción).
// Comparación exacta a 4 decimales. Sin precio en la factura o sin precio acordado, no se puede comprobar: nunca se da por bueno.
export type PriceLine={invoiceLineId:string;productId:string;invoiced:string|null;agreed:string[];status:'ok'|'discrepancy'|'unverifiable';checkedQuantity:string;impact:string};
export function priceCheck(s:Workspace,invoice:Invoice){
 const lines:PriceLine[]=invoice.lines.map(line=>{
  const allocations=s.allocations.filter(a=>a.invoiceId===invoice.id&&a.invoiceLineId===line.id);let impact=new Decimal(0),checked=new Decimal(0),unpriced=false,differs=false;const agreed=new Set<string>();
  for(const a of allocations){const price=s.receipts.find(r=>r.id===a.receiptId)?.lines.find(l=>l.id===a.lineId)?.price;if(!price||!line.price){unpriced=true;continue;}
   const p=new Decimal(price).toDecimalPlaces(4),mine=new Decimal(line.price).toDecimalPlaces(4);agreed.add(p.toString());checked=checked.plus(a.quantity);if(!p.eq(mine)){differs=true;impact=impact.plus(mine.minus(p).times(a.quantity));}}
  const full=new Decimal(line.quantity).eq(checked);
  return {invoiceLineId:line.id,productId:line.productId,invoiced:line.price||null,agreed:[...agreed],status:differs?'discrepancy':(full&&!unpriced?'ok':'unverifiable'),checkedQuantity:checked.toString(),impact:impact.toDecimalPlaces(2).toString()};});
 const status=lines.some(l=>l.status==='discrepancy')?'discrepancy' as const:lines.length>0&&lines.every(l=>l.status==='ok')?'ok' as const:'unverifiable' as const;
 return {status,lines,impact:lines.reduce((a,l)=>a.plus(l.impact),new Decimal(0)).toDecimalPlaces(2).toString()};
}
// ---------- Validación y autoridad del agente ----------
export const noAuthority:Required<AgentAuthority>={validateReceipts:false,acceptProposals:false,validateInvoices:false,allowUnverifiedPrice:false,readMail:false,registerInvoices:false};
/** Retrato de lo que se valida en una factura: albaranes, cantidades y resultado del precio. */
export function invoiceSignature(s:Workspace,f:Invoice){const sum=invoiceSummary(s,f),price=priceCheck(s,f);return [f.receiptRefs.join('|'),sum.total,sum.matched,price.status,price.impact].join(';');}
/** ¿Está todo conforme? Cantidades respaldadas del todo y precio igual al acordado (o no comprobable, si se admite). */
export function invoiceConforming(s:Workspace,f:Invoice,allowUnverifiedPrice=false){const sum=invoiceSummary(s,f),price=priceCheck(s,f).status;return sum.complete&&(price==='ok'||(allowUnverifiedPrice&&price==='unverifiable'));}
export const receiptClosed=(r:Receipt)=>r.status==='confirmed'||r.status==='exceptions';
export const receiptConforming=(s:Workspace,r:Receipt)=>r.status==='confirmed'&&!s.issues.some(i=>i.receiptId===r.id&&!i.resolved);
// Tras cada cambio: 1) una validación deja de valer si cambió lo que retrataba; 2) el agente hace lo que tenga autorizado.
// Son reglas exactas sobre datos ya calculados; cada acción queda en el histórico marcada como del agente.
function afterChange(s:Workspace,now:string,commandId:string){
 let n=0;const log=(action:string,message:string)=>s.audit.unshift({id:commandId+'-a'+(n++),at:now,action,message,by:'agent'});
 s.allocations=reconcile(s);
 for(const f of s.invoices)if(f.validation?.signature&&f.validation.signature!==invoiceSignature(s,f)){delete f.validation;s.audit.unshift({id:commandId+'-v'+(n++),at:now,action:'unvalidate',message:'Validación retirada · '+f.reference+': han cambiado sus datos'});}
 const a=s.agent;if(!a)return;
 for(let guard=0;guard<500;guard++){let changed=false;
  if(a.acceptProposals)for(const f of s.invoices){if(f.receiptRefs.length||!invoiceSummary(s,f).proposalComplete)continue;
   const refs=[...new Set(s.allocations.filter(x=>x.invoiceId===f.id&&x.basis==='product').map(x=>s.receipts.find(r=>r.id===x.receiptId)!.reference))];f.receiptRefs=refs;s.allocations=reconcile(s);log('acceptMatch','Agente · emparejamiento aceptado · '+f.reference+' con '+refs.join(', '));changed=true;break;}
  if(changed)continue;
  if(a.validateReceipts)for(const r of s.receipts)if(!r.validation&&!r.agentHold&&receiptConforming(s,r)){r.validation={at:now,by:'agent'};log('validate','Agente · recepción validada · '+r.reference);changed=true;}
  if(a.validateInvoices)for(const f of s.invoices)if(!f.validation&&!f.agentHold&&invoiceConforming(s,f,a.allowUnverifiedPrice)){f.validation={at:now,by:'agent',signature:invoiceSignature(s,f)};log('validate','Agente · factura validada · '+f.reference);changed=true;}
  if(!changed)break;}
}
export function applyCommand(original:Workspace,envelope:Envelope,now=new Date().toISOString()):Workspace{
 const {id:commandId,version,command:c}=envelopeSchema.parse(envelope);
 if(original.processed.includes(commandId))return original;
 if(version!==original.version)throw new DomainError('Hay cambios más recientes. Actualiza antes de continuar.',409);
 const s=structuredClone(original);
 const receipt=(rid:string)=>{const r=s.receipts.find(x=>x.id===rid);if(!r)throw new DomainError('Recepción no encontrada.',404);return r;};
 const openReceipt=(rid:string)=>{const r=receipt(rid);if(r.status!=='open'&&r.status!=='partial')throw new DomainError('Esta recepción ya está cerrada.',409);return r;};
 let message='',agentCommand=false;
 switch(c.type){
 case 'createProduct':{const errors=productErrors([c],s.products);if(errors.length)throw new DomainError(errors[0]);s.products.push({...c,id:commandId});message='Producto registrado · '+c.name;break;}
 case 'importProducts':{const errors=productErrors(c.products,s.products);if(errors.length)throw new DomainError(errors.slice(0,5).join(' '));s.products.push(...c.products.map((p,i)=>({...p,id:commandId+'-'+i})));message='Importación Excel · '+c.products.length+' productos creados';break;}
 case 'syncProducts':{const m=mergeOdooProducts(s.products,c.products);s.products=m.products;message=`Catálogo sincronizado con Odoo · ${m.created} nuevos, ${m.updated} actualizados, ${m.linked} enlazados, ${m.archived} archivados`+(m.conflicts?`, ${m.conflicts} en conflicto`:'');break;}
 case 'scan':{
  const r=openReceipt(c.receiptId),p=s.profiles.find(x=>x.id===c.profileId);if(!p)throw new DomainError('Selecciona un perfil de lector.');
  if(p.state!=='validated')throw new DomainError('Prueba y activa el perfil del lector antes de recibir.');
  const parsed=readScan(c.raw,p);const found=s.products.filter(x=>!x.archived&&(x.code===parsed.code||x.code.padStart(14,'0')===parsed.code||x.packCode===parsed.code));
  if(found.length!==1)throw new DomainError('Código desconocido o ambiguo. No se ha sumado mercancía.');
  const product=found[0],lines=r.lines.filter(l=>l.productId===product.id);
  if(!lines.length)throw new DomainError('Producto ausente del albarán. Revisión necesaria.');
  let lot=parsed.lot||c.lot?.trim()||undefined,serial=parsed.serial||c.serial?.trim()||undefined;
  // Varias líneas del mismo producto = varios lotes declarados: el lote leído decide la línea, nunca por aproximación.
  let line=lines[0];
  if(lines.length>1){if(!lot)throw new DomainError('Este producto llega en varios lotes. Escanea la etiqueta o indica el lote.');const match=lines.find(l=>l.lot===lot);if(!match)throw new DomainError('El lote '+lot+' no figura en el albarán para este producto. No se ha sumado; registra una incidencia si ha llegado.');line=match;}
  const quantity=product.packCode===parsed.code?(product.packQuantity||'0'):p.quantity;
  if(new Decimal(quantity).lte(0))throw new DomainError('Embalaje sin conversión configurada.');
  if(r.tracking&&product.tracking==='lot'&&!lot)throw new DomainError('Este producto requiere lote. Escanea la etiqueta o introdúcelo.');
  if(r.tracking&&line.lot&&lot!==line.lot)throw new DomainError('Lote distinto: esperado '+line.lot+'. No se ha sumado.');
  if(r.tracking&&product.tracking==='serial'){
   if(!serial)throw new DomainError('Este producto requiere número de serie.');if(!new Decimal(quantity).eq(1))throw new DomainError('Una serie solo puede identificar una unidad.');
   if(s.scans.some(x=>x.receiptId===r.id&&!x.reversed&&x.serial===serial&&r.lines.find(l=>l.id===x.lineId)?.productId===product.id))throw new DomainError('Número de serie ya recibido. No se suma de nuevo.');
  }
  const next=new Decimal(line.received).plus(quantity);
  if(next.gt(line.expected)&&(!c.allowExcess||!c.reason?.trim()))throw new DomainError('Se supera la cantidad esperada. Revisa la lectura o registra el exceso con motivo.');
  if(!r.tracking){lot=undefined;serial=undefined;}
  line.received=next.toString();s.scans.push({id:commandId,receiptId:r.id,lineId:line.id,raw:c.raw,quantity,lot,serial,profileId:p.id,profileVersion:p.version,reversed:false,at:now,...(c.evidenceId?{evidenceId:c.evidenceId}:{})});
  message=product.name+' · +'+quantity+' '+product.unit+(c.reason?' · '+c.reason:'');break;}
 case 'undo':{const r=openReceipt(c.receiptId);const scan=s.scans.findLast(x=>x.receiptId===r.id&&!x.reversed);if(!scan)throw new DomainError('No hay lecturas para deshacer.');if(scan.confirmed)throw new DomainError('Esa lectura ya está confirmada en una recepción parcial. Registra una incidencia para corregirla.');const l=r.lines.find(x=>x.id===scan.lineId)!;l.received=new Decimal(l.received).minus(scan.quantity).toString();scan.reversed=true;message='Última lectura deshecha · '+r.reference;break;}
 case 'confirm':{const r=openReceipt(c.receiptId);
  const short=r.lines.some(l=>new Decimal(l.received).lt(l.expected)),over=r.lines.some(l=>new Decimal(l.received).gt(l.expected)),openIssues=s.issues.some(i=>i.receiptId===r.id&&!i.resolved);
  const seal=()=>{for(const l of r.lines)l.confirmed=l.received;for(const x of s.scans)if(x.receiptId===r.id&&!x.reversed)x.confirmed=true;};
  if(c.shortage==='pending'){
   // Recepción parcial: se confirma lo llegado y el resto queda pendiente de una entrega posterior.
   if(!short)throw new DomainError('No quedan cantidades pendientes: confirma la recepción completa.');
   if(!r.lines.some(l=>new Decimal(l.received).gt(l.confirmed||'0')))throw new DomainError('No hay mercancía nueva que confirmar en esta recepción parcial.');
   seal();r.status='partial';r.partialAt=now;r.closeReason=c.reason?.trim()||undefined;message=r.reference+' · recepción parcial confirmada; resto pendiente de llegar';break;}
  const discrepancy=short||over||openIssues;if(discrepancy&&!c.reason?.trim())throw new DomainError('Indica el motivo para cerrar con diferencias.');
  seal();r.status=discrepancy?'exceptions':'confirmed';r.closedAt=now;r.closeReason=c.reason;message=r.reference+' · recepción '+(discrepancy?(short?'cerrada con faltantes o diferencias':'cerrada con diferencias'):'confirmada');break;}
 case 'tracking':s.tracking=c.enabled;message='Seguimiento de lotes y series '+(c.enabled?'activado':'desactivado')+' para nuevas recepciones';break;
 case 'profile':{const current=s.profiles.find(p=>p.id===c.profile.id);const p:Profile={...c.profile,version:current?current.version+1:1,state:'draft'};s.profiles=s.profiles.filter(x=>x.id!==p.id);s.profiles.push(p);message='Perfil guardado. Pendiente de prueba · '+p.name;break;}
 case 'testProfile':{const p=s.profiles.find(x=>x.id===c.profileId);if(!p)throw new DomainError('Perfil inexistente.');const parsed=readScan(c.raw,p);if(parsed.code!==c.expected)throw new DomainError('El código interpretado no coincide con el esperado.');p.testedVersion=p.version;p.testedCode=parsed.code;message='Prueba aislada correcta · '+p.name;break;}
 case 'activateProfile':{const p=s.profiles.find(x=>x.id===c.profileId);if(!p||p.testedVersion!==p.version)throw new DomainError('Realiza una prueba correcta de esta versión antes de activar.');p.state='validated';p.validatedDevice=c.device;message='Perfil validado por el usuario · '+p.name;break;}
 case 'createReceipt':{if(s.receipts.some(r=>r.supplier===c.supplier&&r.reference===c.reference))throw new DomainError('Ya existe este albarán para el proveedor.');if(c.lines.some(l=>!s.products.some(p=>p.id===l.productId)))throw new DomainError('Producto desconocido.');for(const pid of new Set(c.lines.map(l=>l.productId))){const same=c.lines.filter(l=>l.productId===pid);if(same.length<2)continue;const lots=same.map(l=>l.lot?.trim()||'');if(!s.tracking||s.products.find(p=>p.id===pid)?.tracking!=='lot'||lots.some(x=>!x)||new Set(lots).size!==lots.length)throw new DomainError('Para repetir un producto en el albarán, activa el seguimiento por lotes e indica un lote distinto en cada línea.');}s.receipts.unshift({id:commandId,supplier:c.supplier,reference:c.reference,date:c.date,status:'open',tracking:s.tracking,createdAt:now,fileIds:c.fileIds,...(c.order?{order:c.order}:{}),lines:c.lines.map((l,i)=>({...l,lot:l.lot?.trim()||undefined,id:commandId+'-'+i,received:'0'}))});message=(c.order?'Recepción abierta contra el pedido '+c.order.name+' · ':'Albarán registrado manualmente · ')+c.reference;break;}
 case 'createInvoice':if(s.invoices.some(f=>f.reference===c.reference&&f.supplier===c.supplier))throw new DomainError('Factura ya registrada.');if(c.lines.some(l=>!s.products.some(p=>p.id===l.productId)))throw new DomainError('Producto desconocido.');{const {auto,...data}=c;s.invoices.push({...data,id:commandId,lines:c.lines.map((l,i)=>({...l,id:commandId+'-'+i}))});agentCommand=Boolean(auto);message=(auto?'Agente · factura registrada desde el correo · ':'Factura registrada manualmente · ')+c.reference;break;}
 case 'acceptMatch':{const f=s.invoices.find(x=>x.id===c.invoiceId);if(!f)throw new DomainError('Factura no encontrada.',404);
  // Aceptar la propuesta la convierte en referencias explícitas: a partir de aquí la factura queda ligada a esos albaranes.
  const proposed=reconcile(s).filter(a=>a.invoiceId===f.id&&a.basis==='product');if(!proposed.length)throw new DomainError('No hay ninguna propuesta que aceptar para esta factura.');
  const refs=[...new Set(proposed.map(a=>s.receipts.find(r=>r.id===a.receiptId)!.reference))];f.receiptRefs=refs;message='Emparejamiento aceptado · '+f.reference+' con '+refs.join(', ');break;}
 case 'setInvoiceRefs':{const f=s.invoices.find(x=>x.id===c.invoiceId);if(!f)throw new DomainError('Factura no encontrada.',404);const refs=[...new Set(c.receiptRefs.map(r=>r.trim()).filter(Boolean))];f.receiptRefs=refs;message='Albaranes de '+f.reference+' · '+(refs.length?refs.join(', '):'ninguno indicado');break;}
 case 'validate':{
  if(c.kind==='receipt'){const r=receipt(c.id);if(!receiptClosed(r))throw new DomainError('Solo se valida una recepción ya confirmada o cerrada.',409);if(r.validation)throw new DomainError('Esta recepción ya está validada.',409);
   const exception=!receiptConforming(s,r);if(exception&&!c.note)throw new DomainError('Tiene diferencias o incidencias abiertas: indica el motivo para validarla.');
   r.validation={at:now,by:'human',...(c.note?{note:c.note}:{}),...(exception?{exception:true}:{})};delete r.agentHold;message='Recepción validada'+(exception?' con excepción':'')+' · '+r.reference;break;}
  const f=s.invoices.find(x=>x.id===c.id);if(!f)throw new DomainError('Factura no encontrada.',404);if(f.validation)throw new DomainError('Esta factura ya está validada.',409);
  s.allocations=reconcile(s);const exception=!invoiceConforming(s,f);if(exception&&!c.note)throw new DomainError('No está del todo conforme: indica el motivo para validarla.');
  f.validation={at:now,by:'human',signature:invoiceSignature(s,f),...(c.note?{note:c.note}:{}),...(exception?{exception:true}:{})};delete f.agentHold;message='Factura validada'+(exception?' con excepción':'')+' · '+f.reference;break;}
 case 'unvalidate':{const target=c.kind==='receipt'?receipt(c.id):s.invoices.find(x=>x.id===c.id);if(!target)throw new DomainError('Factura no encontrada.',404);if(!target.validation)throw new DomainError('No está validada.',409);delete target.validation;target.agentHold=true; // decisión humana: el agente no la vuelve a validar por su cuenta
  message='Validación deshecha · '+target.reference;break;}
 case 'agentAuthority':s.agent={...c.authority};message='Autoridad del agente · '+(Object.values(c.authority).some(Boolean)?[c.authority.validateReceipts&&'valida recepciones conformes',c.authority.acceptProposals&&'acepta emparejamientos completos',c.authority.validateInvoices&&'valida facturas conformes',c.authority.allowUnverifiedPrice&&'admite precio no comprobable',c.authority.readMail&&'lee las facturas del correo',c.authority.registerInvoices&&'registra facturas sin dudas'].filter(Boolean).join(', '):'sin permisos: todo pasa por una persona');break;
 case 'issue':receipt(c.receiptId);s.issues.push({id:commandId,receiptId:c.receiptId,message:c.message,at:now,resolved:false});message='Incidencia registrada · '+c.message;break;
 case 'resolveIssue':{const i=s.issues.find(i=>i.id===c.issueId);if(!i)throw new DomainError('Incidencia no encontrada.');i.resolved=true;i.resolution=c.resolution;message='Incidencia resuelta · '+c.resolution;break;}
 }
 s.audit.unshift({id:commandId,at:now,action:c.type,message,...(agentCommand?{by:'agent' as const}:{})});afterChange(s,now,commandId);
 s.processed.push(commandId);s.version++;return s;
}
