'use client';
import {useEffect,useState} from 'react';
import {Sun,CloudMoon,Moon} from 'lucide-react';
import {statusInfo,type Kind} from './lib';
export type Theme='light'|'slate'|'dark';
const themes:{id:Theme;label:string;icon:typeof Sun}[]=[{id:'light',label:'Claro',icon:Sun},{id:'slate',label:'Gris azulado',icon:CloudMoon},{id:'dark',label:'Oscuro',icon:Moon}];
/** Selector de fondo (claro, gris azulado u oscuro). La elección se recuerda en este navegador. */
export function ThemePicker({compact}:{compact?:boolean}){
 const [theme,setTheme]=useState<Theme>('slate');
 useEffect(()=>{const read=()=>setTheme((document.documentElement.getAttribute('data-theme') as Theme)||'slate');read();window.addEventListener('cc:theme',read);return()=>window.removeEventListener('cc:theme',read);},[]);
 function pick(t:Theme){document.documentElement.setAttribute('data-theme',t);try{localStorage.setItem('cc-theme',t);}catch{/* sin almacenamiento */}window.dispatchEvent(new Event('cc:theme'));}
 return <div className={'theme-picker'+(compact?' compact':'')} role="radiogroup" aria-label="Fondo">{themes.map(t=><button key={t.id} role="radio" aria-checked={theme===t.id} className={theme===t.id?'on':''} onClick={()=>pick(t.id)} title={t.label}><t.icon size={15}/>{!compact&&<span>{t.label}</span>}</button>)}</div>;}
export const go=(hash:string)=>{window.location.hash=hash;};
export function Badge({tone='neutral',children}:{tone?:string;children:React.ReactNode}){return <span className={'badge '+tone}>{children}</span>;}
export function StatusBadge({item}:{item:{kind:Kind;status:string;matchStatus:string|null}}){if(item.status==='draft')return <Badge tone="draft">Por revisar</Badge>;if(item.kind==='credit_note')return <Badge>Revisión manual</Badge>;const s=item.matchStatus?statusInfo[item.matchStatus]:null;return s?<Badge tone={s.tone}>{s.label}</Badge>:<Badge>Sin conciliar</Badge>;}
export function PageHead({eyebrow,title,children}:{eyebrow:string;title:string;children?:React.ReactNode}){return <header className="page-head"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div>{children&&<div className="page-actions">{children}</div>}</header>;}
export function Empty({title,text}:{title:string;text:string}){return <div className="empty"><strong>{title}</strong><p>{text}</p></div>;}
