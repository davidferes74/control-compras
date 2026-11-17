'use client';
import {useState} from 'react';
import {Camera,Send,CheckCircle2,AlertTriangle,HelpCircle} from 'lucide-react';
import type {Receipt,Workspace} from '@/lib/types';
import type {LabelReading} from '@/lib/extraction';
import {Modal} from './ui';
export type LabelResult={lot?:string;serial?:string;code?:string;evidenceId:string};
// Foto de etiqueta → «Enviar y verificar». La IA solo transcribe; aquí se compara con el albarán por igualdad
// exacta y el operario confirma o corrige antes de usar la lectura. Nada se suma hasta registrar la lectura.
export default function LabelReader({receipt:r,state,onUse,onClose}:{receipt:Receipt;state:Workspace;onUse:(v:LabelResult)=>void;onClose:()=>void}){
 const modes=[...new Set(r.lines.map(l=>state.products.find(p=>p.id===l.productId)?.tracking).filter(t=>t==='lot'||t==='serial'))] as ('lot'|'serial')[];
 const [mode,setMode]=useState<'lot'|'serial'>(modes[0]||'lot'),[file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[reading,setReading]=useState<{id:string;result:LabelReading;cached:boolean}|null>(null),[lot,setLot]=useState(''),[serial,setSerial]=useState('');
 const declared=r.lines.map(l=>l.lot).filter(Boolean) as string[];
 async function send(){if(!file||busy)return;setBusy(true);setError('');setReading(null);try{const data=new FormData();data.append('file',file);data.append('mode',mode);const res=await fetch('/api/label',{method:'POST',body:data});const body=await res.json();if(!res.ok)throw new Error(body.error);setReading(body);setLot((body.result.lot||'').slice(0,40));setSerial((body.result.serial||'').slice(0,40));}catch(e){setError(e instanceof Error?e.message:'No se pudo leer la etiqueta.');}finally{setBusy(false);}}
 const value=mode==='lot'?lot.trim():serial.trim();
 const check=!reading||mode!=='lot'||!value?null:declared.includes(value)?{kind:'ok',text:'Coincide exactamente con un lote declarado en el albarán.'}:declared.length?{kind:'warn',text:'No coincide con ningún lote declarado en el albarán ('+declared.join(', ')+'). Si es lo que ha llegado, registra una incidencia.'}:{kind:'neutral',text:'El albarán no declara lotes: se registrará lo observado como no verificable.'};
 return <Modal title="Foto de etiqueta" onClose={onClose}><div className="form-stack">
  <p className="helper">Fotografía la etiqueta de lote o serie. La lectura no suma mercancía: después registra el producto como siempre.</p>
  {modes.length>1&&<div className="two-buttons"><button type="button" className={'button '+(mode==='lot'?'primary':'secondary')} onClick={()=>setMode('lot')}>Lote</button><button type="button" className={'button '+(mode==='serial'?'primary':'secondary')} onClick={()=>setMode('serial')}>Número de serie</button></div>}
  <label className="upload"><Camera size={24}/><strong>{file?'Cambiar foto':'Hacer o elegir foto'}</strong><span>JPG, PNG o WebP · máximo 3 MB · se guarda como original privado</span><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy} onChange={e=>{setFile(e.target.files?.[0]||null);setReading(null);setError('');}}/>{file&&<small>{file.name}</small>}</label>
  <button type="button" className="button primary" disabled={!file||busy} onClick={send}><Send size={17}/>{busy?'Leyendo etiqueta…':'Enviar y verificar'}</button>
  {error&&<div className="notice error" role="alert">{error}</div>}
  {reading&&<>
   <div className="label-result"><div className="section-label">Lectura de la etiqueta{reading.cached?' · reutilizada':''}</div>
    {reading.result.doubts.length>0&&<div className="notice warning"><AlertTriangle size={18}/><span><strong>Lectura dudosa: confirma con la etiqueta delante.</strong> {reading.result.doubts.join(' · ')}</span></div>}
    <div className="form-grid"><label>Lote{!reading.result.lot&&<small>No leído con seguridad: escríbelo si procede.</small>}<input value={lot} maxLength={40} autoCapitalize="none" onChange={e=>setLot(e.target.value)}/></label><label>Número de serie{!reading.result.serial&&<small>No leído con seguridad: escríbelo si procede.</small>}<input value={serial} maxLength={40} autoCapitalize="none" onChange={e=>setSerial(e.target.value)}/></label></div>
    <p className="helper">Código de producto leído: <code>{reading.result.code||'no leído'}</code>{reading.result.expiry?<> · Caducidad impresa: <code>{reading.result.expiry}</code></>:null}</p>
    <p className="helper">Texto de la etiqueta: «{reading.result.evidence}» · <a href={'/api/documents/'+reading.id} target="_blank" rel="noreferrer">Ver foto</a></p>
    {check&&<div className={'label-check '+check.kind}>{check.kind==='ok'?<CheckCircle2 size={18}/>:check.kind==='warn'?<AlertTriangle size={18}/>:<HelpCircle size={18}/>}<span>{check.text}</span></div>}
   </div>
   <button type="button" className="button dark" disabled={!value} onClick={()=>onUse({lot:lot.trim()||undefined,serial:serial.trim()||undefined,code:reading.result.code||undefined,evidenceId:reading.id})}>Usar esta lectura</button>
  </>}
 </div></Modal>;
}
