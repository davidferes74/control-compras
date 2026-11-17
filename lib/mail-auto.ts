import {randomUUID} from 'node:crypto';
import {getPool,org,readWorkspace,transact} from './server-store';
import {captureGmail} from './mail-gmail';
import {captureMailbox} from './mail-imap';
import {readDocument,ReadError,dailyLimit} from './ai-reader';
import {extractionSchema,outputSchema,extractionSystem,extractionTask,type Extraction} from './extraction';
import {autoInvoice} from './auto-invoice';
import {resolveOdoo,fetchOdooData} from './odoo';
import {DomainError} from './domain';
// Trabajo programado del correo: 1) revisa los buzones activos; 2) si el agente tiene permiso, lee con IA los
// adjuntos nuevos; 3) si además tiene permiso y la lectura no deja dudas, registra la factura.
// Cada fase respeta un presupuesto de tiempo y deja el resto para la siguiente ejecución.
/** Lecturas automáticas al día: se reserva parte del límite para las que pida una persona. */
export const autoReadLimit=Math.max(1,dailyLimit-4);
const deadline=(ms:number)=>{const end=Date.now()+ms;return ()=>Date.now()<end;};
export async function runMailJob(){
 const pool=getPool(),time=deadline(50_000),summary={accounts:0,saved:0,read:0,registered:0,skipped:0,errors:0};
 // 1) Captura: cada buzón activo, el que lleva más tiempo sin revisar primero.
 const accounts=await pool.query('SELECT id,provider FROM ria_mail_accounts WHERE organization_id=$1 AND paused=false AND (lease_until IS NULL OR lease_until<now()) ORDER BY last_sync ASC NULLS FIRST LIMIT 10',[org()]);
 for(const a of accounts.rows){if(!time())break;try{const r=await (a.provider==='gmail'?captureGmail(a.id):captureMailbox(a.id));summary.accounts++;summary.saved+=r.saved;}catch{summary.errors++;}}
 // 2) y 3) Lectura y registro, solo con permiso expreso en «Autoridad del agente».
 let workspace=await readWorkspace();const authority=workspace.agent;
 if(!authority?.readMail)return summary;
 let suppliers:string[]|null=null;
 const pending=await pool.query("SELECT id,filename,mime,original FROM ria_mail_items WHERE organization_id=$1 AND status='received' AND original IS NOT NULL AND read_state IS NULL ORDER BY created_at ASC LIMIT 10",[org()]);
 for(const item of pending.rows){if(!time())break;
  const used=await pool.query('SELECT calls FROM ria_ai_daily WHERE organization_id=$1 AND day=CURRENT_DATE',[org()]);if((used.rows[0]?.calls||0)>=autoReadLimit)break;
  let reading:{id:string;result:Extraction};
  try{reading=await readDocument({bytes:item.original,mime:item.mime,name:item.filename,scope:'extract-v2:invoice',system:extractionSystem,task:extractionTask('invoice'),schema:outputSchema,maxTokens:6000,parse:raw=>extractionSchema.parse(raw)});}
  catch(e){await pool.query("UPDATE ria_mail_items SET read_state='error' WHERE id=$1 AND organization_id=$2",[item.id,org()]);summary.errors++;if(e instanceof ReadError&&e.status===429)break;continue;}
  await pool.query("UPDATE ria_mail_items SET read_state='read',document_id=$3 WHERE id=$1 AND organization_id=$2",[item.id,org(),reading.id]);summary.read++;
  if(!authority.registerInvoices){summary.skipped++;continue;}
  if(suppliers===null)suppliers=await resolveOdoo().then(r=>r?fetchOdooData(r.config,'suppliers').then(d=>(d.items as {name:string}[]).map(x=>x.name)):[]).catch(()=>[] as string[]);
  const auto=autoInvoice(reading.result,workspace,suppliers,reading.id);if(!auto.ok){summary.skipped++;continue;}
  try{for(let attempt=0;;attempt++){try{workspace=await transact({id:randomUUID(),version:workspace.version,command:auto.command});break;}catch(e){if(e instanceof DomainError&&e.code===409&&attempt===0){workspace=await readWorkspace();continue;}throw e;}}
   await pool.query("UPDATE ria_mail_items SET status='registered',detail=$3 WHERE id=$1 AND organization_id=$2",[item.id,org(),'Registrada por el agente; original '+reading.id]);summary.registered++;}
  catch{summary.skipped++;workspace=await readWorkspace();}
 }
 return summary;
}
