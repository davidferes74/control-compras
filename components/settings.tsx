'use client';
import {useEffect,useState} from 'react';
import {Building2,Mail,Sparkles,Loader2,Link2Off,AlertTriangle,Palette,KeyRound,RefreshCw,Pause,Play,SlidersHorizontal,ShieldCheck} from 'lucide-react';
import {api,dateTime,type AppState,type Company} from './lib';
import {PageHead,Badge,ThemePicker,Modal} from './ui';
import DriveConnection from './drive-connection';
import DriveHelp,{type DriveIssue} from './drive-help';

// Motivo concreto de cada fallo al volver de Google, igual que en Recepciones-IA.
const driveMessages:Record<string,string>={cancelled:'Has cancelado la conexión con Google Drive. Puedes intentarlo de nuevo cuando quieras.',session:'La sesión ha caducado. Inicia sesión y conecta Google Drive de nuevo.',invalid:'La conexión tardó demasiado o se abrió dos veces. Pulsa Conectar y complétala de una vez.',api:'Falta activar «Google Drive API» en el proyecto de Google Cloud de la app. Es un ajuste único de quien administra la app; después vuelve a conectar.',scope:'Google no concedió el permiso para guardar archivos. Al conectar, deja marcada la casilla de acceso a Google Drive y pulsa Continuar.',denied:'Google no permite a la app usar Drive con esta cuenta. Prueba con otra cuenta o revisa los permisos en Google Cloud.',exchange:'Google rechazó la autorización. Vuelve a pulsar Conectar; si se repite, revisa las credenciales de Google en el servidor.',auth:'Google rechazó el acceso recién concedido. Vuelve a pulsar Conectar.',database:'Falta actualizar la base de datos de la app. Avisa a quien la administra.'};
const gmailMessages:Record<string,string>={cancelled:'Autorización cancelada. Puedes intentarlo de nuevo.',session:'La sesión ha caducado. Inicia sesión y conecta Gmail de nuevo.',invalid:'La conexión tardó demasiado o se abrió dos veces. Pulsa Conectar Gmail y complétala de una vez.',api:'Falta activar «Gmail API» en el proyecto de Google Cloud de la app. Es un ajuste único de quien administra la app; después vuelve a conectar.',scope:'Google no concedió el permiso para leer el correo. Al conectar, deja marcada la casilla de acceso a Gmail y pulsa Continuar.',denied:'Google no permite a la app leer el correo de esta cuenta. Prueba con otra cuenta o revisa los permisos en Google Cloud.',exchange:'Google rechazó la autorización. Vuelve a pulsar Conectar Gmail; si se repite, revisa las credenciales de Google en el servidor.',auth:'Google rechazó el acceso recién concedido. Vuelve a pulsar Conectar Gmail.',database:'Falta actualizar la base de datos de la app. Avisa a quien la administra.'};
type GmailForm={name:string;labels:string[];since:string;sender:string;subject:string;own:string;autoRead:boolean};

export default function SettingsView({state,reload}:{state:AppState;reload:()=>Promise<void>}){
 const g=state.google,[busy,setBusy]=useState<string|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState<[string,string]|null>(null),[issue,setIssue]=useState<{kind:DriveIssue;service:'drive'|'gmail'}|null>(null),[help,setHelp]=useState(false);
 const [company,setCompany]=useState<Company>(state.company||{name:'',taxIds:'',aliases:''});
 const [labels,setLabels]=useState<{id:string;name:string}[]>([]),[form,setForm]=useState<GmailForm|null>(null),[formError,setFormError]=useState('');
 // Vuelta de Google: ?google=… (Gmail) o ?drive=… (Drive). Si falta un ajuste en Google Cloud, se abren las instrucciones.
 useEffect(()=>{const q=new URLSearchParams(window.location.search);
  for(const service of ['gmail','drive'] as const){const r=q.get(service==='gmail'?'google':'drive');if(!r)continue;
   if(r==='api'||r==='denied'){setIssue({kind:r,service});setHelp(true);}
   if(r==='connected')setNotice(['success',service==='gmail'?'Gmail autorizado y guardado. Configura las etiquetas y la fecha antes de habilitar la captura.':'Google Drive conectado. La carpeta ya está creada: a partir de ahora cada documento que confirmes se guarda ahí.']);
   else setError((service==='gmail'?gmailMessages:driveMessages)[r]||(service==='gmail'?'No se completó la conexión con Gmail. Inténtalo de nuevo; si se repite, avisa a quien administra la app.':'No se pudo conectar Google Drive. Inténtalo de nuevo; si se repite, avisa a quien administra la app.'));}
  if(q.has('google')||q.has('drive'))window.history.replaceState(null,'',window.location.pathname+window.location.hash);},[]);
 async function run(label:string,fn:()=>Promise<void>){if(busy)return;setBusy(label);setError('');setNotice(null);setIssue(null);try{await fn();}catch(e){setError((e as Error).message);}finally{setBusy(null);}}
 const post=<T=Record<string,any>>(body:unknown)=>api<T>('/api/gmail',{method:'POST',body:JSON.stringify(body)});
 const connect=()=>run('connect',async()=>{const r=await api<{url:string}>('/api/google/connect',{method:'POST'});window.location.assign(r.url);});
 const disconnect=()=>run('disconnect',async()=>{if(!window.confirm('¿Desconectar Gmail? Dejará de revisarse el correo. Los documentos se conservan.'))return;await api('/api/google',{method:'DELETE'});await reload();setNotice(['success','Gmail desconectado.']);});
 const configure=()=>run('labels',async()=>{const r=await api<{labels:{id:string;name:string}[]}>('/api/google/labels');setLabels(r.labels);setFormError('');
  setForm({name:state.gmail?.name||'Facturas Gmail',labels:state.gmail?.labels.map(l=>l.id)||[],since:state.gmail?.since||new Date(Date.now()-30*864e5).toISOString().slice(0,10),sender:state.gmail?.sender||'',subject:state.gmail?.subject||'',own:state.gmail?.own||'',autoRead:state.gmail?.autoRead??true});});
 async function save(){if(!form||busy)return;setBusy('save');setFormError('');try{await post({action:'save',config:{...form,name:form.name.trim()||'Facturas Gmail',since:form.since||new Date(Date.now()-30*864e5).toISOString().slice(0,10),labels:labels.filter(l=>form.labels.includes(l.id))}});setForm(null);await reload();setNotice(['success','Configuración guardada. Habilita la captura cuando quieras comenzar.']);}catch(e){setFormError((e as Error).message);}finally{setBusy(null);}}
 const toggle=()=>run('pause',async()=>{await post({action:'pause',paused:!g.paused});await reload();setNotice(['success',g.paused?'Captura habilitada. El buzón se revisa solo cada mañana y también con «Comprobar ahora».':'Captura pausada.']);});
 const capture=()=>run('capture',async()=>{const b=await post<{drafts:number;messages:number;more:boolean;read:{read:number}|null}>({action:'capture'});await reload();
  setNotice(['success',`${b.drafts} ${b.drafts===1?'adjunto nuevo guardado':'adjuntos nuevos guardados'}; ${b.messages} ${b.messages===1?'correo revisado':'correos revisados'}${b.read?.read?`; ${b.read.read} leído(s) con IA`:''}.${b.more?' Quedan correos por revisar: vuelve a pulsar «Comprobar ahora».':''} Los documentos nuevos están en la Bandeja.`]);});
 const saveCompany=()=>run('company',async()=>{await api('/api/company',{method:'POST',body:JSON.stringify(company)});await reload();setNotice(['success',company.name||company.taxIds||company.aliases?'Datos de tu empresa guardados. Se aplican a los documentos que se clasifiquen a partir de ahora.':'Datos de tu empresa borrados: ya no se comprueba el destinatario.']);});
 const configured=Boolean(state.gmail),scope=state.gmail?.labels.length?state.gmail.labels.map(l=>l.id==='INBOX'?'Recibidos':l.name).join(', '):'todo el correo',status=g.lastError?['danger','Requiere atención']:g.paused?['neutral','Captura pausada']:['success','Captura habilitada'];
 return <><PageHead eyebrow="CONFIGURACIÓN" title="Ajustes"/>
  {error&&<div className="alert danger" role="alert">{error}{issue&&<> <button type="button" className="link" onClick={()=>setHelp(true)}>Ver cómo solucionarlo</button></>}</div>}
  {notice&&<div className={'alert '+notice[0]} role="status">{notice[1]}</div>}

  {!g.configured&&<section className="panel setting"><div className="setting-head"><span className="setting-icon"><KeyRound size={20}/></span><div><h2>Preparación única de Google</h2><p className="muted">La hace una vez quien administra la app. Después, conectar Gmail y Drive es solo elegir la cuenta y pulsar Permitir.</p></div><Badge tone="warning">Pendiente</Badge></div>
   <ol className="help-steps">
    <li>En Google Cloud, activa <strong>Gmail API</strong>, <strong>Google Drive API</strong> y <strong>Google Sheets API</strong> en el mismo proyecto.</li>
    <li>Crea un cliente OAuth de tipo «Aplicación web» con esta URI de redirección autorizada:<code className="help-url">{g.redirect}</code></li>
    <li>Mientras el proyecto esté en pruebas, añade en <strong>Público → Usuarios de prueba</strong> las cuentas de Google que se vayan a conectar.</li>
    <li>En Vercel guarda <code>GOOGLE_CLIENT_ID</code> y <code>GOOGLE_CLIENT_SECRET</code> (Production y Preview) y vuelve a desplegar.</li></ol></section>}

  <DriveConnection status={state.drive} onChanged={reload}/>

  <section className="panel setting"><div className="setting-head"><span className="setting-icon"><Mail size={20}/></span><div><h2>Correo de facturas (Gmail)</h2><p className="muted">Conecta tu buzón y captura los adjuntos en PDF y las facturas electrónicas (XML, UBL o EDIFACT). Acceso de solo lectura: no se marcan correos como leídos ni se mueven o eliminan.</p></div>{g.connected?<Badge tone={status[0]}>{status[1]}</Badge>:<Badge>Sin conectar</Badge>}</div>
   {!g.configured?<p className="muted">Completa antes la preparación de Google.</p>
   :!g.connected?<><ol className="drive-steps"><li>Pulsa <strong>Conectar Gmail</strong>, elige tu cuenta de Google y pulsa <strong>Permitir</strong>.</li><li>Pulsa <strong>Habilitar captura</strong> y después <strong>Comprobar ahora</strong>.</li><li>Opcional: con <strong>Configurar</strong> limitas la revisión a unas etiquetas, una fecha o un remitente.</li></ol>
     <p className="muted small"><ShieldCheck size={15} className="ok-icon"/> La app solo puede leer el correo. No puede enviar, borrar ni modificar nada.</p>
     <button className="btn primary" onClick={connect} disabled={!!busy}>{busy==='connect'?<Loader2 size={16} className="spin"/>:<Mail size={16}/>}{busy==='connect'?'Abriendo Google…':'Conectar Gmail'}</button></>
   :<div className="setting-body">
     <p><strong>{state.gmail?.name||'Facturas Gmail'}</strong> · {g.email} · {scope}</p>
     <p className="muted small">Última captura correcta: {g.lastSync?dateTime(g.lastSync):'todavía no realizada'}{configured&&<> · revisa desde {state.gmail!.since}</>}</p>
     {g.missingScopes.length>0&&<div className="alert warning">Falta el permiso de lectura de Gmail. <button className="link" onClick={connect}>Volver a conectar</button></div>}
     {g.lastError&&<div className="alert danger" role="alert"><AlertTriangle size={15}/>{g.lastError} <button className="link" onClick={connect}>Volver a conectar</button></div>}
     {g.paused&&!g.lastError&&<div className="alert info">La captura está pausada. Pulsa <strong>Habilitar captura</strong> para empezar. Con <strong>Configurar</strong> puedes limitar etiquetas, fecha o remitente; es opcional.</div>}
     <div className="row-actions"><button className="btn primary small" disabled={!!busy||g.paused} onClick={capture}>{busy==='capture'?<Loader2 size={15} className="spin"/>:<RefreshCw size={15}/>}{busy==='capture'?'Comprobando…':'Comprobar ahora'}</button>
      <button className="btn small" disabled={!!busy} onClick={toggle}>{g.paused?<Play size={15}/>:<Pause size={15}/>}{g.paused?'Habilitar captura':'Pausar'}</button>
      <button className="btn small" disabled={!!busy} onClick={configure}>{busy==='labels'?<Loader2 size={15} className="spin"/>:<SlidersHorizontal size={15}/>}Configurar</button></div>
     <div className="row-actions"><button className="link" onClick={connect}>Cambiar de cuenta o renovar el permiso</button><button className="link danger" onClick={disconnect}><Link2Off size={14}/>Desconectar</button></div></div>}</section>

  <section className="panel setting"><div className="setting-head"><span className="setting-icon"><Building2 size={20}/></span><div><h2>Datos de mi empresa</h2><p className="muted">Sirven para comprobar que cada factura o albarán del correo va dirigido a tu empresa. Si el NIF del destinatario es de otra empresa, el documento va a <a href="#descartados">Descartados</a>, donde puedes revisarlo y recuperarlo. Si solo hay dudas (no coincide el nombre, o el NIF), queda como «Dudoso — revisar».</p></div>{state.company?<Badge tone="success">Activo</Badge>:<Badge>Sin datos</Badge>}</div>
   <form className="form-stack" onSubmit={e=>{e.preventDefault();saveCompany();}}>
    <label>Razón social<input maxLength={150} value={company.name} onChange={e=>setCompany({...company,name:e.target.value})} placeholder="p. ej. Mi Empresa, S.L."/></label>
    <label>NIF / CIF<input maxLength={200} value={company.taxIds} onChange={e=>setCompany({...company,taxIds:e.target.value})} placeholder="p. ej. B12345678" autoCapitalize="characters" autoCorrect="off" spellCheck={false}/><span className="muted small">Si compras con varias sociedades, separa los NIF con comas.</span></label>
    <label>Otros nombres<input maxLength={500} value={company.aliases} onChange={e=>setCompany({...company,aliases:e.target.value})} placeholder="Opcional: nombre comercial, nombre del local…"/><span className="muted small">Nombres con los que los proveedores te ponen en sus albaranes, separados por comas.</span></label>
    <button className="btn primary" disabled={!!busy}>{busy==='company'?'Guardando…':'Guardar datos'}</button></form></section>

  <section className="panel setting"><div className="setting-head"><span className="setting-icon"><Palette size={20}/></span><div><h2>Apariencia</h2><p className="muted">Elige el fondo de la aplicación. Se recuerda en este navegador.</p></div></div><ThemePicker/></section>

  <section className="panel setting"><div className="setting-head"><span className="setting-icon"><Sparkles size={20}/></span><div><h2>Lectura con IA</h2><p className="muted">Claude transcribe los documentos; la conciliación la hacen reglas exactas. Nada se da por bueno sin que una persona confirme.</p></div>{state.ai.configured?<Badge tone="success">Activa</Badge>:<Badge tone="warning">Sin clave</Badge>}</div>
   {state.ai.configured?<p>Modelo <code>{state.ai.model}</code> · hoy {state.ai.used} de {state.ai.limit} lecturas.</p>:<p>Falta <code>ANTHROPIC_API_KEY</code> en Vercel.</p>}</section>

  {form&&<Modal title="Configurar Gmail" onClose={()=>{if(busy!=='save')setForm(null);}}><form className="form-stack" onSubmit={e=>{e.preventDefault();void save();}}>
   <p className="muted">Todos los campos son opcionales. Solo se recogen correos recibidos (nunca Enviados, Borradores, Spam ni Papelera) con adjuntos PDF o factura electrónica (XML, UBL o EDIFACT). Al guardar, la captura queda pausada hasta que la habilites.</p>
   <label>Nombre<input maxLength={100} placeholder="Facturas Gmail" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
   <fieldset className="check-group"><legend>Etiquetas que se revisan (si no marcas ninguna, todo el correo)</legend><div className="label-list">{labels.map(l=><label key={l.id} className="check"><input type="checkbox" checked={form.labels.includes(l.id)} onChange={e=>setForm({...form,labels:e.target.checked?[...form.labels,l.id]:form.labels.filter(x=>x!==l.id)})}/>{l.id==='INBOX'?'Recibidos (todo el correo)':l.name}</label>)}</div></fieldset>
   <label>Revisar desde<input type="date" value={form.since} onChange={e=>setForm({...form,since:e.target.value})}/></label>
   <label>Remitente contiene<input maxLength={254} value={form.sender} onChange={e=>setForm({...form,sender:e.target.value})} placeholder="Opcional: p. ej. @proveedor.com" autoCapitalize="none" autoCorrect="off"/></label>
   <label>Asunto contiene<input maxLength={150} value={form.subject} onChange={e=>setForm({...form,subject:e.target.value})} placeholder="Opcional: p. ej. factura"/></label>
   <label>Cuentas y dominios propios<input maxLength={1000} value={form.own} onChange={e=>setForm({...form,own:e.target.value})} placeholder="Opcional: p. ej. miempresa.es, otra@gmail.com" autoCapitalize="none" autoCorrect="off"/><span className="muted small">Los correos enviados desde estas direcciones no se recogen, aunque estén en Recibidos. La cuenta conectada ya está incluida.</span></label>
   <label className="check"><input type="checkbox" checked={form.autoRead} onChange={e=>setForm({...form,autoRead:e.target.checked})}/>Leer automáticamente con IA los adjuntos nuevos</label>
   {formError&&<div className="alert danger" role="alert">{formError}</div>}
   <button className="btn primary" disabled={busy==='save'}>{busy==='save'?'Guardando…':'Guardar configuración pausada'}</button>
  </form></Modal>}
  {help&&issue&&<DriveHelp issue={issue.kind} service={issue.service} onClose={()=>setHelp(false)}/>}
 </>;}
