'use client';
import {useEffect,useMemo,useState} from 'react';
import {ArrowLeft,Check,CheckCircle2,AlertTriangle,Info,Loader2,Plus,Sparkles,Trash2,X,Eye,EyeOff,ExternalLink,RotateCcw,HelpCircle} from 'lucide-react';
import {api,money,qty,date,parseDecimal,showDecimal,kindLabel,statusInfo,type FullDocument,type Kind,type InvoiceMatch,type DeliveryState } from './lib';
import {Badge,StatusBadge,HoldButton,go} from './ui';

type FormLine={code:string;description:string;quantity:string;unit:string;unitPrice:string;discountPct:string;amount:string;deliveryRef:string};
type Form={kind:Kind;supplier:string;supplierTaxId:string;number:string;date:string;deliveryRefs:string;subtotal:string;tax:string;total:string;lines:FormLine[]};
const toForm=(d:FullDocument):Form=>({kind:d.kind,supplier:d.supplier,supplierTaxId:d.supplierTaxId,number:d.number,date:d.date||'',deliveryRefs:d.deliveryRefs.join(', '),subtotal:showDecimal(d.subtotal),tax:showDecimal(d.tax),total:showDecimal(d.total),
 lines:d.lines.map(l=>({code:l.code,description:l.description,quantity:showDecimal(l.quantity),unit:l.unit,unitPrice:showDecimal(l.unitPrice),discountPct:showDecimal(l.discountPct),amount:showDecimal(l.amount),deliveryRef:l.deliveryRef}))});
const emptyLine:FormLine={code:'',description:'',quantity:'',unit:'',unitPrice:'',discountPct:'',amount:'',deliveryRef:''};
/** Convierte el formulario en el cuerpo de la API. Devuelve el primer error legible si hay números mal escritos. */
function toInput(f:Form):{input?:object;error?:string}{const bad:string[]=[];const d=(v:string,label:string)=>{const r=parseDecimal(v);if(r===undefined)bad.push(label);return r??null;};
 const lines=f.lines.filter(l=>Object.values(l).some(v=>v.trim())).map((l,i)=>({code:l.code.trim(),description:l.description.trim(),quantity:d(l.quantity,`cantidad (línea ${i+1})`),unit:l.unit.trim(),unitPrice:d(l.unitPrice,`precio (línea ${i+1})`),discountPct:d(l.discountPct,`descuento (línea ${i+1})`),amount:d(l.amount,`importe (línea ${i+1})`),deliveryRef:l.deliveryRef.trim()}));
 const input={kind:f.kind,supplier:f.supplier.trim(),supplierTaxId:f.supplierTaxId.trim(),number:f.number.trim(),date:f.date||null,deliveryRefs:f.kind==='invoice'?f.deliveryRefs.split(/[,;\n]/).map(s=>s.trim()).filter(Boolean):[],subtotal:d(f.subtotal,'base imponible'),tax:d(f.tax,'IVA'),total:d(f.total,'total'),lines};
 return bad.length?{error:'Revisa estos números: '+bad.slice(0,4).join(', ')+'.'}:{input};}

export default function DocumentView({id,onChanged}:{id:string;onChanged:()=>Promise<void>}){
 const [doc,setDoc]=useState<FullDocument|null>(null),[form,setForm]=useState<Form|null>(null),[dirty,setDirty]=useState(false),[busy,setBusy]=useState<string|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[showOriginal,setShowOriginal]=useState(true);
 const apply=(d:FullDocument)=>{setDoc(d);setForm(toForm(d));setDirty(false);};
 useEffect(()=>{api<FullDocument>('/api/documents/'+id).then(apply).catch(e=>setError(e.message));},[id]);
 useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 if(error&&!doc)return <div className="alert danger">{error} <a href="#bandeja">Volver</a></div>;
 if(!doc||!form)return <div className="loading"><Loader2 className="spin" size={22}/>Cargando documento…</div>;
 const set=<K extends keyof Form>(k:K,v:Form[K])=>{setForm({...form,[k]:v});setDirty(true);};
 const setLine=(i:number,k:keyof FormLine,v:string)=>set('lines',form.lines.map((l,j)=>j===i?{...l,[k]:v}:l));
 async function run(label:string,fn:()=>Promise<void>){setBusy(label);setError('');setNotice('');try{await fn();}catch(e){setError((e as Error).message);}finally{setBusy(null);}}
 const save=(confirm:boolean)=>run(confirm?'confirm':'save',async()=>{const {input,error}=toInput(form);if(error)throw new Error(error);
  const r=await api<FullDocument>('/api/documents/'+id,{method:'PUT',body:JSON.stringify({document:input,confirm})});apply(r);await onChanged();
  setNotice(confirm?'Confirmado. Se ha conciliado y se archivará en Drive si hay carpeta elegida.':'Guardado.');});
 const reread=()=>run('read',async()=>{if(dirty&&!window.confirm('Se perderán los cambios sin guardar. ¿Volver a leer con IA?'))return;apply(await api<FullDocument>(`/api/documents/${id}/read`,{method:'POST'}));await onChanged();setNotice('Leído de nuevo con IA. Revisa los datos.');});
 // La confirmación es mantener pulsado el botón (HoldButton), no una ventana del navegador.
 const remove=()=>run('delete',async()=>{await api('/api/documents/'+id,{method:'DELETE'});await onChanged();go(doc.status==='draft'?'bandeja':doc.kind==='delivery_note'?'albaranes':'facturas');});
 const decide=(key:string,reason:string|null)=>run('decide',async()=>{apply(await api<FullDocument>(`/api/documents/${id}/decisions`,{method:'POST',body:JSON.stringify({key,reason})}));await onChanged();});
 const fileUrl=doc.file?'/api/files/'+doc.file.id:null;
 return <div className="docview">
  <div className="doc-top"><button className="btn ghost-btn" onClick={()=>history.length>1?history.back():go('bandeja')}><ArrowLeft size={16}/>Volver</button>
   <div className="doc-title"><p className="eyebrow">{kindLabel[doc.kind].toUpperCase()}{doc.file?.source==='gmail'?' · DESDE GMAIL':''}</p><h1>{doc.number||'Sin número'}</h1><p className="muted">{doc.supplier||'Proveedor sin identificar'} · {date(doc.date)}</p></div>
   <div className="doc-status"><StatusBadge item={doc}/>{doc.driveFileId?<a className="badge neutral" href={`https://drive.google.com/file/d/${doc.driveFileId}/view`} target="_blank" rel="noreferrer">En Drive<ExternalLink size={12}/></a>:doc.status==='confirmed'&&doc.driveError?<span className="badge warning" title={doc.driveError}>Drive pendiente</span>:null}</div></div>
  {doc.file?.subject&&<p className="muted small">Correo: «{doc.file.subject}» · {doc.file.sender}</p>}
  {error&&<div className="alert danger" role="alert">{error}</div>}{notice&&<div className="alert success" role="status">{notice}</div>}
  {doc.warnings.length>0&&doc.status==='draft'&&<div className="alert warning"><strong>Avisos de la lectura</strong><ul>{doc.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></div>}
  {doc.status==='confirmed'&&doc.match&&(doc.kind==='invoice'?<InvoicePanel doc={doc} match={doc.match as InvoiceMatch} decide={decide} busy={busy==='decide'}/>:doc.kind==='delivery_note'?<DeliveryPanel doc={doc} state={doc.match as DeliveryState}/>:null)}
  {doc.status==='confirmed'&&doc.kind==='credit_note'&&<div className="alert info">Los abonos se registran y archivan, pero no se concilian automáticamente: revísalos contra la factura que rectifican.</div>}
  <div className={'doc-grid'+(fileUrl&&showOriginal?'':' single')}>
   {fileUrl&&showOriginal&&<section className="panel original"><div className="panel-head"><h2>Original</h2><a className="link" href={fileUrl} target="_blank" rel="noreferrer">Abrir<ExternalLink size={13}/></a></div>{doc.file!.mime==='application/pdf'?<iframe src={fileUrl} title={'Original: '+doc.file!.filename}/>:<img src={fileUrl} alt={'Original: '+doc.file!.filename}/>}</section>}
   <section className="panel editor"><div className="panel-head"><h2>Datos {doc.status==='draft'?'leídos':''}</h2>{fileUrl&&<button className="link" onClick={()=>setShowOriginal(!showOriginal)}>{showOriginal?<EyeOff size={14}/>:<Eye size={14}/>}{showOriginal?'Ocultar original':'Ver original'}</button>}</div>
    <div className="form-grid">
     <label>Tipo<select value={form.kind} onChange={e=>set('kind',e.target.value as Kind)}>{(Object.keys(kindLabel) as Kind[]).map(k=><option key={k} value={k}>{kindLabel[k]}</option>)}</select></label>
     <label>Número<input value={form.number} autoCapitalize="characters" autoCorrect="off" spellCheck={false} onChange={e=>set('number',e.target.value)} placeholder="F-2026-001"/></label>
     <label>Fecha<input type="date" value={form.date} onChange={e=>set('date',e.target.value)}/></label>
     <label className="span2">Proveedor<input value={form.supplier} onChange={e=>set('supplier',e.target.value)}/></label>
     <label>NIF / CIF<input value={form.supplierTaxId} autoCapitalize="characters" autoCorrect="off" spellCheck={false} onChange={e=>set('supplierTaxId',e.target.value)}/></label>
     {form.kind==='invoice'&&<label className="span3">Albaranes que cita la factura<input value={form.deliveryRefs} autoCapitalize="characters" autoCorrect="off" spellCheck={false} onChange={e=>set('deliveryRefs',e.target.value)} placeholder="ALB-101, ALB-102"/><small>Separados por comas. Si la factura no cita ninguno, se proponen por proveedor y fecha.</small></label>}
    </div>
    <div className="lines" role="table" aria-label="Líneas">
     <div className="line head" role="row"><span>Código</span><span>Descripción</span><span className="num">Cant.</span><span>Ud.</span><span className="num">Precio</span><span className="num">Dto.%</span><span className="num">Importe</span>{form.kind==='invoice'&&<span>Albarán</span>}<span/></div>
     {form.lines.map((l,i)=><div className={'line'+(form.kind==='invoice'?' with-ref':'')} role="row" key={i}>
      <input aria-label={`Código línea ${i+1}`} value={l.code} onChange={e=>setLine(i,'code',e.target.value)}/>
      <input aria-label={`Descripción línea ${i+1}`} value={l.description} onChange={e=>setLine(i,'description',e.target.value)}/>
      <input aria-label={`Cantidad línea ${i+1}`} className="num" inputMode="decimal" value={l.quantity} onChange={e=>setLine(i,'quantity',e.target.value)}/>
      <input aria-label={`Unidad línea ${i+1}`} value={l.unit} onChange={e=>setLine(i,'unit',e.target.value)}/>
      <input aria-label={`Precio línea ${i+1}`} className="num" inputMode="decimal" value={l.unitPrice} onChange={e=>setLine(i,'unitPrice',e.target.value)}/>
      <input aria-label={`Descuento línea ${i+1}`} className="num" inputMode="decimal" value={l.discountPct} onChange={e=>setLine(i,'discountPct',e.target.value)}/>
      <input aria-label={`Importe línea ${i+1}`} className="num" inputMode="decimal" value={l.amount} onChange={e=>setLine(i,'amount',e.target.value)}/>
      {form.kind==='invoice'&&<input aria-label={`Albarán línea ${i+1}`} value={l.deliveryRef} onChange={e=>setLine(i,'deliveryRef',e.target.value)}/>}
      <button className="icon" aria-label={`Quitar línea ${i+1}`} onClick={()=>set('lines',form.lines.filter((_,j)=>j!==i))}><X size={15}/></button></div>)}
     <button className="link add-line" onClick={()=>set('lines',[...form.lines,{...emptyLine}])}><Plus size={14}/>Añadir línea</button>
    </div>
    <div className="totals"><label>Base imponible<input className="num" inputMode="decimal" value={form.subtotal} onChange={e=>set('subtotal',e.target.value)}/></label><label>IVA<input className="num" inputMode="decimal" value={form.tax} onChange={e=>set('tax',e.target.value)}/></label><label>Total<input className="num" inputMode="decimal" value={form.total} onChange={e=>set('total',e.target.value)}/></label></div>
    <div className="actions">
     {doc.status==='draft'?<><button className="btn primary" disabled={!!busy} onClick={()=>save(true)}>{busy==='confirm'?<Loader2 size={16} className="spin"/>:<Check size={16}/>}Confirmar y conciliar</button><button className="btn" disabled={!!busy||!dirty} onClick={()=>save(false)}>Guardar borrador</button>{doc.file&&<button className="btn" disabled={!!busy} onClick={reread}>{busy==='read'?<Loader2 size={16} className="spin"/>:<Sparkles size={16}/>}{busy==='read'?'Leyendo…':'Leer con IA'}</button>}</>
      :<button className="btn primary" disabled={!!busy||!dirty} onClick={()=>save(false)}>{busy==='save'?<Loader2 size={16} className="spin"/>:<Check size={16}/>}Guardar cambios</button>}
     <span className="spacer"/><HoldButton disabled={!!busy} onConfirm={remove} hint={doc.status==='draft'?'Mantén pulsado para descartar el borrador':'Mantén pulsado para eliminar; las conciliaciones se recalcularán'}><Trash2 size={16}/>{busy==='delete'?'Eliminando…':doc.status==='draft'?'Mantén para descartar':'Mantén para eliminar'}</HoldButton></div>
    {dirty&&<p className="muted small">Hay cambios sin guardar.{doc.status==='confirmed'?' Al guardar se recalcula la conciliación.':''}</p>}
   </section>
  </div>
 </div>;}

const severityIcon={error:AlertTriangle,review:HelpCircle,info:Info};
function InvoicePanel({doc,match,decide,busy}:{doc:FullDocument;match:InvoiceMatch;decide:(key:string,reason:string|null)=>void;busy:boolean}){
 const [accepting,setAccepting]=useState<string|null>(null),[reason,setReason]=useState('');
 const notes=new Map(doc.related.map(r=>[r.id,r])),noteLine=useMemo(()=>{const m=new Map<string,{note:string;line:FullDocument['related'][number]['lines'][number]}>();for(const r of doc.related)for(const l of r.lines)m.set(l.id,{note:r.number,line:l});return m;},[doc.related]);
 const s=statusInfo[match.status],open=match.discrepancies.filter(d=>!d.accepted&&d.severity!=='info'),accepted=match.discrepancies.filter(d=>d.accepted),infos=match.discrepancies.filter(d=>!d.accepted&&d.severity==='info');
 const headline={ok:'La factura cuadra con sus albaranes.',diff:'Hay diferencias entre la factura y los albaranes.',missing:'Falta algún albarán para respaldar la factura.',review:'Cuadra, pero hay emparejamientos que conviene revisar.'}[match.status];
 return <section className={'panel match tone-'+match.status}>
  <div className="match-head">{match.status==='ok'?<CheckCircle2 size={26}/>:<AlertTriangle size={26}/>}<div><p className="eyebrow">CONCILIACIÓN</p><h2>{headline}</h2><p className="muted">{match.deliveryNoteIds.length?<>{match.proposed?'Albaranes propuestos':'Albaranes'}: {match.deliveryNoteIds.map((n,i)=><span key={n}>{i>0&&', '}<a href={'#doc/'+n}>{notes.get(n)?.number||'albarán'}</a></span>)}</>:'Sin albaranes asociados.'} · Precios: {match.prices==='ok'?'comprobados':match.prices==='diff'?(match.discrepancies.filter(d=>d.kind==='price').every(d=>d.accepted)?'con diferencias aceptadas':'con diferencias'):'no comprobables (albaranes sin precio)'}</p></div><Badge tone={s.tone}>{s.label}</Badge></div>
  {open.length>0&&<ul className="issues">{open.map(d=>{const Icon=severityIcon[d.severity];return <li key={d.key} className={'sev-'+d.severity}><Icon size={16}/><div><p>{d.message}</p>
   {accepting===d.key?<form className="accept" onSubmit={e=>{e.preventDefault();decide(d.key,reason);setAccepting(null);}}><input autoFocus placeholder="Motivo (p. ej. «subida de tarifa pactada»)" enterKeyHint="done" value={reason} onChange={e=>setReason(e.target.value)} minLength={3} required/><button className="btn small primary" disabled={busy}>Aceptar</button><button type="button" className="btn small" onClick={()=>setAccepting(null)}>Cancelar</button></form>
   :<button className="link" onClick={()=>{setAccepting(d.key);setReason('');}}>Aceptar con motivo</button>}</div></li>;})}</ul>}
  {accepted.length>0&&<details className="accepted"><summary>{accepted.length} diferencia{accepted.length>1?'s':''} aceptada{accepted.length>1?'s':''}</summary><ul>{accepted.map(d=><li key={d.key}><p>{d.message}</p><small>Motivo: {d.accepted!.reason} · {date(d.accepted!.at)}</small><button className="link" disabled={busy} onClick={()=>decide(d.key,null)}><RotateCcw size={13}/>Reabrir</button></li>)}</ul></details>}
  {infos.length>0&&<ul className="infos">{infos.map(d=><li key={d.key}><Info size={14}/>{d.message}</li>)}</ul>}
  {doc.lines.length>0&&<div className="compare" role="table" aria-label="Factura frente a albaranes">
   <div className="cmp head" role="row"><span>Artículo</span><span className="num">Facturado</span><span className="num">En albarán</span><span className="num">Precio fact.</span><span className="num">Precio alb.</span><span/></div>
   {doc.lines.map(l=>{const pairs=match.pairs.filter(p=>p.invoiceLineId===l.id),got=pairs.reduce((a,p)=>a+Number(p.quantity),0),issue=match.discrepancies.some(d=>d.invoiceLineId===l.id&&!d.accepted&&d.severity!=='info'),first=pairs[0]&&noteLine.get(pairs[0].deliveryLineId);
    const charge=l.quantity===null;return <div className={'cmp'+(issue?' bad':charge?' muted':'')} role="row" key={l.id}><span><strong>{l.description||l.code}</strong><small>{l.code}{pairs.length?` · ${[...new Set(pairs.map(p=>notes.get(p.deliveryNoteId)?.number))].join(', ')}`:''}{pairs.some(p=>p.basis==='similar')?' · parecido':''}</small></span>
     <span className="num">{charge?'—':qty(l.quantity)+' '+l.unit}</span><span className="num">{charge?'—':pairs.length?qty(got):'0'}</span><span className="num">{money(l.unitPrice)}</span><span className="num">{first?money(first.line.unitPrice):'—'}</span><span>{charge?<Info size={15} aria-label="No se compara"/>:issue?<AlertTriangle size={15} aria-label="Con diferencia"/>:<Check size={15} aria-label="Cuadra"/>}</span></div>;})}
  </div>}
 </section>;}

function DeliveryPanel({doc,state}:{doc:FullDocument;state:DeliveryState}){const s=statusInfo[state.status];
 return <section className={'panel match tone-'+state.status}><div className="match-head">{state.status==='invoiced'?<CheckCircle2 size={26}/>:<Info size={26}/>}<div><p className="eyebrow">FACTURACIÓN DEL ALBARÁN</p><h2>{state.status==='invoiced'?'Facturado por completo.':state.status==='partial'?'Facturado en parte.':'Todavía no aparece en ninguna factura.'}</h2>
  <p className="muted">{doc.related.length?<>Facturas: {doc.related.map((r,i)=><span key={r.id}>{i>0&&', '}<a href={'#doc/'+r.id}>{r.number}</a></span>)}</>:'Sin facturas que lo incluyan.'}</p></div><Badge tone={s.tone}>{s.label}</Badge></div>
  {state.pending.length>0&&<ul className="infos">{state.pending.map(p=><li key={p.lineId}><Info size={14}/>Sin facturar: «{p.description}», {qty(p.quantity)}</li>)}</ul>}</section>;}

