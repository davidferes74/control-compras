'use client';
import {useEffect,useState} from 'react';
import {Mail,Sparkles,Loader2,Link2Off,CheckCircle2,AlertTriangle,Palette,KeyRound} from 'lucide-react';
import {api,dateTime,type AppState} from './lib';
import {PageHead,Badge,ThemePicker} from './ui';
import DriveConnection from './drive-connection';
import DriveHelp,{type DriveIssue} from './drive-help';

const gmailMessages:Record<string,[string,string]>={connected:['success','Gmail conectado.'],cancelled:['warning','Has cancelado la autorización de Gmail.'],scopes:['warning','Google no ha concedido el permiso de lectura del correo. Vuelve a conectar y deja marcada la casilla de Gmail.'],invalid:['danger','La autorización caducó o no es válida. Inténtalo de nuevo.'],session:['danger','Tu sesión caducó durante la autorización. Entra y vuelve a conectar.'],failed:['danger','No se pudo completar la conexión con Gmail. Revisa la configuración del cliente OAuth.']};
// Mismos textos que en Recepciones-IA para cada motivo de fallo al conectar Drive.
const driveMessages:Record<string,string>={cancelled:'Has cancelado la conexión con Google Drive. Puedes intentarlo de nuevo cuando quieras.',session:'La sesión ha caducado. Inicia sesión y conecta Google Drive de nuevo.',invalid:'La conexión tardó demasiado o se abrió dos veces. Pulsa Conectar y complétala de una vez.',api:'Falta activar «Google Drive API» en el proyecto de Google Cloud de la app. Es un ajuste único de quien administra la app; después vuelve a conectar.',scope:'Google no concedió el permiso para guardar archivos. Al conectar, deja marcada la casilla de acceso a Google Drive y pulsa Continuar.',denied:'Google no permite a la app usar Drive con esta cuenta. Prueba con otra cuenta o revisa los permisos en Google Cloud.',exchange:'Google rechazó la autorización. Vuelve a pulsar Conectar; si se repite, revisa las credenciales de Google en el servidor.',auth:'Google rechazó el acceso recién concedido. Vuelve a pulsar Conectar.',database:'Falta actualizar la base de datos de la app. Avisa a quien la administra.'};
const driveFallback='No se pudo conectar Google Drive. Inténtalo de nuevo; si se repite, avisa a quien administra la app.';

export default function SettingsView({state,reload}:{state:AppState;reload:()=>Promise<void>}){
 const g=state.google,[busy,setBusy]=useState<string|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState<[string,string]|null>(null),[driveIssue,setDriveIssue]=useState<DriveIssue|null>(null),[driveHelp,setDriveHelp]=useState(false);
 const [labels,setLabels]=useState<{id:string;name:string}[]|null>(null),[chosen,setChosen]=useState<string[]>(state.gmail?.labels.map(l=>l.id)||[]),[since,setSince]=useState(state.gmail?.since||new Date(Date.now()-30*864e5).toISOString().slice(0,10)),[autoRead,setAutoRead]=useState(state.gmail?.autoRead??true);
 // Vuelta de Google: ?google=… (Gmail) o ?drive=… (Drive). Si falta un ajuste en Google Cloud, se abren las instrucciones.
 useEffect(()=>{const q=new URLSearchParams(window.location.search),p=q.get('google'),d=q.get('drive');
  if(p&&gmailMessages[p])setNotice(gmailMessages[p]);
  if(d){if(d==='api'||d==='denied'){setDriveIssue(d);setDriveHelp(true);}if(d==='connected')setNotice(['success','Google Drive conectado. La carpeta ya está creada: a partir de ahora cada documento que confirmes se guarda ahí.']);else setError(driveMessages[d]||driveFallback);}
  if(p||d)window.history.replaceState(null,'',window.location.pathname+window.location.hash);},[]);
 useEffect(()=>{if(g.connected&&!g.missingScopes.length)api<{labels:{id:string;name:string}[]}>('/api/google/labels').then(r=>setLabels(r.labels)).catch(e=>setError(e.message));},[g.connected,g.missingScopes.length]);
 async function run(label:string,fn:()=>Promise<void>){setBusy(label);setError('');setNotice(null);setDriveIssue(null);try{await fn();}catch(e){setError((e as Error).message);}finally{setBusy(null);}}
 const connect=()=>run('connect',async()=>{const r=await api<{url:string}>('/api/google/connect',{method:'POST'});window.location.href=r.url;});
 const disconnect=()=>run('disconnect',async()=>{if(!window.confirm('¿Desconectar Gmail? Dejará de revisarse el correo. Los documentos se conservan.'))return;await api('/api/google',{method:'DELETE'});await reload();setNotice(['success','Gmail desconectado.']);});
 const saveGmail=()=>run('gmail',async()=>{const ls=(labels||[]).filter(l=>chosen.includes(l.id));await api('/api/settings',{method:'PUT',body:JSON.stringify({gmail:{labels:ls,since,autoRead}})});await reload();setNotice(['success',ls.length?'Correo configurado. Se revisa cada mañana automáticamente y cuando pulses «Revisar correo» en la Bandeja.':'Revisión de correo desactivada.']);});
 const ready=g.connected&&!g.missingScopes.length;
 return <><PageHead eyebrow="CONFIGURACIÓN" title="Ajustes"/>
  {error&&<div className="alert danger" role="alert">{error}{driveIssue&&<> <button type="button" className="link" onClick={()=>setDriveHelp(true)}>Ver cómo solucionarlo</button></>}</div>}
  {notice&&<div className={'alert '+notice[0]} role="status">{notice[1]}</div>}

  {!g.configured&&<section className="panel setting"><div className="setting-head"><span className="setting-icon"><KeyRound size={20}/></span><div><h2>Preparación única de Google</h2><p className="muted">La hace una vez quien administra la app. Después, conectar Gmail y Drive es solo elegir la cuenta y pulsar Permitir.</p></div><Badge tone="warning">Pendiente</Badge></div>
   <ol className="help-steps">
    <li>En Google Cloud, activa <strong>Gmail API</strong>, <strong>Google Drive API</strong> y <strong>Google Sheets API</strong> en el mismo proyecto.</li>
    <li>Crea un cliente OAuth de tipo «Aplicación web» con esta URI de redirección autorizada:<code className="help-url">{g.redirect}</code></li>
    <li>Mientras el proyecto esté en pruebas, añade en <strong>Público → Usuarios de prueba</strong> las cuentas de Google que se vayan a conectar.</li>
    <li>En Vercel guarda <code>GOOGLE_CLIENT_ID</code> y <code>GOOGLE_CLIENT_SECRET</code> (Production y Preview) y vuelve a desplegar.</li></ol></section>}

  <DriveConnection status={state.drive} onChanged={reload}/>

  <section className="panel setting"><div className="setting-head"><span className="setting-icon"><Mail size={20}/></span><div><h2>Gmail</h2><p className="muted">Permiso de solo lectura para recoger los adjuntos de facturas y albaranes. No envía ni borra correos.</p></div>{ready?<Badge tone="success">Conectado</Badge>:<Badge>Sin conectar</Badge>}</div>
   {!g.configured?<p className="muted">Completa antes la preparación de Google.</p>
   :!g.connected?<button className="btn primary" onClick={connect} disabled={!!busy}>{busy==='connect'?<Loader2 size={16} className="spin"/>:<Mail size={16}/>}Conectar Gmail</button>
   :<div className="setting-body"><p>Cuenta: <strong>{g.email}</strong>{g.lastSync&&<span className="muted"> · última revisión {dateTime(g.lastSync)}</span>}</p>
     {g.missingScopes.length>0&&<div className="alert warning">Falta el permiso de lectura de Gmail. <button className="link" onClick={connect}>Volver a conectar</button></div>}
     {g.lastError&&<div className="alert warning"><AlertTriangle size={15}/>{g.lastError} <button className="link" onClick={connect}>Volver a conectar</button></div>}
     <div className="row-actions"><button className="link" onClick={connect}>Cambiar de cuenta</button><button className="link danger" onClick={disconnect}><Link2Off size={14}/>Desconectar</button></div></div>}
   {ready&&<><h3 className="sub-head">Correo que se revisa</h3><p className="muted">Elige las etiquetas donde llegan facturas y albaranes (por ejemplo, una etiqueta «Proveedores» con un filtro). Solo se recogen adjuntos PDF o imagen.</p>
    {!labels?<div className="loading"><Loader2 size={16} className="spin"/>Cargando etiquetas…</div>:<>
    <div className="label-list">{labels.map(l=><label key={l.id} className="check"><input type="checkbox" checked={chosen.includes(l.id)} onChange={e=>setChosen(e.target.checked?[...chosen,l.id]:chosen.filter(x=>x!==l.id))}/>{l.id==='INBOX'?'Recibidos (todo el correo)':l.name}</label>)}</div>
    <div className="form-grid"><label>Revisar correos desde<input type="date" value={since} onChange={e=>setSince(e.target.value)}/></label>
     <label className="check span2"><input type="checkbox" checked={autoRead} onChange={e=>setAutoRead(e.target.checked)}/>Leer automáticamente con IA los adjuntos nuevos</label></div>
    <button className="btn primary" onClick={saveGmail} disabled={!!busy}>{busy==='gmail'?<Loader2 size={16} className="spin"/>:<CheckCircle2 size={16}/>}Guardar</button></>}</>}</section>

  <section className="panel setting"><div className="setting-head"><span className="setting-icon"><Palette size={20}/></span><div><h2>Apariencia</h2><p className="muted">Elige el fondo de la aplicación. Se recuerda en este navegador.</p></div></div><ThemePicker/></section>

  <section className="panel setting"><div className="setting-head"><span className="setting-icon"><Sparkles size={20}/></span><div><h2>Lectura con IA</h2><p className="muted">Claude transcribe los documentos; la conciliación la hacen reglas exactas. Nada se da por bueno sin que una persona confirme.</p></div>{state.ai.configured?<Badge tone="success">Activa</Badge>:<Badge tone="warning">Sin clave</Badge>}</div>
   {state.ai.configured?<p>Modelo <code>{state.ai.model}</code> · hoy {state.ai.used} de {state.ai.limit} lecturas.</p>:<p>Falta <code>ANTHROPIC_API_KEY</code> en Vercel.</p>}</section>
  {driveHelp&&driveIssue&&<DriveHelp issue={driveIssue} onClose={()=>setDriveHelp(false)}/>}
 </>;}
