'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {ShoppingCart,PackageCheck,ReceiptText,RefreshCw,Search,ChevronDown,AlertTriangle,CalendarClock,Truck,Link2} from 'lucide-react';
import {demoOdoo,receiptStateLabel,billStateLabel,paymentLabel,type OdooBill,type OdooKind,type OdooReceipt,type PurchaseOrder} from '@/lib/odoo-data';
import {Badge,Empty,quantity} from './ui';
import type {Workspace} from '@/lib/types';
import type {Command} from '@/lib/domain';
import {receiptsForOrder} from '@/lib/order-receive';
import OrderReceive from './order-receive';
// Vistas de solo lectura de lo que ya existe en Odoo: pedidos de compra pendientes de recibir, entradas y
// facturas de proveedor. Conviven con lo registrado en la app; cada fila indica que su origen es Odoo.
type Loaded<T>={items:T[];readAt:string|null;truncated:boolean};
const norm=(s:string)=>s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
const matches=(query:string,...fields:string[])=>{const words=norm(query).split(/\s+/).filter(Boolean),hay=norm(fields.join(' '));return words.every(w=>hay.includes(w));};
const day=(iso:string|null)=>iso?new Date(iso.length===10?iso+'T12:00:00Z':iso).toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric',timeZone:'Europe/Madrid'}):'Sin fecha';
const money=(v:string,currency:string)=>{try{return new Intl.NumberFormat('es-ES',{style:'currency',currency}).format(Number(v));}catch{return Number(v).toFixed(2)+' '+currency;}};
/** Días naturales hasta la fecha (negativo = ya pasó), en horario de Madrid. */
export function daysUntil(iso:string|null,now=new Date()):number|null{if(!iso)return null;const ymd=(d:Date)=>d.toLocaleDateString('en-CA',{timeZone:'Europe/Madrid'});const a=Date.parse(ymd(new Date(iso.length===10?iso+'T12:00:00Z':iso))+'T00:00:00Z'),b=Date.parse(ymd(now)+'T00:00:00Z');return Math.round((a-b)/86400000);}
function useOdoo<T>(kind:OdooKind,demo:boolean,enabled:boolean){
 const [data,setData]=useState<Loaded<T>|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const load=useCallback(async(refresh=false)=>{
  if(demo){setData({items:demoOdoo()[kind] as unknown as T[],readAt:null,truncated:false});return;}
  if(!enabled)return;setLoading(true);setError('');
  try{const r=await fetch('/api/odoo/data?kind='+kind+(refresh?'&refresh=1':''));const b=await r.json();if(!r.ok)throw new Error(b.error);setData({items:b.items,readAt:b.readAt,truncated:b.truncated});}
  catch(e){setError(e instanceof Error?e.message:'No se pudo leer de Odoo.');}finally{setLoading(false);}
 },[kind,demo,enabled]);
 useEffect(()=>{void load();},[load]);
 return {data,loading,error,reload:()=>load(true)};
}
export function Segmented<T extends string>({value,onChange,options,label}:{value:T;onChange:(v:T)=>void;options:{id:T;label:string;icon?:React.ReactNode;count?:number}[];label:string}){
 return <div className="segmented" role="tablist" aria-label={label}>{options.map(o=><button key={o.id} type="button" role="tab" aria-selected={value===o.id} className={'segment'+(value===o.id?' active':'')} onClick={()=>onChange(o.id)}>{o.icon}<span>{o.label}</span>{o.count!==undefined&&<b>{o.count}</b>}</button>)}</div>;
}
function Frame({demo,connected,onConnect,loading,error,readAt,truncated,reload,empty,children,toolbar}:{demo:boolean;connected:boolean;onConnect:()=>void;loading:boolean;error:string;readAt:string|null|undefined;truncated:boolean|undefined;reload:()=>void;empty:boolean;children:React.ReactNode;toolbar:React.ReactNode}){
 if(!demo&&!connected)return <section className="panel"><div className="empty"><Link2 size={32}/><h3>Conecta Odoo para ver esta información</h3><p>La app leerá los pedidos de compra pendientes, las entradas y las facturas de proveedor. Solo lectura.</p><button className="button primary" onClick={onConnect}>Conectar con Odoo</button></div></section>;
 return <section className="panel odoo-panel">
  <div className="odoo-toolbar">{toolbar}<div className="odoo-meta"><span className="chip odoo">{demo?'Ejemplo':'Odoo'}</span>{!demo&&<><small>{loading?'Leyendo de Odoo…':readAt?'Leído a las '+new Date(readAt).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Madrid'}):''}</small><button type="button" className="icon-button" onClick={reload} disabled={loading} aria-label="Volver a leer de Odoo" title="Actualizar"><RefreshCw size={17} className={loading?'spin':''}/></button></>}</div></div>
  {error&&<div className="notice error" role="alert" style={{margin:'0 18px 14px'}}><AlertTriangle size={18}/><span>{error}</span></div>}
  {truncated&&<p className="odoo-note">Hay más registros en Odoo de los que se muestran. Usa el buscador o consulta el resto en Odoo.</p>}
  {loading&&empty?<div className="odoo-skeleton" aria-hidden="true"><span/><span/><span/></div>:children}
 </section>;
}
type ViewProps={demo:boolean;connected:boolean;onConnect:()=>void};
function Toolbar({query,setQuery,placeholder,filters,filter,setFilter}:{query:string;setQuery:(v:string)=>void;placeholder:string;filters:{id:string;label:string;count:number}[];filter:string;setFilter:(v:string)=>void}){
 return <><div className="odoo-filters" role="tablist">{filters.map(f=><button key={f.id} type="button" role="tab" aria-selected={filter===f.id} className={'pill-filter'+(filter===f.id?' active':'')} onClick={()=>setFilter(f.id)}>{f.label}<b>{f.count}</b></button>)}</div><label className="search-box odoo-search"><Search size={17}/><input type="search" placeholder={placeholder} value={query} onChange={e=>setQuery(e.target.value)} aria-label={placeholder}/></label></>;
}
type OrderProps=ViewProps&{state:Workspace;run:(c:Command)=>Promise<boolean>;onOpenReceipt:(id:string)=>void;onCreated:(orderId:number,reference:string)=>void;onSynced:(w:Workspace)=>void};
export function OdooOrders(p:OrderProps){const [receiving,setReceiving]=useState<PurchaseOrder|null>(null);
 const {data,loading,error,reload}=useOdoo<PurchaseOrder>('orders',p.demo,p.connected),[query,setQuery]=useState(''),[filter,setFilter]=useState('all');
 const items=data?.items||[];const late=(o:PurchaseOrder)=>(daysUntil(o.planned)??1)<0;
 const shown=useMemo(()=>items.filter(o=>(filter==='all'||(filter==='late'?late(o):o.receiptStatus==='partial'))&&matches(query,o.name,o.supplier,o.supplierRef,...o.lines.map(l=>l.product))),[items,query,filter]);
 const units=items.reduce((a,o)=>a+Number(o.pending),0);
 return <>
  <div className="metrics odoo-metrics"><div className="metric"><div className="spread"><span>Pedidos por recibir</span><span className="metric-icon blue"><ShoppingCart size={20}/></span></div><strong>{String(items.length).padStart(2,'0')}</strong><small>Confirmados en Odoo</small></div><div className="metric"><div className="spread"><span>Unidades por llegar</span><span className="metric-icon teal"><Truck size={20}/></span></div><strong>{quantity(units)}</strong><small>Pendientes de entrada</small></div><div className="metric"><div className="spread"><span>Con retraso</span><span className="metric-icon amber"><CalendarClock size={20}/></span></div><strong>{String(items.filter(late).length).padStart(2,'0')}</strong><small>Fecha prevista superada</small></div></div>
  <Frame demo={p.demo} connected={p.connected} onConnect={p.onConnect} loading={loading} error={error} readAt={data?.readAt} truncated={data?.truncated} reload={reload} empty={!items.length} toolbar={<Toolbar query={query} setQuery={setQuery} placeholder="Buscar pedido, proveedor o producto…" filter={filter} setFilter={setFilter} filters={[{id:'all',label:'Todos',count:items.length},{id:'late',label:'Con retraso',count:items.filter(late).length},{id:'partial',label:'Recibidos en parte',count:items.filter(o=>o.receiptStatus==='partial').length}]}/>}>
   <div className="odoo-list">{shown.map(o=>{const days=daysUntil(o.planned),pct=Number(o.ordered)>0?Math.min(100,Number(o.received)/Number(o.ordered)*100):0;
    const mine=receiptsForOrder(p.state,o.id),active=mine.filter(r=>r.status==='open'||r.status==='partial');
    return <details className="odoo-row order" key={o.id}><summary>
      <span className={'receipt-icon'+(o.receiptStatus==='partial'?' done':'')}><ShoppingCart size={20}/></span>
      <span className="odoo-main"><strong>{o.name}{active.length>0&&<span className="chip app">En recepción</span>}</strong><small>{o.supplier}{o.supplierRef?' · ref. '+o.supplierRef:''}</small></span>
      <span className="odoo-when"><span>{day(o.planned)}</span>{days!==null&&<small className={days<0?'text-danger':days===0?'text-warning':'muted'}>{days<0?`Retraso de ${-days} ${days===-1?'día':'días'}`:days===0?'Previsto hoy':`En ${days} ${days===1?'día':'días'}`}</small>}</span>
      <span className="odoo-progress"><span><b>{quantity(o.received)}</b> / {quantity(o.ordered)}</span><span className="mini-track"><span style={{width:pct+'%'}}/></span></span>
      <span className="odoo-amount">{money(o.total,o.currency)}</span>
      <ChevronDown size={18} className="odoo-chevron"/></summary>
     <div className="odoo-detail"><div className="odoo-lines" role="table"><div className="odoo-line head" role="row"><span>Producto</span><span>Pedido</span><span>Recibido</span><span>Pendiente</span><span>Precio</span></div>
      {o.lines.map(l=><div className="odoo-line" role="row" key={l.id}><span><strong>{l.product}</strong></span><span>{quantity(l.ordered)}</span><span>{quantity(l.received)}</span><span className={Number(l.pending)>0?'pending':'ok'}>{Number(l.pending)>0?quantity(l.pending):'Completo'}</span><span>{money(l.price,o.currency)}</span></div>)}</div>
      {mine.length>0&&<div className="order-receipts">{mine.map(r=><button type="button" className="order-receipt" key={r.id} onClick={()=>p.onOpenReceipt(r.id)}><PackageCheck size={16}/><span><strong>{r.reference}</strong><small>{r.status==='open'?'En recepción':r.status==='partial'?'Parcial · resto pendiente':r.status==='confirmed'?'Confirmada en la app':'Cerrada con diferencias'}</small></span><span className="order-receipt-go">Abrir</span></button>)}</div>}
      <div className="order-actions"><p className="helper">Pedido del {day(o.date)}. La entrada se registrará en Odoo cuando se valide; por ahora queda en la app.</p><button type="button" className="button primary" onClick={()=>setReceiving(o)}><PackageCheck size={17}/>{mine.length?'Recibir otra entrega':'Recibir este pedido'}</button></div></div></details>;})}
    {data&&!shown.length&&<Empty title={items.length?'Ningún pedido coincide':'No hay pedidos pendientes de recibir'} description={items.length?'Prueba con otra búsqueda o cambia el filtro.':'Cuando confirmes un pedido de compra en Odoo aparecerá aquí.'}/>}</div>
  </Frame>
  {receiving&&<OrderReceive order={receiving} state={p.state} run={p.run} demo={p.demo} onClose={()=>setReceiving(null)} onSynced={p.onSynced} onCreated={(id,ref)=>{setReceiving(null);p.onCreated(id,ref);}}/>}</>;
}
export function OdooReceipts(p:ViewProps){
 const {data,loading,error,reload}=useOdoo<OdooReceipt>('receipts',p.demo,p.connected),[query,setQuery]=useState(''),[filter,setFilter]=useState('all');
 const items=data?.items||[],shown=items.filter(r=>(filter==='all'||(filter==='done'?r.state==='done':r.state!=='done'))&&matches(query,r.name,r.supplier,r.origin));
 return <Frame {...p} loading={loading} error={error} readAt={data?.readAt} truncated={data?.truncated} reload={reload} empty={!items.length} toolbar={<Toolbar query={query} setQuery={setQuery} placeholder="Buscar entrada, proveedor o pedido…" filter={filter} setFilter={setFilter} filters={[{id:'all',label:'Todas',count:items.length},{id:'open',label:'Por hacer',count:items.filter(r=>r.state!=='done').length},{id:'done',label:'Hechas',count:items.filter(r=>r.state==='done').length}]}/>}>
  <div className="odoo-list">{shown.map(r=><div className="odoo-row flat" key={r.id}>
   <span className={'receipt-icon'+(r.state==='done'?' done':'')}><PackageCheck size={20}/></span>
   <span className="odoo-main"><strong>{r.name}</strong><small>{r.supplier||'Sin proveedor'}</small></span>
   <span className="odoo-origin">{r.origin&&<span className="chip">Pedido {r.origin}</span>}</span>
   <span className="odoo-when"><span>{day(r.done||r.scheduled)}</span><small className="muted">{r.done?'Validada':'Prevista'}</small></span>
   <Badge kind={r.state==='done'?'success':r.state==='assigned'?'warning':'neutral'}>{receiptStateLabel[r.state]||r.state}</Badge></div>)}
   {data&&!shown.length&&<Empty title={items.length?'Ninguna entrada coincide':'No hay entradas de proveedor en Odoo'} description={items.length?'Prueba con otra búsqueda o cambia el filtro.':'Las recepciones validadas en Odoo aparecerán aquí.'}/>}</div>
 </Frame>;
}
export function OdooBills(p:ViewProps){
 const {data,loading,error,reload}=useOdoo<OdooBill>('bills',p.demo,p.connected),[query,setQuery]=useState(''),[filter,setFilter]=useState('all');
 const items=data?.items||[],shown=items.filter(b=>(filter==='all'||(filter==='draft'?b.state==='draft':filter==='refund'?b.type==='refund':b.state==='posted'))&&matches(query,b.name,b.ref,b.supplier,b.origin));
 return <Frame {...p} loading={loading} error={error} readAt={data?.readAt} truncated={data?.truncated} reload={reload} empty={!items.length} toolbar={<Toolbar query={query} setQuery={setQuery} placeholder="Buscar factura, proveedor o pedido…" filter={filter} setFilter={setFilter} filters={[{id:'all',label:'Todas',count:items.length},{id:'draft',label:'En borrador',count:items.filter(b=>b.state==='draft').length},{id:'posted',label:'Publicadas',count:items.filter(b=>b.state==='posted').length},{id:'refund',label:'Abonos',count:items.filter(b=>b.type==='refund').length}]}/>}>
  <div className="odoo-list">{shown.map(b=><div className="odoo-row flat" key={b.id}>
   <span className={'receipt-icon'+(b.state==='posted'?' done':'')}><ReceiptText size={20}/></span>
   <span className="odoo-main"><strong>{b.ref||b.name||'Sin número'}{b.type==='refund'&&<span className="chip refund">Abono</span>}</strong><small>{b.supplier}{b.name&&b.ref?' · '+b.name:''}</small></span>
   <span className="odoo-origin">{b.origin&&<span className="chip">Pedido {b.origin}</span>}</span>
   <span className="odoo-when"><span>{day(b.date)}</span><small className="muted">{b.state==='posted'?(paymentLabel[b.paymentState]||b.paymentState):'Sin contabilizar'}</small></span>
   <span className="odoo-amount">{money(b.total,b.currency)}</span>
   <Badge kind={b.state==='posted'?'success':'warning'}>{billStateLabel[b.state]||b.state}</Badge></div>)}
   {data&&!shown.length&&<Empty title={items.length?'Ninguna factura coincide':'No hay facturas de proveedor en Odoo'} description={items.length?'Prueba con otra búsqueda o cambia el filtro.':'Las facturas registradas en Odoo aparecerán aquí.'}/>}</div>
 </Frame>;
}
