'use client';
import {useState} from 'react';
import {Mail,KeyRound,FolderOpen,CheckCircle2,AlertTriangle,ArrowLeft,ArrowRight,Search,ShieldCheck} from 'lucide-react';
import type {MailProvider} from '@/lib/mail-providers';
import {Modal} from './ui';
type Config={name:string;email:string;host:string;username:string;password:string;folder:string;since:string;sender:string;subject:string};
type Step='email'|'access'|'what'|'done';
type Discovery={provider:MailProvider;host:string|null;detected:boolean;googleReady:boolean};
const daysAgo=(n:number)=>new Date(Date.now()-n*86400000).toISOString().slice(0,10);
const folderLabel=(f:string)=>f.toUpperCase()==='INBOX'?'Bandeja de entrada':f;
// Asistente para conectar cualquier buzón externo sin conocimientos técnicos: dirección → acceso → qué revisar.
// El servidor se detecta solo cuando es posible; la contraseña solo viaja al servidor de la app, donde se guarda cifrada.
export default function MailWizard({editing,action,onGoogle,onClose,onSaved}:{editing?:{id:string;config:Omit<Config,'password'>};action:(body:unknown)=>Promise<any>;onGoogle:()=>void;onClose:()=>void;onSaved:()=>void}){
 const [step,setStep]=useState<Step>(editing?'access':'email'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [c,setC]=useState<Config>(editing?{...editing.config,password:''}:{name:'',email:'',host:'',username:'',password:'',folder:'INBOX',since:daysAgo(30),sender:'',subject:''});
 const [found,setFound]=useState<Discovery|null>(null),[folders,setFolders]=useState<string[]>([]),[preview,setPreview]=useState<{messages:{subject:string;sender:string;size:number}[];remaining:number}|null>(null),[manualHost,setManualHost]=useState(Boolean(editing));
 const set=(patch:Partial<Config>)=>{setC(v=>({...v,...patch}));setError('');};
 async function work(fn:()=>Promise<void>){if(busy)return;setBusy(true);setError('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'No se completó la operación.');}finally{setBusy(false);}}
 const discover=()=>work(async()=>{const d:Discovery=await action({action:'discover',email:c.email});setFound(d);const domain=c.email.split('@')[1]||'';setC(v=>({...v,email:v.email.trim(),username:v.username||v.email.trim(),host:d.host||'',name:v.name||'Facturas · '+domain}));setManualHost(!d.host);if(d.provider.auth==='password'||d.provider.auth==='app-password')setStep('access');});
 const useAppPassword=()=>{setC(v=>({...v,host:'imap.gmail.com'}));setFound(f=>f&&{...f,provider:{...f.provider,auth:'app-password',name:'Gmail con contraseña de aplicación',help:['Entra en myaccount.google.com → Seguridad → Verificación en dos pasos (debe estar activada).','Busca «Contraseñas de aplicaciones», crea una y cópiala.','Pégala aquí en lugar de tu contraseña habitual.']}});setManualHost(false);setStep('access');};
 const test=()=>work(async()=>{const b=await action({action:'test',config:c});setFolders(b.folders);setPreview(null);if(!b.folders.includes(c.folder))set({folder:b.folders.find((f:string)=>f.toUpperCase()==='INBOX')||b.folders[0]||'INBOX'});setStep('what');});
 const sample=()=>work(async()=>{setPreview(await action({action:'preview',config:c}));});
 const save=()=>work(async()=>{await action({action:'save',id:editing?.id,config:c});setStep('done');});
 const steps:Step[]=['email','access','what'],index=steps.indexOf(step),p=found?.provider;
 return <Modal title={editing?'Configurar buzón':'Conectar un correo'} onClose={()=>{if(!busy){if(step==='done')onSaved();else onClose();}}}><div className="form-stack wizard">
  {step!=='done'&&<ol className="wizard-steps" aria-label="Pasos">{[['Tu correo',Mail],['Acceso',KeyRound],['Qué revisar',FolderOpen]].map(([label,Icon],i)=>{const I=Icon as typeof Mail;return <li key={label as string} className={i===index?'current':i<index?'done':''} aria-current={i===index?'step':undefined}><span>{i<index?<CheckCircle2 size={16}/>:<I size={16}/>}</span>{label as string}</li>;})}</ol>}

  {step==='email'&&<form className="form-stack" onSubmit={e=>{e.preventDefault();void discover();}}>
   <div><h3>¿Qué correo recibe las facturas?</h3><p className="helper">Escribe la dirección y buscaremos la configuración por ti. Solo leeremos los correos: no se marcan como leídos, no se mueven y no se borra nada.</p></div>
   <label>Dirección de correo<input type="email" required autoFocus autoComplete="off" maxLength={254} placeholder="facturas@tuempresa.com" value={c.email} onChange={e=>{set({email:e.target.value});setFound(null);}}/></label>
   {p?.auth==='google'&&<div className="wizard-card"><ShieldCheck size={20}/><div><strong>Es un correo de Google</strong><p>{p.help[0]}</p>{found?.googleReady?<button type="button" className="button primary" onClick={onGoogle}>Conectar con Google</button>:<p className="helper">La conexión con Google aún no está activada en esta instalación.</p>}<button type="button" className="text-button" onClick={useAppPassword}>Prefiero usar una contraseña de aplicación</button></div></div>}
   {p?.auth==='unsupported'&&<div className="wizard-card warn"><AlertTriangle size={20}/><div><strong>{p.name}: todavía no se puede conectar</strong>{p.help.map(h=><p key={h}>{h}</p>)}</div></div>}
   {(!p||p.auth==='password'||p.auth==='app-password')&&<button className="button primary" disabled={busy||!c.email}><Search size={17}/>{busy?'Buscando la configuración…':'Continuar'}</button>}
  </form>}

  {step==='access'&&<form className="form-stack" onSubmit={e=>{e.preventDefault();void test();}}>
   {p&&<div className={'wizard-card'+(found?.detected?' ok':'')}>{found?.detected?<CheckCircle2 size={20}/>:<AlertTriangle size={20}/>}<div><strong>{p.id!=='other'?'Hemos reconocido tu correo: '+p.name:found?.detected?'Hemos encontrado el servidor de tu correo':'No hemos encontrado el servidor automáticamente'}</strong>{found?.detected?<p className="helper">Servidor: <code>{c.host}</code></p>:<p>Necesitamos que nos lo indiques. Búscalo en la ayuda de tu proveedor de correo como «servidor de correo entrante» o «servidor IMAP». Suele ser algo como <code>imap.tuproveedor.com</code>.</p>}</div></div>}
   <div><h3>{p?.auth==='app-password'?'Crea una contraseña de aplicación':'Escribe la contraseña de ese buzón'}</h3><ol className="wizard-help">{(p?.help||['Usa la dirección de correo completa como usuario y la contraseña de ese buzón.']).map(h=><li key={h}>{h}</li>)}</ol></div>
   {manualHost&&<label>Servidor de correo entrante (IMAP)<input required autoCapitalize="none" autoComplete="off" spellCheck={false} maxLength={253} placeholder="imap.tuproveedor.com" value={c.host} onChange={e=>set({host:e.target.value.trim().toLowerCase()})}/><small>Conexión segura, puerto 993. No hace falta escribir el puerto.</small></label>}
   <label>Usuario<input required autoCapitalize="none" autoComplete="off" spellCheck={false} maxLength={254} value={c.username} onChange={e=>set({username:e.target.value})}/><small>Casi siempre es la dirección de correo completa.</small></label>
   <label>{p?.auth==='app-password'?'Contraseña de aplicación':editing?'Contraseña (vuelve a escribirla)':'Contraseña'}<input required type="password" autoComplete="new-password" maxLength={1024} value={c.password} onChange={e=>set({password:e.target.value})}/><small>Se guarda cifrada y nunca se envía a la IA.</small></label>
   {!manualHost&&<button type="button" className="text-button" onClick={()=>setManualHost(true)}>Cambiar el servidor manualmente</button>}
   {error&&<div className="notice error" role="alert">{error}</div>}
   <div className="wizard-nav">{!editing&&<button type="button" className="button secondary" disabled={busy} onClick={()=>{setStep('email');setError('');}}><ArrowLeft size={17}/>Atrás</button>}<button className="button primary" disabled={busy||!c.host||!c.username||!c.password}>{busy?'Probando la conexión…':'Probar conexión'}{!busy&&<ArrowRight size={17}/>}</button></div>
  </form>}

  {step==='what'&&<form className="form-stack" onSubmit={e=>{e.preventDefault();void save();}}>
   <div className="wizard-card ok"><CheckCircle2 size={20}/><div><strong>Conexión correcta</strong><p className="helper">Hemos entrado en {c.email}. Ahora dinos qué correos revisar.</p></div></div>
   <label>Nombre para reconocer este buzón<input required maxLength={100} value={c.name} onChange={e=>set({name:e.target.value})}/></label>
   <div className="form-grid"><label>Carpeta donde llegan las facturas<select value={c.folder} onChange={e=>{set({folder:e.target.value});setPreview(null);}}>{folders.map(f=><option key={f} value={f}>{folderLabel(f)}</option>)}</select></label><label>Revisar correos desde<input type="date" required value={c.since} max={daysAgo(0)} onChange={e=>{set({since:e.target.value});setPreview(null);}}/><small>No se revisan correos anteriores a esa fecha.</small></label></div>
   <details className="wizard-more"><summary>Revisar solo algunos correos (opcional)</summary><div className="form-grid"><label>El remitente contiene<input maxLength={254} placeholder="proveedor.com" value={c.sender} onChange={e=>{set({sender:e.target.value});setPreview(null);}}/></label><label>El asunto contiene<input maxLength={150} placeholder="factura" value={c.subject} onChange={e=>{set({subject:e.target.value});setPreview(null);}}/></label></div><p className="helper">Déjalo vacío para revisar todos los correos de la carpeta.</p></details>
   <button type="button" className="button secondary" disabled={busy} onClick={sample}><Search size={17}/>Ver una muestra de los correos</button>
   {preview&&<div className="wizard-sample">{preview.messages.length?<><p className="helper">{preview.messages.length} correos de ejemplo{preview.remaining?` y ${preview.remaining} más`:''}. Todavía no se ha guardado ni leído ningún adjunto.</p>{preview.messages.map((m,i)=><div className="wizard-sample-row" key={i}><strong>{m.subject}</strong><small>{m.sender} · {Math.max(1,Math.round(m.size/1024))} KB</small></div>)}</>:<p className="helper">No hay correos con esos criterios desde esa fecha. Prueba con otra carpeta o una fecha anterior.</p>}</div>}
   {error&&<div className="notice error" role="alert">{error}</div>}
   <div className="wizard-nav"><button type="button" className="button secondary" disabled={busy} onClick={()=>{setStep('access');setError('');}}><ArrowLeft size={17}/>Atrás</button><button className="button primary" disabled={busy||!c.name||!folders.length}>{busy?'Guardando…':'Guardar buzón'}</button></div>
  </form>}

  {step==='done'&&<div className="form-stack"><div className="wizard-card ok"><CheckCircle2 size={22}/><div><strong>Buzón guardado</strong><p>Por seguridad queda en pausa. Para empezar:</p><ol className="wizard-help"><li>Pulsa <strong>Habilitar captura</strong> en la tarjeta del buzón.</li><li>Pulsa <strong>Comprobar ahora</strong> para traer los adjuntos nuevos.</li><li>Revisa cada documento en «Documentos recibidos».</li></ol></div></div><button type="button" className="button primary" onClick={onSaved}>Entendido</button></div>}
 </div></Modal>;
}
