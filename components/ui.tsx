'use client';
import {useEffect,useRef,useState} from 'react';
import {Sun,CloudMoon,Moon} from 'lucide-react';
import {statusInfo,type Kind} from './lib';
export type Theme='light'|'slate'|'dark';
const themes:{id:Theme;label:string;icon:typeof Sun}[]=[{id:'light',label:'Claro',icon:Sun},{id:'slate',label:'Gris azulado',icon:CloudMoon},{id:'dark',label:'Oscuro',icon:Moon}];
/** Selector de fondo (claro, gris azulado u oscuro). La elección se recuerda en este navegador. */
export function ThemePicker({compact}:{compact?:boolean}){
 const [theme,setTheme]=useState<Theme>('slate');
 useEffect(()=>{const read=()=>setTheme((document.documentElement.getAttribute('data-theme') as Theme)||'slate');read();window.addEventListener('cc:theme',read);return()=>window.removeEventListener('cc:theme',read);},[]);
 // El cambio de fondo funde los colores en 240 ms (data-theme-transition, definido en la fundación de Sentidiño).
 function pick(t:Theme){const root=document.documentElement;root.setAttribute('data-theme-transition','');root.setAttribute('data-theme',t);setTimeout(()=>root.removeAttribute('data-theme-transition'),300);(window as unknown as {__ccThemeColor?:(t:Theme)=>void}).__ccThemeColor?.(t);try{localStorage.setItem('cc-theme',t);}catch{/* sin almacenamiento */}window.dispatchEvent(new Event('cc:theme'));}
 return <div className={'theme-picker'+(compact?' compact':'')} role="radiogroup" aria-label="Fondo">{themes.map(t=><button key={t.id} role="radio" aria-checked={theme===t.id} className={theme===t.id?'on':''} onClick={()=>pick(t.id)} title={t.label}><t.icon size={15}/>{!compact&&<span>{t.label}</span>}</button>)}</div>;}
export const go=(hash:string)=>{window.location.hash=hash;};
export function Badge({tone='neutral',children}:{tone?:string;children:React.ReactNode}){return <span className={'badge '+tone}>{children}</span>;}
export function StatusBadge({item}:{item:{kind:Kind;status:string;matchStatus:string|null}}){if(item.status==='draft')return <Badge tone="draft">Por revisar</Badge>;if(item.kind==='credit_note')return <Badge>Revisión manual</Badge>;const s=item.matchStatus?statusInfo[item.matchStatus]:null;return s?<Badge tone={s.tone}>{s.label}</Badge>:<Badge>Sin conciliar</Badge>;}
/** Etiqueta del clasificador: verde «Factura verificada», azul «Albarán (correo)», ámbar «Dudoso — revisar». */
export function ClassBadge({item}:{item:{classState:string;status:string;origin:string;classReason:string;duplicateOf:string|null}}){
 if(item.duplicateOf)return <Badge>Duplicado</Badge>;
 if(item.classState==='DESCARTADO')return <Badge>Descartado</Badge>;
 if(item.classState==='DUDOSO')return <span className="badge warning" title={item.classReason}>Dudoso — revisar</span>;
 if(item.origin!=='correo')return null;
 if(item.classState==='ALBARAN')return <Badge tone="info">Albarán (correo)</Badge>;
 // «Verificada» solo cuando ya cuenta: la dio por buena el clasificador o la validó una persona.
 return item.status==='confirmed'?<Badge tone="success">Factura verificada</Badge>:null;}
export function PageHead({eyebrow,title,children}:{eyebrow:string;title:string;children?:React.ReactNode}){return <header className="page-head"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div>{children&&<div className="page-actions">{children}</div>}</header>;}
/** Botón destructivo de «mantener pulsado» (1,2 s). Funciona con ratón, táctil y teclado (mantener Espacio o Intro). */
export function HoldButton({onConfirm,disabled,children,hint}:{onConfirm:()=>void;disabled?:boolean;children:React.ReactNode;hint:string}){
 const [holding,setHolding]=useState(false),[tip,setTip]=useState(false),timer=useRef<number|undefined>(undefined);
 const start=()=>{if(disabled||timer.current)return;setHolding(true);setTip(false);timer.current=window.setTimeout(()=>{timer.current=undefined;setHolding(false);onConfirm();},1200);};
 const stop=()=>{if(timer.current){window.clearTimeout(timer.current);timer.current=undefined;setTip(true);}setHolding(false);};
 useEffect(()=>()=>window.clearTimeout(timer.current),[]);
 return <span className="hold-wrap"><button type="button" className={'btn danger-btn hold'+(holding?' holding':'')} disabled={disabled} title={hint} aria-description={hint}
  onPointerDown={e=>{if(e.button===0)start();}} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop} onContextMenu={e=>e.preventDefault()}
  onKeyDown={e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();start();}}} onKeyUp={e=>{if(e.key===' '||e.key==='Enter')stop();}}>
  <span className="hold-fill" aria-hidden="true"/>{children}</button>{tip&&!holding&&<small className="hold-tip" role="status">{hint}</small>}</span>;}
/** Ventana modal nativa (<dialog>): foco atrapado, Escape y clic fuera cierran. */
export function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const el=ref.current;if(el&&!el.open)el.showModal();return()=>el?.close();},[]);
 return <dialog ref={ref} className="modal" aria-label={title} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
  <div className="modal-head"><h2>{title}</h2><button type="button" className="icon" onClick={onClose} aria-label="Cerrar ventana">×</button></div>
  <div className="modal-body">{children}</div></dialog>;}
export function Empty({title,text}:{title:string;text:string}){return <div className="empty"><strong>{title}</strong><p>{text}</p></div>;}
