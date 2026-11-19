import Decimal from 'decimal.js';
import {exactProposal,type Doc,type DocLine} from './matching';
import {normCode,normText,normTaxId,supplierKey,similarity,refMatches,fuzzyRefMatches} from './normalize';
// Búsqueda ampliada de albaranes para una factura («Buscar coincidencias» en Diferencias). Función pura y determinista,
// solo con los datos guardados (sin IA). Propone; nunca vincula: eso lo hace una persona con «Vincular».

export const SEARCH_DAYS_BEFORE=180; // albaranes hasta 180 días antes de la factura…
export const SEARCH_DAYS_AFTER=60;   // …o hasta 60 días después
export const MAX_SUGGESTIONS=5;
export type NoteCandidate={doc:Doc;confirmed:boolean};
export type Suggestion={noteIds:string[];pct:number;exact:boolean;reasons:string[];unconfirmed:string[]};

const D=(v:string|null|undefined)=>v===null||v===undefined||v===''?null:new Decimal(v);
const days=(a:string,b:string)=>Math.round((Date.parse(b)-Date.parse(a))/86400000);
const billedLines=(inv:Doc)=>inv.lines.filter(l=>{const q=D(l.quantity);return q&&!q.isZero();});

/** Cantidad de la factura que cubren estas líneas de albarán (código, descripción idéntica o parecida) y lo que ofrecen. */
function coverage(inv:Doc,lines:DocLine[],avail:Map<string,Decimal>){
 const left=new Map(lines.map(l=>[l.id,avail.get(l.id)||new Decimal(0)]));let matched=new Decimal(0),billed=new Decimal(0);
 const tiers=[(a:DocLine,b:DocLine)=>Boolean(normCode(a.code))&&normCode(a.code)===normCode(b.code),(a:DocLine,b:DocLine)=>Boolean(normText(a.description))&&normText(a.description)===normText(b.description),(a:DocLine,b:DocLine)=>similarity(a.description,b.description)>=0.6];
 for(const il of billedLines(inv)){let need=D(il.quantity)!;billed=billed.plus(need);
  for(const t of tiers)for(const l of lines){if(need.lte(0))break;const a=left.get(l.id)!;if(a.lte(0)||!t(il,l))continue;const take=Decimal.min(a,need);left.set(l.id,a.minus(take));need=need.minus(take);matched=matched.plus(take);}}
 const offered=lines.reduce((s,l)=>s.plus(avail.get(l.id)||0),new Decimal(0));return {matched,billed,offered};}
/** Porcentaje de coincidencia: 100 solo si lo facturado y lo entregado pendiente son lo mismo. */
function pctOf(inv:Doc,notes:Doc[],avail:Map<string,Decimal>){const {matched,billed,offered}=coverage(inv,notes.flatMap(n=>n.lines),avail);const den=billed.plus(offered);
 return den.isZero()?0:Math.min(99,matched.times(200).div(den).toDecimalPlaces(0,Decimal.ROUND_DOWN).toNumber());}

/**
 * Albaranes candidatos para una factura con todas las variables: proveedor (NIF, nombre igual o parecido, albarán sin
 * proveedor), número citado aunque esté mal leído, fecha con margen amplio, líneas e importes. Incluye borradores y
 * dudosos (marcados en «unconfirmed»: no se pueden vincular hasta confirmarlos). «avail»: cantidad disponible de cada
 * línea de albarán para esta factura; «exclude»: albaranes ya asociados a ella.
 */
export function searchMatches(inv:Doc,notes:NoteCandidate[],avail:Map<string,Decimal>,exclude:Set<string>=new Set()):Suggestion[]{
 const refs=[...new Set([...inv.deliveryRefs,...inv.lines.map(l=>l.deliveryRef)].map(r=>r.trim()).filter(Boolean))];
 const invNif=normTaxId(inv.supplierTaxId),invKey=supplierKey(inv.supplier),subtotal=D(inv.subtotal);
 const scored:{c:NoteCandidate;pct:number;reasons:string[];strong:boolean}[]=[];
 for(const c of notes){const n=c.doc;if(exclude.has(n.id)||!n.lines.some(l=>(avail.get(l.id)||new Decimal(0)).gt(0)))continue;
  const reasons:string[]=[];
  const exactRef=refs.find(r=>refMatches(n.number,r)),fuzzyRef=exactRef?undefined:refs.find(r=>fuzzyRefMatches(n.number,r));
  if(exactRef)reasons.push(`La factura cita el albarán ${exactRef}.`);else if(fuzzyRef)reasons.push(`La factura cita «${fuzzyRef}», que se parece al número ${n.number} (posible error de lectura).`);
  const ref=Boolean(exactRef||fuzzyRef),nif=normTaxId(n.supplierTaxId),key=supplierKey(n.supplier);
  if(invNif&&nif&&invNif===nif)reasons.push('Mismo NIF de proveedor.');
  else if(invNif&&nif&&!ref)continue; // NIF distinto: otro proveedor
  else if(key&&key===invKey)reasons.push('Mismo proveedor.');
  else if(n.supplier&&similarity(n.supplier,inv.supplier)>=0.6)reasons.push(`Proveedor de nombre parecido («${n.supplier}»).`);
  else if(!n.supplier&&!nif)reasons.push('Albarán sin proveedor identificado.');
  else if(!ref)continue;
  if(inv.date&&n.date){const d=days(n.date,inv.date);if((d>SEARCH_DAYS_BEFORE||d< -SEARCH_DAYS_AFTER)&&!ref)continue;reasons.push(d===0?'Misma fecha que la factura.':d>0?`Fecha: ${d} día${d===1?'':'s'} antes de la factura.`:`Fecha: ${-d} día${d===-1?'':'s'} después de la factura.`);}
  const amounts=n.lines.map(l=>D(l.amount));let amount=false;
  if(subtotal&&amounts.length&&amounts.every(a=>a!==null)){const s=amounts.reduce((x,a)=>x.plus(a!),new Decimal(0));if(s.minus(subtotal).abs().lte('0.02')){amount=true;reasons.push('El importe del albarán coincide con la base de la factura.');}}
  const pct=pctOf(inv,[n],avail);if(!pct&&!ref&&!amount)continue;
  if(!c.confirmed)reasons.push('Albarán sin confirmar: confírmalo antes de vincularlo.');
  scored.push({c,pct,reasons,strong:ref||amount});}
 const out:Suggestion[]=[];
 // Combinación exacta (100 %) entre los candidatos, confirmados o no.
 const full=new Map(avail);for(const s of scored)for(const l of s.c.doc.lines)if(!full.has(l.id))full.set(l.id,new Decimal(0));
 const best=exactProposal(inv,scored.map(s=>s.c.doc),full);
 if(best){const ids=best.map(n=>n.id),parts=scored.filter(s=>ids.includes(s.c.doc.id));
  out.push({noteIds:ids,pct:100,exact:true,reasons:[best.length>1?'Juntos cuadran al 100 % con la factura: mismas líneas, cantidades y, si los hay, precios.':'Cuadra al 100 % con la factura: mismas líneas, cantidades y, si los hay, precios.',...[...new Set(parts.flatMap(p=>p.reasons))]],unconfirmed:parts.filter(p=>!p.c.confirmed).map(p=>p.c.doc.id)});}
 scored.sort((a,b)=>b.pct-a.pct||Number(b.strong)-Number(a.strong)||(b.c.doc.date||'').localeCompare(a.c.doc.date||'')||a.c.doc.id.localeCompare(b.c.doc.id));
 for(const s of scored){if(out.length>=MAX_SUGGESTIONS)break;if(best&&best.length===1&&best[0].id===s.c.doc.id)continue;
  out.push({noteIds:[s.c.doc.id],pct:s.pct,exact:false,reasons:s.reasons,unconfirmed:s.c.confirmed?[]:[s.c.doc.id]});}
 return out;}
