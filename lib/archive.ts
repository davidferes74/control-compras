import {getPool,org,audit} from './server-store';
import {kindLabel} from './documents';
import {statusLabel,deliveryLabel,type InvoiceMatch,type InvoiceStatus,type DeliveryStatus} from './matching';
import {driveRow,driveConnected,updateDrive,accessToken,createFolder,upload,createSpreadsheet,sheets,DriveError} from './drive';
import {documentName,extensionFor,monthFolders} from './drive-names';
// Archivo en la carpeta de Drive que creó la app (igual que en Recepciones-IA):
//   <carpeta>/2026/11 noviembre/2026-11-17 · Proveedor · Factura F-2026-0312.pdf
//   <carpeta>/Registro control de compras  (hoja «Documentos» y «Líneas» con los datos confirmados)
// Se sube al confirmar (después de responder), en la revisión diaria como reintento y con «Guardar ahora lo pendiente».

const claimable="d.drive_file_id IS NULL AND (d.drive_at IS NULL OR d.drive_error IS NOT NULL OR d.drive_at<now()-interval '5 minutes')";
const message=(err:unknown)=>err instanceof DriveError?(err.kind==='folder'?'La carpeta de Drive ya no existe o está en la papelera. Vuelve a conectar para crear una nueva.':err.message):'No se pudo guardar en Google Drive.';

/**
 * Sube a Drive los originales de documentos confirmados que aún no están archivados (uno concreto o todos).
 * Cada documento se reserva antes de subirlo para que dos ejecuciones simultáneas no lo dupliquen; si falla,
 * queda marcado y se reintenta en la siguiente pasada. Nunca lanza: devuelve lo hecho, lo pendiente y el error.
 */
export async function archivePending(budgetMs=40_000,onlyId?:string){
 const out={uploaded:0,pending:0,error:null as string|null},pool=getPool(),end=Date.now()+budgetMs;
 try{
  const r=await driveRow();if(!driveConnected(r))return out;
  const todo=await pool.query(`SELECT d.id FROM cc_documents d WHERE d.organization_id=$1 AND d.status='confirmed' AND d.file_id IS NOT NULL AND ${claimable}${onlyId?' AND d.id=$2':''} ORDER BY d.confirmed_at`,onlyId?[org(),onlyId]:[org()]);
  out.pending=todo.rowCount||0;if(!out.pending)return out;
  const token=await accessToken(r.secret),folders={...(r.folders||{})};let recreated=false;
  const folderFor=async(date:string|null)=>{const m=monthFolders(date);if(folders[m.key])return folders[m.key];const yearKey='y:'+m.year;if(!folders[yearKey])folders[yearKey]=await createFolder(token,m.year,r.folder_id);
   folders[m.key]=m.year===m.month?folders[yearKey]:await createFolder(token,m.month,folders[yearKey]);await updateDrive({folders});return folders[m.key];};
  for(const {id} of todo.rows){if(Date.now()>end)break;
   const claim=await pool.query(`UPDATE cc_documents d SET drive_at=now() FROM cc_files f WHERE d.id=$1 AND d.organization_id=$2 AND f.id=d.file_id AND ${claimable} RETURNING d.kind,d.doc_date,d.supplier,d.number,f.mime,f.bytes`,[id,org()]);
   if(!claim.rowCount)continue;const d=claim.rows[0],date=d.doc_date?String(d.doc_date).slice(0,10):null,name=documentName({kind:d.kind,date,supplier:d.supplier,number:d.number})+'.'+extensionFor(d.mime);
   try{let parent=await folderFor(date),fileId:string;
    try{fileId=await upload(token,parent,name,d.mime,d.bytes);}
    catch(err){ // La subcarpeta del mes pudo borrarse en Drive: se vuelve a crear una vez.
     if(!(err instanceof DriveError)||err.kind!=='folder'||recreated)throw err;recreated=true;for(const k of Object.keys(folders))delete folders[k];parent=await folderFor(date);fileId=await upload(token,parent,name,d.mime,d.bytes);}
    await pool.query('UPDATE cc_documents SET drive_file_id=$3,drive_name=$4,drive_error=NULL,drive_at=now() WHERE id=$1 AND organization_id=$2',[id,org(),fileId,name]);out.uploaded++;out.pending--;
    await audit('drive',`Guardado en Drive: ${name}`,id);
   }catch(err){await pool.query('UPDATE cc_documents SET drive_error=$3,drive_at=now() WHERE id=$1 AND organization_id=$2',[id,org(),message(err)]);throw err;}
  }
  await updateDrive({folders,last_error:null,last_archive:new Date()});
 }catch(err){
  out.error=message(err);
  await updateDrive({last_error:out.error}).catch(()=>{});
 }
 return out;
}
/** Sube el original de un documento recién confirmado. Nunca lanza. */
export const archiveDocument=(id:string)=>archivePending(25_000,id);

const n=(v:unknown)=>v===null||v===undefined?'':Number(v);
const day=(v:unknown)=>v?String(v).slice(0,10):'';
/** Reescribe la hoja de registro (en la carpeta de la app) con todos los documentos confirmados. Nunca lanza. */
export async function refreshSheet():Promise<{ok:boolean;message?:string}>{
 const r=await driveRow();if(!driveConnected(r))return {ok:false,message:'Sin carpeta de Drive.'};
 try{const token=await accessToken(r.secret);let sheetId=r.sheet_id;
  if(!sheetId){sheetId=await createSpreadsheet(token,r.folder_id,'Registro control de compras');await updateDrive({sheet_id:sheetId});}
  const meta=await sheets(token,sheetId,'?fields=sheets.properties(sheetId,title)');const tabs=((meta.sheets||[]) as {properties:{sheetId:number;title:string}}[]).map(s=>s.properties);const requests:object[]=[];
  if(!tabs.some(t=>t.title==='Documentos'))requests.push(tabs.length&&!tabs.some(t=>t.title==='Líneas')?{updateSheetProperties:{properties:{sheetId:tabs[0].sheetId,title:'Documentos'},fields:'title'}}:{addSheet:{properties:{title:'Documentos'}}});
  if(!tabs.some(t=>t.title==='Líneas'))requests.push({addSheet:{properties:{title:'Líneas'}}});
  if(requests.length)await sheets(token,sheetId,':batchUpdate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requests})});
  const docs=(await getPool().query("SELECT kind,supplier,supplier_tax_id,number,doc_date,delivery_refs,subtotal,tax,total,match_status,match_result,drive_file_id,confirmed_at FROM cc_documents WHERE organization_id=$1 AND status='confirmed' ORDER BY doc_date,number",[org()])).rows;
  const lines=(await getPool().query("SELECT d.kind,d.supplier,d.number,d.doc_date,l.position,l.code,l.description,l.quantity,l.unit,l.unit_price,l.discount_pct,l.amount,l.delivery_ref FROM cc_lines l JOIN cc_documents d ON d.id=l.document_id WHERE d.organization_id=$1 AND d.status='confirmed' ORDER BY d.doc_date,d.number,l.position",[org()])).rows;
  const status=(d:Record<string,unknown>)=>d.kind==='invoice'&&d.match_status?statusLabel[d.match_status as InvoiceStatus]:d.kind==='delivery_note'&&d.match_status?deliveryLabel[d.match_status as DeliveryStatus]:d.kind==='credit_note'?'Revisión manual':'';
  const open=(d:Record<string,unknown>)=>d.kind==='invoice'&&d.match_result?(d.match_result as InvoiceMatch).discrepancies.filter(x=>!x.accepted&&x.severity!=='info'):[];
  const docRows=[['Tipo','Proveedor','NIF','Número','Fecha','Albaranes citados','Base imponible','IVA','Total','Estado','Diferencias abiertas','Detalle','Original en Drive','Confirmado'],
   ...docs.map(d=>[kindLabel[d.kind as keyof typeof kindLabel],d.supplier,d.supplier_tax_id,d.number,day(d.doc_date),(d.delivery_refs||[]).join(', '),n(d.subtotal),n(d.tax),n(d.total),status(d),open(d).length,open(d).map(x=>x.message).join(' | ').slice(0,4000),d.drive_file_id?`https://drive.google.com/file/d/${d.drive_file_id}/view`:'',d.confirmed_at?new Date(d.confirmed_at).toISOString().slice(0,16).replace('T',' '):''])];
  const lineRows=[['Tipo','Proveedor','Número','Fecha','Línea','Código','Descripción','Cantidad','Unidad','Precio','Dto. %','Importe','Albarán'],
   ...lines.map(l=>[kindLabel[l.kind as keyof typeof kindLabel],l.supplier,l.number,day(l.doc_date),l.position,l.code,l.description,n(l.quantity),l.unit,n(l.unit_price),n(l.discount_pct),n(l.amount),l.delivery_ref])];
  for(const [tab,values] of [['Documentos',docRows],['Líneas',lineRows]] as const){const range=encodeURIComponent(`'${tab}'`);
   await sheets(token,sheetId,`/values/${range}:clear`,{method:'POST'});
   await sheets(token,sheetId,`/values/${range}?valueInputOption=RAW`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({values})});}
  return {ok:true};}
 catch(e){const m=message(e);await updateDrive({last_error:m}).catch(()=>{});return {ok:false,message:m};}}
