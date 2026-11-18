// Nombres en Drive, portados de Recepciones-IA. Función pura, con pruebas. Formato elegido por el propietario:
// fecha primero, subcarpetas de año y mes.
//   2026-11-17 · Distribuciones Atlántico · Albarán ALB-2026-0148.pdf
//   2026-11-17 · Distribuciones Atlántico · Factura F-2026-0312.pdf
const SEP=' · ';
/** Texto apto para nombre de archivo en Drive, Windows y macOS: sin barras ni caracteres reservados. */
export function safePart(text:string){return text.normalize('NFC').replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g,' ').replace(/\s+/g,' ').replace(/^[ .]+|[ .]+$/g,'').slice(0,80).trim();}
export const fileName=(parts:(string|undefined|null|false)[])=>parts.map(p=>p?safePart(p):'').filter(Boolean).join(SEP).slice(0,200);
export const extensionFor=(mime:string)=>({'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/xml':'xml','application/edifact':'edi'} as Record<string,string>)[mime]||'bin';
const MONTHS=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
/** Carpetas de año y mes para una fecha YYYY-MM-DD: «2026» y «11 noviembre». */
export function monthFolders(date:string|null|undefined){const m=/^(\d{4})-(\d{2})/.exec(date||'');const month=m?Number(m[2]):0;if(!m||month<1||month>12)return {year:'Sin fecha',month:'Sin fecha',key:'sin-fecha'};return {year:m[1],month:m[2]+' '+MONTHS[month-1],key:m[1]+'-'+m[2]};}
const kindName={invoice:'Factura',delivery_note:'Albarán',credit_note:'Abono'} as const;
/** Nombre de un documento confirmado de control-compras (sin extensión). */
export function documentName(d:{kind:keyof typeof kindName;date:string|null;supplier:string;number:string}){return fileName([d.date||'sin fecha',d.supplier||'Proveedor sin nombre',kindName[d.kind]+' '+(d.number||'sin número')]);}
