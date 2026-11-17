'use client';
import {useState} from 'react';
import Decimal from 'decimal.js';
import {FileText,CheckCircle2,AlertTriangle,Clock3,HelpCircle,Package,ArrowRight,Sparkles,Pencil,BadgeEuro,ShieldCheck} from 'lucide-react';
import type {Invoice,Workspace} from '@/lib/types';
import {invoiceSummary,priceCheck,type Command} from '@/lib/domain';
import {Badge,date,quantity} from './ui';
// Vista de emparejamiento factura ↔ recepciones. Solo presenta lo calculado por reconcile() y priceCheck();
// las únicas decisiones son humanas: aceptar una propuesta o indicar a mano los albaranes.
const percent=(part:string|Decimal,total:string|Decimal)=>{const t=new Decimal(total);return t.lte(0)?0:Decimal.min(100,new Decimal(part).div(t).times(100)).toNumber();};
// Colores por albarán: se evita el ámbar, reservado para «sin respaldo».
const TONES=[1,5,7,2,6,4];const tone=(i:number)=>`var(--series-${TONES[i%TONES.length]})`;
const euro=(v:string|Decimal,max=2)=>new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:max}).format(Number(v));
const signed=(v:string)=>(Number(v)>0?'+':'')+euro(v);
type RefState={ref:string;kind:'confirmed'|'partial'|'open'|'missing'|'ambiguous';receiptId?:string;tone:number};
export function referenceStates(state:Workspace,f:Invoice):RefState[]{
 return [...new Set(f.receiptRefs)].map((ref,i)=>{const matches=state.receipts.filter(r=>r.reference===ref&&r.supplier===f.supplier);
  if(matches.length>1)return {ref,kind:'ambiguous' as const,tone:i};if(!matches.length)return {ref,kind:'missing' as const,tone:i};
  return {ref,kind:matches[0].status==='open'?'open' as const:matches[0].status==='partial'?'partial' as const:'confirmed' as const,receiptId:matches[0].id,tone:i};});
}
const refLabel={confirmed:'Recepción confirmada',partial:'Recepción parcial: resto pendiente',open:'Pendiente de confirmar llegada',missing:'Albarán no registrado',ambiguous:'Referencia ambigua'};
/** Estado global de una factura para listas y cabeceras: el precio distinto manda sobre todo lo demás. */
export function invoiceStatus(state:Workspace,f:Invoice){const summary=invoiceSummary(state,f),price=priceCheck(state,f);
 const kind=price.status==='discrepancy'?'danger':summary.complete?'success':'warning';
 const label=price.status==='discrepancy'?'Precio distinto al acordado':summary.complete?(price.status==='ok'?'Cantidades y precios conformes':'Cantidades respaldadas'):Number(summary.proposed)>0?'Propuesta por validar':'Conciliación parcial';
 return {summary,price,kind,label};}
export function CoverageBar({matched,proposed='0',total,compact}:{matched:string;proposed?:string;total:string;compact?:boolean}){
 const p=percent(matched,total),pp=Math.min(100-p,percent(proposed,total)),complete=new Decimal(matched).gte(total)&&new Decimal(total).gt(0);
 return <div className={'coverage'+(compact?' compact':'')}><div className="coverage-track" role="img" aria-label={`${quantity(matched)} de ${quantity(total)} unidades respaldadas`+(Number(proposed)>0?`; ${quantity(proposed)} propuestas`:'')}><div className={'coverage-fill '+(complete?'ok':'partial')} style={{width:p+'%'}}/>{pp>0&&<div className="coverage-fill proposed" style={{width:pp+'%'}}/>}</div><span className={'coverage-value '+(complete?'ok':'partial')}>{Math.floor(p)}%</span></div>;
}
export function InvoiceDetail({invoice:f,state,run,onBack}:{invoice:Invoice;state:Workspace;run:(c:Command)=>Promise<boolean>;onBack:()=>void}){
 const {summary,price,kind,label}=invoiceStatus(state,f),refs=referenceStates(state,f),mine=state.allocations.filter(a=>a.invoiceId===f.id);
 const order=[...new Set([...refs.map(r=>r.receiptId).filter(Boolean) as string[],...mine.map(a=>a.receiptId)])],toneOf=(receiptId:string)=>Math.max(0,order.indexOf(receiptId));
 const hasProposal=Number(summary.proposed)>0,proposedReceipts=[...new Set(mine.filter(a=>a.basis==='product').map(a=>a.receiptId))].map(id=>state.receipts.find(r=>r.id===id)!).filter(Boolean);
 const candidates=state.receipts.filter(r=>r.supplier===f.supplier&&r.status!=='open');
 const [editing,setEditing]=useState(false),[picked,setPicked]=useState<string[]>(f.receiptRefs),[busy,setBusy]=useState(false);
 const act=async(c:Command)=>{setBusy(true);const ok=await run(c);setBusy(false);return ok;};
 return <><button className="back-link" onClick={onBack}>← Todas las facturas</button>
 <section className="panel"><div className="panel-heading"><FileText size={20}/><h2>{f.reference}</h2><Badge kind={kind}>{label}</Badge></div>
 <div className="match-body">
  <p className="muted">{f.supplier} · {date(f.date)}</p>
  {f.validation?<div className="validated-bar"><ShieldCheck size={18}/><span><strong>Validada {f.validation.by==='agent'?'por el agente':'por una persona'}{f.validation.exception?' como excepción':''}</strong><small>{new Date(f.validation.at).toLocaleString('es-ES',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Madrid'})}{f.validation.note?' · '+f.validation.note:''}</small></span><button type="button" className="button secondary small" disabled={busy} onClick={()=>void act({type:'unvalidate',kind:'invoice',id:f.id})}>Deshacer</button></div>
   :summary.complete&&price.status==='ok'&&<div className="validated-bar pending"><CheckCircle2 size={18}/><span><strong>Todo coincide</strong><small>Cantidades respaldadas y precios iguales a los acordados.</small></span><button type="button" className="button primary small" disabled={busy} onClick={()=>void act({type:'validate',kind:'invoice',id:f.id})}>Validar factura</button></div>}
  {hasProposal&&!editing&&<div className="match-proposal"><Sparkles size={20}/><div><strong>Esta factura no cita albaranes: propuesta por productos recibidos</strong><p>Coincide con {proposedReceipts.length===1?'una entrega':proposedReceipts.length+' entregas'} de {f.supplier} todavía sin facturar: {proposedReceipts.map(r=>r.reference+' ('+date(r.date)+')').join(' · ')}. {summary.proposalComplete?'Cubre todas las unidades facturadas.':'No cubre todas las unidades facturadas.'}</p><div className="match-proposal-actions"><button type="button" className="button primary" disabled={busy} onClick={()=>void act({type:'acceptMatch',invoiceId:f.id})}><CheckCircle2 size={17}/>Aceptar emparejamiento</button><button type="button" className="button secondary" disabled={busy} onClick={()=>{setPicked(proposedReceipts.map(r=>r.reference));setEditing(true);}}><Pencil size={16}/>Elegir albaranes a mano</button></div></div></div>}
  <div className="match-summary">
   <div className="match-tile"><span>Facturado</span><strong>{quantity(summary.total)}</strong><small>unidades</small></div>
   <div className="match-tile ok"><span>Respaldado</span><strong>{quantity(summary.matched)}</strong><small>por recepciones confirmadas</small></div>
   {hasProposal?<div className="match-tile proposed"><span>Propuesto</span><strong>{quantity(summary.proposed)}</strong><small>pendiente de tu validación</small></div>
    :<div className={'match-tile '+(summary.complete?'':'warn')}><span>Sin respaldo</span><strong>{quantity(summary.pending)}</strong><small>{summary.complete?'nada pendiente':'pendiente de recepción o revisión'}</small></div>}
  </div>
  <CoverageBar matched={summary.matched} proposed={summary.proposed} total={summary.total}/>
  <div className="match-heading-row"><h3 className="match-heading">Albaranes de esta factura</h3>{!editing&&!hasProposal&&<button type="button" className="text-button" onClick={()=>{setPicked(f.receiptRefs);setEditing(true);}}><Pencil size={14}/> Cambiar</button>}</div>
  {editing?<div className="match-editor"><p className="helper">Marca las entregas de {f.supplier} que cubre esta factura. Solo aparecen recepciones ya confirmadas.</p>
    <div className="match-refs">{candidates.map(r=>{const on=picked.includes(r.reference);return <button type="button" key={r.id} aria-pressed={on} className={'match-ref pick'+(on?' on':'')} onClick={()=>setPicked(on?picked.filter(x=>x!==r.reference):[...picked,r.reference])}><span><strong>{r.reference}</strong><small>{date(r.date)}{r.order?' · pedido '+r.order.name:''}</small></span>{on?<CheckCircle2 size={16}/>:<span className="match-ref-box"/>}</button>;})}{!candidates.length&&<p className="muted">No hay recepciones confirmadas de este proveedor.</p>}</div>
    <div className="match-proposal-actions"><button type="button" className="button primary" disabled={busy} onClick={async()=>{if(await act({type:'setInvoiceRefs',invoiceId:f.id,receiptRefs:picked}))setEditing(false);}}>Guardar albaranes</button><button type="button" className="button secondary" disabled={busy} onClick={()=>setEditing(false)}>Cancelar</button></div></div>
   :<div className="match-refs">{refs.map(r=><span className={'match-ref '+r.kind} key={r.ref}><i className="match-dot" style={{background:tone(r.receiptId?toneOf(r.receiptId):r.tone)}}/><span><strong>{r.ref}</strong><small>{refLabel[r.kind]}</small></span>{r.kind==='confirmed'?<CheckCircle2 size={16}/>:r.kind==='open'||r.kind==='partial'?<Clock3 size={16}/>:<HelpCircle size={16}/>}</span>)}
     {hasProposal&&proposedReceipts.map(r=><span className="match-ref proposed" key={r.id}><i className="match-dot" style={{background:tone(toneOf(r.id))}}/><span><strong>{r.reference}</strong><small>Propuesto · sin aceptar</small></span><Sparkles size={15}/></span>)}
     {!refs.length&&!hasProposal&&<p className="muted">La factura no cita albaranes y no hay entregas confirmadas de este proveedor que coincidan.</p>}</div>}
  <h3 className="match-heading">Emparejamiento por línea</h3>
  {f.lines.map(l=>{const p=state.products.find(p=>p.id===l.productId);const assignments=mine.filter(a=>a.invoiceLineId===l.id);const covered=assignments.reduce((a,x)=>a.plus(x.quantity),new Decimal(0));const rest=Decimal.max(0,new Decimal(l.quantity).minus(covered));const proposal=assignments.some(a=>a.basis==='product');const ok=rest.eq(0)&&!proposal;const pl=price.lines.find(x=>x.invoiceLineId===l.id)!;
   return <div className={'match-line '+(pl.status==='discrepancy'?'bad':ok?'ok':'warn')} key={l.id}>
    <div className="match-line-head"><span className="match-line-icon">{ok?<CheckCircle2 size={18}/>:proposal&&rest.eq(0)?<Sparkles size={18}/>:<AlertTriangle size={18}/>}</span><div><strong>{p?.name||'Producto no encontrado'}</strong><small>{p?.sku}</small></div><span className="match-line-qty"><strong>{quantity(covered.toString())}</strong> / {quantity(l.quantity)} ud</span></div>
    <div className="match-bar" role="img" aria-label={`${quantity(covered.toString())} de ${quantity(l.quantity)} unidades ${proposal?'propuestas':'respaldadas'}`}>{assignments.map(a=><div key={a.receiptId+a.lineId} className={'match-seg'+(a.basis==='product'?' proposed':'')} style={{width:percent(a.quantity,l.quantity)+'%',background:tone(toneOf(a.receiptId))}}/>)}{rest.gt(0)&&<div className="match-seg rest" style={{width:percent(rest,l.quantity)+'%'}}/>}</div>
    <div className="match-chips">{assignments.map(a=><span className={'match-chip'+(a.basis==='product'?' proposed':'')} key={a.receiptId+a.lineId}><i className="match-dot" style={{background:tone(toneOf(a.receiptId))}}/><Package size={13}/>{state.receipts.find(r=>r.id===a.receiptId)?.reference}<b>{quantity(a.quantity)} ud</b></span>)}{rest.gt(0)&&<span className="match-chip rest"><AlertTriangle size={13}/>Sin respaldo<b>{quantity(rest.toString())} ud</b></span>}</div>
    <div className={'match-price '+pl.status}><BadgeEuro size={16}/>{pl.status==='discrepancy'?<span><strong>Precio distinto al acordado.</strong> Facturado {euro(pl.invoiced!,4)} · acordado {pl.agreed.map(a=>euro(a,4)).join(' / ')} · diferencia de <b>{signed(pl.impact)}</b> en {quantity(pl.checkedQuantity)} ud</span>:pl.status==='ok'?<span>Precio conforme: {euro(pl.invoiced!,4)} por unidad, igual al acordado.</span>:<span>{!pl.invoiced?'La factura no indica precio en esta línea.':!assignments.length?'Sin entregas emparejadas todavía: el precio se comprobará al emparejar.':pl.agreed.length?'Precio comprobado solo en parte de las unidades.':'Sin precio acordado de referencia ('+euro(pl.invoiced,4)+' facturado): no se puede comprobar.'}</span>}</div>
   </div>;})}
  <div className="match-controls">
   <span className={'match-control'+(summary.complete?'':' pending')}>{summary.complete?<CheckCircle2 size={16}/>:hasProposal?<Sparkles size={16}/>:<AlertTriangle size={16}/>}<span><strong>Cantidades</strong><small>{summary.complete?'Respaldadas por recepciones confirmadas':hasProposal?'Propuesta pendiente de validar':'Parcialmente respaldadas'}</small></span></span>
   <span className={'match-control '+(price.status==='ok'?'':price.status==='discrepancy'?'bad':'pending')}>{price.status==='ok'?<CheckCircle2 size={16}/>:price.status==='discrepancy'?<AlertTriangle size={16}/>:<HelpCircle size={16}/>}<span><strong>{price.status==='ok'?'Precios conformes':price.status==='discrepancy'?'Precio distinto: '+signed(price.impact):'Precio no comprobado'}</strong><small>{price.status==='ok'?'Iguales a los acordados en el pedido':price.status==='discrepancy'?'Frente a lo acordado en el pedido de compra':'Falta precio en la factura o precio acordado de referencia'}</small></span></span>
  </div>
 </div></section></>;
}
export function InvoiceCard({invoice:f,state,onOpen}:{invoice:Invoice;state:Workspace;onOpen:()=>void}){
 const {summary,price,kind,label}=invoiceStatus(state,f),refs=referenceStates(state,f),hasProposal=Number(summary.proposed)>0;
 return <button className={'panel invoice-card'+(price.status==='discrepancy'?' alert':'')} onClick={onOpen}><div className="spread"><span className="quick-icon blue"><FileText size={23}/></span><Badge kind={kind}>{label}</Badge></div><h2>{f.reference}</h2><p>{f.supplier}</p>
  <div className="invoice-match"><div className="spread"><span>Unidades respaldadas</span><strong>{quantity(summary.matched)} <small>/ {quantity(summary.total)}</small></strong></div><CoverageBar matched={summary.matched} proposed={summary.proposed} total={summary.total} compact/></div>
  <div className="match-refs mini">{refs.map(r=><span className={'match-ref '+r.kind} key={r.ref} title={refLabel[r.kind]}><i className="match-dot" style={{background:tone(r.tone)}}/><strong>{r.ref}</strong>{r.kind==='confirmed'?<CheckCircle2 size={14}/>:r.kind==='open'||r.kind==='partial'?<Clock3 size={14}/>:<HelpCircle size={14}/>}</span>)}{hasProposal&&<span className="match-ref proposed"><Sparkles size={14}/><strong>{quantity(summary.proposed)} ud propuestas por productos</strong></span>}{!refs.length&&!hasProposal&&<span className="muted">Sin albaranes indicados</span>}</div>
  <div className="invoice-footer"><span className={'price-note '+price.status}>{price.status==='discrepancy'?'Precio distinto: '+signed(price.impact):price.status==='ok'?'Precios conformes':'Precio no comprobado'}</span><span>Ver emparejamiento <ArrowRight size={16}/></span></div></button>;
}
