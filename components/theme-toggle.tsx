'use client';
import {useEffect,useState} from 'react';
import {Moon,Sun} from 'lucide-react';
// Alterna claro/oscuro. Claro por defecto; la elección se guarda en este navegador («ria-theme»).
export function useTheme(){
 const [theme,setTheme]=useState<'light'|'dark'|null>(null);
 useEffect(()=>{const read=()=>setTheme(document.documentElement.getAttribute('data-theme')==='dark'?'dark':'light');read();window.addEventListener('ria:theme',read);return()=>window.removeEventListener('ria:theme',read);},[]);
 function toggle(){
  const next=theme==='dark'?'light':'dark',root=document.documentElement;
  root.setAttribute('data-theme-transition','');root.setAttribute('data-theme',next);
  try{localStorage.setItem('ria-theme',next);}catch{/* sin almacenamiento */}
  window.dispatchEvent(new Event('ria:theme'));setTimeout(()=>root.removeAttribute('data-theme-transition'),300);
 }
 return [theme,toggle] as const;
}
export function ThemeToggle(){
 const [theme,toggle]=useTheme();
 return <button type="button" className="icon-button" onClick={toggle} aria-label={theme==='dark'?'Cambiar a tema claro':'Cambiar a tema oscuro'} title={theme==='dark'?'Tema claro':'Tema oscuro'}>{theme==='dark'?<Sun size={17}/>:<Moon size={17}/>}</button>;
}
