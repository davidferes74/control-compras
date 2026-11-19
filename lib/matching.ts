import Decimal from 'decimal.js';
import {normCode,normText,refMatches,similarity,supplierKey,normTaxId} from './normalize';
// Motor de conciliación factura ↔ albaranes. Función pura y determinista: mismos documentos, mismo resultado.
// Aritmética decimal exacta. La IA solo transcribe documentos; aquí se decide qué cuadra y qué no.

export type Kind='invoice'|'delivery_note'|'credit_note';
export type DocLine={id:string;position:number;code:string;description:string;quantity:string|null;unit:string;unitPrice:string|null;discountPct:string|null;amount:string|null;deliveryRef:string};
export type Doc={id:string;kind:Kind;supplier:string;supplierTaxId:string;number:string;date:string|null;deliveryRefs:string[];subtotal:string|null;tax:string|null;total:string|null;lines:DocLine[]};
export type Severity='error'|'review'|'info';
export type DiscrepancyKind='missing_delivery'|'no_delivery'|'over_invoiced'|'already_invoiced'|'price'|'discount'|'amount'|'totals'|'proposed'|'similar'|'not_invoiced'|'charge'|'no_lines';
export type Discrepancy={key:string;kind:DiscrepancyKind;severity:Severity;message:string;invoiceLineId?:string;deliveryNoteId?:string;accepted?:{reason:string;at:string}};
export type Basis='code'|'description'|'similar';
export type Pair={invoiceLineId:string;deliveryNoteId:string;deliveryLineId:string;quantity:string;basis:Basis};
export type InvoiceStatus='ok'|'diff'|'missing'|'review';
// exact: los albaranes propuestos (la factura no cita ninguno) cuadran al 100 % con ella.
// ready: «Lista para validar»: propuesta exacta y nada más pendiente salvo validar la propuesta.
export type InvoiceMatch={invoiceId:string;status:InvoiceStatus;deliveryNoteIds:string[];proposed:boolean;exact?:boolean;ready?:boolean;pairs:Pair[];discrepancies:Discrepancy[];prices:'ok'|'diff'|'unverifiable'};
export type DeliveryStatus='invoiced'|'partial'|'pending';
export type DeliveryState={deliveryNoteId:string;status:DeliveryStatus;invoiceIds:string[];pending:{lineId:string;description:string;quantity:string}[]};
export type Decisions=Map<string,Map<string,{reason:string;at:string}>>; // invoiceId → key → aceptación

export const PRICE_TOLERANCE=new Decimal('0.005'); // por unidad, tras descuento
export const AMOUNT_TOLERANCE=new Decimal('0.02');  // importe de línea y total
export const SUBTOTAL_TOLERANCE=new Decimal('0.05'); // suma de líneas frente a base imponible (redondeos por línea)
export const PROPOSAL_DAYS=90;      // albaranes hasta 90 días anteriores a la factura…
export const PROPOSAL_DAYS_AFTER=15; // …o hasta 15 días posteriores (la factura llegó antes que el albarán)
export const MAX_EXACT_CANDIDATES=12; // combinaciones de albaranes que se prueban para una propuesta exacta

const D=(v:string|null|undefined)=>v===null||v===undefined||v===''?null:new Decimal(v);
const fmt=(v:Decimal|string)=>new Decimal(v).toDecimalPlaces(3).toString().replace('.',',');
const money=(v:Decimal|string)=>new Decimal(v).toFixed(2).replace('.',',');
const u=(unit:string)=>unit?' '+unit:'';
const lineName=(l:DocLine)=>(l.description||l.code||'línea '+l.position).slice(0,80);
const lineKey=(l:DocLine)=>normCode(l.code)||normText(l.description)||String(l.position);
/** Precio efectivo por unidad tras descuento, o null si no hay precio. */
export function netPrice(l:DocLine){const p=D(l.unitPrice);if(!p)return null;const d=D(l.discountPct);return d?p.times(new Decimal(100).minus(d)).div(100):p;}

/** Agrupa por proveedor: NIF si lo hay; si no, nombre normalizado (enlazado al NIF cuando algún documento tiene ambos). */
export function supplierGroups(docs:Doc[]){const byName=new Map<string,string>();for(const d of docs){const t=normTaxId(d.supplierTaxId);if(t)byName.set(supplierKey(d.supplier),t);}
 const groups=new Map<string,Doc[]>();for(const d of docs){const k=normTaxId(d.supplierTaxId)||byName.get(supplierKey(d.supplier))||'n:'+supplierKey(d.supplier);(groups.get(k)||groups.set(k,[]).get(k)!).push(d);}return groups;}

const byDate=(a:Doc,b:Doc)=>(a.date||'9999').localeCompare(b.date||'9999')||a.number.localeCompare(b.number)||a.id.localeCompare(b.id);
const daysBetween=(a:string,b:string)=>(Date.parse(b)-Date.parse(a))/86400000;
const inWindow=(n:Doc,inv:Doc)=>{if(!inv.date||!n.date)return true;const d=daysBetween(n.date,inv.date);return d>=-PROPOSAL_DAYS_AFTER&&d<=PROPOSAL_DAYS;};
const sameCode=(a:DocLine,b:DocLine)=>Boolean(normCode(a.code))&&normCode(a.code)===normCode(b.code);
const sameText=(a:DocLine,b:DocLine)=>Boolean(normText(a.description))&&normText(a.description)===normText(b.description);

/**
 * ¿Estos albaranes cuadran al 100 % con la factura? Cada línea con cantidad se cubre entera por código o descripción
 * idéntica (no parecida), lo pendiente de los albaranes se consume entero y, si ambos tienen precio, coincide.
 */
function coversExactly(inv:Doc,notes:Doc[],remaining:Map<string,Decimal>):boolean{
 const lines=notes.flatMap(n=>n.lines.filter(l=>remaining.get(l.id)!.gt(0))),left=new Map(lines.map(l=>[l.id,remaining.get(l.id)!]));
 const billed=inv.lines.filter(il=>{const q=D(il.quantity);return q&&!q.isZero();});if(!billed.length||!lines.length)return false;
 for(const il of billed){let need=D(il.quantity)!;
  for(const test of [sameCode,sameText])for(const l of lines){if(need.lte(0))break;const avail=left.get(l.id)!;if(avail.lte(0)||!test(il,l))continue;
   const pi=netPrice(il),pd=netPrice(l);if(pi&&pd&&pi.minus(pd).abs().gt(PRICE_TOLERANCE))return false;
   const take=Decimal.min(avail,need);left.set(l.id,avail.minus(take));need=need.minus(take);}
  if(need.gt(0))return false;}
 return [...left.values()].every(v=>v.isZero());}

/** La combinación más pequeña de albaranes candidatos que cuadra al 100 % con la factura, o null. Determinista. */
export function exactProposal(inv:Doc,candidates:Doc[],remaining:Map<string,Decimal>):Doc[]|null{
 // Solo albaranes con alguna línea que case con la factura; si aún son demasiados, no se arriesga una propuesta.
 const useful=candidates.filter(n=>n.lines.some(l=>remaining.get(l.id)!.gt(0)&&inv.lines.some(il=>sameCode(il,l)||sameText(il,l))));
 if(!useful.length||useful.length>MAX_EXACT_CANDIDATES)return null;
 const k=useful.length;
 for(let size=1;size<=k;size++){
  const pick=(start:number,acc:Doc[]):Doc[]|null=>{if(acc.length===size)return coversExactly(inv,acc,remaining)?acc:null;
   for(let i=start;i<=k-(size-acc.length);i++){const r=pick(i+1,[...acc,useful[i]]);if(r)return r;}return null;};
  const found=pick(0,[]);if(found)return found;}
 return null;}

export function reconcile(docs:Doc[],decisions:Decisions=new Map()):{invoices:Map<string,InvoiceMatch>;deliveries:Map<string,DeliveryState>}{
 const invoices=new Map<string,InvoiceMatch>(),deliveries=new Map<string,DeliveryState>();
 for(const group of supplierGroups(docs.filter(d=>d.kind!=='credit_note')).values()){
  const notes=group.filter(d=>d.kind==='delivery_note').sort(byDate),bills=group.filter(d=>d.kind==='invoice').sort(byDate);
  const remaining=new Map<string,Decimal>(),noteOf=new Map<string,Doc>(),consumedBy=new Map<string,string[]>(),linkedBy=new Map<string,string[]>();
  for(const n of notes)for(const l of n.lines){remaining.set(l.id,D(l.quantity)||new Decimal(0));noteOf.set(l.id,n);}
  for(const inv of bills){
   const out:Discrepancy[]=[],pairs:Pair[]=[];let priceSeen=false,priceDiff=false;
   const add=(d:Omit<Discrepancy,'accepted'>)=>{if(!out.some(x=>x.key===d.key))out.push(d);};
   // 1) Albaranes de la factura: los que cita, o propuestos por proveedor y fecha si no cita ninguno.
   const refs=[...new Set([...inv.deliveryRefs,...inv.lines.map(l=>l.deliveryRef)].map(r=>r.trim()).filter(Boolean))];
   let linked:Doc[]=[],proposed=false,exact=false;
   if(refs.length){for(const r of refs){const found=notes.filter(n=>refMatches(n.number,r));if(!found.length)add({key:'missing_delivery:'+r,kind:'missing_delivery',severity:'error',message:`La factura cita el albarán ${r}, que no está registrado.`});for(const n of found)if(!linked.includes(n))linked.push(n);}}
   else{// Sin albaranes citados: primero la combinación que cuadra al 100 %; si no la hay, todos los candidatos por proveedor y fecha.
    const candidates=notes.filter(n=>n.lines.some(l=>remaining.get(l.id)!.gt(0))&&inWindow(n,inv)),best=exactProposal(inv,candidates,remaining);
    linked=best||candidates;exact=Boolean(best);proposed=linked.length>0;
    const names=linked.map(n=>n.number||'sin número').join(', ');
    if(proposed)add({key:'proposed:'+linked.map(n=>n.number).join('|'),kind:'proposed',severity:'review',message:exact?`La factura no cita albaranes, pero cuadra al 100 % con ${linked.length>1?'los albaranes':'el albarán'} ${names}. Valida la propuesta para dejarla conforme.`:`La factura no cita albaranes. Se proponen por proveedor y fecha: ${names}.`});}
   for(const n of linked){if(!refs.length)continue;const fully=n.lines.length>0&&n.lines.every(l=>remaining.get(l.id)!.lte(0))&&(consumedBy.get(n.id)||[]).length>0;
    if(fully){const other=bills.filter(b=>(consumedBy.get(n.id)||[]).includes(b.id)).map(b=>b.number||'sin número');add({key:'already_invoiced:'+n.number+':'+other.join('|'),kind:'already_invoiced',severity:'error',deliveryNoteId:n.id,message:`El albarán ${n.number} ya está facturado entero en ${other.length>1?'las facturas':'la factura'} ${other.join(', ')}.`});}}
   for(const n of linked)linkedBy.set(n.id,[...(linkedBy.get(n.id)||[]),inv.id]);
   if(!inv.lines.length)add({key:'no_lines',kind:'no_lines',severity:'review',message:'La factura no tiene líneas: no se puede comparar con los albaranes.'});
   // 2) Líneas: código del proveedor, luego descripción exacta, luego descripción parecida (marcada para revisar).
   const pool=linked.flatMap(n=>n.lines);
   for(const il of inv.lines){
    const q=D(il.quantity);
    if(!q||q.isZero()){if(D(il.amount))add({key:'charge:'+lineKey(il)+':'+il.amount,kind:'charge',severity:'info',invoiceLineId:il.id,message:`«${lineName(il)}» no tiene cantidad (portes, cargos…): se suma al total pero no se compara con albaranes.`});continue;}
    const preferred=il.deliveryRef?linked.filter(n=>refMatches(n.number,il.deliveryRef)).map(n=>n.id):[];
    const order=(ls:DocLine[])=>[...ls].sort((a,b)=>Number(!preferred.includes(noteOf.get(a.id)!.id))-Number(!preferred.includes(noteOf.get(b.id)!.id)));
    const tiers:[Basis,(l:DocLine)=>boolean][]=[['code',l=>Boolean(normCode(il.code))&&normCode(l.code)===normCode(il.code)],['description',l=>Boolean(normText(il.description))&&normText(l.description)===normText(il.description)],['similar',l=>similarity(l.description,il.description)>=0.6&&(!normCode(il.code)||!normCode(l.code))]];
    let need=q,anyCandidate=false,basisUsed:Basis|null=null;
    for(const [basis,test] of tiers){const cands=order(pool.filter(test));if(cands.length)anyCandidate=true;
     for(const l of cands){if(need.lte(0))break;const left=remaining.get(l.id)!;if(left.lte(0))continue;const take=Decimal.min(left,need);remaining.set(l.id,left.minus(take));need=need.minus(take);const n=noteOf.get(l.id)!;
      pairs.push({invoiceLineId:il.id,deliveryNoteId:n.id,deliveryLineId:l.id,quantity:take.toString(),basis});basisUsed??=basis;consumedBy.set(n.id,[...new Set([...(consumedBy.get(n.id)||[]),inv.id])]);
      // Precio: solo si el albarán está valorado.
      const pi=netPrice(il),pd=netPrice(l);if(pi&&pd){priceSeen=true;if(pi.minus(pd).abs().gt(PRICE_TOLERANCE)){priceDiff=true;add({key:`price:${lineKey(il)}:${n.number}:${pi}:${pd}`,kind:'price',severity:'error',invoiceLineId:il.id,deliveryNoteId:n.id,message:`«${lineName(il)}»: precio neto en factura ${money(pi)} € y en el albarán ${n.number} ${money(pd)} € por unidad.`});}}
     }
     if(need.lte(0))break;}
    if(basisUsed==='similar')add({key:'similar:'+lineKey(il),kind:'similar',severity:'review',invoiceLineId:il.id,message:`«${lineName(il)}» se ha emparejado por descripción parecida, no idéntica. Comprueba que es el mismo artículo.`});
    const got=q.minus(need);
    if(got.isZero())add(anyCandidate&&refs.length?{key:`already_invoiced:${lineKey(il)}:${q}`,kind:'already_invoiced',severity:'error',invoiceLineId:il.id,message:`«${lineName(il)}» (${fmt(q)}${u(il.unit)}) ya estaba facturado entero en otra factura.`}:{key:`no_delivery:${lineKey(il)}:${q}`,kind:'no_delivery',severity:'error',invoiceLineId:il.id,message:`«${lineName(il)}»: se facturan ${fmt(q)}${u(il.unit)} que no aparecen en ${linked.length?'los albaranes asociados':'ningún albarán'}.`});
    else if(need.gt(0))add({key:`over_invoiced:${lineKey(il)}:${q}:${got}`,kind:'over_invoiced',severity:'error',invoiceLineId:il.id,message:`«${lineName(il)}»: se facturan ${fmt(q)}${u(il.unit)} y los albaranes solo recogen ${fmt(got)}.`});
    // Importe de línea = cantidad × precio × (1 − descuento).
    const p=D(il.unitPrice),amount=D(il.amount);if(p&&amount){const expected=netPrice(il)!.times(q).toDecimalPlaces(2);if(expected.minus(amount).abs().gt(AMOUNT_TOLERANCE))add({key:`amount:${lineKey(il)}:${amount}:${expected}`,kind:'amount',severity:'error',invoiceLineId:il.id,message:`«${lineName(il)}»: el importe de la línea es ${money(amount)} € y debería ser ${money(expected)} € (${fmt(q)} × ${money(netPrice(il)!)}).`});}
   }
   // 3) Totales de la factura.
   const amounts=inv.lines.map(l=>D(l.amount)).filter((x):x is Decimal=>x!==null),sub=D(inv.subtotal),tax=D(inv.tax),total=D(inv.total);
   if(sub&&amounts.length===inv.lines.length&&amounts.length){const s=amounts.reduce((a,b)=>a.plus(b),new Decimal(0));if(s.minus(sub).abs().gt(SUBTOTAL_TOLERANCE))add({key:`totals:lines:${s}:${sub}`,kind:'totals',severity:'error',message:`La suma de las líneas es ${money(s)} € y la base imponible ${money(sub)} €.`});}
   if(sub&&tax&&total&&sub.plus(tax).minus(total).abs().gt(AMOUNT_TOLERANCE))add({key:`totals:sum:${sub}:${tax}:${total}`,kind:'totals',severity:'error',message:`Base ${money(sub)} € + IVA ${money(tax)} € no da el total ${money(total)} €.`});
   invoices.set(inv.id,{invoiceId:inv.id,status:'ok',deliveryNoteIds:linked.map(n=>n.id),proposed,exact,pairs,discrepancies:out,prices:priceDiff?'diff':priceSeen?'ok':'unverifiable'});
  }
  // 4) Estado de cada albarán y lo entregado sin facturar (se avisa en la última factura que lo enlaza).
  for(const n of notes){const pending=n.lines.filter(l=>remaining.get(l.id)!.gt(0)).map(l=>({lineId:l.id,description:lineName(l),quantity:remaining.get(l.id)!.toString()}));const by=consumedBy.get(n.id)||[];
   deliveries.set(n.id,{deliveryNoteId:n.id,status:!by.length?'pending':pending.length?'partial':'invoiced',invoiceIds:by,pending});
   const last=(linkedBy.get(n.id)||[]).at(-1);if(last&&pending.length){const m=invoices.get(last)!;for(const p of pending){const l=n.lines.find(x=>x.id===p.lineId)!;m.discrepancies.push({key:`not_invoiced:${n.number}:${lineKey(l)}:${p.quantity}`,kind:'not_invoiced',severity:'info',deliveryNoteId:n.id,message:`Entregado y sin facturar: «${p.description}», ${fmt(p.quantity)}${u(l.unit)} del albarán ${n.number}.`});}}}
 }
 // 5) Aceptaciones y estado final.
 for(const m of invoices.values()){const accepted=decisions.get(m.invoiceId);for(const d of m.discrepancies){const a=accepted?.get(d.key);if(a)d.accepted=a;}m.status=statusOf(m.discrepancies);
  // Lista para validar: propuesta exacta y lo único abierto (salvo avisos informativos) es validar esa propuesta.
  const open=m.discrepancies.filter(d=>!d.accepted&&d.severity!=='info');m.ready=Boolean(m.exact)&&open.length===1&&open[0].kind==='proposed';}
 return {invoices,deliveries};
}

export function statusOf(ds:Discrepancy[]):InvoiceStatus{const open=ds.filter(d=>!d.accepted);
 if(open.some(d=>d.severity==='error'&&!['missing_delivery','no_delivery'].includes(d.kind)))return 'diff';
 if(open.some(d=>d.kind==='missing_delivery'||d.kind==='no_delivery'))return 'missing';
 if(open.some(d=>d.severity==='review'))return 'review';
 return 'ok';}
export const statusLabel:Record<InvoiceStatus,string>={ok:'Conforme',diff:'Con diferencias',missing:'Falta albarán',review:'Revisar'};
export const deliveryLabel:Record<DeliveryStatus,string>={invoiced:'Facturado',partial:'Facturado en parte',pending:'Pendiente de facturar'};
