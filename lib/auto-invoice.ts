import type {Extraction} from './extraction';
import type {Command} from './domain';
import type {Workspace} from './types';
// ¿Se puede registrar sola una factura leída del correo? Solo si no queda ninguna duda: tipo, proveedor,
// número, fecha y cada línea identificados por coincidencia exacta. Todo lo demás se deja para una persona.
// Función pura: no lee ni escribe nada.
/** Nombre de proveedor comparable: sin mayúsculas, acentos, puntuación ni forma jurídica final (S.L., S.A.…). */
export function supplierKey(name:string){return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[.,;:'"()/\\-]+/g,' ').replace(/\s+/g,' ').trim().replace(/\s+(s\s?l\s?u?|s\s?a\s?u?|s\s?l\s?l|s\s?c|s\s?coop|c\s?b)$/,'').trim();}
export function resolveSupplier(read:string|null,known:string[]):string|null{if(!read)return null;const key=supplierKey(read);if(!key)return null;const hits=[...new Set(known.filter(k=>supplierKey(k)===key))];return hits.length===1?hits[0]:null;}
const QTY=/^\d{1,9}(\.\d{1,3})?$/,PRICE=/^\d{1,9}(\.\d{1,4})?$/;
type CreateInvoice=Extract<Command,{type:'createInvoice'}>;
export type AutoInvoice={ok:true;command:CreateInvoice}|{ok:false;reasons:string[]};
export function autoInvoice(reading:Extraction,state:Pick<Workspace,'products'|'receipts'|'invoices'>,knownSuppliers:string[],documentId:string):AutoInvoice{
 const reasons:string[]=[];
 if(reading.documentType!=='invoice')reasons.push('No es una factura de compra');
 if(reading.warnings.length)reasons.push('La lectura tiene advertencias');
 const supplier=resolveSupplier(reading.supplier,[...knownSuppliers,...state.receipts.map(r=>r.supplier)]);if(!supplier)reasons.push('Proveedor no reconocido con seguridad');
 const reference=reading.reference?.trim()||'';if(!reference||reference.length>160)reasons.push('Sin número de factura');
 if(!reading.date)reasons.push('Sin fecha inequívoca');
 if(supplier&&reference&&state.invoices.some(f=>f.supplier===supplier&&f.reference===reference))reasons.push('Factura ya registrada');
 if(!reading.lines.length||reading.lines.length>100)reasons.push('Sin líneas de mercancía');
 const active=state.products.filter(p=>!p.archived),lines:CreateInvoice['lines']=[];
 reading.lines.forEach((l,i)=>{const n=i+1,code=l.code?.trim();
  if(!l.quantity||!QTY.test(l.quantity)||Number(l.quantity)<=0){reasons.push(`Línea ${n}: cantidad no válida`);return;}
  if(l.price&&!PRICE.test(l.price)){reasons.push(`Línea ${n}: precio no válido`);return;}
  if(!code){reasons.push(`Línea ${n}: sin código de producto`);return;}
  // Solo código o referencia de la unidad. Un código de caja exigiría convertir cantidades: se deja a una persona.
  const hits=active.filter(p=>p.code===code||p.sku===code);if(hits.length!==1){reasons.push(`Línea ${n}: el código ${code} no identifica un único producto`);return;}
  lines.push({productId:hits[0].id,quantity:l.quantity,...(l.price?{price:l.price}:{})});});
 if(reasons.length)return {ok:false,reasons};
 return {ok:true,command:{type:'createInvoice',auto:true,supplier:supplier!,reference,date:reading.date!,receiptRefs:[...new Set(reading.receiptRefs.map(r=>r.trim()).filter(r=>r&&r.length<=160))],fileIds:[documentId],lines}};
}
