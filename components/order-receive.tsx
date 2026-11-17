'use client';
import {useMemo,useState} from 'react';
import Decimal from 'decimal.js';
import {PackageCheck,AlertTriangle,RefreshCw} from 'lucide-react';
import type {PurchaseOrder} from '@/lib/odoo-data';
import type {Workspace} from '@/lib/types';
import type {Command} from '@/lib/domain';
import {receivableLines} from '@/lib/order-receive';
import {Modal,quantity} from './ui';
const valid=(v:string)=>/^\d{1,9}([.,]\d{1,3})?$/.test(v.trim())&&Number(v.replace(',','.'))>0;
// Abre una recepción en la app contra un pedido de compra de Odoo. Parte de lo que queda por llegar; el operario
// ajusta lo que trae el albarán de esta entrega. No escribe nada en Odoo: eso llegará con la validación.
export default function OrderReceive({order,state,run,demo,onClose,onCreated,onSynced}:{order:PurchaseOrder;state:Workspace;run:(c:Command)=>Promise<boolean>;demo:boolean;onClose:()=>void;onCreated:(orderId:number,reference:string)=>void;onSynced:(w:Workspace)=>void}){
 const rows=useMemo(()=>receivableLines(order,state),[order,state]);
 const [reference,setReference]=useState(''),[date,setDate]=useState(new Date().toISOString().slice(0,10)),[busy,setBusy]=useState(false),[error,setError]=useState(''),[syncing,setSyncing]=useState(false);
 const [qty,setQty]=useState<Record<string,string>>(()=>Object.fromEntries(rows.map(r=>[r.key,Number(r.pending)>0?r.pending.replace('.',','):''])));
 const [lots,setLots]=useState<Record<string,string>>({});
 const unmapped=rows.filter(r=>!r.product),chosen=rows.filter(r=>r.product&&qty[r.key]?.trim()),invalid=chosen.filter(r=>!valid(qty[r.key]));
 const over=chosen.filter(r=>valid(qty[r.key])&&new Decimal(qty[r.key].replace(',','.')).gt(r.pending));
 const total=chosen.filter(r=>valid(qty[r.key])).reduce((a,r)=>a.plus(qty[r.key].replace(',','.')),new Decimal(0));
 const duplicate=state.receipts.some(r=>r.supplier===order.supplier&&r.reference===reference.trim());
 async function sync(){setSyncing(true);setError('');try{const r=await fetch('/api/odoo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'sync'})});const b=await r.json();if(!r.ok)throw new Error(b.error);onSynced(b.workspace);}catch(e){setError(e instanceof Error?e.message:'No se pudo sincronizar el catálogo.');}finally{setSyncing(false);}}
 async function submit(e:React.FormEvent){e.preventDefault();if(busy||!chosen.length||invalid.length||duplicate)return;setBusy(true);setError('');
  const ok=await run({type:'createReceipt',supplier:order.supplier,reference:reference.trim(),date,fileIds:[],order:{id:order.id,name:order.name},lines:chosen.map(r=>({productId:r.product!.id,expected:qty[r.key].trim().replace(',','.'),lot:state.tracking&&r.product!.tracking==='lot'?(lots[r.key]?.trim()||undefined):undefined,price:/^\d{1,9}(\.\d{1,4})?$/.test(r.price)?r.price:undefined,orderLineIds:r.orderLineIds}))});
  setBusy(false);if(ok)onCreated(order.id,reference.trim());else setError('No se ha podido abrir la recepción. Revisa el número de albarán y las cantidades.');}
 return <Modal title={'Recibir pedido '+order.name} onClose={()=>{if(!busy)onClose();}}><form className="form-stack" onSubmit={submit}>
  <div className="wizard-card"><PackageCheck size={20}/><div><strong>{order.supplier}</strong><p className="helper">Indica lo que trae esta entrega según el albarán. Después podrás escanear productos y lotes para comprobarlo.</p></div></div>
  <div className="form-grid"><label>Número de albarán del proveedor<input required autoFocus maxLength={160} value={reference} onChange={e=>setReference(e.target.value)} placeholder="ALB-2026-0150" autoCapitalize="characters" spellCheck={false}/>{duplicate&&<small className="text-danger">Ya existe ese albarán de este proveedor.</small>}</label><label>Fecha del albarán<input type="date" required value={date} onChange={e=>setDate(e.target.value)}/></label></div>
  {unmapped.length>0&&<div className="notice warning"><AlertTriangle size={18}/><div><strong>{unmapped.length===1?'Un producto del pedido no está':unmapped.length+' productos del pedido no están'} en el catálogo de la app</strong><p>{unmapped.map(r=>r.name).join(' · ')}</p>{demo?<p>En la demostración no se sincroniza el catálogo.</p>:<button type="button" className="button secondary small" disabled={syncing} onClick={sync}><RefreshCw size={15} className={syncing?'spin':''}/>{syncing?'Sincronizando…':'Sincronizar catálogo con Odoo'}</button>}</div></div>}
  <div className="receive-lines"><div className="receive-line head"><span>Producto</span><span>Pendiente</span><span>Llega ahora</span></div>
   {rows.map(r=>{const value=qty[r.key]||'',bad=Boolean(value.trim())&&!valid(value),extra=valid(value)&&new Decimal(value.replace(',','.')).gt(r.pending);
    return <div className={'receive-line'+(r.product?'':' off')} key={r.key}><span className="receive-name"><strong>{r.name}</strong><small>Pedido {quantity(r.ordered)}{r.uom?' '+r.uom:''}{Number(r.inApp)>0?' · '+quantity(r.inApp)+' ya en recepciones de la app':''}</small>
      {state.tracking&&r.product?.tracking==='lot'&&<input className="receive-lot" value={lots[r.key]||''} maxLength={40} placeholder="Lote del albarán (opcional)" aria-label={'Lote de '+r.name} onChange={e=>setLots({...lots,[r.key]:e.target.value})}/>}</span>
     <span className="receive-pending">{quantity(r.pending)}</span>
     <span><input className={'receive-qty'+(bad?' bad':extra?' extra':'')} inputMode="decimal" disabled={!r.product} value={value} placeholder="0" aria-label={'Cantidad que llega de '+r.name} onChange={e=>setQty({...qty,[r.key]:e.target.value})}/></span></div>;})}</div>
  <p className="helper">Deja en blanco lo que no venga en esta entrega. {quantity(total.toString())} unidades en {chosen.length} {chosen.length===1?'producto':'productos'}.</p>
  {over.length>0&&<div className="notice warning"><AlertTriangle size={18}/><span>{over.length===1?'Una línea supera':over.length+' líneas superan'} lo pendiente del pedido. Se permite, pero quedará señalado como exceso al validar.</span></div>}
  {error&&<div className="notice error" role="alert">{error}</div>}
  <div className="form-actions"><button className="button primary" disabled={busy||!reference.trim()||!chosen.length||invalid.length>0||duplicate}>{busy?'Abriendo…':'Abrir recepción y empezar a escanear'}</button></div>
 </form></Modal>;
}
