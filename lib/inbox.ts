import Decimal from 'decimal.js';
import {invoiceSummary,priceCheck,receiptClosed,receiptConforming} from './domain';
import type {Invoice,Receipt,Workspace} from './types';
// Bandeja de validación: todo lo que espera una decisión, ordenado por lo que hay que hacer con ello.
//  - ready:  está conforme; basta validarlo.
//  - decide: necesita una decisión humana (propuesta, precio distinto, diferencias, precio no comprobable).
//  - wait:   todavía no se puede decidir (faltan entregas o documentos).
export type InboxBucket='ready'|'decide'|'wait';
export type InboxAction='validate'|'accept'|'exception'|'open';
export type InboxItem={key:string;kind:'receipt'|'invoice';id:string;reference:string;supplier:string;date:string;bucket:InboxBucket;headline:string;details:string[];action:InboxAction;tone:'success'|'warning'|'danger'|'info'};
const eur=(v:string)=>new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(Number(v));
const signed=(v:string)=>(Number(v)>0?'+':'')+eur(v);
const units=(v:string|Decimal)=>new Intl.NumberFormat('es-ES',{maximumFractionDigits:3}).format(Number(v));
function invoiceItem(s:Workspace,f:Invoice):InboxItem{
 const sum=invoiceSummary(s,f),price=priceCheck(s,f),base={key:'invoice:'+f.id,kind:'invoice' as const,id:f.id,reference:f.reference,supplier:f.supplier,date:f.date};
 if(price.status==='discrepancy')return {...base,bucket:'decide',tone:'danger',action:'exception',headline:'Precio distinto al acordado: '+signed(price.impact),details:[sum.complete?'Cantidades respaldadas':units(sum.pending)+' ud sin respaldo']};
 if(Number(sum.proposed)>0)return {...base,bucket:'decide',tone:'info',action:'accept',headline:'Propuesta de emparejamiento por productos',details:[units(sum.proposed)+' de '+units(sum.total)+' ud propuestas',sum.proposalComplete?'Cubre toda la factura':'No cubre toda la factura']};
 if(!sum.complete)return {...base,bucket:'wait',tone:'warning',action:'open',headline:units(sum.pending)+' ud sin respaldo',details:[f.receiptRefs.length?'Esperando recepción o albarán: '+f.receiptRefs.join(', '):'Sin albaranes ni entregas que coincidan']};
 if(price.status==='unverifiable')return {...base,bucket:'decide',tone:'warning',action:'exception',headline:'Cantidades conformes; precio no comprobable',details:['Falta precio en la factura o precio acordado de referencia']};
 return {...base,bucket:'ready',tone:'success',action:'validate',headline:'Cantidades y precios conformes',details:[units(sum.total)+' ud respaldadas por '+f.receiptRefs.join(', ')]};
}
function receiptItem(s:Workspace,r:Receipt):InboxItem{
 const base={key:'receipt:'+r.id,kind:'receipt' as const,id:r.id,reference:r.reference,supplier:r.supplier,date:r.date};
 const received=r.lines.reduce((a,l)=>a.plus(l.received),new Decimal(0)),expected=r.lines.reduce((a,l)=>a.plus(l.expected),new Decimal(0)),order=r.order?['Pedido '+r.order.name]:[];
 if(receiptConforming(s,r))return {...base,bucket:'ready',tone:'success',action:'validate',headline:'Recepción conforme: '+units(received)+' ud',details:[...order,'Coincide con lo esperado']};
 const open=s.issues.filter(i=>i.receiptId===r.id&&!i.resolved).length;
 return {...base,bucket:'decide',tone:'danger',action:'exception',headline:r.status==='exceptions'?'Cerrada con diferencias: '+units(received)+' de '+units(expected)+' ud':'Con incidencias abiertas',details:[...order,...(r.closeReason?[r.closeReason]:[]),...(open?[open+(open===1?' incidencia abierta':' incidencias abiertas')]:[])]};
}
export function inboxItems(s:Workspace):InboxItem[]{
 const order:Record<InboxBucket,number>={decide:0,ready:1,wait:2};
 return [...s.invoices.filter(f=>!f.validation).map(f=>invoiceItem(s,f)),...s.receipts.filter(r=>receiptClosed(r)&&!r.validation).map(r=>receiptItem(s,r))].sort((a,b)=>order[a.bucket]-order[b.bucket]||a.date.localeCompare(b.date)||a.key.localeCompare(b.key));
}
export type ValidatedItem={key:string;kind:'receipt'|'invoice';id:string;reference:string;supplier:string;at:string;by:'human'|'agent';exception:boolean;note?:string};
export function validatedItems(s:Workspace):ValidatedItem[]{
 const of=(kind:'receipt'|'invoice',x:Receipt|Invoice):ValidatedItem=>({key:kind+':'+x.id,kind,id:x.id,reference:x.reference,supplier:x.supplier,at:x.validation!.at,by:x.validation!.by,exception:Boolean(x.validation!.exception),note:x.validation!.note});
 return [...s.invoices.filter(f=>f.validation).map(f=>of('invoice',f)),...s.receipts.filter(r=>r.validation).map(r=>of('receipt',r))].sort((a,b)=>b.at.localeCompare(a.at)||a.key.localeCompare(b.key));
}
/** Lo que requiere atención de una persona ahora mismo (para el contador del menú). */
export const inboxCount=(s:Workspace)=>inboxItems(s).filter(i=>i.bucket!=='wait').length;
