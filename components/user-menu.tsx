'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {LogIn,LogOut,FlaskConical,RefreshCw,Settings2,Moon,Sun,ChevronsUpDown,ArrowLeft,ShieldCheck} from 'lucide-react';
import {useTheme} from './theme-toggle';
type Props={demo:boolean;serverConfigured:boolean;parentUrl?:string|null;variant:'topbar'|'sidebar';onPrivate:()=>void;onDemo:()=>void;onLogout:()=>void;onSettings:()=>void;onReset:()=>void};
// Menú de usuario: se abre desde el avatar (cabecera) o desde la fila de usuario (menú lateral) y reúne
// quién está dentro, en qué espacio, y las acciones de cuenta: entrar con usuario real, cerrar sesión, demo, tema.
export default function UserMenu({demo,serverConfigured,parentUrl,variant,onPrivate,onDemo,onLogout,onSettings,onReset}:Props){
 const [open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null),id=useId(),[theme,toggleTheme]=useTheme();
 useEffect(()=>{if(!open)return;const out=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false);},key=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};document.addEventListener('pointerdown',out);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',out);document.removeEventListener('keydown',key);};},[open]);
 const name=demo?'Usuario de prueba':'Administrador',initial=demo?'D':'A',act=(fn:()=>void)=>()=>{setOpen(false);fn();};
 return <div className={'user-menu in-'+variant} ref={root}>
  <button type="button" className={variant==='sidebar'?'user-trigger':'avatar-trigger'} aria-haspopup="menu" aria-expanded={open} aria-controls={id} aria-label={variant==='topbar'?'Menú de usuario: '+name:undefined} onClick={()=>setOpen(!open)}>
   <span className={'avatar'+(variant==='topbar'?' small':'')+(demo?' demo':'')}>{initial}</span>
   {variant==='sidebar'&&<><span className="user-trigger-text">{name}<small>{demo?'Demostración':'Espacio privado'}</small></span><ChevronsUpDown size={16}/></>}
  </button>
  {open&&<div className="user-popover" id={id} role="menu">
   <div className="user-card"><span className={'avatar large'+(demo?' demo':'')}>{initial}</span><div><strong>{name}</strong><small>{demo?'Datos de ejemplo guardados en este navegador':'Acceso de administrador del piloto'}</small><span className={'user-mode '+(demo?'demo':'private')}>{demo?<FlaskConical size={13}/>:<ShieldCheck size={13}/>}{demo?'Demostración':'Espacio privado'}</span></div></div>
   {demo&&<button type="button" role="menuitem" className="user-item primary" disabled={!serverConfigured} onClick={act(onPrivate)}><LogIn size={18}/><span>Entrar con un usuario real<small>{serverConfigured?'Salir de la demostración e identificarte':'El espacio privado no está configurado en este servidor'}</small></span></button>}
   <button type="button" role="menuitem" className="user-item" onClick={act(onSettings)}><Settings2 size={18}/><span>Configuración</span></button>
   <button type="button" role="menuitem" className="user-item" onClick={toggleTheme}>{theme==='dark'?<Sun size={18}/>:<Moon size={18}/>}<span>{theme==='dark'?'Usar tema claro':'Usar tema oscuro'}</span></button>
   {demo?<button type="button" role="menuitem" className="user-item" onClick={act(onReset)}><RefreshCw size={18}/><span>Reiniciar datos de ejemplo</span></button>
    :<button type="button" role="menuitem" className="user-item" onClick={act(onDemo)}><FlaskConical size={18}/><span>Ver la demostración<small>Tu sesión sigue abierta</small></span></button>}
   {parentUrl&&<a role="menuitem" className="user-item" href={parentUrl}><ArrowLeft size={18}/><span>Volver a Sentidiño BI</span></a>}
   {!demo&&<><div className="user-sep"/><button type="button" role="menuitem" className="user-item danger" onClick={act(onLogout)}><LogOut size={18}/><span>Cerrar sesión</span></button></>}
  </div>}
 </div>;
}
