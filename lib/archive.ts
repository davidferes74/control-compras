import {getPool,org,getSetting,setSetting,audit} from './server-store';
import {accessToken,ensureFolder,uploadFile,createSpreadsheet,sheets,GoogleError} from './google';
import {kindLabel} from './documents';
import {statusLabel,deliveryLabel,type InvoiceMatch,type InvoiceStatus,type DeliveryStatus} from './matching';
// Archivo en Google Drive dentro de la carpeta que elige el usuario:
//   <carpeta>/<Proveedor>/<AAAA-MM>/<fecha> <Tipo> <número>.pdf
//   <carpeta>/Registro control de compras  (hoja: «Documentos» y «Líneas», reflejo de los datos confirmados)
export type DriveSetting={folderId:string;folderName:string;sheetId?:string};
export const driveSetting=()=>getSetting<DriveSetting>('drive');
const ext=(mime:string)=>mime==='application/pdf'?'pdf':mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg';
const safe=(s:string)=>s.replace(/[\/\\:*?"<>|]+/g,'-').replace(/\s+/g,' ').trim().slice(0,80);

/** Sube el original de un documento confirmado. No lanza: guarda el error en el documento para reintentar. */
export async function archiveDocument(id:string):Promise<{ok:boolean;message?:string}>{
 const drive=await driveSetting();if(!drive)return {ok:false,message:'Elige una carpeta de Drive en Ajustes para archivar los documentos.'};
 const r=await getPool().query("SELECT d.kind,d.supplier,d.number,d.doc_date,d.drive_file_id,d.status,f.filename,f.mime,f.bytes FROM cc_documents d LEFT JOIN cc_files f ON f.id=d.file_id WHERE d.id=$1 AND d.organization_id=$2",[id,org()]);
 const d=r.rows[0];if(!d||d.status!=='confirmed'||d.drive_file_id)return {ok:true};if(!d.bytes)return {ok:true,message:'Documento sin archivo original: solo se anota en el registro.'};
 try{const token=await accessToken();const date=d.doc_date?String(d.doc_date).slice(0,10):'sin-fecha';
  const folder=await ensureFolder(drive.folderId,[safe(d.supplier)||'Proveedor sin nombre',date.slice(0,7)],token);
  const fileId=await uploadFile(folder,`${date} ${kindLabel[d.kind as keyof typeof kindLabel]} ${safe(d.number)||'sin número'}.${ext(d.mime)}`,d.mime,d.bytes,token);
  await getPool().query('UPDATE cc_documents SET drive_file_id=$2,drive_error=NULL WHERE id=$1',[id,fileId]);await audit('drive',`Archivado en Drive: ${kindLabel[d.kind as keyof typeof kindLabel].toLowerCase()} ${d.number}.`,id);return {ok:true};}
 catch(e){const message=e instanceof GoogleError?e.message:'No se pudo subir a Drive.';await getPool().query('UPDATE cc_documents SET drive_error=$2 WHERE id=$1',[id,message]);return {ok:false,message};}}

/** Reintenta lo que no se pudo archivar (lo llama la tarea programada y el botón de Ajustes). */
export async function archivePending(limit=10){const r=await getPool().query("SELECT d.id FROM cc_documents d WHERE d.organization_id=$1 AND d.status='confirmed' AND d.drive_file_id IS NULL AND d.file_id IS NOT NULL ORDER BY d.confirmed_at LIMIT $2",[org(),limit]);let ok=0;for(const x of r.rows)if((await archiveDocument(x.id)).ok)ok++;return {pending:r.rowCount||0,ok};}

const n=(v:unknown)=>v===null||v===undefined?'':Number(v);
/** Reescribe la hoja de registro con todos los documentos confirmados. */
export async function refreshSheet():Promise<{ok:boolean;message?:string;sheetId?:string}>{
 const drive=await driveSetting();if(!drive)return {ok:false,message:'Sin carpeta de Drive.'};
 try{const token=await accessToken();let sheetId=drive.sheetId;
  if(!sheetId){sheetId=await createSpreadsheet(drive.folderId,'Registro control de compras',token);await setSetting('drive',{...drive,sheetId});}
  const meta=await sheets(sheetId,'?fields=sheets.properties(sheetId,title)',{},token);const tabs=(meta.sheets||[]).map((s:{properties:{sheetId:number;title:string}})=>s.properties);const requests:object[]=[];
  if(!tabs.some((t:{title:string})=>t.title==='Documentos'))requests.push(tabs.length&&!tabs.some((t:{title:string})=>t.title==='Líneas')?{updateSheetProperties:{properties:{sheetId:tabs[0].sheetId,title:'Documentos'},fields:'title'}}:{addSheet:{properties:{title:'Documentos'}}});
  if(!tabs.some((t:{title:string})=>t.title==='Líneas'))requests.push({addSheet:{properties:{title:'Líneas'}}});
  if(requests.length)await sheets(sheetId,':batchUpdate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requests})},token);
  const docs=(await getPool().query("SELECT id,kind,supplier,supplier_tax_id,number,doc_date,delivery_refs,subtotal,tax,total,match_status,match_result,drive_file_id,confirmed_at FROM cc_documents WHERE organization_id=$1 AND status='confirmed' ORDER BY doc_date,number",[org()])).rows;
  const lines=(await getPool().query("SELECT d.kind,d.supplier,d.number,d.doc_date,l.position,l.code,l.description,l.quantity,l.unit,l.unit_price,l.discount_pct,l.amount,l.delivery_ref FROM cc_lines l JOIN cc_documents d ON d.id=l.document_id WHERE d.organization_id=$1 AND d.status='confirmed' ORDER BY d.doc_date,d.number,l.position",[org()])).rows;
  const status=(d:Record<string,unknown>)=>d.kind==='invoice'&&d.match_status?statusLabel[d.match_status as InvoiceStatus]:d.kind==='delivery_note'&&d.match_status?deliveryLabel[d.match_status as DeliveryStatus]:d.kind==='credit_note'?'Revisión manual':'';
  const open=(d:Record<string,unknown>)=>d.kind==='invoice'&&d.match_result?(d.match_result as InvoiceMatch).discrepancies.filter(x=>!x.accepted&&x.severity!=='info'):[];
  const docRows=[['Tipo','Proveedor','NIF','Número','Fecha','Albaranes citados','Base imponible','IVA','Total','Estado','Diferencias abiertas','Detalle','Original en Drive','Confirmado'],
   ...docs.map(d=>[kindLabel[d.kind as keyof typeof kindLabel],d.supplier,d.supplier_tax_id,d.number,d.doc_date?String(d.doc_date).slice(0,10):'',(d.delivery_refs||[]).join(', '),n(d.subtotal),n(d.tax),n(d.total),status(d),open(d).length,open(d).map(x=>x.message).join(' | ').slice(0,4000),d.drive_file_id?`https://drive.google.com/file/d/${d.drive_file_id}/view`:'',d.confirmed_at?new Date(d.confirmed_at).toISOString().slice(0,16).replace('T',' '):''])];
  const lineRows=[['Tipo','Proveedor','Número','Fecha','Línea','Código','Descripción','Cantidad','Unidad','Precio','Dto. %','Importe','Albarán'],
   ...lines.map(l=>[kindLabel[l.kind as keyof typeof kindLabel],l.supplier,l.number,l.doc_date?String(l.doc_date).slice(0,10):'',l.position,l.code,l.description,n(l.quantity),l.unit,n(l.unit_price),n(l.discount_pct),n(l.amount),l.delivery_ref])];
  for(const [tab,values] of [['Documentos',docRows],['Líneas',lineRows]] as const){const range=encodeURIComponent(`'${tab}'`);
   await sheets(sheetId,`/values/${range}:clear`,{method:'POST'},token);
   await sheets(sheetId,`/values/${range}?valueInputOption=RAW`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({values})},token);}
  return {ok:true,sheetId};}
 catch(e){return {ok:false,message:e instanceof GoogleError?e.message:'No se pudo actualizar la hoja de registro.'};}}
