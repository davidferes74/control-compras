'use client';
// Utilidades del cliente: llamadas a la API, formato español y tipos de las respuestas.
export async function api<T=unknown>(path:string,init:RequestInit={}):Promise<T>{
 const res=await fetch(path,{...init,headers:init.body&&!(init.body instanceof FormData)?{'Content-Type':'application/json',...(init.headers||{})}:init.headers,cache:'no-store'});
 const body=await res.json().catch(()=>({}));if(!res.ok){const e=new Error(body.error||'No se pudo completar la operación.') as Error&{status?:number};e.status=res.status;throw e;}return body as T;}
const nf=(d:number)=>new Intl.NumberFormat('es-ES',{minimumFractionDigits:d,maximumFractionDigits:d});
export const money=(v:string|number|null|undefined)=>v===null||v===undefined||v===''?'—':nf(2).format(Number(v))+' €';
export const qty=(v:string|number|null|undefined)=>v===null||v===undefined||v===''?'—':new Intl.NumberFormat('es-ES',{maximumFractionDigits:3}).format(Number(v));
export const date=(d:string|null|undefined)=>d?new Date(d.length===10?d+'T12:00:00Z':d).toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric',timeZone:'Europe/Madrid'}):'Sin fecha';
export const dateTime=(d:string|null|undefined)=>d?new Date(d).toLocaleString('es-ES',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Madrid'}):'';
/** «1.234,5» o «1234.5» → «1234.5». Vacío → null. Inválido → undefined. */
export function parseDecimal(v:string):string|null|undefined{const s=v.trim().replace(/\s|€|%/g,'');if(!s)return null;const n=s.includes(',')?s.replace(/\./g,'').replace(',','.'):s;return /^-?\d+(\.\d+)?$/.test(n)?n:undefined;}
export const showDecimal=(v:string|null)=>v===null?'':v.replace('.',',');

export type Kind='invoice'|'delivery_note'|'credit_note';
export const kindLabel:Record<Kind,string>={invoice:'Factura',delivery_note:'Albarán',credit_note:'Abono'};
export type InvoiceStatus='ok'|'diff'|'missing'|'review';
export type DeliveryStatus='invoiced'|'partial'|'pending';
export const statusInfo:Record<string,{label:string;tone:string}>={ok:{label:'Conforme',tone:'success'},diff:{label:'Con diferencias',tone:'danger'},missing:{label:'Falta albarán',tone:'warning'},review:{label:'Revisar',tone:'info'},invoiced:{label:'Facturado',tone:'success'},partial:{label:'Facturado en parte',tone:'warning'},pending:{label:'Pendiente de facturar',tone:'neutral'}};
export type ClassState='FACTURA'|'ALBARAN'|'DUDOSO'|'DESCARTADO';
export type ClassInfo={classState:ClassState;classBy:string|null;classReason:string;detectedType:string;missingFields:string[];confidence:number|null;origin:'correo'|'escaneo'|'manual';duplicateOf:string|null;templateUsed:boolean};
/** Fuera de los listados principales: descartados y duplicados enlazados a otro documento. */
export const isArchived=(d:{classState:ClassState;duplicateOf:string|null})=>d.classState==='DESCARTADO'||Boolean(d.duplicateOf);
export type ListItem=ClassInfo&{sender:string|null;receivedAt:string|null;id:string;kind:Kind;status:'draft'|'confirmed';supplier:string;number:string;date:string|null;total:string|null;matchStatus:string|null;deliveryRefs:string[];drive:boolean;driveError:string|null;warnings:number;source:'upload'|'gmail'|'manual';filename:string|null;lines:number;createdAt:string;issues:{kind:string;severity:string;message:string}[];pendingLines:number};
export type DriveStatus={connected:boolean;email:string|null;folderName:string|null;folderUrl:string|null;sheetUrl:string|null;archived:number;failed:number;lastError:string|null;lastArchive:string|null;googleReady:boolean;encryptionReady:boolean};
export type AppState={documents:ListItem[];pending:number;google:{configured:boolean;redirect:string;connected:boolean;paused:boolean;email:string|null;lastSync:string|null;lastError:string|null;missingScopes:string[]};drive:DriveStatus;gmail:{name:string;labels:{id:string;name:string}[];since:string;sender:string;subject:string;own:string;autoRead:boolean}|null;ai:{configured:boolean;model:string;used:number;limit:number}};
export type Line={id?:string;position?:number;code:string;description:string;quantity:string|null;unit:string;unitPrice:string|null;discountPct:string|null;amount:string|null;deliveryRef:string};
export type Discrepancy={key:string;kind:string;severity:'error'|'review'|'info';message:string;invoiceLineId?:string;deliveryNoteId?:string;accepted?:{reason:string;at:string}};
export type Pair={invoiceLineId:string;deliveryNoteId:string;deliveryLineId:string;quantity:string;basis:'code'|'description'|'similar'};
export type InvoiceMatch={status:InvoiceStatus;deliveryNoteIds:string[];proposed:boolean;pairs:Pair[];discrepancies:Discrepancy[];prices:'ok'|'diff'|'unverifiable'};
export type DeliveryState={status:DeliveryStatus;invoiceIds:string[];pending:{lineId:string;description:string;quantity:string}[]};
export type Related={id:string;kind:Kind;number:string;date:string|null;matchStatus:string|null;lines:{id:string;code:string;description:string;quantity:string|null;unit:string;unitPrice:string|null;discountPct:string|null}[]};
export type FullDocument=ClassInfo&{id:string;kind:Kind;status:'draft'|'confirmed';supplier:string;supplierTaxId:string;number:string;date:string|null;deliveryRefs:string[];subtotal:string|null;tax:string|null;total:string|null;lines:(Line&{id:string;position:number})[];warnings:string[];matchStatus:string|null;match:InvoiceMatch|DeliveryState|null;related:Related[];driveFileId:string|null;driveError:string|null;file:{id:string;filename:string;mime:string;source:string;sender:string|null;subject:string|null;receivedAt:string|null;readState:string}|null;confirmedAt:string|null;createdAt:string};
