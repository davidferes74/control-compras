import {simpleParser} from 'mailparser';
import {detectType,isEInvoice} from "./extraction";
/** Del correo solo se recogen PDF y facturas electrónicas (XML, UBL o EDIFACT). Las imágenes suelen ser logotipos y firmas. */
export const mailAccepted=(mime:string|null)=>mime==='application/pdf'||isEInvoice(mime);
export type MailItem={filename:string;mime:string|null;bytes:Buffer|null;status:string;detail:string};
export const maxMessageBytes=6*1024*1024;
export const excludedItem=(filename:string,detail:string):MailItem=>({filename,mime:null,bytes:null,status:'excluded',detail});
export const failedItem=(detail:string):MailItem=>({filename:'Correo no procesado',mime:null,bytes:null,status:'error',detail:detail+' Revísalo en el buzón y sube sus adjuntos manualmente.'});
export async function attachmentItems(source:Buffer):Promise<MailItem[]>{
 const parsed=await simpleParser(source,{skipHtmlToText:true,skipTextToHtml:true,skipImageLinks:true});const items:MailItem[]=[];
 for(const a of parsed.attachments){let mime:string|null=null,detail='',status='received';try{mime=detectType(a.content);}catch{mime=null;}
  if(!mailAccepted(mime)){status='excluded';detail='Formato no admitido. Solo PDF o factura electrónica (XML, UBL o EDIFACT).';}
  
  if(!a.size||a.size>3*1024*1024){status='excluded';detail='Adjunto vacío o mayor de 3 MB.';}
  items.push({filename:(a.filename||'Adjunto').slice(0,150),mime,bytes:status==='received'?a.content:null,status,detail});}
 if(!items.length)items.push(excludedItem('Sin adjuntos','No se descargan enlaces del cuerpo del correo.'));
 return items;
}
// Un correo concreto que no se puede descargar o interpretar se registra como error y la captura continúa,
// para que no bloquee el cursor del buzón. Los fallos de conexión/autorización (isFatal) sí detienen la captura
// sin avanzar el cursor, y el correo se reintenta en la siguiente pasada.
export async function readMessage(load:()=>Promise<Buffer|null|undefined>,isFatal:(e:unknown)=>boolean):Promise<MailItem[]>{
 let source:Buffer|null|undefined;
 try{source=await load();}catch(e){if(isFatal(e))throw e;return [failedItem('No se pudo descargar este correo.')];}
 if(!source?.length)return [failedItem('Correo sin contenido descargable.')];
 if(source.length>maxMessageBytes)return [excludedItem('Correo demasiado grande','Supera 6 MB. Descarga sus adjuntos desde tu correo y súbelos individualmente.')];
 try{return await attachmentItems(source);}catch{return [failedItem('No se pudo interpretar este correo.')];}
}
