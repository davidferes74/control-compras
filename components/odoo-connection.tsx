'use client';
import {useEffect,useState} from 'react';
import {Boxes,RefreshCw,CheckCircle2,AlertTriangle,Link2} from 'lucide-react';
import type {Workspace} from '@/lib/types';
import {Badge,Modal} from './ui';
export type OdooStatus={connected:boolean;source:'inherited'|'own'|null;host:string|null;db:string|null;login:string|null;companyId:number|null;lastSync:string|null;lastResult:Summary|null;encryptionReady:boolean};
type Summary={received:number;created:number;updated:number;linked:number;archived:number;conflicts:number;skipped:number;skippedSample:{name:string;reason:string}[];truncated:boolean};
const blank={url:'',db:'',login:'',apiKey:''};
// Tarjeta de conexión con Odoo. Si la app principal (Sentidiño BI) ya tiene acceso, se usa el suyo y aquí solo
// se informa; si no, el usuario introduce dirección, base de datos, usuario y clave API (solo lectura).
export default function OdooConnection({demo,status,onStatus,onSynced}:{demo:boolean;status:OdooStatus|null;onStatus:(s:OdooStatus)=>void;onSynced:(w:Workspace)=>void}){
 const [open,setOpen]=useState(false),[form,setForm]=useState(blank),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[tested,setTested]=useState(false),[summary,setSummary]=useState<Summary|null>(null);
 async function call(body:unknown){const r=await fetch('/api/odoo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const b=await r.json();if(!r.ok)throw Error(b.error);return b;}
 async function refresh(){const r=await fetch('/api/odoo');const b=await r.json();if(r.ok)onStatus(b);}
 useEffect(()=>{if(!demo)void refresh().catch(()=>{});// eslint-disable-next-line react-hooks/exhaustive-deps
 },[demo]);
 async function work(fn:()=>Promise<void>){if(busy)return;setBusy(true);setError('');setNotice('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'No se completó la operación.');}finally{setBusy(false);}}
 const config=()=>({...form,companyId:null});
 const sync=()=>work(async()=>{const b=await call({action:'sync'});setSummary(b.summary);onSynced(b.workspace);await refresh();});
 const shownSummary=summary||status?.lastResult||null;
 return <><div className="panel connection-card"><Boxes size={23}/><h3>Odoo</h3>
  <p>{demo?'Catálogo de productos compartido con Odoo. Disponible en el espacio privado.':status?.connected?(status.source==='inherited'?'Usa la conexión de la app principal. Los productos son los de Odoo.':'Conectado con clave API de solo lectura. Los productos son los de Odoo.'):'Conecta con tu clave API para usar los mismos productos que en Odoo.'}</p>
  <Badge kind={status?.connected?'success':'neutral'}>{status?.connected?(status.source==='inherited'?'Heredada de la app principal':'Conectada'):'Sin conectar'}</Badge>
  {!demo&&<button className="button secondary small" onClick={()=>{setOpen(true);setError('');setNotice('');setTested(false);}}>{status?.connected?'Gestionar':'Conectar'}</button>}</div>
  {open&&<Modal title="Conexión con Odoo" onClose={()=>{if(!busy)setOpen(false);}}><div className="form-stack">
   {status?.connected?<>
    <div className="wizard-card ok"><CheckCircle2 size={20}/><div><strong>{status.source==='inherited'?'Conexión heredada de la app principal':'Conectado a Odoo'}</strong><p className="helper">{status.host} · base de datos {status.db} · usuario {status.login}</p>{status.source==='inherited'&&<p className="helper">Los accesos se gestionan en la app principal (variables ODOO_URL, ODOO_DB, ODOO_LOGIN y ODOO_API_KEY). Aquí no se guarda ninguna clave.</p>}</div></div>
    <p>Los productos del catálogo vienen de Odoo: los que se pueden comprar y están activos. Solo se lee; esta app no escribe nada en Odoo.</p>
    <button className="button primary" disabled={busy} onClick={sync}><RefreshCw size={17}/>{busy?'Sincronizando…':'Sincronizar productos ahora'}</button>
    {status.lastSync&&<small>Última sincronización: {new Date(status.lastSync).toLocaleString('es-ES',{timeZone:'Europe/Madrid'})}</small>}
    {shownSummary&&<div className="sync-summary"><div><strong>{shownSummary.received}</strong><span>recibidos</span></div><div><strong>{shownSummary.created}</strong><span>nuevos</span></div><div><strong>{shownSummary.updated}</strong><span>actualizados</span></div><div><strong>{shownSummary.linked}</strong><span>enlazados</span></div><div><strong>{shownSummary.archived}</strong><span>archivados</span></div></div>}
    {shownSummary&&(shownSummary.skipped>0||shownSummary.conflicts>0||shownSummary.truncated)&&<div className="notice warning"><AlertTriangle size={18}/><div>{shownSummary.truncated&&<p>Odoo tiene más productos de los que se cargan de una vez (máximo 3000). Se han cargado los primeros.</p>}{shownSummary.conflicts>0&&<p>{shownSummary.conflicts} productos no se han actualizado porque otro producto del catálogo ya usa su código o referencia.</p>}{shownSummary.skipped>0&&<><p>{shownSummary.skipped} productos de Odoo se han omitido:</p><ul className="sync-skipped">{shownSummary.skippedSample.map((s,i)=><li key={i}>{s.name} — {s.reason}</li>)}</ul></>}</div></div>}
    {status.source==='own'&&<button className="text-button" disabled={busy} onClick={()=>work(async()=>{await call({action:'disconnect'});await refresh();setSummary(null);setNotice('Conexión quitada. El catálogo se conserva y vuelve a gestionarse a mano.');})}>Quitar la conexión</button>}
   </>:<form className="form-stack" onSubmit={e=>{e.preventDefault();void work(async()=>{await call({action:'save',config:config()});await refresh();setForm(blank);setNotice('Conexión guardada. Sincroniza los productos para traer el catálogo de Odoo.');});}}>
    <div className="wizard-card"><Link2 size={20}/><div><strong>Conecta con una clave API de Odoo</strong><ol className="wizard-help"><li>En Odoo, abre tu usuario → <strong>Preferencias</strong> → <strong>Seguridad de la cuenta</strong> → <strong>Nueva clave API</strong>.</li><li>Recomendado: usa un usuario con permisos solo de lectura.</li><li>Copia la clave y pégala aquí. Se guarda cifrada.</li></ol></div></div>
    {!status?.encryptionReady&&<p className="notice">Falta TOKEN_ENCRYPTION_KEY en el servidor: es necesaria para guardar la clave cifrada.</p>}
    <label>Dirección de Odoo<input required type="url" placeholder="https://tuempresa.odoo.com" maxLength={300} autoCapitalize="none" spellCheck={false} value={form.url} onChange={e=>{setForm({...form,url:e.target.value});setTested(false);}}/></label>
    <div className="form-grid"><label>Base de datos<input required maxLength={120} autoCapitalize="none" spellCheck={false} value={form.db} onChange={e=>{setForm({...form,db:e.target.value});setTested(false);}}/><small>En Odoo Online suele ser el nombre de la dirección, sin «.odoo.com».</small></label><label>Usuario<input required maxLength={254} autoCapitalize="none" spellCheck={false} placeholder="usuario@tuempresa.com" value={form.login} onChange={e=>{setForm({...form,login:e.target.value});setTested(false);}}/></label></div>
    <label>Clave API<input required type="password" autoComplete="new-password" maxLength={400} value={form.apiKey} onChange={e=>{setForm({...form,apiKey:e.target.value});setTested(false);}}/></label>
    <div className="wizard-nav"><button type="button" className="button secondary" disabled={busy||!form.url||!form.db||!form.login||!form.apiKey} onClick={()=>work(async()=>{const b=await call({action:'test',config:config()});setTested(true);setNotice('Conexión correcta'+(b.version?' · Odoo '+b.version:'')+'. Ya puedes guardarla.');})}>{busy?'Probando…':'Probar conexión'}</button><button className="button primary" disabled={busy||!tested||!status?.encryptionReady}>Guardar conexión</button></div>
   </form>}
   {notice&&<p className="notice" role="status">{notice}</p>}{error&&<p className="notice error" role="alert">{error}</p>}
  </div></Modal>}</>;
}
