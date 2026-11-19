'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Inbox,FileText,Truck,AlertTriangle,History,Settings2,Archive,Sparkles,Upload,Camera,Plus,Search,LogOut,Mail,FileCheck2,Loader2,ChevronRight,RefreshCw} from 'lucide-react';
import {api,money,date,dateTime,kindLabel,isArchived,setNavList,type AppState,type ListItem,type Kind} from './lib';
import DocumentView from './document-view';
import SettingsView from './settings';
import Sheet from './sheet';
import {go,StatusBadge,ClassBadge,PageHead,Empty,ThemePicker} from './ui';

type View='bandeja'|'facturas'|'albaranes'|'diferencias'|'descartados'|'historico'|'ajustes'|'doc';
const nav:{id:Exclude<View,'doc'>;label:string;icon:typeof Inbox}[]=[{id:'bandeja',label:'Bandeja',icon:Inbox},{id:'facturas',label:'Facturas',icon:FileText},{id:'albaranes',label:'Albaranes',icon:Truck},{id:'diferencias',label:'Diferencias',icon:AlertTriangle},{id:'descartados',label:'Descartados',icon:Archive},{id:'historico',label:'Histórico',icon:History},{id:'ajustes',label:'Ajustes',icon:Settings2}];
function readHash():{view:View;id?:string}{const h=typeof window==='undefined'?'':window.location.hash.slice(1);const [v,id]=h.split('/');if(v==='doc'&&id)return {view:'doc',id};return {view:(nav.some(n=>n.id===v)?v:'bandeja') as View};}


export default function App({initialAuthed,user}:{initialAuthed:boolean;user:string}){
 const [authed,setAuthed]=useState(initialAuthed),[state,setState]=useState<AppState|null>(null),[route,setRoute]=useState<{view:View;id?:string}>({view:'bandeja'}),[error,setError]=useState(''),[mobile,setMobile]=useState(false),lastView=useRef<Exclude<View,'doc'>>('bandeja');
 const load=useCallback(async()=>{try{setState(await api<AppState>('/api/state'));setError('');}catch(e){const err=e as Error&{status?:number};if(err.status===401)setAuthed(false);else setError(err.message);}},[]);
 // En el móvil el documento se abre como hoja sobre la lista: no se vuelve arriba al abrirlo.
 useEffect(()=>{const mq=window.matchMedia('(max-width: 860px)');const set=()=>setMobile(mq.matches);set();mq.addEventListener('change',set);return()=>mq.removeEventListener('change',set);},[]);
 useEffect(()=>{const on=()=>{const next=readHash();setRoute(next);if(next.view!=='doc'||!window.matchMedia('(max-width: 860px)').matches)window.scrollTo(0,0);};on();window.addEventListener('hashchange',on);return()=>window.removeEventListener('hashchange',on);},[]);
 useEffect(()=>{if(authed)load();},[authed,load]);
 async function logout(){await api('/api/session',{method:'DELETE'}).catch(()=>{});setAuthed(false);setState(null);}
 if(!authed)return <Login user={user} onDone={()=>setAuthed(true)}/>;
 const all=state?.documents||[],docs=all.filter(d=>!isArchived(d)),discarded=all.filter(isArchived),drafts=docs.filter(d=>d.status==='draft'),openInvoices=docs.filter(d=>d.status==='confirmed'&&d.kind==='invoice'&&d.issues.length);
 const count=(id:View)=>id==='bandeja'?drafts.length:id==='diferencias'?openInvoices.length:0;
 if(route.view!=='doc')lastView.current=route.view;
 const active=route.view==='doc'?(mobile?lastView.current:null):route.view;
 const sheetDoc=mobile&&route.view==='doc'&&route.id?route.id:null,shown=sheetDoc?lastView.current:route.view;
 return <div className="shell">
  <aside className="sidebar"><div className="brand"><span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 28 28" width="20" height="20"><path d="M3 9h22M3 19h22" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/><path d="M9 4v20M19 4v20" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" opacity=".45"/></svg></span><span>Control de compras<small>SENTIDIÑO</small></span></div>
   <nav aria-label="Secciones">{nav.map(n=><a key={n.id} href={'#'+n.id} className={'nav-item'+(active===n.id?' active':'')} aria-current={active===n.id?'page':undefined}><n.icon size={18}/><span>{n.label}</span>{count(n.id)>0&&<span className="nav-count">{count(n.id)}</span>}</a>)}</nav>
   <div className="sidebar-foot"><ThemePicker compact/><button className="ghost" onClick={logout}><LogOut size={16}/>Cerrar sesión</button></div></aside>
  <main className="main">
   {error&&<div className="alert danger" role="alert">{error} <button className="link" onClick={load}>Reintentar</button></div>}
   {!state?<div className="loading"><Loader2 className="spin" size={22}/>Cargando…</div>:
    shown==='doc'&&route.id?<DocumentView key={route.id} id={route.id} onChanged={load}/>:
    shown==='bandeja'?<InboxView state={state} reload={load}/>:
    shown==='facturas'?<ListView kind="invoice" items={docs} />:
    shown==='albaranes'?<ListView kind="delivery_note" items={docs}/>:
    shown==='diferencias'?<IssuesView items={openInvoices}/>:
    shown==='descartados'?<DiscardedView items={discarded} reload={load}/>:
    shown==='historico'?<HistoryView/>:
    <SettingsView state={state} reload={load}/>}
  </main>
  {sheetDoc&&state&&<Sheet key={sheetDoc} label="Documento" onClose={()=>go(lastView.current)}><DocumentView id={sheetDoc} onChanged={load}/></Sheet>}
  <nav className="tabbar" aria-label="Secciones">{nav.filter(n=>n.id!=='historico'&&n.id!=='descartados').map(n=><a key={n.id} href={'#'+n.id} className={active===n.id?'active':''}><n.icon size={20}/><span>{n.label}</span>{count(n.id)>0&&<i>{count(n.id)}</i>}</a>)}</nav>
 </div>;
}

function Login({user,onDone}:{user:string;onDone:()=>void}){const [u,setU]=useState(user),[p,setP]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{await api('/api/session',{method:'POST',body:JSON.stringify({username:u,password:p})});onDone();}catch(err){setError((err as Error).message);}finally{setBusy(false);}}
 return <main className="setup"><form className="setup-card login" onSubmit={submit}><p className="eyebrow">SENTIDIÑO</p><h1>Control de compras</h1><p className="muted">Facturas de proveedor frente a albaranes: qué cuadra y qué no.</p>
  <label>Usuario<input autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={u} onChange={e=>setU(e.target.value)} required/></label><label>Contraseña<input type="password" autoComplete="current-password" enterKeyHint="go" value={p} onChange={e=>setP(e.target.value)} required autoFocus/></label>
  {error&&<p className="field-error" role="alert">{error}</p>}<button className="btn primary" disabled={busy}>{busy?'Entrando…':'Entrar'}</button></form></main>;}


type Upload={name:string;state:'waiting'|'uploading'|'done'|'error';message?:string;id?:string};
function InboxView({state,reload}:{state:AppState;reload:()=>Promise<void>}){
 const [uploads,setUploads]=useState<Upload[]>([]),[drag,setDrag]=useState(false),[syncing,setSyncing]=useState(false),[notice,setNotice]=useState(''),[classifying,setClassifying]=useState(false),file=useRef<HTMLInputElement>(null),camera=useRef<HTMLInputElement>(null);
 const drafts=state.documents.filter(d=>d.status==='draft'&&!isArchived(d)),discardedCount=state.documents.filter(isArchived).length;
 type ClassifyResult={classified:number;facturas:number;albaranes:number;dudosos:number;descartados:number;pending:number;blocked:string|null};
 const classifyText=(r:ClassifyResult)=>r.classified?`${r.classified} clasificado(s): ${r.facturas} factura(s), ${r.albaranes} albarán(es), ${r.dudosos} dudoso(s), ${r.descartados} descartado(s).${r.blocked?' '+r.blocked:''}`:r.blocked||'';
 const previous=state.documents.filter(d=>d.classBy==='anterior'&&d.classState==='DUDOSO'&&d.status==='draft').length;
 async function classify(prev=false){setClassifying(true);setNotice('');try{const r=await api<ClassifyResult>('/api/classify',{method:'POST',body:JSON.stringify({previous:prev})});setNotice(classifyText(r)||'No había nada pendiente de clasificar.');await reload();}catch(e){setNotice((e as Error).message);}finally{setClassifying(false);}}
 async function send(files:FileList|File[]){const list=[...files];if(!list.length)return;const base=uploads.length;setUploads(u=>[...u,...list.map(f=>({name:f.name,state:'waiting' as const}))]);let last='';
  for(const [i,f] of list.entries()){setUploads(u=>u.map((x,j)=>j===base+i?{...x,state:'uploading'}:x));const form=new FormData();form.set('file',f);
   try{const r=await api<{id:string;duplicate:boolean;readError:string|null}>('/api/files',{method:'POST',body:form});last=r.id;setUploads(u=>u.map((x,j)=>j===base+i?{...x,state:'done',id:r.id,message:r.duplicate?'Ya estaba subido':r.readError?'Sin lectura automática':'Leído'}:x));}
   catch(e){setUploads(u=>u.map((x,j)=>j===base+i?{...x,state:'error',message:(e as Error).message}:x));}
   await reload();}
  if(list.length===1&&last)go('doc/'+last);}
 async function manual(kind:Kind){const r=await api<{id:string}>('/api/documents',{method:'POST',body:JSON.stringify({kind})});await reload();go('doc/'+r.id);}
 async function sync(){setSyncing(true);setNotice('');try{const r=await api<{gmail?:{drafts:number;messages:number;more:boolean};gmailError?:string;read?:ClassifyResult|null;skipped?:string}>('/api/google/sync',{method:'POST'});
  setNotice(r.skipped||r.gmailError||(r.gmail?`${r.gmail.drafts} adjunto(s) nuevo(s) en ${r.gmail.messages} correo(s) revisado(s)${r.gmail.more?'. Quedan más: vuelve a pulsar.':'.'}${r.read?' '+classifyText(r.read):''}`:'Revisión hecha.'));await reload();}catch(e){setNotice((e as Error).message);}finally{setSyncing(false);}}
 return <>
  <PageHead eyebrow="ENTRADA" title="Bandeja">{state.google.connected&&!state.google.paused?<button className="btn" onClick={sync} disabled={syncing}>{syncing?<Loader2 size={16} className="spin"/>:<Mail size={16}/>}{syncing?'Revisando…':'Revisar correo'}</button>:null}</PageHead>
  {notice&&<div className="alert info">{notice}</div>}
  {state.pending>0&&<div className="alert warning" role="status"><strong>{state.pending} documento{state.pending===1?'':'s'} pendiente{state.pending===1?'':'s'} de clasificar.</strong> Han llegado por correo y no se muestran en ningún listado hasta que la IA los clasifique{state.ai.configured?(state.ai.used>=state.ai.limit?': hoy se ha alcanzado el límite de lecturas.':'.'):': falta la clave de la IA.'} <button className="btn small" onClick={()=>classify()} disabled={classifying}>{classifying?<Loader2 size={15} className="spin"/>:<Sparkles size={15}/>}{classifying?'Clasificando…':'Clasificar ahora'}</button></div>}
  {previous>0&&<div className="alert info" role="status"><strong>{previous} documento{previous===1?'':'s'} del correo anterior{previous===1?'':'es'} al clasificador.</strong> Están como dudosos. Puedes pasarlos ahora por la IA (una lectura por documento) o revisarlos a mano. <button className="btn small" onClick={()=>classify(true)} disabled={classifying}>{classifying?<Loader2 size={15} className="spin"/>:<Sparkles size={15}/>}{classifying?'Clasificando…':'Reclasificar con IA'}</button></div>}
  <section className={'dropzone'+(drag?' over':'')} onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);send(e.dataTransfer.files);}}>
   <Upload size={26} aria-hidden="true"/><div><strong>Sube facturas y albaranes</strong><p>Arrastra aquí PDF, facturas electrónicas (XML, UBL, EDIFACT) o fotos, o elígelos. La IA los lee y tú revisas antes de confirmar.</p></div>
   <div className="dropzone-actions"><button className="btn primary" onClick={()=>file.current?.click()}><Upload size={16}/>Elegir archivos</button><button className="btn" onClick={()=>camera.current?.click()}><Camera size={16}/>Hacer foto</button></div>
   <input ref={file} type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.xml,.edi,.edifact,text/xml,application/xml" multiple hidden onChange={e=>{if(e.target.files)send(e.target.files);e.target.value='';}}/>
   <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={e=>{if(e.target.files)send(e.target.files);e.target.value='';}}/>
  </section>
  {uploads.length>0&&<ul className="uploads">{uploads.map((u,i)=><li key={i} className={u.state}>{u.state==='uploading'||u.state==='waiting'?<Loader2 size={15} className="spin"/>:u.state==='done'?<FileCheck2 size={15}/>:<AlertTriangle size={15}/>}<span className="name" title={u.name}>{u.name}</span><span className="muted">{u.state==='waiting'?'En cola':u.state==='uploading'?'Subiendo y leyendo…':u.message}</span>{u.id&&<a href={'#doc/'+u.id}>Abrir</a>}</li>)}<li className="uploads-foot"><button className="link" onClick={()=>setUploads([])}>Limpiar lista</button></li></ul>}
  <div className="row-actions"><span className="muted">¿Sin archivo?</span><button className="link" onClick={()=>manual('invoice')}><Plus size={14}/>Factura a mano</button><button className="link" onClick={()=>manual('delivery_note')}><Plus size={14}/>Albarán a mano</button>{discardedCount>0&&<><span className="spacer"/><a className="link" href="#descartados"><Archive size={14}/>Descartados ({discardedCount})</a></>}</div>
  <section className="panel"><div className="panel-head"><h2>Por revisar</h2><span className="muted">{drafts.length} documento{drafts.length===1?'':'s'}</span></div>
   {!drafts.length?<Empty title="Nada pendiente" text={state.google.connected?'Los adjuntos nuevos de Gmail aparecerán aquí.':'Sube un documento o conecta Gmail en Ajustes.'}/>:<DocTable items={drafts} showKind/>}</section>
  {!state.ai.configured&&<div className="alert warning">La lectura con IA está desactivada: falta <code>ANTHROPIC_API_KEY</code> en Vercel. Puedes introducir los datos a mano.</div>}
 </>;}


function DocTable({items,showKind}:{items:ListItem[];showKind?:boolean}){useNavList(items);return <div className="doc-table" role="table">
 <div className="doc-row head" role="row"><span role="columnheader">Documento</span><span role="columnheader">Fecha</span><span role="columnheader" className="num">Total</span><span role="columnheader">Estado</span><span/></div>
 {items.map(d=><a key={d.id} href={'#doc/'+d.id} className={'doc-row tone-'+(d.status==='draft'?'draft':d.matchStatus||'none')} role="row">
  <span className="doc-main" role="cell" title={[d.number,d.supplier,d.deliveryRefs.join(", ")].filter(Boolean).join(" · ")}><strong>{showKind&&<em>{kindLabel[d.kind]} · </em>}{d.number||'Sin número'}</strong><small>{d.supplier||'Proveedor sin identificar'}{d.origin==='correo'?' · Correo':d.origin==='escaneo'?' · Escaneo':''}{d.templateUsed?' · Plantilla':''}{d.classState==='DUDOSO'&&d.classReason?' · '+d.classReason:''}{d.kind==='invoice'&&d.deliveryRefs.length?' · Alb. '+d.deliveryRefs.slice(0,3).join(', ')+(d.deliveryRefs.length>3?'…':''):''}</small></span>
  <span role="cell" className="muted">{date(d.date)}</span><span role="cell" className="num">{money(d.total)}</span><span role="cell"><ClassBadge item={d}/>{!(d.status==='draft'&&d.classState==='DUDOSO')&&<StatusBadge item={d}/>}{d.status==='confirmed'&&d.driveError&&<span className="dot-warn" title={d.driveError}>Drive</span>}</span><ChevronRight size={16} className="chev" aria-hidden="true"/></a>)}
</div>;}

function ListView({kind,items}:{kind:Kind;items:ListItem[]}){
 const [filter,setFilter]=useState('all'),[q,setQ]=useState('');
 // Confirmados y dudosos de este tipo. Los dudosos no concilian hasta que una persona los valide.
 const mine=items.filter(d=>(d.status==='confirmed'||d.classState==='DUDOSO')&&(kind==='invoice'?d.kind!=='delivery_note':d.kind==='delivery_note'));
 const [origin,setOrigin]=useState('all');
 const filters=kind==='invoice'?[['all','Todas'],['ia','Validadas por la IA'],['dudoso','Dudosos'],['diff','Con diferencias'],['missing','Falta albarán'],['review','Revisar'],['ok','Conformes']]:[['all','Todos'],['dudoso','Dudosos'],['pending','Pendientes de facturar'],['partial','En parte'],['invoiced','Facturados']];
 const term=q.trim().toLowerCase();const is=(d:ListItem,s:string)=>s==='dudoso'?d.classState==='DUDOSO':s==='ia'?d.status==='confirmed'&&d.classBy==='ia':d.matchStatus===s;
 const shown=mine.filter(d=>(filter==='all'||is(d,filter))&&(origin==='all'||d.origin===origin)&&(!term||(d.number+' '+d.supplier+' '+d.deliveryRefs.join(' ')).toLowerCase().includes(term)));
 const n=(s:string)=>mine.filter(d=>is(d,s)).length;
 return <><PageHead eyebrow="DOCUMENTOS" title={kind==='invoice'?'Facturas':'Albaranes'}/>
  <div className="toolbar"><div className="chips" role="group" aria-label="Filtrar">{filters.map(([k,l])=><button key={k} className={'chip'+(filter===k?' on':'')} onClick={()=>setFilter(k)}>{l}{k!=='all'&&<span>{n(k)}</span>}</button>)}</div>
   {kind==='delivery_note'&&<div className="chips" role="group" aria-label="Filtrar por origen">{[['all','Cualquier origen'],['escaneo','Escaneo'],['correo','Correo'],['manual','A mano']].map(([k,l])=><button key={k} className={'chip'+(origin===k?' on':'')} onClick={()=>setOrigin(k)}>{l}</button>)}</div>}
   <label className="search"><Search size={16}/><input placeholder="Buscar número o proveedor" type="search" enterKeyHint="search" autoCapitalize="none" autoCorrect="off" value={q} onChange={e=>setQ(e.target.value)} aria-label="Buscar"/></label></div>
  <section className="panel">{!shown.length?<Empty title={mine.length?'Ningún resultado':'Todavía no hay '+(kind==='invoice'?'facturas':'albaranes')} text={mine.length?'Prueba con otro filtro.':'Confirma documentos desde la Bandeja.'}/>:<DocTable items={shown} showKind={kind==='invoice'}/>}</section></>;}

/** Guarda el orden de la lista visible para el botón «Siguiente» del documento. */
function useNavList(items:ListItem[]){const key=items.map(d=>d.id).join(',');useEffect(()=>{setNavList(key?key.split(','):[]);},[key]);}

function DiscardedView({items,reload}:{items:ListItem[];reload:()=>Promise<void>}){useNavList(items);const [busy,setBusy]=useState(''),[error,setError]=useState('');
 async function recover(id:string,kind:'invoice'|'delivery_note'){setBusy(id);setError('');try{await api('/api/documents/'+id,{method:'POST',body:JSON.stringify({action:'recover',kind})});await reload();go('doc/'+id);}catch(e){setError((e as Error).message);}finally{setBusy('');}}
 return <><PageHead eyebrow="ARCHIVO" title="Descartados"/>
  <p className="muted">Documentos que no son factura ni albarán, o que ya estaban registrados. Nada se borra: puedes recuperarlos.</p>{error&&<div className="alert danger" role="alert">{error}</div>}
  <section className="panel">{!items.length?<Empty title="Nada descartado" text="Aquí aparecerá lo que el clasificador o tú descartéis."/>:
   <ul className="discarded">{items.map(d=><li key={d.id}><div className="discarded-main"><strong>{d.detectedType||kindLabel[d.kind]}{d.number?' · '+d.number:''}</strong> <ClassBadge item={d}/>
     <small>{[d.sender||d.supplier||(d.origin==='correo'?'Remitente desconocido':'Subido a mano'),d.receivedAt?dateTime(d.receivedAt):date(d.date||d.createdAt),d.filename].filter(Boolean).join(' · ')}</small>
     <p>{d.classReason||'Sin motivo indicado.'}</p></div>
    <div className="discarded-actions"><a className="btn small" href={'#doc/'+d.id}>Ver</a>{d.classState==='DESCARTADO'&&<><button className="btn small" disabled={busy===d.id} onClick={()=>recover(d.id,'invoice')}>Es una factura</button><button className="btn small" disabled={busy===d.id} onClick={()=>recover(d.id,'delivery_note')}>Es un albarán</button></>}</div></li>)}</ul>}</section></>;}

function IssuesView({items}:{items:ListItem[]}){useNavList(items);return <><PageHead eyebrow="REVISIÓN" title="Diferencias"/>
 {!items.length?<section className="panel"><Empty title="Sin diferencias abiertas" text="Todas las facturas confirmadas cuadran con sus albaranes o tienen las diferencias aceptadas."/></section>:
 <div className="issue-cards">{items.map(d=><a key={d.id} href={'#doc/'+d.id} className={'issue-card tone-'+d.matchStatus}><div className="issue-card-head"><div><strong>Factura {d.number}</strong><small>{d.supplier} · {date(d.date)} · {money(d.total)}</small></div><StatusBadge item={d}/></div>
  <ul>{d.issues.slice(0,4).map((x,i)=><li key={i}>{x.message}</li>)}</ul>{d.issues.length>4&&<p className="muted">y {d.issues.length-4} más…</p>}</a>)}</div>}</>;}

function HistoryView(){const [events,setEvents]=useState<{at:string;action:string;message:string;document_id:string|null}[]|null>(null),[error,setError]=useState('');
 const load=useCallback(()=>{api<{events:typeof events}>('/api/history').then(r=>setEvents(r.events)).catch(e=>setError(e.message));},[]);useEffect(load,[load]);
 return <><PageHead eyebrow="TRAZABILIDAD" title="Histórico"><button className="btn" onClick={load}><RefreshCw size={16}/>Actualizar</button></PageHead>{error&&<div className="alert danger">{error}</div>}
  <section className="panel">{!events?<div className="loading"><Loader2 className="spin" size={18}/></div>:!events.length?<Empty title="Sin actividad" text="Aquí quedará cada confirmación, cambio y diferencia aceptada."/>:
  <ol className="timeline">{events.map((e,i)=><li key={i}><time>{dateTime(e.at)}</time><p>{e.message}</p>{e.document_id&&<a href={'#doc/'+e.document_id}>Ver</a>}</li>)}</ol>}</section></>;}
