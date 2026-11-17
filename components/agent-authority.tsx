'use client';
import {Bot,ShieldCheck} from 'lucide-react';
import type {AgentAuthority,Workspace} from '@/lib/types';
import {noAuthority,type Command} from '@/lib/domain';
// Panel de autoridad del agente: qué puede dar por bueno sin esperar a una persona. Todo apagado por defecto.
// El agente solo actúa cuando los datos coinciden exactamente; cualquier diferencia sigue llegando a la bandeja.
type Key=keyof Required<AgentAuthority>;
const rules:{key:Key;title:string;detail:string;sub?:boolean;needs?:Key;group?:string}[]=[
 {key:'validateReceipts',title:'Validar recepciones conformes',detail:'Cuando lo recibido coincide con lo esperado en todas las líneas y no hay incidencias abiertas.'},
 {key:'acceptProposals',title:'Aceptar emparejamientos completos',detail:'Cuando una factura no cita albaranes y las entregas de ese proveedor cubren todas sus unidades.'},
 {key:'validateInvoices',title:'Validar facturas conformes',detail:'Cuando todas las unidades están respaldadas por recepciones y el precio es igual al acordado.'},
 {key:'allowUnverifiedPrice',title:'…también si el precio no se puede comprobar',detail:'Por ejemplo, albaranes sin precio acordado. Un precio distinto nunca se valida solo.',sub:true,needs:'validateInvoices'},
 {key:'readMail',title:'Leer las facturas que llegan por correo',detail:'Lee con IA los adjuntos nuevos en cada revisión programada del buzón. Gasta lecturas del límite diario.',group:'Correo'},
 {key:'registerInvoices',title:'…y registrar las que no dejan dudas',detail:'Solo si es una factura, el proveedor se reconoce, tiene número y fecha, y cada línea trae un código que identifica un único producto.',sub:true,needs:'readMail'},
];
export default function AgentAuthorityPanel({state,run,pending}:{state:Workspace;run:(c:Command)=>Promise<boolean>;pending:boolean}){
 const a={...noAuthority,...state.agent},on=rules.filter(r=>!r.sub&&a[r.key]).length;
 const set=(key:Key,value:boolean)=>{const next={...a,[key]:value};for(const r of rules)if(r.needs&&!next[r.needs])next[r.key]=false;void run({type:'agentAuthority',authority:next});};
 return <section className="panel agent-panel"><div className="panel-heading"><Bot size={20}/><h2>Autoridad del agente</h2><span className={'user-mode '+(on?'private':'demo')}>{on?on+(on===1?' permiso activo':' permisos activos'):'Solo propone'}</span></div>
  <div className="panel-body agent-body"><p className="helper">Decide qué puede dar por bueno el agente sin esperarte. Solo actúa cuando todo coincide exactamente; cualquier diferencia te llega a Validación. Todo lo que hace queda en el histórico y puedes deshacerlo.</p>
   {rules.map(r=>{const disabled=pending||Boolean(r.needs&&!a[r.needs]);return <div key={r.key}>{r.group&&<p className="agent-group">{r.group}</p>}<div className={'toggle-row agent-rule'+(r.sub?' sub':'')+(disabled&&r.sub?' off':'')}><div><strong>{r.title}</strong><p>{r.detail}</p></div><button role="switch" aria-checked={a[r.key]} aria-label={r.title} className={'switch '+(a[r.key]?'on':'')} disabled={disabled} onClick={()=>set(r.key,!a[r.key])}><span/></button></div></div>;})}
   <p className="agent-foot"><ShieldCheck size={16}/>Validar aquí todavía no escribe nada en Odoo.</p></div></section>;
}
