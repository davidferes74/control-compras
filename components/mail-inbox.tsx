'use client';
import {useState} from 'react';
import {FileText,Download,ScanText,CheckCircle2,Copy,Ban,AlertTriangle,ChevronDown} from 'lucide-react';
export type MailReading={type:string;supplier:string|null;reference:string|null;lines:number;warnings:number};
export type MailInboxItem={id:string;sender:string;subject:string;received_at:string|null;filename:string;status:string;detail:string;downloadable:boolean;read_state?:string|null;reading?:MailReading|null};
const typeName:Record<string,string>={invoice:'Factura',delivery_note:'Albarán',credit_note:'Abono',other:'Otro documento',unknown:'Tipo desconocido'};
// Resumen de la lectura automática: qué es, de quién y si quedó alguna duda.
function ReadingChip({item}:{item:MailInboxItem}){if(item.read_state==='error')return <span className="inbox-reading bad">No se pudo leer automáticamente</span>;const r=item.reading;if(!r)return null;
 if(r.type!=='invoice')return <span className="inbox-reading warn">Leído: {typeName[r.type]||r.type}, no es una factura</span>;
 return <span className={'inbox-reading'+(r.warnings?' warn':'')}>Leída: {r.reference||'sin número'}{r.supplier?' · '+r.supplier:''} · {r.lines} {r.lines===1?'línea':'líneas'}{r.warnings?' · con advertencias':''}</span>;}
type Filter='pending'|'registered'|'discarded';
const discarded=(s:string)=>s==='excluded'||s==='duplicate'||s==='error';
const reason:Record<string,{label:string;icon:React.ReactNode}>={excluded:{label:'Excluido',icon:<Ban size={13}/>},duplicate:{label:'Duplicado',icon:<Copy size={13}/>},error:{label:'Error',icon:<AlertTriangle size={13}/>}};
const when=(d:string|null)=>d?new Date(d).toLocaleDateString('es-ES',{day:'2-digit',month:'short',timeZone:'Europe/Madrid'}):'';
const senderName=(s:string)=>s.replace(/<[^>]*>/g,'').replace(/"/g,'').trim()||s;
// Bandeja compacta: pendientes y registradas en filas de una línea; descartados en fichas pequeñas desplegables.
export default function MailInbox({items,busy,onRead}:{items:MailInboxItem[];busy:boolean;onRead:(item:MailInboxItem)=>void}){
 const groups={pending:items.filter(i=>i.status==='received'),registered:items.filter(i=>i.status==='registered'),discarded:items.filter(i=>discarded(i.status))};
 const [filter,setFilter]=useState<Filter>('pending');
 const tabs:[Filter,string][]=[['pending','Por revisar'],['registered','Registradas'],['discarded','Descartados']];
 return <div className="inbox">
  <div className="inbox-tabs" role="tablist">{tabs.map(([id,label])=><button key={id} type="button" role="tab" aria-selected={filter===id} className={'inbox-tab'+(filter===id?' active':'')} onClick={()=>setFilter(id)}>{label}<span>{groups[id].length}</span></button>)}</div>
  {filter!=='discarded'&&<div className="inbox-list">{groups[filter].map(item=><div className="inbox-row" key={item.id}>
   <span className={'inbox-icon'+(item.status==='registered'?' done':'')}>{item.status==='registered'?<CheckCircle2 size={18}/>:<FileText size={18}/>}</span>
   <div className="inbox-main"><strong title={item.filename}>{item.filename}</strong><small title={item.sender+' · '+item.subject}>{senderName(item.sender)} · {item.subject}</small><ReadingChip item={item}/></div>
   <span className="inbox-date">{when(item.received_at)}</span>
   {item.downloadable&&<div className="inbox-actions"><a className="icon-button" href={'/api/mail/items/'+item.id} aria-label={'Descargar original de '+item.filename} title="Descargar original"><Download size={17}/></a>{item.status!=='registered'&&<button type="button" className="button primary small" disabled={busy} onClick={()=>onRead(item)}><ScanText size={15}/>{item.reading?'Revisar':'Leer'}</button>}</div>}
  </div>)}{!groups[filter].length&&<p className="inbox-empty">{filter==='pending'?'Nada pendiente de revisar.':'Todavía no hay facturas registradas desde el correo.'}</p>}</div>}
  {filter==='discarded'&&<div className="ticket-grid">{groups.discarded.map(item=><details className={'ticket '+item.status} key={item.id}>
   <summary><span className="ticket-tag">{reason[item.status]?.icon}{reason[item.status]?.label}</span><strong title={item.filename}>{item.filename}</strong><ChevronDown size={15}/></summary>
   <div className="ticket-body"><p>{item.detail||'Sin detalle.'}</p><small>{senderName(item.sender)}{item.received_at?' · '+when(item.received_at):''}</small><small>{item.subject}</small></div>
  </details>)}{!groups.discarded.length&&<p className="inbox-empty">Ningún correo descartado.</p>}</div>}
 </div>;
}
export const demoMailItems:MailInboxItem[]=[
 {id:'d1',sender:'Facturación Arroces del Sur <facturas@example.test>',subject:'Factura F-2026-0312',received_at:'2026-11-16T09:12:00Z',filename:'F-2026-0312.pdf',status:'received',detail:'',downloadable:false,read_state:'read',reading:{type:'invoice',supplier:'Arroces del Sur',reference:'F-2026-0312',lines:2,warnings:0}},
 {id:'d2',sender:'Aceites Mediterráneo <admin@example.test>',subject:'Factura noviembre',received_at:'2026-11-15T16:40:00Z',filename:'factura-1187.pdf',status:'received',detail:'',downloadable:false,read_state:'read',reading:{type:'delivery_note',supplier:'Aceites Mediterráneo',reference:'ALB-1187',lines:3,warnings:0}},
 {id:'d3',sender:'Arroces del Sur <facturas@example.test>',subject:'Factura F-2026-0298',received_at:'2026-11-12T08:05:00Z',filename:'F-2026-0298.pdf',status:'registered',detail:'',downloadable:false},
 {id:'d4',sender:'Aceites Mediterráneo <admin@example.test>',subject:'RV: Factura noviembre',received_at:'2026-11-15T17:02:00Z',filename:'factura-1187.pdf',status:'duplicate',detail:'Archivo idéntico ya capturado.',downloadable:false},
 {id:'d5',sender:'Transportes Rías <info@example.test>',subject:'Seguimiento de envío',received_at:'2026-11-14T11:20:00Z',filename:'Sin adjuntos',status:'excluded',detail:'No se descargan enlaces del cuerpo del correo.',downloadable:false},
 {id:'d6',sender:'Arroces del Sur <facturas@example.test>',subject:'Factura F-2026-0312',received_at:'2026-11-16T09:12:00Z',filename:'logo-firma.png',status:'excluded',detail:'Imagen incrustada: revisar en el correo si contiene una factura.',downloadable:false},
 {id:'d7',sender:'Envases Norte <ventas@example.test>',subject:'Tarifa 2027',received_at:'2026-11-13T10:00:00Z',filename:'tarifa-2027.xlsx',status:'excluded',detail:'Formato no admitido. Solo PDF, JPG, PNG y WebP.',downloadable:false},
 {id:'d8',sender:'Envases Norte <ventas@example.test>',subject:'Factura 5521',received_at:'2026-11-10T07:45:00Z',filename:'Correo no procesado',status:'error',detail:'No se pudo interpretar este correo. Revísalo en el buzón y sube sus adjuntos manualmente.',downloadable:false},
];
