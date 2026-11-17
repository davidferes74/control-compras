'use client';
import {useMemo,useState} from 'react';
import {Search,Package,Check} from 'lucide-react';
import type {Product} from '@/lib/types';
import {Modal} from './ui';
const trackingLabel={none:'Sin seguimiento',lot:'Por lote',serial:'Por serie'};
const norm=(s:string)=>s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
// Ventana para ver el catálogo y, si se pasa onSelect, elegir un producto. Pensada para catálogos grandes:
// busca por nombre, referencia o código y muestra como mucho 60 resultados a la vez.
export default function ProductBrowser({products,onSelect,onClose,selectedId,title,hint}:{products:Product[];onSelect?:(p:Product)=>void;onClose:()=>void;selectedId?:string;title?:string;hint?:string}){
 const [query,setQuery]=useState('');
 const active=useMemo(()=>products.filter(p=>!p.archived),[products]);
 const results=useMemo(()=>{const words=norm(query).split(/\s+/).filter(Boolean);if(!words.length)return active;return active.filter(p=>{const hay=norm([p.name,p.sku,p.code,p.packCode||''].join(' '));return words.every(w=>hay.includes(w));});},[active,query]);
 const shown=results.slice(0,60);
 return <Modal title={title||(onSelect?'Elegir producto':'Catálogo de productos')} onClose={onClose}><div className="browser">
  {hint&&<p className="helper">{hint}</p>}
  <label className="browser-search"><Search size={18}/><input autoFocus type="search" placeholder="Buscar por nombre, referencia o código…" value={query} onChange={e=>setQuery(e.target.value)} autoComplete="off" spellCheck={false}/></label>
  <p className="browser-count">{results.length===active.length?`${active.length} productos`:`${results.length} de ${active.length} productos`}{results.length>shown.length?` · se muestran ${shown.length}; escribe más para afinar`:''}</p>
  <div className="browser-list" role={onSelect?'listbox':undefined}>{shown.map(p=>{const body=<><span className="browser-icon">{p.id===selectedId?<Check size={17}/>:<Package size={17}/>}</span><span className="browser-main"><strong>{p.name}</strong><small>{p.sku} · <code>{p.code}</code>{p.packCode?<> · caja <code>{p.packCode}</code> × {p.packQuantity}</>:null}</small></span><span className="browser-tags"><span className="chip">{p.unit}</span><span className="chip">{trackingLabel[p.tracking]}</span>{p.source==='odoo'&&<span className="chip odoo">Odoo</span>}</span></>;
   return onSelect?<button type="button" role="option" aria-selected={p.id===selectedId} className={'browser-row'+(p.id===selectedId?' selected':'')} key={p.id} onClick={()=>onSelect(p)}>{body}</button>:<div className="browser-row" key={p.id}>{body}</div>;})}
   {!shown.length&&<p className="browser-empty">{active.length?'Ningún producto coincide con la búsqueda.':'Todavía no hay productos en el catálogo.'}</p>}</div>
 </div></Modal>;
}
