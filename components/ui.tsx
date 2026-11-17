'use client';
import {useEffect,useRef} from 'react';
import {X,Package,ArrowRight,CheckCircle2,Clock3,AlertCircle} from 'lucide-react';
import type {Receipt} from '@/lib/types';
export function Badge({kind='neutral',children}:{kind?:string;children:React.ReactNode}){return <span className={'badge '+kind}>{kind==='success'?<CheckCircle2 size={13}/>:kind==='warning'?<Clock3 size={13}/>:kind==='danger'?<AlertCircle size={13}/>:null}{children}</span>;}
export function Status({status}:{status:Receipt['status']}){return <Badge kind={status==='confirmed'?'success':status==='exceptions'?'danger':'warning'}>{status==='partial'?'Parcial · resto pendiente':status==='confirmed'?'Confirmada':status==='exceptions'?'Con diferencias':'En recepción'}</Badge>;}
export function Empty({title,description}:{title:string;description:string}){return <div className="empty"><Package size={32}/><h3>{title}</h3><p>{description}</p></div>;}
export function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}){const ref=useRef<HTMLDialogElement>(null);useEffect(()=>{const el=ref.current;el?.showModal();return()=>el?.close();},[]);return <dialog ref={ref} className="modal" onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose();}} aria-label={title}><div className="modal-head"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Cerrar ventana"><X size={21}/></button></div><div className="modal-body">{children}</div></dialog>;}
export function PageTitle({eyebrow,title,description,action}:{eyebrow:string;title:string;description:string;action?:React.ReactNode}){return <div className="page-title"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{action}</div>;}
export function Arrow(){return <ArrowRight size={18}/>;}
export const date=(d:string)=>new Date(d.length===10?d+'T12:00:00Z':d).toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric',timeZone:'Europe/Madrid'});
export const quantity=(v:string|number)=>new Intl.NumberFormat('es-ES',{maximumFractionDigits:3}).format(Number(v));
