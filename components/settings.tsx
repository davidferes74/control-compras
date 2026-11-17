'use client';
import {useEffect,useState} from 'react';
import {Mail,FolderOpen,Sparkles,Loader2,ExternalLink,Link2Off,CheckCircle2,AlertTriangle,Sheet} from 'lucide-react';
import {api,dateTime,type AppState} from './lib';
import {PageHead,Badge} from './ui';

declare global{interface Window{gapi?:{load:(name:string,cb:()=>void)=>void};google?:any}}
let pickerReady:Promise<void>|null=null;
function loadPicker(){return pickerReady??=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://apis.google.com/js/api.js';s.async=true;s.onload=()=>window.gapi!.load('picker',()=>resolve());s.onerror=()=>{pickerReady=null;reject(new Error('No se pudo cargar el selector de Google.'));};document.head.appendChild(s);});}

const googleMessages:Record<string,[string,string]>={connected:['success','Cuenta de Google conectada.'],cancelled:['warning','Has cancelado la autorización de Google.'],scopes:['warning','Google no ha concedido todos los permisos. Vuelve a conectar y marca Gmail y Drive.'],invalid:['danger','La autorización caducó o no es válida. Inténtalo de nuevo.'],session:['danger','Tu sesión caducó durante la autorización. Entra y vuelve a conectar.'],failed:['danger','No se pudo completar la conexión con Google. Revisa la configuración del cliente OAuth.']};

export default function SettingsView({state,reload}:{state:AppState;reload:()=>Promise<void>}){
 const g=state.google,[busy,setBusy]=useState<string|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState<[string,string]|null>(null);
 const [labels,setLabels]=useState<{id:string;name:string}[]|null>(null),[chosen,setChosen]=useState<string[]>(state.gmail?.labels.map(l=>l.id)||[]),[since,setSince]=useState(state.gmail?.since||new Date(Date.now()-30*864e5).toISOString().slice(0,10)),[autoRead,setAutoRead]=useState(state.gmail?.autoRead??true);
 useEffect(()=>{const p=new URLSearchParams(window.location.search).get('google');if(p&&googleMessages[p]){setNotice(googleMessages[p]);window.history.replaceState(null,'',window.location.pathname+window.location.hash);}},[]);
 useEffect(()=>{if(g.connected&&!g.missingScopes.length)api<{labels:{id:string;name:string}[]}>('/api/google/labels').then(r=>setLabels(r.labels)).catch(e=>setError(e.message));},[g.connected,g.missingScopes.length]);
 async function run(label:string,fn:()=>Promise<void>){setBusy(label);setError('');setNotice(null);try{await fn();}catch(e){setError((e as Error).message);}finally{setBusy(null);}}
 const connect=()=>run('connect',async()=>{const r=await api<{url:string}>('/api/google/connect',{method:'POST'});window.location.href=r.url;});
 const disconnect=()=>run('disconnect',async()=>{if(!window.confirm('¿Desconectar la cuenta de Google? Dejará de revisarse el correo y de archivarse en Drive. Los documentos se conservan.'))return;await api('/api/google',{method:'DELETE'});await reload();setNotice(['success','Cuenta de Google desconectada.']);});
 const pickFolder=()=>run('folder',async()=>{const t=await api<{accessToken:string;apiKey:string;appId:string}>('/api/google/token');await loadPicker();const gp=window.google.picker;
  const id=await new Promise<string|null>(resolve=>{const view=new gp.DocsView(gp.ViewId.FOLDERS).setSelectFolderEnabled(true).setIncludeFolders(true).setMimeTypes('application/vnd.google-apps.folder');
   new gp.PickerBuilder().setTitle('Carpeta para facturas y albaranes').addView(view).setOAuthToken(t.accessToken).setDeveloperKey(t.apiKey).setAppId(t.appId).setLocale('es').setCallback((data:{action:string;docs?:{id:string}[]})=>{if(data.action===gp.Action.PICKED)resolve(data.docs?.[0]?.id||null);else if(data.action===gp.Action.CANCEL)resolve(null);}).build().setVisible(true);});
  if(!id)return;await api('/api/settings',{method:'PUT',body:JSON.stringify({driveFolderId:id})});await reload();setNotice(['success','Carpeta guardada. Los documentos confirmados se archivarán ahí.']);});
 const saveGmail=()=>run('gmail',async()=>{const ls=(labels||[]).filter(l=>chosen.includes(l.id));await api('/api/settings',{method:'PUT',body:JSON.stringify({gmail:{labels:ls,since,autoRead}})});await reload();setNotice(['success',ls.length?'Correo configurado. Se revisa cada mañana automáticamente y cuando pulses «Revisar correo» en la Bandeja.':'Revisión de correo desactivada.']);});
 const ready=g.connected&&!g.missingScopes.length;
 return <><PageHead eyebrow="CONFIGURACIÓN" title="Ajustes"/>
  {error&&<div className="alert danger" role="alert">{error}</div>}{notice&&<div className={'alert '+notice[0]} role="status">{notice[1]}</div>}
  <section className="panel setting"><div className="setting-head"><span className="setting-icon"><Mail size={20}/></span><div><h2>Cuenta de Google</h2><p className="muted">Un solo permiso para leer el correo (solo lectura) y archivar en Drive. La app solo ve la carpeta que elijas y los archivos que crea.</p></div>{ready?<Badge tone="success">Conectada</Badge>:<Badge>Sin conectar</Badge>}</div>
   {!g.configured?<div className="steps"><p><strong>Falta la configuración en Google Cloud y Vercel.</strong></p><ol>
     <li>En Google Cloud, activa <em>Gmail API</em>, <em>Google Drive API</em>, <em>Google Sheets API</em> y <em>Google Picker API</em>.</li>
     <li>Crea un cliente OAuth de tipo «Aplicación web» con esta URI de redirección autorizada: <code className="copy">{g.redirect}</code></li>
     <li>Crea una clave de API (restringida a la API de Picker y a este dominio).</li>
     <li>En Vercel guarda <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code> y <code>GOOGLE_API_KEY</code>, y vuelve a desplegar.</li></ol></div>
   :!g.connected?<button className="btn primary" onClick={connect} disabled={!!busy}>{busy==='connect'?<Loader2 size={16} className="spin"/>:<Mail size={16}/>}Conectar con Google</button>
   :<div className="setting-body"><p>Cuenta: <strong>{g.email}</strong>{g.lastSync&&<span className="muted"> · última revisión {dateTime(g.lastSync)}</span>}</p>
     {g.missingScopes.length>0&&<div className="alert warning">Faltan permisos de {g.missingScopes.map(s=>s.includes('gmail')?'Gmail':'Drive').join(' y ')}. <button className="link" onClick={connect}>Volver a conectar</button></div>}
     {g.lastError&&<div className="alert warning"><AlertTriangle size={15}/>{g.lastError} <button className="link" onClick={connect}>Volver a conectar</button></div>}
     <div className="row-actions"><button className="link" onClick={connect}>Cambiar de cuenta</button><button className="link danger" onClick={disconnect}><Link2Off size={14}/>Desconectar</button></div></div>}</section>

  <section className={'panel setting'+(ready?'':' disabled')}><div className="setting-head"><span className="setting-icon"><FolderOpen size={20}/></span><div><h2>Archivo en Google Drive</h2><p className="muted">Al confirmar, el original se guarda en <code>Carpeta / Proveedor / Año-Mes</code> y se actualiza la hoja «Registro control de compras» con todos los datos.</p></div>{state.drive?<Badge tone="success">Activo</Badge>:<Badge>Sin carpeta</Badge>}</div>
   {state.drive&&<p>Carpeta: <strong>{state.drive.folderName}</strong> · <a href={`https://drive.google.com/drive/folders/${state.drive.folderId}`} target="_blank" rel="noreferrer">Abrir<ExternalLink size={12}/></a>{state.drive.sheetId&&<> · <a href={`https://docs.google.com/spreadsheets/d/${state.drive.sheetId}`} target="_blank" rel="noreferrer"><Sheet size={13}/>Hoja de registro<ExternalLink size={12}/></a></>}</p>}
   {ready&&(g.picker?<button className="btn" onClick={pickFolder} disabled={!!busy}>{busy==='folder'?<Loader2 size={16} className="spin"/>:<FolderOpen size={16}/>}{state.drive?'Cambiar carpeta':'Elegir carpeta'}</button>:<div className="alert warning">Para elegir la carpeta falta <code>GOOGLE_API_KEY</code> en Vercel.</div>)}
   {!ready&&<p className="muted">Conecta primero la cuenta de Google.</p>}</section>

  <section className={'panel setting'+(ready?'':' disabled')}><div className="setting-head"><span className="setting-icon"><Mail size={20}/></span><div><h2>Correo que se revisa</h2><p className="muted">Elige las etiquetas de Gmail donde llegan facturas y albaranes (por ejemplo, una etiqueta «Proveedores» con un filtro). Solo se recogen adjuntos PDF o imagen.</p></div>{state.gmail?.labels.length?<Badge tone="success">{state.gmail.labels.length} etiqueta{state.gmail.labels.length>1?'s':''}</Badge>:<Badge>Inactivo</Badge>}</div>
   {!ready?<p className="muted">Conecta primero la cuenta de Google.</p>:!labels?<div className="loading"><Loader2 size={16} className="spin"/>Cargando etiquetas…</div>:<>
    <div className="label-list">{labels.map(l=><label key={l.id} className="check"><input type="checkbox" checked={chosen.includes(l.id)} onChange={e=>setChosen(e.target.checked?[...chosen,l.id]:chosen.filter(x=>x!==l.id))}/>{l.id==='INBOX'?'Recibidos (todo el correo)':l.name}</label>)}</div>
    <div className="form-grid"><label>Revisar correos desde<input type="date" value={since} onChange={e=>setSince(e.target.value)}/></label>
     <label className="check span2"><input type="checkbox" checked={autoRead} onChange={e=>setAutoRead(e.target.checked)}/>Leer automáticamente con IA los adjuntos nuevos</label></div>
    <button className="btn primary" onClick={saveGmail} disabled={!!busy}>{busy==='gmail'?<Loader2 size={16} className="spin"/>:<CheckCircle2 size={16}/>}Guardar</button></>}</section>

  <section className="panel setting"><div className="setting-head"><span className="setting-icon"><Sparkles size={20}/></span><div><h2>Lectura con IA</h2><p className="muted">Claude transcribe los documentos; la conciliación la hacen reglas exactas. Nada se da por bueno sin que una persona confirme.</p></div>{state.ai.configured?<Badge tone="success">Activa</Badge>:<Badge tone="warning">Sin clave</Badge>}</div>
   {state.ai.configured?<p>Modelo <code>{state.ai.model}</code> · hoy {state.ai.used} de {state.ai.limit} lecturas.</p>:<p>Falta <code>ANTHROPIC_API_KEY</code> en Vercel.</p>}</section>
 </>;}
