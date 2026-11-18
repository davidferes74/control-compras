'use client';
import {useState} from 'react';
import {HardDrive,FolderOpen,ExternalLink,CheckCircle2,AlertTriangle,UploadCloud,ShieldCheck,Sheet} from 'lucide-react';
import {api,type DriveStatus} from './lib';
import {Badge,Modal} from './ui';
// Tarjeta de Google Drive pensada para alguien sin conocimientos técnicos (portada de Recepciones-IA): escribe el
// nombre de la carpeta, elige su cuenta de Google y la app crea la carpeta y guarda ahí cada documento confirmado
// con un nombre que se puede buscar. La app solo ve lo que ella misma crea en Drive.
export default function DriveConnection({status,onChanged}:{status:DriveStatus;onChanged:()=>Promise<void>}){
 const [open,setOpen]=useState(false),[name,setName]=useState('Control de compras'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[again,setAgain]=useState(false);
 async function post<T=Record<string,any>>(body:unknown){return api<T>('/api/drive',{method:'POST',body:JSON.stringify(body)});}
 async function work(fn:()=>Promise<void>){if(busy)return;setBusy(true);setError('');setNotice('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'No se completó la operación.');}finally{setBusy(false);}}
 const start=()=>work(async()=>{const b=await post<{url:string}>({action:'start',folderName:name});window.location.assign(b.url);});
 const sync=()=>work(async()=>{let b:{uploaded:number;pending:number;error:string|null};try{b=await post({action:'sync'});}catch(e){await onChanged();throw e;}await onChanged();if(b.error)setError(b.error);else setNotice(b.uploaded?`${b.uploaded} ${b.uploaded===1?'documento guardado':'documentos guardados'} en Drive.`+(b.pending?` Quedan ${b.pending} para la siguiente pasada.`:''):'Todo estaba ya guardado en Drive.');});
 const ready=status.googleReady&&status.encryptionReady,connected=status.connected;
 const form=<form className="form-stack" onSubmit={e=>{e.preventDefault();void start();}}>
  <ol className="drive-steps"><li>Escribe cómo quieres que se llame la carpeta.</li><li>Elige tu cuenta de Google y pulsa <strong>Permitir</strong>.</li><li>La app crea la carpeta y empieza a guardar ahí cada documento que confirmes.</li></ol>
  <label>Nombre de la carpeta en Drive<input required autoFocus maxLength={80} value={name} onChange={e=>setName(e.target.value)} placeholder="Control de compras" enterKeyHint="go"/></label>
  <div className="drive-tree" aria-label="Cómo quedará organizada"><span><FolderOpen size={16}/>{name.trim()||'Control de compras'}</span><span className="l1"><FolderOpen size={16}/>2026</span><span className="l2"><FolderOpen size={16}/>11 noviembre</span><span className="l3">2026-11-17 · Proveedor · Albarán ALB-2026-0148.pdf</span><span className="l3">2026-11-17 · Proveedor · Factura F-2026-0312.pdf</span><span className="l1 sheet-row"><Sheet size={16}/>Registro control de compras</span></div>
  <p className="muted small"><ShieldCheck size={15} className="ok-icon"/> La app solo puede ver y modificar esta carpeta y lo que guarde en ella. No tiene acceso al resto de tu Drive.</p>
  {!ready&&<div className="alert warning">Falta una preparación única en el servidor (credenciales de Google y clave de cifrado). Avisa a quien administra la app.</div>}
  <button className="btn primary" disabled={busy||!ready||!name.trim()}>{busy?'Abriendo Google…':'Continuar con Google'}</button>
 </form>;
 return <><section className="panel setting"><div className="setting-head"><span className="setting-icon"><HardDrive size={20}/></span><div><h2>Google Drive</h2>
   <p className="muted">{connected?<>Carpeta <strong>{status.folderName}</strong> · {status.archived} {status.archived===1?'documento guardado':'documentos guardados'}.</>:'Guarda cada factura y albarán confirmado en una carpeta de tu Drive, con un nombre fácil de buscar, y una hoja con todos los datos.'}</p></div>
   <Badge tone={connected?(status.lastError?'danger':'success'):'neutral'}>{connected?(status.lastError?'Requiere atención':'Conectado'):'Sin conectar'}</Badge></div>
  {connected&&status.lastError&&<div className="alert danger"><AlertTriangle size={15}/>{status.lastError}</div>}
  <div className="row-actions">{connected&&<a className="btn primary small" href={status.folderUrl!} target="_blank" rel="noreferrer"><ExternalLink size={15}/>Abrir carpeta</a>}<button className="btn small" onClick={()=>{setOpen(true);setError('');setNotice('');setAgain(false);}}>{connected?'Gestionar':'Conectar'}</button></div></section>
  {open&&<Modal title="Google Drive" onClose={()=>{if(!busy)setOpen(false);}}><div className="form-stack">
   {connected&&!again?<>
    <div className={'wizard-card '+(status.lastError?'warn':'ok')}>{status.lastError?<AlertTriangle size={20}/>:<CheckCircle2 size={20}/>}<div><strong>{status.lastError?'Hay un problema con el archivo':'Guardando en tu Drive'}</strong><p className="muted">Cuenta {status.email} · carpeta «{status.folderName}»</p>{status.lastError&&<p>{status.lastError}</p>}</div></div>
    <a className="btn primary" href={status.folderUrl!} target="_blank" rel="noreferrer"><FolderOpen size={17}/>Abrir la carpeta en Drive</a>
    {status.sheetUrl&&<a className="btn" href={status.sheetUrl} target="_blank" rel="noreferrer"><Sheet size={17}/>Abrir la hoja de registro</a>}
    <div className="drive-summary"><div><strong>{status.archived}</strong><span>guardados</span></div><div><strong>{status.failed}</strong><span>con error</span></div><div><strong>{status.lastArchive?new Date(status.lastArchive).toLocaleDateString('es-ES',{day:'2-digit',month:'short',timeZone:'Europe/Madrid'}):'—'}</strong><span>último guardado</span></div></div>
    <p className="muted small">Cada factura y albarán se guarda solo al confirmarlo, dentro de la carpeta del año y del mes. Para encontrar uno, escribe en el buscador de Drive el proveedor o el número del documento.</p>
    <button className="btn" disabled={busy} onClick={sync}><UploadCloud size={17}/>{busy?'Guardando…':'Guardar ahora lo pendiente'}</button>
    <div className="row-actions spread"><button className="link" disabled={busy} onClick={()=>{setAgain(true);setError('');setNotice('');}}>Usar otra carpeta u otra cuenta</button><button className="link danger" disabled={busy} onClick={()=>work(async()=>{await post({action:'disconnect'});await onChanged();setNotice('Drive desconectado. La carpeta y sus documentos siguen en tu Drive.');})}>Desconectar</button></div>
   </>:<>{again&&<div className="alert info">Se creará una carpeta nueva. Los documentos ya guardados se quedan en la carpeta anterior; los nuevos irán a esta.</div>}{form}</>}
   {notice&&<div className="alert success" role="status">{notice}</div>}{error&&<div className="alert danger" role="alert">{error}</div>}
  </div></Modal>}</>;
}
