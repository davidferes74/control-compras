'use client';
import {useEffect,useRef,useState} from 'react';
import {X} from 'lucide-react';
// Hoja inferior para el móvil (apple-design): sube desde abajo, se arrastra 1:1 desde el asa, proyecta el
// impulso al soltar para decidir si se cierra, y ofrece resistencia progresiva hacia arriba.
const project=(velocity:number,rate=0.998)=>(velocity/1000)*rate/(1-rate); // px/s → recorrido proyectado (px)
const rubberband=(over:number,dim:number,c=0.55)=>(over*dim*c)/(dim+c*Math.abs(over));
const reduced=()=>typeof window!=='undefined'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function Sheet({onClose,label,children}:{onClose:()=>void;label:string;children:React.ReactNode}){
 const sheet=useRef<HTMLDivElement>(null),drag=useRef<{y0:number;id:number;hist:{y:number;t:number}[]}|null>(null),[closing,setClosing]=useState(false);
 const closingRef=useRef(false);
 function close(){if(closingRef.current)return;closingRef.current=true;setClosing(true);const el=sheet.current;
  if(!el||reduced()){onClose();return;}
  el.style.transition='transform 280ms var(--ease-drawer)';el.style.transform='translateY(100%)';
  const done=()=>onClose();el.addEventListener('transitionend',done,{once:true});setTimeout(done,400);}
 useEffect(()=>{document.documentElement.classList.add('sheet-open');const key=(e:KeyboardEvent)=>{if(e.key==='Escape')close();};window.addEventListener('keydown',key);
  return()=>{document.documentElement.classList.remove('sheet-open');window.removeEventListener('keydown',key);};},[]); // eslint-disable-line react-hooks/exhaustive-deps
 function down(e:React.PointerEvent){if(e.button!==0||drag.current||(e.target as HTMLElement).closest('button'))return;try{(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);}catch{/* el arrastre sigue sin captura */}
  drag.current={y0:e.clientY,id:e.pointerId,hist:[{y:e.clientY,t:e.timeStamp}]};if(sheet.current)sheet.current.style.transition='none';}
 function move(e:React.PointerEvent){const d=drag.current;if(!d||e.pointerId!==d.id||!sheet.current)return;
  const raw=e.clientY-d.y0,h=sheet.current.offsetHeight,y=raw<0?rubberband(raw,h):raw;sheet.current.style.transform=`translateY(${y}px)`;
  d.hist.push({y:e.clientY,t:e.timeStamp});if(d.hist.length>6)d.hist.shift();}
 function up(e:React.PointerEvent){const d=drag.current;if(!d||e.pointerId!==d.id||!sheet.current)return;drag.current=null;
  const first=d.hist[0],last=d.hist[d.hist.length-1],dt=Math.max(1,last.t-first.t),velocity=(last.y-first.y)/dt*1000;
  const offset=Math.max(0,e.clientY-d.y0),h=sheet.current.offsetHeight;
  if(offset+project(velocity)>h*0.35&&velocity>-200){close();return;}
  sheet.current.style.transition='transform 420ms var(--ease-drawer)';sheet.current.style.transform='translateY(0)';}
 return <>
  <div className={'sheet-scrim'+(closing?' closing':'')} onClick={close} aria-hidden="true"/>
  <div ref={sheet} className="sheet" role="dialog" aria-modal="true" aria-label={label}>
   <div className="sheet-grab" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
    <span className="sheet-handle" aria-hidden="true"/>
    <button type="button" className="icon sheet-close" onClick={close} aria-label="Cerrar documento"><X size={20}/></button>
   </div>
   <div className="sheet-body">{children}</div>
  </div></>;
}
