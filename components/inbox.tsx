'use client';
import {useMemo,useState} from 'react';
import {FileText,Package,CheckCircle2,AlertTriangle,Sparkles,Clock3,Bot,UserRound,Undo2,ChevronRight,ShieldCheck} from 'lucide-react';
import type {Workspace} from '@/lib/types';
import type {Command} from '@/lib/domain';
import {inboxItems,validatedItems,type InboxBucket,type InboxItem} from '@/lib/inbox';
import {Badge,Empty,Modal,PageTitle,date} from './ui';
import {Segmented} from './odoo-views';
// Bandeja de validación: una sola pantalla con lo que espera una decisión. Lo conforme se valida de un toque
// (o lo valida el agente si tiene permiso); lo dudoso se abre para revisarlo o se valida como excepción con motivo.
const bucketTitle:Record<InboxBucket,{title:string;hint:string}>={decide:{title:'Requieren tu decisión',hint:'Hay algo que no cuadra o que solo una persona puede dar por bueno.'},ready:{title:'Listo para validar',hint:'Todo coincide. Un toque basta.'},wait:{title:'En espera',hint:'Aún faltan entregas o documentos; no hay nada que decidir.'}};
const when=(iso:string)=>new Date(iso).toLocaleString('es-ES',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Madrid'});
export default function Inbox({state,run,onOpen,onSettings}:{state:Workspace;run:(c:Command)=>Promise<boolean>;onOpen:(kind:'receipt'|'invoice',id:string)=>void;onSettings:()=>void}){
 const items=useMemo(()=>inboxItems(state),[state]),done=useMemo(()=>validatedItems(state),[state]);
 const [view,setView]=useState<'pending'|'done'>('pending'),[busy,setBusy]=useState(false),[exception,setException]=useState<InboxItem|null>(null),[note,setNote]=useState('');
 const count=(b:InboxBucket)=>items.filter(i=>i.bucket===b).length,ready=items.filter(i=>i.bucket==='ready');
 const granted=state.agent?Object.entries(state.agent).filter(([k,v])=>v&&k!=='allowUnverifiedPrice').length:0;
 const agentLog=state.audit.filter(a=>a.by==='agent').slice(0,5);
 const act=async(c:Command)=>{if(busy)return false;setBusy(true);const ok=await run(c);setBusy(false);return ok;};
 const validateAll=async()=>{if(busy)return;setBusy(true);for(const i of ready){if(!(await run({type:'validate',kind:i.kind,id:i.id})))break;}setBusy(false);};
 const icon=(i:{kind:'receipt'|'invoice'})=>i.kind==='invoice'?<FileText size={20}/>:<Package size={20}/>;
 return <>
  <PageTitle eyebrow="VALIDACIÓN" title="Tú decides. Lo demás ya está hecho." description="Recepciones y facturas ya comprobadas, a falta de tu visto bueno."/>
  <div className="metrics inbox-metrics">
   <div className={'metric'+(count('decide')?' attention':'')}><div className="spread"><span>Requieren tu decisión</span><span className="metric-icon amber"><AlertTriangle size={20}/></span></div><strong>{String(count('decide')).padStart(2,'0')}</strong><small>Diferencias, precios o propuestas</small></div>
   <div className="metric"><div className="spread"><span>Listas para validar</span><span className="metric-icon green"><CheckCircle2 size={20}/></span></div><strong>{String(count('ready')).padStart(2,'0')}</strong><small>Todo coincide</small></div>
   <div className="metric"><div className="spread"><span>En espera</span><span className="metric-icon blue"><Clock3 size={20}/></span></div><strong>{String(count('wait')).padStart(2,'0')}</strong><small>Faltan entregas o documentos</small></div>
   <button type="button" className="metric agent-tile" onClick={onSettings}><div className="spread"><span>Agente</span><span className="metric-icon blue"><Bot size={20}/></span></div><strong>{granted?granted+(granted===1?' permiso':' permisos'):'Solo propone'}</strong><small>{granted?'Valida por su cuenta lo autorizado':'Todo pasa por ti'} · Cambiar</small></button>
  </div>
  <Segmented label="Estado" value={view} onChange={setView} options={[{id:'pending',label:'Pendiente',count:items.length},{id:'done',label:'Validado',count:done.length}]}/>
  {view==='pending'?<>
   {(['decide','ready','wait'] as InboxBucket[]).map(b=>{const rows=items.filter(i=>i.bucket===b);if(!rows.length)return null;return <section className={'panel inbox-section '+b} key={b}>
    <div className="inbox-head"><div><h2>{bucketTitle[b].title}<span className="inbox-count">{rows.length}</span></h2><p>{bucketTitle[b].hint}</p></div>{b==='ready'&&rows.length>1&&<button type="button" className="button primary" disabled={busy} onClick={validateAll}><CheckCircle2 size={17}/>Validar las {rows.length}</button>}</div>
    {rows.map(i=><div className="inbox-item" key={i.key}>
     <button type="button" className="inbox-open" onClick={()=>onOpen(i.kind,i.id)} aria-label={'Abrir '+i.reference}><span className={'receipt-icon '+i.tone}>{icon(i)}</span><span className="inbox-text"><strong>{i.reference}<span className="chip">{i.kind==='invoice'?'Factura':'Recepción'}</span></strong><small>{i.supplier} · {date(i.date)}</small></span>
      <span className="inbox-status"><span className={'inbox-headline '+i.tone}>{i.tone==='success'?<CheckCircle2 size={15}/>:i.tone==='info'?<Sparkles size={15}/>:i.tone==='danger'?<AlertTriangle size={15}/>:<Clock3 size={15}/>}{i.headline}</span><small>{i.details.join(' · ')}</small></span></button>
     <div className="inbox-actions">
      {i.action==='validate'&&<button type="button" className="button primary small" disabled={busy} onClick={()=>void act({type:'validate',kind:i.kind,id:i.id})}><CheckCircle2 size={15}/>Validar</button>}
      {i.action==='accept'&&<button type="button" className="button primary small" disabled={busy} onClick={()=>void act({type:'acceptMatch',invoiceId:i.id})}><Sparkles size={15}/>Aceptar propuesta</button>}
      {i.action==='exception'&&<button type="button" className="button secondary small" disabled={busy} onClick={()=>{setNote('');setException(i);}}>Validar con excepción</button>}
      <button type="button" className="icon-button" onClick={()=>onOpen(i.kind,i.id)} aria-label={'Ver detalle de '+i.reference} title="Ver detalle"><ChevronRight size={18}/></button>
     </div></div>)}
   </section>;})}
   {!items.length&&<section className="panel"><Empty title="Nada pendiente de validar" description="Cuando se cierre una recepción o llegue una factura, aparecerá aquí."/></section>}
   {agentLog.length>0&&<section className="panel inbox-section"><div className="inbox-head"><div><h2><Bot size={18}/> Hecho por el agente</h2><p>Lo último que ha resuelto por su cuenta, con los permisos que le has dado.</p></div></div>{agentLog.map(a=><div className="agent-row" key={a.id}><span className="timeline-dot"/><span>{a.message.replace(/^Agente · /,'')}</span><small>{when(a.at)}</small></div>)}</section>}
  </>:<section className="panel inbox-section">
   {done.map(v=><div className="inbox-item" key={v.key}>
    <button type="button" className="inbox-open" onClick={()=>onOpen(v.kind,v.id)}><span className="receipt-icon success">{icon(v)}</span><span className="inbox-text"><strong>{v.reference}<span className="chip">{v.kind==='invoice'?'Factura':'Recepción'}</span>{v.exception&&<span className="chip refund">Excepción</span>}</strong><small>{v.supplier}{v.note?' · '+v.note:''}</small></span>
     <span className="inbox-status"><span className="inbox-headline success">{v.by==='agent'?<Bot size={15}/>:<UserRound size={15}/>}{v.by==='agent'?'Validado por el agente':'Validado por una persona'}</span><small>{when(v.at)}</small></span></button>
    <div className="inbox-actions"><button type="button" className="button secondary small" disabled={busy} onClick={()=>void act({type:'unvalidate',kind:v.kind,id:v.id})}><Undo2 size={15}/>Deshacer</button></div></div>)}
   {!done.length&&<Empty title="Todavía no hay nada validado" description="Lo que valides tú o el agente quedará aquí, con quién y cuándo."/>}
  </section>}
  {exception&&<Modal title={'Validar '+exception.reference+' con excepción'} onClose={()=>{if(!busy)setException(null);}}><div className="form-stack">
   <div className="wizard-card warn"><AlertTriangle size={20}/><div><strong>{exception.headline}</strong>{exception.details.map(d=><p key={d}>{d}</p>)}<p className="helper">La diferencia no se borra: queda registrada junto a tu motivo.</p></div></div>
   <label>Motivo<textarea autoFocus value={note} maxLength={400} onChange={e=>setNote(e.target.value)} placeholder="Ej. Precio actualizado por el proveedor y aceptado por Compras"/></label>
   <div className="wizard-nav"><button type="button" className="button secondary" disabled={busy} onClick={()=>{const i=exception;setException(null);onOpen(i.kind,i.id);}}>Revisar el detalle</button><button type="button" className="button primary" disabled={busy||!note.trim()} onClick={async()=>{if(await act({type:'validate',kind:exception.kind,id:exception.id,note:note.trim()}))setException(null);}}><ShieldCheck size={17}/>Validar con este motivo</button></div>
  </div></Modal>}
 </>;
}
